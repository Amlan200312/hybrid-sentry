import { useState, useEffect } from 'react'

const API = 'http://localhost:8000'

function SkeletonCard() {
  return (
    <div className="sub-panel" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="skeleton" style={{ width: 80, height: 60, borderRadius: 5 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="skeleton" style={{ height: 12, width: '60%' }} />
          <div className="skeleton" style={{ height: 10, width: '40%' }} />
          <div className="skeleton" style={{ height: 10, width: '80%' }} />
        </div>
      </div>
    </div>
  )
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="error-state">
      <div style={{ fontSize: 13, color: 'var(--accent-red)', fontWeight: 600 }}>Failed to load</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{message}</div>
      <button className="btn btn-secondary btn-sm" onClick={onRetry}>↺ Retry</button>
    </div>
  )
}

export default function VerifyQueuePage() {
  const [pending, setPending]     = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [verified, setVerified]   = useState([])
  const [doing, setDoing]         = useState({})

  function fetchQueue() {
    setLoading(true)
    const token = sessionStorage.getItem('hs_token')
    fetch(`http://localhost:8000/api/detections/verify-queue`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => {
        setPending(Array.isArray(d) ? d : (d.detections || d.items || []))
        setLoading(false)
      })
      .catch(e => { setError(String(e)); setLoading(false) })
  }

  useEffect(() => { fetchQueue() }, []) // eslint-disable-line

  async function verifyItem(id, verdict) {
    setDoing(p => ({ ...p, [id]: verdict }))
    const token = sessionStorage.getItem('hs_token')
    try {
      await fetch(`http://localhost:8000/api/detections/${id}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ verdict }),
      })
    } catch {}
    const item = (pending || []).find(e => (e.id || e.detection_id) === id)
    if (item) {
      setVerified(v => [{ ...item, verdict, verified_at: new Date().toISOString() }, ...v])
      setPending(p => (p || []).filter(e => (e.id || e.detection_id) !== id))
    }
    setDoing(p => { const n = { ...p }; delete n[id]; return n })
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* LEFT: Pending */}
      <div className="panel">
        <div className="panel-header">
          <span>Pending Verification</span>
          <span className="badge badge-red">{loading ? '…' : (pending?.length || 0)}</span>
        </div>
        <div className="panel-body-scroll" style={{ maxHeight: 'calc(100vh - 220px)' }}>
          {loading ? (
            <div>{[1,2,3].map(i => <SkeletonCard key={i} />)}</div>
          ) : error ? (
            <ErrorState message={error} onRetry={fetchQueue} />
          ) : (!pending || pending.length === 0) ? (
            <div className="empty-state">
              <div className="empty-state-icon">✅</div>
              <div className="empty-state-title">All verified!</div>
              <div className="empty-state-sub">No pending detections in the queue</div>
            </div>
          ) : (
            pending.map(evt => {
              const id = evt.id || evt.detection_id
              const ts = evt.timestamp ? new Date(evt.timestamp).toLocaleString() : '—'
              const busy = doing[id]
              return (
                <div key={id} className="sub-panel" style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                    {evt.snapshot_url ? (
                      <img
                        src={evt.snapshot_url}
                        alt="snapshot"
                        style={{ width: 90, height: 60, objectFit: 'cover', borderRadius: 5, border: '1px solid var(--border)', flexShrink: 0 }}
                      />
                    ) : (
                      <div style={{
                        width: 90, height: 60, borderRadius: 5, background: 'var(--bg-card)',
                        border: '1px solid var(--border)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', flexShrink: 0,
                      }}>
                        <span style={{ fontSize: 20 }}>📷</span>
                      </div>
                    )}
                    <div style={{ flex: 1, fontSize: 12 }}>
                      <div style={{ color: 'var(--text-muted)', marginBottom: 3 }}>{ts}</div>
                      <div style={{ color: 'var(--text-secondary)', marginBottom: 3 }}>
                        {evt.recorder_id || '—'} · {evt.location || '—'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className={`badge badge-${evt.label?.includes('person') ? 'blue' : 'amber'}`}>
                          {evt.label || evt.class || 'Unknown'}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {evt.confidence ? `${Math.round(evt.confidence * 100)}%` : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn btn-success btn-xs"
                      style={{ flex: 1 }}
                      disabled={!!busy}
                      onClick={() => verifyItem(id, 'person')}
                    >
                      {busy === 'person' ? <div className="spinner" style={{ width: 10, height: 10 }} /> : '👤 Person'}
                    </button>
                    <button
                      className="btn btn-amber btn-xs"
                      style={{ flex: 1 }}
                      disabled={!!busy}
                      onClick={() => verifyItem(id, 'vehicle')}
                    >
                      {busy === 'vehicle' ? <div className="spinner" style={{ width: 10, height: 10 }} /> : '🚗 Vehicle'}
                    </button>
                    <button
                      className="btn btn-ghost btn-xs"
                      style={{ flex: 1 }}
                      disabled={!!busy}
                      onClick={() => verifyItem(id, 'false_alarm')}
                    >
                      {busy === 'false_alarm' ? <div className="spinner" style={{ width: 10, height: 10 }} /> : '✗ False'}
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* RIGHT: Already Verified Today */}
      <div className="panel">
        <div className="panel-header">
          <span>Already Verified Today</span>
          <span className="badge badge-green">{verified.length}</span>
        </div>
        <div className="panel-body-scroll" style={{ maxHeight: 'calc(100vh - 220px)' }}>
          {verified.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <div className="empty-state-title">No verified items yet</div>
            </div>
          ) : (
            verified.map((evt, i) => {
              const ts = evt.verified_at ? new Date(evt.verified_at).toLocaleTimeString() : '—'
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--bg-elevated)' }}>
                  <span className={`badge badge-${evt.verdict === 'person' ? 'blue' : evt.verdict === 'vehicle' ? 'amber' : 'muted'}`}>
                    {evt.verdict === 'person' ? '👤' : evt.verdict === 'vehicle' ? '🚗' : '✗'} {evt.verdict}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>
                    {evt.label || evt.class || '—'} · {ts}
                  </span>
                </div>
              )
            })
          )}

          {/* Summary */}
          {pending !== null && (
            <div className="sub-panel" style={{ marginTop: 12 }}>
              <div className="sub-panel-title">Summary</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Verified: <strong style={{ color: 'var(--accent-green)' }}>{verified.length}</strong> / Total: <strong>{(pending?.length || 0) + verified.length}</strong>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
