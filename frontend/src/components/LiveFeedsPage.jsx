import { useState, useEffect, useRef } from 'react'
import { authFetch, authWS, getToken, API } from '../utils/api'
import { AlertOctagon, Hand, Maximize2, Bell, Radio, Video, Download, Camera, X, Menu, Grid, Monitor } from 'lucide-react'

// ── Event Modal: clip + OCR + distance ───────────────────────────────────────
function EventModal({ event, onClose }) {
  const [ocr, setOcr] = useState(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const clipSrc = event?.id
    ? `http://localhost:8000/api/recordings/clip/${event.id}?token=${getToken()}`
    : null

  const runOcr = async () => {
    if (!event?.screenshot_path) return
    setOcrLoading(true)
    try {
      const r = await authFetch('/api/ocr/extract', {
        method: 'POST',
        body: JSON.stringify({ image_path: event.screenshot_path })
      })
      if (r?.ok) setOcr(await r.json())
    } catch {}
    setOcrLoading(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.75)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24
    }}>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 12, width: '100%', maxWidth: 820, overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <span style={{ fontWeight: 700 }}>{event?.display_label || event?.detected_class || event?.label || 'Detection'}</span>
            <span className="badge badge-blue" style={{ marginLeft: 10 }}>{Math.round((event?.confidence || 0) * 100)}% conf</span>
            {event?.camera_id && <span className="badge badge-muted" style={{ marginLeft: 6 }}>{event.camera_id}</span>}
            {event?.distance_m != null && (
              <span className="badge" style={{ marginLeft: 6, background: 'rgba(57,255,20,0.15)', color: '#39ff14', border: '1px solid rgba(57,255,20,0.3)' }}>
                ~{event.distance_m}m
              </span>
            )}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 0 }}>
          <div style={{ padding: 20 }}>
            {clipSrc ? (
              <video key={event.id} src={clipSrc} controls autoPlay loop style={{ width: '100%', borderRadius: 8, background: '#000' }} />
            ) : (
              <div style={{ aspectRatio: '16/9', background: '#0d1117', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                No clip available
              </div>
            )}
            {event?.timestamp && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                {new Date(event.timestamp).toLocaleString()}
              </div>
            )}
            {/* Distance & speed details */}
            {(event?.distance_m != null || event?.speed_ms != null) && (
              <div style={{ marginTop: 10, display: 'flex', gap: 12, fontSize: 12 }}>
                {event.distance_m != null && (
                  <div style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(57,255,20,0.1)', border: '1px solid rgba(57,255,20,0.25)', color: '#39ff14', fontWeight: 600 }}>
                    📏 Distance: {event.distance_m}m
                  </div>
                )}
                {event.speed_ms != null && (
                  <div style={{ padding: '4px 10px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                    ⚡ Speed: {event.speed_ms} m/s
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ borderLeft: '1px solid var(--border)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>OCR — Plate / Badge</div>
            {!ocr ? (
              <button className="btn btn-secondary" onClick={runOcr} disabled={ocrLoading || !event?.screenshot_path}>
                {ocrLoading ? 'Running…' : '🔍 Extract Text'}
              </button>
            ) : (
              <>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: '#39ff14', letterSpacing: 2 }}>
                  {ocr.text || '—'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(ocr.results || []).map((r, i) => (
                    <div key={i} style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: 'var(--bg-elevated)', borderRadius: 6 }}>
                      <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{r.text}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{Math.round((r.confidence || 0) * 100)}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {!event?.screenshot_path && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No screenshot saved.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LiveFeedsPage() {
  const [streamKey, setStreamKey] = useState(0)
  const [recorders, setRecorders] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [streamError, setStreamError] = useState(false)
  const [detections, setDetections] = useState([])
  const [liveBoxes, setLiveBoxes] = useState([])

  const [monitorEvents, setMonitorEvents] = useState([])
  const [cameraFilter, setCameraFilter] = useState('all')
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [sidePanelOpen, setSidePanelOpen] = useState(true)
  const [recordersExpanded, setRecordersExpanded] = useState(false)

  // View mode: 'single' or 'grid'
  const [viewMode, setViewMode] = useState('single')
  const [cameras, setCameras] = useState([])

  const wsRef = useRef(null)
  const wsMonitorRef = useRef(null)
  const boxTimerRef = useRef(null)

  useEffect(() => {
    const interval = setInterval(() => {
      setStreamKey(prev => prev + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // ── Data fetch ──────────────────────────────────────────────────────────────
  useEffect(() => {
    authFetch('/api/users?role=recorder')
      .then(r => r?.json())
      .then(data => {
        const list = Array.isArray(data) ? data : []
        setRecorders(list)
        const firstOnline = list.find(r => r.status === 'online')
        const first = firstOnline || list[0]
        if (first && !selectedId) setSelectedId(first.username || first.id)
        setLoading(false)
      })
      .catch(() => setLoading(false))

    authFetch('/api/detections?limit=5')
      .then(r => r?.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : (data?.items || data?.detections || [])
        setDetections(arr.slice(0, 5))
      }).catch(() => {})

    authFetch('/api/detections?limit=30')
      .then(r => r?.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : (data?.items || data?.detections || [])
        setMonitorEvents(arr.slice(0, 30))
      }).catch(() => {})

    // Fetch cameras for grid view
    authFetch('/api/feeds')
      .then(r => r?.json())
      .then(data => {
        if (Array.isArray(data)) setCameras(data)
        else if (data?.cameras) setCameras(data.cameras)
      }).catch(() => {})
  }, []) // eslint-disable-line

  // ── Detection WebSocket ─────────────────────────────────────────────────────
  useEffect(() => {
    const ws = authWS('/ws/detections')
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        console.log('[WS/detections] message:', msg)  // debug
        if (msg.type === 'detection' && msg.data) {
          setDetections(prev => [msg.data, ...prev].slice(0, 5))
          if (msg.data.boxes && msg.data.boxes.length > 0) {
            setLiveBoxes(msg.data.boxes)
            clearTimeout(boxTimerRef.current)
            boxTimerRef.current = setTimeout(() => setLiveBoxes([]), 4000)
          }
        }
      } catch (err) {
        console.warn('[WS/detections] parse error', err)
      }
    }
    ws.onerror = (err) => console.warn('[WS/detections] error', err)
    wsRef.current = ws
    return () => {
      ws.close()
      clearTimeout(boxTimerRef.current)
    }
  }, [])

  // ── Monitor WebSocket ────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const wsMonitor = authWS('/ws/monitor')
      wsMonitor.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          console.log('[WS/monitor] message:', msg)  // debug
          if (msg.type === 'new_detection') {
            setMonitorEvents(prev => [msg, ...prev].slice(0, 50))
          } else if (msg.type === 'detection' && msg.data) {
            setMonitorEvents(prev => [msg.data, ...prev].slice(0, 50))
          }
        } catch {}
      }
      wsMonitor.onerror = (err) => console.warn('[WS/monitor] error', err)
      wsMonitorRef.current = wsMonitor
      return () => wsMonitor.close()
    } catch {}
  }, [])

  const selectedRecorder = recorders.find(r => (r.username || r.id) === selectedId) || null
  const isOnline = selectedRecorder?.status === 'online'
  const onlineRecorders = recorders.filter(r => r.status === 'online')
  const visibleRecorders = recordersExpanded ? onlineRecorders : onlineRecorders.slice(0, 4)

  const broadcastBroadcast = () => {
    const msg = window.prompt("Enter broadcast message:")
    if (msg) {
      authFetch('/api/alerts', { method: 'POST', body: JSON.stringify({ type: 'broadcast', message: msg }) }).catch(() => {})
    }
  }

  const sendAlert = (type) => {
    authFetch('/api/comms/alert', { method: 'POST', body: JSON.stringify({ type }) }).catch(() => {})
  }

  const labelColor = (label) => {
    const l = (label || '').toLowerCase()
    if (l === 'person') return '#388bfd'
    if (l === 'vehicle') return '#d29922'
    return '#f85149'
  }

  const uniqueCameras = ['all', ...Array.from(new Set((monitorEvents || []).map(e => e.camera_id).filter(Boolean)))]
  const filteredEvents = cameraFilter === 'all' ? monitorEvents : monitorEvents.filter(e => e.camera_id === cameraFilter)

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, height: '100%', overflow: 'hidden' }}>

      {/* ═══════════════ LEFT COLUMN ═══════════════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, overflow: 'hidden' }}>

        {/* STATS STRIP */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton" style={{ width: 90, height: 26, borderRadius: 13 }} />)
          ) : (
            <>
              <div className="stat-chip" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-elevated)', padding: '4px 10px', borderRadius: '14px', fontSize: '11px', border: '1px solid var(--border)' }}>
                <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
                <span style={{ fontWeight: 600, color: isOnline ? 'var(--accent-green)' : 'var(--text-muted)' }}>{isOnline ? 'LIVE' : 'OFFLINE'}</span>
              </div>
              <div className="stat-chip" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-elevated)', padding: '4px 10px', borderRadius: '14px', fontSize: '11px', border: '1px solid var(--border)' }}>
                FPS: {selectedRecorder?.fps || '--'}
              </div>
              <div className="stat-chip" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-elevated)', padding: '4px 10px', borderRadius: '14px', fontSize: '11px', border: '1px solid var(--border)' }}>
                WiFi: {selectedRecorder?.wifi_strength || '--'} dBm
              </div>
              <div className="stat-chip" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-elevated)', padding: '4px 10px', borderRadius: '14px', fontSize: '11px', border: '1px solid var(--border)' }}>
                Battery: {selectedRecorder?.battery || '--'}%
              </div>
              {!sidePanelOpen && (
                <div
                  className="stat-chip"
                  onClick={() => setSidePanelOpen(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(56,139,253,0.1)', color: 'var(--accent-blue)', padding: '4px 10px', borderRadius: '14px', fontSize: '11px', border: '1px solid rgba(56,139,253,0.3)', cursor: 'pointer', fontWeight: 600 }}
                >
                  <Bell size={12} /> Events
                </div>
              )}
            </>
          )}
        </div>

        {/* MAIN VIDEO PANEL */}
        <div className="panel" style={{ flexShrink: 0, height: '60%', display: 'flex', flexDirection: 'column' }}>
          <div className="panel-header" style={{ flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`status-dot ${isOnline ? 'online' : 'error'}`} />
              {viewMode === 'grid' ? 'Multi-Camera Grid' : (selectedRecorder?.display_name || selectedId || 'No recorder')}
              {viewMode === 'single' && (
                <span className={`badge ${isOnline ? 'badge-green' : 'badge-red'}`} style={{ marginLeft: '8px' }}>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Grid / Single toggle */}
              <button
                className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '4px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                onClick={() => setViewMode(viewMode === 'single' ? 'grid' : 'single')}
                title={viewMode === 'single' ? 'Switch to grid view' : 'Switch to single view'}
              >
                {viewMode === 'single' ? <Grid size={13} /> : <Monitor size={13} />}
                <span>{viewMode === 'single' ? 'Grid' : 'Single'}</span>
              </button>
              <button className="btn btn-sm btn-ghost" style={{ padding: '4px' }}><Maximize2 size={14} /></button>
            </div>
          </div>

          <div className="panel-body" style={{ flex: 1, padding: 0, position: 'relative', overflow: 'hidden' }}>
            {viewMode === 'single' ? (
              /* ─── SINGLE VIDEO ─── */
              <div className="video-container" style={{ aspectRatio: '16/9', position: 'relative', background: 'black', overflow: 'hidden' }}>
                {isOnline && !streamError ? (
                  <img
                    key={streamKey}
                    src={`http://localhost:8000/stream/CAM-01?token=${getToken()}`}
                    style={{
                      width: '100%', height: '100%', objectFit: 'contain', display: 'block',
                      transition: 'filter 0.4s ease'
                    }}
                    onError={() => {
                      console.warn("Stream image error, retrying...");
                      setStreamKey(prev => prev + 1);
                    }}
                  />
                ) : (
                  <div className="video-offline" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                    <Camera size={32} style={{ opacity: 0.5, marginBottom: '8px' }} />
                    <span>{streamError ? 'Stream error' : 'Stream unavailable'}</span>
                    <button className="btn btn-secondary btn-sm" style={{ marginTop: '12px' }} onClick={() => setStreamError(false)}>Retry</button>
                  </div>
                )}

                {/* BOUNDING BOXES */}
                {liveBoxes.map((box, i) => {
                  const color = box.label === 'person' ? '#388bfd' : box.label === 'vehicle' ? '#d29922' : '#f85149'
                  return (
                    <div key={i} style={{
                      position: 'absolute',
                      left: box.x * 100 + '%',
                      top: box.y * 100 + '%',
                      width: box.w * 100 + '%',
                      height: box.h * 100 + '%',
                      border: `2px solid ${color}`,
                      borderRadius: '3px', boxSizing: 'border-box',
                      pointerEvents: 'none'
                    }}>
                      <span style={{
                        position: 'absolute', top: '-18px', left: '-2px',
                        background: color, color: 'white', fontSize: '9px', fontWeight: 700,
                        padding: '1px 4px', borderRadius: '2px', whiteSpace: 'nowrap'
                      }}>
                        {box.label} {Math.round((box.confidence || 0) * 100)}%
                      </span>
                    </div>
                  )
                })}

                {/* OVERLAY */}
                <div className="video-overlay" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ color: 'white', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600 }}>{selectedRecorder?.location || 'Unknown Location'}</div>
                  </div>
                </div>
              </div>
            ) : (
              /* ─── GRID VIEW (2×2) ─── */
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 2,
                background: '#000',
                aspectRatio: '16/9',
              }}>
                {(cameras.length > 0 ? cameras.slice(0, 4) : [{ camera_id: 'CAM-01' }]).map((cam, idx) => {
                  const camId = cam.camera_id || cam.id || `CAM-0${idx + 1}`
                  return (
                    <div key={camId} style={{ position: 'relative', background: '#0d1117', overflow: 'hidden' }}>
                      <img
                        key={streamKey}
                        src={`${API}/stream/${camId}?token=${getToken()}`}
                        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                        onError={() => {
                          console.warn("Stream image error, retrying...");
                          setStreamKey(prev => prev + 1);
                        }}
                      />
                      <div style={{ position: 'absolute', bottom: 4, left: 6, fontSize: 9, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.9)', background: 'rgba(0,0,0,0.5)', padding: '1px 5px', borderRadius: 3 }}>
                        {camId}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Recent inline detections bottom strip */}
            {viewMode === 'single' && (
              <div className="sub-panel" style={{ margin: '12px' }}>
                <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: 4 }}>
                  {detections.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>No inline detections...</div>
                  ) : (
                    detections.map((d, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: 'var(--bg-elevated)', borderRadius: 16, border: '1px solid var(--border)', flexShrink: 0 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: labelColor(d.label) }} />
                        <span style={{ fontSize: '11px', fontWeight: 500, textTransform: 'capitalize' }}>{d.label}</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{Math.round((d.confidence || 0) * 100)}%</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM ROW: QUICK ACTIONS (Optional) & RECORDERS LIST */}
        <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
          {/* QUICK ACTIONS */}
          <div className="panel" style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column' }}>
            <div className="panel-header" style={{ fontSize: 12, fontWeight: 600, padding: '10px 14px', flexShrink: 0 }}>Quick Actions</div>
            <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(100px, 1fr))', gap: '8px', padding: '12px 14px', overflowY: 'auto' }}>
              <button className="btn btn-secondary" style={{ display: 'flex', flexDirection: 'column', gap: 6, height: 70 }} onClick={() => sendAlert('sos')}>
                <AlertOctagon size={18} color="var(--accent-red)" />
                <span style={{ fontSize: 11 }}>Send SOS</span>
              </button>
              <button className="btn btn-secondary" style={{ display: 'flex', flexDirection: 'column', gap: 6, height: 70 }} onClick={() => sendAlert('suspicious')}>
                <Hand size={18} color="#d29922" />
                <span style={{ fontSize: 11 }}>Suspicious</span>
              </button>
              <button className="btn btn-secondary" style={{ display: 'flex', flexDirection: 'column', gap: 6, height: 70 }} onClick={() => authFetch('/api/recording/start_all', { method: 'POST' })}>
                <Video size={18} color="var(--accent-green)" />
                <span style={{ fontSize: 11 }}>Emergency Record</span>
              </button>
              <button className="btn btn-secondary" style={{ display: 'flex', flexDirection: 'column', gap: 6, height: 70 }} onClick={broadcastBroadcast}>
                <Radio size={18} color="var(--accent-blue)" />
                <span style={{ fontSize: 11 }}>Broadcast</span>
              </button>
              <button className="btn btn-secondary" style={{ display: 'flex', flexDirection: 'column', gap: 6, height: 70, gridColumn: 'span 2' }} onClick={() => window.location.href = `${API}/api/detections/export?token=${getToken()}`}>
                <Download size={18} color="var(--text-muted)" />
                <span style={{ fontSize: 11 }}>Export log</span>
              </button>
            </div>
          </div>

          {/* RECORDERS LIST (online only, collapsible) */}
          {onlineRecorders.length > 0 && (
            <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div className="panel-header" style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Menu size={13} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Online Recorders</span>
                  <span className="badge badge-green">{onlineRecorders.length}</span>
                </div>
              </div>
              <div className="panel-body" style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
                {loading ? (
                  Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 52, borderRadius: 8, flexShrink: 0 }} />)
                ) : (
                  <>
                    {visibleRecorders.map(rec => {
                      const id = rec.username || rec.id
                      return (
                        <div
                          key={id}
                          onClick={() => { setSelectedId(id); setStreamError(false) }}
                          style={{
                            padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', flexShrink: 0,
                            border: `1px solid ${selectedId === id ? 'var(--accent-blue)' : 'var(--border)'}`,
                            background: selectedId === id ? 'rgba(56,139,253,0.06)' : 'var(--bg-elevated)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: selectedId === id ? 'var(--accent-blue)' : 'var(--text-primary)' }}>
                              {rec.display_name || id}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>{rec.location || 'Unknown'}</div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, fontSize: '10px', color: 'var(--text-secondary)' }}>
                            <span>🔋 {rec.battery || '--'}%</span>
                            <span>📶 {rec.wifi_strength || '--'}</span>
                          </div>
                        </div>
                      )
                    })}
                    {onlineRecorders.length > 4 && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ alignSelf: 'center', fontSize: 11, marginTop: 2, flexShrink: 0 }}
                        onClick={() => setRecordersExpanded(e => !e)}
                      >
                        {recordersExpanded ? '▲ Show Less' : `▼ View More (${onlineRecorders.length - 4} more)`}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════ RIGHT COLUMN ═══════════════ */}
      {sidePanelOpen && (
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <div className="panel-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8, padding: '12px 14px', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Live Events</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="badge badge-blue">{filteredEvents.length}</span>
                <button className="btn btn-ghost btn-sm" style={{ padding: 4 }} onClick={() => setSidePanelOpen(false)}>
                  <X size={14} />
                </button>
              </div>
            </div>
            {/* Camera filter */}
            <select
              className="input-field"
              value={cameraFilter}
              onChange={e => setCameraFilter(e.target.value)}
              style={{ fontSize: 11, height: 28, padding: '0 8px', width: '100%' }}
            >
              {uniqueCameras.map(cam => (
                <option key={cam} value={cam}>{cam === 'all' ? 'All Cameras' : cam}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {filteredEvents.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                No events yet...
              </div>
            ) : (
              filteredEvents.map((ev, i) => {
                const color = labelColor(ev.label || ev.detected_class)
                return (
                  <div
                    key={ev.id || i}
                    onClick={() => setSelectedEvent(ev)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
                      borderBottom: '1px solid var(--border)', cursor: 'pointer',
                      transition: 'background 0.1s ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, marginTop: 4, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>
                        {ev.display_label || ev.label || ev.detected_class || 'Unknown'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 8, marginTop: 2 }}>
                        <span>{Math.round((ev.confidence || 0) * 100)}%</span>
                        {ev.camera_id && <span>{ev.camera_id}</span>}
                        {ev.distance_m != null && <span style={{ color: '#39ff14' }}>~{ev.distance_m}m</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>
                      {ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'now'}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* EVENT MODAL */}
      {selectedEvent && <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
    </div>
  )
}
