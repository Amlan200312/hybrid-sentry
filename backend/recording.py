"""
HYBRID SENTRY — Recording System
3 Modes: Full (manual), Clip (auto on detection), Screenshot (auto on detection)
Circular buffer: 150 frames = 5 seconds at 30fps
"""

import cv2
import os
import time
import threading
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Tuple
import numpy as np
from image_processing import watermark

# ─────────────────────────────────────────
# DIRECTORIES
# ─────────────────────────────────────────
RECORDINGS_BASE = Path("recordings")
FULL_DIR        = RECORDINGS_BASE / "full"
CLIPS_DIR       = RECORDINGS_BASE / "clips"
SCREENSHOTS_DIR = RECORDINGS_BASE / "screenshots"
COMMS_DIR       = RECORDINGS_BASE / "comms"

for d in [FULL_DIR, CLIPS_DIR, SCREENSHOTS_DIR, COMMS_DIR]:
    d.mkdir(parents=True, exist_ok=True)


def _ts() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


# ─────────────────────────────────────────
# SCREENSHOT (Mode 3)
# ─────────────────────────────────────────
def save_screenshot(
    frame: np.ndarray,
    camera_id: str,
    detected_class: str = "",
    annotate_text: str = "",
) -> str:
    """
    Save annotated frame with watermark.
    Returns file path.
    """
    # Watermark
    stamped = watermark(frame, annotate_text or detected_class)

    filename = f"{detected_class or 'snapshot'}_{camera_id}_{_ts()}.jpg"
    filepath = SCREENSHOTS_DIR / filename

    cv2.imwrite(str(filepath), stamped, [cv2.IMWRITE_JPEG_QUALITY, 95])
    return str(filepath)


# ─────────────────────────────────────────
# CLIP (Mode 2) — Pre/Post trigger
# ─────────────────────────────────────────
class ClipRecorder:
    """
    Saves a clip: 5 seconds BEFORE (from circular buffer) + 5 seconds AFTER detection.
    """

    def __init__(self, camera_id: str, detected_class: str, pre_frames: list, fps: float = 25.0):
        self.camera_id = camera_id
        self.detected_class = detected_class
        self.fps = fps
        self._post_frames: List[np.ndarray] = []
        self._post_count = 0
        self._post_target = int(fps * 5)  # 5 seconds post-event
        self._active = True
        self._lock = threading.Lock()
        self._filepath: Optional[str] = None
        self._writer: Optional[cv2.VideoWriter] = None

        # Calculate filename
        filename = f"{detected_class}_{camera_id}_{_ts()}.mp4"
        self._filepath = str(CLIPS_DIR / filename)

        # Start writer with first frame dimensions
        if pre_frames:
            h, w = pre_frames[0].shape[:2]
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            self._writer = cv2.VideoWriter(self._filepath, fourcc, fps, (w, h))
            # Write pre-event frames
            for f in pre_frames:
                stamped = watermark(f, detected_class)
                self._writer.write(stamped)

    def add_post_frame(self, frame: np.ndarray) -> bool:
        """Add a post-event frame. Returns False when clip is complete."""
        if not self._active:
            return False
        with self._lock:
            if self._writer:
                stamped = watermark(frame, self.detected_class)
                self._writer.write(stamped)
            self._post_count += 1
            if self._post_count >= self._post_target:
                self._finalize()
                return False
        return True

    def _finalize(self):
        self._active = False
        if self._writer:
            self._writer.release()
            self._writer = None
        print(f"[REC] Clip saved: {self._filepath}")

    @property
    def filepath(self) -> Optional[str]:
        return self._filepath

    @property
    def is_active(self) -> bool:
        return self._active


# ─────────────────────────────────────────
# FULL RECORDER (Mode 1)
# ─────────────────────────────────────────
class FullRecorder:
    """
    Manual start/stop full recording per camera feed.
    """

    def __init__(self, camera_id: str, fps: float = 25.0, resolution: Tuple[int, int] = (640, 480)):
        self.camera_id = camera_id
        self._fps = fps
        self._resolution = resolution

        filename = f"{camera_id}_{_ts()}.mp4"
        self._filepath = str(FULL_DIR / filename)
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        self._writer = cv2.VideoWriter(self._filepath, fourcc, fps, resolution)
        self._is_recording = True
        self._frame_count = 0
        print(f"[REC] Full recording started: {self._filepath}")

    def write(self, frame: np.ndarray):
        if self._is_recording and self._writer:
            # Resize to match resolution if needed
            if (frame.shape[1], frame.shape[0]) != self._resolution:
                frame = cv2.resize(frame, self._resolution)
            stamped = watermark(frame)
            self._writer.write(stamped)
            self._frame_count += 1

    def stop(self) -> str:
        self._is_recording = False
        if self._writer:
            self._writer.release()
            self._writer = None
        print(f"[REC] Full recording stopped: {self._filepath} ({self._frame_count} frames)")
        return self._filepath

    @property
    def is_recording(self) -> bool:
        return self._is_recording

    @property
    def filepath(self) -> str:
        return self._filepath


