import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

/* ── Style injection ──────────────────────────────────────────── */
const STYLE_ID = 'hs-select-styles'
if (!document.getElementById(STYLE_ID)) {
  const s = document.createElement('style')
  s.id = STYLE_ID
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
    .hs-sel-fade { animation: fadeIn 0.4s ease; }
    .hs-card-hover-blue:hover  { border-color: #388bfd !important; background: #161f2e !important; }
    .hs-card-hover-green:hover { border-color: #3fb950 !important; background: #16261e !important; }
  `
  document.head.appendChild(s)
}

const ROLE_COLORS = {
  admin:    { bg: '#1f2c4a', color: '#79c0ff', label: 'ADMIN' },
  monitor:  { bg: '#1f2c1f', color: '#56d364', label: 'MONITOR' },
  recorder: { bg: '#2c1f1f', color: '#ffa657', label: 'RECORDER' },
}

export default function RoleSelect() {
  const navigate  = useNavigate()
  const [user, setUser] = useState(null)

  /* ── Verify session + fetch display info ─────────────────── */
  useEffect(() => {
    const token = sessionStorage.getItem('hs_token')
    if (!token) { navigate('/login', { replace: true }); return }

    const cached = {
      role:         sessionStorage.getItem('hs_role')         || 'recorder',
      display_name: sessionStorage.getItem('hs_display_name') || 'Operative',
      username:     sessionStorage.getItem('hs_username')     || '',
    }
    setUser(cached)

    // Optionally refresh from server
    fetch(`${API}/api/auth/me`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          sessionStorage.setItem('hs_display_name', d.display_name || d.username)
          sessionStorage.setItem('hs_role', d.role)
          setUser({ role: d.role, display_name: d.display_name || d.username, username: d.username })
        }
      })
      .catch(() => {})
  }, [navigate])

  function handleLogout() {
    fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {})
    sessionStorage.clear()
    navigate('/login', { replace: true })
  }

  function enterFieldView() {
    const isMobile = window.innerWidth < 768 || /Mobi|Android/i.test(navigator.userAgent)
    navigate(isMobile ? '/record/mobile' : '/record/pc', { replace: true })
  }

  function enterCommandCenter() {
    navigate('/dashboard', { replace: true })
  }

  if (!user) return null

  const role = user.role.toLowerCase()
  const roleInfo = ROLE_COLORS[role] || ROLE_COLORS.recorder
  const canMonitor = role === 'admin' || role === 'monitor'

  /* ── Styles ──────────────────────────────────────────────────── */
  const st = {
    page: {
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#0d1117', fontFamily: "'Inter', sans-serif",
      padding: '40px 16px',
    },
    badge: {
      display: 'inline-block', background: roleInfo.bg, color: roleInfo.color,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
      padding: '3px 10px', borderRadius: 20, marginTop: 6,
    },
    welcome: { color: '#e6edf3', fontSize: 20, fontWeight: 600, textAlign: 'center' },
    subtitle: { color: '#8b949e', fontSize: 14, marginTop: 6, marginBottom: 40, textAlign: 'center' },
    cards: {
      display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center',
      width: '100%', maxWidth: 760,
    },
    card: (disabled) => ({
      background: '#161b22', border: '1px solid #30363d', borderRadius: 12,
      padding: '32px 28px', flex: '1 1 300px', maxWidth: 340,
      cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
      opacity: disabled ? 0.4 : 1, boxShadow: '0 4px 16px #0000004d',
      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
    }),
    icon: { fontSize: 48, marginBottom: 16 },
    cardTitle: { color: '#e6edf3', fontSize: 16, fontWeight: 600, marginBottom: 10 },
    cardDesc: { color: '#8b949e', fontSize: 13, lineHeight: 1.6, marginBottom: 24, flexGrow: 1 },
    btnBlue: {
      background: '#388bfd', color: '#fff', border: 'none', borderRadius: 6,
      padding: '9px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer', width: '100%',
      transition: 'background 0.2s',
    },
    btnGreen: {
      background: '#238636', color: '#fff', border: 'none', borderRadius: 6,
      padding: '9px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer', width: '100%',
      transition: 'background 0.2s',
    },
    btnDisabled: {
      background: '#21262d', color: '#6e7681', border: 'none', borderRadius: 6,
      padding: '9px 20px', fontSize: 13, fontWeight: 500, cursor: 'not-allowed', width: '100%',
    },
    logout: {
      marginTop: 36, color: '#6e7681', fontSize: 12, background: 'none',
      border: 'none', cursor: 'pointer', textDecoration: 'underline',
    },
  }

  return (
    <div style={st.page}>
      <div className="hs-sel-fade" style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={st.welcome}>Welcome back, {user.display_name}</div>
        <div style={st.badge}>{roleInfo.label}</div>
        <div style={st.subtitle}>Choose your workspace</div>
      </div>

      <div style={st.cards} className="hs-sel-fade">

        {/* ── Command Center ── */}
        <div
          style={st.card(!canMonitor)}
          className={canMonitor ? 'hs-card-hover-blue' : ''}
          onClick={canMonitor ? enterCommandCenter : undefined}
        >
          <div style={st.icon}>🖥️</div>
          <div style={st.cardTitle}>Command Center</div>
          <div style={st.cardDesc}>
            Monitor live feeds, verify detections,<br />manage system and personnel.
          </div>
          {canMonitor ? (
            <button
              style={st.btnBlue}
              onClick={e => { e.stopPropagation(); enterCommandCenter() }}
              onMouseEnter={e => e.target.style.background='#58a6ff'}
              onMouseLeave={e => e.target.style.background='#388bfd'}
            >
              Enter Command Center
            </button>
          ) : (
            <button style={st.btnDisabled} disabled>Access Restricted</button>
          )}
        </div>

        {/* ── Field Recorder ── */}
        <div
          style={st.card(false)}
          className="hs-card-hover-green"
          onClick={enterFieldView}
        >
          <div style={st.icon}>📹</div>
          <div style={st.cardTitle}>Field Recorder</div>
          <div style={st.cardDesc}>
            Stream video from the field,<br />send location and communicate.
          </div>
          <button
            style={st.btnGreen}
            onClick={e => { e.stopPropagation(); enterFieldView() }}
            onMouseEnter={e => e.target.style.background='#2ea043'}
            onMouseLeave={e => e.target.style.background='#238636'}
          >
            Enter Field View
          </button>
        </div>

      </div>

      <button style={st.logout} onClick={handleLogout}>Not you? Sign out</button>
    </div>
  )
}
