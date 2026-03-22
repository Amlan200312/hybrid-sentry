"""
HYBRID SENTRY — Voice Communications Module
VOSK offline ASR + PTT system + callsign management
WebSocket endpoint for audio streaming
"""

import asyncio
import json
import wave
import os
import logging

os.environ["VOSK_LOG_LEVEL"] = "-1"
logging.getLogger("vosk").setLevel(logging.ERROR)
import time
from pathlib import Path
from typing import Optional, Dict
from datetime import datetime

# VOSK — offline speech recognition
try:
    from vosk import Model, KaldiRecognizer
    VOSK_AVAILABLE = True
except ImportError:
    VOSK_AVAILABLE = False
    print("[VOICE] vosk not installed — transcription disabled")

from fastapi import WebSocket, WebSocketDisconnect
from database import (
    SessionLocal, FieldMessage, CallsignConfig,
    get_callsign_for_recorder
)

# ─────────────────────────────────────────
# VOSK MODEL PATHS
# ─────────────────────────────────────────
MODELS_BASE = Path(__file__).parent / "vosk_models"
MODEL_EN_IN  = MODELS_BASE / "vosk-model-small-en-in-0.4"
MODEL_HI     = MODELS_BASE / "vosk-model-small-hi-0.22"

_vosk_models: Dict[str, Optional[object]] = {
    "en-IN": None,
    "hi-IN": None,
}


def load_vosk_models():
    """Load VOSK models at startup."""
    global _vosk_models
    if not VOSK_AVAILABLE:
        return

    for lang, path in [("en-IN", MODEL_EN_IN), ("hi-IN", MODEL_HI)]:
        if path.exists():
            try:
                _vosk_models[lang] = Model(str(path))
                print(f"[VOICE] VOSK model loaded: {lang}")
            except Exception as e:
                print(f"[VOICE] Failed to load {lang} model: {e}")
        else:
            print(f"[VOICE] Model not found at {path} — download required")


def get_vosk_model(lang: str) -> Optional[object]:
    """Return appropriate VOSK model. Falls back to en-IN."""
    return _vosk_models.get(lang) or _vosk_models.get("en-IN")


# ─────────────────────────────────────────
# PRIORITY DETECTION
# ─────────────────────────────────────────
PRIORITY_KEYWORDS = {
    "emergency": [
        "mayday", "emergency", "help", "sos",
        "madad", "bachao", "bachao mujhe",
    ],
    "high": [
        "weapon", "gun", "threat", "breach", "armed", "spotted", "suspicious",
        "haathiyar", "banda", "khatra", "log hain", "dushmaan",
    ],
    "medium": [
        "movement", "vehicle", "check",
        "koi aaya", "dekha", "gaadi", "check karo",
    ],
    "clear": [
        "clear", "secure", "safe", "all good",
        "sab theek", "koi nahi", "clear hai",
    ],
}


def detect_priority(text: str) -> str:
    """Detect message priority by scanning for keywords."""
    text_lower = text.lower()
    for priority, keywords in PRIORITY_KEYWORDS.items():
        for kw in keywords:
            if kw in text_lower:
                return priority
    return "normal"


def detect_language(text: str) -> str:
    """
    Heuristic language detection.
    Check for common Hindi words → hi-IN, else en-IN.
    """
    hindi_words = ["hai", "hain", "koi", "aaya", "theek", "nahi", "dekha",
                   "gaadi", "bachao", "madad", "haathiyar", "khatra"]
    text_lower = text.lower()
    hindi_count = sum(1 for w in hindi_words if w in text_lower.split())
    return "hi-IN" if hindi_count >= 2 else "en-IN"


# ─────────────────────────────────────────
# AUDIO STORAGE
# ─────────────────────────────────────────
COMMS_DIR = Path("recordings") / "comms"
COMMS_DIR.mkdir(parents=True, exist_ok=True)


def save_audio_wav(callsign: str, pcm_bytes: bytes, sample_rate: int = 16000) -> str:
    """Save PCM audio bytes as WAV file. Returns file path."""
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{callsign}_{ts}.wav"
    filepath = COMMS_DIR / filename
    with wave.open(str(filepath), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)   # 16-bit
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)
    return str(filepath)


# ─────────────────────────────────────────
# CONNECTED CLIENTS MANAGER
# ─────────────────────────────────────────
class VoiceClientManager:
    """Tracks active voice WebSocket connections."""

    def __init__(self):
        self._clients: Dict[str, WebSocket] = {}  # username → ws

    def register(self, username: str, ws: WebSocket):
        self._clients[username] = ws

    def unregister(self, username: str):
        self._clients.pop(username, None)

    async def send_to(self, username: str, data: dict):
        ws = self._clients.get(username)
        if ws:
            try:
                await ws.send_json(data)
            except Exception:
                self.unregister(username)

    async def broadcast_monitors(self, connected_monitor_ws_list, data: dict):
        """Broadcast to all connected monitor WebSockets."""
        for ws in connected_monitor_ws_list:
            try:
                await ws.send_json(data)
            except Exception:
                pass


voice_client_manager = VoiceClientManager()


