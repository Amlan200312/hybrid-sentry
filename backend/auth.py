"""
HYBRID SENTRY — Authentication Module
JWT + bcrypt PIN hashing, 3 roles, lockout system
"""

import os
import time
import threading
import bcrypt
from datetime import datetime, timedelta
from typing import Optional, Dict, Tuple

from fastapi import Depends, HTTPException, Request, Cookie, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from database import get_db, User, LoginHistory, SessionLocal

# ── JWT Config ────────────────────────────────────────────────────────────────
SECRET_KEY = os.environ.get("SENTRY_SECRET", "hybrid-sentry-super-secret-key-change-in-prod-2024")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 8

# ── Lockout Config ────────────────────────────────────────────────────────────
MAX_ATTEMPTS = 3
LOCKOUT_SECONDS = 300  # 5 minutes

# In-memory attempt tracker: {username: {"count": int, "locked_until": float}}
_attempt_tracker: Dict[str, dict] = {}

# ── Fast token cache: {token: payload_dict} ─────────────────────────────────
# Avoids re-decoding JWT on every authenticated request.
_token_cache: Dict[str, dict] = {}
_token_cache_lock = threading.Lock()


def _purge_expired_tokens():
    """Remove expired tokens from cache (call occasionally)."""
    now = time.time()
    with _token_cache_lock:
        expired = [t for t, p in _token_cache.items() if p.get("_exp", 0) < now]
        for t in expired:
            del _token_cache[t]


_purge_counter = 0


def verify_token_fast(token: str) -> Optional[dict]:
    """
    Fast token verification with in-memory caching.
    Falls back to full decode on cache miss.
    """
    global _purge_counter
    with _token_cache_lock:
        cached = _token_cache.get(token)
    if cached and cached.get("_exp", 0) > time.time():
        _purge_counter += 1
        if _purge_counter >= 200:
            _purge_counter = 0
            threading.Thread(target=_purge_expired_tokens, daemon=True).start()
        return {k: v for k, v in cached.items() if not k.startswith("_")}
    # Full decode
    payload = decode_access_token(token)
    if payload:
        exp = payload.get("exp", 0)
        if isinstance(exp, (int, float)) and exp > time.time():
            with _token_cache_lock:
                _token_cache[token] = {**payload, "_exp": float(exp)}
    return payload


security = HTTPBearer(auto_error=False)


# ─────────────────────────────────────────
# PIN HASHING
# ─────────────────────────────────────────
def hash_pin(pin: str) -> str:
    """Hash a PIN string using bcrypt."""
    return bcrypt.hashpw(pin.encode(), bcrypt.gensalt()).decode()


def verify_pin(pin: str, pin_hash: str) -> bool:
    """Verify a plain PIN against its bcrypt hash."""
    try:
        return bcrypt.checkpw(pin.encode(), pin_hash.encode())
    except Exception:
        return False


