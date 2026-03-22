"""
HYBRID SENTRY — Behavior Analysis Module
Tracks speed, dwell time, entry/exit, zone violations, and
builds a per-object behavior timeline.
"""

import time
from collections import defaultdict, deque
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from sqlalchemy.orm import Session
from database import BehaviorTimeline, DetectionEvent


# ─────────────────────────────────────────
# SPEED CLASSIFICATION
# ─────────────────────────────────────────
def classify_speed(speed_ms: float) -> str:
    """
    Classify speed from m/s to human-readable label.
    speed_ms is in meters per second.
    """
    if speed_ms < 0.5:
        return "STATIONARY"
    elif speed_ms < 1.5:
        return "WALKING"
    elif speed_ms < 3.0:
        return "FAST WALKING"
    else:
        return f"RUNNING ⚠️"


# ─────────────────────────────────────────
# DISTANCE ESTIMATION
# ─────────────────────────────────────────
KNOWN_HEIGHTS: Dict[str, float] = {
    "person": 1.7,
    "person_civilian": 1.7,
    "person_running": 1.7,
    "person_sitting": 0.9,
    "person_lying": 0.3,
    "group_persons": 1.7,
    "military_personnel": 1.8,
    "armed_person": 1.8,
    "car": 1.5,
    "jeep": 1.8,
    "truck": 3.0,
    "motorcycle": 1.1,
    "military_vehicle": 2.2,
    "bicycle": 1.1,
    "ambulance": 2.5,
    "backpack": 0.5,
    "handbag": 0.4,
    "suitcase": 0.7,
    "dog": 0.5,
    "cat": 0.3,
    "drone_quadcopter": 0.4,
}

FOCAL_LENGTH_PX = 480  # approximate focal length in pixels


def estimate_distance(detected_class: str, bbox_h: int) -> Optional[float]:
    """
    Estimate distance using known height, focal length, and bbox height.
    Formula: distance = (real_height × focal_px) / bbox_h
    Returns distance in meters or None if class not in lookup.
    """
    if bbox_h <= 0:
        return None

    # Try exact match, then fuzzy match by prefix
    real_h = KNOWN_HEIGHTS.get(detected_class)
    if real_h is None:
        for key, h in KNOWN_HEIGHTS.items():
            if detected_class.startswith(key) or key.startswith(detected_class.split("_")[0]):
                real_h = h
                break

    if real_h is None:
        real_h = 1.0  # fallback

    distance = (real_h * FOCAL_LENGTH_PX) / bbox_h
    return round(distance, 1)


# ─────────────────────────────────────────
# ZONE CHECKING
# ─────────────────────────────────────────
def point_in_polygon(px: int, py: int, polygon: List[List[int]]) -> bool:
    """
    Ray-casting algorithm to check if point (px, py) is inside a polygon.
    polygon is a list of [x, y] coordinates.
    """
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def line_cross_detected(
    prev_pos: Tuple[int, int],
    curr_pos: Tuple[int, int],
    line_start: Tuple[int, int],
    line_end: Tuple[int, int],
) -> bool:
    """
    Detect if a tracked object crosses a tripwire line segment.
    Uses 2D cross product / line intersection test.
    """
    def ccw(A, B, C):
        return (C[1]-A[1]) * (B[0]-A[0]) > (B[1]-A[1]) * (C[0]-A[0])

    A, B = prev_pos, curr_pos
    C, D = line_start, line_end
    return ccw(A, C, D) != ccw(B, C, D) and ccw(A, B, C) != ccw(A, B, D)


