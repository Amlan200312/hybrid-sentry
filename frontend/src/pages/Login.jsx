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
  const [pin, setPin] = useState('')
  const [showPin, setShowPin]           = useState(false)
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
    if (sessionStorage.getItem('hs_token')) navigate('/select', { replace: true })
  }, [navigate])

  /* Health check */
  useEffect(() => {
    fetch('http://localhost:8000/api/system/setup-required')
      .then(r => { if(r.ok) setServerOk(true) })
      .catch(() => setServerOk(false))
  }, [])

  /* Lockout countdown */
  useEffect(() => {
    if (!lockout) return
    if (lockSeconds <= 0) { setLockout(false); setAttempts(0); return }
    const t = setTimeout(() => setLockSeconds(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [lockout, lockSeconds])

  useEffect(() => { usernameRef.current?.focus() }, [])

  /* Keyboard PIN entry */
  const handleKey = useCallback((e) => {
    if (lockout || loading) return
    if (e.key >= '0' && e.key <= '9') {
      setPin(prev => prev.length < MAX_PIN ? prev + e.key : prev)
    } else if (e.key === 'Backspace') {
      setPin(prev => prev.slice(0, -1))
    } else if (e.key === 'Enter') handleSubmit()
  }, [lockout, loading, pin, username]) // eslint-disable-line

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  /* Submit */
  const handleSubmit = async () => {
    const pinStr = Array.isArray(pin) ? pin.join('') : pin;
    if (!username.trim() || !pinStr.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('http://localhost:8000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), pin: pinStr.trim() })
      })
      const data = await res.json()
      if (res.ok) {
        localStorage.setItem('user', JSON.stringify(data))
        localStorage.setItem('token', data.access_token)
        if (data.role === 'recorder') window.location.href = '/recorder'
        else if (data.role === 'admin') window.location.href = '/role-select'
        else window.location.href = '/monitor'
      } else {
        setError(typeof data.detail === 'string' ? data.detail : 'Login failed')
      }
    } catch {
      setError('Cannot reach server. Start backend first.')
    } finally {
      setLoading(false)
    }
  }

  function triggerShake() { setShake(true); setTimeout(() => setShake(false), 600) }
  function fmtLock(s) { return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}` }

  /* ── Styles ─────────────────────────────────────────────── */
  const s = {
    page:  { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
              background:'#0d1117', fontFamily:"'Inter', sans-serif", padding:'24px 16px' },
    card:  { background:'#161b22', border:'1px solid #30363d', borderRadius:12,
              padding:'36px 32px', width:'100%', maxWidth:420, boxShadow:'0 16px 48px #00000088',
              position:'relative', overflow:'hidden' },
    orgName:{ color:'#e6edf3', fontSize:22, fontWeight:700, marginTop:10, marginBottom:2, textAlign:'center' },
    sub:   { color:'#8b949e', fontSize:12, textAlign:'center', marginBottom:24 },
    label: { display:'block', color:'#8b949e', fontSize:11, fontWeight:500,
              textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 },
    input: { width:'100%', background:'#0d1117', border:'1px solid #30363d', borderRadius:6,
              padding:'9px 12px', color:'#e6edf3', fontSize:14, outline:'none', boxSizing:'border-box' },
    fieldRow:{ marginBottom:18 },
    pinLabelRow:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 },
    pinHint:{ color:'#6e7681', fontSize:11 },
    pinWrap:{ display:'flex', alignItems:'center', gap:8 },
    pinBoxes:{ display:'flex', gap:5, flex:1, flexWrap:'wrap' },
    box: (filled) => ({ width:34, height:38, background:'#0d1117',
      border:`1px solid ${filled ? '#388bfd' : '#30363d'}`, borderRadius:6,
      display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, color:'#e6edf3' }),
    eyeBtn:{ background:'none', border:'none', color:'#8b949e', cursor:'pointer', padding:4, display:'flex' },
    btn: (l) => ({ width:'100%', background: l ? '#1f6feb' : '#388bfd', color:'#fff', border:'none',
      borderRadius:6, padding:'10px 16px', fontSize:14, fontWeight:500, cursor: l?'not-allowed':'pointer',
      marginTop:20, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }),
    error:    { background:'#2d1117', border:'1px solid #f8514966', borderRadius:6,
                padding:'10px 14px', color:'#f85149', fontSize:13, marginTop:12 },
    lockout:  { background:'#2d1f00', border:'1px solid #e3b34166', borderRadius:6,
                padding:'10px 14px', color:'#e3b341', fontSize:13, marginTop:12 },
    slowWarn: { background:'#162032', border:'1px solid #388bfd44', borderRadius:6,
                padding:'8px 14px', color:'#8b949e', fontSize:12, marginTop:12 },
    footer:   { textAlign:'center', marginTop:22 },
    link:     { color:'#8b949e', fontSize:13, textDecoration:'none' },
    linkAccent:{ color:'#388bfd' },
    statusToggle:{ background:'none', border:'none', color:'#8b949e', cursor:'pointer',
      fontSize:11, padding:0, display:'flex', alignItems:'center', gap:4, margin:'0 auto', marginTop:18 },
    granted:  { position:'absolute', inset:0, background:'#0d1117ee', display:'flex',
      flexDirection:'column', alignItems:'center', justifyContent:'center',
      gap:12, zIndex:10 },
  }

  /* ── ACCESS GRANTED overlay ── */
  if (granted) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div className="access-granted" style={s.granted}>
            <ShieldIcon granted />
            <div style={{ fontFamily:"'Orbitron', sans-serif", fontSize:18, fontWeight:700,
              color:'#3fb950', letterSpacing:'0.2em', textShadow:'0 0 16px #3fb95088' }}>
              ACCESS GRANTED
            </div>
          </div>
        </div>
      </div>
    )
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

        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:4 }}>
          <ShieldIcon />
          <div style={s.orgName}>{orgName}</div>
          <div style={s.sub}>Hybrid Sentry Surveillance</div>
        </div>

        {/* Username */}
        <div style={s.fieldRow}>
          <label style={s.label}>Username</label>
          <input ref={usernameRef} style={s.input} value={username}
            onChange={e => setUsername(e.target.value)} placeholder="Enter username"
            autoComplete="username" disabled={lockout}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            onFocus={e => { e.target.style.borderColor='#388bfd' }}
            onBlur={e => { e.target.style.borderColor='#30363d' }} />
        </div>

        {/* PIN */}
        <div style={s.fieldRow}>
          <div style={s.pinLabelRow}>
            <label style={{ ...s.label, marginBottom:0 }}>PIN</label>
            <span style={s.pinHint}>Admin:8 · Monitor:6 · Recorder:4</span>
          </div>
          <div style={s.pinWrap}>
            <div style={s.pinBoxes} className={shake ? 'pin-shake' : ''}>
              {Array.from({ length: MAX_PIN }).map((_,i) => {
                const filled = i < pin.length
                return (
                  <div key={i} style={s.box(filled)}>
                    {filled ? (showPin ? pin[i] : '●') : ''}
                  </div>
                )
              })}
            </div>
            <button style={s.eyeBtn} onClick={() => setShowPin(v => !v)} tabIndex={-1}>
              {showPin
                ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              }
            </button>
          </div>
        </div>

        {/* Submit */}
        <button style={s.btn(false)} onClick={handleSubmit} disabled={lockout}
          onMouseEnter={e => { e.currentTarget.style.background='#58a6ff' }}
          onMouseLeave={e => { e.currentTarget.style.background='#388bfd' }}>
          Sign In
        </button>

        {/* Error states */}
        {serverError && (
          <div style={s.error}>
            ⚠ Cannot reach server.
            <button onClick={handleSubmit} style={{ marginLeft:10, background:'none',
              border:'none', color:'#388bfd', cursor:'pointer', fontSize:13 }}>
              ↺ Retry
            </button>
          </div>
        )}
        {error && !lockout && !serverError && (
          <div style={{color:'#f85149',fontSize:12,marginTop:8,textAlign:'center'}}>
            {typeof error === 'string' ? error : 'Login failed'}
          </div>
        )}
        {lockout && (
          <div style={s.lockout}>⚠ Too many attempts. Try again in {fmtLock(lockSeconds)}</div>
        )}

        {/* Footer / Register link */}
        <div style={s.footer}>
          <Link to="/register" style={s.link}>
            New here? <span style={s.linkAccent}>Create account →</span>
          </Link>
        </div>

        {/* System Status toggle */}
        <button style={s.statusToggle} onClick={() => setStatusOpen(o => !o)}>
          ⚙️ System Status {statusOpen ? '▲' : '▼'}
        </button>
        {statusOpen && <SystemStatusPanel info={sysInfo} />}
      </div>
    </div>
  )
}
