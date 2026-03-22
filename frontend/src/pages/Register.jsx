import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const PIN_LENGTHS = { admin: 8, monitor: 6, recorder: 4 }
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

/* ── Style injection ──────────────────────────────────────────── */
const STYLE_ID = 'hs-reg-styles'
if (!document.getElementById(STYLE_ID)) {
  const s = document.createElement('style')
  s.id = STYLE_ID
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
    @keyframes popIn  { from{opacity:0;transform:scale(0.7)} to{opacity:1;transform:scale(1)} }
    .hs-fade { animation: fadeIn 0.35s ease; }
    .hs-pop  { animation: popIn 0.4s ease; }
  `
  document.head.appendChild(s)
}

/* ── PIN box row ──────────────────────────────────────────────── */
function PinInput({ length, value, onChange, show, onToggleShow, label }) {
  const handleKey = (e) => {
    if (e.key >= '0' && e.key <= '9') {
      if (value.length < length) onChange(value + e.key)
    } else if (e.key === 'Backspace') {
      onChange(value.slice(0, -1))
    }
  }

  const s = {
    wrap: { marginBottom: 18 },
    labelRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    label: { color: '#8b949e', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' },
    boxRow: { display: 'flex', alignItems: 'center', gap: 8 },
    boxes: { display: 'flex', gap: 5, flex: 1, flexWrap: 'wrap' },
    box: (filled) => ({
      width: 32, height: 36, background: '#0d1117',
      border: `1px solid ${filled ? '#388bfd' : '#30363d'}`,
      borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 16, color: '#e6edf3', cursor: 'text', userSelect: 'none',
    }),
    eye: { background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: 4 },
  }

  return (
    <div style={s.wrap}>
      <div style={s.labelRow}>
        <span style={s.label}>{label}</span>
        <span style={{ color: '#6e7681', fontSize: 11 }}>{length} digits</span>
      </div>
      <div tabIndex={0} onKeyDown={handleKey} onClick={e => e.currentTarget.focus()}
           style={{ ...s.boxRow, outline: 'none' }}>
        <div style={s.boxes}>
          {Array.from({ length }).map((_, i) => (
            <div key={i} style={s.box(i < value.length)}>
              {i < value.length ? (show ? value[i] : '●') : ''}
            </div>
          ))}
        </div>
        <button style={s.eye} onClick={onToggleShow} type="button" tabIndex={-1}>
          {show ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

/* ── Field component ──────────────────────────────────────────── */
function Field({ label, error, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display:'block', color:'#8b949e', fontSize:11, fontWeight:500,
        textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>
        {label} <span style={{ color: '#f85149' }}>*</span>
      </label>
      {children}
      {error && <div style={{ color:'#f85149', fontSize:11, marginTop:4 }}>{error}</div>}
    </div>
  )
}

export default function Register() {
  const navigate = useNavigate()

  const [form, setForm] = useState({
    full_name: '', username: '', role: 'recorder',
    badge_id: '', rank: '', unit_name: '',
    contact_number: '', blood_group: '', id_pass_number: '',
  })
  const [pin, setPin]             = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [showPin, setShowPin]     = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [errors, setErrors]       = useState({})
  const [usernameStatus, setUsernameStatus] = useState(null) // null | 'checking' | 'available' | 'taken'
  const [loading, setLoading]     = useState(false)
  const [success, setSuccess]     = useState(null)  // null | { pending: bool }
  const usernameTimer = useRef(null)

  const pinLen = PIN_LENGTHS[form.role] || 4

  /* ── Reset pin on role change ─────────────────────────────── */
  useEffect(() => { setPin(''); setConfirmPin('') }, [form.role])

  /* ── Username availability check ──────────────────────────── */
  useEffect(() => {
    if (!form.username || form.username.length < 3) {
      setUsernameStatus(null)
      return
    }
    setUsernameStatus('checking')
    clearTimeout(usernameTimer.current)
    usernameTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`${API}/api/auth/check-username/${encodeURIComponent(form.username)}`)
        const d = await r.json()
        setUsernameStatus(d.available ? 'available' : 'taken')
      } catch {
        setUsernameStatus(null)
      }
    }, 450)
  }, [form.username])

  /* ── Helpers ──────────────────────────────────────────────── */
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const validate = () => {
    const errs = {}
    if (!form.full_name.trim())    errs.full_name    = 'Required'
    if (!form.username.trim())     errs.username     = 'Required'
    if (usernameStatus === 'taken') errs.username    = 'Username taken'
    if (!form.role)                errs.role         = 'Required'
    if (!form.badge_id.trim())     errs.badge_id     = 'Required'
    if (!form.rank.trim())         errs.rank         = 'Required'
    if (!form.unit_name.trim())    errs.unit_name    = 'Required'
    if (!form.contact_number.trim()) errs.contact_number = 'Required'
    if (!form.blood_group)         errs.blood_group  = 'Required'
    if (!form.id_pass_number.trim()) errs.id_pass_number = 'Required'
    if (pin.length !== pinLen)     errs.pin = `PIN must be ${pinLen} digits`
    if (confirmPin !== pin)        errs.confirm_pin  = 'PINs do not match'
    return errs
  }

  const handleSubmit = async () => {
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setLoading(true)
    try {
      const res = await fetch(`${API}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, pin }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrors({ _global: data.detail || 'Registration failed.' })
        return
      }
      setSuccess({ pending: data.pending_approval })
      setTimeout(() => navigate('/login', { replace: true }), 3000)
    } catch {
      setErrors({ _global: 'Cannot reach server.' })
    } finally {
      setLoading(false)
    }
  }

  /* ── Styles ──────────────────────────────────────────────────── */
  const st = {
    page: {
      minHeight: '100vh', display: 'flex', alignItems: 'flex-start',
      justifyContent: 'center', background: '#0d1117',
      fontFamily: "'Inter', sans-serif", padding: '40px 16px',
    },
    card: {
      background: '#161b22', border: '1px solid #30363d', borderRadius: 12,
      padding: '40px 36px', width: '100%', maxWidth: 440,
      boxShadow: '0 16px 48px #00000088',
    },
    h1: { color: '#e6edf3', fontSize: 20, fontWeight: 600, margin: '0 0 4px' },
    sub: { color: '#8b949e', fontSize: 13, marginBottom: 32 },
    input: {
      width: '100%', background: '#0d1117', border: '1px solid #30363d',
      borderRadius: 6, padding: '9px 12px', color: '#e6edf3', fontSize: 14,
      outline: 'none', boxSizing: 'border-box',
    },
    select: {
      width: '100%', background: '#0d1117', border: '1px solid #30363d',
      borderRadius: 6, padding: '9px 12px', color: '#e6edf3', fontSize: 14,
      outline: 'none', boxSizing: 'border-box', appearance: 'none',
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%238b949e' d='M6 8L0 0h12z'/%3E%3C/svg%3E")`,
      backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
    },
    btn: {
      width: '100%', background: '#388bfd', color: '#fff', border: 'none',
      borderRadius: 6, padding: '10px 16px', fontSize: 14, fontWeight: 500,
      cursor: loading ? 'not-allowed' : 'pointer', marginTop: 8,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    divider: { borderColor: '#21262d', margin: '20px 0' },
    footer: { textAlign: 'center', marginTop: 24 },
    footerLink: { color: '#8b949e', fontSize: 13, textDecoration: 'none' },
  }

  /* ── Success screen ─────────────────────────────────────────── */
  if (success) {
    return (
      <div style={st.page}>
        <div style={{ ...st.card, textAlign: 'center' }} className="hs-fade">
          <div className="hs-pop" style={{ fontSize: 56, marginBottom: 16 }}>
            {success.pending ? '⏳' : '✅'}
          </div>
          <div style={{ color: '#e6edf3', fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
            Account Created!
          </div>
          <div style={{ color: '#8b949e', fontSize: 14, lineHeight: 1.6 }}>
            {success.pending
              ? 'Your account is pending admin approval.\nYou will be notified once activated.'
              : 'You can log in now. Redirecting…'}
          </div>
        </div>
      </div>
    )
  }

  /* ── Username status indicator ────────────────────────────── */
  const usernameIndicator = () => {
    if (usernameStatus === 'checking') return <span style={{ color: '#8b949e', fontSize: 12 }}>Checking…</span>
    if (usernameStatus === 'available') return <span style={{ color: '#3fb950', fontSize: 12 }}>✓ Available</span>
    if (usernameStatus === 'taken')    return <span style={{ color: '#f85149', fontSize: 12 }}>✗ Taken</span>
    return null
  }

  return (
    <div style={st.page}>
      <div style={st.card} className="hs-fade">
        <h1 style={st.h1}>Create Account</h1>
        <p style={st.sub}>Join Hybrid Sentry</p>

        {/* Full Name */}
        <Field label="Full Name" error={errors.full_name}>
          <input style={st.input} value={form.full_name} onChange={set('full_name')}
            placeholder="e.g. Maj. Arjun Singh"
            onFocus={e => e.target.style.borderColor='#388bfd'}
            onBlur={e => e.target.style.borderColor='#30363d'} />
        </Field>

        {/* Username */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
            <label style={{ color:'#8b949e', fontSize:11, fontWeight:500,
              textTransform:'uppercase', letterSpacing:'0.06em' }}>
              Username <span style={{ color:'#f85149' }}>*</span>
            </label>
            {usernameIndicator()}
          </div>
          <input style={st.input} value={form.username} onChange={set('username')}
            placeholder="Choose a username"
            onFocus={e => e.target.style.borderColor='#388bfd'}
            onBlur={e => e.target.style.borderColor='#30363d'} />
          {errors.username && <div style={{ color:'#f85149', fontSize:11, marginTop:4 }}>{errors.username}</div>}
        </div>

        {/* Role */}
        <Field label="Role" error={errors.role}>
          <select style={st.select} value={form.role} onChange={set('role')}>
            <option value="recorder">Recorder</option>
            <option value="monitor">Monitor</option>
            <option value="admin">Admin</option>
          </select>
        </Field>

        <hr style={st.divider} />

        {/* Badge ID */}
        <Field label="Badge / ID Number" error={errors.badge_id}>
          <input style={st.input} value={form.badge_id} onChange={set('badge_id')} placeholder="e.g. CRPF-0452"
            onFocus={e => e.target.style.borderColor='#388bfd'}
            onBlur={e => e.target.style.borderColor='#30363d'} />
        </Field>

        {/* Rank */}
        <Field label="Rank / Designation" error={errors.rank}>
          <input style={st.input} value={form.rank} onChange={set('rank')} placeholder="e.g. Inspector"
            onFocus={e => e.target.style.borderColor='#388bfd'}
            onBlur={e => e.target.style.borderColor='#30363d'} />
        </Field>

        {/* Unit */}
        <Field label="Unit / Department" error={errors.unit_name}>
          <input style={st.input} value={form.unit_name} onChange={set('unit_name')} placeholder="e.g. 3rd Battalion"
            onFocus={e => e.target.style.borderColor='#388bfd'}
            onBlur={e => e.target.style.borderColor='#30363d'} />
        </Field>

        {/* Contact */}
        <Field label="Contact Number" error={errors.contact_number}>
          <input style={st.input} value={form.contact_number} onChange={set('contact_number')} placeholder="+91 9XXXXXXXXX"
            onFocus={e => e.target.style.borderColor='#388bfd'}
            onBlur={e => e.target.style.borderColor='#30363d'} />
        </Field>

        {/* Blood Group */}
        <Field label="Blood Group" error={errors.blood_group}>
          <select style={st.select} value={form.blood_group} onChange={set('blood_group')}>
            <option value="">Select…</option>
            {BLOOD_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </Field>

        {/* ID Pass Number */}
        <Field label="ID Pass Number" error={errors.id_pass_number}>
          <input style={st.input} value={form.id_pass_number} onChange={set('id_pass_number')} placeholder="e.g. IP-2024-0031"
            onFocus={e => e.target.style.borderColor='#388bfd'}
            onBlur={e => e.target.style.borderColor='#30363d'} />
        </Field>

        <hr style={st.divider} />

        {/* PIN */}
        <PinInput
          length={pinLen}
          value={pin}
          onChange={setPin}
          show={showPin}
          onToggleShow={() => setShowPin(v => !v)}
          label={`Set PIN (${pinLen} digits)`}
        />
        {errors.pin && <div style={{ color:'#f85149', fontSize:11, marginTop:-10, marginBottom:12 }}>{errors.pin}</div>}

        {/* Confirm PIN */}
        <PinInput
          length={pinLen}
          value={confirmPin}
          onChange={setConfirmPin}
          show={showConfirm}
          onToggleShow={() => setShowConfirm(v => !v)}
          label="Confirm PIN"
        />
        {errors.confirm_pin && (
          <div style={{ color:'#f85149', fontSize:11, marginTop:-10, marginBottom:12 }}>{errors.confirm_pin}</div>
        )}
        {confirmPin.length > 0 && confirmPin === pin && (
          <div style={{ color:'#3fb950', fontSize:11, marginTop:-10, marginBottom:12 }}>✓ PINs match</div>
        )}

        {/* Global error */}
        {errors._global && (
          <div style={{ background:'#2d1117', border:'1px solid #f8514966', borderRadius:6,
            padding:'10px 14px', color:'#f85149', fontSize:13, marginBottom:12 }}>
            {errors._global}
          </div>
        )}

        {/* Submit */}
        <button style={st.btn} onClick={handleSubmit} disabled={loading}
          onMouseEnter={e => { if (!loading) e.target.style.background='#58a6ff' }}
          onMouseLeave={e => { if (!loading) e.target.style.background='#388bfd' }}>
          {loading
            ? <><span style={{ display:'inline-block', width:13, height:13, border:'2px solid #ffffff55',
                borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.7s linear infinite',
                marginRight:8 }} />Creating…</>
            : 'Create Account'}
        </button>

        <div style={st.footer}>
          <Link to="/login" style={st.footerLink}>
            Already have an account? <span style={{ color:'#388bfd' }}>Sign in →</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
