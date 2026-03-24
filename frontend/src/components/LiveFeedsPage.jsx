import { useState, useEffect, useRef } from 'react'
import { authFetch, authWS, getToken } from '../utils/api'
import { Maximize2, Bell, Radio, Video, Download, Camera } from 'lucide-react'

// Using the requirements from prompt
export default function LiveFeedsPage() {
  const [recorders, setRecorders] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [streamError, setStreamError] = useState(false)
  const [nightVision, setNightVision] = useState(false)
  const [detections, setDetections] = useState([])
  const [liveBoxes, setLiveBoxes] = useState([])
  
  const wsRef = useRef(null)
  const boxTimerRef = useRef(null)

  // Fetch recorders on mount
  useEffect(() => {
    authFetch('/api/users?role=recorder')
      .then(r => r?.json())
      .then(data => {
        const list = Array.isArray(data) ? data : []
        setRecorders(list)
        if (list.length > 0 && !selectedId) {
          setSelectedId(list[0].username || list[0].id)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))

    // Fetch initial detections
    authFetch('/api/detections?limit=5')
      .then(r => r?.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : (data?.items || data?.detections || [])
        setDetections(arr.slice(0, 5))
      }).catch(()=>{})
  }, []) // eslint-disable-line

  // WebSocket for detections and boxes
  useEffect(() => {
    const ws = authWS('/ws/detections')
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'detection') {
          setDetections(prev => [msg.data, ...prev].slice(0, 5))
          if (msg.data.boxes) {
            setLiveBoxes(msg.data.boxes)
            clearTimeout(boxTimerRef.current)
            boxTimerRef.current = setTimeout(() => setLiveBoxes([]), 4000)
          }
        }
      } catch (err) {}
    }
    wsRef.current = ws
    return () => {
      ws.close()
      clearTimeout(boxTimerRef.current)
    }
  }, [])

  const selectedRecorder = recorders.find(r => (r.username || r.id) === selectedId) || null
  const isOnline = selectedRecorder?.status === 'online'

  async function toggleNightVision() {
    const newVal = !nightVision
    setNightVision(newVal)
    if (selectedId) {
      await authFetch(`/api/recorders/${selectedId}/night_vision`, {
        method: 'POST',
        body: JSON.stringify({ enabled: newVal })
      }).catch(()=>{})
    }
  }

  const broadcastBroadcast = () => {
    const msg = window.prompt("Enter broadcast message:")
    if (msg) {
      // Implement broadcast
      authFetch('/api/alerts', { method: 'POST', body: JSON.stringify({ type: 'broadcast', message: msg }) }).catch(()=>{})
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* ROW 1: STATS STRIP */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {loading ? (
          Array.from({length:5}).map((_,i)=><div key={i} className="skeleton" style={{width: 100, height: 28, borderRadius: 14}}/>)
        ) : (
          <>
            <div className="stat-chip" style={{display:'flex', alignItems:'center', gap: '6px', background: 'var(--bg-elevated)', padding: '4px 12px', borderRadius: '14px', fontSize: '12px', border: '1px solid var(--border)'}}>
              <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
              <span style={{fontWeight: 600, color: isOnline ? 'var(--accent-green)' : 'var(--text-muted)'}}>{isOnline ? 'LIVE' : 'OFFLINE'}</span>
            </div>
            <div className="stat-chip" style={{display:'flex', alignItems:'center', gap: '6px', background: 'var(--bg-elevated)', padding: '4px 12px', borderRadius: '14px', fontSize: '12px', border: '1px solid var(--border)'}}>
              FPS: {selectedRecorder?.fps || '--'}
            </div>
            <div className="stat-chip" style={{display:'flex', alignItems:'center', gap: '6px', background: 'var(--bg-elevated)', padding: '4px 12px', borderRadius: '14px', fontSize: '12px', border: '1px solid var(--border)'}}>
              WiFi: {selectedRecorder?.wifi_strength || '--'} dBm
            </div>
            <div className="stat-chip" style={{display:'flex', alignItems:'center', gap: '6px', background: 'var(--bg-elevated)', padding: '4px 12px', borderRadius: '14px', fontSize: '12px', border: '1px solid var(--border)'}}>
              Battery: {selectedRecorder?.battery || '--'}%
            </div>
            <div className="stat-chip" onClick={toggleNightVision} style={{display:'flex', alignItems:'center', gap: '6px', background: 'var(--bg-elevated)', padding: '4px 12px', borderRadius: '14px', fontSize: '12px', border: nightVision ? '1px solid var(--accent-blue)' : '1px solid var(--border)', cursor: 'pointer'}}>
              Night Vision: <span style={{color: nightVision ? 'var(--accent-blue)' : 'inherit'}}>{nightVision ? 'ON' : 'OFF'}</span>
            </div>
          </>
        )}
      </div>

      {/* ROW 2: SPLIT PANEL */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
        
        {/* LEFT PANEL */}
        <div className="panel">
          <div className="panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`status-dot ${isOnline ? 'online' : 'error'}`} />
              {selectedRecorder?.display_name || selectedId || 'No recorder'}
              <span className={`badge ${isOnline ? 'badge-green' : 'badge-red'}`} style={{marginLeft:'8px'}}>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button className="btn btn-sm btn-secondary" onClick={toggleNightVision}>NV {nightVision ? 'ON' : 'OFF'}</button>
              <button className="btn btn-sm btn-ghost" style={{padding: '4px'}}><Maximize2 size={14}/></button>
            </div>
          </div>
          
          <div className="panel-body" style={{ padding: 0, position: 'relative' }}>
            <div className="video-container" style={{ aspectRatio: '16/9', position: 'relative', background: 'black', overflow: 'hidden' }}>
              {isOnline && !streamError ? (
                <img
                  key={selectedId}
                  src={`http://localhost:8000/stream/${selectedId}?token=${getToken()}`}
                  style={{
                    width:'100%', height:'100%', objectFit:'cover', display:'block',
                    filter: nightVision ? 'brightness(0.35) hue-rotate(115deg) saturate(3) contrast(1.2)' : 'none',
                    transition: 'filter 0.4s ease'
                  }}
                  onError={() => setStreamError(true)}
                />
              ) : (
                <div className="video-offline" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                  <Camera size={32} style={{ opacity: 0.5, marginBottom: '8px' }} />
                  <span>Stream unavailable</span>
                  <button className="btn btn-secondary btn-sm" style={{marginTop:'12px'}} onClick={() => setStreamError(false)}>Retry</button>
                </div>
              )}

              {/* BOUNDING BOXES */}
              {liveBoxes.map((box, i) => {
                const color = box.label === 'person' ? '#388bfd' : box.label === 'vehicle' ? '#d29922' : '#f85149'
                return (
                  <div key={i} style={{
                    position: 'absolute',
                    left: box.x * 100 + '%',
                    top: box.y * 100 + '%',
                    width: box.w * 100 + '%',
                    height: box.h * 100 + '%',
                    border: `2px solid ${color}`,
                    borderRadius: '3px', boxSizing: 'border-box',
                    pointerEvents: 'none'
                  }}>
                    <span style={{
                      position: 'absolute', top: '-18px', left: '-2px',
                      background: color, color: 'white', fontSize: '9px', fontWeight: 700,
                      padding: '1px 4px', borderRadius: '2px', whiteSpace: 'nowrap'
                    }}>
                      {box.label} {Math.round((box.confidence||0)*100)}%
                    </span>
                  </div>
                )
              })}

              {/* OVERLAY */}
              <div className="video-overlay" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ color: 'white', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600 }}>{selectedRecorder?.location || 'Unknown Location'}</div>
                  <div style={{ fontSize: '10px', opacity: 0.8 }}>{selectedRecorder?.username || selectedId}</div>
                </div>
                {selectedRecorder?.fps && (
                  <div style={{ color: '#00ff00', fontFamily: 'monospace', fontSize: '12px', textShadow: '0 1px 2px rgba(0,0,0,0.8)', background: 'rgba(0,0,0,0.4)', padding: '2px 6px', borderRadius: '4px' }}>
                    {selectedRecorder.fps} FPS
                  </div>
                )}
              </div>
            </div>
            
            <div className="sub-panel" style={{ margin: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span className="sub-panel-title" style={{ margin: 0 }}>Recent Detections</span>
                <span className="badge badge-muted">{detections.length}</span>
              </div>
              
              {loading && detections.length === 0 ? (
                Array.from({length:3}).map((_,i) => <div key={i} className="skeleton-line" style={{marginBottom: '8px'}} />)
              ) : detections.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', padding: '16px 0' }}>No detections yet</div>
              ) : (
                detections.map((d, i) => {
                  const color = d.label === 'person' ? '#388bfd' : d.label === 'vehicle' ? '#d29922' : '#f85149'
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: i < detections.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
                      <span style={{ fontSize: '12px', textTransform: 'capitalize' }}>{d.label}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{Math.round((d.confidence||0)*100)}%</span>
                      <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)' }}>
                        {d.timestamp ? new Date(d.timestamp).toLocaleTimeString() : 'just now'}
                      </span>
                      <button className="btn btn-xs btn-secondary" style={{ marginLeft: '8px' }}>Verify</button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL - Recorders */}
        <div className="panel">
          <div className="panel-header">
            Recorders <span className="badge badge-blue">{recorders.length}</span>
          </div>
          <div className="panel-body-scroll" style={{ maxHeight: 'fit-content' }}>
            {loading ? (
              Array.from({length: 4}).map((_, i) => <div key={i} className="skeleton" style={{ height: 60, marginBottom: '8px' }} />)
            ) : recorders.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', padding: '24px 0' }}>No recorders assigned</div>
            ) : (
              recorders.map(rec => {
                const id = rec.username || rec.id
                const online = rec.status === 'online'
                return (
                  <div key={id} onClick={() => { setSelectedId(id); setStreamError(false) }} 
                       style={{ padding: '10px', borderRadius: '6px', border: `1px solid ${selectedId === id ? 'var(--accent-blue)' : 'var(--border)'}`, background: selectedId === id ? 'rgba(56,139,253,0.05)' : 'var(--bg-elevated)', marginBottom: '8px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: selectedId === id ? 'var(--accent-blue)' : 'var(--text-primary)' }}>{rec.display_name || id}</span>
                      <span className={`badge ${online ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '9px' }}>{online ? 'ONLINE' : 'OFFLINE'}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{rec.location || 'Unknown location'}</div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px', fontSize: '10px', color: 'var(--text-secondary)' }}>
                      <span>🔋 {rec.battery || '--'}%</span>
                      <span>📶 {rec.wifi_strength || '--'}dBm</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* ROW 3: ALL FEEDS & QUICK ACTIONS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        
        {/* All Feeds */}
        <div className="panel">
          <div className="panel-header">All Feeds <span className="badge badge-muted">{recorders.length}</span></div>
          <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
            {recorders.map(rec => {
              const id = rec.username || rec.id
              const online = rec.status === 'online'
              return (
                <div key={id} onClick={() => setSelectedId(id)} style={{ border: `1px solid ${selectedId === id ? 'var(--accent-blue)' : 'var(--border)'}`, borderRadius: '6px', overflow: 'hidden', cursor: 'pointer' }}>
                  <div style={{ aspectRatio: '16/9', background: 'black', position: 'relative' }}>
                    {online ? (
                      <img src={`http://localhost:8000/stream/${id}?token=${getToken()}`} style={{width:'100%', height:'100%', objectFit:'cover'}} onError={(e) => {e.target.style.display='none'; e.target.nextSibling.style.display='flex'}} />
                    ) : null}
                    <div style={{ display: online ? 'none' : 'flex', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                      <Camera size={16} />
                    </div>
                  </div>
                  <div style={{ padding: '5px 8px', background: 'var(--bg-elevated)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600 }}>{rec.display_name || id}</span>
                    <span className={`status-dot ${online ? 'online' : 'error'}`} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="panel">
          <div className="panel-header">Quick Actions</div>
          <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', alignContent: 'start' }}>
            <button className="btn btn-secondary" style={{ display: 'flex', flexDirection: 'column', padding: '16px', gap: '8px', height: 'auto' }} onClick={() => authFetch('/api/alerts', {method:'POST', body:JSON.stringify({type:'broadcast', message:'Alert from monitor'})})}>
              <Bell size={20} color="var(--accent-red)" />
              <span>Alert All</span>
            </button>
            <button className="btn btn-secondary" style={{ display: 'flex', flexDirection: 'column', padding: '16px', gap: '8px', height: 'auto' }} onClick={broadcastBroadcast}>
              <Radio size={20} color="var(--accent-blue)" />
              <span>Broadcast</span>
            </button>
            <button className="btn btn-secondary" style={{ display: 'flex', flexDirection: 'column', padding: '16px', gap: '8px', height: 'auto' }} onClick={() => authFetch('/api/recording/start_all', {method:'POST'})}>
              <Video size={20} color="var(--accent-green)" />
              <span>Record All</span>
            </button>
            <button className="btn btn-secondary" style={{ display: 'flex', flexDirection: 'column', padding: '16px', gap: '8px', height: 'auto' }} onClick={() => window.location.href = `http://localhost:8000/api/detections/export?token=${getToken()}`}>
              <Download size={20} color="var(--text-primary)" />
              <span>Export Events</span>
            </button>
          </div>
        </div>
      </div>
      
    </div>
  )
}
