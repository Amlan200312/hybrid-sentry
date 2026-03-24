import { useState, useEffect } from 'react'
import { authFetch, getUser } from '../utils/api'

export default function VerifyQueuePage() {
  const [items, setItems] = useState([])
  const [verifiedItems, setVerifiedItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingVerified, setLoadingVerified] = useState(true)

  const fetchPending = async () => {
    try {
      const res = await authFetch('/api/verify-queue')
      if (!res) return
      const data = await res.json()
      const arr = Array.isArray(data) ? data : (data?.items || data?.detections || data?.results || [])
      setItems(arr)
    } catch {} finally {
      setLoading(false)
    }
  }

  const fetchVerified = async () => {
    try {
      const res = await authFetch('/api/detections?verified=true&limit=20')
      if (!res) return
      const data = await res.json()
      const arr = Array.isArray(data) ? data : (data?.items || data?.detections || data?.results || [])
      setVerifiedItems(arr)
    } catch {} finally {
      setLoadingVerified(false)
    }
  }

  useEffect(() => {
    fetchPending()
    fetchVerified()
  }, []) // eslint-disable-line

  const verifyItem = async (id, verdict) => {
    // Optimistic update
    const item = items.find(i => i.id === id)
    if (item) {
      setItems(prev => prev.filter(i => i.id !== id))
      setVerifiedItems(prev => [{...item, verified: true, verification_result: verdict, updated_at: new Date().toISOString(), verifier: 'You'}, ...prev])
    }
    try {
      await authFetch(`/api/verify-queue/${item.queue_id || id}/action`, {
        method: 'POST',
        body: JSON.stringify({ action: 'confirm', user: getUser()?.username || '' })
      })
    } catch (e) {
      // If error, refresh
      fetchPending()
      fetchVerified()
    }
  }

  const getTimeAgo = (ts) => {
    if (!ts) return 'just now'
    const diff = Math.floor((new Date() - new Date(ts)) / 60000)
    if (diff < 1) return 'just now'
    if (diff < 60) return `${diff}m ago`
    return `${Math.floor(diff/60)}h ago`
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
      
      {/* LEFT PANEL */}
      <div className="panel">
        <div className="panel-header">
          Pending Verification
          <span className="badge badge-red">{loading ? '...' : items.length}</span>
        </div>
        <div className="panel-body-scroll">
          {loading ? (
            Array.from({length: 3}).map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: '12px', padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '8px', background: 'var(--bg-elevated)' }}>
                <div className="skeleton" style={{ width: '64px', height: '48px', borderRadius: '4px' }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton-line" style={{ width: '60%', marginBottom: '8px' }} />
                  <div className="skeleton-line" style={{ width: '40%' }} />
                </div>
              </div>
            ))
          ) : items.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', height: '100px', fontSize: '13px' }}>
              All clear — no pending verifications
            </div>
          ) : (
            items.map(item => {
              const color = item.label === 'person' ? 'blue' : item.label === 'vehicle' ? 'amber' : 'red'
              return (
                <div key={item.id} style={{ display: 'flex', gap: '12px', padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '8px', background: 'var(--bg-elevated)', animation: 'pageEnter 200ms ease both' }}>
                  
                  {/* Thumbnail */}
                  <div style={{ width: '64px', height: '48px', background: '#000', borderRadius: '4px', overflow: 'hidden', flexShrink: 0 }}>
                    <img 
                      src={`http://localhost:8000/api/snapshot/${item.id}`} 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.style.background = 'var(--bg-elevated)'; }}
                    />
                  </div>
                  
                  {/* Center Info */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span className={`badge badge-${color}`} style={{textTransform:'capitalize'}}>{item.label || 'Unknown'}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{Math.round((item.confidence||0)*100)}%</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {getTimeAgo(item.timestamp)} · {item.recorder_id || 'Unknown recorder'}
                    </div>
                    {item.location && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.location}</div>}
                  </div>
                  
                  {/* Right Buttons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'center' }}>
                    <button className="btn btn-sm" style={{ height: '26px', fontSize: '11px', padding: '0 8px', border: '1px solid var(--accent-green)', background: 'transparent', color: 'var(--accent-green)' }} onClick={() => verifyItem(item.id, 'person')}>
                      ✓ Person
                    </button>
                    <button className="btn btn-sm" style={{ height: '26px', fontSize: '11px', padding: '0 8px', border: '1px solid var(--accent-amber)', background: 'transparent', color: 'var(--accent-amber)' }} onClick={() => verifyItem(item.id, 'vehicle')}>
                      🚗 Vehicle
                    </button>
                    <button className="btn btn-sm" style={{ height: '26px', fontSize: '11px', padding: '0 8px', border: '1px solid var(--accent-red)', background: 'transparent', color: 'var(--accent-red)' }} onClick={() => verifyItem(item.id, 'false_alarm')}>
                      ✗ False Alarm
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="panel">
        <div className="panel-header">
          Already Verified Today
          <span className="badge badge-muted">{loadingVerified ? '...' : verifiedItems.length}</span>
        </div>
        <div className="panel-body-scroll">
          {loadingVerified ? (
            Array.from({length: 4}).map((_, i) => <div key={i} className="skeleton-line" style={{ height: '24px', marginBottom: '8px' }} />)
          ) : verifiedItems.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', height: '100px', fontSize: '13px' }}>
              No verified items yet
            </div>
          ) : (
            verifiedItems.map((item, i) => {
              const verdict = item.verification_result || item.verdict || item.label || 'unknown'
              const color = verdict === 'person' ? 'blue' : verdict === 'vehicle' ? 'amber' : 'red'
              const icon = verdict === 'person' ? '✓' : verdict === 'vehicle' ? '🚗' : '✗'
              return (
                <div key={item.id || i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {new Date(item.updated_at || item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                  <span className={`badge badge-${color}`} style={{textTransform:'capitalize'}}>{icon} {verdict}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>by {item.verifier || 'Operator'}</span>
                </div>
              )
            })
          )}
        </div>
      </div>

    </div>
  )
}
