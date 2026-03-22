import { useState, useEffect, useRef } from 'react'

const API = 'http://localhost:8000'

/* ── Skeleton row ── */
function SkeletonRow() {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--bg-elevated)' }}>
      <div className="skeleton" style={{ width: 60, height: 12 }} />
      <div className="skeleton" style={{ width: 80, height: 12 }} />
      <div className="skeleton" style={{ width: 100, height: 12 }} />
      <div className="skeleton" style={{ flex: 1, height: 12 }} />
    </div>
  )
}

/* ── Error state ── */
function ErrorState({ message, onRetry }) {
  return (
    <div className="error-state">
      <div style={{ fontSize: 13, color: 'var(--accent-red)', fontWeight: 600 }}>Failed to load</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{message}</div>
      <button className="btn btn-secondary btn-sm" onClick={onRetry}>↺ Retry</button>
    </div>
  )
}

/* ── Stats strip ── */
function StatChip({ label, value }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: '4px 10px',
      fontSize: 12,
      display: 'flex',
      gap: 6,
      alignItems: 'center',
    }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}:</span>
      <span style={{ color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace' }}>{value}</span>
    </div>
  )
}

/* ── Signal bars SVG ── */
function SignalBars({ strength }) {
  // strength: -30 (strong) to -90 (weak)
  const bars = strength >= -50 ? 4 : strength >= -65 ? 3 : strength >= -80 ? 2 : 1
  return (
    <svg width="16" height="12" viewBox="0 0 16 12">
      {[0,1,2,3].map(i => (
        <rect
          key={i}
          x={i * 4 + i}
          y={12 - (i + 1) * 3}
          width={3}
          height={(i + 1) * 3}
          fill={i < bars ? 'var(--accent-green)' : 'var(--border)'}
          rx={1}
        />
      ))}
    </svg>
  )
}

