# 🛡️ HYBRID SENTRY

> Military-grade multi-node surveillance system — Raspberry Pi + PC, FastAPI backend, React frontend.

---

## What is this?

**Hybrid Sentry** is a dual-platform surveillance and perimeter monitoring system built for defence and maritime bases.

- **RPi 5 field nodes** capture video, run YOLOv8n detection, measure sound, and report GPS.
- **Laptop/PC monitor nodes** run YOLOv11n + OCR (plate, chest badge), process slow-motion clips, and serve the web UI.
- A **unified FastAPI server** on port `8000` handles auth, detections, GPS, cameras, zones, and recordings.
- A **React + Vite frontend** on port `5173` provides live feeds, event log, GPS map, and admin portal.

---

## Quick Start

### 1 — RPi Server (Field Camera Node)

```bash
# Install dependencies
pip install fastapi uvicorn sqlalchemy bcrypt python-jose[cryptography] opencv-python-headless ultralytics

# Run
cd backend
python main.py
```

### 2 — Monitor / Laptop

```bash
# Backend
pip install fastapi uvicorn sqlalchemy bcrypt python-jose[cryptography] opencv-python ultralytics easyocr

# Frontend
cd frontend
npm install
npm run dev
```

### 3 — Field Recorder (Mobile browser)

Navigate to `http://<server-ip>:5173`, log in with recorder PIN, go to **Recorder Mode**.

### 4 — Development

```bash
# Terminal 1 — backend
cd backend && python main.py

# Terminal 2 — frontend
cd frontend && npm run dev
```

> **After any config/schema change:** delete `backend/sentry.db` and restart `main.py` to recreate tables with new columns.

---

## GPIO Wiring (RPi 5)

| Component     | GPIO Pin |
|--------------|----------|
| Servo Pan    | GPIO 12  |
| Servo Tilt   | GPIO 13  |
| Sound Sensor | GPIO 17  |
| Buzzer       | GPIO 27  |
| IR LED       | GPIO 22  |

---

## Default Logins

| Role     | Username   | PIN      |
|----------|-----------|---------|
| Admin    | `admin`    | `12345678` |
| Monitor  | `monitor`  | `123456`   |
| Recorder | `recorder` | `1234`     |

---

## Features

### 🔐 Authentication
- Role-based PIN login (Admin 8-digit, Monitor 6-digit, Recorder 4-digit)
- JWT via httpOnly cookie + sessionStorage role
- Lockout after 3 failed attempts
- Self-registration with admin approval for Monitor/Admin roles

### 📷 Camera Management
- Named cameras (CAM-01, CAM-02, CAM-03 by default)
- Admin can rename, set position, and assign cameras to specific monitors
- Monitor users see only their assigned cameras (falls back to all if unassigned)

### 🧠 AI Detection (YOLO)
- **RPi** → YOLOv8n · **PC** → YOLOv11n (auto-selected at startup)
- Person tracking: posture, face concealment, clothing type, dwell time
- Vehicle: color (HSV), direction, loitering detection
- Drone: multi-frame confidence scoring
- Ship/vessel: size classification
- Crowd gathering detection
- Abandoned object alerts (escalating after 60 s)
- Night tactical: movement in low-light, crawling detection
- Perimeter breach alerts

### 🔤 OCR (PC / Laptop only)
- Number plate recognition via EasyOCR
- Chest badge text recognition
- Requires: `pip install easyocr`

### 🎬 Slow Motion Replay
- High-speed events (> 2.0 m/s) auto-save a clip
- Playback at 0.25×, 0.5×, or 1× from the Event Log
- Download option via `/api/recordings/clip/{event_id}`

### 🗺️ GPS + Zone Map (Leaflet)
- Live tracker trails per recorder callsign
- Admin can create/edit base zones (BASE, PERIMETER, ROAD, SEASIDE, LIMA, POST, CUSTOM)
- Satellite + Topo map layers

### 📋 Event Log
- Type-specific rich cards (Person, Vehicle, Drone, Ship, Abandoned, Crowd)
- Status-coded borders: 🟢 Confirmed · 🟡 Pending · 🔴 Escalated
- Inline slow replay button, map view, verification status

### ⚙️ Sentry Portal (Admin)
- User management (create, activate, deactivate, delete)
- Camera management (rename, position, assign to monitor)
- PIN change with multi-digit PIN boxes
- Operator ID card generator (PNG download)

---

## API Highlights

| Method | Endpoint | Auth |
|--------|----------|------|
| POST | `/api/auth/login` | Public |
| POST | `/api/auth/register` | Public |
| GET | `/api/system/info` | Public |
| GET | `/api/system/config` | Public |
| PUT | `/api/system/config` | Admin |
| GET | `/api/cameras` | Any |
| GET | `/api/cameras/my-assigned` | Any |
| PUT | `/api/cameras/{id}` | Admin |
| GET | `/api/recordings/clip/{event_id}` | Any |
| GET/POST/PUT/DELETE | `/api/base-zones` | Any (write: Admin) |

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Python 3.11, FastAPI, SQLAlchemy, SQLite |
| AI | Ultralytics YOLO (v8n / v11n), EasyOCR |
| Frontend | React 18, Vite, Leaflet, Axios |
| Auth | JWT (python-jose), bcrypt |
| Hardware | Raspberry Pi 5, USB cameras, GPIO sensors |

---

## License

MIT — For defence/research use. Handle data per your local data protection laws.