# ─────────────────────────────────────────
# JWT TOKENS
# ─────────────────────────────────────────
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT access token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """Decode a JWT token. Returns payload dict or None."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


# ─────────────────────────────────────────
# LOCKOUT HELPERS
# ─────────────────────────────────────────
def _is_locked(username: str) -> Tuple[bool, float]:
    """Return (is_locked, remaining_seconds)."""
    entry = _attempt_tracker.get(username)
    if not entry:
        return False, 0.0
    locked_until = entry.get("locked_until", 0.0)
    if locked_until and time.time() < locked_until:
        return True, locked_until - time.time()
    return False, 0.0


def _record_failure(username: str):
    """Increment failure count and lock if threshold exceeded."""
    entry = _attempt_tracker.setdefault(username, {"count": 0, "locked_until": 0.0})
    entry["count"] += 1
    if entry["count"] >= MAX_ATTEMPTS:
        entry["locked_until"] = time.time() + LOCKOUT_SECONDS
        entry["count"] = 0  # reset count so it can track new failures after lockout


def _clear_failures(username: str):
    """Clear failure record on successful login."""
    _attempt_tracker.pop(username, None)


# ─────────────────────────────────────────
# LOGIN LOGIC
# ─────────────────────────────────────────
def authenticate_user(
    db: Session,
    username: str,
    pin: str,
    ip: str = "",
    device_info: str = "",
) -> dict:
    """
    Attempt to authenticate user. Returns token payload or raises HTTPException.
    Enforces lockout after 3 wrong PINs.
    """
    # Lockout check
    locked, remaining = _is_locked(username)
    if locked:
        mins = int(remaining // 60)
        secs = int(remaining % 60)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"ACCOUNT LOCKED. Try again in {mins}m {secs}s.",
        )

    user = db.query(User).filter(User.username == username).first()

    def _log(success: bool):
        entry = LoginHistory(
            username=username,
            ip_address=ip,
            device_info=device_info,
            success=success,
            role=user.role if user else None,
        )
        db.add(entry)
        db.commit()

    if not user or not user.is_active:
        _log(False)
        _record_failure(username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ACCESS DENIED — Invalid credentials.",
        )

    if not verify_pin(pin, user.pin_hash):
        _log(False)
        _record_failure(username)
        locked2, remaining2 = _is_locked(username)
        if locked2:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"ACCOUNT LOCKED — Too many failed attempts. Try in {int(remaining2//60)}m {int(remaining2%60)}s.",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ACCESS DENIED — Invalid PIN.",
        )

    # Success
    _clear_failures(username)
    _log(True)

    token_data = {
        "sub": user.username,
        "role": user.role,
        "display_name": user.display_name or user.username,
        "operator_id": user.operator_id or "",
    }
    token = create_access_token(token_data)

    return {
        "access_token": token,
        "token_type": "bearer",
        "username": user.username,
        "role": user.role,
        "display_name": user.display_name or user.username,
        "operator_id": user.operator_id or "",
    }


# ─────────────────────────────────────────
# FASTAPI DEPENDENCIES
# ─────────────────────────────────────────
def _extract_token(request: Request, access_token: Optional[str] = None) -> Optional[str]:
    """Try to get token from httpOnly cookie first, then Authorization header."""
    # Cookie first
    cookie_token = request.cookies.get("access_token")
    if cookie_token:
        return cookie_token
    # Fallback: Authorization header Bearer token
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    return None


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    """FastAPI dependency: validate token and return user payload (with cache)."""
    token = _extract_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated.",
        )
    # Use fast cached verification
    payload = verify_token_fast(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalid or expired.",
        )
    username = payload["sub"]
    # Role is embedded in token — only hit DB for active-status check
    user = db.query(User).filter(User.username == username, User.is_active == True).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated.",
        )
    return {
        "username": user.username,
        "role": user.role,
        "display_name": user.display_name or user.username,
        "operator_id": user.operator_id or "",
    }


def require_roles(*allowed_roles: str):
    """Dependency factory: restrict endpoint to specific roles."""
    def _dep(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"ACCESS DENIED — Role '{current_user['role']}' not permitted.",
            )
        return current_user
    return _dep


# Convenience role dependencies
require_admin = require_roles("admin")
require_admin_or_monitor = require_roles("admin", "monitor")
require_any = require_roles("admin", "monitor", "recorder")


# ─────────────────────────────────────────
# WEB SOCKET AUTH HELPER
# ─────────────────────────────────────────
def ws_authenticate(token: str) -> Optional[dict]:
    """
    Validate JWT for WebSocket connections (token passed as query param).
    Returns payload dict or None.
    """
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        return None

    # Verify user still active in DB
    db = SessionLocal()
    try:
        user = db.query(User).filter(
            User.username == payload["sub"],
            User.is_active == True
        ).first()
        if not user:
            return None
        return {
            "username": user.username,
            "role": user.role,
            "display_name": user.display_name or user.username,
        }
    finally:
        db.close()


# ─────────────────────────────────────────
# USER MANAGEMENT HELPERS
# ─────────────────────────────────────────
def create_user(
    db: Session,
    username: str,
    pin: str,
    role: str,
    display_name: str = "",
    operator_id: str = "",
    badge_id: str = "",
    rank: str = "",
    designation: str = "",
    unit_name: str = "",
    contact_number: str = "",
    blood_group: str = "",
    id_pass_number: str = "",
    callsign: str = "",
) -> User:
    """Create a new user with all personal fields. Raises ValueError if username taken."""
    existing = db.query(User).filter(User.username == username).first()
    if existing:
        raise ValueError(f"Username '{username}' already exists.")

    if role == "admin" and len(pin) != 8:
        raise ValueError("Admin PIN must be 8 digits.")
    if role == "monitor" and len(pin) != 6:
        raise ValueError("Monitor PIN must be 6 digits.")
    if role == "recorder" and len(pin) != 4:
        raise ValueError("Recorder PIN must be 4 digits.")
    if not pin.isdigit():
        raise ValueError("PIN must be numeric only.")

    user = User(
        username=username,
        pin_hash=hash_pin(pin),
        role=role,
        display_name=display_name or username,
        operator_id=operator_id,
        badge_id=badge_id or None,
        rank=rank or None,
        designation=designation or None,
        unit_name=unit_name or None,
        contact_number=contact_number or None,
        blood_group=blood_group or None,
        id_pass_number=id_pass_number or None,
        callsign=callsign or None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def change_pin(db: Session, username: str, old_pin: str, new_pin: str) -> bool:
    """Change a user's PIN after verifying the old one."""
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise ValueError("User not found.")
    if not verify_pin(old_pin, user.pin_hash):
        raise ValueError("Current PIN incorrect.")
    if not new_pin.isdigit():
        raise ValueError("PIN must be numeric only.")
    user.pin_hash = hash_pin(new_pin)
    db.commit()
    return True


def reset_pin_admin(db: Session, target_username: str, new_pin: str) -> bool:
    """Admin-only: reset a user's PIN without requiring old PIN."""
    user = db.query(User).filter(User.username == target_username).first()
    if not user:
        raise ValueError("User not found.")
    if not new_pin.isdigit():
        raise ValueError("PIN must be numeric only.")
    user.pin_hash = hash_pin(new_pin)
    db.commit()
    return True
