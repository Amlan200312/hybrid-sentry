import { useState, useEffect, useRef } from 'react'
import { authFetch, authWS, getToken, API } from '../utils/api'
import { X, RefreshCw, Moon, Sun } from 'lucide-react'

// ── Event Modal ───────────────────────────────────────────────────────────────
function EventModal({ event, onClose }) {
  const [ocr, setOcr] = useState(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const clipSrc = event?.id
    ? `${API}/api/recordings/clip/${event.id}?token=${getToken()}`
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
      background: 'rgba(0,0,0,0.82)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 12, width: '100%', maxWidth: 820, overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700 }}>{event?.display_label || event?.detected_class || event?.label || 'Detection'}</span>
            <span className="badge badge-blue">{Math.round((event?.confidence || 0) * 100)}% conf</span>
            {event?.camera_id && <span className="badge badge-muted">{event.camera_id}</span>}
            {event?.distance_m != null && (
              <span className="badge" style={{ background: 'rgba(57,255,20,0.15)', color: '#39ff14', border: '1px solid rgba(57,255,20,0.3)' }}>
                ~{event.distance_m}m
              </span>
            )}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 0 }}>
          <div style={{ padding: 20 }}>
            {clipSrc ? (
              <video key={event.id} src={clipSrc} controls autoPlay loop style={{ width: '100%', borderRadius: 8, background: '#000' }} />
            ) : (
              <div style={{ aspectRatio: '16/9', background: '#0d1117', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                No clip available
              </div>
            )}
            {event?.timestamp && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>{new Date(event.timestamp).toLocaleString()}</div>}
            <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
              {event?.distance_m != null && (
                <span style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(57,255,20,0.1)', border: '1px solid rgba(57,255,20,0.25)', color: '#39ff14', fontWeight: 600 }}>
                  📏 {event.distance_m}m
                </span>
              )}
              {event?.speed_ms != null && (
                <span style={{ padding: '4px 10px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                  ⚡ {event.speed_ms} m/s
                </span>
              )}
            </div>
            {/* ROI Analysis stub */}
            <div style={{ marginTop: 12 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => window.alert('ROI Analysis coming soon — full implementation in next release.')}
                style={{ fontSize: 12 }}
              >
                🔍 Analyze ROI
              </button>
            </div>
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
                {(ocr.results || []).map((r, i) => (
                  <div key={i} style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: 'var(--bg-elevated)', borderRadius: 6 }}>
                    <span style={{ fontFamily: 'monospace' }}>{r.text}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{Math.round((r.confidence || 0) * 100)}%</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Label colour coding ───────────────────────────────────────────────────────
function labelColor(label = '') {
  const l = label.toLowerCase()
  if (l.includes('person') || l === 'person') return '#388bfd';
  if (l.includes('vehicle') || l.includes('car')) return '#d29922';
  if (l.includes('fire') || l.includes('weapon')) return '#f85149';
  return '#57ab5a';
}

// ── Processing toggle button ──────────────────────────────────────────────────
function ProcBtn({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 10px', fontSize: 11, borderRadius: 8, fontWeight: 600,
        border: `1px solid ${active ? '#388bfd' : 'var(--border)'}`,
        background: active ? 'rgba(56,139,253,0.18)' : 'var(--bg-elevated)',
        color: active ? '#388bfd' : 'var(--text-secondary)',
        cursor: 'pointer', transition: 'all 0.15s', minHeight: 32
      }}
    >
      {label}
    </button>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function LiveFeedsPage({ isMobile }) {
  const [streamKey, setStreamKey] = useState(0)
  const [nv, setNv] = useState(false)
  const activeCamera = 'CAM-01'
  const [monitorEvents, setMonitorEvents] = useState([])
  const [displayLimit, setDisplayLimit] = useState(20)
  const [liveBoxes, setLiveBoxes] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [recorders, setRecorders] = useState([])
  const wsRef = useRef(null)

  // Image processing toggles
  const [procStates, setProcStates] = useState({ edges: false, sharpen: false, flow: false, bgsub: false })

  const toggleProc = async (key) => {
    const newVal = !procStates[key]
    setProcStates(prev => ({ ...prev, [key]: newVal }))
    await authFetch('/api/feeds/processing', {
      method: 'POST',
      body: JSON.stringify({ camera_id: activeCamera, [key]: newVal })
    }).catch(() => {})
  }

  // ── Fetch initial events ─────────────────────────────────────────────────
  useEffect(() => {
    authFetch('/api/detections?limit=60')
      .then(r => r?.json())
      .then(data => {
        if (Array.isArray(data)) setMonitorEvents(data)
      })
      .catch(() => {})
  }, [])

  // ── Fetch recorders list ─────────────────────────────────────────────────
  useEffect(() => {
    authFetch('/api/users?role=recorder')
      .then(r => r?.json())
      .then(data => { if (Array.isArray(data)) setRecorders(data) })
      .catch(() => {})
  }, [])

  // ── WebSocket /ws/monitor ────────────────────────────────────────────────
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState <= 1) return
    wsRef.current = authWS('/ws/monitor')
    wsRef.current.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        const det = msg.detection || msg.data

        if ((msg.type === 'detection' || msg.type === 'new_detection') && det) {
          const label = det.label || det.display_label || det.detected_class || 'Unknown'
          const entry = {
            id: det.id || det.event_id,
            label,
            display_label: label,
            detected_class: det.detected_class,
            confidence: det.confidence ?? 0,
            camera_id: det.camera_id || activeCamera,
            timestamp: det.timestamp || new Date().toISOString(),
            distance_m: det.distance_m,
            speed_ms: det.speed_ms,
            screenshot_path: det.screenshot_path,
            x: det.x ?? 0,
            y: det.y ?? 0,
            width: det.width ?? det.w ?? 0,
            height: det.height ?? det.h ?? 0,
          }
          setMonitorEvents(prev => [entry, ...prev].slice(0, 200))
          if (det.camera_id === activeCamera || !det.camera_id || det.camera_id === 'CAM-01') {
            setLiveBoxes(prev => [...prev, { ...entry, _id: Date.now() + Math.random(), _time: Date.now() }])
          }
        }
      } catch (e) { console.error('[WS] parse error', e) }
    }
    return () => wsRef.current?.close()
  // eslint-disable-next-line
  }, [])

  // Also connect to /ws/detections as fallback
  useEffect(() => {
    const ws2 = authWS('/ws/detections')
    ws2.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        const det = msg.detection || msg.data
        if (msg.type === 'detection' && det) {
          const label = det.label || det.display_label || det.detected_class || 'Unknown'
          const entry = {
            id: det.id, label, display_label: label, detected_class: det.detected_class,
            confidence: det.confidence ?? 0, camera_id: det.camera_id,
            timestamp: det.timestamp || new Date().toISOString(),
            distance_m: det.distance_m, speed_ms: det.speed_ms,
            x: det.x ?? 0, y: det.y ?? 0, width: det.width ?? det.w ?? 0, height: det.height ?? det.h ?? 0,
          }
          setMonitorEvents(prev => {
            if (prev.find(e => e.id && e.id === entry.id)) return prev
            return [entry, ...prev].slice(0, 200)
          })
          setLiveBoxes(prev => [...prev, { ...entry, _id: Date.now() + Math.random(), _time: Date.now() }])
        }
      } catch {}
    }
    return () => ws2.close()
  }, [])

  // ── Expire old bounding boxes ────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setLiveBoxes(prev => prev.filter(b => Date.now() - b._time < 4000)), 1000)
    return () => clearInterval(id)
  }, [])

  // ── 30-second stream heartbeat ───────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setStreamKey(k => k + 1), 30000)
    return () => clearInterval(id)
  }, [])

  // ── Night vision toggle — also disables YOLO detection ───────────────────
  const toggleNV = async () => {
    const newVal = !nv
    await authFetch('/api/feeds/processing', {
      method: 'POST',
      body: JSON.stringify({ camera_id: activeCamera, night: newVal, detection_enabled: !newVal })
    }).catch(() => {})
    setNv(newVal)
  }

  const refreshStream = () => setStreamKey(k => k + 1)

  const handleTestDetection = async () => {
    await authFetch('/api/test/detection', { method: 'POST' }).catch(() => {})
  }

  const token = getToken()
  const streamUrl = `${API}/stream/${activeCamera}?token=${token}`

  const visibleEvents = monitorEvents.slice(0, displayLimit)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>

      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="live-dot" style={{ width: 8, height: 8 }} />
          <span style={{ fontWeight: 700, fontSize: 15 }}>{activeCamera}</span>
          <span className="badge badge-green">Live</span>
        </div>
        <div style={{ flex: 1 }} />

        <button
          className="btn btn-sm btn-primary"
          onClick={handleTestDetection}
          style={{ minHeight: '44px' }}
        >
          🚨 Test Detection
        </button>
        <button
          className="btn btn-sm btn-secondary"
          onClick={toggleNV}
          title="Night Vision (disables YOLO)"
          style={{ minHeight: '44px' }}
        >
          {nv ? <Moon size={14} /> : <Sun size={14} />}
          &nbsp;{nv ? 'NV ON' : 'NV OFF'}
        </button>
        <button
          className="btn btn-sm btn-secondary"
          onClick={refreshStream}
          title="Refresh stream"
          style={{ minHeight: '44px' }}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* IMAGE PROCESSING TOGGLES */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginRight: 4 }}>Filter:</span>
        <ProcBtn label="Edges" active={procStates.edges} onClick={() => toggleProc('edges')} />
        <ProcBtn label="Sharpen" active={procStates.sharpen} onClick={() => toggleProc('sharpen')} />
        <ProcBtn label="Optical Flow" active={procStates.flow} onClick={() => toggleProc('flow')} />
        <ProcBtn label="Bg Sub" active={procStates.bgsub} onClick={() => toggleProc('bgsub')} />
      </div>

      {/* MAIN CONTENT ROW: video + events */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 12, flex: 1, minHeight: 0 }}>

        {/* VIDEO PANEL */}
        <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', minWidth: 0 }}>
          <div style={{ position: 'relative', aspectRatio: '16/9', background: '#000', overflow: 'hidden', width: '100%' }}>
            <img
              key={streamKey}
              src={streamUrl}
              alt="Live Stream"
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
              onError={() => setTimeout(() => setStreamKey(k => k + 1), 2000)}
            />

            {/* Bounding box overlays */}
            {liveBoxes.filter(b => b.width > 0).map(b => (
              <div key={b._id} style={{
                position: 'absolute',
                left: `${b.x * 100}%`, top: `${b.y * 100}%`,
                width: `${b.width * 100}%`, height: `${b.height * 100}%`,
                border: `2px solid ${labelColor(b.label)}`,
                borderRadius: 3, pointerEvents: 'none',
                boxShadow: `0 0 6px ${labelColor(b.label)}88`
              }}>
                <div style={{
                  position: 'absolute', top: -20, left: -2,
                  background: labelColor(b.label), opacity: 0.92,
                  color: '#0d1117', fontSize: 9, fontWeight: 800,
                  padding: '1px 6px', borderRadius: 3, whiteSpace: 'nowrap'
                }}>
                  {b.label} {Math.round((b.confidence || 0) * 100)}%
                </div>
              </div>
            ))}

            {/* Overlay info bar */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              padding: '20px 12px 8px',
              background: 'linear-gradient(transparent, rgba(0,0,0,0.78))',
              display: 'flex', justifyContent: 'space-between',
              color: '#fff', fontSize: 11, fontFamily: 'monospace'
            }}>
              <span>Monitor Dashboard — {activeCamera}</span>
              <span style={{ color: '#39ff14' }}>● LIVE</span>
            </div>

            {nv && (
              <div style={{
                position: 'absolute', top: 10, left: 10,
                background: 'rgba(57,255,20,0.18)', border: '1px solid #39ff14',
                color: '#39ff14', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12
              }}>🌙 NV ON — YOLO OFF</div>
            )}
          </div>
        </div>

        {/* EVENTS PANEL */}
        <div className="panel" style={{ width: isMobile ? '100%' : 300, display: 'flex', flexDirection: 'column', minHeight: isMobile ? 300 : 0, flexShrink: 0 }}>
          <div className="panel-header" style={{ flexShrink: 0 }}>
            <span style={{ fontWeight: 600 }}>Live Events</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="badge badge-blue">{monitorEvents.length}</span>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {monitorEvents.length === 0 ? (
              <div className="empty-state" style={{ padding: 20 }}>No detections yet</div>
            ) : visibleEvents.map((ev, i) => (
              <div
                key={ev.id || i}
                onClick={() => setSelectedEvent(ev)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
                  borderBottom: '1px solid var(--border)', cursor: 'pointer',
                  transition: 'background 0.15s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: labelColor(ev.label), flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ev.display_label || ev.label}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 6 }}>
                    <span>{Math.round((ev.confidence || 0) * 100)}%</span>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                  {ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : 'Now'}
                </div>
              </div>
            ))}

            {/* Load More */}
            {monitorEvents.length > displayLimit && (
              <div style={{ padding: '8px 12px', textAlign: 'center' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%', fontSize: 11 }}
                  onClick={() => setDisplayLimit(l => l + 20)}
                >
                  Load more (+20) · {monitorEvents.length - displayLimit} remaining
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BOTTOM ROW: Field Recorders */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
            Field Recorders
          </div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {recorders.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>No recorders online</div>
            ) : recorders.map(rec => (
              <div
                key={rec.id || rec.username}
                style={{
                  width: 150, flexShrink: 0,
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '10px 12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: rec.is_online ? '#39ff14' : '#6e7681' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {rec.display_name || rec.username}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{rec.is_online ? 'Online' : 'Offline'}</span>
                  {rec.battery != null && <span>🔋 {rec.battery}%</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* EVENT MODAL */}
      {selectedEvent && <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
    </div>
  )
}
