import { useState, useEffect, useCallback } from 'react'

const API = 'http://localhost:8000'

/* ── Color mapping ──────────────────────────────────────────── */
function cellColor(count, maxCount) {
  if (count === 0 || maxCount === 0) return 'transparent'
  const ratio = count / maxCount
  if (ratio < 0.25) return `rgba(56, 139, 253, ${0.3 + ratio * 0.8})`
  if (ratio < 0.6)  return `rgba(210, 153, 34, ${0.4 + ratio * 0.6})`
  return `rgba(248, 81, 73, ${0.5 + ratio * 0.5})`
}

export default function FrameHeatMap() {
  const [cameras,  setCameras]  = useState([])
  const [camId,    setCamId]    = useState(null)
  const [grid,     setGrid]     = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [camLoad,  setCamLoad]  = useState(true)
  const [error,    setError]    = useState(null)
  const [tooltip,  setTooltip]  = useState(null)

  // Load cameras
  useEffect(() => {
    const token = sessionStorage.getItem('hs_token')
    fetch(`${API}/api/cameras`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const list = Array.isArray(data) ? data : []
        setCameras(list)
        if (list.length > 0) setCamId(list[0].camera_id)
        setCamLoad(false)
      })
      .catch(() => setCamLoad(false))
  }, [])

  // Load heatmap when camera selected
  const fetchHeatmap = useCallback(async () => {
    if (!camId) return
    setLoading(true)
    setError(null)
    const token = sessionStorage.getItem('hs_token')
    try {
      const r = await fetch(`${API}/api/heatmap/${camId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      setGrid(data)
    } catch (err) {
      setError(err.message)
      setGrid(null)
    } finally {
      setLoading(false)
    }
  }, [camId])

  useEffect(() => { fetchHeatmap() }, [fetchHeatmap])

  // Build a flat 10×10 grid from API data
  const cells   = grid?.cells || []
  const maxCount = Math.max(...cells.map(c => c.count ?? 0), 1)

  const COLS = grid?.cols || 10
  const ROWS = grid?.rows || 10

  if (camLoad) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>🌡️ Detection Heatmap</h2>
        <div style={{ flex: 1 }} />
        {/* Camera selector */}
        {cameras.length > 0 ? (
          <select
            className="input"
            style={{ width: 200 }}
            value={camId || ''}
            onChange={e => setCamId(e.target.value)}
          >
            {cameras.map(c => (
              <option key={c.camera_id} value={c.camera_id}>
                {c.display_name || c.camera_id}
              </option>
            ))}
          </select>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No cameras available</span>
        )}
        <button className="btn btn-secondary btn-sm" onClick={fetchHeatmap}>↺ Refresh</button>
      </div>

      {/* Grid */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 20,
      }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
            <div className="spinner" />
          </div>
        )}

        {!loading && error && (
          <div className="error-state">
            <div className="error-state-title">Failed to load heatmap</div>
            <div className="error-state-msg">{error}</div>
            <button className="btn btn-secondary btn-sm" onClick={fetchHeatmap}>↺ Retry</button>
          </div>
        )}

        {!loading && !error && (
          <>
            {cells.length === 0 ? (
              <>
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: 16, fontSize: 14 }}>
                  No detection data for this camera
                </p>
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: 20, fontSize: 12 }}>
                  Heatmap will populate as detections occur
                </p>
                {/* Empty 10×10 grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(10, 1fr)`,
                  gap: 2,
                }}>
                  {Array.from({ length: 100 }).map((_, i) => (
                    <div key={i} style={{
                      aspectRatio: '1',
                      background: 'var(--bg-elevated)',
                      borderRadius: 3,
                      border: '1px solid var(--border)',
                    }} />
                  ))}
                </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${COLS}, 1fr)`,
                    gap: 3,
                    position: 'relative',
                  }}
                  onMouseLeave={() => setTooltip(null)}
                >
                  {cells.map((cell, i) => {
                    const count = cell.count ?? 0
                    const col   = i % COLS
                    const row   = Math.floor(i / COLS)
                    return (
                      <div
                        key={i}
                        onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, count, cls: cell.top_class || '', col, row })}
                        style={{
                          aspectRatio: '1',
                          background: cellColor(count, maxCount),
                          borderRadius: 3,
                          border: '1px solid rgba(48, 54, 61, 0.6)',
                          cursor: count > 0 ? 'pointer' : 'default',
                          transition: 'opacity 0.15s',
                        }}
                      />
                    )
                  })}
                </div>

                {/* Tooltip */}
                {tooltip && (
                  <div style={{
                    position: 'fixed',
                    left: tooltip.x + 12,
                    top: tooltip.y - 10,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    fontSize: 11,
                    color: 'var(--text-primary)',
                    pointerEvents: 'none',
                    zIndex: 9999,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>Zone [{tooltip.col},{tooltip.row}]</div>
                    <div>Detections: <span style={{ color: 'var(--accent-blue)', fontFamily: 'JetBrains Mono, monospace' }}>{tooltip.count}</span></div>
                    {tooltip.cls && <div style={{ color: 'var(--text-secondary)' }}>Top class: {tooltip.cls}</div>}
                  </div>
                )}
              </>
            )}

            {/* Color legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Low</span>
              {['#388bfd', '#7dbf6e', '#d29922', '#f85149'].map((c, i) => (
                <div key={i} style={{ width: 20, height: 10, background: c, borderRadius: 2, opacity: 0.8 }} />
              ))}
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>High</span>
              {cells.length > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
                  Max: {maxCount} detections
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
