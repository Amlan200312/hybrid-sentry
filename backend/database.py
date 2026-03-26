"""
HYBRID SENTRY — Database Layer
SQLite + SQLAlchemy ORM, 12 tables
"""

from sqlalchemy import (
    create_engine, Column, Integer, String, Float, Boolean,
    DateTime, Text, JSON, ForeignKey, Index
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import os

DATABASE_URL = "sqlite:///./sentry.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ─────────────────────────────────────────
# 1. USERS
# ─────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    pin_hash = Column(String(256), nullable=False)
    role = Column(String(20), nullable=False)          # admin | monitor | recorder

    # Basic
    display_name = Column(String(100), nullable=True)

    # Military/Defence ID
    badge_id = Column(String(50), nullable=True)
    id_pass_number = Column(String(50), nullable=True)

    # Designation
    rank = Column(String(50), nullable=True)
    designation = Column(String(100), nullable=True)

    # Unit
    unit_name = Column(String(100), nullable=True)

    # Contact
    contact_number = Column(String(20), nullable=True)

    # Medical
    blood_group = Column(String(5), nullable=True)

    # Profile
    avatar_url = Column(String(255), nullable=True)

    # Operator & callsign
    operator_id = Column(String(50), nullable=True)
    callsign = Column(String(30), nullable=True)

    # System
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)
    notification_enabled = Column(Boolean, default=True)

    login_history = relationship("LoginHistory", back_populates="user_obj", lazy="dynamic")


# Composite index for fast role+active queries (e.g., list recorders)
Index("ix_users_role_active", User.role, User.is_active)


# ─────────────────────────────────────────
# 2. DETECTION EVENTS
# ─────────────────────────────────────────
class DetectionEvent(Base):
    __tablename__ = "detection_events"

    id = Column(Integer, primary_key=True, index=True)
    track_id = Column(Integer, nullable=True, index=True)
    detected_class = Column(String(100), nullable=False)
    display_label = Column(String(200), nullable=False)
    confidence = Column(Float, nullable=False)
    distance_m = Column(Float, nullable=True)
    speed_ms = Column(Float, nullable=True, default=0.0)
    posture = Column(String(50), nullable=True)
    zone_name = Column(String(100), nullable=True)
    camera_id = Column(String(50), nullable=False)
    gps_lat = Column(Float, nullable=True)
    gps_lng = Column(Float, nullable=True)
    face_concealed = Column(Boolean, default=False)
    holding_object = Column(String(100), nullable=True)
    clothing_type = Column(String(100), nullable=True)
    frame_x = Column(Integer, nullable=True)
    frame_y = Column(Integer, nullable=True)
    frame_w = Column(Integer, nullable=True)
    frame_h = Column(Integer, nullable=True)
    screenshot_path = Column(String(500), nullable=True)
    clip_path = Column(String(500), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    lighting_condition = Column(String(30), nullable=True)
    status = Column(String(20), default="pending")   # pending | confirmed | dismissed
    verified_by = Column(String(50), nullable=True)
    verified_at = Column(DateTime, nullable=True)
    acoustic_triggered = Column(Boolean, default=False)

    # ── Smart Detection additions ──────────────────────────────────
    vehicle_color     = Column(String(20), nullable=True)
    vehicle_direction = Column(String(30), nullable=True)
    plate_number      = Column(String(20), nullable=True)
    plate_crop_path   = Column(String(255), nullable=True)
    chest_badge_text  = Column(String(50), nullable=True)
    chest_crop_path   = Column(String(255), nullable=True)
    is_high_speed     = Column(Boolean, default=False)
    clip_slow_path    = Column(String(255), nullable=True)
    vessel_size       = Column(String(20), nullable=True)
    loitering_count   = Column(Integer, default=0)
    crowd_count       = Column(Integer, default=0)

    verify_queue   = relationship("VerifyQueue", back_populates="detection", uselist=False)
    dismissed      = relationship("DismissedLog", back_populates="detection", uselist=False)
    behavior_events = relationship("BehaviorTimeline", back_populates="detection_obj", lazy="dynamic")



# ─────────────────────────────────────────
# 3. VERIFY QUEUE
# ─────────────────────────────────────────
class VerifyQueue(Base):
    __tablename__ = "verify_queue"

    id = Column(Integer, primary_key=True, index=True)
    detection_id = Column(Integer, ForeignKey("detection_events.id"), nullable=False)
    confidence = Column(Float, nullable=False)
    queue_reason = Column(String(200), nullable=True)   # "low_conf" | "face_concealed" | "acoustic" | "military"
    acoustic_data = Column(JSON, nullable=True)
    visual_data = Column(JSON, nullable=True)
    escalated = Column(Boolean, default=False)
    escalated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    detection = relationship("DetectionEvent", back_populates="verify_queue")


# ─────────────────────────────────────────
# 4. DISMISSED LOG
# ─────────────────────────────────────────
class DismissedLog(Base):
    __tablename__ = "dismissed_log"

    id = Column(Integer, primary_key=True, index=True)
    detection_id = Column(Integer, ForeignKey("detection_events.id"), nullable=False)
    dismissed_by = Column(String(50), nullable=False)
    dismissed_at = Column(DateTime, default=datetime.utcnow)
    reason = Column(String(300), nullable=True)

    detection = relationship("DetectionEvent", back_populates="dismissed")


# ─────────────────────────────────────────
# 5. BEHAVIOR TIMELINE
# ─────────────────────────────────────────
class BehaviorTimeline(Base):
    __tablename__ = "behavior_timeline"

    id = Column(Integer, primary_key=True, index=True)
    track_id = Column(Integer, nullable=False, index=True)
    camera_id = Column(String(50), nullable=False)
    detection_id = Column(Integer, ForeignKey("detection_events.id"), nullable=True)
    event_type = Column(String(50), nullable=False)   # entered | exited | stopped | running | face_concealed | zone_enter | zone_exit | dwell
    description = Column(String(300), nullable=False)
    speed_ms = Column(Float, nullable=True)
    zone_name = Column(String(100), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    detection_obj = relationship("DetectionEvent", back_populates="behavior_events")

    __table_args__ = (
        Index("ix_behavior_track_cam", "track_id", "camera_id"),
        Index("ix_behavior_track_id_only", "track_id"),
    )


# ─────────────────────────────────────────
# 6. GPS LOCATIONS
# ─────────────────────────────────────────
class GpsLocation(Base):
    __tablename__ = "gps_locations"

    id = Column(Integer, primary_key=True, index=True)
    recorder_username = Column(String(50), nullable=False, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    accuracy = Column(Float, nullable=True)
    is_streaming = Column(Boolean, default=False)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)


# ─────────────────────────────────────────
# 7. LOGIN HISTORY
# ─────────────────────────────────────────
class LoginHistory(Base):
    __tablename__ = "login_history"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), ForeignKey("users.username"), nullable=False, index=True)
    ip_address = Column(String(60), nullable=True)
    device_info = Column(String(500), nullable=True)
    login_at = Column(DateTime, default=datetime.utcnow, index=True)
    success = Column(Boolean, nullable=False)
    role = Column(String(20), nullable=True)

    user_obj = relationship("User", back_populates="login_history")