export default function LiveFeedsPage() {
  const [recorders, setRecorders]     = useState(null)
  const [loadingRec, setLoadingRec]   = useState(true)
  const [errorRec, setErrorRec]       = useState(null)
  const [primaryRec, setPrimaryRec]   = useState(null)
  const [recentEvents, setRecentEvents] = useState(null)
  const [loadingEvt, setLoadingEvt]   = useState(true)
  const [errorEvt, setErrorEvt]       = useState(null)
  const [nightVision, setNightVision] = useState(false)
  const [feedStats] = useState({ fps: 24, wifi: '-62dBm', latency: '12ms', nv: 'OFF' })

  // Fetch recorders
  function fetchRecorders() {
    setLoadingRec(true)
    const token = sessionStorage.getItem('hs_token')
    fetch(`${API}/api/recorders`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => {
        const list = Array.isArray(d) ? d : (d.recorders || [])
        setRecorders(list)
        if (list.length > 0 && !primaryRec) setPrimaryRec(list[0])
        setLoadingRec(false)
      })
      .catch(e => { setErrorRec(String(e)); setLoadingRec(false) })
  }

  // Fetch recent events for primary recorder
  function fetchEvents(recId) {
    setLoadingEvt(true)
    const token = sessionStorage.getItem('hs_token')
    const url = recId
      ? `${API}/api/detections?recorder_id=${recId}&limit=5`
      : `${API}/api/detections?limit=5`
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => {
        const evts = Array.isArray(d) ? d : (d.detections || d.items || [])
        setRecentEvents(evts)
        setLoadingEvt(false)
      })
      .catch(e => { setErrorEvt(String(e)); setLoadingEvt(false) })
  }

  useEffect(() => { fetchRecorders() }, []) // eslint-disable-line
  useEffect(() => { fetchEvents(primaryRec?.id || primaryRec?.recorder_id) }, [primaryRec]) // eslint-disable-line

  const otherRecorders = recorders ? recorders.filter(r =>
    (r.id || r.recorder_id) !== (primaryRec?.id || primaryRec?.recorder_id)
  ) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats strip */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <StatChip label="FPS" value={feedStats.fps} />
        <StatChip label="WiFi" value={feedStats.wifi} />
        <StatChip label="Latency" value={feedStats.latency} />
        <StatChip label="Night Vision" value={nightVision ? 'ON' : 'OFF'} />
      </div>

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        {/* LEFT: Primary Feed */}
        <div className="panel">
          <div className="panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Primary Feed</span>
              <span className="badge badge-green"><div className="live-dot" style={{ width: 5, height: 5 }} />LIVE</span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {primaryRec?.name || primaryRec?.recorder_name || 'REC-01'}
            </span>
          </div>
          <div className="panel-body" style={{ padding: 12 }}>
            {/* Video area */}
            <div style={{ position: 'relative', aspectRatio: '16/9', background: '#000', borderRadius: 6, overflow: 'hidden', marginBottom: 10 }}>
              {primaryRec?.stream_url ? (
                <video
                  src={primaryRec.stream_url}
                  autoPlay muted playsInline
                  style={{
                    width: '100%', height: '100%', objectFit: 'cover',
                    filter: nightVision ? 'brightness(0.3) hue-rotate(120deg)' : 'none',
                    transition: 'filter 0.3s',
                  }}
                />
              ) : (
                <div style={{
                  width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-muted)', fontSize: 13,
                }}>
                  Connecting to {primaryRec?.name || 'REC-01'}…
                </div>
              )}

              {/* Overlay info */}
              <div style={{
                position: 'absolute', bottom: 10, left: 10,
                background: 'rgba(13,17,23,0.85)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '8px 10px', fontSize: 11,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                  <div className="live-dot" />
                  <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>LIVE</span>
                </div>
                <div style={{ color: 'var(--text-secondary)' }}>
                  {primaryRec?.name || 'REC-01'} · {primaryRec?.location || 'Gate A'}
                </div>
                <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                  1080p · 24fps · 2.1Mbps
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                  <SignalBars strength={-62} />
                  <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>-62dBm</span>
                </div>
              </div>

              {/* Night Vision toggle */}
              <button
                style={{
                  position: 'absolute', top: 10, right: 10,
                  background: nightVision ? 'rgba(63,185,80,0.25)' : 'rgba(13,17,23,0.75)',
                  border: `1px solid ${nightVision ? 'var(--accent-green)' : 'var(--border)'}`,
                  borderRadius: 5, padding: '4px 8px', cursor: 'pointer',
                  color: nightVision ? 'var(--accent-green)' : 'var(--text-secondary)',
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
                  transition: 'all 150ms',
                }}
                onClick={() => setNightVision(v => !v)}
              >
                NV
              </button>
            </div>

            {/* Recent events sub-panel */}
            <div className="sub-panel">
              <div className="sub-panel-title">Detections from this feed</div>
              {loadingEvt ? (
                <div>{[1,2,3].map(i => <SkeletonRow key={i} />)}</div>
              ) : errorEvt ? (
                <ErrorState message={errorEvt} onRetry={() => fetchEvents(primaryRec?.id)} />
              ) : !recentEvents || recentEvents.length === 0 ? (
                <div className="empty-state" style={{ padding: '12px 0' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No recent detections</div>
                </div>
              ) : (
                <table className="table">
                  <tbody>
                    {recentEvents.map((evt, i) => (
                      <tr key={evt.id || i}>
                        <td style={{ color: 'var(--text-muted)', fontSize: 11, width: 70 }}>
                          {evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : '—'}
                        </td>
                        <td>
                          <span className={`badge badge-${evt.label?.includes('person') ? 'blue' : 'amber'}`}>
                            {evt.label || evt.class || 'Unknown'}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                          {evt.confidence ? `${Math.round(evt.confidence * 100)}%` : '—'}
                        </td>
                        <td>
                          {!evt.verified && (
                            <span className="badge badge-red">Unverified</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Other Recorder Feeds */}
        <div className="panel">
          <div className="panel-header">
            <span>Other Recorder Feeds</span>
            <span className="badge badge-muted">{otherRecorders.length}</span>
          </div>
          <div className="panel-body-scroll">
            {loadingRec ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[1,2].map(i => <div key={i} className="sub-panel"><div className="skeleton" style={{ height: 80 }} /></div>)}
              </div>
            ) : errorRec ? (
              <ErrorState message={errorRec} onRetry={fetchRecorders} />
            ) : otherRecorders.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📹</div>
                <div className="empty-state-title">No other recorders</div>
                <div className="empty-state-sub">Admin can assign more in GPS Map</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {otherRecorders.map(rec => {
                  const status = rec.status || 'OFFLINE'
                  return (
                    <div key={rec.id || rec.recorder_id} className="sub-panel">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 500 }}>{rec.name || rec.recorder_name}</span>
                        <span className={`badge badge-${status === 'ONLINE' ? 'green' : status === 'IDLE' ? 'amber' : 'muted'}`}>
                          {status}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                        {rec.location || 'Unknown Zone'}
                      </div>
                      {/* Mini preview */}
                      <div style={{
                        height: 60, background: '#000', borderRadius: 4,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, color: 'var(--text-muted)', marginBottom: 6,
                      }}>
                        {status === 'ONLINE' ? 'Live Preview' : 'Offline'}
                      </div>
                      <button
                        className="btn btn-secondary btn-xs btn-full"
                        onClick={() => setPrimaryRec(rec)}
                      >
                        Select as Primary
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM ROW */}
        <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Recorder Status */}
          <div className="panel">
            <div className="panel-header">Assigned Recorders Status</div>
            <div className="panel-body-scroll" style={{ maxHeight: 220 }}>
              {loadingRec ? (
                <div>{[1,2,3].map(i => <SkeletonRow key={i} />)}</div>
              ) : errorRec ? (
                <ErrorState message={errorRec} onRetry={fetchRecorders} />
              ) : !recorders || recorders.length === 0 ? (
                <div className="empty-state" style={{ padding: '16px 0' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No recorders assigned</div>
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th><th>Location</th><th>Battery</th><th>WiFi</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recorders.map(rec => (
                      <tr key={rec.id || rec.recorder_id}>
                        <td style={{ fontWeight: 500 }}>{rec.name || rec.recorder_name}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{rec.location || '—'}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{rec.battery_pct != null ? `${rec.battery_pct}%` : '—'}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{rec.wifi_signal || '—'}</td>
                        <td>
                          <span className={`badge badge-${rec.status === 'ONLINE' ? 'green' : rec.status === 'IDLE' ? 'amber' : 'muted'}`}>
                            {rec.status || 'UNKNOWN'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="panel">
            <div className="panel-header">Quick Actions</div>
            <div className="panel-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button className="btn btn-danger btn-sm">🚨 Alert All Recorders</button>
                <button className="btn btn-secondary btn-sm">📡 Send Broadcast</button>
                <button className="btn btn-success btn-sm">⏺ Start Recording All</button>
                <button className="btn btn-secondary btn-sm">⬇ Export Last Hour</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
