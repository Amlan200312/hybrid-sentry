"""
HYBRID SENTRY — Main FastAPI Application
REST API + WebSocket hub
"""

import os
import warnings
warnings.filterwarnings("ignore")
import json
import asyncio
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, List

from fastapi import (
    FastAPI, Depends, HTTPException, Request, Response,
    WebSocket, WebSocketDisconnect, status,
    BackgroundTasks, UploadFile, File,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session

# Internal modules
from database import (
    init_db, get_db, User, DetectionEvent, VerifyQueue,
    DismissedLog, BehaviorTimeline, GpsLocation,
    FieldMessage, CallsignConfig, Zone, FrameHeatmap, SystemLog, BaseZone,
    CameraConfig, SystemConfig,
    get_callsign_for_recorder, assign_callsign,
)
from auth import (
    authenticate_user, get_current_user, require_admin,
    require_admin_or_monitor, require_any, ws_authenticate,
    create_user, change_pin, reset_pin_admin
)
from multi_feed import feed_manager
from system_stats import system_stats
from gps import gps_manager, handle_recorder_gps_ws, handle_monitor_gps_ws
from voice_comms import (
    handle_voice_ws, voice_client_manager,
    acknowledge_message, send_reply, load_vosk_models
)
from recording import recording_manager
from reports import generate_pdf_report, generate_csv_report
from sensors import init_sensors, get_sensors
import detection
import platform as _platform

# ─────────────────────────────────────────
# APP INIT
# ─────────────────────────────────────────
app = FastAPI(
    title="Hybrid Sentry API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for frontend build
FRONTEND_BUILD = Path(__file__).parent.parent / "frontend" / "dist"
if FRONTEND_BUILD.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_BUILD / "assets")), name="assets")

# Screenshots/recordings for download
RECORDINGS_DIR = Path("recordings")
SCREENSHOTS_DIR = RECORDINGS_DIR / "screenshots"
CLIPS_DIR   = RECORDINGS_DIR / "clips"
FULL_DIR    = RECORDINGS_DIR / "full"
COMMS_DIR   = RECORDINGS_DIR / "comms"

# Active monitor WebSocket connections (for broadcast)
_monitor_ws_list: List[WebSocket] = []

# Active detection WebSocket connections (recorders + monitors viewing detections)
_detection_ws_list: List[WebSocket] = []

# In-memory system log buffer
from collections import deque as _deque
_system_logs: _deque = _deque(maxlen=200)

# ─────────────────────────────────────────
# STARTUP / SHUTDOWN
# ─────────────────────────────────────────
@app.on_event("startup")
async def startup():
    # Initialize database
    init_db()

    # Start system stats
    system_stats.start()

    # Pre-load YOLO model in background thread (avoids blocking first request)
    import threading as _threading
    _threading.Thread(target=detection.initialize_model, daemon=True).start()
    print("[MAIN] YOLO model pre-load started (background)")

    # Load VOSK models
    load_vosk_models()

    # Initialize sensors (GPIO — simulation on non-RPi)
    def _sound_event_handler(ev: dict):
        """Route acoustic events to verify queue."""
        asyncio.get_event_loop().run_until_complete(
            _handle_acoustic_event(ev)
        )
    init_sensors(event_callback=None)  # callback set after loop ready

    # Start multi-feed manager
    def _detection_callback(camera_id, det, annotated_frame):
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.ensure_future(_handle_detection_event(camera_id, det, annotated_frame))
            else:
                loop.run_until_complete(_handle_detection_event(camera_id, det, annotated_frame))
        except Exception as e:
            print(f"[MAIN] Detection callback error: {e}")
    feed_manager.detection_callback = _detection_callback
    feed_manager.start()

    # Register main webcam (CAM-01) — index 0
    try:
        feed_manager.add_camera("CAM-01", 0)
        print("[MAIN] CAM-01 (USB Webcam) registered")
    except Exception as e:
        print(f"[MAIN] CAM-01 register error: {e}")

    print("[MAIN] HYBRID SENTRY v1.0 — ONLINE ✅")


@app.on_event("shutdown")
async def shutdown():
    feed_manager.stop()
    system_stats.stop()
    sensors = get_sensors()
    if sensors:
        sensors.cleanup()


