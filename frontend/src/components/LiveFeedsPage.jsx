import { useState, useEffect, useRef } from 'react'
import { VideoOff, Bell, Radio, Video, Download } from 'lucide-react'
import WiFiSignalBars from './WiFiSignalBars'
import BatteryIndicator from './BatteryIndicator'

/* ── helpers ── */
function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000)   return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return `${Math.floor(diff / 3600000)}h ago`
}

const wifiColor = (dbm) => dbm > -60 ? '#3fb950' : dbm > -70 ? '#d29922' : '#f85149'
const batColor  = (pct)  => pct  > 50  ? '#3fb950' : pct  > 20  ? '#d29922' : '#f85149'

function SkeletonRecorderCard() {
  return (
    <div style={{ padding: 10, borderRadius: 6, border: '1px solid var(--border)', marginBottom: 8, background: 'var(--bg-elevated)' }}>
      <div className="skeleton" style={{ height: 13, width: '55%', marginBottom: 6 }} />
      <div className="skeleton" style={{ height: 10, width: '40%', marginBottom: 5 }} />
      <div className="skeleton" style={{ height: 10, width: '70%' }} />
    </div>
  )
}

/* ── broadcast state lives outside so it doesn't reset on re-render ── */
let broadcastText = ''

export default function LiveFeedsPage() {
  const [recorders, setRecorders]     = useState([])
  const [selectedId, setSelectedId]   = useState(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [streamError, setStreamError] = useState(false)
  const [nightVision, setNightVision] = useState(false)
  const [detections, setDetections]   = useState([])
  const [detLoading, setDetLoading]   = useState(false)
  const [liveBoxes, setLiveBoxes]     = useState([])
  const [showBroadcast, setShowBroadcast] = useState(false)
  const [broadcastMsg, setBroadcastMsg]   = useState('')
  const wsRecRef = useRef(null)
  const wsDetRef = useRef(null)
  const boxTimerRef = useRef(null)

  const selected = recorders.find(r => r.id === selectedId) || null

  /* ── fetch recorders ── */
  function fetchRecorders() {
    setLoading(true)
    fetch('/api/recorders', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => {
        const list = Array.isArray(d) ? d : (d.recorders || [])
        setRecorders(list)
        // auto-select first online
        const first = list.find(r => r.status === 'online') || list[0]
        if (first) { setSelectedId(first.id); setNightVision(!!first.night_vision) }
        setLoading(false)
      })
      .catch(e => { setError(String(e)); setLoading(false) })
  }

  /* ── fetch detections for selected recorder ── */
  function fetchDetections(recId) {
    if (!recId) return
    setDetLoading(true)
    fetch(`/api/detections?recorder_id=${recId}&limit=5`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => {
        const list = Array.isArray(d) ? d : (d.detections || d.items || [])
        setDetections(list)
        setDetLoading(false)
      })
      .catch(() => setDetLoading(false))
  }

  /* ── WebSocket: recorder status updates ── */
  function connectRecorderWS() {
    try {
      wsRecRef.current = new WebSocket('/ws/recorders')
      wsRecRef.current.onmessage = ev => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'recorder_update') {
            setRecorders(prev => prev.map(r => r.id === msg.id ? { ...r, ...msg } : r))
          }
        } catch {}
      }
      wsRecRef.current.onerror = wsRecRef.current.onclose = () => {
        setTimeout(connectRecorderWS, 3000)
      }
    } catch {}
  }

  /* ── WebSocket: live detection boxes ── */
  function connectDetWS() {
    try {
      wsDetRef.current = new WebSocket('/ws/detections')
      wsDetRef.current.onmessage = ev => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.recorder_id === selectedId || !msg.recorder_id) {
            setDetections(prev => [msg, ...prev].slice(0, 5))
            if (msg.boxes) {
              setLiveBoxes(msg.boxes)
              clearTimeout(boxTimerRef.current)
              boxTimerRef.current = setTimeout(() => setLiveBoxes([]), 3000)
            }
          }
        } catch {}
      }
      wsDetRef.current.onerror = wsDetRef.current.onclose = () => {
        setTimeout(connectDetWS, 3000)
      }
    } catch {}
  }

  useEffect(() => {
    fetchRecorders()
    connectRecorderWS()
    connectDetWS()
    return () => {
      try { wsRecRef.current?.close() } catch {}
      try { wsDetRef.current?.close() } catch {}
      clearTimeout(boxTimerRef.current)
    }
  }, []) // eslint-disable-line

  useEffect(() => { fetchDetections(selectedId) }, [selectedId]) // eslint-disable-line

  /* ── night vision toggle ── */
  async function toggleNightVision() {
    const newVal = !nightVision
    setNightVision(newVal)
    try {
      await fetch(`/api/recorders/${selectedId}/night_vision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: newVal }),
      })
    } catch {
      setNightVision(!newVal)
    }
  }

  /* ── select recorder ── */
  function selectRecorder(id) {
    const rec = recorders.find(r => r.id === id)
    setSelectedId(id)
    setStreamError(false)
    setNightVision(!!rec?.night_vision)
  }

  /* ── quick actions ── */
  async function alertAll() {
    try {
      await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type: 'broadcast' }),
      })
    } catch {}
  }

  async function recordAll() {
    try {
      await fetch('/api/recording/start_all', { method: 'POST', credentials: 'include' })
    } catch {}
  }

  const wifiDbm = selected?.wifi_strength
  const batPct  = selected?.battery

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── STATS STRIP ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div className="stat-chip">
          <div className={`status-dot ${selected?.status === 'online' ? 'online' : 'offline'}`} />
          <span className="value">{selected?.status === 'online' ? 'LIVE' : 'OFFLINE'}</span>
        </div>
        <div className="stat-chip">
          <span style={{ color: 'var(--text-muted)' }}>FPS</span>
          <span className="value">{selected?.fps ?? '--'}</span>
        </div>
        <div className="stat-chip">
          <span style={{ color: 'var(--text-muted)' }}>WiFi</span>
          <span className="value" style={{ color: wifiDbm ? wifiColor(wifiDbm) : undefined }}>
            {wifiDbm ?? '--'} dBm
          </span>
        </div>
        <div className="stat-chip">
          <span style={{ color: 'var(--text-muted)' }}>Battery</span>
          <span className="value" style={{ color: batPct != null ? batColor(batPct) : undefined }}>
            {batPct ?? '--'}%
          </span>
        </div>
        <div className="stat-chip">
          <span style={{ color: 'var(--text-muted)' }}>Res</span>
          <span className="value">{selected?.resolution ?? '--'}</span>
        </div>
        <div
          className="stat-chip"
          style={{ cursor: 'pointer', borderColor: nightVision ? 'var(--accent-green)' : undefined }}
          onClick={selectedId ? toggleNightVision : undefined}
        >
          <span style={{ color: 'var(--text-muted)' }}>Night Vision</span>
          <span className="value" style={{ color: nightVision ? 'var(--accent-green)' : undefined }}>
            {nightVision ? 'ON' : 'OFF'}
          </span>
        </div>
      </div>

      {/* ── MAIN ROW ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>

        {/* LEFT: Primary Feed */}
        <div className="panel">
          <div className="panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {selected?.status === 'online' && <div className="live-dot" />}
              <span style={{ fontWeight: 600 }}>{selected?.real_name || selected?.name || 'No Recorder'}</span>
              <span className={`badge badge-${selected?.status === 'online' ? 'green' : 'muted'}`}>
                {selected?.status?.toUpperCase() || 'NONE'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {selectedId && (
                <button
                  style={{
                    background: nightVision ? 'rgba(63,185,80,0.15)' : 'var(--bg-elevated)',
                    border: `1px solid ${nightVision ? 'var(--accent-green)' : 'var(--border)'}`,
                    borderRadius: 5, padding: '3px 8px', cursor: 'pointer',
                    color: nightVision ? 'var(--accent-green)' : 'var(--text-muted)',
                    fontSize: 11, fontWeight: 700, transition: 'all 150ms',
                  }}
                  onClick={toggleNightVision}
                >
                  NV
                </button>
              )}
            </div>
          </div>

          <div style={{ padding: 0 }}>
            {/* Video container */}
            <div className="video-container" style={{ aspectRatio: '16/9' }}>
              {selected?.status === 'online' && !streamError ? (
                <img
                  src={`/api/stream/${selectedId}`}
                  alt="primary stream"
                  style={{
                    width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                    filter: nightVision
                      ? 'brightness(0.35) hue-rotate(115deg) saturate(3) contrast(1.2)'
                      : 'none',
                    transition: 'filter 0.4s ease',
                  }}
                  onError={() => setStreamError(true)}
                />
              ) : (
                <div className="video-offline">
                  <VideoOff size={32} color="var(--text-muted)" />
                  <span>Stream unavailable</span>
                  <span style={{ fontSize: 11 }}>
                    {selected?.status === 'offline'
                      ? 'Recorder is offline'
                      : 'No recorder selected'}
                  </span>
                </div>
              )}

              {/* Overlay */}
              <div className="video-overlay">
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: 'white', fontSize: 12, opacity: 0.9 }}>{selected?.location}</span>
                  <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>{selected?.username}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <WiFiSignalBars dbm={selected?.wifi_strength} size={14} />
                  <span style={{ color: 'white', fontSize: 11, fontFamily: 'monospace' }}>
                    {selected?.fps} fps
                  </span>
                </div>
              </div>

              {/* Detection boxes */}
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                {liveBoxes.map((box, i) => {
                  const borderColor = box.label === 'person' ? '#388bfd'
                    : box.label === 'vehicle' ? '#d29922' : '#f85149'
                  return (
                    <div key={i} style={{
                      position: 'absolute',
                      left:   `${box.x * 100}%`,
                      top:    `${box.y * 100}%`,
                      width:  `${box.w * 100}%`,
                      height: `${box.h * 100}%`,
                      border: `2px solid ${borderColor}`,
                      borderRadius: 3,
                      boxSizing: 'border-box',
                    }}>
                      <span style={{
                        position: 'absolute', top: -18, left: 0,
                        background: borderColor,
                        color: 'white', fontSize: 9, fontWeight: 700,
                        padding: '1px 4px', borderRadius: 2, whiteSpace: 'nowrap',
                      }}>
                        {box.label} {Math.round((box.confidence || 0) * 100)}%
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Recent detections */}
            <div className="sub-panel" style={{ margin: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span className="sub-panel-title" style={{ margin: 0 }}>Recent Detections</span>
                <span className="badge badge-muted">{detections.length}</span>
              </div>

              {detLoading ? (
                [1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 28, marginBottom: 4 }} />)
              ) : detections.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '8px 0' }}>
                  No detections yet
                </div>
              ) : (
                detections.map((det, i) => {
                  const dotColor = det.label === 'person' ? '#388bfd'
                    : det.label?.includes('vehicle') ? '#d29922' : '#f85149'
                  return (
                    <div key={det.id || i} style={{
                      display: 'flex', gap: 8, alignItems: 'center',
                      padding: '6px 0', borderBottom: '1px solid var(--border)',
                    }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                      <span style={{ fontSize: 12 }}>{det.label || det.class || '—'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {det.confidence ? `${Math.round(det.confidence * 100)}%` : ''}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                        {det.timestamp ? timeAgo(det.timestamp) : ''}
                      </span>
                      <button style={{
                        fontSize: 10, padding: '2px 6px', borderRadius: 4,
                        border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                        color: 'var(--text-muted)', cursor: 'pointer',
                      }}>
                        Verify
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Recorder Selection */}
        <div className="panel">
          <div className="panel-header">
            <span>Assigned Recorders</span>
            <span className="badge badge-muted">{recorders.length}</span>
          </div>
          <div className="panel-body-scroll">
            {loading ? (
              [1, 2, 3].map(i => <SkeletonRecorderCard key={i} />)
            ) : error ? (
              <div className="error-state">
                <div style={{ fontSize: 13, color: 'var(--accent-red)', fontWeight: 600 }}>Failed to load</div>
                <button className="btn btn-secondary btn-sm" onClick={fetchRecorders}>↺ Retry</button>
              </div>
            ) : recorders.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📹</div>
                <div className="empty-state-title">No recorders assigned</div>
              </div>
            ) : (
              recorders.map(rec => (
                <div
                  key={rec.id}
                  className={`recorder-card${selectedId === rec.id ? ' selected' : ''}`}
                  onClick={() => selectRecorder(rec.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <strong style={{ fontSize: 12 }}>{rec.real_name || rec.name}</strong>
                    <span className={`badge badge-${rec.status === 'online' ? 'green' : 'muted'}`}>
                      {rec.status?.toUpperCase() || 'OFFLINE'}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{rec.location}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                    <span style={{ color: 'var(--text-muted)' }}>FPS:</span>
                    <span>{rec.fps || '--'}</span>
                    <WiFiSignalBars dbm={rec.wifi_strength} size={14} />
                    <BatteryIndicator percent={rec.battery} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── BOTTOM ROW ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* All Feeds grid */}
        <div className="panel">
          <div className="panel-header">
            <span>All Feeds</span>
            <span className="badge badge-muted">{recorders.length}</span>
          </div>
          <div className="panel-body">
            {recorders.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>No feeds</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                {recorders.map(rec => (
                  <div
                    key={rec.id}
                    style={{
                      border: `1px solid ${selectedId === rec.id ? 'var(--accent-blue)' : 'var(--border)'}`,
                      borderRadius: 6, overflow: 'hidden', cursor: 'pointer',
                      transition: 'border-color 150ms',
                    }}
                    onClick={() => { selectRecorder(rec.id) }}
                  >
                    <div style={{ aspectRatio: '16/9', maxHeight: 90, overflow: 'hidden', background: '#000', position: 'relative' }}>
                      {rec.status === 'online' ? (
                        <img
                          src={`/api/stream/${rec.id}`}
                          alt={rec.real_name || rec.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={e => { e.target.style.display = 'none' }}
                        />
                      ) : (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <VideoOff size={16} color="var(--text-muted)" />
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '5px 8px', background: 'var(--bg-elevated)' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {rec.real_name || rec.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
                        <div className={`status-dot ${rec.status === 'online' ? 'online' : 'offline'}`} style={{ width: 5, height: 5 }} />
                        {rec.location}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="panel">
          <div className="panel-header">Quick Actions</div>
          <div className="panel-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button className="action-btn" onClick={alertAll}>
                <Bell size={18} />
                Alert All
              </button>
              <button className="action-btn" onClick={() => setShowBroadcast(v => !v)}>
                <Radio size={18} />
                Broadcast
              </button>
              <button className="action-btn" onClick={recordAll}>
                <Video size={18} />
                Record All
              </button>
              <button className="action-btn" onClick={() => { window.location = '/api/detections/export' }}>
                <Download size={18} />
                Export Events
              </button>
            </div>

            {showBroadcast && (
              <div style={{ marginTop: 12 }}>
                <textarea
                  style={{
                    width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)',
                    borderRadius: 6, padding: '8px 10px', color: 'var(--text-primary)',
                    fontSize: 12, resize: 'vertical', minHeight: 60, boxSizing: 'border-box',
                  }}
                  placeholder="Type broadcast message…"
                  value={broadcastMsg}
                  onChange={e => setBroadcastMsg(e.target.value)}
                />
                <button
                  className="btn btn-primary btn-sm btn-full"
                  style={{ marginTop: 6 }}
                  onClick={async () => {
                    try {
                      await fetch('/api/comms/messages', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ content: broadcastMsg, broadcast: true }),
                      })
                    } catch {}
                    setBroadcastMsg('')
                    setShowBroadcast(false)
                  }}
                >
                  Send Broadcast
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
