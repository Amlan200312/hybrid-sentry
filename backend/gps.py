"""
HYBRID SENTRY — GPS WebSocket Handler
Receives GPS coordinates from recorders, persists to DB,
broadcasts live positions to monitor dashboard.
"""

import asyncio
import json
import time
from datetime import datetime
from typing import Dict, Optional, List
from fastapi import WebSocket, WebSocketDisconnect
from database import SessionLocal, GpsLocation
from auth import ws_authenticate


class GpsConnectionManager:
    """Manages all active GPS WebSocket connections."""

    def __init__(self):
        # username → WebSocket
        self._recorder_ws: Dict[str, WebSocket] = {}
        # monitor WebSocket list
        self._monitor_ws: List[WebSocket] = []
        # Latest GPS state per recorder
        self._gps_state: Dict[str, dict] = {}

    # ─── Recorder connections ─────────────────────────────────
    def register_recorder(self, username: str, ws: WebSocket):
        self._recorder_ws[username] = ws

    def unregister_recorder(self, username: str):
        self._recorder_ws.pop(username, None)
        self._gps_state.pop(username, None)

    # ─── Monitor connections ──────────────────────────────────
    def register_monitor(self, ws: WebSocket):
        if ws not in self._monitor_ws:
            self._monitor_ws.append(ws)

    def unregister_monitor(self, ws: WebSocket):
        if ws in self._monitor_ws:
            self._monitor_ws.remove(ws)

    # ─── Broadcast helpers ────────────────────────────────────
    async def broadcast_to_monitors(self, data: dict):
        dead = []
        for ws in self._monitor_ws:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.unregister_monitor(ws)

    async def send_all_gps_to(self, ws: WebSocket):
        """Send current GPS state of all recorders to a new monitor."""
        try:
            await ws.send_json({
                "type": "gps_snapshot",
                "recorders": list(self._gps_state.values()),
            })
        except Exception:
            pass

    def get_all_positions(self) -> List[dict]:
        return list(self._gps_state.values())

    def get_position(self, username: str) -> Optional[dict]:
        return self._gps_state.get(username)


gps_manager = GpsConnectionManager()


# ─────────────────────────────────────────
# RECORDER GPS WEBSOCKET HANDLER
# ─────────────────────────────────────────
async def handle_recorder_gps_ws(
    websocket: WebSocket,
    token: str,
):
    """
    WebSocket endpoint for recorders to stream GPS.
    Endpoint: /ws/gps/{token}

    Client sends every 5 seconds:
    {
      "type": "gps_update",
      "latitude": 23.02,
      "longitude": 72.57,
      "accuracy": 15.0,
      "is_streaming": true
    }

    Server broadcasts to all monitors:
    {
      "type": "gps_update",
      "username": "bravo",
      "callsign": "BRAVO",
      "latitude": 23.02,
      "longitude": 72.57,
      "accuracy": 15.0,
      "is_streaming": true,
      "last_update": "2024-01-01T10:00:00",
      "is_online": true
    }
    """
    payload = ws_authenticate(token)
    if not payload:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    if payload["role"] != "recorder":
        await websocket.close(code=4003, reason="Forbidden — recorder only")
        return

    await websocket.accept()

    username = payload["username"]
    db = SessionLocal()

    # Get callsign for this recorder
    from database import get_callsign_for_recorder, CallsignConfig
    callsign = get_callsign_for_recorder(db, username)

    # Get callsign color
    cs_cfg = db.query(CallsignConfig).filter(
        CallsignConfig.recorder_username == username
    ).first()
    color_hex = cs_cfg.color_hex if cs_cfg else "#39ff14"

    gps_manager.register_recorder(username, websocket)

    # Initialize state as offline/no-coords
    gps_manager._gps_state[username] = {
        "username": username,
        "callsign": callsign,
        "color_hex": color_hex,
        "latitude": None,
        "longitude": None,
        "accuracy": None,
        "is_streaming": False,
        "is_online": True,
        "last_update": datetime.utcnow().isoformat(),
    }

    # Announce connection to monitors
    await gps_manager.broadcast_to_monitors({
        "type": "recorder_connected",
        "username": username,
        "callsign": callsign,
        "color_hex": color_hex,
    })

    try:
        while True:
            raw = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
            msg = json.loads(raw)

            if msg.get("type") == "gps_update":
                lat = msg.get("latitude")
                lng = msg.get("longitude")
                acc = msg.get("accuracy")
                is_streaming = msg.get("is_streaming", False)

                now_iso = datetime.utcnow().isoformat()

                # Update in-memory state
                gps_manager._gps_state[username].update({
                    "latitude": lat,
                    "longitude": lng,
                    "accuracy": acc,
                    "is_streaming": is_streaming,
                    "is_online": True,
                    "last_update": now_iso,
                })

                # Persist to DB (every update)
                if lat is not None and lng is not None:
                    gps_row = GpsLocation(
                        recorder_username=username,
                        latitude=lat,
                        longitude=lng,
                        accuracy=acc,
                        is_streaming=is_streaming,
                    )
                    db.add(gps_row)
                    try:
                        db.commit()
                    except Exception:
                        db.rollback()

                # Broadcast to all monitors
                await gps_manager.broadcast_to_monitors({
                    "type": "gps_update",
                    "username": username,
                    "callsign": callsign,
                    "color_hex": color_hex,
                    "latitude": lat,
                    "longitude": lng,
                    "accuracy": acc,
                    "is_streaming": is_streaming,
                    "is_online": True,
                    "last_update": now_iso,
                })

            elif msg.get("type") == "ping":
                await websocket.send_json({"type": "pong"})

    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    except Exception as e:
        print(f"[GPS] Error for {username}: {e}")
    finally:
        gps_manager.unregister_recorder(username)
        db.close()

        # Notify monitors of disconnection
        await gps_manager.broadcast_to_monitors({
            "type": "recorder_disconnected",
            "username": username,
            "callsign": callsign,
        })


# ─────────────────────────────────────────
# MONITOR GPS WEBSOCKET HANDLER
# ─────────────────────────────────────────
async def handle_monitor_gps_ws(
    websocket: WebSocket,
    token: str,
):
    """
    WebSocket endpoint for monitor to receive live GPS updates.
    Endpoint: /ws/gps/monitor/{token}
    """
    payload = ws_authenticate(token)
    if not payload:
        await websocket.close(code=4001, reason="Unauthorized")
        return
    if payload["role"] not in ("admin", "monitor"):
        await websocket.close(code=4003, reason="Forbidden")
        return

    await websocket.accept()
    gps_manager.register_monitor(websocket)

    # Send current state snapshot
    await gps_manager.send_all_gps_to(websocket)

    try:
        while True:
            # Keep connection alive, handle ping/pong
            raw = await asyncio.wait_for(websocket.receive_text(), timeout=60.0)
            msg = json.loads(raw)
            if msg.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    except Exception as e:
        print(f"[GPS] Monitor WS error: {e}")
    finally:
        gps_manager.unregister_monitor(websocket)
