import { useState, useEffect, useRef } from 'react'
import { Video, Radio, Activity, User, Mic } from 'lucide-react'
import WiFiSignalBars from '../components/WiFiSignalBars'
import BatteryIndicator from '../components/BatteryIndicator'
import { useNavigate } from 'react-router-dom'

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000)   return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return `${Math.floor(diff / 3600000)}h ago`
}

/* ── Toggle switch ── */
function Toggle({ on, onToggle, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
      <div className={`toggle-track${on ? ' on' : ''}`} onClick={onToggle}>
        <div className="toggle-thumb" />
      </div>
      <span style={{ fontSize: 13, color: on ? 'var(--text-primary)' : 'var(--text-muted)' }}>{label}</span>
    </label>
  )
}

/* ── Avatar ── */
function Avatar({ name, size = 36 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'rgba(56,139,253,0.15)', border: '1px solid rgba(56,139,253,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: 'var(--accent-blue)',
      flexShrink: 0,
    }}>
      {initials}
    </div>
  )
}

/* ── Tabs config ── */
const TABS = [
  { id: 'stream',  label: 'Stream',  Icon: Video },
  { id: 'comms',   label: 'Comms',   Icon: Radio },
  { id: 'status',  label: 'Status',  Icon: Activity },
  { id: 'profile', label: 'Profile', Icon: User },
]

