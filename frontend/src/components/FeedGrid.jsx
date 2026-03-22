import { useState, useEffect } from 'react'
import LiveFeed from './LiveFeed'

const API = 'http://localhost:8000'

/* ── Skeleton card ──────────────────────────────────────────── */
function FeedSkeleton() {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      overflow: 'hidden',
      minHeight: 260,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div className="skeleton" style={{ height: 200 }} />
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="skeleton skeleton-line" style={{ width: '60%' }} />
        <div className="skeleton skeleton-line" style={{ width: '40%' }} />
      </div>
    </div>
  )
}

export default function FeedGrid() {
  const [cameras, setCameras] = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [focused, setFocused] = useState(null) // camera_id of focused cam

  useEffect(() => {
    const token = sessionStorage.getItem('hs_token')
    fetch(`${API}/api/cameras`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        setCameras(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {[1, 2, 3].map(i => <FeedSkeleton key={i} />)}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="error-state" style={{ maxWidth: 360 }}>
          <div style={{ fontSize: 32 }}>📡</div>
          <div className="error-state-title">Could not load cameras</div>
          <div className="error-state-msg">{error}</div>
          <button className="btn btn-secondary btn-sm" onClick={() => window.location.reload()}>
            ↺ Retry
          </button>
        </div>
      </div>
    )
  }

  if (cameras.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="empty-state">
          <div className="empty-state-icon">📹</div>
          <div className="empty-state-title">No cameras configured</div>
          <div className="empty-state-sub">Add cameras in Admin → Camera Management to see live feeds here.</div>
        </div>
      </div>
    )
  }

  // If a camera is focused, show it large + grid of others
  const focusedCam  = focused ? cameras.find(c => c.camera_id === focused) : null
  const othersCams  = focused ? cameras.filter(c => c.camera_id !== focused) : cameras

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      {/* Focused camera — large view */}
      {focusedCam && (
        <div style={{ flex: 2, borderRight: '1px solid var(--border)', overflow: 'hidden', position: 'relative' }}>
          <LiveFeed
            key={focusedCam.camera_id}
            nodeId={focusedCam.camera_id}
            label={focusedCam.camera_id}
            displayName={focusedCam.display_name}
            positionName={focusedCam.position_name}
            online={focusedCam.is_online !== false}
            large={true}
            selected={true}
          />
          <button
            onClick={() => setFocused(null)}
            style={{
              position: 'absolute', top: 8, right: 8, zIndex: 10,
              background: 'rgba(0,0,0,0.7)', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', borderRadius: 4,
              padding: '3px 8px', fontSize: 11, cursor: 'pointer',
            }}
          >
            ← Back to grid
          </button>
        </div>
      )}

      {/* Grid of cameras (or all if no focus) */}
      <div style={{
        flex: focusedCam ? 1 : 'none',
        width: focusedCam ? undefined : '100%',
        overflowY: 'auto',
        padding: 12,
        display: focusedCam ? 'flex' : 'grid',
        flexDirection: focusedCam ? 'column' : undefined,
        gridTemplateColumns: focusedCam ? undefined : 'repeat(auto-fill, minmax(340px, 1fr))',
        gap: 12,
        alignContent: 'start',
      }}>
        {(focusedCam ? othersCams : cameras).map(cam => (
          <div
            key={cam.camera_id}
            style={{
              height: focusedCam ? 180 : 280,
              border: '1px solid var(--border)',
              borderRadius: 8,
              overflow: 'hidden',
              cursor: 'pointer',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
            onClick={() => setFocused(focused === cam.camera_id ? null : cam.camera_id)}
            title="Click to focus"
          >
            <LiveFeed
              nodeId={cam.camera_id}
              label={cam.camera_id}
              displayName={cam.display_name}
              positionName={cam.position_name}
              online={cam.is_online !== false}
              large={false}
              selected={false}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
