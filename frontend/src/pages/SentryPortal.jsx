import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

const API = 'http://localhost:8000'

/* ── Helpers ────────────────────────────────────────────────── */
function SectionCard({ title, icon, children }) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      marginBottom: 24,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--bg-elevated)',
      }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label className="input-label">{label}</label>
      {children}
    </div>
  )
}

function SaveBar({ saving, saved, error }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? <><div className="spinner" />Saving…</> : '💾 Save Changes'}
      </button>
      {saved  && <span style={{ fontSize: 13, color: 'var(--accent-green)',  animation: 'fadeIn 0.2s' }}>✅ Saved</span>}
      {error  && <span style={{ fontSize: 13, color: 'var(--accent-red)',    animation: 'fadeIn 0.2s' }}>❌ {error}</span>}
    </div>
  )
}

/* ── PIN boxes ──────────────────────────────────────────────── */
function PINBoxes({ value, onChange, length = 6 }) {
  const refs = Array.from({ length }, () => useRef(null))
  function handleKey(i, e) {
    const digit = e.key
    if (digit >= '0' && digit <= '9') {
      const next = value.slice(0, i) + digit + value.slice(i + 1)
      onChange(next)
      if (i < length - 1) refs[i + 1].current?.focus()
    } else if (digit === 'Backspace') {
      const next = value.slice(0, i) + '0' + value.slice(i + 1)
      onChange(next)
      if (i > 0) refs[i - 1].current?.focus()
    }
  }
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {Array.from({ length }).map((_, i) => (
        <div
          key={i}
          ref={refs[i]}
          tabIndex={0}
          onKeyDown={e => handleKey(i, e)}
          onClick={() => refs[i].current?.focus()}
          style={{
            width: 42, height: 48,
            background: 'var(--bg-base)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 700,
            fontFamily: 'JetBrains Mono, monospace',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            outline: 'none',
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--accent-blue)'; e.target.style.boxShadow = '0 0 0 3px rgba(56,139,253,0.2)' }}
          onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none' }}
        >
          {value[i] !== '0' && value[i] ? '●' : '○'}
        </div>
      ))}
    </div>
  )
}

