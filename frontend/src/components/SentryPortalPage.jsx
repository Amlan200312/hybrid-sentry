import { useState, useEffect } from 'react'

const API = 'http://localhost:8000'

const YOLO_MODELS = ['yolov8n', 'yolov8s', 'yolov8m', 'yolov8l', 'yolov8x']
const RESOLUTIONS = ['640x480', '1280x720', '1920x1080']
const FPS_OPTIONS = [15, 24, 30]

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
        style={{
          width: '100%', accentColor: 'var(--accent-blue)',
          background: 'var(--bg-elevated)', height: 4, borderRadius: 2,
        }}
      />
    </div>
  )
}

export default function SentryPortalPage() {
  const [recorders, setRecorders]   = useState([])
  const [selRec, setSelRec]         = useState('')
  const [pan, setPan]               = useState(0)
  const [tilt, setTilt]             = useState(0)
  const [yoloModel, setYoloModel]   = useState('yolov8n')
  const [sensitivity, setSensitivity] = useState(50)
  const [resolution, setResolution] = useState('1280x720')
  const [fps, setFps]               = useState(24)
  const [autoRecord, setAutoRecord] = useState(false)
  const [sending, setSending]       = useState(false)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    const token = sessionStorage.getItem('hs_token')
    fetch(`http://localhost:8000/api/recorders`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const list = d ? (Array.isArray(d) ? d : (d.recorders || [])) : []
        setRecorders(list)
        if (list.length > 0) setSelRec(list[0].id || list[0].recorder_id || '')
      })
      .catch(() => {})
  }, [])

  async function sendServo(p, t) {
    setSending(true)
    const token = sessionStorage.getItem('hs_token')
    try {
      await fetch(`http://localhost:8000/api/servo/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ pan: p, tilt: t, recorder_id: selRec }),
      })
    } catch {}
    setSending(false)
  }

  async function runServoTest() {
    setTestResult('running')
    const token = sessionStorage.getItem('hs_token')
    try {
      await fetch(`http://localhost:8000/api/servo/test`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
      })
      setTestResult('ok')
    } catch {
      setTestResult('error')
    }
    setTimeout(() => setTestResult(null), 3000)
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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* LEFT: Camera Control */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="panel">
          <div className="panel-header">Camera Control</div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Recorder selector */}
            <div className="sub-panel">
              <div className="sub-panel-title">Select Recorder</div>
              <select
                className="input-field"
                value={selRec}
                onChange={e => setSelRec(e.target.value)}
              >
                {recorders.length === 0 ? (
                  <option value="">No recorders</option>
                ) : (
                  recorders.map(rec => (
                    <option key={rec.id || rec.recorder_id} value={rec.id || rec.recorder_id}>
                      {rec.name || rec.recorder_name}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Servo controls */}
            <div className="sub-panel">
              <div className="sub-panel-title">Servo Controls</div>
              <Slider label="Pan" min={-90} max={90} value={pan} onChange={v => { setPan(v); sendServo(v, tilt) }} unit="°" />
              <Slider label="Tilt" min={-45} max={45} value={tilt} onChange={v => { setTilt(v); sendServo(pan, v) }} unit="°" />

              {/* Arrow buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 10 }}>
                <div />
                <button className="btn btn-secondary btn-sm" onClick={() => moveStep('tilt', 1)}>▲</button>
                <div />
                <button className="btn btn-secondary btn-sm" onClick={() => moveStep('pan', -1)}>◀</button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setPan(0); setTilt(0); sendServo(0, 0) }}
                  title="Center"
                >
                  ⊙
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => moveStep('pan', 1)}>▶</button>
                <div />
                <button className="btn btn-secondary btn-sm" onClick={() => moveStep('tilt', -1)}>▼</button>
                <div />
              </div>
              {sending && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', marginTop: 6 }}>
                  Sending…
                </div>
              )}
            </div>

            {/* Stream settings */}
            <div className="sub-panel">
              <div className="sub-panel-title">Stream Settings</div>
              <div style={{ marginBottom: 10 }}>
                <label className="input-label">Resolution</label>
                <select className="input-field" value={resolution} onChange={e => setResolution(e.target.value)}>
                  {RESOLUTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {FPS_OPTIONS.map(f => (
                  <button
                    key={f}
                    className={`filter-pill ${fps === f ? 'active' : ''}`}
                    onClick={() => setFps(f)}
                  >
                    {f} FPS
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: System Control */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="panel">
          <div className="panel-header">System Control</div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* YOLO model */}
            <div className="sub-panel">
              <div className="sub-panel-title">YOLO Model</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {YOLO_MODELS.map(m => (
                  <button
                    key={m}
                    className={`filter-pill ${yoloModel === m ? 'active' : ''}`}
                    onClick={() => setYoloModel(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Sensitivity */}
            <div className="sub-panel">
              <div className="sub-panel-title">Detection Sensitivity</div>
              <Slider label="Confidence Threshold" min={10} max={90} value={sensitivity} onChange={setSensitivity} unit="%" />
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                Lower = more detections, Higher = fewer false positives
              </div>
            </div>

            {/* Auto record */}
            <div className="sub-panel">
              <div className="sub-panel-title">Recording Settings</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <label className="toggle">
                  <input type="checkbox" checked={autoRecord} onChange={e => setAutoRecord(e.target.checked)} />
                  <span className="toggle-slider" />
                </label>
                <span style={{ fontSize: 13 }}>Auto-record on detection</span>
              </label>
            </div>

            {/* Servo test */}
            <div className="sub-panel">
              <div className="sub-panel-title">Servo Test</div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={runServoTest}
                disabled={testResult === 'running'}
              >
                {testResult === 'running' ? <><div className="spinner" />Testing…</> : '⚙ Run Servo Test'}
              </button>
              {testResult === 'ok' && (
                <span style={{ fontSize: 12, color: 'var(--accent-green)', marginLeft: 8 }}>✓ Test passed</span>
              )}
              {testResult === 'error' && (
                <span style={{ fontSize: 12, color: 'var(--accent-red)', marginLeft: 8 }}>✗ Test failed</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
