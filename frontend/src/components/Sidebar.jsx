import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Monitor, List, AlertTriangle, Radio, Map, BarChart2,
  Activity, Image, FileText, Settings, Cpu, LogOut
} from 'lucide-react'
import { authFetch, getUser } from '../utils/api'

const MONITOR_ITEMS = [
  { id: 'live-feeds',   label: 'Live Feeds',   icon: Monitor },
  { id: 'event-log',    label: 'Event Log',    icon: List },
  { id: 'verify-queue', label: 'Verify Queue', icon: AlertTriangle, badge: 'verify' },
  { id: 'field-comms',  label: 'Field Comms',  icon: Radio,         badge: 'comms' },
  { id: 'gps-map',      label: 'GPS Map',      icon: Map },
  { id: 'analytics',    label: 'Analytics',    icon: BarChart2 },
  { id: 'heatmap',      label: 'Heatmap',      icon: Activity },
  { id: 'gallery',      label: 'Gallery',      icon: Image },
  { id: 'reports',      label: 'Reports',      icon: FileText },
]

const SYSTEM_ITEMS = [
  { id: 'sentry-portal', label: 'Sentry Portal', icon: Settings },
  { id: 'system-status', label: 'System Status', icon: Cpu },
]

function NavItem({ item, active, count, onClick }) {
  const [hovered, setHovered] = useState(false)
  const Icon = item.icon
  
  const itemStyle = {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '7px 12px', margin: '1px 8px',
    borderRadius: '6px', cursor: 'pointer',
    fontSize: '12.5px', fontWeight: active ? 500 : 400,
    color: active ? '#388bfd' : (hovered ? 'var(--text-primary)' : 'var(--text-secondary)'),
    position: 'relative', userSelect: 'none',
    transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    background: active ? 'rgba(56,139,253,0.10)' : (hovered ? 'var(--bg-elevated)' : 'transparent'),
    transform: (!active && hovered) ? 'translateX(2px)' : 'none'
  }

  const iconStyle = {
    color: active ? '#388bfd' : 'inherit',
    opacity: (active || hovered) ? 1 : 0.6,
    transition: 'opacity 150ms ease'
  }

  return (
    <div style={itemStyle} onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <Icon size={15} style={iconStyle} />
      <span style={{flex: 1}}>{item.label}</span>
      {active && (
        <span style={{
          position: 'absolute', left: 0, top: '20%', height: '60%',
          width: '2.5px', background: '#388bfd',
          borderRadius: '0 2px 2px 0',
          animation: 'slideInBar 200ms cubic-bezier(0.4, 0, 0.2, 1)'
        }} />
      )}
      {item.badge && count > 0 && (
        <span style={{
          marginLeft: 'auto',
          fontSize: '10px', fontWeight: 700, fontFamily: 'monospace',
          minWidth: '18px', height: '18px', borderRadius: '9px', padding: '0 5px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: item.badge === 'verify' ? 'var(--accent-red)' : 'var(--accent-blue)',
          color: 'white',
          animation: 'badgePop 300ms ease'
        }}>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </div>
  )
}

export default function Sidebar({ view, setView }) {
  const navigate = useNavigate()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [verifyCount, setVerifyCount] = useState(0)
  const [commsCount, setCommsCount] = useState(0)
  const [userHovered, setUserHovered] = useState(false)
  
  const user = getUser() || {}
  const name = user.display_name || user.username || 'Operator'
  const initials = (name.substring(0,2) || 'OP').toUpperCase()

  const fetchBadges = () => {
    authFetch('/api/verify-queue')
      .then(r => r?.json())
      .then(data => {
        if (!data) return
        const arr = Array.isArray(data) ? data : (data?.items || data?.data || [])
        setVerifyCount(arr.length)
      }).catch(()=>{})
    
    authFetch('/api/comms/messages')
      .then(r => r?.json())
      .then(data => {
        if (!data) return
        const arr = Array.isArray(data) ? data : (data?.items || data?.data || [])
        setCommsCount(arr.filter(m => !m.acknowledged).length)
      }).catch(()=>{})
  }

  useEffect(() => {
    fetchBadges()
    const t = setInterval(fetchBadges, 30000)
    return () => clearInterval(t)
  }, [])

  const handleLogout = (e) => {
    e.stopPropagation()
    localStorage.clear()
    window.location.href = '/login'
  }

  const groupLabelStyle = {
    fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)',
    padding: '10px 16px 3px',
    textTransform: 'uppercase', letterSpacing: '1px'
  }

  return (
    <div style={{
      width: isCollapsed ? '64px' : '240px',
      height: '100vh',
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', flexShrink: 0,
      transition: 'width 0.2s ease',
    }}>
      {/* LOGO SECTION */}
      <div style={{
        height: '56px', padding: '0 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0,
        justifyContent: isCollapsed ? 'center' : 'flex-start',
      }}>
        <svg viewBox="0 0 24 24" width="24" height="24" style={{ animation: 'logoGlow 2.5s ease-in-out infinite', flexShrink: 0 }}>
          <polygon points="12,2 22,7 22,17 12,22 2,17 2,7" fill="none" stroke="#388bfd" strokeWidth="1.5"/>
          <circle cx="12" cy="12" r="3" fill="#388bfd"/>
        </svg>
        <div style={{display:'flex', flexDirection:'column', flex: 1, overflow: 'hidden',
          opacity: isCollapsed ? 0 : 1, transition: 'opacity 0.15s ease',
          pointerEvents: isCollapsed ? 'none' : 'auto',
        }}>
          <span style={{fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', color:'var(--text-primary)', whiteSpace: 'nowrap'}}>HYBRID SENTRY</span>
          <span style={{fontSize: '9px', color: 'var(--text-muted)'}}>v2.0</span>
        </div>
        <button
          onClick={() => setIsCollapsed(c => !c)}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', padding: '4px', borderRadius: 4,
            display: 'flex', alignItems: 'center', flexShrink: 0,
            fontSize: 14,
          }}
        >
          {isCollapsed ? '▶' : '◀'}
        </button>
      </div>

      {/* NAV SECTION */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
        {!isCollapsed && <div style={groupLabelStyle}>Monitor</div>}
        {MONITOR_ITEMS.map(item => (
          <div
            key={item.id}
            title={isCollapsed ? item.label : undefined}
            style={{
              display: 'flex', alignItems: 'center',
              gap: isCollapsed ? 0 : '10px',
              padding: isCollapsed ? '8px 0' : '7px 12px',
              margin: '1px 8px',
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              borderRadius: '6px', cursor: 'pointer',
              fontSize: '12.5px', fontWeight: view === item.id ? 500 : 400,
              color: view === item.id ? '#388bfd' : 'var(--text-secondary)',
              background: view === item.id ? 'rgba(56,139,253,0.10)' : 'transparent',
              transition: 'all 150ms ease',
            }}
            onClick={() => setView(item.id)}
          >
            <item.icon size={15} style={{ color: view === item.id ? '#388bfd' : 'inherit', flexShrink: 0 }} />
            <span style={{
              flex: 1, overflow: 'hidden', whiteSpace: 'nowrap',
              opacity: isCollapsed ? 0 : 1, transition: 'opacity 0.15s ease',
              width: isCollapsed ? 0 : 'auto',
            }}>{item.label}</span>
            {!isCollapsed && item.badge && (verifyCount + commsCount) > 0 && (
              <span style={{
                fontSize: '10px', fontWeight: 700, minWidth: '18px', height: '18px',
                borderRadius: '9px', padding: '0 5px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: item.badge === 'verify' ? 'var(--accent-red)' : 'var(--accent-blue)',
                color: 'white',
              }}>
                {item.badge === 'verify' ? (verifyCount > 99 ? '99+' : verifyCount) : (commsCount > 99 ? '99+' : commsCount)}
              </span>
            )}
          </div>
        ))}

        <div style={{margin: '8px 16px', height: '1px', background: 'var(--border)'}} />

        {!isCollapsed && <div style={groupLabelStyle}>System</div>}
        {SYSTEM_ITEMS.map(item => (
          <div
            key={item.id}
            title={isCollapsed ? item.label : undefined}
            style={{
              display: 'flex', alignItems: 'center',
              gap: isCollapsed ? 0 : '10px',
              padding: isCollapsed ? '8px 0' : '7px 12px',
              margin: '1px 8px',
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              borderRadius: '6px', cursor: 'pointer',
              fontSize: '12.5px',
              color: view === item.id ? '#388bfd' : 'var(--text-secondary)',
              background: view === item.id ? 'rgba(56,139,253,0.10)' : 'transparent',
              transition: 'all 150ms ease',
            }}
            onClick={() => {
              if (item.id === 'sentry-portal') window.location.href = '/portal'
              else setView(item.id)
            }}
          >
            <item.icon size={15} style={{ color: view === item.id ? '#388bfd' : 'inherit', flexShrink: 0 }} />
            <span style={{
              flex: 1, overflow: 'hidden', whiteSpace: 'nowrap',
              opacity: isCollapsed ? 0 : 1, transition: 'opacity 0.15s ease',
              width: isCollapsed ? 0 : 'auto',
            }}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* USER SECTION */}
      <div
        style={{
          height: '56px', borderTop: '1px solid var(--border)', padding: '0 12px',
          display: 'flex', alignItems: 'center', gap: '10px',
          cursor: 'pointer', transition: 'background 150ms ease',
          background: userHovered ? 'var(--bg-elevated)' : 'transparent',
          flexShrink: 0, justifyContent: isCollapsed ? 'center' : 'flex-start',
        }}
        onMouseEnter={() => setUserHovered(true)}
        onMouseLeave={() => setUserHovered(false)}
        onClick={handleLogout}
        title={isCollapsed ? `${name} — Click to logout` : undefined}
      >
        <div style={{
          width: '32px', height: '32px', background: 'rgba(56,139,253,0.12)',
          border: '1px solid rgba(56,139,253,0.25)', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '11px', fontWeight: 700, color: '#388bfd', flexShrink: 0
        }}>
          {initials}
        </div>
        <div style={{
          flex: 1, overflow: 'hidden',
          opacity: isCollapsed ? 0 : 1, transition: 'opacity 0.15s ease',
          pointerEvents: isCollapsed ? 'none' : 'auto',
        }}>
          <div style={{ fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {name}
          </div>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            {user.role || 'Monitor'}
          </div>
        </div>
        {!isCollapsed && (
          <LogOut
            size={16}
            style={{
              color: 'var(--text-muted)',
              opacity: userHovered ? 1 : 0,
              transition: 'opacity 150ms ease, transform 150ms ease',
              transform: userHovered ? 'translateX(0)' : 'translateX(4px)',
              cursor: 'pointer'
            }}
          />
        )}
      </div>
    </div>
  )
}
