import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import LiveFeedsPage     from '../components/LiveFeedsPage'
import EventLogPage      from '../components/EventLogPage'
import VerifyQueuePage   from '../components/VerifyQueuePage'
import FieldCommsPage    from '../components/FieldCommsPage'
import GPSMapPage        from '../components/GPSMapPage'
import AnalyticsPage     from '../components/AnalyticsPage'
import HeatmapPage       from '../components/HeatmapPage'
import GalleryPage       from '../components/GalleryPage'
import ReportsPage       from '../components/ReportsPage'
import SentryPortalPage  from '../components/SentryPortalPage'
import SystemStatusPage  from '../components/SystemStatusPage'
import { authFetch, getUser } from '../utils/api'

const API = 'http://localhost:8000'

const PAGE_LABELS = {
  'live-feeds':    'Live Feeds',
  'event-log':     'Event Log',
  'verify-queue':  'Verify Queue',
  'field-comms':   'Field Communications',
  'gps-map':       'GPS Map',
  'analytics':     'Analytics',
  'heatmap':       'Heatmap',
  'gallery':       'Gallery',
  'reports':       'Reports',
  'sentry-portal': 'Sentry Portal',
  'system-status': 'System Status',
}

/* ── Live clock ── */
function LiveClock() {
  const [time, setTime] = useState(new Date().toLocaleTimeString())
  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <span style={{
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 12,
      color: 'var(--text-secondary)',
      letterSpacing: '0.05em',
    }}>
      {time}
    </span>
  )
}

export default function MonitorDashboard() {
  const navigate = useNavigate()
  const [view, setView]     = useState('live-feeds')
  const [badges, setBadges] = useState({ verify: 0, comms: 0 })

  const user = getUser() || {}
  const displayName = user.display_name || user.username || 'Operator'
  const initials = displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'OP'

  const fetchBadges = useCallback(() => {
    Promise.all([
      authFetch(`/api/detections/verify-queue`).then(r => r ? r.json() : []).catch(() => []),
      authFetch(`/api/comms/messages?unacked=true&limit=50`).then(r => r ? r.json() : []).catch(() => []),
    ]).then(([vq, msgs]) => {
      const vqArr = Array.isArray(vq) ? vq : (vq?.items || vq?.data || [])
      const msgsArr = Array.isArray(msgs) ? msgs : (msgs?.items || msgs?.data || [])
      setBadges({
        verify: vqArr.length,
        comms: msgsArr.length,
      })
    })
  }, [])

  useEffect(() => {
    fetchBadges()
    const id = setInterval(fetchBadges, 30000)
    return () => clearInterval(id)
  }, [fetchBadges])

  function handleViewChange(v) {
    setView(v)
    if (v === 'verify-queue') setBadges(p => ({ ...p, verify: 0 }))
    if (v === 'field-comms')  setBadges(p => ({ ...p, comms:  0 }))
  }

  const logout = () => {
    localStorage.removeItem('user')
    localStorage.removeItem('token')
    window.location.href = '/login'
  }

  function renderPage() {
    switch (view) {
      case 'live-feeds':    return <LiveFeedsPage />
      case 'event-log':    return <EventLogPage />
      case 'verify-queue':  return <VerifyQueuePage />
      case 'field-comms':  return <FieldCommsPage />
      case 'gps-map':      return <GPSMapPage />
      case 'analytics':    return <AnalyticsPage />
      case 'heatmap':      return <HeatmapPage />
      case 'gallery':      return <GalleryPage />
      case 'reports':      return <ReportsPage />
      case 'sentry-portal': return <SentryPortalPage />
      case 'system-status': return <SystemStatusPage />
      default:              return <LiveFeedsPage />
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--bg-base)' }}>
      <Sidebar
        view={view}
        setView={handleViewChange}
        badges={badges}
        onLogout={logout}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* TopBar — 52px */}
        <div style={{
          height: 52,
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border)',
          padding: '0 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            {PAGE_LABELS[view] || view}
          </span>
          <div style={{ flex: 1 }} />
          {/* Live indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div className="live-dot" />
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-green)', letterSpacing: '0.08em' }}>
              LIVE
            </span>
          </div>
          <LiveClock />
          {/* User chip */}
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(56,139,253,0.12)',
            border: '1px solid rgba(56,139,253,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, color: 'var(--accent-blue)',
            flexShrink: 0,
          }}>
            {initials}
          </div>
        </div>

        {/* Page content — only this scrolls */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: view === 'system-status' ? 0 : 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          minHeight: 0,
          scrollBehavior: 'smooth'
        }}>
          <div key={view} className="page-enter">
            {renderPage()}
          </div>
        </div>
      </div>
    </div>
  )
}