# ─────────────────────────────────────────
# VOSK TRANSCRIPTION
# ─────────────────────────────────────────
def transcribe_pcm(pcm_bytes: bytes, lang: str = "en-IN", sample_rate: int = 16000) -> dict:
    """
    Transcribe raw PCM bytes using VOSK.
    Returns {"text": str, "confidence": float}.
    """
    if not VOSK_AVAILABLE:
        return {"text": "", "confidence": 0.0}

    model = get_vosk_model(lang)
    if not model:
        return {"text": "", "confidence": 0.0}

    try:
        rec = KaldiRecognizer(model, sample_rate)
        rec.SetWords(True)
        rec.AcceptWaveform(pcm_bytes)
        result = json.loads(rec.FinalResult())
        text = result.get("text", "").strip()

        # Confidence: average word confidence if available
        words = result.get("result", [])
        if words:
            conf = sum(w.get("conf", 0.0) for w in words) / len(words)
        else:
            conf = 0.6 if text else 0.0

        return {"text": text, "confidence": round(conf, 3)}
    except Exception as e:
        print(f"[VOICE] VOSK transcription error: {e}")
        return {"text": "", "confidence": 0.0}


# ─────────────────────────────────────────
# VOICE WS HANDLER
# ─────────────────────────────────────────
async def handle_voice_ws(
    websocket: WebSocket,
    username: str,
    user_payload: dict,
    monitor_connections,  # list of active monitor WS connections
):
    """
    WebSocket handler for voice communications.
    Endpoint: /ws/voice/{username}

    Protocol:
      CLIENT → SERVER:
        Binary frames: raw PCM audio chunks (16-bit, 16kHz, mono)
        Text frames (JSON): metadata
          {"type": "start", "lang": "hi-IN", "trigger_type": "ptt"}
          {"type": "stop", "duration_sec": 6.2, "gps_lat": 23.02, "gps_lng": 72.57,
           "web_speech_text": "...", "web_speech_conf": 0.8}
          {"type": "text_message", "text": "...", "gps_lat": ..., "gps_lng": ...}
          {"type": "mayday", "text": "MAYDAY", "gps_lat": ..., "gps_lng": ...}

      SERVER → CLIENT:
        {"type": "transcript_partial", "text": "...", "interim": true}
        {"type": "message_saved", "message_id": 123, "priority": "high", "text": "..."}
        {"type": "ack_received", "message_id": 123, "ack_by": "admin", "ack_time": "..."}
        {"type": "reply", "from": "admin", "text": "..."}
    """
    await websocket.accept()
    voice_client_manager.register(username, websocket)

    db = SessionLocal()
    callsign = get_callsign_for_recorder(db, username)

    audio_buffer = bytearray()
    current_lang = "en-IN"
    current_trigger = "ptt"
    session_start: Optional[float] = None

    try:
        while True:
            data = await websocket.receive()

            if "bytes" in data and data["bytes"]:
                # Audio chunk
                chunk = data["bytes"]
                audio_buffer.extend(chunk)

                # Partial VOSK transcription (stream)
                if len(audio_buffer) >= 3200:  # roughly 100ms chunks
                    partial_result = transcribe_pcm(bytes(audio_buffer[-3200:]), current_lang)
                    if partial_result["text"]:
                        await websocket.send_json({
                            "type": "transcript_partial",
                            "text": partial_result["text"],
                            "interim": True,
                        })

            elif "text" in data and data["text"]:
                msg = json.loads(data["text"])
                msg_type = msg.get("type", "")

                if msg_type == "start":
                    # New recording session begins
                    audio_buffer.clear()
                    current_lang = msg.get("lang", "en-IN")
                    current_trigger = msg.get("trigger_type", "ptt")
                    session_start = time.time()

                elif msg_type == "stop":
                    # Recording finished — transcribe and save
                    duration_sec = msg.get("duration_sec", 0.0)
                    gps_lat = msg.get("gps_lat")
                    gps_lng = msg.get("gps_lng")
                    web_speech_text = msg.get("web_speech_text", "")
                    web_speech_conf = msg.get("web_speech_conf", 0.0)

                    # VOSK transcription
                    vosk_result = transcribe_pcm(bytes(audio_buffer), current_lang)
                    vosk_text = vosk_result["text"]
                    vosk_conf = vosk_result["confidence"]

                    # Take higher confidence result
                    if vosk_conf >= web_speech_conf and vosk_text:
                        final_text = vosk_text
                        final_conf = vosk_conf
                        final_lang = current_lang
                    elif web_speech_text:
                        final_text = web_speech_text
                        final_conf = web_speech_conf
                        final_lang = detect_language(web_speech_text)
                    else:
                        final_text = vosk_text or web_speech_text or "[unintelligible]"
                        final_conf = max(vosk_conf, web_speech_conf)
                        final_lang = current_lang

                    # Detect priority
                    priority = detect_priority(final_text)
                    if current_trigger == "mayday":
                        priority = "emergency"

                    # Save audio
                    audio_path = ""
                    if audio_buffer:
                        try:
                            audio_path = save_audio_wav(callsign, bytes(audio_buffer))
                        except Exception as e:
                            print(f"[VOICE] Audio save error: {e}")

                    # Save to DB
                    field_msg = FieldMessage(
                        callsign=callsign,
                        username=username,
                        text=final_text,
                        language=final_lang,
                        confidence=final_conf,
                        audio_path=audio_path,
                        gps_lat=gps_lat,
                        gps_lng=gps_lng,
                        priority=priority,
                        duration_sec=duration_sec,
                        trigger_type=current_trigger,
                    )
                    db.add(field_msg)
                    db.commit()
                    db.refresh(field_msg)

                    # Notify sender
                    await websocket.send_json({
                        "type": "message_saved",
                        "message_id": field_msg.id,
                        "priority": priority,
                        "text": final_text,
                        "confidence": final_conf,
                        "callsign": callsign,
                    })

                    # Broadcast to monitors
                    broadcast_data = {
                        "type": "field_message",
                        "message_id": field_msg.id,
                        "callsign": callsign,
                        "username": username,
                        "text": final_text,
                        "language_detected": final_lang,
                        "audio_path": audio_path,
                        "confidence": final_conf,
                        "gps_lat": gps_lat,
                        "gps_lng": gps_lng,
                        "timestamp": datetime.utcnow().isoformat(),
                        "duration_sec": duration_sec,
                        "priority": priority,
                        "trigger_type": current_trigger,
                    }
                    await voice_client_manager.broadcast_monitors(monitor_connections, broadcast_data)

                    # Reset buffer
                    audio_buffer.clear()

                elif msg_type == "text_message":
                    # Plain text fallback
                    text = msg.get("text", "").strip()
                    if not text:
                        continue
                    gps_lat = msg.get("gps_lat")
                    gps_lng = msg.get("gps_lng")
                    priority = detect_priority(text)
                    lang_detected = detect_language(text)

                    field_msg = FieldMessage(
                        callsign=callsign,
                        username=username,
                        text=text,
                        language=lang_detected,
                        confidence=1.0,
                        gps_lat=gps_lat,
                        gps_lng=gps_lng,
                        priority=priority,
                        trigger_type="text",
                    )
                    db.add(field_msg)
                    db.commit()
                    db.refresh(field_msg)

                    await websocket.send_json({
                        "type": "message_saved",
                        "message_id": field_msg.id,
                        "priority": priority,
                        "text": text,
                        "callsign": callsign,
                    })

                    broadcast_data = {
                        "type": "field_message",
                        "message_id": field_msg.id,
                        "callsign": callsign,
                        "username": username,
                        "text": text,
                        "language_detected": lang_detected,
                        "confidence": 1.0,
                        "gps_lat": gps_lat,
                        "gps_lng": gps_lng,
                        "timestamp": datetime.utcnow().isoformat(),
                        "priority": priority,
                        "trigger_type": "text",
                    }
                    await voice_client_manager.broadcast_monitors(monitor_connections, broadcast_data)

                elif msg_type == "mayday":
                    # Emergency auto-wake — already recorded 10s
                    current_trigger = "mayday"
                    await websocket.send_json({
                        "type": "mayday_ack",
                        "message": "MAYDAY DETECTED — Recording emergency transmission",
                    })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[VOICE] WebSocket error for {username}: {e}")
    finally:
        voice_client_manager.unregister(username)
        db.close()


