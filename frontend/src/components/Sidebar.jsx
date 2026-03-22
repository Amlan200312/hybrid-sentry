import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const API = 'http://localhost:8000'

const NAV_ITEMS = [
  { icon: '🎥', label: 'Live Feeds',    view: 'FEEDS',     badge: null },
  { icon: '📋', label: 'Event Log',     view: 'EVENTLOG',  badge: null },
  { icon: '⚠️', label: 'Verify Queue',  view: 'VERIFY',    badge: 'verify' },
  { icon: '📡', label: 'Field Comms',   view: 'COMMS',     badge: 'comms' },
  { icon: '🗺️', label: 'GPS Map',       view: 'MAP',       badge: null },
  { icon: '📊', label: 'Analytics',     view: 'ANALYTICS', badge: null },
  { icon: '🌡️', label: 'Heatmap',       view: 'HEATMAP',   badge: null },
  { icon: '🖼️', label: 'Gallery',       view: 'GALLERY',   badge: null },
  { icon: '📄', label: 'Reports',       view: 'REPORTS',   badge: null },
]

function RoleBadge({ role }) {
  const map = {
    admin:    { cls: 'badge-blue',  label: 'Admin'    },
    monitor:  { cls: 'badge-green', label: 'Monitor'  },
    recorder: { cls: 'badge-amber', label: 'Recorder' },
  }
  const { cls, label } = map[role] || { cls: 'badge-muted', label: role || 'User' }
  return <span className={`badge ${cls}`}>{label}</span>
}

function SidebarItem({ icon, label, active, badgeCount, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      className={`nav-item ${active ? 'active' : ''}`}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={label}
    >
      <span style={{ fontSize: 15, flexShrink: 0, width: 20, textAlign: 'center' }}>{icon}</span>
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
      {badgeCount > 0 && (
        <span style={{
          background: 'var(--accent-red)',
          color: '#fff',
          borderRadius: 10,
          padding: '1px 6px',
          fontSize: 10,
          fontWeight: 700,
          minWidth: 18,
          textAlign: 'center',
          flexShrink: 0,
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      )}
    </div>
  )
}

export default function Sidebar({ view, setView, badges = {}, onLogout }) {
  const navigate = useNavigate()
  const [userHover, setUserHover] = useState(false)
  const [userInfo, setUserInfo]   = useState(null)

  const role        = sessionStorage.getItem('hs_role')         || 'monitor'
  const displayName = sessionStorage.getItem('hs_display_name') || 'Operator'
  const callsign    = sessionStorage.getItem('hs_callsign')     || '—'

  // Try to fetch fresh user info
  useEffect(() => {
    const token = sessionStorage.getItem('hs_token')
    if (!token) return
    fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setUserInfo(d) })
      .catch(() => {})
  }, [])

  const name     = userInfo?.display_name || displayName
  const userRole = userInfo?.role         || role
  const initials = name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'OP'

  return (
    <div style={{
      width: 240,
      flexShrink: 0,
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
    }}>
      {/* ── Header ── */}
      <div style={{
        padding: '16px 16px 12px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <polygon points="10,1 19,5.5 19,14.5 10,19 1,14.5 1,5.5"
              fill="none" stroke="#388bfd" strokeWidth="1.5"/>
            <circle cx="10" cy="10" r="3.5" fill="#388bfd" opacity="0.7"/>
          </svg>
          <span style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '0.08em',
            fontFamily: 'Orbitron, sans-serif',
          }}>
            HYBRID SENTRY
          </span>
        </div>

        {/* Online status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="status-dot online" />
          <span style={{ fontSize: 11, color: 'var(--accent-green)', fontWeight: 500, letterSpacing: '0.06em' }}>
            ONLINE
          </span>
        </div>
      </div>

      {/* ── Nav items ── */}
      <nav style={{ flex: 1, padding: '6px 0', overflowY: 'auto' }}>
        {NAV_ITEMS.map(item => (
          <SidebarItem
            key={item.view}
            icon={item.icon}
            label={item.label}
            active={view === item.view}
            badgeCount={item.badge ? (badges[item.badge] || 0) : 0}
            onClick={() => setView(item.view)}
          />
        ))}

        {/* Divider + Portal */}
        <div style={{ margin: '6px 16px', height: 1, background: 'var(--border-muted)' }} />
        <SidebarItem
          icon="⚙️"
          label="Sentry Portal"
          active={view === 'PORTAL'}
          badgeCount={0}
          onClick={() => navigate('/portal')}
        />
      </nav>

      {/* ── User card ── */}
      <div
        style={{
          borderTop: '1px solid var(--border)',
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          background: userHover ? 'var(--bg-elevated)' : 'transparent',
          flexShrink: 0,
        }}
        onMouseEnter={() => setUserHover(true)}
        onMouseLeave={() => setUserHover(false)}
        onClick={onLogout}
        title="Click to logout"
      >
        {/* Avatar */}
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'var(--accent-blue)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, color: '#fff',
          flexShrink: 0,
          border: '2px solid rgba(56,139,253,0.35)',
        }}>
          {initials}
        </div>

        {/* Name + role */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 500, color: 'var(--text-primary)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            lineHeight: 1.3,
          }}>
            {name}
          </div>
          <RoleBadge role={userRole} />
        </div>

        {/* Logout icon on hover */}
        {userHover && (
          <div style={{ color: 'var(--accent-red)', fontSize: 16, flexShrink: 0 }} title="Logout">
            ⏏
          </div>
        )}
      </div>
    </div>
  )
}