/* ── Profile section (all users) ────────────────────────────── */
function ProfileSection({ user, onUpdate }) {
  const [form,  setForm]  = useState({})
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [err,    setErr]    = useState('')

  useEffect(() => {
    if (!user) return
    setForm({
      display_name:   user.display_name || '',
      callsign:       user.callsign     || '',
      unit:           user.unit         || '',
      rank:           user.rank         || '',
      service_number: user.service_number || '',
      email:          user.email        || '',
    })
  }, [user])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setSaved(false); setErr('')
    const token = sessionStorage.getItem('hs_token')
    try {
      const r = await fetch(`${API}/api/users/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(form),
        credentials: 'include',
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const updated = await r.json()
      onUpdate(updated)
      setSaved(true)
      sessionStorage.setItem('hs_display_name', form.display_name)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!user) return <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><div className="spinner" /></div>

  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })) }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
        <Field label="Display Name">
          <input className="input" value={form.display_name || ''} onChange={set('display_name')} />
        </Field>
        <Field label="Callsign">
          <input className="input" value={form.callsign || ''} onChange={set('callsign')} placeholder="e.g. ALPHA-1" />
        </Field>
        <Field label="Rank">
          <input className="input" value={form.rank || ''} onChange={set('rank')} placeholder="e.g. Sergeant" />
        </Field>
        <Field label="Service Number">
          <input className="input" value={form.service_number || ''} onChange={set('service_number')} placeholder="e.g. SN-00123" />
        </Field>
        <Field label="Unit">
          <input className="input" value={form.unit || ''} onChange={set('unit')} placeholder="e.g. Bravo Company, 3rd Platoon" />
        </Field>
        <Field label="Email">
          <input className="input" type="email" value={form.email || ''} onChange={set('email')} />
        </Field>
      </div>
      <SaveBar saving={saving} saved={saved} error={err} />
    </form>
  )
}

/* ── Change PIN section ─────────────────────────────────────── */
function ChangePINSection() {
  const [oldPin, setOldPin] = useState('000000')
  const [newPin, setNewPin] = useState('000000')
  const [saving, setSaving] = useState(false)
  const [msg,    setMsg]    = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (newPin === '000000' || !/^\d{4,6}$/.test(newPin)) { setMsg('❌ Enter a valid PIN (4–6 digits)'); return }
    setSaving(true); setMsg('')
    const token = sessionStorage.getItem('hs_token')
    try {
      const r = await fetch(`${API}/api/users/change-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ old_pin: oldPin, new_pin: newPin }),
        credentials: 'include',
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`)
      setMsg('✅ PIN changed successfully')
      setOldPin('000000'); setNewPin('000000')
    } catch (err) {
      setMsg('❌ ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Field label="Current PIN">
        <PINBoxes value={oldPin} onChange={setOldPin} length={6} />
      </Field>
      <Field label="New PIN">
        <PINBoxes value={newPin} onChange={setNewPin} length={6} />
      </Field>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <button type="submit" className="btn btn-secondary" disabled={saving}>
          {saving ? <><div className="spinner" />Changing…</> : '🔐 Change PIN'}
        </button>
        {msg && <span style={{ fontSize: 13, color: msg.startsWith('✅') ? 'var(--accent-green)' : 'var(--accent-red)', animation: 'fadeIn 0.2s' }}>{msg}</span>}
      </div>
    </form>
  )
}

/* ── Admin — User Management ────────────────────────────────── */
function AdminUsersSection() {
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [acting,  setActing]  = useState(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const token = sessionStorage.getItem('hs_token')
    try {
      const r = await fetch(`${API}/api/users`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      setUsers(Array.isArray(d) ? d : (d.users || []))
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  async function changeRole(userId, newRole) {
    setActing(userId)
    const token = sessionStorage.getItem('hs_token')
    try {
      const r = await fetch(`${API}/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ role: newRole }),
        credentials: 'include',
      })
      if (r.ok) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
      }
    } catch {}
    setActing(null)
  }

  async function deleteUser(userId) {
    if (!window.confirm('Delete this user? This cannot be undone.')) return
    setActing(userId)
    const token = sessionStorage.getItem('hs_token')
    try {
      const r = await fetch(`${API}/api/users/${userId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      })
      if (r.ok) setUsers(prev => prev.filter(u => u.id !== userId))
    } catch {}
    setActing(null)
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><div className="spinner" /></div>
  if (error)   return <div className="error-state"><div className="error-state-title">Failed to load users</div><div className="error-state-msg">{error}</div><button className="btn btn-secondary btn-sm" onClick={fetchUsers}>↺ Retry</button></div>
  if (users.length === 0) return <div className="empty-state"><div className="empty-state-icon">👥</div><div className="empty-state-sub">No users in the system</div></div>

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Username</th>
            <th>Callsign</th>
            <th>Role</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id}>
              <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{user.display_name || '—'}</td>
              <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{user.username || '—'}</td>
              <td>{user.callsign || '—'}</td>
              <td>
                <select
                  className="input"
                  style={{ padding: '3px 8px', fontSize: 11, width: 110 }}
                  value={user.role || 'recorder'}
                  onChange={e => changeRole(user.id, e.target.value)}
                  disabled={acting === user.id}
                >
                  <option value="admin">Admin</option>
                  <option value="monitor">Monitor</option>
                  <option value="recorder">Recorder</option>
                </select>
              </td>
              <td>
                <span className={`badge ${user.is_active !== false ? 'badge-green' : 'badge-muted'}`}>
                  {user.is_active !== false ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td>
                <button
                  className="btn btn-danger btn-xs"
                  onClick={() => deleteUser(user.id)}
                  disabled={acting === user.id}
                >
                  {acting === user.id ? <div className="spinner" /> : '🗑 Delete'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Admin — Pending approvals ──────────────────────────────── */
function AdminPendingSection() {
  const [items,  setItems]  = useState([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(null)

  const fetch_ = useCallback(async () => {
    setLoading(true)
    const token = sessionStorage.getItem('hs_token')
    try {
      const r = await fetch(`${API}/api/users/pending-approvals`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      })
      const d = await r.json()
      setItems(Array.isArray(d) ? d : [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { fetch_() }, [fetch_])

  async function approve(id) {
    setActing(id)
    const token = sessionStorage.getItem('hs_token')
    try {
      await fetch(`${API}/api/users/${id}/approve`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      })
      setItems(prev => prev.filter(u => u.id !== id))
    } catch {}
    setActing(null)
  }

  async function reject(id) {
    setActing(id)
    const token = sessionStorage.getItem('hs_token')
    try {
      await fetch(`${API}/api/users/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      })
      setItems(prev => prev.filter(u => u.id !== id))
    } catch {}
    setActing(null)
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><div className="spinner" /></div>

  if (items.length === 0) return (
    <div className="empty-state">
      <div style={{ fontSize: 36, animation: 'fadeUp 0.4s ease' }}>✅</div>
      <div className="empty-state-title" style={{ color: 'var(--accent-green)' }}>No pending approvals</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map(u => (
        <div key={u.id} style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '12px 16px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 8,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{u.display_name || u.username}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Role: {u.role} · Callsign: {u.callsign || '—'}</div>
          </div>
          <button className="btn btn-success btn-sm" onClick={() => approve(u.id)} disabled={acting === u.id}>✅ Approve</button>
          <button className="btn btn-danger btn-sm"  onClick={() =>  reject(u.id)} disabled={acting === u.id}>✕ Reject</button>
        </div>
      ))}
    </div>
  )
}