# ─────────────────────────────────────────
# ACKNOWLEDGE FROM MONITOR
# ─────────────────────────────────────────
async def acknowledge_message(
    message_id: int,
    ack_by: str,
    db,
) -> Optional[dict]:
    """
    Monitor acknowledges a field message.
    Updates DB + pushes WebSocket notification to recorder.
    """
    msg = db.query(FieldMessage).filter(FieldMessage.id == message_id).first()
    if not msg:
        return None

    msg.acknowledged = True
    msg.ack_by = ack_by
    msg.ack_time = datetime.utcnow()
    db.commit()

    # Push ack to recorder via WebSocket
    ack_payload = {
        "type": "ack_received",
        "message_id": message_id,
        "ack_by": ack_by,
        "ack_time": msg.ack_time.isoformat(),
        "original_text": msg.text,
    }
    await voice_client_manager.send_to(msg.username, ack_payload)

    return {
        "message_id": message_id,
        "ack_by": ack_by,
        "ack_time": msg.ack_time.isoformat(),
    }


async def send_reply(
    message_id: int,
    reply_text: str,
    reply_by: str,
    db,
) -> Optional[dict]:
    """Monitor sends text reply to a recorder's message."""
    msg = db.query(FieldMessage).filter(FieldMessage.id == message_id).first()
    if not msg:
        return None

    msg.reply_text = reply_text
    msg.reply_by = reply_by
    msg.reply_at = datetime.utcnow()
    db.commit()

    reply_payload = {
        "type": "reply",
        "message_id": message_id,
        "from": reply_by,
        "text": reply_text,
        "timestamp": msg.reply_at.isoformat(),
    }
    await voice_client_manager.send_to(msg.username, reply_payload)

    return reply_payload
