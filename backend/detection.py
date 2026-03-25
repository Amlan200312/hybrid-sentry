"""
HYBRID SENTRY — Detection Engine
YOLOv8n + DeepSORT multi-object tracking
Complete class taxonomy, confidence routing, anti-false-alarm rules
"""

import cv2
import numpy as np
import time
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
from pathlib import Path

# YOLOv8 (ultralytics)
try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    print("[DETECT] ultralytics not installed — YOLO disabled")

# DeepSORT
try:
    from deep_sort_realtime.deepsort_tracker import DeepSort
    DEEPSORT_AVAILABLE = True
except ImportError:
    DEEPSORT_AVAILABLE = False
    print("[DETECT] deep-sort-realtime not installed — tracking disabled")

import behavior as beh

import platform

_machine = platform.machine()
if _machine == 'aarch64':
    MODEL_PATH = Path(__file__).parent / "models" / "yolov8n.pt"
    print("[DETECT] RPi detected — YOLOv8n")
else:
    MODEL_PATH = Path(__file__).parent / "models" / "yolo11n.pt"
    print("[DETECT] PC detected — YOLOv11n")

# ── Model state ──────────────────────────────────────────────
model_loaded: bool = False
_yolo_model  = None   # set by initialize_model()


def initialize_model():
    """Load YOLO model once at startup. Safe to call multiple times."""
    global model_loaded, _yolo_model
    if model_loaded:
        return
    if not YOLO_AVAILABLE:
        print("[DETECT] YOLO not available — skipping model load")
        return
    try:
        print(f"[DETECT] Loading model: {MODEL_PATH} ...")
        _yolo_model = YOLO(str(MODEL_PATH))
        model_loaded = True
        print(f"[DETECT] Model ready ✅")
    except Exception as exc:
        print(f"[DETECT] Model load failed: {exc}")


# ─────────────────────────────────────────
# CLASS TAXONOMY
# ─────────────────────────────────────────
YOLO_CLASS_MAP: Dict[str, str] = {
    # COCO person classes → our labels
    "person": "person_civilian",

    # Vehicles
    "car": "car",
    "truck": "truck",
    "bus": "truck",
    "motorcycle": "motorcycle",
    "bicycle": "bicycle",

    # Animals
    "dog": "dog",
    "cat": "cat",
    "horse": "horse",
    "cow": "cow",
    "bird": "bird",

    # Objects
    "backpack": "backpack",
    "handbag": "handbag",
    "suitcase": "suitcase",
    "bottle": "bottle",
    "laptop": "laptop",
    "cell phone": "mobile_phone",
    "book": "book",

    # Aerial
    "airplane": "aircraft_far",
    "kite": "drone_quadcopter",   # fallback — check later
}

DISPLAY_LABELS: Dict[str, str] = {
    "person_civilian": "Person — Civilian",
    "person_running": "Person — Running ⚠️",
    "person_sitting": "Person — Sitting",
    "person_lying": "Person — Lying",
    "group_persons": "Group of Persons",
    "face_concealed": "⚠️ Face Concealed",
    "person_with_mobile": "Person w/ Mobile",
    "person_with_laptop": "Person w/ Laptop",
    "person_with_bag": "Person w/ Bag",
    "person_with_book": "Person w/ Book",
    "military_personnel": "⚠️ Possible Military",
    "armed_person": "⚠️ Possible Armed Person",
    "weapon_gun": "⚠️ Possible Weapon — Gun",
    "weapon_rifle": "⚠️ Possible Weapon — Rifle",
    "weapon_knife": "⚠️ Possible Weapon — Knife",
    "explosive_package": "⚠️ Suspicious Package",
    "suspicious_wire": "⚠️ Suspicious Wire",
    "car": "Vehicle — Car",
    "jeep": "Vehicle — Jeep",
    "motorcycle": "Vehicle — Motorcycle",
    "truck": "Vehicle — Truck",
    "military_vehicle": "⚠️ Military Vehicle",
    "bicycle": "Vehicle — Bicycle",
    "ambulance": "Vehicle — Ambulance",
    "drone_quadcopter": "⚠️ Aerial — Possible Drone",
    "bird": "Aerial — Bird",
    "aircraft_far": "Aerial — Aircraft",
    "dog": "Animal — Dog",
    "cat": "Animal — Cat",
    "monkey": "Animal — Monkey",
    "snake": "⚠️ Animal — Possible Snake",
    "cow": "Animal — Cow",
    "horse": "Animal — Horse",
    "large_animal": "Animal — Large",
    "backpack": "Object — Backpack",
    "handbag": "Object — Handbag",
    "suitcase": "Object — Suitcase",
    "laptop": "Object — Laptop",
    "mobile_phone": "Object — Mobile Phone",
    "book": "Object — Book",
    "bottle": "Object — Bottle",
    "box": "Object — Box",
    "suspicious_package": "⚠️ Suspicious Package",
    "fire": "⚠️ Fire Detected",
    "smoke": "⚠️ Smoke Detected",
    "bright_glare": "⚡ Bright Glare",
    "unknown_object": "❓ Unknown Object",
}

