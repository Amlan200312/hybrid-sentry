import { useState, useEffect, useRef } from 'react'
import { authFetch, authWS, getUser, getToken } from '../../utils/api'

export default function RecorderLiveStreamPage({ isMobile }) {
  const [streamKey, setStreamKey] = useState(0)
  const [nv, setNv] = useState(false)
  const [streaming, setStreaming] = useState(true)
  const [detections, setDetections] = useState([])
  const [liveBoxes, setLiveBoxes] = useState([])
  const wsRef = useRef(null)
  const [streamStats] = useState({ fps: 24 })

  const user = getUser()
  const username = user?.display_name || user?.username || 'Operator'

  useEffect(() => {
    // Fetch initial night vision state from backend
    authFetch('/api/feeds/processing/CAM-01')
      .then(r => r?.json())
      .then(data => { if (data?.night_mode != null) setNv(data.night_mode) })
      .catch(() => {})

    try {
      wsRef.current = authWS('/ws/detections')
      wsRef.current.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'detection' && msg.detection) {
            const det = msg.detection
            setDetections(prev => [det, ...(prev || [])].slice(0, 20))
            setLiveBoxes(prev => [
              ...prev,
              { ...det, _id: det.id || (Date.now() + Math.random()), _time: Date.now() }
            ])
          }
        } catch {}
      }
    } catch {}
    return () => wsRef.current?.close()
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setStreamKey(prev => prev + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setLiveBoxes(prev => prev.filter(b => Date.now() - b._time < 4000))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const boxColor = (label) => {
    const l = (label || '').toLowerCase()
    if (l === 'person') return '#388bfd'
    if (l === 'vehicle') return '#d29922'
    return '#f85149'
  }

  const toggleStream = () => setStreaming(s => !s)

  const toggleNV = async () => {
    await authFetch(`/api/feeds/processing`, {
      method: 'POST',
      body: JSON.stringify({ camera_id: 'CAM-01', night: !nv })
    }).catch(()=>{})
    setNv(!nv)
  }

  const handleSnapshot = async () => authFetch('/api/recordings/CAM-01/snapshot', { method: 'POST' }).catch(()=>{})
  const handleAlert = async () => {
    await authFetch('/api/comms/messages', { method: 'POST', body: JSON.stringify({ content: 'ALERT from recorder', type: 'alert' }) }).catch(()=>{})
  }
  const handleLocation = async () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async pos => {
        const { latitude, longitude } = pos.coords
        await authFetch('/api/gps/positions', {
          method: 'POST',
          body: JSON.stringify({ latitude, longitude })
        }).catch(()=>{})
      })
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 0.8fr', gap: 12 }}>
      {/* LEFT PANEL */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', padding: 0 }}>
        <div className="panel-header" style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="live-dot" style={{ width: 8, height: 8 }} />
            <span style={{ fontWeight: 600 }}>CAM-01</span>
            <span className="badge badge-green">Connected</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-secondary" onClick={toggleNV}>
              {nv ? '🌙 NV ON' : 'NV OFF'}
            </button>
            <span className="badge badge-muted">1280x720</span>
          </div>
        </div>

        <div style={{ padding: 0 }}>
          <div style={{ position: 'relative', aspectRatio: '16/9', background: '#000', overflow: 'hidden' }}>
            {streaming ? (
              <img 
                key={streamKey}
                src={`http://localhost:8000/stream/CAM-01?token=${getToken()}`} 
                alt="Live Stream"
                style={{
                  width: '100%', height: '100%', objectFit: 'contain',
                  transition: 'filter 0.3s ease'
                }}
                onError={() => {
                  console.warn("Stream image error, retrying...");
                  setStreamKey(prev => prev + 1);
                }}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                Stream Paused
              </div>
            )}

            {streaming && liveBoxes.map(b => (
              <div key={b._id} style={{
                position: 'absolute',
                left: `${b.x}%`, top: `${b.y}%`,
                width: `${b.width}%`, height: `${b.height}%`,
                border: `2px solid ${boxColor(b.label)}`,
                borderRadius: 3,
                pointerEvents: 'none'
              }}>
                <div style={{
                  position: 'absolute', top: -20, left: -2,
                  background: boxColor(b.label), opacity: 0.9,
                  color: '#fff', fontSize: 10, fontWeight: 700,
                  padding: '1px 6px', borderRadius: 3, whiteSpace: 'nowrap'
                }}>
                  {b.label} {Math.round(b.confidence * 100)}%
                </div>
              </div>
            ))}

            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              padding: '20px 12px 10px',
              background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
              color: '#fff', fontSize: 12, fontFamily: 'monospace'
            }}>
              <div>
                Location: Sector 7G<br/>
                Opr: {username}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end', marginBottom: 4 }}>
                  {[1,2,3,4].map(i => <div key={i} style={{ width: 4, height: i*3+2, background: i===4?'#666':'#3fb950' }} />)}
                </div>
                FPS: {streamStats.fps}
              </div>
            </div>

            {nv && (
              <div style={{
                position: 'absolute', top: 12, left: 12,
                background: 'rgba(57, 255, 20, 0.2)', border: '1px solid #39ff14',
                color: '#39ff14', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12
              }}>
                🌙 NV ON
              </div>
            )}
          </div>

          <div style={{ padding: 8, display: 'flex', gap: 8 }}>
            <button 
              className={`btn ${streaming ? 'btn-danger' : 'btn-primary'}`}
              style={{ flex: 1, height: isMobile ? 54 : 40 }}
              onClick={toggleStream}
            >
              {streaming ? '■ Stop Streaming' : '▶ Start Streaming'}
            </button>
            <button 
              className={`btn ${nv ? 'btn-primary' : 'btn-secondary'}`}
              style={{ width: isMobile ? 120 : 100, height: isMobile ? 54 : 40 }}
              onClick={toggleNV}
            >
              🌙 NV {nv ? 'ON' : 'OFF'}
            </button>
          </div>

          <div style={{ padding: '0 8px 8px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className={`badge badge-${streaming?'green':'muted'}`}>
              <div className="live-dot" style={{ width: 6, height: 6, background: streaming ? '#39ff14' : '#8b949e' }} />
              {streaming ? 'LIVE' : 'IDLE'}
            </span>
            <span className="badge badge-muted" style={{ fontFamily: 'monospace' }}>FPS: 24</span>
            <span className="badge badge-muted" style={{ fontFamily: 'monospace' }}>Resolution: 1280x720</span>
            <span className="badge badge-muted" style={{ fontFamily: 'monospace' }}>Bitrate: 2.4 Mbps</span>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="panel-header">
            <span>Live Detections</span>
            <span className="badge badge-blue">{detections.length}</span>
          </div>
          <div className="panel-body" style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
            {detections.length === 0 ? (
              <div className="empty-state" style={{ padding: 20 }}>
                No detections yet — stream to start detecting
              </div>
            ) : (
              detections.map((d, i) => (
                <div key={d.id || i} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                  borderBottom: '1px solid var(--border)'
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: boxColor(d.label) }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{d.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{Math.round(d.confidence * 100)}% conf</div>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Just now</div>
                  {d.snapshot ? (
                    <img src={d.snapshot} alt="thumb" style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover' }} />
                  ) : (
                    <div style={{ 
                      width: 32, height: 32, borderRadius: 4, background: `${boxColor(d.label)}33`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: boxColor(d.label), fontSize: 14, fontWeight: 700
                    }}>
                      {(d.label || '?')[0].toUpperCase()}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">Quick Actions</div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="btn btn-secondary" style={{ width: '100%', height: isMobile ? 48 : 38 }} onClick={handleSnapshot}>
              📸 Take Snapshot
            </button>
            <button className="btn btn-secondary" style={{ width: '100%', height: isMobile ? 48 : 38 }} onClick={handleAlert}>
              🚨 Send Alert
            </button>
            <button className="btn btn-secondary" style={{ width: '100%', height: isMobile ? 48 : 38 }} onClick={handleLocation}>
              📍 Update Location
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