# ─────────────────────────────────────────
# 8. ZONES
# ─────────────────────────────────────────
class Zone(Base):
    __tablename__ = "zones"

    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(String(50), nullable=False, index=True)
    zone_name = Column(String(100), nullable=False)
    zone_type = Column(String(30), nullable=False)   # tripwire | restricted | safe
    coordinates = Column(JSON, nullable=False)        # list of [x, y] points
    created_by = Column(String(50), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)


# ─────────────────────────────────────────
# 9. FRAME HEATMAP
# ─────────────────────────────────────────
class FrameHeatmap(Base):
    __tablename__ = "frame_heatmap"

    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(String(50), nullable=False)
    grid_x = Column(Integer, nullable=False)   # 0-9
    grid_y = Column(Integer, nullable=False)   # 0-9
    detection_count = Column(Integer, default=0)
    most_common_class = Column(String(100), nullable=True)
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_heatmap_camera_grid", "camera_id", "grid_x", "grid_y"),
    )


# ─────────────────────────────────────────
# 10. FIELD MESSAGES
# ─────────────────────────────────────────
class FieldMessage(Base):
    __tablename__ = "field_messages"

    id = Column(Integer, primary_key=True, index=True)
    callsign = Column(String(30), nullable=False, index=True)
    username = Column(String(50), nullable=False)
    text = Column(Text, nullable=False)
    language = Column(String(20), nullable=True)
    confidence = Column(Float, nullable=True)
    audio_path = Column(String(500), nullable=True)
    gps_lat = Column(Float, nullable=True)
    gps_lng = Column(Float, nullable=True)
    priority = Column(String(20), default="normal")   # emergency | high | medium | clear | normal
    acknowledged = Column(Boolean, default=False)
    ack_by = Column(String(50), nullable=True)
    ack_time = Column(DateTime, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    duration_sec = Column(Float, nullable=True)
    trigger_type = Column(String(20), nullable=True)  # ptt | mayday | text
    reply_text = Column(Text, nullable=True)
    reply_by = Column(String(50), nullable=True)
    reply_at = Column(DateTime, nullable=True)


# ─────────────────────────────────────────
# 11. CALLSIGN CONFIG
# ─────────────────────────────────────────
class CallsignConfig(Base):
    __tablename__ = "callsign_config"

    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(String(50), nullable=True)
    recorder_username = Column(String(50), nullable=True)
    callsign = Column(String(30), nullable=False, unique=True)
    color_hex = Column(String(10), default="#39ff14")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)