VERIFY_ALWAYS_CLASSES = {
    "military_personnel", "armed_person", "weapon_gun", "weapon_rifle",
    "weapon_knife", "explosive_package", "suspicious_wire",
    "drone_quadcopter", "suspicious_package", "fire", "smoke",
    "snake", "military_vehicle",
}

# ─────────────────────────────────────────
# CONFIDENCE ROUTING
# ─────────────────────────────────────────
def route_detection(confidence: float, detected_class: str, face_concealed: bool) -> str:
    """
    Returns routing decision: 'event_log' | 'verify_queue'
    NEVER auto-confirm VERIFY_ALWAYS_CLASSES or face_concealed.
    >= 85% → event_log (unless class always requires verify)
    < 85% → verify_queue
    """
    if face_concealed:
        return "verify_queue"
    if detected_class in VERIFY_ALWAYS_CLASSES:
        return "verify_queue"
    if confidence >= 0.85:
        return "event_log"
    return "verify_queue"


def get_queue_reason(confidence: float, detected_class: str, face_concealed: bool) -> str:
    """Human-readable reason for queue entry."""
    reasons = []
    if face_concealed:
        reasons.append("Face concealed")
    if detected_class in VERIFY_ALWAYS_CLASSES:
        reasons.append(f"High-risk class: {detected_class}")
    if confidence < 0.85:
        if confidence < 0.60:
            reasons.append(f"Low confidence ({confidence:.0%})")
        else:
            reasons.append(f"Medium confidence ({confidence:.0%})")
    return " | ".join(reasons) if reasons else "Automatic routing"


# ─────────────────────────────────────────
# ANTI-FALSE ALARM RULES
# ─────────────────────────────────────────
class FrameHistory:
    """Tracks N consecutive frames for an object before logging."""

    def __init__(self, required: int = 3):
        self.required = required
        self._counts: Dict[str, int] = {}  # key: track_id → count

    def add(self, track_key: str) -> bool:
        """Increment count. Returns True when threshold reached."""
        self._counts[track_key] = self._counts.get(track_key, 0) + 1
        return self._counts[track_key] >= self.required

    def reset(self, track_key: str):
        self._counts.pop(track_key, None)

    def cleanup(self, active_keys: set):
        stale = [k for k in self._counts if k not in active_keys]
        for k in stale:
            del self._counts[k]


def check_weapon_shape(frame: np.ndarray, bbox: Tuple[int, int, int, int]) -> bool:
    """
    Verify weapon-like shape using:
    - Aspect ratio check (barrel elongation > 3:1)
    - Book/bottle false-positive guard (wide → not weapon)
    Returns True if shape plausibly matches weapon.
    """
    x, y, w, h = bbox
    if w <= 0 or h <= 0:
        return False
    aspect = max(w, h) / min(w, h)
    # Guns/rifles are elongated (aspect > 3)
    # Books are roughly 1.3:1 — 1.6:1
    # Bottles are 2.5:1 — 4:1 (ambiguous, return False)
    if aspect < 2.5:
        return False  # Too square — not a weapon
    # Check if wider (landscape) → bottle/book orientation, not a weapon held upright
    if w > h:
        return aspect > 3.5  # Horizontal elongation more likely rifle
    return True


def check_face_concealment(frame: np.ndarray, face_bbox: Tuple[int, int, int, int]) -> bool:
    """
    Check if face region has < 20% skin-colored pixels.
    Uses HSV skin tone range.
    Returns True if face is concealed.
    """
    x, y, w, h = face_bbox
    fh, fw = frame.shape[:2]
    x1, y1 = max(0, x), max(0, y)
    x2, y2 = min(fw, x + w), min(fh, y + h)
    if x2 <= x1 or y2 <= y1:
        return False

    roi = frame[y1:y2, x1:x2]
    if roi.size == 0:
        return False

    hsv_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    # Skin tone range in HSV
    lower_skin = np.array([0, 20, 70], dtype=np.uint8)
    upper_skin = np.array([20, 255, 255], dtype=np.uint8)
    skin_mask = cv2.inRange(hsv_roi, lower_skin, upper_skin)

    total_pixels = roi.shape[0] * roi.shape[1]
    skin_pixels = cv2.countNonZero(skin_mask)
    skin_ratio = skin_pixels / total_pixels if total_pixels > 0 else 0

    return skin_ratio < 0.20  # < 20% skin → concealed


