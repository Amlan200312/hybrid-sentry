import { useState, useEffect } from 'react'

const API = 'http://localhost:8000'

function SkeletonRow() {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--bg-elevated)' }}>
      {[60, 90, 80, 100, 60].map((w, i) => (
        <div key={i} className="skeleton" style={{ width: w, height: 12 }} />
      ))}
    </div>
  )
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="error-state" style={{ margin: 16 }}>
      <div style={{ fontSize: 13, color: 'var(--accent-red)', fontWeight: 600 }}>Failed to load</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{message}</div>
      <button className="btn btn-secondary btn-sm" onClick={onRetry}>↺ Retry</button>
    </div>
  )
}

export default function EventLogPage() {
  const [events, setEvents]       = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [expanded, setExpanded]   = useState(null)
  const [search, setSearch]       = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [verifiedFilter, setVerifiedFilter] = useState('all')
  const [stats, setStats]         = useState(null)

  function fetchEvents() {
    setLoading(true)
    const token = sessionStorage.getItem('hs_token')
    const hdrs  = token ? { Authorization: `Bearer ${token}` } : {}
    fetch(`http://localhost:8000/api/detections?limit=50`, { headers: hdrs, credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => {
        const list = Array.isArray(d) ? d : (d.detections || d.items || [])
        setEvents(list)
        // Build stats
        const byType = {}
        list.forEach(e => { const k = e.label || e.class || 'unknown'; byType[k] = (byType[k] || 0) + 1 })
        setStats(byType)
        setLoading(false)
      })
      .catch(e => { setError(String(e)); setLoading(false) })
  }

  useEffect(() => { fetchEvents() }, []) // eslint-disable-line

  const filtered = (events || []).filter(evt => {
    const label = (evt.label || evt.class || '').toLowerCase()
    const matchSearch = !search || label.includes(search.toLowerCase()) ||
      (evt.recorder_id || '').includes(search)
    const matchType = typeFilter === 'all' || label.includes(typeFilter)
    const matchVer = verifiedFilter === 'all'
      || (verifiedFilter === 'verified' && evt.verified)
      || (verifiedFilter === 'unverified' && !evt.verified)
    return matchSearch && matchType && matchVer
  })

  const unverifiedCount = (events || []).filter(e => !e.verified).length

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 16 }}>
      {/* LEFT: Event Log */}
      <div className="panel">
        <div className="panel-header">
          <span>Event Log</span>
          <span className="badge badge-muted">{filtered.length} events</span>
        </div>
        {/* Filters */}
        <div style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <input
            className="input"
            style={{ width: 160, height: 30, padding: '0 10px', fontSize: 12 }}
            placeholder="Search events…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="input"
            style={{ width: 130, height: 30, padding: '0 10px', fontSize: 12 }}
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="person">Person</option>
            <option value="vehicle">Vehicle</option>
            <option value="drone">Drone</option>
          </select>
          <select
            className="input"
            style={{ width: 130, height: 30, padding: '0 10px', fontSize: 12 }}
            value={verifiedFilter}
            onChange={e => setVerifiedFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
          </select>
        </div>

        <div className="panel-body-scroll" style={{ maxHeight: 'calc(100vh - 280px)' }}>
          {loading ? (
            <div>{[1,2,3,4,5].map(i => <SkeletonRow key={i} />)}</div>
          ) : error ? (
            <ErrorState message={error} onRetry={fetchEvents} />
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <div className="empty-state-title">No events found</div>
              <div className="empty-state-sub">Adjust filters or wait for new detections</div>
            </div>
          ) : (
            filtered.map((evt, i) => {
              const isExpanded = expanded === i
              const ts = evt.timestamp ? new Date(evt.timestamp).toLocaleString() : '—'
              return (
                <div key={evt.id || i} style={{ borderBottom: '1px solid var(--bg-elevated)' }}>
                  <div
                    onClick={() => setExpanded(isExpanded ? null : i)}
                    style={{
                      padding: '10px 14px',
                      display: 'flex', alignItems: 'center', gap: 12,
                      cursor: 'pointer',
                      background: isExpanded ? 'var(--bg-elevated)' : 'transparent',
                      transition: 'background 150ms',
                    }}
                  >
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 130, flexShrink: 0 }}>{ts}</span>
                    <span className={`badge badge-${evt.label?.includes('person') ? 'blue' : 'amber'}`}>
                      {evt.label || evt.class || 'Unknown'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {evt.recorder_id || '—'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>
                      {evt.confidence ? `${Math.round(evt.confidence * 100)}%` : '—'}
                    </span>
                    <span className={`badge ${evt.verified ? 'badge-green' : 'badge-red'}`}>
                      {evt.verified ? '✓ Verified' : 'Unverified'}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '10px 14px 14px', background: 'var(--bg-elevated)' }}>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        {evt.snapshot_url && (
                          <img
                            src={evt.snapshot_url}
                            alt="snapshot"
                            style={{ width: 140, height: 90, objectFit: 'cover', borderRadius: 5, border: '1px solid var(--border)' }}
                          />
                        )}
                        <div style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>
                          <div><strong>ID:</strong> {evt.id || '—'}</div>
                          <div><strong>Recorder:</strong> {evt.recorder_id || '—'}</div>
                          <div><strong>Location:</strong> {evt.location || '—'}</div>
                          <div><strong>Confidence:</strong> {evt.confidence ? `${Math.round(evt.confidence*100)}%` : '—'}</div>
                          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                            <button className="btn btn-success btn-xs">✓ Verify</button>
                            <button className="btn btn-danger btn-xs">⚑ Flag</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* RIGHT: Summary Stats */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="panel">
          <div className="panel-header">Summary Stats</div>
          <div className="panel-body">
            <div className="sub-panel" style={{ marginBottom: 10 }}>
              <div className="sub-panel-title">Today by Type</div>
              {stats ? Object.entries(stats).map(([type, count]) => (
                <div key={type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{type}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      width: Math.min(60, Math.round((count / Math.max(...Object.values(stats))) * 60)),
                      height: 6, borderRadius: 3,
                      background: 'var(--accent-blue)', opacity: 0.7,
                    }} />
                    <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>{count}</span>
                  </div>
                </div>
              )) : (
                <div className="skeleton" style={{ height: 60 }} />
              )}
            </div>

            <div className="sub-panel" style={{ marginBottom: 10 }}>
              <div className="sub-panel-title">Unverified</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  fontSize: 28, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace',
                  color: unverifiedCount > 0 ? 'var(--accent-red)' : 'var(--accent-green)',
                }}>
                  {loading ? '…' : unverifiedCount}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>pending</span>
              </div>
            </div>

            <div className="sub-panel">
              <div className="sub-panel-title">Total Today</div>
              <span style={{
                fontSize: 28, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace',
                color: 'var(--text-primary)',
              }}>
                {loading ? '…' : (events?.length || 0)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
