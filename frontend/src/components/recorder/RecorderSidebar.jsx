import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Video, Radio, Activity, User, Settings, LogOut
} from 'lucide-react'
import { authFetch, getUser } from '../../utils/api'

const NAV_ITEMS = [
  { id: 'live-stream', label: 'Live Stream', icon: Video },
  { id: 'comms',       label: 'Field Comms', icon: Radio, badge: 'comms', badgeColor: 'blue' },
  { id: 'status',      label: 'My Status',   icon: Activity },
  { id: 'profile',     label: 'Profile',     icon: User },
]

const SYSTEM_ITEMS = [
  { id: 'settings', label: 'Settings', icon: Settings },
]

function NavItem({ item, active, badgeCount, badgeColor, onClick }) {
  const [hovered, setHovered] = useState(false)
  const Icon = item.icon
  const isActive = active
  return (
    <div
      className={`nav-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={item.label}
    >
      <Icon
        size={15}
        style={{
          opacity: isActive ? 1 : hovered ? 1 : 0.65,
          color: isActive ? 'var(--accent-blue)' : 'inherit',
          flexShrink: 0,
        }}
      />
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {item.label}
      </span>
      {badgeCount > 0 && (
        <span style={{
          marginLeft: 'auto',
          fontSize: 10,
          fontWeight: 700,
          fontFamily: 'JetBrains Mono, monospace',
          minWidth: 18,
          height: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 9,
          padding: '0 5px',
          background: badgeColor === 'red' ? 'var(--accent-red)' : 'var(--accent-blue)',
          color: '#fff',
          flexShrink: 0,
        }}>
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      )}
    </div>
  )
}

export default function RecorderSidebar({ view, setView, badges = {}, onLogout }) {
  const navigate = useNavigate()
  const [userHover, setUserHover] = useState(false)
  const [commsCount, setCommsCount] = useState(0)

  const user = getUser()
  const name = user?.display_name || user?.username || 'Operator'
  const userRole = user?.role || 'recorder'

  useEffect(() => {
    authFetch('/api/messages?unacked=true&limit=50').then(r => r ? r.json() : [])
      .then(msgs => setCommsCount(Array.isArray(msgs) ? msgs.length : (msgs?.count || 0)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (badges.comms !== undefined) setCommsCount(badges.comms)
  }, [badges])

  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'OP'

  function handleNavClick(id) {
    if (id === 'settings') {
      setView('settings')
      return
    }
    setView(id)
  }

  return (
    <div style={{
      width: 240,
      height: '100vh',
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      <div style={{
        height: 56,
        padding: '0 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}>
        <svg width="26" height="26" viewBox="0 0 26 26" className="logo-glow" style={{ flexShrink: 0 }}>
          <polygon points="13,1 24,7 24,19 13,25 2,19 2,7" fill="none" stroke="#388bfd" strokeWidth="1.5" />
          <circle cx="13" cy="13" r="3" fill="#388bfd" />
        </svg>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', color: 'var(--text-primary)' }}>
            HYBRID SENTRY
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>RECORDER UNIT</div>
        </div>
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
        <div style={{
          fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
          padding: '10px 16px 3px', textTransform: 'uppercase', letterSpacing: '1px'
        }}>
          Field Group
        </div>

        {NAV_ITEMS.map(item => (
          <NavItem
            key={item.id}
            item={item}
            active={view === item.id}
            badgeCount={item.badge === 'comms' ? commsCount : 0}
            badgeColor={item.badgeColor}
            onClick={() => handleNavClick(item.id)}
          />
        ))}

        <div style={{ height: 1, background: 'var(--border)', margin: '6px 16px' }} />

        <div style={{
          fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
          padding: '10px 16px 3px', textTransform: 'uppercase', letterSpacing: '1px'
        }}>
          System
        </div>

        {SYSTEM_ITEMS.map(item => (
          <NavItem
            key={item.id}
            item={item}
            active={view === item.id}
            badgeCount={0}
            onClick={() => handleNavClick(item.id)}
          />
        ))}
      </nav>

      <div
        style={{
          height: 56, borderTop: '1px solid var(--border)', padding: '0 12px',
          display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
          background: userHover ? 'var(--bg-elevated)' : 'transparent',
          transition: 'background 150ms', flexShrink: 0,
        }}
        onMouseEnter={() => setUserHover(true)}
        onMouseLeave={() => setUserHover(false)}
        title="Click to logout"
      >
        <div style={{
          width: 32, height: 32, borderRadius: '50%', background: 'rgba(56,139,253,0.12)',
          border: '1px solid rgba(56,139,253,0.25)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--accent-blue)', flexShrink: 0
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {name}
          </div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            {userRole}
          </div>
        </div>
        <LogOut
          size={16}
          style={{ color: 'var(--text-muted)', opacity: userHover ? 1 : 0, transition: 'opacity 150ms', flexShrink: 0 }}
          onClick={(e) => { e.stopPropagation(); onLogout && onLogout() }}
        />
      </div>
    </div>
  )
}