/* ── Admin — Camera Management ──────────────────────────────── */
function AdminCamerasSection() {
  const [cameras, setCameras] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(null)
  const [edits,   setEdits]   = useState({})

  useEffect(() => {
    const token = sessionStorage.getItem('hs_token')
    fetch(`${API}/api/cameras`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : [])
      .then(d => { setCameras(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function saveCamera(camId) {
    setSaving(camId)
    const token = sessionStorage.getItem('hs_token')
    const patch = edits[camId] || {}
    try {
      await fetch(`${API}/api/cameras/${camId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(patch),
        credentials: 'include',
      })
      setCameras(prev => prev.map(c => c.camera_id === camId ? { ...c, ...patch } : c))
      setEdits(prev => { const n = { ...prev }; delete n[camId]; return n })
    } catch {}
    setSaving(null)
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><div className="spinner" /></div>
  if (cameras.length === 0) return (
    <div className="empty-state">
      <div className="empty-state-icon">📷</div>
      <div className="empty-state-title">No cameras configured</div>
      <div className="empty-state-sub">Cameras registered by recorder nodes will appear here.</div>
    </div>
  )

  function setEdit(camId, key, val) {
    setEdits(prev => ({ ...prev, [camId]: { ...(prev[camId] || {}), [key]: val } }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {cameras.map(cam => {
        const e = edits[cam.camera_id] || {}
        return (
          <div key={cam.camera_id} style={{
            padding: '14px 16px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr auto',
            gap: 12,
            alignItems: 'end',
          }}>
            <div>
              <label className="input-label">Camera ID</label>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text-primary)', padding: '8px 0' }}>{cam.camera_id}</div>
            </div>
            <div>
              <label className="input-label">Display Name</label>
              <input
                className="input"
                value={e.display_name ?? (cam.display_name || '')}
                onChange={ev => setEdit(cam.camera_id, 'display_name', ev.target.value)}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={`badge ${cam.is_online ? 'badge-green' : 'badge-muted'}`}>
                  {cam.is_online ? '● Online' : '○ Offline'}
                </span>
              </div>
              {edits[cam.camera_id] && (
                <button className="btn btn-primary btn-sm" onClick={() => saveCamera(cam.camera_id)} disabled={saving === cam.camera_id}>
                  {saving === cam.camera_id ? <div className="spinner" /> : '💾 Save'}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   ROOT — SentryPortal
   ═══════════════════════════════════════════════════════════ */
export default function SentryPortal() {
  const navigate    = useNavigate()
  const [user,      setUser]    = useState(null)
  const [loading,   setLoading] = useState(true)
  const [error,     setError]   = useState(null)
  const [returning, setReturning] = useState(false)

  // Determine where to return (the view that opened the portal)
  const returnPath = sessionStorage.getItem('hs_role') === 'recorder' ? '/recorder' : '/monitor'

  useEffect(() => {
    const token = sessionStorage.getItem('hs_token')
    // Validate token first — if missing, redirect to login right away
    if (!token) {
      navigate('/login', { replace: true })
      return
    }
    fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    })
      .then(r => {
        if (r.status === 401 || r.status === 403) {
          sessionStorage.clear()
          navigate('/login', { replace: true })
          throw new Error('Unauthenticated')
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(d => {
        setUser(d)
        // Store fresh values in sessionStorage
        sessionStorage.setItem('hs_display_name', d.display_name || '')
        sessionStorage.setItem('hs_callsign', d.callsign || '')
        sessionStorage.setItem('hs_role', d.role || '')
        setLoading(false)
      })
      .catch(err => {
        if (err.message !== 'Unauthenticated') {
          setError(err.message)
          setLoading(false)
        }
      })
  }, [navigate])

  async function logout() {
    const token = sessionStorage.getItem('hs_token')
    try {
      await fetch(`${API}/api/auth/logout`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      })
    } catch {}
    sessionStorage.clear()
    navigate('/login', { replace: true })
  }

  function goBack() {
    setReturning(true)
    navigate(returnPath)
  }

  const isAdmin = user?.role === 'admin'

  const initials = (user?.display_name || 'OP')
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
        <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
        <div className="error-state" style={{ maxWidth: 320 }}>
          <div className="error-state-title">Failed to load portal</div>
          <div className="error-state-msg">{error}</div>
          <button className="btn btn-secondary btn-sm" onClick={() => window.location.reload()}>↺ Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        height: 52,
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 12,
        flexShrink: 0,
      }}>
        <button className="btn btn-ghost btn-sm" onClick={goBack} disabled={returning} title={`Return to ${returnPath}`}>
          ← Back
        </button>
        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
          <polygon points="10,1 19,5.5 19,14.5 10,19 1,14.5 1,5.5" fill="none" stroke="#388bfd" strokeWidth="1.5" />
          <circle cx="10" cy="10" r="3.5" fill="#388bfd" opacity="0.7" />
        </svg>
        <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.08em' }}>
          SENTRY PORTAL
        </span>
        <div style={{ flex: 1 }} />
        {/* Avatar */}
        <div style={{
          width: 30, height: 30, borderRadius: '50%',
          background: 'var(--accent-blue)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, color: '#fff',
          border: '2px solid rgba(56,139,253,0.3)',
        }}>
          {initials}
        </div>
        <div style={{ lineHeight: 1.3 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{user?.display_name}</div>
          <span className={`badge badge-${user?.role === 'admin' ? 'blue' : user?.role === 'monitor' ? 'green' : 'amber'}`} style={{ fontSize: 10 }}>
            {user?.role}
          </span>
        </div>
        <button className="btn btn-danger btn-sm" onClick={logout}>⏏ Logout</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 24px', maxWidth: 920, margin: '0 auto', width: '100%' }}>

        {/* Profile */}
        <SectionCard title="My Profile" icon="👤">
          <ProfileSection user={user} onUpdate={setUser} />
        </SectionCard>

        {/* Change PIN */}
        <SectionCard title="Change PIN" icon="🔐">
          <ChangePINSection />
        </SectionCard>

        {/* Admin sections */}
        {isAdmin && (
          <>
            <SectionCard title="User Management" icon="👥">
              <AdminUsersSection />
            </SectionCard>

            <SectionCard title="Pending Approvals" icon="⏳">
              <AdminPendingSection />
            </SectionCard>

            <SectionCard title="Camera Management" icon="📷">
              <AdminCamerasSection />
            </SectionCard>
          </>
        )}
      </div>
    </div>
  )
}
