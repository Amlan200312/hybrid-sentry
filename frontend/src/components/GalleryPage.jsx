import { useState, useEffect } from 'react'

const API = 'http://localhost:8000'

function SkeletonCard() {
  return (
    <div className="panel" style={{ overflow: 'hidden' }}>
      <div className="skeleton" style={{ aspectRatio: '16/9', borderRadius: 0 }} />
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div className="skeleton" style={{ height: 10, width: '60%' }} />
        <div className="skeleton" style={{ height: 9, width: '40%' }} />
      </div>
    </div>
  )
}

export default function GalleryPage() {
  const [snapshots, setSnapshots] = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [selected, setSelected]   = useState(null)
  const [dateFilter, setDateFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  function fetchSnapshots() {
    setLoading(true)
    const token = sessionStorage.getItem('hs_token')
    fetch(`${API}/api/snapshots`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => {
        const list = Array.isArray(d) ? d : (d.snapshots || [])
        setSnapshots(list)
        setLoading(false)
      })
      .catch(e => { setError(String(e)); setLoading(false) })
  }

  useEffect(() => { fetchSnapshots() }, []) // eslint-disable-line

  const filtered = (snapshots || []).filter(s =>
    (typeFilter === 'all' || (s.label || '').includes(typeFilter))
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Filter bar */}
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
        padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 8,
      }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Filter:</span>
        {['all', 'person', 'vehicle', 'drone'].map(t => (
          <button
            key={t}
            className={`filter-pill ${typeFilter === t ? 'active' : ''}`}
            onClick={() => setTypeFilter(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <input
          type="date"
          className="input"
          style={{ height: 30, width: 150, fontSize: 12 }}
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
        />
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
          {loading ? 'Loading…' : `${filtered.length} snapshots`}
        </span>
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {[1,2,3,4,5,6,7,8].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <div className="error-state">
          <div style={{ fontSize: 13, color: 'var(--accent-red)', fontWeight: 600 }}>Failed to load</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{error}</div>
          <button className="btn btn-secondary btn-sm" onClick={fetchSnapshots}>↺ Retry</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🖼️</div>
          <div className="empty-state-title">No snapshots yet</div>
          <div className="empty-state-sub">Snapshots are captured automatically when detections occur</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {filtered.map((snap, i) => (
            <div
              key={snap.id || i}
              className="panel"
              style={{ cursor: 'pointer', transition: 'transform 150ms, border-color 150ms' }}
              onClick={() => setSelected(snap)}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = '' }}
            >
              <div style={{ aspectRatio: '16/9', overflow: 'hidden', background: '#000' }}>
                <img
                  src={snap.snapshot_url || snap.url}
                  alt={snap.label || 'snapshot'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={e => { e.target.style.display = 'none' }}
                />
              </div>
              <div style={{ padding: '8px 10px' }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 3 }}>
                  <span className={`badge badge-${(snap.label || '').includes('person') ? 'blue' : 'amber'}`} style={{ fontSize: 9 }}>
                    {snap.label || snap.class || 'Unknown'}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {snap.timestamp ? new Date(snap.timestamp).toLocaleString() : '—'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{snap.recorder_id || '—'}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {selected && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 10, overflow: 'hidden', maxWidth: 780, width: '90%',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {selected.label || 'Snapshot'} — {selected.recorder_id || ''}
              </div>
              <button className="btn btn-ghost btn-xs" onClick={() => setSelected(null)}>✕</button>
            </div>
            <img
              src={selected.snapshot_url || selected.url}
              alt="full snapshot"
              style={{ width: '100%', maxHeight: 480, objectFit: 'contain', background: '#000' }}
            />
            <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 16 }}>
              <span>Time: {selected.timestamp ? new Date(selected.timestamp).toLocaleString() : '—'}</span>
              <span>Confidence: {selected.confidence ? `${Math.round(selected.confidence * 100)}%` : '—'}</span>
              <span>Location: {selected.location || '—'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
