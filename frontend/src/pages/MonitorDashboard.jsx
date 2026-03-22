import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import FeedGrid from '../components/FeedGrid'
import EventLog from '../components/EventLog'
import GPSMap from '../components/GPSMap'
import AnalyticsCharts from '../components/AnalyticsCharts'
import VerifyQueue from '../components/VerifyQueue'
import FieldCommsPage from '../components/FieldCommsPage'
import FrameHeatMap from '../components/FrameHeatMap'
import Gallery from '../components/Gallery'
import { useMonitorWS } from '../hooks/useWebSocket'

const API = 'http://localhost:8000'

const SECTION_LABELS = {
  FEEDS:     '🎥 Live Feeds',
  EVENTLOG:  '📋 Event Log',
  VERIFY:    '⚠️ Verify Queue',
  COMMS:     '📡 Field Communications',
  MAP:       '🗺️ GPS Map',
  ANALYTICS: '📊 Analytics',
  HEATMAP:   '🌡️ Heatmap',
  GALLERY:   '🖼️ Gallery',
  REPORTS:   '📄 Reports',
}

/* ── Clock ──────────────────────────────────────────────────── */
function LiveClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span style={{
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 13,
      color: 'var(--text-secondary)',
      letterSpacing: '0.05em',
    }}>
      {time.toLocaleTimeString()}
    </span>
  )
}

/* ── Detection counter pill ─────────────────────────────────── */
function CounterPill({ label, value, color }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: '3px 10px',
    }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 14,
        fontWeight: 600,
        color: value > 0 ? color : 'var(--text-muted)',
      }}>
        {value}
      </span>
    </div>
  )
}

/* ── Threat indicator ───────────────────────────────────────── */
function ThreatBadge({ counts }) {
  const total = (counts.humans || 0) + (counts.vehicles || 0) + (counts.aerial || 0) + (counts.unknown || 0)
  // Threat logic based on counts
  const level = total === 0 ? 'GREEN' : total >= 5 ? 'RED' : 'YELLOW'
  const colors = { GREEN: '#3fb950', YELLOW: '#d29922', RED: '#f85149' }
  const color  = colors[level]
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: 'var(--bg-elevated)',
      border: `1px solid ${color}33`,
      borderRadius: 8,
      padding: '4px 12px',
      fontSize: 12,
    }}>
      <div style={{
        width: 7, height: 7, borderRadius: '50%',
        background: color,
        animation: level !== 'GREEN' ? 'pulse 1.5s infinite' : 'none',
        flexShrink: 0,
      }} />
      <span style={{ color, fontWeight: 600, letterSpacing: '0.04em' }}>
        THREAT: {level}
      </span>
    </div>
  )
}

/* ── Reports section ────────────────────────────────────────── */
function ReportsSection() {
  const [downloading, setDownloading] = useState(null)
  const [lastGen, setLastGen]         = useState(null)

  useEffect(() => {
    const token = sessionStorage.getItem('hs_token')
    fetch(`${API}/api/reports/last-generated`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setLastGen(d.timestamp))
      .catch(() => {})
  }, [])

  async function download(type) {
    setDownloading(type)
    const token = sessionStorage.getItem('hs_token')
    try {
      const r = await fetch(`${API}/api/reports/${type}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      })
      if (!r.ok) throw new Error('Download failed')
      const blob = await r.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `sentry-report.${type}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Report download failed: ' + err.message)
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 640 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Reports</h2>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
        Download detection reports. All data is pulled from the live database.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          className="btn btn-secondary"
          onClick={() => download('pdf')}
          disabled={downloading === 'pdf'}
        >
          {downloading === 'pdf' ? <><div className="spinner" /> Generating…</> : '⬇ PDF Report'}
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => download('csv')}
          disabled={downloading === 'csv'}
        >
          {downloading === 'csv' ? <><div className="spinner" /> Generating…</> : '⬇ CSV Export'}
        </button>
      </div>

      {lastGen && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16 }}>
          Last generated: {new Date(lastGen).toLocaleString()}
        </p>
      )}
    </div>
  )
}