def check_military_dress(frame: np.ndarray, body_bbox: Tuple[int, int, int, int]) -> bool:
    """
    3-layer military person check:
    Layer 1: HSV olive/camo color presence
    Layer 2: Helmet dome (not implemented without keypoints — skip)
    Layer 3: Returns result of layers 1+3
    """
    x, y, w, h = body_bbox
    fh, fw = frame.shape[:2]
    x1, y1 = max(0, x), max(0, y)
    x2, y2 = min(fw, x + w), min(fh, y + h)
    if x2 <= x1 or y2 <= y1:
        return False

    roi = frame[y1:y2, x1:x2]
    if roi.size == 0:
        return False

    hsv_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)

    # Olive green range
    lower_olive = np.array([25, 20, 30], dtype=np.uint8)
    upper_olive = np.array([85, 180, 120], dtype=np.uint8)
    olive_mask = cv2.inRange(hsv_roi, lower_olive, upper_olive)

    # Camo brown/tan range
    lower_camo = np.array([10, 20, 50], dtype=np.uint8)
    upper_camo = np.array([25, 100, 150], dtype=np.uint8)
    camo_mask = cv2.inRange(hsv_roi, lower_camo, upper_camo)

    combined = cv2.bitwise_or(olive_mask, camo_mask)
    total = roi.shape[0] * roi.shape[1]
    camo_ratio = cv2.countNonZero(combined) / total if total > 0 else 0

    return camo_ratio > 0.25  # > 25% camo/olive → possible military


def check_drone(
    bbox: Tuple[int, int, int, int],
    frame_height: int,
    speed_ms: float,
) -> bool:
    """
    Drone detection heuristic:
    - In top 25% of frame
    - Small (<80px on one side)
    - Has motion (speed > 0.5 m/s)
    """
    x, y, w, h = bbox
    in_sky = y < frame_height * 0.25
    is_small = max(w, h) < 80
    has_motion = speed_ms > 0.5
    return in_sky and is_small and has_motion


def check_snake(
    frame: np.ndarray,
    bbox: Tuple[int, int, int, int],
    speed_ms: float,
) -> bool:
    """
    Snake detection heuristic:
    - Elongated contour (aspect > 1:6)
    - In lower portion of frame (ground level)
    - Slow moving
    """
    x, y, w, h = bbox
    if w <= 0 or h <= 0:
        return False
    aspect = max(w, h) / min(w, h)
    frame_h = frame.shape[0]
    near_ground = (y + h) > frame_h * 0.5
    slow = speed_ms < 1.0
    return aspect > 6.0 and near_ground and slow


