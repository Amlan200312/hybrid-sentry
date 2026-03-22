import { useState, useEffect, useCallback } from 'react'

const API = 'http://localhost:8000'

/* ── Lightbox ───────────────────────────────────────────────── */
function Lightbox({ item, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: 900, width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              {item.detected_class || item.label || 'Screenshot'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {item.camera_display_name || item.camera_id || '—'} · {item.captured_at ? new Date(item.captured_at).toLocaleString() : ''}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 22 }}>
            ×
          </button>
        </div>
        <img
          src={`${API}/media/${item.file_path || item.screenshot_path}`}
          alt={item.label || 'screenshot'}
          style={{ width: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: 8, background: '#000' }}
          onError={e => { e.target.alt = 'Image not available' }}
        />
        {item.confidence != null && (
          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
            <span>Confidence: <strong style={{ color: 'var(--text-primary)' }}>{Math.round(item.confidence * 100)}%</strong></span>
            {item.speed_ms != null && <span>Speed: <strong>{item.speed_ms.toFixed(1)} m/s</strong></span>}
            {item.gps_lat && <span>GPS: <strong style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{Number(item.gps_lat).toFixed(5)}, {Number(item.gps_lng).toFixed(5)}</strong></span>}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Skeleton card ──────────────────────────────────────────── */
function GallerySkeleton() {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div className="skeleton" style={{ height: 140 }} />
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div className="skeleton skeleton-line" style={{ width: '60%' }} />
        <div className="skeleton skeleton-line" style={{ width: '40%' }} />
      </div>
    </div>
  )
}

/* ── Gallery thumb ──────────────────────────────────────────── */
function GalleryThumb({ item, onClick }) {
  const [imgErr, setImgErr] = useState(false)
  const src = `${API}/media/${item.file_path || item.screenshot_path}`
  return (
    <div
      className="fade-up"
      onClick={() => onClick(item)}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'border-color 0.15s, transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
    >
      <div style={{ height: 140, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {imgErr
          ? <span style={{ fontSize: 32, opacity: 0.3 }}>🖼️</span>
          : <img src={src} alt={item.label || 'shot'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setImgErr(true)} />
        }
      </div>
      <div style={{ padding: '8px 10px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.detected_class || item.label || 'Screenshot'}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
          {item.camera_display_name || item.camera_id || '—'} · {item.captured_at ? new Date(item.captured_at).toLocaleTimeString() : ''}
        </div>
      </div>
    </div>
  )
}

/* ── Main Gallery ───────────────────────────────────────────── */
export default function Gallery() {
  const [items,    setItems]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [selected, setSelected] = useState(null)
  const [cameras,  setCameras]  = useState([])
  const [filters,  setFilters]  = useState({ camera: '', class: '', date: '' })

  // Load cameras for filter
  useEffect(() => {
    const token = sessionStorage.getItem('hs_token')
    fetch(`${API}/api/cameras`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : [])
      .then(d => setCameras(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  const fetchGallery = useCallback(async () => {
    setLoading(true)
    const token = sessionStorage.getItem('hs_token')
    const params = new URLSearchParams()
    if (filters.camera) params.set('camera_id', filters.camera)
    if (filters.class)  params.set('class', filters.class)
    if (filters.date)   params.set('date', filters.date)

    try {
      const r = await fetch(`${API}/api/recordings/screenshots?${params}`, {
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
  }, [filters])

  useEffect(() => { fetchGallery() }, [fetchGallery])

  const CLASSES = ['person', 'vehicle', 'drone', 'animal', 'vessel', 'unknown']

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>🖼️ Screenshot Gallery</span>
        {!loading && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>{items.length} items</span>}
        <div style={{ flex: 1 }} />

        {/* Filters */}
        <select className="input" style={{ width: 160 }} value={filters.camera} onChange={e => setFilters(f => ({ ...f, camera: e.target.value }))}>
          <option value="">All cameras</option>
          {cameras.map(c => <option key={c.camera_id} value={c.camera_id}>{c.display_name || c.camera_id}</option>)}
        </select>

        <select className="input" style={{ width: 140 }} value={filters.class} onChange={e => setFilters(f => ({ ...f, class: e.target.value }))}>
          <option value="">All classes</option>
          {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <input type="date" className="input" style={{ width: 150 }} value={filters.date}
          onChange={e => setFilters(f => ({ ...f, date: e.target.value }))} />

        <button className="btn btn-secondary btn-sm" onClick={fetchGallery}>↺ Refresh</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {[1,2,3,4,5,6,7,8].map(i => <GallerySkeleton key={i} />)}
          </div>
        )}

        {!loading && error && (
          <div className="error-state" style={{ maxWidth: 360, margin: '40px auto' }}>
            <div className="error-state-title">Failed to load gallery</div>
            <div className="error-state-msg">{error}</div>
            <button className="btn btn-secondary btn-sm" onClick={fetchGallery}>↺ Retry</button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">📷</div>
            <div className="empty-state-title">No screenshots saved yet</div>
            <div className="empty-state-sub">Use the 📸 SNAP button in Live Feeds to capture frames. They will appear here.</div>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {items.map(item => <GalleryThumb key={item.id} item={item} onClick={setSelected} />)}
          </div>
        )}
      </div>

      {selected && <Lightbox item={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
