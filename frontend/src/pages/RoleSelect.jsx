import { useNavigate } from 'react-router-dom'
import { getUser, getToken } from '../utils/api'
import { useEffect } from 'react'

export default function RoleSelect() {
  const navigate = useNavigate()
  const user = getUser()
  const token = getToken()

  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true })
    }
  }, [token, navigate])

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/login', { replace: true })
  }

  const displayName = user?.display_name || user?.username || 'Admin'

  const styles = {
    page: {
      minHeight: '100vh',
      background: '#0d1117',
      fontFamily: "'Inter', sans-serif",
      color: '#c9d1d9',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '40px 20px',
    },
    header: {
      textAlign: 'center',
      marginBottom: 48,
    },
    title: {
      fontSize: 28,
      fontWeight: 700,
      color: '#e6edf3',
      marginBottom: 8,
      letterSpacing: '-0.02em',
    },
    subtitle: {
      fontSize: 15,
      color: '#8b949e',
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: 24,
      width: '100%',
      maxWidth: 640,
    },
    card: {
      background: '#161b22',
      border: '1px solid #30363d',
      borderRadius: 16,
      padding: 32,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      textDecoration: 'none',
    },
    cardHover: {
      transform: 'translateY(-4px)',
      boxShadow: '0 12px 24px rgba(0,0,0,0.5)',
      borderColor: '#388bfd',
      background: '#1c222b',
    },
    iconWrap: {
      width: 64,
      height: 64,
      borderRadius: '50%',
      background: 'rgba(56, 139, 253, 0.1)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
      fontSize: 32,
    },
    cardTitle: {
      fontSize: 20,
      fontWeight: 600,
      color: '#e6edf3',
      marginBottom: 8,
    },
    cardDesc: {
      fontSize: 14,
      color: '#8b949e',
      textAlign: 'center',
      lineHeight: 1.5,
    },
    footerBtn: {
      marginTop: 64,
      background: 'transparent',
      border: '1px solid #30363d',
      color: '#8b949e',
      padding: '8px 16px',
      borderRadius: 6,
      cursor: 'pointer',
      fontSize: 14,
      transition: 'all 0.2s',
    }
  }

  // Hover state handling
  const Card = ({ title, icon, desc, to }) => {
    return (
      <div 
        style={styles.card}
        onMouseEnter={e => {
          Object.assign(e.currentTarget.style, styles.cardHover)
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'none'
          e.currentTarget.style.borderColor = '#30363d'
          e.currentTarget.style.background = '#161b22'
        }}
        onClick={() => navigate(to)}
      >
        <div style={styles.iconWrap}>{icon}</div>
        <div style={styles.cardTitle}>{title}</div>
        <div style={styles.cardDesc}>{desc}</div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.title}>Welcome, {displayName}</div>
        <div style={styles.subtitle}>Select your operational role to continue</div>
      </div>

      <div style={styles.grid}>
        <Card 
          title="Monitor" 
          icon="🖥️" 
          desc="Access system dashboard, live camera feeds, AI analytics, and control panel." 
          to="/monitor" 
        />
        <Card 
          title="Recorder" 
          icon="📡" 
          desc="Field operator view for connecting external streams and sending telemetry data." 
          to="/recorder" 
        />
      </div>

      <button 
        style={styles.footerBtn}
        onMouseEnter={e => { e.currentTarget.style.color = '#e6edf3'; e.currentTarget.style.borderColor = '#8b949e' }}
        onMouseLeave={e => { e.currentTarget.style.color = '#8b949e'; e.currentTarget.style.borderColor = '#30363d' }}
        onClick={handleLogout}
      >
        Sign Out
      </button>
    </div>
  )
}
