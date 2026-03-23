import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import RecorderSidebar from '../components/recorder/RecorderSidebar'
import RecorderLiveStreamPage from '../components/recorder/RecorderLiveStreamPage'
import RecorderCommsPage from '../components/recorder/RecorderCommsPage'
import RecorderStatusPage from '../components/recorder/RecorderStatusPage'
import RecorderProfilePage from '../components/recorder/RecorderProfilePage'
import SentryPortalPage from '../components/SentryPortalPage'
import { getUser } from '../utils/api'

const PAGE_LABELS = {
  'live-stream': 'Live Stream',
  'comms':       'Field Communications',
  'status':      'My Status',
  'profile':     'Profile',
  'settings':    'Settings',
}

function LiveClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span style={{
      fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text-secondary)', letterSpacing: '0.05em'
    }}>
      {time.toLocaleTimeString()}
    </span>
  )
}

export default function RecorderDashboard() {
  const navigate = useNavigate()
  const [view, setView] = useState('live-stream')
  const [badges, setBadges] = useState({ comms: 0 })

  const user = getUser()
  const displayName = user?.display_name || user?.username || 'Operator'
  const initials = displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'OP'

  function handleViewChange(v) {
    setView(v)
    if (v === 'comms') setBadges({ comms: 0 })
  }

  const logout = () => {
    localStorage.removeItem('user')
    localStorage.removeItem('token')
    window.location.href = '/login'
  }

  function renderPage() {
    switch (view) {
      case 'live-stream': return <RecorderLiveStreamPage />
      case 'comms':       return <RecorderCommsPage />
      case 'status':      return <RecorderStatusPage />
      case 'profile':     return <RecorderProfilePage />
      case 'settings':    return <SentryPortalPage />
      default:            return <RecorderLiveStreamPage />
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--bg-base)' }}>
      <RecorderSidebar view={view} setView={handleViewChange} badges={badges} onLogout={logout} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* TopBar 52px */}
        <div style={{
          height: 52, background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
          padding: '0 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            {PAGE_LABELS[view] || view}
          </span>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div className="live-dot" style={{ width: 8, height: 8 }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-green)', letterSpacing: '0.08em' }}>LIVE</span>
          </div>
          <LiveClock />
          <div style={{
            width: 28, height: 28, borderRadius: '50%', background: 'rgba(56,139,253,0.12)',
            border: '1px solid rgba(56,139,253,0.25)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--accent-blue)', flexShrink: 0,
          }}>
            {initials}
          </div>
        </div>

        {/* Page content */}
        <div style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          padding: 16, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0,
        }}>
          {renderPage()}
        </div>
      </div>
    </div>
  )
}
