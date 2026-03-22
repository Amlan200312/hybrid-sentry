import { useState, useEffect, useCallback } from 'react'

const API = 'http://localhost:8000'

/* ── Skeleton ───────────────────────────────────────────────── */
function ItemSkeleton() {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="skeleton" style={{ width: 80, height: 80, borderRadius: 6, flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="skeleton skeleton-line" style={{ width: '50%' }} />
          <div className="skeleton skeleton-line" style={{ width: '70%' }} />
          <div className="skeleton skeleton-line" style={{ width: '40%' }} />
        </div>
      </div>
    </div>
  )
}

/* ── Single queue item ──────────────────────────────────────── */
function QueueItem({ item, onConfirm, onDismiss, onEscalate, acting }) {
  const conf = Math.round((item.confidence || 0) * 100)
  return (
    <div className="fade-up" style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      overflow: 'hidden',
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', gap: 0 }}>
        {/* Thumbnail */}
        <div style={{ width: 90, flexShrink: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {item.screenshot_path ? (
            <img
              src={`${API}/media/${item.screenshot_path}`}
              alt="detection"
              style={{ width: '100%', height: '100%', objectFit: 'cover', minHeight: 90 }}
              onError={e => { e.target.style.display = 'none' }}
            />
          ) : (
            <span style={{ fontSize: 24 }}>📷</span>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              {(item.display_label || item.detected_class || 'Unknown').toUpperCase()}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
              {conf}% confidence
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
              {item.time_ago || (item.detected_at ? new Date(item.detected_at).toLocaleTimeString() : '')}
            </span>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
            📷 {item.camera_display_name || item.camera_id || '—'}
          </div>

          {item.gps_lat && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
              📍 {Number(item.gps_lat).toFixed(5)}, {Number(item.gps_lng).toFixed(5)}
            </div>
          )}
          {item.speed_ms != null && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              Speed: {item.speed_ms.toFixed(1)} m/s
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{
        padding: '10px 14px',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        gap: 8,
        background: 'var(--bg-elevated)',
      }}>
        <button
          className="btn btn-success btn-sm"
          onClick={() => onConfirm(item.id)}
          disabled={acting === item.id}
        >
          {acting === item.id ? <div className="spinner" /> : '✅'} Confirm
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => onDismiss(item.id)}
          disabled={acting === item.id}
        >
          ✕ Dismiss
        </button>
        <button
          className="btn btn-danger btn-sm"
          onClick={() => onEscalate(item.id)}
          disabled={acting === item.id}
          style={{ marginLeft: 'auto' }}
        >
          🔴 Escalate
        </button>
      </div>
    </div>
  )
}

/* ── Main VerifyQueue ───────────────────────────────────────── */
export default function VerifyQueue() {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [acting,  setActing]  = useState(null)

  const fetchQueue = useCallback(async () => {
    const token = sessionStorage.getItem('hs_token')
    try {
      const r = await fetch(`${API}/api/detections/verify-queue`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      setItems(Array.isArray(data) ? data : (data.items || []))
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchQueue()
    const id = setInterval(fetchQueue, 10000)
    return () => clearInterval(id)
  }, [fetchQueue])

  async function doAction(id, action) {
    setActing(id)
    const token = sessionStorage.getItem('hs_token')
    try {
      const r = await fetch(`${API}/api/detections/${id}/${action}`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      })
      if (!r.ok) throw new Error(`Failed: HTTP ${r.status}`)
      setItems(prev => prev.filter(item => item.id !== id))
    } catch (err) {
      alert(err.message)
    } finally {
      setActing(null)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>⚠️ Verify Queue</h2>
        {!loading && (
          <span style={{
            background: items.length > 0 ? 'rgba(248,81,73,0.15)' : 'var(--bg-elevated)',
            color: items.length > 0 ? 'var(--accent-red)' : 'var(--text-muted)',
            border: `1px solid ${items.length > 0 ? 'rgba(248,81,73,0.35)' : 'var(--border)'}`,
            borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600,
          }}>
            {items.length} pending
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button className="btn btn-secondary btn-sm" onClick={fetchQueue}>↺ Refresh</button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map(i => <ItemSkeleton key={i} />)}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="error-state">
          <div className="error-state-title">Failed to load verify queue</div>
          <div className="error-state-msg">{error}</div>
          <button className="btn btn-secondary btn-sm" onClick={fetchQueue}>↺ Retry</button>
        </div>
      )}

      {/* Empty — All Clear */}
      {!loading && !error && items.length === 0 && (
        <div className="empty-state">
          <div style={{ fontSize: 48, animation: 'fadeUp 0.5s ease' }}>✅</div>
          <div className="empty-state-title" style={{ color: 'var(--accent-green)' }}>All Clear</div>
          <div className="empty-state-sub">No pending verifications. All detections have been reviewed.</div>
        </div>
      )}

      {/* Items */}
      {items.map(item => (
        <QueueItem
          key={item.id}
          item={item}
          acting={acting}
          onConfirm={(id)  => doAction(id, 'confirm')}
          onDismiss={(id)  => doAction(id, 'dismiss')}
          onEscalate={(id) => doAction(id, 'escalate')}
        />
      ))}
    </div>
  )
}
