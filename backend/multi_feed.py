"""
HYBRID SENTRY — Multi-Feed Manager
3-Thread Architecture: Display / Motion / YOLO
Round-robin YOLO across cameras with smart ROI strategy
"""

import cv2
import time
import threading
import queue
from collections import deque, defaultdict
from typing import Dict, List, Optional, Tuple, Callable, Any
from datetime import datetime
import numpy as np

from image_processing import ImagePipeline, background_subtraction, create_mog2
from detection import get_engine

# ─────────────────────────────────────────
# CIRCULAR FRAME BUFFER (5 seconds = 150 frames @ 30fps)
# ─────────────────────────────────────────
class CircularFrameBuffer:
    """Thread-safe circular buffer for pre-trigger recording."""

    def __init__(self, maxlen: int = 150):
        self._buf: deque = deque(maxlen=maxlen)
        self._lock = threading.Lock()

    def push(self, frame: np.ndarray):
        with self._lock:
            self._buf.append((frame.copy(), time.time()))

    def snapshot(self) -> List[Tuple[np.ndarray, float]]:
        """Return copy of all buffered (frame, timestamp) pairs."""
        with self._lock:
            return list(self._buf)

    def clear(self):
        with self._lock:
            self._buf.clear()


# ─────────────────────────────────────────
# PER-CAMERA STATE
# ─────────────────────────────────────────
class CameraState:
    """All state for a single camera feed."""

    def __init__(self, camera_id: str, source: Any):
        self.camera_id = camera_id
        self.source = source        # can be int (USB), str (RTSP/url), or callable
        self.cap: Optional[cv2.VideoCapture] = None

        # Frame queues
        self.display_queue: queue.Queue = queue.Queue(maxsize=2)
        self.motion_queue: queue.Queue = queue.Queue(maxsize=2)
        self.yolo_result_queue: queue.Queue = queue.Queue(maxsize=10)

        # State
        self.is_online = False
        self.last_frame_time: float = 0.0
        self.fps: float = 0.0
        self._fps_times: deque = deque(maxlen=30)

        # Current detection overlay (drawn on display thread)
        self.latest_detections: List[dict] = []
        self.motion_rects: List[Tuple[int, int, int, int]] = []
        self.motion_count: int = 0

        # MJPEG encoded frame for streaming
        self.latest_jpeg: Optional[bytes] = None
        self._jpeg_lock = threading.Lock()

        # Circular buffer for recording
        self.frame_buffer = CircularFrameBuffer(maxlen=150)

        # Image pipeline
        self.pipeline = ImagePipeline()
        self.mog2 = create_mog2()

        # Processing mode (shown on UI)
        self.processing_mode: str = "PERIODIC"   # FULL SCAN | ROI ACTIVE | PERIODIC
        self.mode: str = "auto"

        # Recording state
        self.is_recording = False
        self._rec_writer: Optional[cv2.VideoWriter] = None
        self._rec_path: Optional[str] = None

        # Offline detection
        self._heartbeat_miss = 0
        self._last_heartbeat = time.time()

        # Thread handles
        self._cap_thread: Optional[threading.Thread] = None
        self._motion_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()


