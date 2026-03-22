import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

const API    = 'http://localhost:8000'
const WS_URL = 'ws://localhost:8000'
const MONO   = "'JetBrains Mono', monospace"

/* ═══════════════════════════════════════════════════════════
   Common helpers
   ═══════════════════════════════════════════════════════════ */
function Tab({ label, icon, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 18px',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        color: active ? 'var(--accent-blue)' : 'var(--text-secondary)',
        borderBottom: active ? '2px solid var(--accent-blue)' : '2px solid transparent',
        transition: 'all 0.15s',
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: 15 }}>{icon}</span>
      {label}
    </div>
  )
}

function Pill({ label, value, color = 'var(--accent-green)' }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: '6px 12px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 2,
      minWidth: 80,
    }}>
      <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color }}>{value}</span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   TAB 1 — STREAM
   Camera feed streaming to backend via WebSocket frames
   ═══════════════════════════════════════════════════════════ */
function StreamTab({ nodeId }) {
  const videoRef    = useRef(null)
  const canvasRef   = useRef(null)
  const wsRef       = useRef(null)
  const streamRef   = useRef(null)
  const intervalRef = useRef(null)

  const [streaming,   setStreaming]   = useState(false)
  const [recording,   setRecording]  = useState(false)
  const [recId,       setRecId]      = useState(null)
  const [wsState,     setWsState]    = useState('disconnected')
  const [fps,         setFps]        = useState(0)
  const [frameCount,  setFrameCount] = useState(0)

  const connectWS = useCallback(() => {
    const token = sessionStorage.getItem('hs_token')
    const ws    = new WebSocket(`${WS_URL}/ws/stream/${nodeId}?token=${token || ''}`)
    wsRef.current = ws
    ws.onopen  = () => setWsState('connected')
    ws.onerror = () => setWsState('error')
    ws.onclose = () => setWsState('disconnected')
  }, [nodeId])

  // Start camera
  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, frameRate: 15 }, audio: false })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setStreaming(true)
      connectWS()

      // Send frames at ~10fps
      let count = 0
      const start = Date.now()
      intervalRef.current = setInterval(() => {
        if (!canvasRef.current || !videoRef.current || wsRef.current?.readyState !== WebSocket.OPEN) return
        const ctx = canvasRef.current.getContext('2d')
        ctx.drawImage(videoRef.current, 0, 0, 640, 360)
        canvasRef.current.toBlob(blob => {
          if (blob && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(blob)
            count++
            setFrameCount(count)
            const elapsed = (Date.now() - start) / 1000
            setFps(Math.round(count / elapsed))
          }
        }, 'image/jpeg', 0.7)
      }, 100)
    } catch (err) {
      alert('Camera access denied: ' + err.message)
    }
  }

  function stopCamera() {
    clearInterval(intervalRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    wsRef.current?.close()
    setStreaming(false)
    setWsState('disconnected')
    setFps(0)
    setFrameCount(0)
  }

  // Recording controls
  async function toggleRecording() {
    const token = sessionStorage.getItem('hs_token')
    const hdrs  = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }

    if (!recording) {
      const r = await fetch(`${API}/api/recordings/start/${nodeId}`, {
        method: 'POST', headers: hdrs, credentials: 'include',
      })
      if (r.ok) {
        const d = await r.json()
        setRecId(d.recording_id)
        setRecording(true)
      }
    } else {
      await fetch(`${API}/api/recordings/stop/${recId}`, {
        method: 'POST', headers: hdrs, credentials: 'include',
      })
      setRecording(false)
      setRecId(null)
    }
  }

  useEffect(() => {
    return () => {
      clearInterval(intervalRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      wsRef.current?.close()
    }
  }, [])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Vitals bar */}
      <div style={{ display: 'flex', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg-surface)', flexShrink: 0 }}>
        <Pill label="STATUS" value={streaming ? 'LIVE' : 'IDLE'} color={streaming ? 'var(--accent-green)' : 'var(--text-muted)'} />
        <Pill label="WS" value={wsState.toUpperCase()} color={wsState === 'connected' ? 'var(--accent-green)' : wsState === 'error' ? 'var(--accent-red)' : 'var(--text-muted)'} />
        <Pill label="FPS" value={fps.toString()} color="var(--accent-blue)" />
        <Pill label="FRAMES" value={frameCount.toString()} color="var(--text-secondary)" />
        <div style={{ flex: 1 }} />
        <button className={`btn btn-sm ${recording ? 'btn-danger' : 'btn-secondary'}`} onClick={toggleRecording} disabled={!streaming}>
          {recording ? '⏹ Stop Rec' : '⏺ Record'}
        </button>
        {recording && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-red)', animation: 'pulse 1s infinite' }} />}
      </div>

      {/* Video area */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', overflow: 'hidden', position: 'relative' }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{
            display: streaming ? 'block' : 'none',
            maxWidth: '100%',
            maxHeight: '100%',
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
        />
        <canvas ref={canvasRef} width={640} height={360} style={{ display: 'none' }} />

        {!streaming && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>📸</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>Camera not started</div>
            <button className="btn btn-primary" onClick={startCamera}>🎥 Start Camera</button>
          </div>
        )}

        {streaming && (
          <div style={{ position: 'absolute', top: 8, right: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={stopCamera}>⏹ Stop</button>
          </div>
        )}

        {/* REC indicator */}
        {recording && (
          <div style={{
            position: 'absolute', top: 10, left: 12,
            background: 'rgba(0,0,0,0.7)',
            border: '1px solid var(--accent-red)',
            borderRadius: 4,
            padding: '3px 8px',
            fontSize: 11,
            color: 'var(--accent-red)',
            fontFamily: MONO,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-red)', display: 'inline-block', animation: 'pulse 1s infinite' }} />
            REC
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   TAB 2 — COMMS
   PTT audio + text messaging
   ═══════════════════════════════════════════════════════════ */
function CommsTab({ nodeId }) {
  const [messages,   setMessages]   = useState([])
  const [text,       setText]       = useState('')
  const [priority,   setPriority]   = useState('normal')
  const [sending,    setSending]    = useState(false)
  const [pttActive,  setPttActive]  = useState(false)
  const [msgLoading, setMsgLoading] = useState(true)

  const mediaRecRef = useRef(null)
  const chunksRef   = useRef([])
  const listRef     = useRef(null)

  // Fetch existing messages
  useEffect(() => {
    const token = sessionStorage.getItem('hs_token')
    fetch(`${API}/api/comms/messages?limit=30`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : [])
      .then(d => { setMessages(Array.isArray(d) ? d : (d.items || [])); setMsgLoading(false) })
      .catch(() => setMsgLoading(false))
  }, [])

  // Scroll to bottom
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  async function sendText() {
    if (!text.trim()) return
    setSending(true)
    const token = sessionStorage.getItem('hs_token')

    // Get GPS
    let gps = {}
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 }))
      gps = { gps_lat: pos.coords.latitude, gps_lng: pos.coords.longitude }
    } catch {}

    try {
      const r = await fetch(`${API}/api/comms/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text, priority, node_id: nodeId, ...gps }),
        credentials: 'include',
      })
      if (r.ok) {
        const msg = await r.json()
        setMessages(prev => [...prev, msg])
        setText('')
      }
    } catch (err) {
      alert('Send failed: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  async function startPTT() {
    setPttActive(true)
    chunksRef.current = []
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecRef.current = mr
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.start(200)
    } catch (err) {
      setPttActive(false)
      alert('Microphone access denied: ' + err.message)
    }
  }

  async function stopPTT() {
    setPttActive(false)
    const mr = mediaRecRef.current
    if (!mr) return
    mr.stop()
    mr.stream.getTracks().forEach(t => t.stop())

    mr.onstop = async () => {
      const blob  = new Blob(chunksRef.current, { type: 'audio/webm' })
      const form  = new FormData()
      form.append('audio', blob, 'ptt.webm')
      form.append('node_id', nodeId)
      form.append('priority', priority)

      const token = sessionStorage.getItem('hs_token')
      try {
        const r = await fetch(`${API}/api/comms/send`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: form,
          credentials: 'include',
        })
        if (r.ok) {
          const msg = await r.json()
          setMessages(prev => [...prev, msg])
        }
      } catch {}
    }
  }

  const PRIORITIES = [
    { key: 'normal',    label: '📻 Normal',    cls: 'btn-secondary' },
    { key: 'medium',    label: '📢 Medium',    cls: 'btn-secondary' },
    { key: 'high',      label: '⚠️ High',       cls: 'btn-secondary' },
    { key: 'emergency', label: '🚨 Emergency', cls: 'btn-danger'    },
  ]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Priority selector */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0, background: 'var(--bg-surface)' }}>
        {PRIORITIES.map(p => (
          <button key={p.key}
            className={`btn btn-sm ${priority === p.key ? 'btn-primary' : p.cls}`}
            onClick={() => setPriority(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Message list */}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
        {msgLoading && <div style={{ textAlign: 'center', padding: 24 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>}
        {!msgLoading && messages.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">📻</div>
            <div className="empty-state-sub">No messages yet. Send the first one.</div>
          </div>
        )}
        {messages.map((m, i) => {
          const isMine = m.node_id === nodeId
          return (
            <div key={m.id || i} style={{ marginBottom: 10, display: 'flex', flexDirection: isMine ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-end' }}>
              <div style={{
                maxWidth: '72%',
                background: isMine ? 'rgba(56,139,253,0.18)' : 'var(--bg-elevated)',
                border: `1px solid ${isMine ? 'rgba(56,139,253,0.4)' : 'var(--border)'}`,
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 13,
                color: 'var(--text-primary)',
              }}>
                {!isMine && <div style={{ fontSize: 10, color: 'var(--accent-blue)', fontFamily: MONO, marginBottom: 4, fontWeight: 600 }}>{m.callsign || m.node_id || '—'}</div>}
                {m.text && <div style={{ lineHeight: 1.5 }}>{m.text}</div>}
                {m.audio_filename && <div style={{ fontSize: 11, color: 'var(--accent-green)', marginTop: 4 }}>🎙 Audio message</div>}
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right', fontFamily: MONO }}>
                  {m.created_at ? new Date(m.created_at).toLocaleTimeString() : ''}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Input area */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg-surface)' }}>
        {/* PTT button */}
        <button
          className={`btn btn-full ${pttActive ? 'btn-danger' : 'btn-secondary'}`}
          style={{ marginBottom: 8, fontSize: 15, padding: '12px', fontWeight: 700 }}
          onMouseDown={startPTT}
          onMouseUp={stopPTT}
          onTouchStart={startPTT}
          onTouchEnd={stopPTT}
        >
          {pttActive ? '🔴 RELEASING…' : '🎙 HOLD TO TALK'}
        </button>

        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className="input"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Type message…"
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendText()}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary btn-sm" onClick={sendText} disabled={sending || !text.trim()}>
            {sending ? <div className="spinner" /> : '↑ Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   TAB 3 — STATUS
   Real-time GPS, battery, latency, uptime
   ═══════════════════════════════════════════════════════════ */
function StatusTab({ nodeId }) {
  const [gps,     setGps]     = useState(null)
  const [battery, setBattery] = useState(null)
  const [latency, setLatency] = useState(null)
  const [uptime,  setUptime]  = useState(0)
  const [wsOk,    setWsOk]    = useState(false)

  // GPS watch
  useEffect(() => {
    if (!navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      pos => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
      () => {},
      { enableHighAccuracy: true }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  // Battery
  useEffect(() => {
    if (!navigator.getBattery) return
    navigator.getBattery().then(b => {
      setBattery({ level: Math.round(b.level * 100), charging: b.charging })
      b.addEventListener('levelchange',   () => setBattery({ level: Math.round(b.level * 100), charging: b.charging }))
      b.addEventListener('chargingchange', () => setBattery({ level: Math.round(b.level * 100), charging: b.charging }))
    })
  }, [])

  // Uptime counter
  useEffect(() => {
    const start = Date.now()
    const id    = setInterval(() => setUptime(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  // Ping latency to backend
  useEffect(() => {
    async function ping() {
      const t0 = Date.now()
      try {
        await fetch(`${API}/api/stats/ping`, { credentials: 'include' })
        setLatency(Date.now() - t0)
        setWsOk(true)
      } catch {
        setLatency(null)
        setWsOk(false)
      }
    }
    ping()
    const id = setInterval(ping, 10000)
    return () => clearInterval(id)
  }, [])

  // Format uptime
  const hh = String(Math.floor(uptime / 3600)).padStart(2, '0')
  const mm  = String(Math.floor((uptime % 3600) / 60)).padStart(2, '0')
  const ss  = String(uptime % 60).padStart(2, '0')

  return (
    <div style={{ padding: 24, maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Node Status</h3>

      {/* Node ID */}
      <div className="card" style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Node ID</div>
        <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: 'var(--accent-blue)' }}>{nodeId}</div>
      </div>

      {/* GPS */}
      <div className="card" style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>📍 GPS Location</div>
        {gps ? (
          <>
            <div style={{ fontFamily: MONO, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
              {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Accuracy: ±{Math.round(gps.acc)}m</div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Acquiring GPS…</div>
        )}
      </div>

      {/* Battery */}
      <div className="card" style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>🔋 Battery</div>
        {battery ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ height: 8, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  width: `${battery.level}%`, height: '100%', borderRadius: 4,
                  background: battery.level > 50 ? 'var(--accent-green)' : battery.level > 20 ? 'var(--accent-amber)' : 'var(--accent-red)',
                  transition: 'width 0.5s ease',
                }} />
              </div>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: battery.level > 20 ? 'var(--accent-green)' : 'var(--accent-red)', flexShrink: 0 }}>
              {battery.level}% {battery.charging ? '⚡' : ''}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Battery API not available</div>
        )}
      </div>

      {/* Network */}
      <div className="card" style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>📶 Network</div>
        <div style={{ display: 'flex', gap: 20 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Backend Latency</div>
            <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: latency == null ? 'var(--text-muted)' : latency < 100 ? 'var(--accent-green)' : latency < 300 ? 'var(--accent-amber)' : 'var(--accent-red)' }}>
              {latency != null ? `${latency}ms` : 'N/A'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Server</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className={`status-dot ${wsOk ? 'online' : 'offline'}`} />
              <span style={{ fontFamily: MONO, fontSize: 13, color: wsOk ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                {wsOk ? 'REACHABLE' : 'OFFLINE'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Uptime */}
      <div className="card" style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>⏱ Session Uptime</div>
        <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.06em' }}>
          {hh}:{mm}:{ss}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   TAB 4 — PROFILE
   Real user data, editable fields
   ═══════════════════════════════════════════════════════════ */
function ProfileTab({ nodeId }) {
  const navigate      = useNavigate()
  const [user,        setUser]      = useState(null)
  const [loading,     setLoading]   = useState(true)
  const [form,        setForm]      = useState({})
  const [saving,      setSaving]    = useState(false)
  const [saveMsg,     setSaveMsg]   = useState('')

  useEffect(() => {
    const token = sessionStorage.getItem('hs_token')
    fetch(`${API}/api/auth/me`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) { setUser(d); setForm({ display_name: d.display_name || '', callsign: d.callsign || '', unit: d.unit || '' }) }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function save() {
    setSaving(true)
    setSaveMsg('')
    const token = sessionStorage.getItem('hs_token')
    try {
      const r = await fetch(`${API}/api/users/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(form),
        credentials: 'include',
      })
      if (r.ok) {
        setSaveMsg('✅ Saved')
        sessionStorage.setItem('hs_display_name', form.display_name || user?.display_name)
        sessionStorage.setItem('hs_callsign', form.callsign || user?.callsign)
      } else {
        setSaveMsg('❌ Save failed')
      }
    } catch {
      setSaveMsg('❌ Network error')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(''), 3000)
    }
  }

  async function logout() {
    const token = sessionStorage.getItem('hs_token')
    try {
      await fetch(`${API}/api/auth/logout`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      })
    } catch {}
    sessionStorage.clear()
    navigate('/login')
  }

  if (loading) return <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}><div className="spinner" /></div>

  const initials = (user?.display_name || 'OP').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div style={{ padding: 24, maxWidth: 480 }}>
      {/* Avatar / identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <div style={{
          width: 60, height: 60, borderRadius: '50%',
          background: 'var(--accent-blue)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 800, color: '#fff',
          border: '3px solid rgba(56,139,253,0.35)',
        }}>
          {initials}
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{user?.display_name || '—'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: MONO }}>{user?.callsign || '—'} • Node {nodeId}</div>
          <span className="badge badge-amber" style={{ marginTop: 4 }}>Recorder</span>
        </div>
      </div>

      {/* Editable fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
        <div>
          <label className="input-label">Display Name</label>
          <input className="input" value={form.display_name || ''} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} />
        </div>
        <div>
          <label className="input-label">Callsign</label>
          <input className="input" value={form.callsign || ''} onChange={e => setForm(f => ({ ...f, callsign: e.target.value }))} placeholder="e.g. ALPHA-1" />
        </div>
        <div>
          <label className="input-label">Unit</label>
          <input className="input" value={form.unit || ''} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="e.g. Bravo Company, 2nd Platoon" />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <><div className="spinner" /> Saving…</> : '💾 Save Changes'}
        </button>
        <button className="btn btn-danger" onClick={logout}>⏏ Logout</button>
        {saveMsg && (
          <span style={{ fontSize: 13, color: saveMsg.startsWith('✅') ? 'var(--accent-green)' : 'var(--accent-red)', animation: 'fadeIn 0.2s ease' }}>
            {saveMsg}
          </span>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   ROOT — RecorderPC
   ═══════════════════════════════════════════════════════════ */
export default function RecorderPC() {
  const [tab, setTab] = useState('stream')
  const nodeId = sessionStorage.getItem('hs_node_id')
    || sessionStorage.getItem('hs_callsign')
    || sessionStorage.getItem('hs_username')
    || 'PC-NODE'

  const TABS = [
    { key: 'stream',  icon: '🎥', label: 'Stream'  },
    { key: 'comms',   icon: '📡', label: 'Comms'   },
    { key: 'status',  icon: '📊', label: 'Status'  },
    { key: 'profile', icon: '👤', label: 'Profile' },
  ]

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        height: 52,
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        flexShrink: 0,
        gap: 12,
      }}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <polygon points="10,1 19,5.5 19,14.5 10,19 1,14.5 1,5.5" fill="none" stroke="#388bfd" strokeWidth="1.5" />
          <circle cx="10" cy="10" r="3.5" fill="#388bfd" opacity="0.7" />
        </svg>
        <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.08em' }}>
          SENTRY POST
        </span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-muted)' }}>— {nodeId}</span>
        <div style={{ flex: 1 }} />
        <div className="status-dot online" title="Recorder mode" />
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        padding: '0 8px',
        flexShrink: 0,
      }}>
        {TABS.map(t => <Tab key={t.key} {...t} active={tab === t.key} onClick={() => setTab(t.key)} />)}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'stream'  && <StreamTab  nodeId={nodeId} />}
        {tab === 'comms'   && <CommsTab   nodeId={nodeId} />}
        {tab === 'status'  && <div style={{ overflowY: 'auto', flex: 1 }}><StatusTab nodeId={nodeId} /></div>}
        {tab === 'profile' && <div style={{ overflowY: 'auto', flex: 1 }}><ProfileTab nodeId={nodeId} /></div>}
      </div>
    </div>
  )
}