# ─────────────────────────────────────────
# 12. BASE ZONES
# ─────────────────────────────────────────
# ─────────────────────────────────────────
# 12. CAMERA CONFIG
# ─────────────────────────────────────────
class CameraConfig(Base):
    __tablename__ = "camera_config"

    id                        = Column(Integer, primary_key=True, index=True)
    camera_id                 = Column(String(50), unique=True, nullable=False, index=True)
    display_name              = Column(String(100), nullable=False)
    position_name             = Column(String(100), nullable=True)
    assigned_monitor_username = Column(String(50), nullable=True)
    color_hex                 = Column(String(10), default="#388bfd")
    is_active                 = Column(Boolean, default=True)
    created_at                = Column(DateTime, default=datetime.utcnow)


# ─────────────────────────────────────────
# 13. SYSTEM CONFIG
# ─────────────────────────────────────────
class SystemConfig(Base):
    __tablename__ = "system_config"

    id         = Column(Integer, primary_key=True, index=True)
    key        = Column(String(50), unique=True, nullable=False, index=True)
    value      = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ─────────────────────────────────────────
# 14. BASE ZONES
# ─────────────────────────────────────────
class BaseZone(Base):
    __tablename__ = "base_zones"

    id            = Column(Integer, primary_key=True, index=True)
    zone_name     = Column(String(100), nullable=False)
    zone_type     = Column(String(30), nullable=False)   # BASE | POST | SEASIDE | LIMA | ROAD | PERIMETER | CUSTOM
    description   = Column(Text, nullable=True)
    color_hex     = Column(String(10), default="#388bfd")
    latitude      = Column(Float, nullable=False)
    longitude     = Column(Float, nullable=False)
    radius_meters = Column(Float, default=200.0)
    is_active     = Column(Boolean, default=True)
    created_by    = Column(String(50), nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)


# ─────────────────────────────────────────
# 13. SYSTEM LOGS
# ─────────────────────────────────────────
class SystemLog(Base):
    __tablename__ = "system_logs"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(50), nullable=False, index=True)
    description = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)


