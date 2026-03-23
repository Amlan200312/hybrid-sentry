import { useState, useEffect } from 'react'
import { Video, Radio, Activity, User, LogOut } from 'lucide-react'
import RecorderLiveStreamPage from '../components/recorder/RecorderLiveStreamPage'
import RecorderCommsPage from '../components/recorder/RecorderCommsPage'
import RecorderStatusPage from '../components/recorder/RecorderStatusPage'
import RecorderProfilePage from '../components/recorder/RecorderProfilePage'

export default function MobileRecorderDashboard() {
  const [view, setView] = useState('live-stream')

  function renderPage() {
    switch (view) {
      case 'live-stream': return <RecorderLiveStreamPage isMobile={true} />
      case 'comms':       return <RecorderCommsPage isMobile={true} />
      case 'status':      return <RecorderStatusPage isMobile={true} />
      case 'profile':     return <RecorderProfilePage isMobile={true} />
      default:            return <RecorderLiveStreamPage isMobile={true} />
    }
  }

  const TABS = [
    { id: 'live-stream', label: 'Stream', icon: Video },
    { id: 'comms',       label: 'Comms',  icon: Radio },
    { id: 'status',      label: 'Status', icon: Activity },
    { id: 'profile',     label: 'Profile',icon: User },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: 'var(--bg-base)' }}>
      {/* Header */}
      <div style={{
        height: 56, background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="24" height="24" viewBox="0 0 26 26" className="logo-glow">
            <polygon points="13,1 24,7 24,19 13,25 2,19 2,7" fill="none" stroke="#388bfd" strokeWidth="1.5" />
            <circle cx="13" cy="13" r="3" fill="#388bfd" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '1px' }}>RECORDER</span>
        </div>
        <LogOut size={20} color="var(--text-muted)" onClick={() => {
          localStorage.clear()
          sessionStorage.clear()
          window.location.href = '/login'
        }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 12 }}>
        {renderPage()}
      </div>

      {/* Bottom Tabs */}
      <div style={{
        height: 64, background: 'var(--bg-surface)', borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around', flexShrink: 0,
        paddingBottom: 'safe-area-inset-bottom'
      }}>
        {TABS.map(tab => {
          const active = view === tab.id
          const Icon = tab.icon
          return (
            <div
              key={tab.id}
              onClick={() => setView(tab.id)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                height: '100%', color: active ? 'var(--accent-blue)' : 'var(--text-muted)', cursor: 'pointer',
                minWidth: 44, minHeight: 44
              }}
            >
              <Icon size={24} style={{ marginBottom: 4 }} />
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500 }}>{tab.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
