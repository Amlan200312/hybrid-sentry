import { useState, useEffect, useCallback, useRef } from 'react'

const API = 'http://localhost:8000'
const MONO = "'JetBrains Mono', monospace"

const PRIORITY_MAP = {
  emergency: { color: '#f85149', label: 'EMERGENCY' },
  high:      { color: '#d29922', label: 'HIGH'      },
  medium:    { color: '#388bfd', label: 'MEDIUM'    },
  normal:    { color: '#3fb950', label: 'NORMAL'    },
}

/* ── Skeleton row ───────────────────────────────────────────── */
function SkeletonRow() {
  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bg-elevated)' }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="skeleton" style={{ width: 60, height: 60, borderRadius: 4, flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="skeleton skeleton-line" style={{ width: '55%' }} />
          <div className="skeleton skeleton-line" style={{ width: '35%' }} />
          <div className="skeleton skeleton-line" style={{ width: '70%' }} />
        </div>
      </div>
    </div>
  )
}

/* ── Slow Replay Modal ──────────────────────────────────────── */
function SlowReplayModal({ eventId, onClose }) {
  const [speed, setSpeed] = useState(0.25)
  const vidRef            = useRef(null)
  const clipUrl           = `${API}/api/recordings/clip/${eventId}`

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 20, maxWidth: 680, width: '92%',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>🎬 Slow Motion Replay</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
        <video
          ref={vidRef}
          src={clipUrl}
          controls autoPlay loop
          onLoadedData={e => { e.target.playbackRate = speed }}
          style={{ width: '100%', borderRadius: 6, background: '#000', maxHeight: 380 }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Speed:</span>
          {[0.25, 0.5, 1.0].map(r => (
            <button key={r}
              onClick={() => { setSpeed(r); if (vidRef.current) vidRef.current.playbackRate = r }}
              className={`btn btn-sm ${speed === r ? 'btn-primary' : 'btn-secondary'}`}
            >
              {r}x
            </button>
          ))}
          <a href={clipUrl} download style={{ marginLeft: 'auto' }} className="btn btn-secondary btn-sm">
            ⬇ Download
          </a>
        </div>
      </div>
    </div>
  )
}