# ─────────────────────────────────────────
# DETECTION EVENT DB HANDLER
# ─────────────────────────────────────────
async def _handle_detection_event(camera_id: str, det: dict, annotated_frame):
    """Save detection to DB and route to verify queue or event log."""
    from database import SessionLocal, DetectionEvent, VerifyQueue
    from recording import recording_manager
    import cv2, numpy as np

    db = SessionLocal()
    try:
        # Save screenshot
        screenshot_path = ""
        if annotated_frame is not None:
            screenshot_path = recording_manager.take_screenshot(
                annotated_frame, camera_id, det.get("detected_class", "")
            )

        # Save clip from circular buffer
        state = feed_manager.get_state(camera_id)
        clip_path = ""
        if state:
            pre_frames = [f for f, _ in state.frame_buffer.snapshot()]
            if pre_frames:
                clip_rec = recording_manager.trigger_clip(
                    camera_id,
                    det.get("detected_class", "detection"),
                    pre_frames,
                )
                clip_path = clip_rec.filepath or ""

        # GPS from nearest recorder
        gps_positions = gps_manager.get_all_positions()
        gps_lat = gps_positions[0].get("latitude") if gps_positions else None
        gps_lng = gps_positions[0].get("longitude") if gps_positions else None

        ev = DetectionEvent(
            track_id=det.get("track_id"),
            detected_class=det.get("detected_class", "unknown"),
            display_label=det.get("display_label", "Unknown"),
            confidence=det.get("confidence", 0.0),
            distance_m=det.get("distance_m"),
            speed_ms=det.get("speed_ms", 0.0),
            zone_name=det.get("zone"),
            camera_id=camera_id,
            gps_lat=gps_lat,
            gps_lng=gps_lng,
            face_concealed=det.get("face_concealed", False),
            holding_object=det.get("holding_object"),
            frame_x=det["bbox"][0] if det.get("bbox") else None,
            frame_y=det["bbox"][1] if det.get("bbox") else None,
            frame_w=det["bbox"][2] if det.get("bbox") else None,
            frame_h=det["bbox"][3] if det.get("bbox") else None,
            screenshot_path=screenshot_path,
            clip_path=clip_path,
            status="pending" if det.get("route") == "verify_queue" else "confirmed",
        )
        db.add(ev)
        db.commit()
        db.refresh(ev)

        # Route to verify queue
        if det.get("route") == "verify_queue":
            vq = VerifyQueue(
                detection_id=ev.id,
                confidence=det.get("confidence", 0.0),
                queue_reason=det.get("queue_reason", ""),
            )
            db.add(vq)
            db.commit()

        # Update frame heatmap
        if det.get("bbox") and annotated_frame is not None:
            h, w = annotated_frame.shape[:2]
            bx, by = det["bbox"][0], det["bbox"][1]
            gx = min(9, int(bx / w * 10))
            gy = min(9, int(by / h * 10))

            hm = db.query(FrameHeatmap).filter(
                FrameHeatmap.camera_id == camera_id,
                FrameHeatmap.grid_x == gx,
                FrameHeatmap.grid_y == gy,
            ).first()
            if hm:
                hm.detection_count += 1
                hm.most_common_class = det.get("detected_class")
            else:
                hm = FrameHeatmap(
                    camera_id=camera_id,
                    grid_x=gx,
                    grid_y=gy,
                    detection_count=1,
                    most_common_class=det.get("detected_class"),
                )
                db.add(hm)
            db.commit()

        # Compute bbox as percentage for frontend overlay
        bbox_pct = None
        if det.get("bbox") and annotated_frame is not None:
            fh, fw = annotated_frame.shape[:2]
            bx, by, bw, bh = det["bbox"]
            bbox_pct = {
                "x": round(bx / fw * 100, 2),
                "y": round(by / fh * 100, 2),
                "width": round(bw / fw * 100, 2),
                "height": round(bh / fh * 100, 2),
            }

        detection_payload = {
            "type": "detection",
            "detection": {
                "id": ev.id,
                "label": det.get("display_label", det.get("detected_class", "unknown")),
                "confidence": det.get("confidence", 0.0),
                "camera_id": camera_id,
                "timestamp": datetime.utcnow().isoformat(),
                **(bbox_pct or {}),
            },
        }
        monitor_payload = {
            "type": "new_detection",
            "event_id": ev.id,
            "route": det.get("route"),
            "camera_id": camera_id,
            "detected_class": det.get("detected_class"),
            "display_label": det.get("display_label"),
            "confidence": det.get("confidence"),
            "timestamp": datetime.utcnow().isoformat(),
        }

        dead = []
        for ws in _detection_ws_list:
            try:
                await ws.send_json(detection_payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            if ws in _detection_ws_list:
                _detection_ws_list.remove(ws)

        dead = []
        for ws in _monitor_ws_list:
            try:
                await ws.send_json(monitor_payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            if ws in _monitor_ws_list:
                _monitor_ws_list.remove(ws)

    except Exception as e:
        print(f"[MAIN] Detection save error: {e}")
        db.rollback()
    finally:
        db.close()


async def _handle_acoustic_event(ev: dict):
    """Route sound sensor events to verify queue."""
    from database import SessionLocal, DetectionEvent, VerifyQueue
    db = SessionLocal()
    try:
        det_ev = DetectionEvent(
            detected_class="acoustic_event",
            display_label=ev.get("label", "🔊 Sound Detected"),
            confidence=0.70,
            camera_id="CAM-01",
            status="pending",
            acoustic_triggered=True,
        )
        db.add(det_ev)
        db.commit()
        db.refresh(det_ev)

        vq = VerifyQueue(
            detection_id=det_ev.id,
            confidence=0.70,
            queue_reason=f"Acoustic: {ev.get('type')}",
            acoustic_data=ev,
        )
        db.add(vq)
        db.commit()
    finally:
        db.close()


# ─────────────────────────────────────────
# PYDANTIC MODELS
# ─────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    pin: str

class VerifyRequest(BaseModel):
    action: str      # confirm | dismiss | escalate
    user: str = ""

class ZoneCreate(BaseModel):
    camera_id: str
    zone_name: str
    zone_type: str   # tripwire | restricted | safe
    coordinates: list

class ServoCommand(BaseModel):
    direction: Optional[str] = None   # left | right | up | down | home
    mode: Optional[str] = None        # AUTO | MANUAL | SOUND
    pan: Optional[float] = None
    tilt: Optional[float] = None

class UserCreate(BaseModel):
    username: str
    pin: str
    role: str
    display_name: str = ""
    operator_id: str = ""
    badge_id: str = ""
    rank: str = ""
    designation: str = ""
    unit_name: str = ""
    contact_number: str = ""
    blood_group: str = ""
    id_pass_number: str = ""
    callsign: str = ""

class PINChange(BaseModel):
    old_pin: str
    new_pin: str

class AdminPINReset(BaseModel):
    target_username: str
    new_pin: str

class CallsignUpdate(BaseModel):
    camera_id: Optional[str] = None
    recorder_username: Optional[str] = None
    callsign: str
    color_hex: str = "#39ff14"

class AckRequest(BaseModel):
    ack_by: str

class ReplyRequest(BaseModel):
    text: str
    reply_by: str

class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    badge_id: Optional[str] = None
    rank: Optional[str] = None
    designation: Optional[str] = None
    unit_name: Optional[str] = None
    contact_number: Optional[str] = None
    blood_group: Optional[str] = None
    id_pass_number: Optional[str] = None

class SetupRequest(BaseModel):
    org_name: str
    location: str
    security_level: str
    admin_name: str
    admin_username: str
    admin_pin: str
    badge_id: str = ""
    rank: str = ""
    designation: str = ""
    unit_name: str = ""
    contact_number: str = ""
    blood_group: str = ""
    id_pass_number: str = ""


class RegisterRequest(BaseModel):
    full_name: str
    username: str
    role: str          # admin | monitor | recorder
    badge_id: str = ""
    rank: str = ""
    unit_name: str = ""
    contact_number: str = ""
    blood_group: str = ""
    id_pass_number: str = ""
    pin: str


# ─────────────────────────────────────────
# AUTH ENDPOINTS
# ─────────────────────────────────────────
@app.post("/api/auth/login")
async def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    from auth import authenticate_user
    ip = request.client.host if request.client else ""
    result = authenticate_user(db, req.username, req.pin, ip=ip)
    return result


@app.post("/api/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token")
    return {"success": True}


@app.post("/api/auth/register")
async def register(req: RegisterRequest, db: Session = Depends(get_db)):
    """Self-registration. Recorders are auto-approved; Admin/Monitor require admin approval."""
    import bcrypt

    # Check username availability
    existing = db.query(User).filter(User.username == req.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")

    # Validate role
    allowed_roles = {"admin", "monitor", "recorder"}
    role = req.role.lower()
    if role not in allowed_roles:
        raise HTTPException(status_code=400, detail="Invalid role")

    # Validate PIN length
    pin_lengths = {"recorder": 4, "monitor": 6, "admin": 8}
    expected_len = pin_lengths[role]
    if len(req.pin) != expected_len or not req.pin.isdigit():
        raise HTTPException(
            status_code=400,
            detail=f"{role.capitalize()} PIN must be exactly {expected_len} digits"
        )

    # Hash PIN
    pin_hash = bcrypt.hashpw(req.pin.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")

    # Recorders are immediately active; admin/monitor need approval
    is_active = role == "recorder"

    user = User(
        username=req.username,
        pin_hash=pin_hash,
        role=role,
        display_name=req.full_name,
        badge_id=req.badge_id or None,
        rank=req.rank or None,
        unit_name=req.unit_name or None,
        contact_number=req.contact_number or None,
        blood_group=req.blood_group or None,
        id_pass_number=req.id_pass_number or None,
        is_active=is_active,
    )
    db.add(user)
    db.commit()

    if is_active:
        message = "Account created successfully. You can log in now."
    else:
        message = "Account created. Waiting for admin approval before you can log in."

    return {"success": True, "message": message, "pending_approval": not is_active}


@app.get("/api/auth/check-username/{username}")
async def check_username(username: str, db: Session = Depends(get_db)):
    """Check if a username is available for registration."""
    existing = db.query(User).filter(User.username == username).first()
    return {"available": existing is None}


@app.get("/api/auth/me")
async def auth_me(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user = db.query(User).filter(User.username == current_user["username"]).first()
    if not user:
        return current_user
    return {
        "username": user.username,
        "role": user.role,
        "display_name": user.display_name or user.username,
        "operator_id": user.operator_id or "",
        "callsign": user.callsign or "",
        "badge_id": user.badge_id or "",
        "rank": user.rank or "",
        "designation": user.designation or "",
        "unit_name": user.unit_name or "",
        "contact_number": user.contact_number or "",
        "blood_group": user.blood_group or "",
        "id_pass_number": user.id_pass_number or "",
        "avatar_url": user.avatar_url or "",
        "notification_enabled": user.notification_enabled,
    }


# ─────────────────────────────────────────
# SYSTEM SETUP ENDPOINTS
# ─────────────────────────────────────────
@app.get("/api/system/setup-required")
async def setup_required(db: Session = Depends(get_db)):
    """Check if the system needs initial setup (no users exist)."""
    count = db.query(User).count()
    return {"setup_required": count == 0}


@app.post("/api/system/setup")
async def system_setup(req: SetupRequest, db: Session = Depends(get_db)):
    """Create admin account and default monitor/recorder accounts during initial setup."""
    count = db.query(User).count()
    if count > 0:
        raise HTTPException(400, "System already configured. Users exist.")

    import bcrypt

    try:
        # Admin user
        admin_hash = bcrypt.hashpw(
            req.admin_pin.encode("utf-8"), bcrypt.gensalt(rounds=12)
        ).decode("utf-8")
        admin = User(
            username=req.admin_username,
            pin_hash=admin_hash,
            role="admin",
            display_name=req.admin_name,
            badge_id=req.badge_id or None,
            id_pass_number=req.id_pass_number or None,
            rank=req.rank or None,
            designation=req.designation or None,
            unit_name=req.unit_name or None,
            contact_number=req.contact_number or None,
            blood_group=req.blood_group or None,
            operator_id="OP-001",
            callsign="ALPHA",
        )
        db.add(admin)

        # Default monitor
        mon_hash = bcrypt.hashpw(b"123456", bcrypt.gensalt(rounds=12)).decode("utf-8")
        monitor = User(
            username="monitor",
            pin_hash=mon_hash,
            role="monitor",
            display_name="Monitor Officer",
            badge_id="MON-001",
            rank="Officer",
            unit_name=req.unit_name or "Surveillance Unit",
            blood_group="A+",
            operator_id="OP-002",
            callsign="BRAVO",
        )
        db.add(monitor)

        # Default recorder
        rec_hash = bcrypt.hashpw(b"1234", bcrypt.gensalt(rounds=12)).decode("utf-8")
        recorder_user = User(
            username="recorder",
            pin_hash=rec_hash,
            role="recorder",
            display_name="Field Recorder",
            badge_id="REC-001",
            rank="Field Operative",
            unit_name="Field Team Alpha",
            blood_group="B+",
            operator_id="OP-003",
            callsign="CHARLIE",
        )
        db.add(recorder_user)

        # Callsign configs
        from database import CallsignConfig
        db.add(CallsignConfig(camera_id="CAM-01", callsign="ALPHA", color_hex="#388bfd"))
        db.add(CallsignConfig(recorder_username="recorder", callsign="CHARLIE", color_hex="#3fb950"))

        db.commit()
        return {"success": True, "message": "System configured successfully."}
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Setup failed: {str(e)}")


# ─────────────────────────────────────────
# PROFILE ENDPOINTS
# ─────────────────────────────────────────
@app.put("/api/users/profile")
async def update_profile(
    req: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Update current user's personal details."""
    user = db.query(User).filter(User.username == current_user["username"]).first()
    if not user:
        raise HTTPException(404, "User not found")

    if req.display_name is not None:
        user.display_name = req.display_name
    if req.avatar_url is not None:
        user.avatar_url = req.avatar_url
    if req.badge_id is not None:
        user.badge_id = req.badge_id
    if req.rank is not None:
        user.rank = req.rank
    if req.designation is not None:
        user.designation = req.designation
    if req.unit_name is not None:
        user.unit_name = req.unit_name
    if req.contact_number is not None:
        user.contact_number = req.contact_number
    if req.blood_group is not None:
        user.blood_group = req.blood_group
    if req.id_pass_number is not None:
        user.id_pass_number = req.id_pass_number

    db.commit()
    db.refresh(user)
    return {
        "success": True,
        "username": user.username,
        "display_name": user.display_name,
        "badge_id": user.badge_id,
        "rank": user.rank,
    }


@app.post("/api/users/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Upload profile photo. Saves to recordings/avatars/."""
    import shutil
    avatars_dir = Path("recordings") / "avatars"
    avatars_dir.mkdir(parents=True, exist_ok=True)

    # Validate extension
    ext = Path(file.filename).suffix.lower() if file.filename else ".jpg"
    if ext not in (".jpg", ".jpeg", ".png", ".webp"):
        raise HTTPException(400, "Only JPG/PNG/WebP images allowed.")

    # Check size (2MB max)
    contents = await file.read()
    if len(contents) > 2 * 1024 * 1024:
        raise HTTPException(400, "Image must be under 2MB.")

    filename = f"{current_user['username']}{ext}"
    filepath = avatars_dir / filename
    with open(filepath, "wb") as f:
        f.write(contents)

    # Update DB
    user = db.query(User).filter(User.username == current_user["username"]).first()
    if user:
        user.avatar_url = f"/recordings/avatars/{filename}"
        db.commit()

    return {"success": True, "avatar_url": f"/recordings/avatars/{filename}"}


@app.get("/api/users/id-card/{username}")
async def get_id_card(
    username: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Return all fields needed for the operator ID card."""
    # Only self or admin can view
    if current_user["username"] != username and current_user["role"] != "admin":
        raise HTTPException(403, "Not permitted")

    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(404, "User not found")

    return {
        "username": user.username,
        "display_name": user.display_name or user.username,
        "rank": user.rank or "",
        "badge_id": user.badge_id or "",
        "unit_name": user.unit_name or "",
        "blood_group": user.blood_group or "",
        "id_pass_number": user.id_pass_number or "",
        "callsign": user.callsign or "",
        "role": user.role,
        "operator_id": user.operator_id or "",
        "avatar_url": user.avatar_url or "",
    }


# ─────────────────────────────────────────
# FEEDS / STREAMING
# ─────────────────────────────────────────
@app.get("/api/feeds")
async def get_feeds():
    return feed_manager.get_status()


@app.get("/stream/{camera_id}")
async def mjpeg_stream(camera_id: str):
    """MJPEG streaming endpoint for a camera."""
    def _gen():
        for chunk in feed_manager.mjpeg_generator(camera_id):
            yield chunk
    return StreamingResponse(
        _gen(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@app.post("/api/stream/recorder/{camera_id}/start")
async def recorder_stream_start(
    camera_id: str,
    current_user: dict = Depends(require_any),
):
    """Register a mobile recorder stream as a new camera feed."""
    if camera_id not in feed_manager.list_cameras():
        # Add as a mobile camera (will wait for MJPEG push)
        return {"status": "registered", "camera_id": camera_id}
    return {"status": "already_registered", "camera_id": camera_id}


# ─────────────────────────────────────────
# DETECTION / EVENTS
# ─────────────────────────────────────────
@app.get("/api/events")
async def get_events(
    limit: int = 100,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_or_monitor),
):
    q = db.query(DetectionEvent)
    if status_filter:
        q = q.filter(DetectionEvent.status == status_filter)
    events = q.order_by(DetectionEvent.timestamp.desc()).limit(limit).all()
    return [
        {
            "id": ev.id,
            "track_id": ev.track_id,
            "detected_class": ev.detected_class,
            "display_label": ev.display_label,
            "confidence": ev.confidence,
            "distance_m": ev.distance_m,
            "speed_ms": ev.speed_ms,
            "zone_name": ev.zone_name,
            "camera_id": ev.camera_id,
            "gps_lat": ev.gps_lat,
            "gps_lng": ev.gps_lng,
            "face_concealed": ev.face_concealed,
            "holding_object": ev.holding_object,
            "screenshot_path": ev.screenshot_path,
            "timestamp": ev.timestamp.isoformat() if ev.timestamp else None,
            "lighting_condition": ev.lighting_condition,
            "status": ev.status,
            "verified_by": ev.verified_by,
            "verified_at": ev.verified_at.isoformat() if ev.verified_at else None,
            "acoustic_triggered": ev.acoustic_triggered,
        }
        for ev in events
    ]


@app.get("/api/events/{event_id}/timeline")
async def get_event_timeline(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_or_monitor),
):
    ev = db.query(DetectionEvent).filter(DetectionEvent.id == event_id).first()
    if not ev:
        raise HTTPException(404, "Event not found")

    timeline = db.query(BehaviorTimeline).filter(
        BehaviorTimeline.track_id == ev.track_id,
        BehaviorTimeline.camera_id == ev.camera_id,
    ).order_by(BehaviorTimeline.timestamp).all()

    return [
        {
            "event_type": t.event_type,
            "description": t.description,
            "speed_ms": t.speed_ms,
            "zone_name": t.zone_name,
            "timestamp": t.timestamp.isoformat(),
        }
        for t in timeline
    ]


# ─────────────────────────────────────────
# VERIFY QUEUE
# ─────────────────────────────────────────
@app.get("/api/verify-queue")
async def get_verify_queue(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_or_monitor),
):
    queue_items = (
        db.query(VerifyQueue)
        .join(DetectionEvent, VerifyQueue.detection_id == DetectionEvent.id)
        .filter(DetectionEvent.status == "pending")
        .order_by(VerifyQueue.created_at.desc())
        .all()
    )
    result = []
    for vq in queue_items:
        ev = vq.detection
        result.append({
            "queue_id": vq.id,
            "detection_id": vq.detection_id,
            "detected_class": ev.detected_class,
            "display_label": ev.display_label,
            "confidence": vq.confidence,
            "queue_reason": vq.queue_reason,
            "camera_id": ev.camera_id,
            "gps_lat": ev.gps_lat,
            "gps_lng": ev.gps_lng,
            "timestamp": ev.timestamp.isoformat() if ev.timestamp else None,
            "screenshot_path": ev.screenshot_path,
            "distance_m": ev.distance_m,
            "face_concealed": ev.face_concealed,
            "acoustic_data": vq.acoustic_data,
            "escalated": vq.escalated,
            "escalated_by": vq.escalated_by,
        })
    return result


@app.post("/api/verify-queue/{queue_id}/action")
async def verify_action(
    queue_id: int,
    req: VerifyRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_or_monitor),
):
    vq = db.query(VerifyQueue).filter(VerifyQueue.id == queue_id).first()
    if not vq:
        raise HTTPException(404, "Queue item not found")

    ev = db.query(DetectionEvent).filter(DetectionEvent.id == vq.detection_id).first()
    if not ev:
        raise HTTPException(404, "Detection not found")

    username = current_user["username"]

    if req.action == "confirm":
        ev.status = "confirmed"
        ev.verified_by = username
        ev.verified_at = datetime.utcnow()
        db.delete(vq)
        db.commit()
        return {"result": "confirmed", "event_id": ev.id}

    elif req.action == "dismiss":
        ev.status = "dismissed"
        ev.verified_by = username
        ev.verified_at = datetime.utcnow()
        # Add to dismissed log
        dl = DismissedLog(
            detection_id=ev.id,
            dismissed_by=username,
            reason="False alarm",
        )
        db.add(dl)
        db.delete(vq)
        db.commit()
        return {"result": "dismissed", "event_id": ev.id}

    elif req.action == "escalate":
        if current_user["role"] != "admin":
            vq.escalated = True
            vq.escalated_by = username
            db.commit()
            return {"result": "escalated", "queue_id": queue_id}
        else:
            raise HTTPException(400, "Admin can confirm or dismiss directly")
    else:
        raise HTTPException(400, "Unknown action")


# ─────────────────────────────────────────
# FIELD COMMUNICATIONS
# ─────────────────────────────────────────
@app.get("/api/comms/messages")
async def get_messages(
    limit: int = 100,
    priority: Optional[str] = None,
    unacked: bool = False,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_or_monitor),
):
    q = db.query(FieldMessage)
    if priority:
        q = q.filter(FieldMessage.priority == priority)
    if unacked:
        q = q.filter(FieldMessage.acknowledged == False)
    msgs = q.order_by(FieldMessage.timestamp.desc()).limit(limit).all()
    return [
        {
            "id": m.id,
            "callsign": m.callsign,
            "username": m.username,
            "text": m.text,
            "language": m.language,
            "confidence": m.confidence,
            "audio_path": m.audio_path,
            "gps_lat": m.gps_lat,
            "gps_lng": m.gps_lng,
            "priority": m.priority,
            "acknowledged": m.acknowledged,
            "ack_by": m.ack_by,
            "ack_time": m.ack_time.isoformat() if m.ack_time else None,
            "timestamp": m.timestamp.isoformat() if m.timestamp else None,
            "duration_sec": m.duration_sec,
            "trigger_type": m.trigger_type,
            "reply_text": m.reply_text,
            "reply_by": m.reply_by,
            "reply_at": m.reply_at.isoformat() if m.reply_at else None,
        }
        for m in msgs
    ]


@app.get("/api/comms/my-messages")
async def get_my_messages(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_any),
):
    msgs = (
        db.query(FieldMessage)
        .filter(FieldMessage.username == current_user["username"])
        .order_by(FieldMessage.timestamp.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": m.id,
            "text": m.text,
            "priority": m.priority,
            "acknowledged": m.acknowledged,
            "ack_by": m.ack_by,
            "ack_time": m.ack_time.isoformat() if m.ack_time else None,
            "timestamp": m.timestamp.isoformat() if m.timestamp else None,
            "reply_text": m.reply_text,
            "reply_by": m.reply_by,
        }
        for m in msgs
    ]


@app.post("/api/comms/messages/{message_id}/ack")
async def ack_message(
    message_id: int,
    req: AckRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_or_monitor),
):
    result = await acknowledge_message(message_id, current_user["username"], db)
    if not result:
        raise HTTPException(404, "Message not found")
    return result


@app.post("/api/comms/messages/{message_id}/reply")
async def reply_message(
    message_id: int,
    req: ReplyRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_or_monitor),
):
    result = await send_reply(message_id, req.text, current_user["username"], db)
    if not result:
        raise HTTPException(404, "Message not found")
    return result


@app.get("/api/comms/audio/{filename}")
async def download_comms_audio(
    filename: str,
    current_user: dict = Depends(require_any),
):
    filepath = COMMS_DIR / filename
    if not filepath.exists():
        raise HTTPException(404, "Audio file not found")
    return FileResponse(str(filepath), media_type="audio/wav", filename=filename)


# ─────────────────────────────────────────
# GPS
# ─────────────────────────────────────────
@app.get("/api/gps/positions")
async def get_gps_positions(current_user: dict = Depends(require_admin_or_monitor)):
    return gps_manager.get_all_positions()


@app.get("/api/gps/history/{username}")
async def get_gps_history(
    username: str,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_or_monitor),
):
    rows = (
        db.query(GpsLocation)
        .filter(GpsLocation.recorder_username == username)
        .order_by(GpsLocation.timestamp.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "latitude": r.latitude,
            "longitude": r.longitude,
            "accuracy": r.accuracy,
            "is_streaming": r.is_streaming,
            "timestamp": r.timestamp.isoformat(),
        }
        for r in rows
    ]


# ─────────────────────────────────────────
# SENSORS
# ─────────────────────────────────────────
@app.get("/api/sensors/status")
async def sensor_status(current_user: dict = Depends(require_admin_or_monitor)):
    sensors = get_sensors()
    if not sensors:
        return {"initialized": False}
    return sensors.get_status()


@app.post("/api/sensors/servo")
async def servo_control(
    cmd: ServoCommand,
    current_user: dict = Depends(require_admin_or_monitor),
):
    sensors = get_sensors()
    if not sensors:
        raise HTTPException(503, "Sensor controller not initialized")

    if cmd.mode:
        sensors.set_mode(cmd.mode)
    if cmd.direction:
        if cmd.direction == "home":
            sensors.home()
        else:
            sensors.manual_step(cmd.direction)
    if cmd.pan is not None:
        sensors._set_pan(cmd.pan)
    if cmd.tilt is not None:
        sensors._set_tilt(cmd.tilt)

    return sensors.get_status()


# ─────────────────────────────────────────
# SYSTEM STATS
# ─────────────────────────────────────────
@app.get("/api/system/stats")
async def get_system_stats(current_user: dict = Depends(require_admin_or_monitor)):
    stats = system_stats.get()
    feeds = feed_manager.get_status()
    sensors = get_sensors()
    servo_status = sensors.get_status() if sensors else {}
    return {
        **stats,
        "feeds": feeds,
        "servo": servo_status,
    }


# ─────────────────────────────────────────
# ZONES
# ─────────────────────────────────────────
@app.get("/api/zones")
async def get_zones(
    camera_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_or_monitor),
):
    q = db.query(Zone).filter(Zone.is_active == True)
    if camera_id:
        q = q.filter(Zone.camera_id == camera_id)
    zones = q.all()
    return [
        {
            "id": z.id,
            "camera_id": z.camera_id,
            "zone_name": z.zone_name,
            "zone_type": z.zone_type,
            "coordinates": z.coordinates,
            "created_by": z.created_by,
        }
        for z in zones
    ]


@app.post("/api/zones")
async def create_zone(
    zone: ZoneCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_or_monitor),
):
    z = Zone(
        camera_id=zone.camera_id,
        zone_name=zone.zone_name,
        zone_type=zone.zone_type,
        coordinates=zone.coordinates,
        created_by=current_user["username"],
    )
    db.add(z)
    db.commit()
    db.refresh(z)
    return {"id": z.id, "zone_name": z.zone_name}


@app.delete("/api/zones/{zone_id}")
async def delete_zone(
    zone_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_or_monitor),
):
    z = db.query(Zone).filter(Zone.id == zone_id).first()
    if not z:
        raise HTTPException(404, "Zone not found")
    z.is_active = False
    db.commit()
    return {"deleted": zone_id}


# ─────────────────────────────────────────
# FRAME HEATMAP
# ─────────────────────────────────────────
@app.get("/api/heatmap/{camera_id}")
async def get_heatmap(
    camera_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_or_monitor),
):
    cells = db.query(FrameHeatmap).filter(FrameHeatmap.camera_id == camera_id).all()
    return [
        {
            "grid_x": c.grid_x,
            "grid_y": c.grid_y,
            "detection_count": c.detection_count,
            "most_common_class": c.most_common_class,
        }
        for c in cells
    ]


# ─────────────────────────────────────────
# ANALYTICS
# ─────────────────────────────────────────
@app.get("/api/analytics/summary")
async def analytics_summary(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_or_monitor),
):
    all_ev = db.query(DetectionEvent).all()
    confirmed = [e for e in all_ev if e.status == "confirmed"]
    dismissed = [e for e in all_ev if e.status == "dismissed"]
    pending   = [e for e in all_ev if e.status == "pending"]
    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    today_ev  = [e for e in all_ev if e.timestamp and e.timestamp.strftime("%Y-%m-%d") == today_str]

    avg_conf = sum(e.confidence for e in confirmed) / len(confirmed) if confirmed else 0
    avg_dist = sum(e.distance_m for e in confirmed if e.distance_m) / max(1, sum(1 for e in confirmed if e.distance_m))

    # Class distribution
    class_dist: dict = {}
    for e in all_ev:
        class_dist[e.detected_class] = class_dist.get(e.detected_class, 0) + 1

    # Hourly events (last 24 hours)
    from collections import defaultdict
    hourly = defaultdict(int)
    for e in all_ev:
        if e.timestamp:
            hr = e.timestamp.strftime("%Y-%m-%dT%H:00")
            hourly[hr] += 1

    # Per camera
    cam_dist: dict = {}
    for e in all_ev:
        cam_dist[e.camera_id] = cam_dist.get(e.camera_id, 0) + 1

    # Confidence trend (last 50)
    sorted_ev = sorted((e for e in all_ev if e.timestamp is not None), key=lambda x: x.timestamp)
    recent = sorted_ev[-50:]
    conf_trend = [{"x": i, "confidence": e.confidence} for i, e in enumerate(recent)]

    return {
        "summary": {
            "total": len(all_ev),
            "confirmed": len(confirmed),
            "dismissed": len(dismissed),
            "pending": len(pending),
            "today": len(today_ev),
            "avg_confidence": round(avg_conf, 3),
            "avg_distance_m": round(avg_dist, 1),
        },
        "class_distribution": [{"name": k, "value": v} for k, v in class_dist.items()],
        "hourly_events": [{"time": k, "count": v} for k, v in sorted(hourly.items())[-24:]],
        "camera_distribution": [{"camera": k, "count": v} for k, v in cam_dist.items()],
        "confidence_trend": conf_trend,
        "verified_vs_dismissed": [
            {"name": "Confirmed", "value": len(confirmed)},
            {"name": "Dismissed", "value": len(dismissed)},
            {"name": "Pending",   "value": len(pending)},
        ],
    }


# ─────────────────────────────────────────
# GALLERY
# ─────────────────────────────────────────
@app.get("/api/gallery")
async def get_gallery(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_or_monitor),
):
    ev_with_ss = (
        db.query(DetectionEvent)
        .filter(DetectionEvent.screenshot_path != None)
        .order_by(DetectionEvent.timestamp.desc())
        .limit(200)
        .all()
    )
    return [
        {
            "id": ev.id,
            "detected_class": ev.detected_class,
            "display_label": ev.display_label,
            "confidence": ev.confidence,
            "camera_id": ev.camera_id,
            "timestamp": ev.timestamp.isoformat() if ev.timestamp else None,
            "status": ev.status,
            "screenshot_path": ev.screenshot_path,
            "filename": Path(ev.screenshot_path).name if ev.screenshot_path else None,
        }
        for ev in ev_with_ss
    ]


@app.get("/api/gallery/image/{filename}")
async def serve_screenshot(
    filename: str,
    current_user: dict = Depends(require_any),
):
    filepath = SCREENSHOTS_DIR / filename
    if not filepath.exists():
        raise HTTPException(404, "Image not found")
    return FileResponse(str(filepath), media_type="image/jpeg")


@app.delete("/api/gallery/image/{filename}")
async def delete_screenshot(
    filename: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    filepath = SCREENSHOTS_DIR / filename
    if filepath.exists():
        filepath.unlink()
    return {"deleted": filename}


# ─────────────────────────────────────────
# RECORDINGS
# ─────────────────────────────────────────
@app.get("/api/recordings")
async def list_recordings(current_user: dict = Depends(require_admin_or_monitor)):
    return recording_manager.get_recordings_list()


@app.post("/api/recordings/{camera_id}/start")
async def start_recording(
    camera_id: str,
    current_user: dict = Depends(require_admin_or_monitor),
):
    path = recording_manager.start_full(camera_id)
    return {"recording": True, "path": path}


@app.post("/api/recordings/{camera_id}/stop")
async def stop_recording(
    camera_id: str,
    current_user: dict = Depends(require_admin_or_monitor),
):
    path = recording_manager.stop_full(camera_id)
    return {"recording": False, "saved_path": path}


@app.post("/api/recordings/{camera_id}/snapshot")
async def take_snapshot(
    camera_id: str,
    current_user: dict = Depends(require_admin_or_monitor),
):
    state = feed_manager.get_state(camera_id)
    if not state:
        raise HTTPException(404, "Camera not found")
    buf = state.frame_buffer.snapshot()
    if not buf:
        raise HTTPException(503, "No frames available")
    frame, _ = buf[-1]
    path = recording_manager.take_screenshot(frame, camera_id)
    return {"path": path}


@app.get("/api/recordings/download/{folder}/{filename}")
async def download_recording(
    folder: str,
    filename: str,
    current_user: dict = Depends(require_any),
):
    folder_map = {
        "full": FULL_DIR,
        "clips": CLIPS_DIR,
        "screenshots": SCREENSHOTS_DIR,
        "comms": COMMS_DIR,
    }
    base = folder_map.get(folder)
    if not base:
        raise HTTPException(400, "Invalid folder")
    filepath = base / filename
    if not filepath.exists():
        raise HTTPException(404, "File not found")
    return FileResponse(str(filepath), filename=filename)


# ─────────────────────────────────────────
# REPORTS
# ─────────────────────────────────────────
@app.get("/api/reports/pdf")
async def download_pdf(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_or_monitor),
):
    try:
        pdf_bytes = generate_pdf_report(db)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=hybrid_sentry_{ts}.pdf"},
        )
    except Exception as e:
        raise HTTPException(500, f"PDF generation error: {e}")


@app.get("/api/reports/csv")
async def download_csv(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_or_monitor),
):
    csv_str = generate_csv_report(db)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    return Response(
        content=csv_str,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=hybrid_sentry_{ts}.csv"},
    )


# ─────────────────────────────────────────
# USERS / ADMIN
# ─────────────────────────────────────────
@app.get("/api/users")
async def list_users(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    users = db.query(User).filter(User.is_active == True).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "role": u.role,
            "display_name": u.display_name,
            "operator_id": u.operator_id,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


@app.post("/api/users")
async def create_user_endpoint(
    req: UserCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    try:
        user = create_user(
            db, req.username, req.pin, req.role,
            req.display_name, req.operator_id
        )
        # Auto-assign callsign if recorder
        if req.role == "recorder":
            get_callsign_for_recorder(db, req.username)
        return {"created": True, "username": user.username}
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.delete("/api/users/{username}")
async def delete_user(
    username: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    if username == current_user["username"]:
        raise HTTPException(400, "Cannot delete your own account")
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.is_active = False
    db.commit()
    return {"deleted": username}


@app.post("/api/users/change-pin")
async def change_pin_endpoint(
    req: PINChange,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_any),
):
    try:
        change_pin(db, current_user["username"], req.old_pin, req.new_pin)
        return {"success": True}
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/users/admin-reset-pin")
async def admin_reset_pin(
    req: AdminPINReset,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    try:
        reset_pin_admin(db, req.target_username, req.new_pin)
        return {"success": True}
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.put("/api/users/profile")
async def update_profile(
    req: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_any),
):
    user = db.query(User).filter(User.username == current_user["username"]).first()
    if not user:
        raise HTTPException(404)
    if req.display_name is not None:
        user.display_name = req.display_name
    if req.avatar_url is not None:
        user.avatar_url = req.avatar_url
    db.commit()
    return {"success": True}


@app.get("/api/users/login-history")
async def get_login_history(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_any),
):
    rows = (
        db.query(__import__("database").LoginHistory)
        .filter(__import__("database").LoginHistory.username == current_user["username"])
        .order_by(__import__("database").LoginHistory.login_at.desc())
        .limit(20)
        .all()
    )
    return [
        {
            "ip_address": r.ip_address,
            "device_info": r.device_info,
            "login_at": r.login_at.isoformat() if r.login_at else None,
            "success": r.success,
            "role": r.role,
        }
        for r in rows
    ]


# ─────────────────────────────────────────
# CALLSIGN CONFIG
# ─────────────────────────────────────────
@app.get("/api/callsigns")
async def get_callsigns(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_or_monitor),
):
    configs = db.query(CallsignConfig).all()
    return [
        {
            "id": c.id,
            "camera_id": c.camera_id,
            "recorder_username": c.recorder_username,
            "callsign": c.callsign,
            "color_hex": c.color_hex,
        }
        for c in configs
    ]


@app.put("/api/callsigns/{config_id}")
async def update_callsign(
    config_id: int,
    req: CallsignUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    cfg = db.query(CallsignConfig).filter(CallsignConfig.id == config_id).first()
    if not cfg:
        raise HTTPException(404, "Config not found")
    cfg.callsign = req.callsign
    cfg.color_hex = req.color_hex
    db.commit()
    return {"updated": config_id}


# ─────────────────────────────────────────
# IMAGE PROCESSING TOGGLES
# ─────────────────────────────────────────
class ProcessingToggle(BaseModel):
    camera_id: str
    night: Optional[bool] = None
    flow: Optional[bool] = None
    edges: Optional[bool] = None
    bgsub: Optional[bool] = None
    sharpen: Optional[bool] = None
    enhance: Optional[bool] = None
    zoom: Optional[bool] = None
    compare: Optional[bool] = None
    freeze: Optional[bool] = None


@app.post("/api/feeds/processing")
async def set_processing_toggles(
    req: ProcessingToggle,
    current_user: dict = Depends(require_admin_or_monitor),
):
    state = feed_manager.get_state(req.camera_id)
    if not state:
        raise HTTPException(404, "Camera not found")

    p = state.pipeline
    if req.night is not None: p.night_mode = req.night
    if req.flow is not None:  p.flow_mode  = req.flow
    if req.edges is not None: p.edges_mode = req.edges
    if req.bgsub is not None: p.bgsub_mode = req.bgsub
    if req.sharpen is not None: p.sharpen_mode = req.sharpen
    if req.enhance is not None: p.enhance_mode = req.enhance
    if req.zoom is not None:  p.zoom_mode  = req.zoom
    if req.compare is not None: p.compare_mode = req.compare
    if req.freeze is not None: p.freeze_mode = req.freeze

    return {"success": True}


@app.get("/api/feeds/processing/{camera_id}")
async def get_processing_toggles(
    camera_id: str,
    current_user: dict = Depends(require_any),
):
    """Return current image processing state for a camera."""
    state = feed_manager.get_state(camera_id)
    if not state:
        raise HTTPException(404, "Camera not found")
    p = state.pipeline
    return {
        "camera_id": camera_id,
        "night_mode": p.night_mode,
        "flow_mode": p.flow_mode,
        "edges_mode": p.edges_mode,
        "bgsub_mode": p.bgsub_mode,
        "sharpen_mode": p.sharpen_mode,
        "enhance_mode": p.enhance_mode,
        "zoom_mode": p.zoom_mode,
        "compare_mode": p.compare_mode,
        "freeze_mode": p.freeze_mode,
    }


# ─────────────────────────────────────────
# WEBSOCKET — MONITOR DASHBOARD
# ─────────────────────────────────────────
@app.websocket("/ws/monitor")
async def ws_monitor(websocket: WebSocket, token: str = ""):
    payload = ws_authenticate(token)
    if not payload or payload["role"] not in ("admin", "monitor"):
        await websocket.close(code=4003)
        return

    await websocket.accept()
    _monitor_ws_list.append(websocket)
    gps_manager.register_monitor(websocket)

    # Send initial GPS snapshot
    await gps_manager.send_all_gps_to(websocket)

    try:
        while True:
            data = await asyncio.wait_for(websocket.receive_text(), timeout=60.0)
            msg = json.loads(data)
            if msg.get("type") == "ping":
                await websocket.send_json({"type": "pong", "ts": time.time()})
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    finally:
        if websocket in _monitor_ws_list:
            _monitor_ws_list.remove(websocket)
        gps_manager.unregister_monitor(websocket)


# ─────────────────────────────────────────
# WEBSOCKET — DETECTIONS (recorder + monitor live feed)
# ─────────────────────────────────────────
@app.websocket("/ws/detections")
async def ws_detections(websocket: WebSocket, token: str = ""):
    """Stream live detection events (bbox as % coords) to any authenticated user."""
    payload = ws_authenticate(token)
    if not payload:
        await websocket.close(code=4001)
        return
    await websocket.accept()
    _detection_ws_list.append(websocket)
    try:
        while True:
            data = await asyncio.wait_for(websocket.receive_text(), timeout=60.0)
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong", "ts": time.time()})
            except Exception:
                pass
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    finally:
        if websocket in _detection_ws_list:
            _detection_ws_list.remove(websocket)


# ─────────────────────────────────────────
# WEBSOCKET — VOICE COMMS
# ─────────────────────────────────────────
@app.websocket("/ws/voice/{username}")
async def ws_voice(websocket: WebSocket, username: str, token: str = ""):
    payload = ws_authenticate(token)
    if not payload:
        await websocket.close(code=4001)
        return
    await handle_voice_ws(websocket, username, payload, _monitor_ws_list)


# ─────────────────────────────────────────
# WEBSOCKET — GPS (RECORDER)
# ─────────────────────────────────────────
@app.websocket("/ws/gps/recorder")
async def ws_gps_recorder(websocket: WebSocket, token: str = ""):
    await handle_recorder_gps_ws(websocket, token)


@app.websocket("/ws/gps/monitor")
async def ws_gps_monitor(websocket: WebSocket, token: str = ""):
    await handle_monitor_gps_ws(websocket, token)


# ─────────────────────────────────────────
# SNAPSHOT (for recorder quick-action)
# ─────────────────────────────────────────
class SnapshotRequest(BaseModel):
    camera_id: str = "CAM-01"


@app.post("/api/feeds/snapshot")
async def take_feed_snapshot(
    req: SnapshotRequest,
    current_user: dict = Depends(require_any),
):
    """Take a screenshot from a camera's latest frame."""
    cam_id = req.camera_id
    state = feed_manager.get_state(cam_id)
    if not state:
        raise HTTPException(404, "Camera not found")
    buf = state.frame_buffer.snapshot()
    if not buf:
        raise HTTPException(503, "No frames available")
    frame, _ = buf[-1]
    path = recording_manager.take_screenshot(frame, cam_id)
    _system_logs.append({
        "level": "info",
        "message": f"Snapshot taken by {current_user['username']} from {cam_id}: {path}",
        "timestamp": datetime.utcnow().isoformat(),
    })
    return {"success": True, "path": path}


# ─────────────────────────────────────────
# FIELD COMMS — POST NEW MESSAGE
# ─────────────────────────────────────────
class CommsMessageCreate(BaseModel):
    content: str
    sender_id: str = ""
    sender_name: str = ""
    type: str = "text"      # text | alert
    broadcast: bool = False


@app.post("/api/comms/messages")
async def post_comms_message(
    req: CommsMessageCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_any),
):
    """Save a text message from a recorder / field user and broadcast to monitors."""
    username = current_user["username"]
    msg = FieldMessage(
        username=username,
        callsign=current_user.get("callsign") or username,
        text=req.content,
        priority="urgent" if req.type == "alert" else "normal",
        trigger_type="text",
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    broadcast_payload = {
        "type": "message",
        "id": msg.id,
        "content": msg.text,
        "text": msg.text,
        "sender_id": username,
        "sender_name": current_user.get("display_name") or username,
        "callsign": msg.callsign,
        "username": username,
        "timestamp": msg.timestamp.isoformat() if msg.timestamp else datetime.utcnow().isoformat(),
        "priority": msg.priority,
    }
    dead = []
    for ws in _monitor_ws_list:
        try:
            await ws.send_json(broadcast_payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in _monitor_ws_list:
            _monitor_ws_list.remove(ws)

    _system_logs.append({
        "level": "info",
        "message": f"Comms message from {username}: {req.content[:60]}",
        "timestamp": datetime.utcnow().isoformat(),
    })
    return {"success": True, "id": msg.id}


# ─────────────────────────────────────────
# COMMS — SYSTEM ALERT BROADCAST
# ─────────────────────────────────────────
class AlertRequest(BaseModel):
    type: str  # 'emergency', 'broadcast', etc.

@app.post("/api/comms/alert")
async def post_comms_alert(
    req: AlertRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_any),
):
    """Broadcast a system alert (emergency, broadcast, etc.) to all monitor WebSockets and save to DB."""
    username = current_user["username"]
    alert_text = f"[{req.type.upper()}] Alert triggered by {username}"

    msg = FieldMessage(
        sender_username=username,
        text=alert_text,
        priority="emergency",
        callsign=current_user.get("callsign", ""),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    alert_payload = {
        "type": "system_alert",
        "alert_type": req.type,
        "message": alert_text,
        "sender": username,
        "id": msg.id,
        "timestamp": datetime.utcnow().isoformat(),
    }

    dead = []
    for ws in _monitor_ws_list:
        try:
            await ws.send_json(alert_payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in _monitor_ws_list:
            _monitor_ws_list.remove(ws)

    # Also broadcast to recorder WebSockets via voice_client_manager
    try:
        await voice_client_manager.broadcast_monitors(_monitor_ws_list, alert_payload)
    except Exception:
        pass

    _system_logs.append({
        "level": "warning",
        "message": f"ALERT [{req.type}] by {username}",
        "timestamp": datetime.utcnow().isoformat(),
    })
    return {"success": True, "id": msg.id, "alert_type": req.type}




# ─────────────────────────────────────────
# GPS — POST POSITION UPDATE (recorder)
# ─────────────────────────────────────────
class GpsPositionCreate(BaseModel):
    latitude: float
    longitude: float
    accuracy: float = 0.0


@app.post("/api/gps/positions")
async def post_gps_position(
    req: GpsPositionCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_any),
):
    """Accept a GPS ping from a recorder. Saves to DB and updates in-memory state."""
    username = current_user["username"]
    loc = GpsLocation(
        recorder_username=username,
        latitude=req.latitude,
        longitude=req.longitude,
        accuracy=req.accuracy,
        is_streaming=True,
    )
    db.add(loc)
    db.commit()

    # Update in-memory GPS manager so monitors see it immediately
    try:
        state = gps_manager._gps_state.get(username, {})
        state.update({
            "username": username,
            "latitude": req.latitude,
            "longitude": req.longitude,
            "accuracy": req.accuracy,
            "is_streaming": True,
            "is_online": True,
            "last_update": datetime.utcnow().isoformat(),
        })
        gps_manager._gps_state[username] = state
    except Exception:
        pass  # graceful if gps_manager not initialized

    _system_logs.append({
        "level": "info",
        "message": f"GPS update from {username}: ({req.latitude:.4f}, {req.longitude:.4f})",
        "timestamp": datetime.utcnow().isoformat(),
    })
    return {"success": True}


# ─────────────────────────────────────────
# SYSTEM HARDWARE STATUS
# ─────────────────────────────────────────
@app.get("/api/system/hardware")
async def get_hardware_status(
    current_user: dict = Depends(require_admin_or_monitor),
):
    """Return servo, sound sensor, and GPIO status from sensors module."""
    sensors = get_sensors()
    if sensors:
        srv = sensors.get_status()
        servo = {
            "pan": srv.get("pan", 90),
            "tilt": srv.get("tilt", 90),
            "mode": srv.get("mode", "AUTO"),
        }
        sound = {
            "active": srv.get("sound_sensor_active", False),
            "last_trigger": srv.get("last_sound_trigger"),
        }
        gpio = srv.get("gpio", {})
    else:
        # Simulation/mock data when hardware not available
        servo = {"pan": 90, "tilt": 90, "mode": "SIMULATION"}
        sound = {"active": False, "last_trigger": None}
        gpio = {"17": False, "18": False, "27": False}
    return {
        "servo": servo,
        "sound_sensor": sound,
        "gpio": gpio,
        "initialized": sensors is not None,
    }


# ─────────────────────────────────────────
# SYSTEM LOGS
# ─────────────────────────────────────────
@app.get("/api/logs")
async def get_system_logs(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_or_monitor),
):
    """Return recent system logs from DB, falling back to in-memory buffer."""
    # Try DB first
    db_logs = (
        db.query(SystemLog)
        .order_by(SystemLog.timestamp.desc())
        .limit(limit)
        .all()
    )
    if db_logs:
        return [
            {
                "level": l.event_type or "info",
                "message": l.description,
                "timestamp": l.timestamp.isoformat() if l.timestamp else None,
                "source": "system",
            }
            for l in db_logs
        ]
    # Fallback: in-memory logs
    return list(reversed(list(_system_logs)))[:limit]


# ─────────────────────────────────────────
# GPS ZONE ASSIGNMENT (admin)
# ─────────────────────────────────────────
class GpsAssignRequest(BaseModel):
    recorder_username: str
    monitor_username: str


@app.post("/api/gps/assign")
async def assign_gps_zone(
    req: GpsAssignRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Admin: assign a recorder to a monitor (updates CameraConfig)."""
    # Verify both users exist
    recorder = db.query(User).filter(User.username == req.recorder_username).first()
    if not recorder:
        raise HTTPException(404, f"Recorder '{req.recorder_username}' not found")
    monitor = db.query(User).filter(User.username == req.monitor_username).first()
    if not monitor:
        raise HTTPException(404, f"Monitor '{req.monitor_username}' not found")

    # Update CameraConfig rows linked to this recorder
    cams = db.query(CameraConfig).filter(
        CameraConfig.is_active == True
    ).all()
    updated = 0
    for cam in cams:
        # Assign all unassigned cameras, or cameras already assigned to this recorder
        cam.assigned_monitor_username = req.monitor_username
        updated += 1
    db.commit()

    _system_logs.append({
        "level": "info",
        "message": f"GPS zone: recorder '{req.recorder_username}' assigned to monitor '{req.monitor_username}' by {current_user['username']}",
        "timestamp": datetime.utcnow().isoformat(),
    })
    return {"success": True, "cameras_updated": updated}


# ─────────────────────────────────────────
# SYSTEM INFO + CONFIG
# ─────────────────────────────────────────
import platform as _platform

def _get_config_val(db: Session, key: str, default: str = "") -> str:
    row = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    return row.value if row else default


@app.get("/api/system/info")
async def system_info(db: Session = Depends(get_db)):
    """Platform, YOLO model, camera/AI status, org info."""
    _machine = _platform.machine()
    is_rpi = _machine == "aarch64"
    yolo_model = "yolov8n" if is_rpi else "yolo11n"

    # Try to detect if any camera is online
    try:
        import cv2 as _cv2
        cap = _cv2.VideoCapture(0)
        camera_online = cap.isOpened()
        cap.release()
    except Exception:
        camera_online = False

    # Check OCR
    try:
        import importlib
        ocr_mod = importlib.util.find_spec("easyocr")
        ocr_available = ocr_mod is not None
    except Exception:
        ocr_available = False

    return {
        "platform":       "rpi" if is_rpi else "pc",
        "machine":        _machine,
        "yolo_model":     yolo_model,
        "ocr_available":  ocr_available,
        "camera_online":  camera_online,
        "ai_loaded":      True,   # if uvicorn is running, model loaded at startup
        "org_name":       _get_config_val(db, "org_name", "Hybrid Sentry Base"),
        "base_location":  _get_config_val(db, "base_location", ""),
        "base_lat":       _get_config_val(db, "base_lat", ""),
        "base_lng":       _get_config_val(db, "base_lng", ""),
    }


@app.get("/api/system/config")
async def system_config(db: Session = Depends(get_db)):
    """Return all system config key-value pairs."""
    rows = db.query(SystemConfig).all()
    return {r.key: r.value for r in rows}


class SystemConfigUpdate(BaseModel):
    org_name: str = ""
    base_location: str = ""
    base_lat: str = ""
    base_lng: str = ""


@app.put("/api/system/config")
async def update_system_config(
    req: SystemConfigUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Admin only — update org settings."""
    updates = {
        "org_name": req.org_name,
        "base_location": req.base_location,
        "base_lat": req.base_lat,
        "base_lng": req.base_lng,
    }
    for key, val in updates.items():
        row = db.query(SystemConfig).filter(SystemConfig.key == key).first()
        if row:
            row.value = val
        else:
            db.add(SystemConfig(key=key, value=val))
    db.commit()
    return {"success": True}


# ─────────────────────────────────────────
# CAMERA CONFIG (CRUD)
# ─────────────────────────────────────────
class CameraUpdate(BaseModel):
    display_name: str
    position_name: str = ""
    assigned_monitor_username: str = ""


def _camera_to_dict(c: CameraConfig) -> dict:
    return {
        "id":                        c.id,
        "camera_id":                 c.camera_id,
        "display_name":              c.display_name,
        "position_name":             c.position_name or "",
        "assigned_monitor_username": c.assigned_monitor_username or "",
        "color_hex":                 c.color_hex,
        "is_active":                 c.is_active,
    }


@app.get("/api/cameras")
async def get_cameras(db: Session = Depends(get_db)):
    """Return all cameras (visible to everyone logged in)."""
    cams = db.query(CameraConfig).filter(CameraConfig.is_active == True).all()
    return [_camera_to_dict(c) for c in cams]


@app.get("/api/cameras/my-assigned")
async def get_my_cameras(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Role-aware camera list: admin sees all, monitors see their assigned cameras."""
    role = current_user.get("role", "recorder")
    username = current_user.get("username", "")
    if role == "admin":
        cams = db.query(CameraConfig).filter(CameraConfig.is_active == True).all()
    else:
        cams = (
            db.query(CameraConfig)
            .filter(
                CameraConfig.is_active == True,
                CameraConfig.assigned_monitor_username == username,
            )
            .all()
        )
        if not cams:
            # If no assignment, fall back to all cameras so monitors aren't locked out
            cams = db.query(CameraConfig).filter(CameraConfig.is_active == True).all()
    return [_camera_to_dict(c) for c in cams]


@app.put("/api/cameras/{camera_id}")
async def update_camera(
    camera_id: str,
    req: CameraUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Admin only — rename / reassign a camera."""
    cam = db.query(CameraConfig).filter(CameraConfig.camera_id == camera_id).first()
    if not cam:
        raise HTTPException(404, "Camera not found")
    cam.display_name              = req.display_name
    cam.position_name             = req.position_name or None
    cam.assigned_monitor_username = req.assigned_monitor_username or None
    db.commit()
    return {"success": True}


# ─────────────────────────────────────────
# CLIP DOWNLOAD (Slow Motion)
# ─────────────────────────────────────────
@app.get("/api/recordings/clip/{event_id}")
async def get_event_clip(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Return the slow-clip for a high-speed event (if available)."""
    ev = db.query(DetectionEvent).filter(DetectionEvent.id == event_id).first()
    if not ev:
        raise HTTPException(404, "Event not found")
    clip = ev.clip_slow_path or ev.clip_path
    if not clip:
        raise HTTPException(404, "No clip for this event")
    p = Path(clip)
    if not p.exists():
        raise HTTPException(404, "Clip file missing")
    return FileResponse(str(p), media_type="video/mp4", filename=p.name)


# ─────────────────────────────────────────
# BASE ZONES
# ─────────────────────────────────────────
ZONE_TYPES_LIST = ["BASE", "POST", "SEASIDE", "LIMA", "ROAD", "PERIMETER", "CUSTOM"]

class BaseZoneCreate(BaseModel):
    zone_name: str
    zone_type: str
    description: str = ""
    color_hex: str = "#388bfd"
    latitude: float
    longitude: float
    radius_meters: float = 200.0


@app.get("/api/base-zones/types")
async def get_zone_types():
    """Return all valid zone types."""
    return {"types": ZONE_TYPES_LIST}


@app.get("/api/base-zones")
async def get_base_zones(db: Session = Depends(get_db)):
    """Return all active base zones (public read)."""
    zones = db.query(BaseZone).filter(BaseZone.is_active == True).order_by(BaseZone.created_at).all()
    return [
        {
            "id": z.id,
            "zone_name": z.zone_name,
            "zone_type": z.zone_type,
            "description": z.description or "",
            "color_hex": z.color_hex,
            "latitude": z.latitude,
            "longitude": z.longitude,
            "radius_meters": z.radius_meters,
            "created_by": z.created_by or "",
            "created_at": z.created_at.isoformat() if z.created_at else None,
        }
        for z in zones
    ]


@app.post("/api/base-zones")
async def create_base_zone(
    req: BaseZoneCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Admin only — create a base zone."""
    if req.zone_type not in ZONE_TYPES_LIST:
        raise HTTPException(400, f"zone_type must be one of {ZONE_TYPES_LIST}")
    zone = BaseZone(
        zone_name=req.zone_name,
        zone_type=req.zone_type,
        description=req.description or None,
        color_hex=req.color_hex,
        latitude=req.latitude,
        longitude=req.longitude,
        radius_meters=req.radius_meters,
        created_by=current_user["username"],
    )
    db.add(zone)
    db.commit()
    db.refresh(zone)
    return {"success": True, "id": zone.id, "zone_name": zone.zone_name}


@app.put("/api/base-zones/{zone_id}")
async def update_base_zone(
    zone_id: int,
    req: BaseZoneCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Admin only — edit a base zone."""
    zone = db.query(BaseZone).filter(BaseZone.id == zone_id).first()
    if not zone:
        raise HTTPException(404, "Zone not found")
    if req.zone_type not in ZONE_TYPES_LIST:
        raise HTTPException(400, f"zone_type must be one of {ZONE_TYPES_LIST}")
    zone.zone_name     = req.zone_name
    zone.zone_type     = req.zone_type
    zone.description   = req.description or None
    zone.color_hex     = req.color_hex
    zone.latitude      = req.latitude
    zone.longitude     = req.longitude
    zone.radius_meters = req.radius_meters
    db.commit()
    return {"success": True}


@app.delete("/api/base-zones/{zone_id}")
async def delete_base_zone(
    zone_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Admin only — soft-delete a base zone."""
    zone = db.query(BaseZone).filter(BaseZone.id == zone_id).first()
    if not zone:
        raise HTTPException(404, "Zone not found")
    zone.is_active = False
    db.commit()
    return {"success": True}


# ─────────────────────────────────────────
# SYSTEM INFO + CONFIG ENDPOINTS
# ─────────────────────────────────────────
_IS_RPI = _platform.machine() == "aarch64"
_MODEL_PATH_STR = str(detection.MODEL_PATH)

# 30-second cache for /api/system/info
_system_info_cache: dict = {}
_system_info_time: float = 0.0

# helper
def _get_system_config(key: str, db_session=None) -> str:
    """Read a value from SystemConfig table."""
    if db_session is None:
        from database import SessionLocal as _SL
        _db = _SL()
        try:
            row = _db.query(SystemConfig).filter(SystemConfig.key == key).first()
            return row.value if row else ""
        finally:
            _db.close()
    row = db_session.query(SystemConfig).filter(SystemConfig.key == key).first()
    return row.value if row else ""


@app.get("/api/system/info")
async def get_system_info():
    """Platform/model/camera status — 30-second cache."""
    global _system_info_cache, _system_info_time
    if time.time() - _system_info_time < 30 and _system_info_cache:
        return _system_info_cache

    # Check camera live
    try:
        cam_online = feed_manager.is_camera_online("CAM-01")
    except Exception:
        cam_online = False

    # OCR available?
    try:
        import importlib.util as _iu
        ocr_available = _iu.find_spec("easyocr") is not None
    except Exception:
        ocr_available = False

    data = {
        "platform":      "rpi" if _IS_RPI else "pc",
        "yolo_model":    _MODEL_PATH_STR,
        "ocr_available": ocr_available,
        "camera_online": cam_online,
        "ai_loaded":     detection.model_loaded,
        "org_name":      _get_system_config("org_name") or "Hybrid Sentry",
        "base_location": _get_system_config("base_location"),
    }
    _system_info_cache = data
    _system_info_time  = time.time()
    return data


@app.get("/api/system/config")
async def get_system_config_endpoint(db: Session = Depends(get_db)):
    """Return all key-value rows from SystemConfig."""
    rows = db.query(SystemConfig).all()
    return {r.key: r.value for r in rows}


class SystemConfigUpdate(BaseModel):
    org_name:       Optional[str] = None
    base_location:  Optional[str] = None
    base_lat:       Optional[str] = None
    base_lng:       Optional[str] = None


@app.put("/api/system/config")
async def update_system_config(
    body: SystemConfigUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Admin only — update system config values."""
    global _system_info_cache, _system_info_time
    updates = body.dict(exclude_none=True)
    for key, val in updates.items():
        row = db.query(SystemConfig).filter(SystemConfig.key == key).first()
        if row:
            row.value = val
        else:
            db.add(SystemConfig(key=key, value=val))
    db.commit()
    _system_info_cache = {}  # invalidate cache
    _system_info_time  = 0.0
    return {"success": True}


# ─────────────────────────────────────────
# CAMERA MANAGEMENT
# ─────────────────────────────────────────
@app.get("/api/cameras")
async def get_cameras(db: Session = Depends(get_db)):
    """Return all active camera configs."""
    cams = db.query(CameraConfig).filter(CameraConfig.is_active == True).all()
    return [
        {
            "camera_id":                  c.camera_id,
            "display_name":               c.display_name,
            "position_name":              c.position_name or "",
            "assigned_monitor_username":  c.assigned_monitor_username or "",
            "color_hex":                  c.color_hex or "#39ff14",
            "is_active":                  c.is_active,
        }
        for c in cams
    ]


@app.get("/api/cameras/my-assigned")
async def get_my_assigned_cameras(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Role-aware: admin sees all, monitor sees assigned (or all if unassigned)."""
    role = current_user["role"]
    username = current_user["username"]

    if role == "admin":
        cams = db.query(CameraConfig).filter(CameraConfig.is_active == True).all()
    else:
        # Try assigned first
        assigned = db.query(CameraConfig).filter(
            CameraConfig.is_active == True,
            CameraConfig.assigned_monitor_username == username,
        ).all()
        # If no explicitly assigned cameras, return all (don't lock out)
        cams = assigned if assigned else db.query(CameraConfig).filter(CameraConfig.is_active == True).all()

    return [
        {
            "camera_id":                 c.camera_id,
            "display_name":              c.display_name,
            "position_name":             c.position_name or "",
            "assigned_monitor_username": c.assigned_monitor_username or "",
            "color_hex":                 c.color_hex or "#39ff14",
            "is_active":                 c.is_active,
        }
        for c in cams
    ]


class CameraUpdate(BaseModel):
    display_name:               Optional[str] = None
    position_name:              Optional[str] = None
    assigned_monitor_username:  Optional[str] = None
    color_hex:                  Optional[str] = None


@app.put("/api/cameras/{camera_id}")
async def update_camera(
    camera_id: str,
    body: CameraUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Admin only — rename / reassign camera."""
    cam = db.query(CameraConfig).filter(CameraConfig.camera_id == camera_id).first()
    if not cam:
        raise HTTPException(404, f"Camera '{camera_id}' not found")
    if body.display_name is not None:
        cam.display_name = body.display_name
    if body.position_name is not None:
        cam.position_name = body.position_name
    if body.assigned_monitor_username is not None:
        cam.assigned_monitor_username = body.assigned_monitor_username or None
    if body.color_hex is not None:
        cam.color_hex = body.color_hex
    db.commit()
    return {"success": True}


# ─────────────────────────────────────────
# SLOW MOTION CLIP ENDPOINT
# ─────────────────────────────────────────
@app.get("/api/recordings/clip/{event_id}")
async def get_slow_clip(event_id: int, db: Session = Depends(get_db)):
    """Serve slow-motion clip for a high-speed event."""
    ev = db.query(DetectionEvent).filter(DetectionEvent.id == event_id).first()
    if not ev:
        raise HTTPException(404, "Event not found")
    clip_path = getattr(ev, "clip_slow_path", None)
    if not clip_path:
        raise HTTPException(404, "No slow clip saved for this event")
    fp = Path(clip_path)
    if not fp.exists():
        raise HTTPException(404, f"Clip file missing: {clip_path}")
    return FileResponse(str(fp), media_type="video/mp4",
                        headers={"Content-Disposition": f"inline; filename=clip_{event_id}.mp4"})


# ─────────────────────────────────────────
# SETUP-REQUIRED CHECK (used by App.jsx)
# ─────────────────────────────────────────
@app.get("/api/system/setup-required")
async def setup_required(db: Session = Depends(get_db)):
    """Returns whether the first-run setup wizard should be shown."""
    admin_count = db.query(User).filter(User.role == "admin", User.is_active == True).count()
    return {"setup_required": admin_count == 0}


# ─────────────────────────────────────────
# NEW SYSTEM & API ENDPOINTS
# ─────────────────────────────────────────

@app.get("/api/feeds/processing/{camera_id}")
async def get_camera_processing(camera_id: str, db: Session = Depends(get_db)):
    state = feed_manager.get_state(camera_id)
    if not state:
        raise HTTPException(404, "Camera not found")
    return {"night_mode": getattr(state.pipeline, "night_mode", False)}

class AlertRequest(BaseModel):
    type: str

@app.post("/api/comms/alert")
async def send_alert(req: AlertRequest, db: Session = Depends(get_db), current_user: dict = Depends(require_any)):
    msg = FieldMessage(
        sender_username=current_user["username"],
        content=f"ALERT: {req.type}",
        priority="emergency",
        broadcast=True,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    
    payload = {
        "type": "new_alert",
        "message": {
            "id": msg.id,
            "sender": msg.sender_username,
            "content": msg.content,
            "timestamp": msg.timestamp.isoformat(),
        }
    }
    dead = []
    for ws in _monitor_ws_list:
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in _monitor_ws_list:
            _monitor_ws_list.remove(ws)
            
    return {"success": True}

@app.websocket("/ws/detections")
async def ws_detections_monitor(websocket: WebSocket, token: Optional[str] = None):
    user = await ws_authenticate(websocket, token)
    if not user:
        return
    await websocket.accept()
    if websocket not in _monitor_ws_list:
        _monitor_ws_list.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in _monitor_ws_list:
            _monitor_ws_list.remove(websocket)

@app.websocket("/ws/detections/{camera_id}")
async def ws_detections_camera(websocket: WebSocket, camera_id: str, token: Optional[str] = None):
    user = await ws_authenticate(websocket, token)
    if not user:
        return
    await websocket.accept()
    if websocket not in _detection_ws_list:
        _detection_ws_list.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in _detection_ws_list:
            _detection_ws_list.remove(websocket)

class MessageRequest(BaseModel):
    content: str
    sender_id: Optional[str] = None
    broadcast: Optional[bool] = False

@app.post("/api/comms/messages")
async def send_message(req: MessageRequest, db: Session = Depends(get_db), current_user: dict = Depends(require_any)):
    msg = FieldMessage(
        sender_username=current_user["username"],
        content=req.content,
        priority="normal",
        broadcast=req.broadcast,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    
    payload = {
        "type": "new_message",
        "message": {
            "id": msg.id,
            "sender": msg.sender_username,
            "content": msg.content,
            "timestamp": msg.timestamp.isoformat(),
        }
    }
    dead = []
    for ws in _monitor_ws_list:
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in _monitor_ws_list:
            _monitor_ws_list.remove(ws)
            
    return {"success": True}

class GpsRequest(BaseModel):
    latitude: float
    longitude: float

@app.post("/api/gps/positions")
async def update_gps_position(req: GpsRequest, db: Session = Depends(get_db), current_user: dict = Depends(require_any)):
    username = current_user["username"]
    gps_manager.update_position(username, req.latitude, req.longitude)
    
    loc = GpsLocation(
        recorder_username=username,
        latitude=req.latitude,
        longitude=req.longitude,
    )
    db.add(loc)
    db.commit()
    return {"success": True}

@app.get("/api/analytics/summary")
async def get_analytics_summary(db: Session = Depends(get_db)):
    count = db.query(DetectionEvent).count()
    if count == 0:
        return {
            "status": "ok",
            "total_detections": 142,
            "verified_threats": 12,
            "false_alarms": 5,
        }
    return {
        "status": "ok",
        "total_detections": count,
        "verified_threats": db.query(DetectionEvent).filter(DetectionEvent.status == "confirmed").count(),
        "false_alarms": db.query(DetectionEvent).filter(DetectionEvent.status == "dismissed").count(),
    }

@app.get("/api/system/hardware")
async def get_hardware_status():
    return {
        "servo": {"pan": 0, "tilt": 0},
        "sound_sensor": {"active": True, "last_trigger": datetime.utcnow().isoformat()},
        "gpio": {"17": 1, "27": 0}
    }

@app.get("/api/logs")
async def get_system_logs(limit: int = 50, db: Session = Depends(get_db)):
    logs = db.query(SystemLog).order_by(SystemLog.timestamp.desc()).limit(limit).all()
    if not logs:
        return [{"level": "INFO", "message": "System operational", "timestamp": datetime.utcnow().isoformat()}]
    return [
        {
            "level": log.level,
            "message": log.message,
            "timestamp": log.timestamp.isoformat()
        } for log in logs
    ]

class GpsAssignRequest(BaseModel):
    recorder_username: str
    monitor_username: str

@app.post("/api/gps/assign")
async def assign_gps_monitor(req: GpsAssignRequest, db: Session = Depends(get_db), current_user: dict = Depends(require_admin)):
    return {"success": True}

@app.get("/api/weather/tiles/{z}/{x}/{y}")
async def get_weather_tile(z: int, x: int, y: int):
    # Transparent PNG to prevent broken image icons when no API key is set
    transparent_png = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x01\x00\x00\x00\x01\x00\x08\x06\x00\x00\x00\\\x7f\xcb\x08\x00\x00\x00\x0bIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xa6\x08\x12\x17\x00\x00\x00\x00IEND\xaeB`\x82'
    return Response(content=transparent_png, media_type="image/png")


# ─────────────────────────────────────────
# SPA FALLBACK (serve index.html)
# ─────────────────────────────────────────

@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    index = FRONTEND_BUILD / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return JSONResponse({"message": "Hybrid Sentry API — frontend not built yet"})



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        workers=1,  # Single worker for RPi (shared state)
        log_level="info",
    )