export default function RecorderDashboard() {
  const navigate = useNavigate()
  const [tab, setTab]               = useState('stream')
  const [streaming, setStreaming]   = useState(false)
  const [nightVision, setNightVision] = useState(false)
  const [resolution, setResolution] = useState('1280x720')
  const [fps, setFps]               = useState('24')
  const [pttActive, setPttActive]   = useState(false)
  const [messages, setMessages]     = useState([])
  const [msgText, setMsgText]       = useState('')
  const [detections, setDetections] = useState([])
  const [profile, setProfile]       = useState(null)
  const [health, setHealth]         = useState(null)
  const [selfRec, setSelfRec]       = useState(null)
  const [locationText, setLocationText] = useState('')
  const [locationLoading, setLocationLoading] = useState(false)
  const wsDetRef = useRef(null)
  const wsCommsRef = useRef(null)
  const msgBottomRef = useRef(null)

  const myUser = sessionStorage.getItem('hs_username') || ''
  const myName = sessionStorage.getItem('hs_display_name') || 'Recorder'

  /* ── Fetch profile + self recorder info + messages ── */
  useEffect(() => {
    const hdrs = { credentials: 'include' }

    fetch('http://localhost:8000/api/users/me', hdrs)
      .then(r => r.ok ? r.json() : null).then(d => { if (d) setProfile(d) }).catch(() => {})

    fetch('http://localhost:8000/api/recorders/self', hdrs)
      .then(r => r.ok ? r.json() : null).then(d => { if (d) { setSelfRec(d); setStreaming(!!d.streaming); setNightVision(!!d.night_vision) } }).catch(() => {})

    fetch('http://localhost:8000/api/health', hdrs)
      .then(r => r.ok ? r.json() : null).then(d => setHealth(d)).catch(() => {})

    fetch('http://localhost:8000/api/comms/messages?limit=40', hdrs)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setMessages(Array.isArray(d) ? d : (d.messages || [])) }).catch(() => {})

    // WS: detections
    try {
      wsDetRef.current = new WebSocket('ws://localhost:8000/ws/detections')
      wsDetRef.current.onmessage = ev => {
        try {
          const msg = JSON.parse(ev.data)
          setDetections(prev => [msg, ...prev].slice(0, 3))
        } catch {}
      }
    } catch {}

    // WS: comms
    try {
      wsCommsRef.current = new WebSocket('ws://localhost:8000/ws/messages')
      wsCommsRef.current.onmessage = ev => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.content || msg.type === 'message') setMessages(prev => [...prev, msg])
        } catch {}
      }
    } catch {}

    return () => {
      try { wsDetRef.current?.close() } catch {}
      try { wsCommsRef.current?.close() } catch {}
    }
  }, []) // eslint-disable-line

  useEffect(() => {
    msgBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /* ── Actions ── */
  async function toggleStream() {
    const next = !streaming
    setStreaming(next)
    try {
      await fetch(next ? '/api/stream/start' : '/api/stream/stop', {
        method: 'POST', credentials: 'include',
      })
    } catch { setStreaming(!next) }
  }

  async function toggleNV() {
    const next = !nightVision
    setNightVision(next)
    try {
      await fetch('http://localhost:8000/api/recorders/self/night_vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: next }),
      })
    } catch { setNightVision(!next) }
  }

  async function applySettings() {
    try {
      await fetch('http://localhost:8000/api/recorders/self/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ resolution, fps: Number(fps) }),
      })
    } catch {}
  }

  async function sendMsg() {
    if (!msgText.trim()) return
    const optimistic = {
      id: Date.now(), content: msgText.trim(),
      sender_id: myUser, sender_name: myName,
      timestamp: new Date().toISOString(), _mine: true,
    }
    setMessages(prev => [...prev, optimistic])
    const txt = msgText
    setMsgText('')
    try {
      await fetch('http://localhost:8000/api/comms/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: txt, sender_id: myUser }),
      })
    } catch {}
  }

  async function pttStart() {
    setPttActive(true)
    try { await fetch('http://localhost:8000/api/ptt/start', { method: 'POST', credentials: 'include' }) } catch {}
  }
  async function pttStop() {
    setPttActive(false)
    try { await fetch('http://localhost:8000/api/ptt/stop', { method: 'POST', credentials: 'include' }) } catch {}
  }

  async function getLocation() {
    setLocationLoading(true)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async pos => {
        const { latitude: lat, longitude: lng } = pos.coords
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
          const d = await r.json()
          const addr = d.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
          setLocationText(addr)
          await fetch('http://localhost:8000/api/recorders/self/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ location: addr }),
          })
        } catch {}
        setLocationLoading(false)
      }, () => setLocationLoading(false))
    } else {
      setLocationLoading(false)
    }
  }

  async function sendCheckin() {
    try { await fetch('http://localhost:8000/api/recorders/self/checkin', { method: 'POST', credentials: 'include' }) } catch {}
  }

  async function logout() {
    try { await fetch('http://localhost:8000/api/auth/logout', { method: 'DELETE', credentials: 'include' }) } catch {}
    sessionStorage.clear()
    navigate('/login')
  }

  /* ── Top bar ── */
  const TopBar = () => (
    <div style={{
      height: 48, background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border)',
      padding: '0 16px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="18" height="18" viewBox="0 0 26 26">
          <polygon points="13,1 24,7 24,19 13,25 2,19 2,7"
            fill="none" stroke="#388bfd" strokeWidth="1.5" />
          <circle cx="13" cy="13" r="3" fill="#388bfd" />
        </svg>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted)' }}>
          HYBRID SENTRY
        </span>
      </div>
      <div style={{ textAlign: 'center', fontSize: 12 }}>
        <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
          {selfRec?.real_name || myName}
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{selfRec?.location}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <div className={`status-dot ${streaming ? 'online' : 'offline'}`} />
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
          color: streaming ? 'var(--accent-green)' : 'var(--text-muted)',
        }}>
          {streaming ? 'STREAMING' : 'IDLE'}
        </span>
      </div>
    </div>
  )

  /* ── Bottom tab bar ── */
  const BottomTabBar = () => (
    <div style={{
      height: 60, background: 'var(--bg-surface)',
      borderTop: '1px solid var(--border)',
      display: 'flex', flexShrink: 0,
    }}>
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={`bottom-tab${tab === id ? ' active' : ''}`}
          onClick={() => setTab(id)}
        >
          <Icon size={20} />
          {label}
        </button>
      ))}
    </div>
  )

  /* ══ TAB CONTENT ══ */

  /* Tab 1: Stream */
  const StreamTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, overflowY: 'auto' }}>
      <div className="panel">
        <div className="panel-header">
          <span>Camera Feed</span>
          {streaming && (
            <span className="badge badge-red" style={{ fontSize: 10 }}>
              <div className="live-dot" style={{ width: 5, height: 5 }} />REC
            </span>
          )}
        </div>
        <div style={{ padding: 0 }}>
          <div className="video-container" style={{ aspectRatio: '16/9' }}>
            {streaming ? (
              <img
                src="/api/stream/self"
                alt="self stream"
                style={{ width: '100%', display: 'block', filter: nightVision ? 'brightness(0.35) hue-rotate(115deg) saturate(3) contrast(1.2)' : 'none' }}
                onError={e => { e.target.style.display = 'none' }}
              />
            ) : (
              <div className="video-offline">
                <Video size={32} color="var(--text-muted)" />
                <span>Camera not active</span>
              </div>
            )}
          </div>
          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              style={{
                height: 44, borderRadius: 8, border: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: 14, letterSpacing: '0.04em',
                background: streaming ? 'var(--accent-red)' : 'var(--accent-green)',
                color: '#fff', transition: 'background 200ms',
              }}
              onClick={toggleStream}
            >
              {streaming ? 'Stop Streaming' : 'Start Streaming'}
            </button>
            <Toggle on={nightVision} onToggle={toggleNV} label="Night Vision" />
          </div>
        </div>
      </div>

      {/* Detections */}
      <div className="sub-panel">
        <div className="sub-panel-title">YOLO Detections</div>
        {detections.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
            No detections yet
          </div>
        ) : (
          detections.map((d, i) => {
            const col = d.label === 'person' ? '#388bfd' : d.label?.includes('vehicle') ? '#d29922' : '#f85149'
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--bg-elevated)', fontSize: 12 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: col, flexShrink: 0 }} />
                <span>{d.label || '—'}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{d.confidence ? `${Math.round(d.confidence * 100)}%` : ''}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>{d.timestamp ? timeAgo(d.timestamp) : ''}</span>
              </div>
            )
          })
        )}
      </div>

      {/* Settings */}
      <div className="sub-panel">
        <div className="sub-panel-title">Stream Settings</div>
        <div style={{ marginBottom: 10 }}>
          <label className="input-label">Resolution</label>
          <select className="input-field" value={resolution} onChange={e => setResolution(e.target.value)}>
            <option value="1920x1080">1920×1080</option>
            <option value="1280x720">1280×720</option>
            <option value="640x480">640×480</option>
          </select>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label className="input-label">FPS Limit</label>
          <select className="input-field" value={fps} onChange={e => setFps(e.target.value)}>
            {['30', '24', '15', '10'].map(f => <option key={f} value={f}>{f} fps</option>)}
          </select>
        </div>
        <button className="btn btn-primary btn-sm" onClick={applySettings}>Apply</button>
      </div>
    </div>
  )

  /* Tab 2: Comms */
  const CommsTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* PTT */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
        <button
          className={pttActive ? 'ptt-active' : ''}
          style={{
            width: 72, height: 72, borderRadius: '50%', border: '2px solid var(--border)',
            background: pttActive ? 'var(--accent-red)' : 'var(--bg-elevated)',
            cursor: 'pointer', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 3,
            color: pttActive ? '#fff' : 'var(--text-muted)',
            fontSize: 12, fontWeight: 700, transition: 'background 100ms',
          }}
          onMouseDown={pttStart} onMouseUp={pttStop}
          onTouchStart={pttStart} onTouchEnd={pttStop}
          onMouseLeave={() => { if (pttActive) pttStop() }}
        >
          <Mic size={22} />
          PTT
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', minHeight: 0 }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '20px 0' }}>
            No messages yet
          </div>
        ) : (
          messages.map((msg, i) => {
            const isMine = msg._mine || msg.sender_id === myUser
            return (
              <div key={msg.id || i} style={{ display: 'flex', flexDirection: isMine ? 'row-reverse' : 'row', gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>
                <Avatar name={msg.sender_name || msg.sender_id} size={28} />
                <div style={{ maxWidth: '70%' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, textAlign: isMine ? 'right' : 'left' }}>
                    {msg.sender_name || msg.sender_id}
                  </div>
                  <div style={{
                    background: isMine ? 'rgba(56,139,253,0.2)' : 'var(--bg-elevated)',
                    border: `1px solid ${isMine ? 'rgba(56,139,253,0.3)' : 'var(--border)'}`,
                    borderRadius: isMine ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                    padding: '8px 12px', fontSize: 13, color: 'var(--text-primary)',
                  }}>
                    {msg.content}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={msgBottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '10px 12px', borderTop: '1px solid var(--border)',
        display: 'flex', gap: 8, flexShrink: 0, background: 'var(--bg-surface)',
      }}>
        <input
          style={{
            flex: 1, height: 40, borderRadius: 20, padding: '0 16px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', fontSize: 13, outline: 'none',
          }}
          placeholder="Type a message…"
          value={msgText}
          onChange={e => setMsgText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') sendMsg() }}
        />
        <button
          style={{
            width: 40, height: 40, borderRadius: '50%', border: 'none',
            background: 'var(--accent-blue)', color: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16,
          }}
          onClick={sendMsg}
        >
          ↑
        </button>
      </div>
    </div>
  )

  /* Tab 3: Status */
  const StatusTab = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, padding: 12, overflowY: 'auto' }}>
      <div className="panel">
        <div className="panel-header">My Device</div>
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="sub-panel">
              <div className="sub-panel-title">Battery</div>
              <BatteryIndicator percent={selfRec?.battery ?? 0} showText large />
            </div>
            <div className="sub-panel">
              <div className="sub-panel-title">WiFi Signal</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <WiFiSignalBars dbm={selfRec?.wifi_strength} size={24} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selfRec?.wifi_strength ?? '—'} dBm</span>
              </div>
            </div>
            <div className="sub-panel">
              <div className="sub-panel-title">FPS</div>
              <span style={{ fontSize: 22, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-blue)' }}>
                {selfRec?.fps ?? '--'}
              </span>
            </div>
            <div className="sub-panel">
              <div className="sub-panel-title">Uptime</div>
              <span style={{ fontSize: 14, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}>
                {selfRec?.uptime ?? '--'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">Stream Stats</div>
        <div className="panel-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
            <span style={{ color: 'var(--text-muted)' }}>Detections today</span>
            <strong style={{ fontSize: 20, fontFamily: 'JetBrains Mono, monospace' }}>{selfRec?.detections_today ?? '—'}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
            <span style={{ color: 'var(--text-muted)' }}>Active since</span>
            <span>{selfRec?.active_since ? new Date(selfRec.active_since).toLocaleTimeString() : '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: 'var(--text-muted)' }}>Bandwidth</span>
            <span>{selfRec?.bandwidth_kbps ? `${selfRec.bandwidth_kbps} KB/s` : '—'}</span>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">Backend Connection</div>
        <div className="panel-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
            <span style={{ color: 'var(--text-muted)' }}>API</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div className={`status-dot ${health ? 'online' : 'offline'}`} />
              <span>{health ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 12 }}>
            <span style={{ color: 'var(--text-muted)' }}>Version</span>
            <span>{health?.version ?? '—'}</span>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => fetch('http://localhost:8000/api/health', { credentials: 'include' }).then(r => r.json()).then(d => setHealth(d)).catch(() => setHealth(null))}
          >
            Test Connection
          </button>
        </div>
      </div>
    </div>
  )

  /* Tab 4: Profile */
  const ProfileTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, overflowY: 'auto' }}>
      <div className="panel">
        <div className="panel-header">My Info</div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
          <Avatar name={profile?.realName || myName} size={48} />
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
            {profile?.realName || myName}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{profile?.username || myUser}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {profile?.branch} · {profile?.rank}
          </div>
          <span className="badge badge-blue">{profile?.role || 'recorder'}</span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">Location</div>
        <div className="panel-body">
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            Current: <span style={{ color: 'var(--text-primary)' }}>{selfRec?.location || locationText || '—'}</span>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginBottom: 8 }}
            onClick={getLocation}
            disabled={locationLoading}
          >
            {locationLoading ? <><div className="spinner" style={{ width: 10, height: 10 }} /> Locating…</> : '📍 Use GPS'}
          </button>
          <input
            className="input-field"
            placeholder="Or type location…"
            value={locationText}
            onChange={e => setLocationText(e.target.value)}
          />
          <button
            className="btn btn-primary btn-xs"
            style={{ marginTop: 6 }}
            onClick={async () => {
              try {
                await fetch('http://localhost:8000/api/recorders/self/location', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ location: locationText }),
                })
              } catch {}
            }}
          >
            Save
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">Actions</div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn btn-secondary btn-sm btn-full" onClick={sendCheckin}>
            Send Status Update
          </button>
          <button className="btn btn-danger btn-full" style={{ height: 40 }} onClick={logout}>
            Logout
          </button>
        </div>
      </div>
    </div>
  )

  const tabContent = {
    stream:  <StreamTab />,
    comms:   <CommsTab />,
    status:  <StatusTab />,
    profile: <ProfileTab />,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--bg-base)' }}>
      <TopBar />
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {tabContent[tab]}
      </div>
      <BottomTabBar />
    </div>
  )
}