/* ── Main dashboard ─────────────────────────────────────────── */
export default function MonitorDashboard() {
  const navigate  = useNavigate()
  const [view, setView] = useState('FEEDS')
  const [badges, setBadges] = useState({ verify: 0, comms: 0 })

  const displayName = sessionStorage.getItem('hs_display_name') || 'Operator'

  const {
    connected,
    detectionCounts,
    newDetection,
    fieldMessage,
    unreadComms,
    pendingVerify,
    setPendingVerify,
    setUnreadComms,
  } = useMonitorWS()

  // Sync badge counts from WS
  useEffect(() => {
    if (pendingVerify > 0) {
      setBadges(p => ({ ...p, verify: pendingVerify }))
    }
  }, [pendingVerify])

  useEffect(() => {
    if (unreadComms > 0) {
      setBadges(p => ({ ...p, comms: unreadComms }))
    }
  }, [unreadComms])

  // Fetch initial badge counts every 30s
  const fetchBadges = useCallback(() => {
    const token = sessionStorage.getItem('hs_token')
    const hdrs  = token ? { Authorization: `Bearer ${token}` } : {}
    Promise.all([
      fetch(`${API}/api/detections/verify-queue`, { headers: hdrs, credentials: 'include' })
        .then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API}/api/comms/messages?unacked=true&limit=50`, { headers: hdrs, credentials: 'include' })
        .then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([vq, msgs]) => {
      const vCount = Array.isArray(vq)   ? vq.length   : (vq?.count || 0)
      const cCount = Array.isArray(msgs) ? msgs.length  : (msgs?.count || 0)
      setBadges({ verify: vCount, comms: cCount })
      setPendingVerify(vCount)
      setUnreadComms(cCount)
    })
  }, [setPendingVerify, setUnreadComms])

  useEffect(() => {
    fetchBadges()
    const id = setInterval(fetchBadges, 30000)
    return () => clearInterval(id)
  }, [fetchBadges])

  function handleViewChange(v) {
    setView(v)
    if (v === 'VERIFY') { setBadges(p => ({ ...p, verify: 0 })); setPendingVerify(0) }
    if (v === 'COMMS')  { setBadges(p => ({ ...p, comms: 0 }));  setUnreadComms(0) }
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

  const initials = displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'OP'

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-base)', overflow: 'hidden' }}>
      {/* Sidebar */}
      <Sidebar
        view={view}
        setView={handleViewChange}
        badges={badges}
        onLogout={logout}
      />

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Top bar — 52px */}
        <div style={{
          height: 52,
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          gap: 12,
          flexShrink: 0,
        }}>
          {/* Section label */}
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
            {SECTION_LABELS[view] || view}
          </span>

          <div style={{ flex: 1 }} />

          {/* Live detection counters from WS */}
          <CounterPill label="👤" value={detectionCounts.humans}   color="var(--accent-blue)" />
          <CounterPill label="🚗" value={detectionCounts.vehicles} color="var(--accent-amber)" />
          <CounterPill label="🚁" value={detectionCounts.aerial}   color="var(--accent-red)" />
          <CounterPill label="❓" value={detectionCounts.unknown}  color="var(--text-secondary)" />

          {/* Separator */}
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

          {/* Threat indicator */}
          <ThreatBadge counts={detectionCounts} />

          {/* Separator */}
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

          {/* Clock */}
          <LiveClock />

          {/* WS connection dot */}
          <div
            className={`status-dot ${connected ? 'online' : 'offline'}`}
            title={connected ? 'WebSocket connected' : 'WebSocket disconnected'}
          />

          {/* User avatar */}
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'var(--accent-blue)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: '#fff',
            border: '2px solid rgba(56,139,253,0.3)',
            flexShrink: 0,
          }}>
            {initials}
          </div>
        </div>

        {/* View area */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
          {view === 'FEEDS'     && <div style={{ flex: 1, overflow: 'hidden' }}><FeedGrid /></div>}
          {view === 'EVENTLOG'  && <div style={{ flex: 1, overflow: 'hidden' }}><EventLog /></div>}
          {view === 'ANALYTICS' && <div style={{ flex: 1, overflow: 'auto', padding: 20 }}><AnalyticsCharts /></div>}
          {view === 'MAP'       && <div style={{ flex: 1, overflow: 'hidden' }}><GPSMap /></div>}
          {view === 'COMMS'     && <div style={{ flex: 1, overflow: 'hidden' }}><FieldCommsPage /></div>}
          {view === 'VERIFY'    && <div style={{ flex: 1, overflow: 'auto', padding: 16 }}><VerifyQueue /></div>}
          {view === 'HEATMAP'   && <div style={{ flex: 1, overflow: 'auto', padding: 16 }}><FrameHeatMap /></div>}
          {view === 'GALLERY'   && <div style={{ flex: 1, overflow: 'auto' }}><Gallery /></div>}
          {view === 'REPORTS'   && <div style={{ flex: 1, overflow: 'auto' }}><ReportsSection /></div>}
        </div>
      </div>
    </div>
  )
}