# ─────────────────────────────────────────
# RECORDING MANAGER
# ─────────────────────────────────────────
class RecordingManager:
    """
    Coordinates all 3 recording modes per camera.
    Maintains active full recorders and clip recorders per camera.
    """

    def __init__(self):
        self._full_recorders: dict = {}   # camera_id → FullRecorder
        self._clip_recorders: dict = {}   # camera_id → list[ClipRecorder]
        self._lock = threading.Lock()

    # ── Mode 1: Full Recording ─────────────────────────────────
    def start_full(self, camera_id: str, fps: float = 25.0) -> str:
        """Start full recording for camera. Returns file path."""
        with self._lock:
            if camera_id in self._full_recorders:
                return self._full_recorders[camera_id].filepath
            rec = FullRecorder(camera_id, fps=fps)
            self._full_recorders[camera_id] = rec
            return rec.filepath

    def stop_full(self, camera_id: str) -> Optional[str]:
        """Stop full recording. Returns saved file path."""
        with self._lock:
            rec = self._full_recorders.pop(camera_id, None)
        if rec:
            return rec.stop()
        return None

    def is_full_recording(self, camera_id: str) -> bool:
        return camera_id in self._full_recorders

    # ── Mode 2: Clip Recording ─────────────────────────────────
    def trigger_clip(
        self,
        camera_id: str,
        detected_class: str,
        pre_frames: list,
        fps: float = 25.0,
    ) -> ClipRecorder:
        """Trigger a new clip recording on detection event."""
        clip = ClipRecorder(camera_id, detected_class, pre_frames, fps=fps)
        with self._lock:
            if camera_id not in self._clip_recorders:
                self._clip_recorders[camera_id] = []
            self._clip_recorders[camera_id].append(clip)
        return clip

    def feed_clip_frame(self, camera_id: str, frame: np.ndarray):
        """Feed a new frame to all active clip recorders for camera."""
        with self._lock:
            clips = self._clip_recorders.get(camera_id, [])
            still_active = []
            for clip in clips:
                if clip.is_active:
                    clip.add_post_frame(frame)
                    if clip.is_active:
                        still_active.append(clip)
                    # else: clip just completed, leave out
            self._clip_recorders[camera_id] = still_active

    # ── Mode 3: Screenshot ─────────────────────────────────────
    def take_screenshot(
        self,
        frame: np.ndarray,
        camera_id: str,
        detected_class: str = "",
    ) -> str:
        """Capture and save annotated screenshot. Returns file path."""
        return save_screenshot(frame, camera_id, detected_class)

    # ── Feed raw frames (call from display thread) ─────────────
    def feed_frame(self, camera_id: str, raw_frame: np.ndarray):
        """Called every frame — feeds full recorder and clip recorders."""
        with self._lock:
            rec = self._full_recorders.get(camera_id)
        if rec:
            rec.write(raw_frame)
        self.feed_clip_frame(camera_id, raw_frame)

    def get_recordings_list(self) -> dict:
        """Return listing of all saved recordings."""
        result = {
            "full": [],
            "clips": [],
            "screenshots": [],
        }
        for path in FULL_DIR.glob("*.mp4"):
            result["full"].append({
                "name": path.name,
                "path": str(path),
                "size_mb": round(path.stat().st_size / (1024 ** 2), 2),
                "modified": path.stat().st_mtime,
            })
        for path in CLIPS_DIR.glob("*.mp4"):
            result["clips"].append({
                "name": path.name,
                "path": str(path),
                "size_mb": round(path.stat().st_size / (1024 ** 2), 2),
                "modified": path.stat().st_mtime,
            })
        for path in SCREENSHOTS_DIR.glob("*.jpg"):
            result["screenshots"].append({
                "name": path.name,
                "path": str(path),
                "size_mb": round(path.stat().st_size / (1024 ** 2), 2),
                "modified": path.stat().st_mtime,
            })
        return result


# Global recording manager
recording_manager = RecordingManager()
