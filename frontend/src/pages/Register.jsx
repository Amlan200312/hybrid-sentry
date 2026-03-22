import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ChevronLeft, CheckCircle } from 'lucide-react'

const API = 'http://localhost:8000'

const RANKS_BY_BRANCH = {
  'Indian Army': [
    'Field Marshal','General','Lieutenant General','Major General','Brigadier',
    'Colonel','Lieutenant Colonel','Major','Captain','Lieutenant','Second Lieutenant',
    'Subedar Major','Subedar','Naib Subedar','Havildar','Naik','Lance Naik','Sepoy',
  ],
  'Indian Navy': [
    'Admiral of the Fleet','Admiral','Vice Admiral','Rear Admiral','Commodore',
    'Captain','Commander','Lieutenant Commander','Lieutenant','Sub Lieutenant',
    'Acting Sub Lieutenant','Master Chief Petty Officer','Chief Petty Officer',
    'Petty Officer','Leading Seaman','Seaman 1st Class','Seaman 2nd Class',
  ],
  'Indian Air Force': [
    'Marshal of the Air Force','Air Chief Marshal','Air Marshal','Air Vice Marshal',
    'Air Commodore','Group Captain','Wing Commander','Squadron Leader',
    'Flight Lieutenant','Flying Officer','Pilot Officer','Master Warrant Officer',
    'Warrant Officer','Junior Warrant Officer','Sergeant','Corporal',
    'Leading Aircraftman','Aircraftman',
  ],
  'Paramilitary': [
    'Director General','Inspector General','Deputy Inspector General','Commandant',
    'Deputy Commandant','Assistant Commandant','Inspector','Sub-Inspector',
    'Head Constable','Constable',
  ],
  'Civilian': [
    'Director','Deputy Director','Assistant Director','Senior Officer','Officer',
    'Junior Officer','Staff',
  ],
}

const ROLES = [
  { value: 'admin',    label: 'Admin',    pinLen: 8 },
  { value: 'monitor',  label: 'Monitor',  pinLen: 6 },
  { value: 'recorder', label: 'Recorder', pinLen: 4 },
]

const BRANCHES = Object.keys(RANKS_BY_BRANCH)

function Field({ label, error, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label className="input-label">{label}</label>
      {children}
      {error && <div className="input-error">{error}</div>}
    </div>
  )
}