# ─────────────────────────────────────────
# DETECTION ENGINE
# ─────────────────────────────────────────
class DetectionEngine:
    """
    YOLOv8n + DeepSORT detection and tracking engine.
    One instance per camera feed.
    """

    def __init__(self, camera_id: str):
        self.camera_id = camera_id
        self.frame_history = FrameHistory(required=3)
        self._active_tracks: Dict[int, dict] = {}  # track_id → last detection info
        self._model: Optional[Any] = None
        self._tracker: Optional[Any] = None
        self._load_model()

    def _load_model(self):
        if YOLO_AVAILABLE:
            try:
                self._model = YOLO(str(MODEL_PATH))
                print(f"[DETECT] Model loaded ({MODEL_PATH.name}) for {self.camera_id}")
            except Exception as e:
                print(f"[DETECT] Failed to load YOLO: {e}")
                self._model = None

        if DEEPSORT_AVAILABLE:
            try:
                self._tracker = DeepSort(max_age=30, n_init=3, nn_budget=100)
                print(f"[DETECT] DeepSORT initialized for {self.camera_id}")
            except Exception as e:
                print(f"[DETECT] Failed to init DeepSORT: {e}")
                self._tracker = None

    def detect(
        self,
        frame: np.ndarray,
        roi_rects: Optional[List[Tuple[int, int, int, int]]] = None,
        mode: str = "full",  # full | roi | periodic
        zones: Optional[List[dict]] = None,
    ) -> Tuple[np.ndarray, List[dict]]:
        """
        Run YOLO + DeepSORT on frame.
        mode: 'full' = whole frame, 'roi' = run on motion ROIs only, 'periodic' = run sparse
        Returns (annotated_frame, detections_list)

        detections_list items:
          {track_id, detected_class, display_label, confidence, bbox,
           distance_m, speed_ms, speed_label, dwell_sec, face_concealed,
           route, queue_reason, holding_object, is_new_log_entry}
        """
        if self._model is None:
            return frame, []

        # Resize for YOLO
        h_orig, w_orig = frame.shape[:2]
        yolo_frame = cv2.resize(frame, (416, 416))

        # Run inference
        try:
            results = self._model(yolo_frame, verbose=False, conf=0.35)
        except Exception as e:
            print(f"[DETECT] YOLO error: {e}")
            return frame, []

        # Scale back factor
        sx = w_orig / 416
        sy = h_orig / 416

        # Parse detections for DeepSORT
        raw_detections = []
        for result in results:
            for box in result.boxes:
                conf = float(box.conf[0])
                cls_id = int(box.cls[0])
                cls_name = result.names.get(cls_id, "unknown")
                x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]

                # Scale back
                x1 = int(x1 * sx)
                y1 = int(y1 * sy)
                x2 = int(x2 * sx)
                y2 = int(y2 * sy)
                bw = x2 - x1
                bh = y2 - y1

                # Map to our class taxonomy
                mapped_class = YOLO_CLASS_MAP.get(cls_name, cls_name)
                raw_detections.append(([x1, y1, bw, bh], conf, mapped_class))

        # DeepSORT update
        if self._tracker and raw_detections:
            try:
                tracks = self._tracker.update_tracks(raw_detections, frame=frame)
            except Exception as e:
                print(f"[DETECT] DeepSORT error: {e}")
                tracks = []
        else:
            tracks = []

        # Build final detections
        final_detections = []
        annotated = frame.copy()
        active_keys = set()

        for track in tracks:
            if not track.is_confirmed():
                continue

            track_id = track.track_id
            ltrb = track.to_ltrb()
            x1, y1, x2, y2 = int(ltrb[0]), int(ltrb[1]), int(ltrb[2]), int(ltrb[3])
            bw = x2 - x1
            bh = y2 - y1
            bbox = (x1, y1, bw, bh)

            # Get class and confidence from detection data
            det_class = track.det_class if hasattr(track, "det_class") else "person_civilian"
            det_conf = track.det_conf if (hasattr(track, "det_conf") and track.det_conf is not None) else 0.50
            # Ensure numeric type (DeepSORT may return None on some backends)
            try:
                det_conf = float(det_conf)
            except (TypeError, ValueError):
                det_conf = 0.50

            # Unknown if confidence < 0.60
            if det_conf < 0.60:
                det_class = "unknown_object"

            # Try ROI-based motion restriction
            if mode == "roi" and roi_rects:
                cx_t = x1 + bw // 2
                cy_t = y1 + bh // 2
                in_motion_zone = any(
                    rx <= cx_t <= rx + rw and ry <= cy_t <= ry + rh
                    for rx, ry, rw, rh in roi_rects
                )
                if not in_motion_zone:
                    continue

            # Face concealment check
            face_concealed = False
            if det_class.startswith("person"):
                # Face presumed in top 30% of person bbox
                face_h = int(bh * 0.3)
                face_bbox = (x1, y1, bw, face_h)
                face_concealed = check_face_concealment(frame, face_bbox)

            # Military dress check
            if det_class == "person_civilian":
                if check_military_dress(frame, bbox):
                    det_class = "military_personnel"

            # Weapon shape verification
            if det_class in ("weapon_gun", "weapon_rifle"):
                if not check_weapon_shape(frame, bbox):
                    det_class = "possible_weapon"  # demote

            # Check object in hand (overlap with held items)
            holding_object = None
            for other_track in tracks:
                if other_track.track_id is None or other_track.track_id == track_id:
                    continue
                if not other_track.is_confirmed():
                    continue
                o_class = other_track.det_class if hasattr(other_track, "det_class") else ""
                if o_class in ("laptop", "mobile_phone", "book", "backpack", "handbag", "suitcase", "bottle"):
                    ol = other_track.to_ltrb()
                    ox1, oy1, ox2, oy2 = int(ol[0]), int(ol[1]), int(ol[2]), int(ol[3])
                    # Check overlap with lower half of person
                    person_lower_y = y1 + bh // 2
                    if ox1 < x2 and ox2 > x1 and oy1 < y2 and oy2 > person_lower_y:
                        holding_object = o_class
                        # Update class label
                        class_map = {
                            "laptop": "person_with_laptop",
                            "mobile_phone": "person_with_mobile",
                            "book": "person_with_book",
                            "backpack": "person_with_bag",
                            "handbag": "person_with_bag",
                            "suitcase": "person_with_bag",
                        }
                        det_class = class_map.get(o_class, det_class)
                        break

            # Snake check
            if det_class in ("snake", "person_lying") and bh > 0:
                speed_hint = beh.behavior_tracker.get_or_create(track_id, self.camera_id).current_speed
                if check_snake(frame, bbox, speed_hint):
                    det_class = "snake"

            # Drone check
            speed_hint = beh.behavior_tracker.get_or_create(track_id, self.camera_id).current_speed
            if det_class in ("bird", "drone_quadcopter", "aircraft_far"):
                if check_drone(bbox, h_orig, speed_hint):
                    det_class = "drone_quadcopter"

            # Distance estimation
            distance_m = beh.estimate_distance(det_class, bh)

            # Behavior update
            behavior_data = beh.behavior_tracker.update(
                track_id=track_id,
                camera_id=self.camera_id,
                bbox=bbox,
                frame_width=w_orig,
                frame_height=h_orig,
                detected_class=det_class,
                confidence=det_conf,
                zones=zones or [],
                face_concealed=face_concealed,
            )

            speed_ms = behavior_data["speed_ms"]
            speed_label = behavior_data["speed_label"]
            dwell_sec = behavior_data["dwell_sec"]

            # Running person check
            if det_class.startswith("person") and speed_ms >= 3.0:
                det_class = "person_running"

            # Routing decision
            route = route_detection(det_conf, det_class, face_concealed)
            queue_reason = get_queue_reason(det_conf, det_class, face_concealed) if route == "verify_queue" else ""

            # 3-frame multi-frame rule
            track_key = f"{self.camera_id}:{track_id}"
            active_keys.add(track_key)
            is_new_log_entry = self.frame_history.add(track_key)

            # Display label
            display_label = DISPLAY_LABELS.get(det_class, det_class.replace("_", " ").title())
            if face_concealed:
                display_label += " | ⚠️ FACE CONCEALED"

            # Draw bbox on annotated frame
            color = (57, 255, 20)  # neon green — no danger color coding
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

            # Bbox label: [CLASS | CONF% | DIST | SPEED | #ID]
            dist_str = f"{distance_m}m" if distance_m else "?m"
            speed_str = f"{speed_ms:.1f}m/s"
            label_text = f"{display_label} | {det_conf:.0%} | {dist_str} | {speed_str} | #{track_id}"
            label_y = max(y1 - 6, 14)
            cv2.putText(
                annotated, label_text,
                (x1, label_y),
                cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 0, 0), 3, cv2.LINE_AA
            )
            cv2.putText(
                annotated, label_text,
                (x1, label_y),
                cv2.FONT_HERSHEY_SIMPLEX, 0.38, color, 1, cv2.LINE_AA
            )

            final_detections.append({
                "track_id": track_id,
                "detected_class": det_class,
                "display_label": display_label,
                "confidence": round(det_conf, 4),
                "bbox": list(bbox),
                "distance_m": distance_m,
                "speed_ms": speed_ms,
                "speed_label": speed_label,
                "dwell_sec": dwell_sec,
                "face_concealed": face_concealed,
                "holding_object": holding_object,
                "route": route,
                "queue_reason": queue_reason,
                "is_new_log_entry": is_new_log_entry,
                "camera_id": self.camera_id,
                "behavior_events": behavior_data.get("new_events", []),
                "zone": behavior_data.get("current_zone"),
                "timestamp": datetime.utcnow().isoformat(),
            })

        # Cleanup stale frame histories
        self.frame_history.cleanup(active_keys)

        return annotated, final_detections


# ─────────────────────────────────────────
# ENGINE REGISTRY (one per camera)
# ─────────────────────────────────────────
_engine_registry: Dict[str, DetectionEngine] = {}


def get_engine(camera_id: str) -> DetectionEngine:
    """Get or create a DetectionEngine for a camera."""
    if camera_id not in _engine_registry:
        _engine_registry[camera_id] = DetectionEngine(camera_id)
    return _engine_registry[camera_id]
