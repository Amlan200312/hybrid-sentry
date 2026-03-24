import { useState, useEffect, useRef } from 'react'
import { authFetch } from '../utils/api'

const YOLO_MODELS = ['yolov8n', 'yolov8s', 'yolov8m', 'yolov8l', 'yolov8x']

function Slider({ label, min, max, value, onChange, unit = '' }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-blue)' }}>{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        onMouseUp={e => onChange(Number(e.target.value), true)}
        onTouchEnd={e => onChange(Number(e.target.value), true)}
        style={{
          width: '100%', accentColor: 'var(--accent-blue)',
          background: 'var(--bg-elevated)', height: 4, borderRadius: 2,
        }}
      />
    </div>
  )
}

export default function SentryPortalPage() {
  const [tab, setTab] = useState('camera')

  // Data states
  const [cameras, setCameras] = useState([])
  const [users, setUsers] = useState([])
  const [config, setConfig] = useState({})
  
  // Camera specific states
  const [selRec, setSelRec] = useState('')
  const [pan, setPan] = useState(0)
  const [tilt, setTilt] = useState(0)
  const [sending, setSending] = useState(false)
  const [testResult, setTestResult] = useState(null)
  
  const timerRef = useRef(null)

  useEffect(() => { loadData() }, [tab])

  async function loadData() {
    try {
      if (tab === 'camera') {
        const r = await authFetch('/api/cameras')
        if (r?.ok) {
          const list = await r.json()
          setCameras(list)
          if (list.length > 0 && !selRec) setSelRec(list[0].camera_id)
        }
      } else if (tab === 'user') {
        const r = await authFetch('/api/users')
        if (r?.ok) setUsers(await r.json())
      } else if (tab === 'system') {
        const r = await authFetch('/api/system/config')
        if (r?.ok) setConfig(await r.json())
      }
    } catch {}
  }

  // --- SERVO COMMANDS ---
  async function sendServo(p, t) {
    setSending(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      authFetch('/api/sensors/servo', {
        method: 'POST',
        body: JSON.stringify({ pan: p, tilt: t, recorder_id: selRec }),
      }).finally(() => setSending(false))
    }, 300)
  }

  function moveStep(axis, dir) {
    if (axis === 'pan') {
      const next = Math.max(-90, Math.min(90, pan + dir * 10))
      setPan(next); sendServo(next, tilt)
    } else {
      const next = Math.max(-45, Math.min(45, tilt + dir * 10))
      setTilt(next); sendServo(pan, next)
    }
  }

  async function runServoTest() {
    setTestResult('running')
    try {
      const r = await authFetch('/api/servo/test', { method: 'POST' })
      setTestResult(r.ok ? 'ok' : 'error')
    } catch { setTestResult('error') }
    setTimeout(() => setTestResult(null), 3000)
  }

  // --- USER MGT ---
  async function handleResetPin(username) {
    if (!window.confirm(`Reset PIN to 0000 for ${username}?`)) return
    try {
      const r = await authFetch('/api/users/admin-reset-pin', {
        method: 'POST',
        body: JSON.stringify({ username, new_pin: '0000' })
      })
      if (r.ok) alert('PIN reset to 0000.')
      else alert('Failed to reset PIN.')
    } catch (e) { alert('Error: ' + e) }
  }

  async function handleDeleteUser(username) {
    if (!window.confirm(`Delete user ${username}?`)) return
    try {
      const r = await authFetch(`/api/users/${username}`, { method: 'DELETE' })
      if (r.ok) setUsers(u => u.filter(user => user.username !== username))
      else alert('Failed to delete user.')
    } catch (e) { alert('Error: ' + e) }
  }

  // --- SYSTEM MGT ---
  async function handleSaveConfig(key, value) {
    setConfig(prev => ({ ...prev, [key]: value }))
    try {
      await authFetch('/api/system/config', {
        method: 'PUT',
        body: JSON.stringify({ [key]: value })
      })
    } catch (e) { alert('Failed to save system config.') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', maxWidth: 800, margin: '0 auto', width: '100%' }}>
      {/* TABS */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        <button className={`btn ${tab==='camera'?'btn-primary':'btn-ghost'}`} onClick={()=>setTab('camera')}>📹 Camera Management</button>
        <button className={`btn ${tab==='user'?'btn-primary':'btn-ghost'}`} onClick={()=>setTab('user')}>👥 User Management</button>
        <button className={`btn ${tab==='system'?'btn-primary':'btn-ghost'}`} onClick={()=>setTab('system')}>⚙️ System Config</button>
      </div>

      <div style={{ overflowY: 'auto' }}>
        {tab === 'camera' && (
          <div className="panel">
            <div className="panel-header">Camera Control</div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="sub-panel">
                <div className="sub-panel-title">Select Camera / Recorder</div>
                <select className="input-field" value={selRec} onChange={e => setSelRec(e.target.value)}>
                  {cameras.length === 0 ? <option value="">No cameras</option> : cameras.map(c => (
                    <option key={c.camera_id} value={c.camera_id}>{c.display_name} ({c.camera_id})</option>
                  ))}
                </select>
              </div>

              <div className="sub-panel">
                <div className="sub-panel-title">Servo Controls</div>
                <Slider label="Pan" min={-90} max={90} value={pan} onChange={(v, done) => { setPan(v); if(done) sendServo(v, tilt) }} unit="°" />
                <Slider label="Tilt" min={-45} max={45} value={tilt} onChange={(v, done) => { setTilt(v); if(done) sendServo(pan, v) }} unit="°" />
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 10, maxWidth: 300, margin: '10px auto 0' }}>
                  <div />
                  <button className="btn btn-secondary btn-sm" onClick={() => moveStep('tilt', 1)}>▲</button>
                  <div />
                  <button className="btn btn-secondary btn-sm" onClick={() => moveStep('pan', -1)}>◀</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setPan(0); setTilt(0); sendServo(0, 0) }}>⊙</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => moveStep('pan', 1)}>▶</button>
                  <div />
                  <button className="btn btn-secondary btn-sm" onClick={() => moveStep('tilt', -1)}>▼</button>
                  <div />
                </div>
                {sending && <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', marginTop: 6 }}>Sending…</div>}
              </div>

              <div className="sub-panel">
                <div className="sub-panel-title">Servo Test</div>
                <button className="btn btn-secondary btn-sm" onClick={runServoTest} disabled={testResult === 'running'}>
                  {testResult === 'running' ? 'Testing…' : '⚙ Run Calibration Test'}
                </button>
                {testResult === 'ok' && <span style={{ fontSize: 12, color: 'var(--accent-green)', marginLeft: 8 }}>✓ Passed</span>}
                {testResult === 'error' && <span style={{ fontSize: 12, color: 'var(--accent-red)', marginLeft: 8 }}>✗ Failed</span>}
              </div>
            </div>
          </div>
        )}

        {tab === 'user' && (
          <div className="panel">
            <div className="panel-header">User Accounts</div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {users.map(u => (
                <div key={u.username} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, background: 'var(--bg-elevated)', borderRadius: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{u.display_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>@{u.username} • {u.role}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => handleResetPin(u.username)}>Reset PIN</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDeleteUser(u.username)}>Delete</button>
                  </div>
                </div>
              ))}
              {users.length === 0 && <div className="empty-state">No users fetched.</div>}
            </div>
          </div>
        )}

        {tab === 'system' && (
          <div className="panel">
            <div className="panel-header">System Settings</div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="sub-panel">
                <div className="sub-panel-title">YOLO Model</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {YOLO_MODELS.map(m => (
                    <button
                      key={m}
                      className={`filter-pill ${config.yolo_model === m ? 'active' : ''}`}
                      onClick={() => handleSaveConfig('yolo_model', m)}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sub-panel">
                <div className="sub-panel-title">Detection Sensitivity</div>
                <Slider 
                  label="Confidence Threshold" 
                  min={10} max={90} 
                  value={Number(config.detection_confidence || 50)} 
                  onChange={(v, done) => { if(done) handleSaveConfig('detection_confidence', v); else setConfig(c => ({...c, detection_confidence: v})) }} 
                  unit="%" 
                />
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Higher = fewer false positives</div>
              </div>

              <div className="sub-panel">
                <div className="sub-panel-title">Global Auto-Record</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <label className="toggle">
                    <input type="checkbox" checked={config.auto_record === 'true'} onChange={e => handleSaveConfig('auto_record', e.target.checked ? 'true' : 'false')} />
                    <span className="toggle-slider" />
                  </label>
                  <span style={{ fontSize: 13 }}>Capture video clips on confirmed detections</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