/* ── Single event card ──────────────────────────────────────── */
function EventCard({ ev, onReplay, onMap }) {
  const p      = PRIORITY_MAP[ev.priority] || PRIORITY_MAP.normal
  const conf   = Math.round((ev.confidence || 0) * 100)
  const camName = ev.camera_display_name || ev.camera_id || '—'

  return (
    <div
      className="fade-up"
      style={{
        borderBottom: '1px solid var(--bg-elevated)',
        borderLeft: `3px solid ${ev.status === 'confirmed' ? 'var(--accent-green)' : ev.status === 'escalated' ? 'var(--accent-red)' : 'var(--accent-amber)'}`,
        padding: '12px 16px',
        background: 'var(--bg-base)',
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: p.color }}>
          {(ev.display_label || ev.detected_class || 'UNKNOWN').toUpperCase()}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-muted)' }}>{conf}%</span>
        <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 10, color: 'var(--text-muted)' }}>
          {ev.time_ago || ev.time || (ev.detected_at ? new Date(ev.detected_at).toLocaleTimeString() : '')}
        </span>
      </div>

      {/* Thumbnail */}
      {ev.screenshot_path && (
        <img
          src={`${API}/media/${ev.screenshot_path}`}
          alt="detection"
          style={{ width: '100%', maxHeight: 90, objectFit: 'cover', borderRadius: 4, marginBottom: 8 }}
          onError={e => { e.target.style.display = 'none' }}
        />
      )}

      {/* Details */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {ev.speed_ms != null && (
          <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-secondary)' }}>
            Speed: <span style={{ color: ev.speed_ms > 4 ? 'var(--accent-red)' : ev.speed_ms > 2 ? 'var(--accent-amber)' : 'var(--accent-green)' }}>
              {ev.speed_ms.toFixed(1)} m/s
            </span>
          </div>
        )}
        {ev.clothing_type && <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-muted)' }}>Clothing: {ev.clothing_type}</div>}
        {ev.vehicle_color && <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-muted)' }}>Color: {ev.vehicle_color}</div>}
        {ev.plate_number  && <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--accent-amber)' }}>Plate: {ev.plate_number}</div>}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)' }}>📷 {camName}</span>
        {ev.gps_lat && (
          <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)' }}>
            📍 {Number(ev.gps_lat).toFixed(4)},{Number(ev.gps_lng).toFixed(4)}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {ev.has_clip && (
            <button onClick={() => onReplay(ev.id)}
              style={{ fontFamily: MONO, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--accent-blue)', borderRadius: 4, padding: '2px 8px', fontSize: 9, cursor: 'pointer' }}>
              🎬 Replay
            </button>
          )}
          {ev.gps_lat && (
            <button onClick={() => onMap(ev)}
              style={{ fontFamily: MONO, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 4, padding: '2px 8px', fontSize: 9, cursor: 'pointer' }}>
              📍 Map
            </button>
          )}
          <span style={{ fontFamily: MONO, fontSize: 9, color: ev.status === 'confirmed' ? 'var(--accent-green)' : ev.status === 'escalated' ? 'var(--accent-red)' : 'var(--accent-amber)' }}>
            {ev.status === 'confirmed' ? '✅ Confirmed' : ev.status === 'escalated' ? '🔴 Escalated' : '⚠️ Pending'}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ── Main EventLog ──────────────────────────────────────────── */
export default function EventLog() {
  const [events,  setEvents]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [page,    setPage]    = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [filter,  setFilter]  = useState('all') // all | confirmed | pending
  const [replayId, setReplayId] = useState(null)
  const LIMIT = 20

  const fetchEvents = useCallback(async (p = 1, reset = false) => {
    if (p === 1) setLoading(true)
    const token  = sessionStorage.getItem('hs_token')
    const params = new URLSearchParams({ page: p, limit: LIMIT })
    if (filter !== 'all') params.set('status', filter)

    try {
      const r = await fetch(`${API}/api/detections/events?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      const list = Array.isArray(data) ? data : (data.items || [])
      setEvents(prev => reset || p === 1 ? list : [...prev, ...list])
      setHasMore(list.length === LIMIT)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    setPage(1)
    fetchEvents(1, true)
  }, [filter, fetchEvents])

  // Poll for new events every 15s
  useEffect(() => {
    const id = setInterval(() => fetchEvents(1, true), 15000)
    return () => clearInterval(id)
  }, [fetchEvents])

  function loadMore() {
    const next = page + 1
    setPage(next)
    fetchEvents(next)
  }

  const FILTERS = [
    { key: 'all',       label: 'All' },
    { key: 'confirmed', label: '✅ Confirmed' },
    { key: 'pending',   label: '⚠️ Pending' },
    { key: 'escalated', label: '🔴 Escalated' },
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: MONO }}>
      {/* Header */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: 'var(--bg-surface)' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Event Log</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: MONO }}>{events.length} events</span>
        <div style={{ flex: 1 }} />
        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 4 }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              className={`filter-pill ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14, padding: '2px 6px' }}
          onClick={() => fetchEvents(1, true)}
          title="Refresh"
        >
          ↺
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && events.length === 0 && (
          <>{[1,2,3,4].map(i => <SkeletonRow key={i} />)}</>
        )}

        {!loading && error && events.length === 0 && (
          <div className="error-state" style={{ margin: 16 }}>
            <div className="error-state-title">Failed to load events</div>
            <div className="error-state-msg">{error}</div>
            <button className="btn btn-secondary btn-sm" onClick={() => fetchEvents(1, true)}>↺ Retry</button>
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">No confirmed detections yet</div>
            <div className="empty-state-sub">Detections will appear here as they are logged by cameras.</div>
          </div>
        )}

        {events.map(ev => (
          <EventCard
            key={ev.id}
            ev={ev}
            onReplay={setReplayId}
            onMap={ev => {
              // Dispatch custom event to switch to map (handled by MonitorDashboard if needed)
              window.dispatchEvent(new CustomEvent('hs:goto-map', { detail: ev }))
            }}
          />
        ))}

        {/* Load more */}
        {!loading && hasMore && events.length > 0 && (
          <div style={{ padding: 16, textAlign: 'center' }}>
            <button className="btn btn-secondary btn-sm" onClick={loadMore}>
              Load more events
            </button>
          </div>
        )}

        {loading && events.length > 0 && (
          <div style={{ padding: 16, textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        )}
      </div>

      {/* Slow replay modal */}
      {replayId && <SlowReplayModal eventId={replayId} onClose={() => setReplayId(null)} />}
    </div>
  )
}