# ─────────────────────────────────────────
# MULTI-FEED MANAGER
# ─────────────────────────────────────────
class MultiFeedManager:
    """
    Manages all camera feeds using 3-thread architecture:
      Thread 1 (Display):  captures frames at 30fps, MJPEG encodes for streaming
      Thread 2 (Motion):   MOG2 background subtraction per camera
      Thread 3 (YOLO):     round-robin inference across cameras
    """

    OFFLINE_TIMEOUT = 10.0   # seconds before camera declared offline
    HEARTBEAT_INTERVAL = 3.0  # seconds between heartbeat checks
    YOLO_PERIODIC_INTERVAL = 10.0  # seconds between periodic full scans (no motion)

    def __init__(self, detection_callback: Optional[Callable] = None):
        """
        detection_callback(camera_id, detections, annotated_frame):
            Called when YOLO produces results. Use to save to DB.
        """
        self._cameras: Dict[str, CameraState] = {}
        self._cam_order: List[str] = []   # for round-robin
        self._cam_index = 0
        self._lock = threading.Lock()
        self.detection_callback = detection_callback

        # Global YOLO thread (processes cameras round-robin)
        self._yolo_thread: Optional[threading.Thread] = None
        self._yolo_stop = threading.Event()
        self._yolo_queue: queue.Queue = queue.Queue(maxsize=5)

        # Heartbeat thread
        self._hb_thread: Optional[threading.Thread] = None
        self._hb_stop = threading.Event()

    # ─── Camera Registration ─────────────────────────────────
    def add_camera(self, camera_id: str, source: Any) -> CameraState:
        """Register a new camera source."""
        state = CameraState(camera_id, source)
        with self._lock:
            self._cameras[camera_id] = state
            if camera_id not in self._cam_order:
                self._cam_order.append(camera_id)
        self._start_camera_threads(state)
        return state

    def remove_camera(self, camera_id: str):
        """Gracefully stop and remove a camera."""
        with self._lock:
            state = self._cameras.pop(camera_id, None)
            if camera_id in self._cam_order:
                self._cam_order.remove(camera_id)
        if state:
            state._stop_event.set()
            if state.cap:
                state.cap.release()

    def get_state(self, camera_id: str) -> Optional[CameraState]:
        return self._cameras.get(camera_id)

    def list_cameras(self) -> List[str]:
        return list(self._cameras.keys())

    # ─── Start/Stop Manager ──────────────────────────────────
    def start(self):
        """Start global YOLO and heartbeat threads."""
        self._yolo_stop.clear()
        self._yolo_thread = threading.Thread(target=self._yolo_worker, daemon=True, name="YOLO-Worker")
        self._yolo_thread.start()

        self._hb_stop.clear()
        self._hb_thread = threading.Thread(target=self._heartbeat_worker, daemon=True, name="Heartbeat")
        self._hb_thread.start()

        print("[MultiFeed] Manager started.")

    def stop(self):
        """Stop all threads."""
        self._yolo_stop.set()
        self._hb_stop.set()
        with self._lock:
            for state in self._cameras.values():
                state._stop_event.set()
                if state.cap:
                    state.cap.release()
        print("[MultiFeed] Manager stopped.")

    # ─── Thread 1: Display (per camera) ─────────────────────
    def _start_camera_threads(self, state: CameraState):
        state._stop_event.clear()
        state._cap_thread = threading.Thread(
            target=self._display_worker,
            args=(state,),
            daemon=True,
            name=f"Display-{state.camera_id}",
        )
        state._cap_thread.start()

        state._motion_thread = threading.Thread(
            target=self._motion_worker,
            args=(state,),
            daemon=True,
            name=f"Motion-{state.camera_id}",
        )
        state._motion_thread.start()

    def _display_worker(self, state: CameraState):
        """
        Thread 1: Captures frames, applies pipeline, encodes MJPEG.
        Always runs at target 30 FPS — zero lag display.
        """
        source = state.source
        if isinstance(source, int) or isinstance(source, str):
            cap = cv2.VideoCapture(source)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 360)
            cap.set(cv2.CAP_PROP_FPS, 10)
            width = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
            height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
            print(f"[CAM] {state.camera_id} resolution: {int(width)}x{int(height)}")
            state.cap = cap
        else:
            cap = None

        target_fps = 10
        frame_interval = 1.0 / target_fps
        last_log_time = time.time()
        frame_counter = 0
        consecutive_failures = 0
        MAX_FAILURES = 30  # ~3 seconds at 10 FPS before attempting reopen

        while not state._stop_event.is_set():
            t_start = time.time()
            frame = None

            if cap and cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    frame = None
                    consecutive_failures += 1
                else:
                    consecutive_failures = 0
            else:
                consecutive_failures += 1

            # Attempt camera reconnect after too many failures
            if consecutive_failures >= MAX_FAILURES:
                print(f"[CAM] {state.camera_id} — too many failures, reopening camera...")
                if cap:
                    cap.release()
                cap = cv2.VideoCapture(source)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 360)
                cap.set(cv2.CAP_PROP_FPS, 10)
                state.cap = cap
                consecutive_failures = 0
                time.sleep(1.0)
                continue

            # Every 5s print alive log
            if time.time() - last_log_time > 5:
                print(f"[CAM] Capturing frames... {state.camera_id}")
                last_log_time = time.time()

            if frame is None:
                # Camera offline — push offline frame
                state.is_online = False
                state._heartbeat_miss += 1
                offline_frame = self._make_offline_frame(state)
                self._encode_and_store(state, offline_frame)
                time.sleep(0.2)
                # Attempt soft reopen (not same as full reconnect above)
                if cap and not cap.isOpened():
                    cap.open(source)
                continue

            state.is_online = True
            state._last_heartbeat = time.time()
            state._heartbeat_miss = 0

            # Push to circular buffer (raw frame, pre-processing)
            state.frame_buffer.push(frame)

            # Apply image pipeline (toggles controlled by UI)
            try:
                processed, motion_rects = state.pipeline.process(frame)
            except Exception as e:
                processed = frame.copy()
                motion_rects = []

            state.motion_rects = motion_rects
            state.motion_count = len(motion_rects)

            # Overlay latest YOLO detections bboxes from detection thread
            if state.latest_detections:
                for det in state.latest_detections:
                    bbox = det.get("bbox", [])
                    if len(bbox) == 4:
                        x, y, w, h = bbox
                        cv2.rectangle(processed, (x, y), (x + w, y + h), (57, 255, 20), 2)

            # Processing mode indicator (top-left)
            mode_text = state.processing_mode
            cv2.putText(processed, mode_text, (8, 20),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 4, cv2.LINE_AA)
            cv2.putText(processed, mode_text, (8, 20),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (57, 255, 20), 1, cv2.LINE_AA)

            # Push raw frame for motion thread (only every 2nd frame to reduce YOLO load)
            frame_counter += 1
            if frame_counter % 2 == 0:
                try:
                    state.motion_queue.put_nowait((frame.copy(), motion_rects))
                except queue.Full:
                    pass

            # MJPEG encode (quality=70)
            self._encode_and_store(state, processed)

            # FPS tracking
            now = time.time()
            state._fps_times.append(now)
            if len(state._fps_times) >= 2:
                elapsed = state._fps_times[-1] - state._fps_times[0]
                if elapsed > 0:
                    state.fps = round((len(state._fps_times) - 1) / elapsed, 1)

            # Pace to target FPS
            elapsed = time.time() - t_start
            sleep_t = frame_interval - elapsed
            if sleep_t > 0:
                time.sleep(sleep_t)

        if cap:
            cap.release()

    # ─── Thread 2: Motion (per camera) ──────────────────────
    def _motion_worker(self, state: CameraState):
        """
        Thread 2: MOG2 background subtraction + queues frames for YOLO.
        Decides YOLO strategy based on motion count.
        """
        last_yolo_time: float = 0.0

        while not state._stop_event.is_set():
            try:
                item = state.motion_queue.get(timeout=1.0)
            except queue.Empty:
                continue

            frame, motion_rects = item
            motion_count = len(motion_rects)

            now = time.time()

            # YOLO strategy decision
            if state.mode == 'full_scan':
                self._enqueue_for_yolo(state, frame, motion_rects, 'full')
                state.processing_mode = "FULL SCAN"
            elif state.mode == 'roi_only' and motion_rects:
                self._enqueue_for_yolo(state, frame, motion_rects, 'roi')
                state.processing_mode = "ROI ACTIVE"
            elif state.mode == 'full_periodic':
                state.processing_mode = "PERIODIC"
                if now - last_yolo_time >= self.YOLO_PERIODIC_INTERVAL:
                    self._enqueue_for_yolo(state, frame, motion_rects, 'full')
                    last_yolo_time = now
            else:  # auto mode
                if motion_count == 0:
                    state.processing_mode = "PERIODIC"
                    if now - last_yolo_time >= self.YOLO_PERIODIC_INTERVAL:
                        self._enqueue_for_yolo(state, frame, motion_rects, 'full')
                        last_yolo_time = now
                elif motion_count == 1:
                    state.processing_mode = "ROI ACTIVE"
                    self._enqueue_for_yolo(state, frame, motion_rects, 'roi')
                    last_yolo_time = now
                else:
                    state.processing_mode = "FULL SCAN"
                    self._enqueue_for_yolo(state, frame, motion_rects, 'full')
                    last_yolo_time = now

    def _enqueue_for_yolo(
        self,
        state: CameraState,
        frame: np.ndarray,
        motion_rects: List[Tuple],
        mode: str,
    ):
        """Put a frame into the global YOLO queue."""
        try:
            self._yolo_queue.put_nowait({
                "camera_id": state.camera_id,
                "frame": frame,
                "motion_rects": motion_rects,
                "mode": mode,
                "timestamp": time.time(),
            })
        except queue.Full:
            pass  # Discard if YOLO is busy — never block display thread

    # ─── Thread 3: YOLO (global round-robin) ────────────────
    def _yolo_worker(self):
        """
        Thread 3: Global YOLO inference, processes cameras round-robin.
        Pulls from _yolo_queue (which is fed by all motion threads).
        """
        while not self._yolo_stop.is_set():
            try:
                task = self._yolo_queue.get(timeout=1.0)
            except queue.Empty:
                continue

            camera_id = task["camera_id"]
            frame = task["frame"]
            motion_rects = task["motion_rects"]
            mode = task["mode"]

            state = self._cameras.get(camera_id)
            if not state:
                continue

            if frame.shape[0] > 480 or frame.shape[1] > 640:
                frame = cv2.resize(frame, (640, 480))

            engine = get_engine(camera_id)
            zones = []  # TODO: inject from DB at startup, refresh periodically

            try:
                t0 = time.time()
                annotated, detections = engine.detect(
                    frame,
                    roi_rects=motion_rects if mode == "roi" else None,
                    mode=mode,
                    zones=zones,
                )
                inference_ms = int((time.time() - t0) * 1000)

                # Update state
                state.latest_detections = detections

                # Fire callback for DB saving
                if self.detection_callback and detections:
                    for det in detections:
                        if det.get("is_new_log_entry"):
                            try:
                                self.detection_callback(camera_id, det, annotated)
                            except Exception as e:
                                print(f"[MultiFeed] Callback error: {e}")

            except Exception as e:
                print(f"[MultiFeed] YOLO error for {camera_id}: {e}")

    # ─── Heartbeat Worker ────────────────────────────────────
    def _heartbeat_worker(self):
        """Periodically check all cameras for offline status."""
        while not self._hb_stop.is_set():
            time.sleep(self.HEARTBEAT_INTERVAL)
            now = time.time()
            with self._lock:
                for cam_id, state in self._cameras.items():
                    if now - state._last_heartbeat > self.OFFLINE_TIMEOUT:
                        state.is_online = False

    # ─── MJPEG Encoding ─────────────────────────────────────
    def _encode_and_store(self, state: CameraState, frame: np.ndarray):
        """Encode frame to JPEG bytes and store in state."""
        ret, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        if ret:
            with state._jpeg_lock:
                state.latest_jpeg = jpeg.tobytes()

    # ─── MJPEG Stream Generator ──────────────────────────────
    def mjpeg_generator(self, camera_id: str):
        """
        Yields MJPEG frames for a camera.
        FastAPI StreamingResponse compatible generator.
        If no new frame arrives within 5 s, yields an offline placeholder
        so the HTTP response never hangs.
        """
        state = self._cameras.get(camera_id)
        if not state:
            return

        TIMEOUT = 5.0   # seconds before yielding a placeholder

        last_yield = time.time()
        last_jpeg_sent = None   # track to avoid flooding identical frames

        while True:
            with state._jpeg_lock:
                jpeg = state.latest_jpeg

            now = time.time()

            if jpeg and jpeg is not last_jpeg_sent:
                last_jpeg_sent = jpeg
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n"
                    + jpeg
                    + b"\r\n"
                )
                elapsed = now - last_yield
                if elapsed < 1/15:
                    time.sleep(1/15 - elapsed)
                last_yield = time.time()
            elif now - last_yield > TIMEOUT:
                # Generate a placeholder to avoid the client hanging
                placeholder = self._make_offline_frame(state)
                ret, buf = cv2.imencode(".jpg", placeholder, [cv2.IMWRITE_JPEG_QUALITY, 50])
                if ret:
                    yield (
                        b"--frame\r\n"
                        b"Content-Type: image/jpeg\r\n\r\n"
                        + buf.tobytes()
                        + b"\r\n"
                    )
                last_yield = time.time()
            else:
                time.sleep(0.04)   # ~25 Hz poll


    # ─── Offline Frame Generator ─────────────────────────────
    def _make_offline_frame(self, state: CameraState) -> np.ndarray:
        """Generate a placeholder frame when camera is offline."""
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        ts = datetime.now().strftime("%H:%M:%S")
        last_seen = time.strftime("%H:%M:%S", time.localtime(state._last_heartbeat))

        texts = [
            ("⚠ CAMERA OFFLINE", (640//2 - 120, 180), 0.9, 2),
            (f"ID: {state.camera_id}", (640//2 - 80, 230), 0.6, 1),
            (f"Last seen: {last_seen}", (640//2 - 100, 280), 0.55, 1),
            ("RECONNECTING...", (640//2 - 90, 340), 0.6, 1),
        ]
        for text, pos, scale, thick in texts:
            cv2.putText(frame, text, pos, cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 80, 0), thick + 2, cv2.LINE_AA)
            cv2.putText(frame, text, pos, cv2.FONT_HERSHEY_SIMPLEX, scale, (57, 255, 20), thick, cv2.LINE_AA)

        return frame

    # ─── Recording Controls ──────────────────────────────────
    def start_recording(self, camera_id: str, output_path: str) -> bool:
        """Start full recording for a camera."""
        state = self._cameras.get(camera_id)
        if not state or state.is_recording:
            return False
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(output_path, fourcc, 25.0, (640, 480))
        state._rec_writer = writer
        state._rec_path = output_path
        state.is_recording = True
        return True

    def stop_recording(self, camera_id: str) -> Optional[str]:
        """Stop recording and return file path."""
        state = self._cameras.get(camera_id)
        if not state or not state.is_recording:
            return None
        if state._rec_writer:
            state._rec_writer.release()
            state._rec_writer = None
        path = state._rec_path
        state._rec_path = None
        state.is_recording = False
        return path

    def get_status(self) -> dict:
        """Return status dict for all cameras."""
        result = {}
        with self._lock:
            for cam_id, state in self._cameras.items():
                result[cam_id] = {
                    "camera_id": cam_id,
                    "is_online": state.is_online,
                    "fps": state.fps,
                    "processing_mode": state.processing_mode,
                    "motion_count": state.motion_count,
                    "is_recording": state.is_recording,
                    "detection_count": len(state.latest_detections),
                    "last_seen": state._last_heartbeat,
                }
        return result


# Global manager instance
feed_manager = MultiFeedManager()
