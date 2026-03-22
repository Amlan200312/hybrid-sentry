import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

/* ── Step indicator ──────────────────────────────────────────── */
function StepBar({ step }) {
  const steps = ['Organization', 'Admin Account', 'Complete']
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 32 }}>
      {steps.map((label, i) => {
        const idx = i + 1
        const done = step > idx
        const active = step === idx
        return (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: done ? 'var(--accent-green)' : active ? 'var(--accent-blue)' : 'var(--bg-elevated)',
                border: `2px solid ${done ? 'var(--accent-green)' : active ? 'var(--accent-blue)' : 'var(--border-default)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: done || active ? '#fff' : 'var(--text-muted)',
                fontSize: 13, fontWeight: 600, flexShrink: 0,
                transition: 'all 0.3s ease',
              }}>
                {done ? '✓' : idx}
              </div>
              <span style={{
                fontSize: 11,
                color: active ? 'var(--text-primary)' : done ? 'var(--accent-green)' : 'var(--text-muted)',
                whiteSpace: 'nowrap',
              }}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{
                flex: 1,
                height: 2,
                background: done ? 'var(--accent-green)' : 'var(--border-default)',
                margin: '0 8px',
                marginBottom: 20,
                transition: 'background 0.3s ease',
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── PIN boxes (n boxes) ─────────────────────────────────────── */
function PINBoxes({ length = 8, value, onChange, label, error }) {
  const inputRef = useRef(null)

  function handleKey(e) {
    const digit = e.key
    if (/^\d$/.test(digit)) {
      if (value.length < length) onChange(value + digit)
    } else if (e.key === 'Backspace') {
      onChange(value.slice(0, -1))
    }
    e.preventDefault()
  }

  return (
    <div>
      <label className="input-label">{label}</label>
      <div
        style={{ display: 'flex', gap: 6, cursor: 'text' }}
        onClick={() => inputRef.current?.focus()}
      >
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          value={value}
          onChange={() => {}}
          onKeyDown={handleKey}
          style={{
            position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1,
          }}
          maxLength={length}
        />
        {Array.from({ length }).map((_, i) => {
          const filled = i < value.length
          const active = i === value.length
          return (
            <div
              key={i}
              style={{
                width: 40, height: 40,
                background: 'var(--bg-elevated)',
                border: `1px solid ${active ? 'var(--accent-blue)' : 'var(--border-default)'}`,
                borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20,
                color: 'var(--text-primary)',
                boxShadow: active ? '0 0 0 3px rgba(56,139,253,0.15)' : 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s',
                flexShrink: 0,
              }}
            >
              {filled ? '●' : ''}
            </div>
          )
        })}
      </div>
      {error && <div className="input-error">{error}</div>}
    </div>
  )
}

/* ── Field component ─────────────────────────────────────────── */
function Field({ label, required, error, children }) {
  return (
    <div>
      <label className="input-label">
        {label}{required && <span style={{ color: 'var(--accent-red)', marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {error && <div className="input-error">{error}</div>}
    </div>
  )
}

/* ════════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════════ */
export default function SetupWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})

  // Step 1 state
  const [orgName, setOrgName]       = useState('')
  const [location, setLocation]     = useState('')
  const [secLevel, setSecLevel]     = useState('Standard')

  // Step 2 state
  const [fullName, setFullName]         = useState('')
  const [username, setUsername]         = useState('')
  const [badgeId, setBadgeId]           = useState('')
  const [rankVal, setRankVal]           = useState('')
  const [unitName, setUnitName]         = useState('')
  const [contact, setContact]           = useState('')
  const [bloodGroup, setBloodGroup]     = useState('')
  const [idPass, setIdPass]             = useState('')
  const [pin, setPin]                   = useState('')
  const [confirmPin, setConfirmPin]     = useState('')

  function validateStep1() {
    const e = {}
    if (!orgName.trim())   e.orgName  = 'Organization name is required'
    if (!location.trim())  e.location = 'Base location is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function validateStep2() {
    const e = {}
    if (!fullName.trim())    e.fullName    = 'Full name is required'
    if (!username.trim())    e.username    = 'Username is required'
    if (!badgeId.trim())     e.badgeId     = 'Badge / ID number is required'
    if (!rankVal.trim())     e.rankVal     = 'Rank / Designation is required'
    if (!unitName.trim())    e.unitName    = 'Unit / Department is required'
    if (!contact.trim())     e.contact     = 'Contact number is required'
    if (!bloodGroup)         e.bloodGroup  = 'Blood group is required'
    if (!idPass.trim())      e.idPass      = 'ID Pass Number is required'
    if (pin.length !== 8)    e.pin         = 'PIN must be exactly 8 digits'
    if (pin !== confirmPin)  e.confirmPin  = 'PINs do not match'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSetup() {
    if (!validateStep2()) return
    setLoading(true)
    try {
      await axios.post(`${API}/api/system/setup`, {
        org_name: orgName,
        location,
        security_level: secLevel,
        admin_name: fullName,
        admin_username: username,
        admin_pin: pin,
        badge_id: badgeId,
        rank: rankVal,
        designation: rankVal,
        unit_name: unitName,
        contact_number: contact,
        blood_group: bloodGroup,
        id_pass_number: idPass,
      })
      setStep(3)
    } catch (err) {
      const msg = err.response?.data?.detail || 'Setup failed. Please try again.'
      setErrors({ submit: msg })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
    }}>
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 4 }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <polygon points="14,2 26,9 26,19 14,26 2,19 2,9" fill="none" stroke="#388bfd" strokeWidth="2"/>
            <polygon points="14,7 21,11 21,17 14,21 7,17 7,11" fill="#388bfd" opacity="0.2"/>
          </svg>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
            Hybrid Sentry
          </span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>System Setup</div>
      </div>

      {/* Wizard card */}
      <div style={{
        width: '100%',
        maxWidth: 480,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: '28px 28px 24px',
      }}>
        <StepBar step={step} />

        {/* ── STEP 1: Organization ── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                Set up your organization
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Configure your surveillance system
              </div>
            </div>

            <Field label="Organization Name" required error={errors.orgName}>
              <input
                className="input"
                placeholder="e.g. Northern Command"
                value={orgName}
                onChange={e => { setOrgName(e.target.value); setErrors(p => ({...p, orgName: ''})) }}
              />
            </Field>

            <Field label="Base Location" required error={errors.location}>
              <input
                className="input"
                placeholder="e.g. Forward Operating Base Alpha"
                value={location}
                onChange={e => { setLocation(e.target.value); setErrors(p => ({...p, location: ''})) }}
              />
            </Field>

            <Field label="Security Level" required>
              <select
                className="input"
                value={secLevel}
                onChange={e => setSecLevel(e.target.value)}
              >
                <option>Standard</option>
                <option>High</option>
                <option>Critical</option>
              </select>
            </Field>

            <button
              className="btn btn-primary btn-full"
              style={{ marginTop: 8, height: 40 }}
              onClick={() => { if (validateStep1()) setStep(2) }}
            >
              Continue →
            </button>
          </div>
        )}

        {/* ── STEP 2: Admin Account ── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                Create admin account
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                You'll use this to sign in
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Full Name" required error={errors.fullName}>
                <input
                  className="input"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={e => { setFullName(e.target.value); setErrors(p => ({...p, fullName: ''})) }}
                />
              </Field>

              <Field label="Username" required error={errors.username}>
                <input
                  className="input"
                  placeholder="admin"
                  value={username}
                  onChange={e => { setUsername(e.target.value.toLowerCase()); setErrors(p => ({...p, username: ''})) }}
                />
              </Field>

              <Field label="Badge / ID Number" required error={errors.badgeId}>
                <input
                  className="input"
                  placeholder="ADM-001"
                  value={badgeId}
                  onChange={e => { setBadgeId(e.target.value); setErrors(p => ({...p, badgeId: ''})) }}
                />
              </Field>

              <Field label="Rank / Designation" required error={errors.rankVal}>
                <input
                  className="input"
                  placeholder="Major"
                  value={rankVal}
                  onChange={e => { setRankVal(e.target.value); setErrors(p => ({...p, rankVal: ''})) }}
                />
              </Field>

              <Field label="Unit / Department" required error={errors.unitName}>
                <input
                  className="input"
                  placeholder="Command HQ"
                  value={unitName}
                  onChange={e => { setUnitName(e.target.value); setErrors(p => ({...p, unitName: ''})) }}
                />
              </Field>

              <Field label="Contact Number" required error={errors.contact}>
                <input
                  className="input"
                  placeholder="+91-9999999999"
                  value={contact}
                  onChange={e => { setContact(e.target.value); setErrors(p => ({...p, contact: ''})) }}
                />
              </Field>

              <Field label="Blood Group" required error={errors.bloodGroup}>
                <select
                  className="input"
                  value={bloodGroup}
                  onChange={e => { setBloodGroup(e.target.value); setErrors(p => ({...p, bloodGroup: ''})) }}
                >
                  <option value="">Select…</option>
                  {BLOOD_GROUPS.map(bg => <option key={bg}>{bg}</option>)}
                </select>
              </Field>

              <Field label="ID Pass Number" required error={errors.idPass}>
                <input
                  className="input"
                  placeholder="IP-2025-001"
                  value={idPass}
                  onChange={e => { setIdPass(e.target.value); setErrors(p => ({...p, idPass: ''})) }}
                />
              </Field>
            </div>

            <PINBoxes
              length={8}
              value={pin}
              onChange={v => { setPin(v); setErrors(p => ({...p, pin: '', confirmPin: ''})) }}
              label="8-Digit PIN *"
              error={errors.pin}
            />

            <PINBoxes
              length={8}
              value={confirmPin}
              onChange={v => { setConfirmPin(v); setErrors(p => ({...p, confirmPin: ''})) }}
              label="Confirm PIN *"
              error={errors.confirmPin}
            />

            {errors.submit && (
              <div className="alert-error">
                <span>⚠</span> {errors.submit}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                className="btn btn-secondary"
                onClick={() => setStep(1)}
                style={{ flex: 0 }}
              >
                ← Back
              </button>
              <button
                className="btn btn-primary btn-full"
                style={{ height: 40 }}
                onClick={handleSetup}
                disabled={loading}
              >
                {loading ? <><div className="spinner" /> Creating…</> : 'Create Account →'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Complete ── */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'rgba(63,185,80,0.15)',
                border: '2px solid var(--accent-green)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
                fontSize: 28,
              }}>✓</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                You're all set!
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Hybrid Sentry is ready to use
              </div>
            </div>

            {/* Summary card */}
            <div style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: 6,
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}>
              {[
                ['Organization', orgName],
                ['Location', location],
                ['Security Level', secLevel],
                ['Admin Username', username],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>

            <div className="alert-info">
              <span style={{ flexShrink: 0, marginTop: 1 }}>ℹ</span>
              <span>
                Default accounts have also been created for <strong>Monitor</strong> (PIN: 123456)
                and <strong>Recorder</strong> (PIN: 1234) roles.
              </span>
            </div>

            <button
              className="btn btn-primary btn-full"
              style={{ height: 40 }}
              onClick={() => navigate('/login')}
            >
              Go to Sign In →
            </button>
          </div>
        )}
      </div>

      <div style={{
        marginTop: 20,
        fontSize: 11,
        color: 'var(--text-muted)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}>
        Hybrid Sentry · Secure Access
      </div>
    </div>
  )
}