# ─────────────────────────────────────────
# PER-TRACK STATE TRACKER
# ─────────────────────────────────────────
class TrackState:
    """Holds position/time history and flags for one tracked object."""

    def __init__(self, track_id: int, camera_id: str):
        self.track_id = track_id
        self.camera_id = camera_id
        self.positions: deque = deque(maxlen=30)  # (cx, cy, timestamp)
        self.first_seen: float = time.time()
        self.last_seen: float = time.time()
        self.first_frame_count = 0        # frames seen (for 3-frame rule)
        self.frame_count = 0
        self.current_zone: Optional[str] = None
        self.entry_side: Optional[str] = None
        self.current_speed: float = 0.0
        self.max_speed: float = 0.0
        self.dwell_warned_30 = False
        self.dwell_warned_120 = False
        self.face_concealed_logged = False
        self.entered_logged = False
        self.zones_entered: List[str] = []  # zones previously entered
        self.crossed_tripwires: List[str] = []


class BehaviorTracker:
    """
    Multi-object behavior tracker.
    Maintains TrackState per (track_id, camera_id) pair.
    """

    def __init__(self):
        self._states: Dict[str, TrackState] = {}
        self._cleanup_interval = 300  # clean stale tracks after 5 min

    def _key(self, track_id: int, camera_id: str) -> str:
        return f"{camera_id}:{track_id}"

    def get_or_create(self, track_id: int, camera_id: str) -> TrackState:
        key = self._key(track_id, camera_id)
        if key not in self._states:
            self._states[key] = TrackState(track_id, camera_id)
        return self._states[key]

    def update(
        self,
        track_id: int,
        camera_id: str,
        bbox: Tuple[int, int, int, int],  # (x, y, w, h)
        frame_width: int,
        frame_height: int,
        detected_class: str,
        confidence: float,
        zones: List[dict],  # list of zone dicts from DB
        face_concealed: bool,
        fps_hint: float = 25.0,
        db: Optional[Session] = None,
        detection_id: Optional[int] = None,
    ) -> dict:
        """
        Main update call for each detected object.
        Returns a dict with speed, dwell, zone, events, and a timeline list.
        """
        state = self.get_or_create(track_id, camera_id)
        now = time.time()
        state.frame_count += 1
        state.last_seen = now

        x, y, w, h = bbox
        cx = x + w // 2
        cy = y + h // 2

        events = []  # list of event description strings

        # ── Entry direction ─────────────────────────────
        if not state.entered_logged and state.frame_count >= 3:
            state.entered_logged = True
            if cx < frame_width * 0.2:
                side = "LEFT"
            elif cx > frame_width * 0.8:
                side = "RIGHT"
            elif cy < frame_height * 0.2:
                side = "TOP"
            else:
                side = "UNKNOWN"
            state.entry_side = side
            desc = f"ENTERED from {side}"
            events.append(("entered", desc, 0.0, None))

        # ── Speed calculation ────────────────────────────
        px_per_meter = 100  # rough: 100 pixels = 1 meter at reference distance
        if len(state.positions) >= 2:
            prev_cx, prev_cy, prev_t = state.positions[-1]
            dt = now - prev_t
            if dt > 0:
                dx_px = cx - prev_cx
                dy_px = cy - prev_cy
                dist_px = (dx_px**2 + dy_px**2) ** 0.5
                dist_m = dist_px / px_per_meter
                speed = dist_m / dt
                state.current_speed = round(speed, 2)
                state.max_speed = max(state.max_speed, state.current_speed)

        state.positions.append((cx, cy, now))

        # Speed label
        speed_label = classify_speed(state.current_speed)

        # ── Dwell time ───────────────────────────────────
        dwell_sec = now - state.first_seen
        if dwell_sec > 30 and not state.dwell_warned_30:
            state.dwell_warned_30 = True
            desc = f"LONG DWELL ⚠️ — {int(dwell_sec)}s in view"
            events.append(("dwell", desc, state.current_speed, state.current_zone))

        if dwell_sec > 120 and not state.dwell_warned_120:
            state.dwell_warned_120 = True
            desc = f"PROLONGED ⚠️ — {int(dwell_sec)}s in view"
            events.append(("dwell", desc, state.current_speed, state.current_zone))

        # ── Zone check ───────────────────────────────────
        for zone in zones:
            zone_type = zone.get("zone_type", "")
            zone_name = zone.get("zone_name", "")
            coords = zone.get("coordinates", [])

            if zone_type == "tripwire" and len(coords) >= 2:
                if len(state.positions) >= 2:
                    prev_cx2, prev_cy2, _ = state.positions[-2]
                    crossed = line_cross_detected(
                        (prev_cx2, prev_cy2), (cx, cy),
                        tuple(coords[0]), tuple(coords[1]),
                    )
                    if crossed and zone_name not in state.crossed_tripwires:
                        state.crossed_tripwires.append(zone_name)
                        desc = f"CROSSED TRIPWIRE: {zone_name}"
                        events.append(("zone_cross", desc, state.current_speed, zone_name))

            elif zone_type in ("restricted", "safe") and len(coords) >= 3:
                in_zone = point_in_polygon(cx, cy, coords)
                if in_zone and zone_name != state.current_zone:
                    old_zone = state.current_zone
                    state.current_zone = zone_name
                    if zone_type == "restricted":
                        desc = f"ENTERED RESTRICTED ZONE: {zone_name} ⚠️"
                    else:
                        desc = f"ENTERED SAFE ZONE: {zone_name}"
                    events.append(("zone_enter", desc, state.current_speed, zone_name))
                elif not in_zone and state.current_zone == zone_name:
                    state.current_zone = None
                    if zone_type == "safe":
                        desc = f"EXITED SAFE ZONE: {zone_name} ⚠️"
                    else:
                        desc = f"EXITED RESTRICTED ZONE: {zone_name}"
                    events.append(("zone_exit", desc, state.current_speed, zone_name))

        # ── Face concealment ─────────────────────────────
        if face_concealed and not state.face_concealed_logged:
            state.face_concealed_logged = True
            events.append(("face_concealed", "FACE CONCEALED ⚠️", state.current_speed, state.current_zone))

        # ── Running alert ─────────────────────────────────
        if state.current_speed >= 3.0:
            events.append(("running", f"RUNNING {state.current_speed} m/s ⚠️", state.current_speed, state.current_zone))

        # ── Persist events to DB ──────────────────────────
        if db and events:
            for event_type, description, spd, zone_n in events:
                tl = BehaviorTimeline(
                    track_id=track_id,
                    camera_id=camera_id,
                    detection_id=detection_id,
                    event_type=event_type,
                    description=description,
                    speed_ms=spd,
                    zone_name=zone_n,
                )
                db.add(tl)
            try:
                db.commit()
            except Exception:
                db.rollback()

        return {
            "track_id": track_id,
            "camera_id": camera_id,
            "speed_ms": state.current_speed,
            "speed_label": speed_label,
            "dwell_sec": round(dwell_sec, 1),
            "current_zone": state.current_zone,
            "entry_side": state.entry_side,
            "frame_count": state.frame_count,
            "new_events": [e[1] for e in events],
        }

    def get_timeline(self, track_id: int, camera_id: str, db: Session) -> List[dict]:
        """Fetch full behavior timeline for a track from DB."""
        rows = (
            db.query(BehaviorTimeline)
            .filter(
                BehaviorTimeline.track_id == track_id,
                BehaviorTimeline.camera_id == camera_id,
            )
            .order_by(BehaviorTimeline.timestamp)
            .all()
        )
        return [
            {
                "event_type": r.event_type,
                "description": r.description,
                "speed_ms": r.speed_ms,
                "zone_name": r.zone_name,
                "timestamp": r.timestamp.isoformat(),
            }
            for r in rows
        ]

    def cleanup_stale(self, max_age_sec: float = 300):
        """Remove tracks not seen in last max_age_sec seconds."""
        now = time.time()
        stale_keys = [
            k for k, v in self._states.items()
            if now - v.last_seen > max_age_sec
        ]
        for k in stale_keys:
            del self._states[k]


# Global tracker instance (shared across camera threads)
behavior_tracker = BehaviorTracker()