# ─────────────────────────────────────────
# INIT + SEED
# ─────────────────────────────────────────
def init_db():
    """Create all tables and seed default users."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Check if admin exists
        existing = db.query(User).filter(User.username == "admin").first()
        if not existing:
            import bcrypt

            # ── Admin (PIN: 12345678, 8 digits) ────────────────────────
            pin_hash = bcrypt.hashpw(
                "12345678".encode("utf-8"), bcrypt.gensalt(rounds=12)
            ).decode("utf-8")
            admin = User(
                username="admin",
                pin_hash=pin_hash,
                role="admin",
                display_name="Administrator",
                badge_id="ADM-001",
                id_pass_number="IP-2025-001",
                rank="Administrator",
                designation="System Administrator",
                unit_name="Command HQ",
                contact_number="+91-0000000000",
                blood_group="O+",
                operator_id="OP-001",
                callsign="ALPHA",
            )
            db.add(admin)

            # ── Monitor (PIN: 123456, 6 digits) ────────────────────────
            mon_hash = bcrypt.hashpw(
                "123456".encode("utf-8"), bcrypt.gensalt(rounds=12)
            ).decode("utf-8")
            monitor = User(
                username="monitor",
                pin_hash=mon_hash,
                role="monitor",
                display_name="Monitor Officer",
                badge_id="MON-001",
                id_pass_number="IP-2025-002",
                rank="Officer",
                designation="Surveillance Officer",
                unit_name="Surveillance Unit",
                contact_number="+91-0000000001",
                blood_group="A+",
                operator_id="OP-002",
                callsign="BRAVO",
            )
            db.add(monitor)

            # ── Recorder (PIN: 1234, 4 digits) ─────────────────────────
            rec_hash = bcrypt.hashpw(
                "1234".encode("utf-8"), bcrypt.gensalt(rounds=12)
            ).decode("utf-8")
            recorder = User(
                username="recorder",
                pin_hash=rec_hash,
                role="recorder",
                display_name="Field Recorder",
                badge_id="REC-001",
                id_pass_number="IP-2025-003",
                rank="Field Operative",
                designation="Field Recorder",
                unit_name="Field Team Alpha",
                contact_number="+91-0000000002",
                blood_group="B+",
                operator_id="OP-003",
                callsign="CHARLIE",
            )
            db.add(recorder)

            # ── Callsign configs ────────────────────────────────────────
            alpha_cs = CallsignConfig(
                camera_id="CAM-01",
                callsign="ALPHA",
                color_hex="#388bfd",
            )
            db.add(alpha_cs)

            charlie_cs = CallsignConfig(
                recorder_username="recorder",
                callsign="CHARLIE",
                color_hex="#3fb950",
            )
            db.add(charlie_cs)

            # ── Default cameras ──────────────────────────────────────────
            for cam_id, name in [("CAM-01", "Main Gate"), ("CAM-02", "Field Camera 1"), ("CAM-03", "Field Camera 2")]:
                cam = CameraConfig(camera_id=cam_id, display_name=name, color_hex="#388bfd")
                db.add(cam)

            # ── System config defaults ───────────────────────────────────
            for k, v in [
                ("org_name",      "Hybrid Sentry Base"),
                ("base_location", ""),
                ("base_lat",      ""),
                ("base_lng",      ""),
            ]:
                db.add(SystemConfig(key=k, value=v))

            db.commit()

            print("[DB] Tables created. Seeded admin / monitor / recorder users.")
        else:
            print("[DB] Tables verified. Admin already exists.")
    except Exception as exc:
        db.rollback()
        print(f"[DB] Seed error: {exc}")
        raise
    finally:
        db.close()


def get_db():
    """FastAPI dependency: yields a DB session and closes it after use."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ─────────────────────────────────────────
# NATO PHONETIC CALLSIGN HELPER
# ─────────────────────────────────────────
NATO_PHONETICS = [
    "ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO",
    "FOXTROT", "GOLF", "HOTEL", "INDIA", "JULIET",
    "KILO", "LIMA", "MIKE", "NOVEMBER", "OSCAR",
    "PAPA", "QUEBEC", "ROMEO", "SIERRA", "TANGO",
    "UNIFORM", "VICTOR", "WHISKEY", "XRAY", "YANKEE", "ZULU"
]

RECORDER_COLORS = [
    "#388bfd", "#3fb950", "#d29922", "#8b949e",
    "#f85149", "#388bfd", "#3fb950", "#e6edf3",
]


def assign_callsign(db, recorder_username: str) -> CallsignConfig:
    """
    Auto-assign next available NATO phonetic callsign to a new recorder.
    Starts from DELTA (index 3). ALPHA/BRAVO/CHARLIE reserved for defaults.
    """
    existing_callsigns = {
        row.callsign for row in db.query(CallsignConfig).all()
    }
    for i, name in enumerate(NATO_PHONETICS[3:], start=3):
        if name not in existing_callsigns:
            color = RECORDER_COLORS[i % len(RECORDER_COLORS)]
            config = CallsignConfig(
                recorder_username=recorder_username,
                callsign=name,
                color_hex=color,
            )
            db.add(config)
            db.commit()
            db.refresh(config)
            return config
    raise RuntimeError("All NATO callsigns exhausted (>23 recorders).")


def get_callsign_for_recorder(db, recorder_username: str) -> str:
    """Return callsign string for a recorder, assigning one if needed."""
    # First check user's own callsign field
    user = db.query(User).filter(User.username == recorder_username).first()
    if user and user.callsign:
        return user.callsign

    cfg = db.query(CallsignConfig).filter(
        CallsignConfig.recorder_username == recorder_username
    ).first()
    if cfg:
        return cfg.callsign
    new_cfg = assign_callsign(db, recorder_username)
    return new_cfg.callsign


if __name__ == "__main__":
    init_db()
    print("[DB] Initialization complete.")
