import { useState, useEffect } from 'react'
import { authFetch } from '../utils/api'

export default function GalleryPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('All')
  const [lightbox, setLightbox] = useState(null)

  useEffect(() => {
    setLoading(true)
    authFetch('/api/gallery')
      .then(r => r ? r.json() : [])
      .then(data => {
        const arr = Array.isArray(data) ? data : (data?.items || data?.detections || [])
        setItems(arr)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filteredItems = items.filter(item => {
    if (filter === 'All') return true
    const label = (item.label || 'unknown').toLowerCase()
    return label === filter.toLowerCase()
  })

  // Lightbox view
  if (lightbox) {
    return (
      <div style={{ position: 'absolute', inset: 0, minHeight: '400px', background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={() => setLightbox(null)}>
        <div style={{ maxWidth: '800px', width: '90%', background: 'var(--bg-card)', borderRadius: '8px', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 600 }}>Snapshot Details</span>
            <button className="btn btn-ghost btn-xs" onClick={() => setLightbox(null)}>✕</button>
          </div>
          <div style={{ background: '#000', display: 'flex', justifyContent: 'center' }}>
            <img 
              src={`http://localhost:8000/api/gallery/image/${lightbox.filename}`} 
              style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain' }}
              onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = '<div style="padding: 40px; color: var(--text-muted)">Image not available</div>' }}
            />
          </div>
          <div style={{ padding: '16px', display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <div><strong>Time:</strong> {lightbox.timestamp ? new Date(lightbox.timestamp).toLocaleString() : 'Unknown'}</div>
            <div><strong>Recorder:</strong> {lightbox.recorder_id || 'Unknown'}</div>
            <div><strong>Location:</strong> {lightbox.location || 'Unknown'}</div>
            <div><strong>Confidence:</strong> {lightbox.confidence ? Math.round(lightbox.confidence * 100) + '%' : 'Unknown'}</div>
            <div style={{ marginLeft: 'auto' }}>
              <span className={`badge badge-${lightbox.label === 'person' ? 'blue' : lightbox.label === 'vehicle' ? 'amber' : 'red'}`} style={{ textTransform: 'capitalize' }}>
                {lightbox.label || 'Unknown'}
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {['All', 'Person', 'Vehicle', 'Unknown'].map(f => (
          <button 
            key={f}
            className={`filter-pill ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
          {Array.from({length: 8}).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: '140px', borderRadius: '8px' }} />
          ))}
        </div>
      ) : error ? (
        <div className="error-state">Failed to load: {error}</div>
      ) : filteredItems.length === 0 ? (
        <div className="empty-state">No snapshots found</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
          {filteredItems.map(item => {
            const color = item.label === 'person' ? 'blue' : item.label === 'vehicle' ? 'amber' : 'red'
            return (
              <div 
                key={item.id}
                onClick={() => setLightbox(item)}
                style={{
                  borderRadius: '8px', overflow: 'hidden', cursor: 'pointer',
                  border: '1px solid var(--border)',
                  transition: 'transform 150ms, border-color 150ms',
                  display: 'flex', flexDirection: 'column'
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.borderColor = 'var(--accent-blue)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                <div style={{ aspectRatio: '16/9', background: 'var(--bg-elevated)', position: 'relative' }}>
                  <img 
                    src={`http://localhost:8000/api/gallery/image/${item.filename}`} 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => { 
                      e.target.style.display = 'none'; 
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                  {/* Fallback placeholder */}
                  <div style={{ position: 'absolute', inset: 0, display: 'none', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>
                    {item.label || 'Snapshot'}
                  </div>
                </div>
                <div style={{ padding: '8px 10px', background: 'var(--bg-elevated)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className={`badge badge-${color}`} style={{ fontSize: '9px', textTransform: 'capitalize' }}>
                      {item.label || 'Unknown'}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {item.recorder_id || 'Unknown recorder'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
