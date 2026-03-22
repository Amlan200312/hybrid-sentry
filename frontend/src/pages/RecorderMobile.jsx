import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

const API    = 'http://localhost:8000'
const WS_URL = 'ws://localhost:8000'
const MONO   = "'JetBrains Mono', monospace"

/* ── Mobile-optimised Tab bar ───────────────────────────────── */
function MobileTabBar({ tabs, active, onChange }) {
  return (
    <div style={{
      display: 'flex',
      borderTop: '1px solid var(--border)',
      background: 'var(--bg-surface)',
      flexShrink: 0,
    }}>
      {tabs.map(t => (
        <div
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 4px',
            fontSize: 10,
            color: active === t.key ? 'var(--accent-blue)' : 'var(--text-secondary)',
            background: active === t.key ? 'rgba(56,139,253,0.08)' : 'transparent',
            borderTop: active === t.key ? '2px solid var(--accent-blue)' : '2px solid transparent',
            cursor: 'pointer',
            userSelect: 'none',
            gap: 2,
          }}
        >
          <span style={{ fontSize: 18 }}>{t.icon}</span>
          <span style={{ fontWeight: active === t.key ? 600 : 400 }}>{t.label}</span>
        </div>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   STREAM TAB — mobile optimised (portrait-first)
   ═══════════════════════════════════════════════════════════ */
function MobileStreamTab({ nodeId }) {
  const videoRef    = useRef(null)
  const canvasRef   = useRef(null)
  const wsRef       = useRef(null)
  const streamRef   = useRef(null)
  const intervalRef = useRef(null)

  const [streaming, setStreaming] = useState(false)
  const [wsState,   setWsState]   = useState('disconnected')
  const [recording, setRecording] = useState(false)
  const [recId,     setRecId]     = useState(null)

  function connectWS() {
    const token = sessionStorage.getItem('hs_token')
    const ws = new WebSocket(`${WS_URL}/ws/stream/${nodeId}?token=${token || ''}`)
    wsRef.current = ws
    ws.onopen  = () => setWsState('connected')
    ws.onerror = () => setWsState('error')
    ws.onclose = () => setWsState('disconnected')
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setStreaming(true)
      connectWS()

      intervalRef.current = setInterval(() => {
        if (!canvasRef.current || !videoRef.current || wsRef.current?.readyState !== WebSocket.OPEN) return
        const ctx = canvasRef.current.getContext('2d')
        ctx.drawImage(videoRef.current, 0, 0, 640, 360)
        canvasRef.current.toBlob(blob => {
          if (blob && wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(blob)
        }, 'image/jpeg', 0.65)
      }, 150)
    } catch (err) {
      alert('Camera error: ' + err.message)
    }
  }

  function stopCamera() {
    clearInterval(intervalRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    wsRef.current?.close()
    setStreaming(false)
    setWsState('disconnected')
  }

  async function toggleRec() {
    const token = sessionStorage.getItem('hs_token')
    const hdrs  = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    if (!recording) {
      const r = await fetch(`${API}/api/recordings/start/${nodeId}`, { method: 'POST', headers: hdrs, credentials: 'include' })
      if (r.ok) { const d = await r.json(); setRecId(d.recording_id); setRecording(true) }
    } else {
      await fetch(`${API}/api/recordings/stop/${recId}`, { method: 'POST', headers: hdrs, credentials: 'include' })
      setRecording(false); setRecId(null)
    }
  }

  useEffect(() => () => {
    clearInterval(intervalRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    wsRef.current?.close()
  }, [])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Status strip */}
      <div style={{ padding: '6px 12px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div className={`status-dot ${wsState === 'connected' ? 'online' : 'offline'}`} />
        <span style={{ fontFamily: MONO, fontSize: 11, color: wsState === 'connected' ? 'var(--accent-green)' : 'var(--text-muted)' }}>
          {wsState.toUpperCase()}
        </span>
        <div style={{ flex: 1 }} />
        {recording && <span style={{ fontSize: 10, color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: 4, fontFamily: MONO }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-red)', display: 'inline-block', animation: 'pulse 1s infinite' }} />REC
        </span>}
      </div>

      {/* Video */}
      <div style={{ flex: 1, background: '#000', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <video ref={videoRef} autoPlay muted playsInline style={{ display: streaming ? 'block' : 'none', width: '100%', height: '100%', objectFit: 'cover' }} />
        <canvas ref={canvasRef} width={640} height={360} style={{ display: 'none' }} />
        {!streaming && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ fontSize: 56, marginBottom: 16, opacity: 0.4 }}>📸</div>
            <button className="btn btn-primary" onClick={startCamera} style={{ fontSize: 16, padding: '14px 32px' }}>
              🎥 Start Camera
            </button>
          </div>
        )}
      </div>

      {/* Controls strip */}
      {streaming && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, background: 'var(--bg-surface)', flexShrink: 0 }}>
          <button className="btn btn-secondary" onClick={stopCamera} style={{ flex: 1 }}>⏹ Stop</button>
          <button className={`btn ${recording ? 'btn-danger' : 'btn-secondary'}`} onClick={toggleRec} style={{ flex: 1 }}>
            {recording ? '⏹ Stop Rec' : '⏺ Record'}
          </button>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   COMMS TAB — identical logic to PC, mobile layout
   ═══════════════════════════════════════════════════════════ */
function MobileCommsTab({ nodeId }) {
  const [messages, setMessages] = useState([])
  const [text,     setText]     = useState('')
  const [priority, setPriority] = useState('normal')
  const [sending,  setSending]  = useState(false)
  const [pttOn,    setPttOn]    = useState(false)
  const [loading,  setLoading]  = useState(true)
  const mediaRecRef = useRef(null)
  const chunksRef   = useRef([])
  const listRef     = useRef(null)

  useEffect(() => {
    const token = sessionStorage.getItem('hs_token')
    fetch(`${API}/api/comms/messages?limit=30`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : [])
      .then(d => { setMessages(Array.isArray(d) ? d : (d.items || [])); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  async function sendText() {
    if (!text.trim()) return
    setSending(true)
    const token = sessionStorage.getItem('hs_token')
    let gps = {}
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 }))
      gps = { gps_lat: pos.coords.latitude, gps_lng: pos.coords.longitude }
    } catch {}
    try {
      const r = await fetch(`${API}/api/comms/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ text, priority, node_id: nodeId, ...gps }),
        credentials: 'include',
      })
      if (r.ok) { const msg = await r.json(); setMessages(prev => [...prev, msg]); setText('') }
    } catch {}
    setSending(false)
  }

  async function startPTT() {
    setPttOn(true)
    chunksRef.current = []
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecRef.current = mr
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.start(200)
    } catch (err) {
      setPttOn(false)
      alert('Mic denied: ' + err.message)
    }
  }

  async function stopPTT() {
    setPttOn(false)
    const mr = mediaRecRef.current
    if (!mr) return
    mr.stop()
    mr.stream.getTracks().forEach(t => t.stop())
    mr.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      const form = new FormData()
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
        if (r.ok) { const msg = await r.json(); setMessages(prev => [...prev, msg]) }
      } catch {}
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Priority row */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 4, flexShrink: 0, background: 'var(--bg-surface)' }}>
        {['normal','medium','high','emergency'].map(p => (
          <button key={p} className={`btn btn-xs ${priority === p ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPriority(p)}>
            {p === 'emergency' ? '🚨' : p === 'high' ? '⚠️' : p === 'medium' ? '📢' : '📻'}
          </button>
        ))}
        <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4, textTransform: 'capitalize' }}>{priority}</span>
      </div>

      {/* Messages */}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
        {loading && <div style={{ textAlign: 'center', padding: 24 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>}
        {!loading && messages.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">📻</div>
            <div className="empty-state-sub">No messages yet</div>
          </div>
        )}
        {messages.map((m, i) => {
          const isMine = m.node_id === nodeId
          return (
            <div key={m.id || i} style={{ marginBottom: 8, display: 'flex', flexDirection: isMine ? 'row-reverse' : 'row', gap: 6 }}>
              <div style={{
                maxWidth: '78%', padding: '7px 11px',
                background: isMine ? 'rgba(56,139,253,0.18)' : 'var(--bg-elevated)',
                border: `1px solid ${isMine ? 'rgba(56,139,253,0.4)' : 'var(--border)'}`,
                borderRadius: 8, fontSize: 13, color: 'var(--text-primary)',
              }}>
                {m.text && <div>{m.text}</div>}
                {m.audio_filename && <div style={{ fontSize: 11, color: 'var(--accent-green)' }}>🎙 Audio</div>}
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 3, textAlign: 'right', fontFamily: MONO }}>
                  {m.created_at ? new Date(m.created_at).toLocaleTimeString() : ''}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Input */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          className={`btn btn-full ${pttOn ? 'btn-danger' : 'btn-secondary'}`}
          style={{ fontSize: 14, padding: '12px', fontWeight: 700 }}
          onPointerDown={startPTT}
          onPointerUp={stopPTT}
        >
          {pttOn ? '🔴 RELEASE TO SEND' : '🎙 HOLD TO TALK'}
        </button>
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="input" value={text} onChange={e => setText(e.target.value)}
            placeholder="Message…" onKeyDown={e => e.key === 'Enter' && sendText()} style={{ flex: 1, fontSize: 14 }} />
          <button className="btn btn-primary btn-sm" onClick={sendText} disabled={sending || !text.trim()}>
            {sending ? <div className="spinner" /> : '↑'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   STATUS TAB — condensed for mobile
   ═══════════════════════════════════════════════════════════ */
function MobileStatusTab({ nodeId }) {
  const [gps,     setGps]     = useState(null)
  const [battery, setBattery] = useState(null)
  const [latency, setLatency] = useState(null)
  const [uptime,  setUptime]  = useState(0)

  useEffect(() => {
    if (navigator.geolocation) {
      const id = navigator.geolocation.watchPosition(p => setGps({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }), () => {}, { enableHighAccuracy: true })
      return () => navigator.geolocation.clearWatch(id)
    }
  }, [])

  useEffect(() => {
    if (navigator.getBattery) {
      navigator.getBattery().then(b => {
        setBattery({ level: Math.round(b.level * 100), charging: b.charging })
        b.addEventListener('levelchange',    () => setBattery({ level: Math.round(b.level * 100), charging: b.charging }))
        b.addEventListener('chargingchange', () => setBattery({ level: Math.round(b.level * 100), charging: b.charging }))
      })
    }
  }, [])

  useEffect(() => {
    const start = Date.now()
    const id = setInterval(() => setUptime(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const ping = async () => {
      const t0 = Date.now()
      try { await fetch(`${API}/api/stats/ping`, { credentials: 'include' }); setLatency(Date.now() - t0) }
      catch { setLatency(null) }
    }
    ping()
    const id = setInterval(ping, 10000)
    return () => clearInterval(id)
  }, [])

  const hh = String(Math.floor(uptime / 3600)).padStart(2, '0')
  const mm  = String(Math.floor((uptime % 3600) / 60)).padStart(2, '0')
  const ss  = String(uptime % 60).padStart(2, '0')

  const rows = [
    { label: 'Node ID',   value: nodeId,                                      color: 'var(--accent-blue)' },
    { label: 'GPS',       value: gps ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}` : 'Acquiring…', color: gps ? 'var(--accent-green)' : 'var(--text-muted)' },
    { label: 'Accuracy',  value: gps ? `±${Math.round(gps.acc)}m` : '—',     color: 'var(--text-secondary)' },
    { label: 'Battery',   value: battery ? `${battery.level}% ${battery.charging ? '⚡' : ''}` : 'N/A', color: battery?.level > 20 ? 'var(--accent-green)' : 'var(--accent-red)' },
    { label: 'Latency',   value: latency != null ? `${latency}ms` : 'N/A',    color: latency < 100 ? 'var(--accent-green)' : latency < 300 ? 'var(--accent-amber)' : 'var(--accent-red)' },
    { label: 'Uptime',    value: `${hh}:${mm}:${ss}`,                         color: 'var(--text-primary)' },
  ]

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 0, flex: 1, overflowY: 'auto' }}>
      {rows.map(row => (
        <div key={row.label} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{row.label}</span>
          <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: row.color, textAlign: 'right' }}>{row.value}</span>
        </div>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   PROFILE TAB — mobile minimal
   ═══════════════════════════════════════════════════════════ */
function MobileProfileTab({ nodeId }) {
  const navigate    = useNavigate()
  const [user,      setUser]    = useState(null)
  const [form,      setForm]    = useState({})
  const [saving,    setSaving]  = useState(false)
  const [saveMsg,   setSaveMsg] = useState('')

  useEffect(() => {
    const token = sessionStorage.getItem('hs_token')
    fetch(`${API}/api/auth/me`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setUser(d); setForm({ display_name: d.display_name || '', callsign: d.callsign || '', unit: d.unit || '' }) } })
      .catch(() => {})
  }, [])

  async function save() {
    setSaving(true)
    const token = sessionStorage.getItem('hs_token')
    try {
      const r = await fetch(`${API}/api/users/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(form),
        credentials: 'include',
      })
      setSaveMsg(r.ok ? '✅ Saved' : '❌ Failed')
    } catch { setSaveMsg('❌ Network error') }
    setSaving(false)
    setTimeout(() => setSaveMsg(''), 3000)
  }

  async function logout() {
    const token = sessionStorage.getItem('hs_token')
    try { await fetch(`${API}/api/auth/logout`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: 'include' }) } catch {}
    sessionStorage.clear()
    navigate('/login')
  }

  const initials = (user?.display_name || 'OP').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
      {/* Avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#fff', border: '3px solid rgba(56,139,253,0.35)' }}>{initials}</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{user?.display_name || '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: MONO }}>Node: {nodeId}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
        {[
          { key: 'display_name', label: 'Display Name', placeholder: 'Your name' },
          { key: 'callsign',     label: 'Callsign',     placeholder: 'e.g. BRAVO-2' },
          { key: 'unit',         label: 'Unit',         placeholder: 'e.g. 3rd Squad' },
        ].map(f => (
          <div key={f.key}>
            <label className="input-label">{f.label}</label>
            <input className="input" placeholder={f.placeholder} value={form[f.key] || ''}
              onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={{ fontSize: 14 }} />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button className="btn btn-primary btn-full" onClick={save} disabled={saving} style={{ fontSize: 14 }}>
          {saving ? <><div className="spinner" /> Saving…</> : '💾 Save Changes'}
        </button>
        <button className="btn btn-danger btn-full" onClick={logout} style={{ fontSize: 14 }}>⏏ Logout</button>
        {saveMsg && <span style={{ textAlign: 'center', fontSize: 13, color: saveMsg.startsWith('✅') ? 'var(--accent-green)' : 'var(--accent-red)', animation: 'fadeIn 0.2s' }}>{saveMsg}</span>}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   ROOT — RecorderMobile
   ═══════════════════════════════════════════════════════════ */
export default function RecorderMobile() {
  const [tab, setTab] = useState('stream')

  const nodeId = sessionStorage.getItem('hs_node_id')
    || sessionStorage.getItem('hs_callsign')
    || sessionStorage.getItem('hs_username')
    || 'MOB-NODE'

  const TABS = [
    { key: 'stream',  icon: '🎥', label: 'Stream'  },
    { key: 'comms',   icon: '📡', label: 'Comms'   },
    { key: 'status',  icon: '📊', label: 'Status'  },
    { key: 'profile', icon: '👤', label: 'Profile' },
  ]

  return (
    <div style={{
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-base)',
      overflow: 'hidden',
      touchAction: 'manipulation',
    }}>
      {/* Compact header */}
      <div style={{
        height: 44,
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        flexShrink: 0,
        gap: 10,
      }}>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
          <polygon points="10,1 19,5.5 19,14.5 10,19 1,14.5 1,5.5" fill="none" stroke="#388bfd" strokeWidth="1.5" />
          <circle cx="10" cy="10" r="3.5" fill="#388bfd" opacity="0.7" />
        </svg>
        <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.08em' }}>
          HYBRID SENTRY
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: MONO }}>/ {nodeId}</span>
        <div style={{ flex: 1 }} />
        <div className="status-dot online" />
      </div>

      {/* Tab content — takes all available space */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {tab === 'stream'  && <MobileStreamTab  nodeId={nodeId} />}
        {tab === 'comms'   && <MobileCommsTab   nodeId={nodeId} />}
        {tab === 'status'  && <MobileStatusTab  nodeId={nodeId} />}
        {tab === 'profile' && <MobileProfileTab nodeId={nodeId} />}
      </div>

      {/* Bottom tab bar */}
      <MobileTabBar tabs={TABS} active={tab} onChange={setTab} />
    </div>
  )
}
