import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import LoadingScreen from '../components/LoadingScreen'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const MAX_PIN = 8
const LOCKOUT_SECONDS = 4 * 60 + 32
const SLOW_THRESHOLD_MS = 5000   // show "AI model loading" after 5s

/* ── One-time style injection ───────────────────────────────── */
const STYLE_ID = 'hs-login-styles-v2'
if (!document.getElementById(STYLE_ID)) {
  const s = document.createElement('style')
  s.id = STYLE_ID
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Orbitron:wght@700&display=swap');
    @keyframes spin  { to { transform: rotate(360deg); } }
    @keyframes shake {
      0%,100% { transform: translateX(0); }
      15%      { transform: translateX(-8px); }
      30%      { transform: translateX(8px); }
      45%      { transform: translateX(-6px); }
      60%      { transform: translateX(6px); }
      75%      { transform: translateX(-3px); }
      90%      { transform: translateX(3px); }
    }
    .pin-shake { animation: shake 0.5s ease; }
    @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
    .hs-fade { animation: fadeIn 0.3s ease; }
    @keyframes slideDown { from { opacity:0; max-height:0; } to { opacity:1; max-height:600px; } }
    .sys-panel { animation: slideDown 0.3s ease; overflow:hidden; }
    @keyframes grantedPulse {
      0%   { opacity:0; transform:scale(0.85); }
      40%  { opacity:1; transform:scale(1.05); }
      70%  { transform:scale(1); }
      90%  { opacity:1; }
      100% { opacity:0; transform:scale(1); }
    }
    .access-granted { animation: grantedPulse 0.55s ease forwards; }
  `
  document.head.appendChild(s)
}

/* ── Shield SVG ─────────────────────────────────────────────── */
function ShieldIcon({ granted = false }) {
  const color = granted ? '#3fb950' : '#388bfd'
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none"
      style={{ filter: granted ? `drop-shadow(0 0 10px ${color})` : 'none', transition: 'filter 0.3s' }}>
      <path d="M20 3L5 9V20C5 28.5 11.7 36.4 20 38C28.3 36.4 35 28.5 35 20V9L20 3Z"
        fill={`${color}22`} stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M14 20.5L18 24.5L26 16.5" stroke={color} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Dot({ ok }) {
  return <span style={{ display:'inline-block',width:7,height:7,borderRadius:'50%',
    background: ok ? '#3fb950' : '#f85149', marginRight:6, flexShrink:0 }} />
}

/* ── System Status Panel ────────────────────────────────────── */
function SystemStatusPanel({ info }) {
  const isRpi = info?.platform === 'rpi'
  const features = [
    { label: `YOLO ${info?.yolo_model || '?'} (${isRpi ? 'RPi' : 'PC'})`, ok: true },
    { label: 'Drone Detection',        ok: true },
    { label: 'Face Concealed Check',   ok: true },
    { label: 'Speed + Dwell Tracking', ok: true },
    { label: 'Night Auto Mode',        ok: true },
    { label: 'Ship Detection',         ok: true },
    { label: 'Sound Sensor',  ok: isRpi,   dim: !isRpi, note: isRpi ? '' : '(RPi only)' },
    { label: 'Servo Control', ok: isRpi,   dim: !isRpi, note: isRpi ? '' : '(RPi only)' },
    { label: 'Plate OCR',     ok: !isRpi && !!info?.ocr_available, dim: isRpi, note: isRpi ? '(PC only)' : '' },
    { label: 'Chest Badge OCR',ok: !isRpi && !!info?.ocr_available, dim: isRpi, note: isRpi ? '(PC only)' : '' },
    { label: 'Slow Motion Replay', ok: !isRpi, dim: isRpi, note: isRpi ? '(PC only)' : '' },
  ]

  return (
    <div className="sys-panel" style={{ marginTop:16, borderTop:'1px solid #21262d', paddingTop:14 }}>
      <div style={{ fontSize:12, color:'#e6edf3', marginBottom:10 }}>
        Running on: <strong>{isRpi ? '🍓 Raspberry Pi' : '🖥️ PC / Laptop'}</strong>
      </div>
      <div style={{ fontSize:10, fontWeight:700, color:'#8b949e', letterSpacing:'0.08em', marginBottom:6 }}>LIVE STATUS</div>
      {[
        { label:'Camera',   ok: !!info?.camera_online },
        { label:'AI Model', ok: !!info?.ai_loaded },
        { label:'Backend',  ok: true },
      ].map(({ label, ok }) => (
        <div key={label} style={{ display:'flex', alignItems:'center', gap:4, marginBottom:4 }}>
          <Dot ok={ok} />
          <span style={{ fontSize:11, color:'#8b949e' }}>{label}:</span>
          <span style={{ fontSize:11, fontWeight:500, color: ok ? '#3fb950' : '#f85149' }}>{ok ? 'Online' : 'Offline'}</span>
        </div>
      ))}
      <div style={{ fontSize:10, fontWeight:700, color:'#8b949e', letterSpacing:'0.08em', marginTop:10, marginBottom:6 }}>ACTIVE FEATURES</div>
      {features.map(({ label, ok, dim, note }) => (
        <div key={label} style={{ display:'flex', alignItems:'center', fontSize:11,
          color: dim ? '#6e7681' : ok ? '#3fb950' : '#8b949e', marginBottom:3 }}>
          <span style={{ marginRight:6 }}>{ok ? '✅' : '⬜'}</span>
          {label}
          {note && <span style={{ color:'#6e7681', marginLeft:4 }}>{note}</span>}
        </div>
      ))}
    </div>
  )
}

/* ── Main Login ─────────────────────────────────────────────── */
export default function Login() {
  const navigate = useNavigate()

  const [username, setUsername]         = useState('')
  const [password, setPassword]         = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe]     = useState(false)
  const [loading, setLoading]           = useState(false)
  const [slowWarning, setSlowWarning]   = useState(false)
  const [error, setError]               = useState('')
  const [attempts, setAttempts]         = useState(0)
  const [lockout, setLockout]           = useState(false)
  const [lockSeconds, setLockSeconds]   = useState(LOCKOUT_SECONDS)
  const [shake, setShake]               = useState(false)
  const [granted, setGranted]           = useState(false)   // ACCESS GRANTED flash

  /* system info */
  const [sysInfo, setSysInfo]         = useState(null)
  const [orgName, setOrgName]         = useState('Hybrid Sentry')
  const [statusOpen, setStatusOpen]   = useState(false)
  const [serverError, setServerError] = useState(false)

  const usernameRef   = useRef(null)
  const slowTimerRef  = useRef(null)

  /* Redirect if already logged in */
  useEffect(() => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token')
    const user = localStorage.getItem('user') || sessionStorage.getItem('user')
    if (!token || !user) return
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      if (payload.exp * 1000 < Date.now()) {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        sessionStorage.removeItem('token')
        sessionStorage.removeItem('user')
        return
      }
      const u = JSON.parse(user)
      if (u.role === 'recorder') window.location.replace('/recorder')
      else if (u.role === 'admin') window.location.replace('/role-select')
      else window.location.replace('/monitor')
    } catch { 
      localStorage.clear() 
      sessionStorage.clear()
    }
  }, [])

  /* Health check */
  useEffect(() => {
    fetch('http://localhost:8000/api/system/setup-required')
      .then(r => r.json())
      .then(data => { setServerError(false); setSysInfo(data) })
      .catch(() => setServerError(true))
  }, [])

  /* Lockout countdown */
  useEffect(() => {
    if (!lockout) return
    if (lockSeconds <= 0) { setLockout(false); setAttempts(0); return }
    const t = setTimeout(() => setLockSeconds(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [lockout, lockSeconds])

  useEffect(() => { usernameRef.current?.focus() }, [])

  /* Keyboard entry */
  const handleKey = useCallback((e) => {
    if (lockout || loading) return
    if (e.key === 'Enter') handleSubmit()
  }, [lockout, loading, username, password]) // eslint-disable-line

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  /* Submit */
  const handleSubmit = async () => {
    const passwordStr = Array.isArray(password) ? password.join('') : password;
    if (!username.trim() || !passwordStr.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('http://localhost:8000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password: passwordStr.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        // Store token and user data safely **before** redirect
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('user', JSON.stringify(data));
        // Small delay to ensure storage is written
        setTimeout(() => {
          if (data.role === 'recorder') {
            window.location.replace('/recorder');
          } else if (data.role === 'admin') {
            window.location.replace('/role-select');
          } else {
            window.location.replace('/monitor');
          }
        }, 100);
      } else {
        setError(typeof data.detail === 'string' ? data.detail : 'Login failed');
      }
    } catch {
      setError('Cannot reach server. Start backend first.');
      setServerError(true);
    } finally {
      setLoading(false);
    }
  };

  function triggerShake() { setShake(true); setTimeout(() => setShake(false), 600) }
  function fmtLock(s) { return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}` }

  /* ── Styles ─────────────────────────────────────────────── */
  const s = {
    page: { 
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'linear-gradient(135deg, #0d1117 0%, #161b22 100%)', 
      fontFamily:"'Inter', sans-serif", padding:'24px 16px' 
    },
    card: { 
      background:'var(--bg-surface, #161b22)', border:'1px solid var(--border, #30363d)', 
      borderRadius:16, padding:'40px 32px', width:'100%', maxWidth:420, 
      boxShadow:'0 24px 64px rgba(0,0,0,0.4)', position:'relative', overflow:'hidden' 
    },
    header: { textAlign:'center', marginBottom:32 },
    orgName: { color:'var(--text-primary, #e6edf3)', fontSize:24, fontWeight:700, marginTop:16, marginBottom:4, letterSpacing:'-0.02em' },
    sub: { color:'var(--text-muted, #8b949e)', fontSize:14 },
    label: { display:'block', color:'var(--text-secondary, #8b949e)', fontSize:12, fontWeight:500, marginBottom:8 },
    inputWrapper: { position:'relative', marginBottom:20 },
    input: { 
      width:'100%', background:'var(--bg-base, #0d1117)', border:'1px solid var(--border, #30363d)', 
      borderRadius:8, padding:'12px 14px', color:'var(--text-primary, #e6edf3)', fontSize:15, 
      outline:'none', transition:'border-color 0.2s', boxSizing:'border-box' 
    },
    eyeBtn: { 
      position:'absolute', right:12, top:30, background:'none', border:'none', 
      color:'var(--text-muted, #8b949e)', cursor:'pointer', padding:4, display:'flex' 
    },
    optionsRow: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24, marginTop:-4 },
    checkboxLabel: { display:'flex', alignItems:'center', gap:8, color:'var(--text-secondary, #8b949e)', fontSize:13, cursor:'pointer' },
    link: { color:'var(--accent-blue, #388bfd)', fontSize:13, textDecoration:'none', fontWeight:500, transition:'color 0.2s' },
    btn: { 
      width:'100%', background:'var(--accent-blue, #388bfd)', color:'#fff', border:'none',
      borderRadius:8, padding:'12px', fontSize:15, fontWeight:600, cursor: loading ? 'not-allowed' : 'pointer',
      display:'flex', alignItems:'center', justifyContent:'center', gap:8,
      transition:'all 0.2s', opacity: loading ? 0.7 : 1, boxShadow:'0 4px 12px rgba(56, 139, 253, 0.2)'
    },
    error: { 
      background:'rgba(248, 81, 73, 0.1)', border:'1px solid rgba(248, 81, 73, 0.4)', 
      borderRadius:8, padding:'12px', color:'#f85149', fontSize:13, marginTop:16,
      display:'flex', alignItems:'center', justifyContent:'space-between'
    },
    footer: { textAlign:'center', marginTop:28 },
    statusToggle: { 
      background:'none', border:'none', color:'var(--text-muted, #8b949e)', cursor:'pointer',
      fontSize:12, padding:0, display:'flex', alignItems:'center', gap:6, margin:'0 auto', marginTop:24 
    },
    granted: { 
      position:'absolute', inset:0, background:'rgba(13, 17, 23, 0.95)', display:'flex',
      flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, zIndex:10 
    },
  }

  /* ── Loading overlay (submitting) ── */
  if (loading) {
    return (
      <LoadingScreen
        message={slowWarning ? 'AI MODEL LOADING. PLEASE WAIT...' : 'SIGNING IN...'}
        showSpinner
      />
    )
  }

  return (
    <div style={s.page}>
      <div style={s.card} className="hs-fade">
        <div style={s.header}>
          <ShieldIcon />
          <div style={s.orgName}>{orgName}</div>
          <div style={s.sub}>Hybrid Sentry Surveillance</div>
        </div>

        <form onSubmit={e => { e.preventDefault(); handleSubmit(); }}>
          <div style={s.inputWrapper}>
            <label style={s.label}>Username</label>
            <input 
              ref={usernameRef} style={s.input} value={username}
              onChange={e => setUsername(e.target.value)} placeholder="Enter your username"
              autoComplete="username" disabled={lockout || loading}
              onFocus={e => e.target.style.borderColor = 'var(--accent-blue, #388bfd)'}
              onBlur={e => e.target.style.borderColor = 'var(--border, #30363d)'} 
            />
          </div>

          <div style={s.inputWrapper}>
            <label style={s.label}>Password</label>
            <input 
              style={s.input} type={showPassword ? "text" : "password"} value={password}
              onChange={e => setPassword(e.target.value)} placeholder="Enter your password"
              autoComplete="current-password" disabled={lockout || loading}
              onFocus={e => e.target.style.borderColor = 'var(--accent-blue, #388bfd)'}
              onBlur={e => e.target.style.borderColor = 'var(--border, #30363d)'} 
            />
            <button style={s.eyeBtn} onClick={() => setShowPassword(v => !v)} tabIndex={-1} type="button">
              {showPassword
                ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              }
            </button>
          </div>

          <div style={s.optionsRow}>
            <label style={s.checkboxLabel}>
              <input 
                type="checkbox" checked={rememberMe} 
                onChange={e => setRememberMe(e.target.checked)} 
                disabled={lockout || loading} 
                style={{ accentColor: 'var(--accent-blue, #388bfd)' }}
              />
              Remember me
            </label>
            <a href="#" style={s.link} onClick={e => e.preventDefault()}>
              Forgot password?
            </a>
          </div>

          <button 
            style={s.btn} type="submit" disabled={lockout || loading}
            onMouseEnter={e => !loading && (e.currentTarget.style.transform = 'translateY(-1px)')}
            onMouseLeave={e => !loading && (e.currentTarget.style.transform = 'translateY(0)')}
          >
            {loading ? <><svg style={{ animation: 'spin 1s linear infinite' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Authenticating...</> : 'Sign In'}
          </button>
        </form>

        {serverError && (
          <div style={s.error}>
            <span>⚠ Cannot reach server</span>
            <button type="button" onClick={() => { setServerError(false); handleSubmit(); }} style={{ background:'none', border:'none', color:'#f85149', cursor:'pointer', fontSize:13, fontWeight:600 }}>
              Retry
            </button>
          </div>
        )}
        
        {error && !lockout && !serverError && (
          <div style={{ ...s.error, justifyContent: 'center' }}>
            {error}
          </div>
        )}
        
        {lockout && (
          <div style={{ ...s.error, color: '#e3b341', borderColor: 'rgba(227, 179, 65, 0.4)', background: 'rgba(227, 179, 65, 0.1)', justifyContent: 'center' }}>
            ⚠ Too many attempts. Try again in {fmtLock(lockSeconds)}
          </div>
        )}

        <div style={s.footer}>
          <span style={{ color: 'var(--text-secondary, #8b949e)', fontSize: 13 }}>Don't have an account? </span>
          <Link to="/register" style={s.link}>Create one →</Link>
        </div>

        <button type="button" style={s.statusToggle} onClick={() => setStatusOpen(o => !o)}>
          ⚙️ System Status {statusOpen ? '▲' : '▼'}
        </button>
        {statusOpen && <SystemStatusPanel info={sysInfo} />}
      </div>
    </div>
  )
}