export default function Register() {
  const navigate = useNavigate()

  const [fullName,  setFullName]  = useState('')
  const [username,  setUsername]  = useState('')
  const [branch,    setBranch]    = useState('Indian Army')
  const [rank,      setRank]      = useState('')
  const [role,      setRole]      = useState('monitor')
  const [pin,       setPin]       = useState('')
  const [confirmPin,setConfirmPin]= useState('')
  const [errors,    setErrors]    = useState({})
  const [loading,   setLoading]   = useState(false)
  const [success,   setSuccess]   = useState(false)
  const [apiError,  setApiError]  = useState('')

  const pinLen = ROLES.find(r => r.value === role)?.pinLen || 6
  const ranks  = RANKS_BY_BRANCH[branch] || []

  function validate() {
    const e = {}
    if (!fullName.trim()) e.fullName = 'Full name is required'
    if (!username.trim()) e.username = 'Username is required'
    if (!rank) e.rank = 'Please select a rank'
    if (pin.length !== pinLen) e.pin = `PIN must be exactly ${pinLen} digits`
    if (!/^\d+$/.test(pin))   e.pin = 'PIN must be numeric only'
    if (pin !== confirmPin)    e.confirmPin = 'PINs do not match'
    return e
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setApiError('')
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          realName: fullName.trim(),
          role,
          rank,
          branch,
          pin,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setApiError(data.detail || 'Registration failed.'); return }
      setSuccess(true)
      setTimeout(() => navigate('/login'), 2000)
    } catch {
      setApiError('Cannot reach server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-base)',
      }}>
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '40px 32px', textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        }}>
          <CheckCircle size={48} style={{ color: 'var(--accent-green)' }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
            Account Created!
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Redirecting to login…</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-base)', padding: '24px 16px',
      backgroundImage: 'radial-gradient(circle, rgba(56,139,253,0.04) 1px, transparent 1px)',
      backgroundSize: '24px 24px',
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '32px 28px',
        width: '100%',
        maxWidth: 440,
        boxShadow: '0 16px 48px #00000066',
      }}>
        {/* Back button */}
        <div style={{ marginBottom: 20 }}>
          <Link
            to="/login"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              color: 'var(--text-muted)', fontSize: 12, textDecoration: 'none',
            }}
          >
            <ChevronLeft size={14} />
            Back to Login
          </Link>
        </div>

        {/* Header */}
        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <svg width="40" height="40" viewBox="0 0 26 26" style={{ marginBottom: 8 }}>
            <polygon points="13,1 24,7 24,19 13,25 2,19 2,7"
              fill="none" stroke="#388bfd" strokeWidth="1.5"/>
            <circle cx="13" cy="13" r="3" fill="#388bfd"/>
          </svg>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.08em' }}>
            HYBRID SENTRY
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            Create Account
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <Field label="Full Name" error={errors.fullName}>
            <input
              className={`input-field ${errors.fullName ? 'error' : ''}`}
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="e.g. Arjun Singh"
              autoComplete="name"
            />
          </Field>

          <Field label="Username" error={errors.username}>
            <input
              className={`input-field ${errors.username ? 'error' : ''}`}
              value={username}
              onChange={e => setUsername(e.target.value.toLowerCase())}
              placeholder="e.g. arjun.singh"
              autoComplete="username"
            />
          </Field>

          <Field label="Service Branch">
            <select
              className="input-field"
              value={branch}
              onChange={e => { setBranch(e.target.value); setRank('') }}
            >
              {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>

          <Field label="Rank" error={errors.rank}>
            <select
              className={`input-field ${errors.rank ? 'error' : ''}`}
              value={rank}
              onChange={e => setRank(e.target.value)}
            >
              <option value="">— Select Rank —</option>
              {ranks.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>

          <Field label="Role">
            <div style={{ display: 'flex', gap: 8 }}>
              {ROLES.map(r => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => { setRole(r.value); setPin(''); setConfirmPin('') }}
                  style={{
                    flex: 1,
                    padding: '7px 0',
                    borderRadius: 6,
                    border: `1px solid ${role === r.value ? 'var(--accent-blue)' : 'var(--border)'}`,
                    background: role === r.value ? 'rgba(56,139,253,0.12)' : 'var(--bg-base)',
                    color: role === r.value ? 'var(--accent-blue)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 500,
                    transition: 'all 150ms',
                  }}
                >
                  {r.label}
                  <div style={{ fontSize: 9, opacity: 0.7, marginTop: 1 }}>{r.pinLen}-digit PIN</div>
                </button>
              ))}
            </div>
          </Field>

          <Field label={`PIN (${pinLen} digits)`} error={errors.pin}>
            <input
              className={`input-field ${errors.pin ? 'error' : ''}`}
              type="tel"
              inputMode="numeric"
              maxLength={pinLen}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, pinLen))}
              placeholder={'•'.repeat(pinLen)}
            />
          </Field>

          <Field label="Confirm PIN" error={errors.confirmPin}>
            <input
              className={`input-field ${errors.confirmPin ? 'error' : ''}`}
              type="tel"
              inputMode="numeric"
              maxLength={pinLen}
              value={confirmPin}
              onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, pinLen))}
              placeholder={'•'.repeat(pinLen)}
            />
          </Field>

          {apiError && (
            <div className="alert alert-error" style={{ marginBottom: 14 }}>
              {apiError}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-full"
            style={{ height: 40, borderRadius: 8, marginTop: 4 }}
            disabled={loading}
          >
            {loading ? <><div className="spinner" />Creating account…</> : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  )
}
