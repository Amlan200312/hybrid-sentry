import { useState, useEffect, useRef } from 'react'
import { authFetch, authWS } from '../utils/api'

function LiveFeedsPage() {
  const [recorders, setRecorders] = useState([])
  const [selectedId, setSelectedId] = useState('CAM-01')
  const [loading, setLoading] = useState(true)
  const [nightVision, setNightVision] = useState(false)
  const [detections, setDetections] = useState([])
  const [streamError, setStreamError] = useState(false)
  const wsRef = useRef(null)
  const token = localStorage.getItem('token')

  useEffect(() => {
    authFetch('/api/recorders')
    .then(r => r ? r.json() : [])
    .then(data => {
      const list = Array.isArray(data) ? data : []
      setRecorders(list)
      if (list.length > 0) setSelectedId(list[0].id || 'CAM-01')
      setLoading(false)
    })
    .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    const ws = authWS('/ws/detections')
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'detection') {
          setDetections(prev => [msg.data, ...prev].slice(0, 5))
        }
      } catch {}
    }
    wsRef.current = ws
    return () => ws.close()
  }, [])

  const streamUrl = `http://localhost:8000/api/stream/${selectedId}?token=${token}`

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
        <div className="stat-chip">
          <span style={{width:8,height:8,borderRadius:'50%',background:'#3fb950',display:'inline-block'}}/>
          <span className="value">LIVE</span>
        </div>
        <div className="stat-chip">Stream: <span className="value">{selectedId}</span></div>
        <div className="stat-chip" style={{cursor:'pointer'}} onClick={() => setNightVision(v => !v)}>
          Night Vision: <span className="value" style={{color:nightVision?'#388bfd':undefined}}>
            {nightVision ? 'ON' : 'OFF'}
          </span>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:16}}>
        <div className="panel">
          <div className="panel-header">
            <span style={{display:'flex',alignItems:'center',gap:8}}>
              <span className="live-dot"/>Primary Feed — {selectedId}
            </span>
          </div>
          <div>
            <div className="video-container" style={{aspectRatio:'16/9'}}>
              {!streamError ? (
                <img
                  key={selectedId}
                  src={streamUrl}
                  style={{
                    width:'100%',height:'100%',objectFit:'cover',display:'block',
                    filter: nightVision ? 'brightness(0.35) hue-rotate(115deg) saturate(3)' : 'none',
                    transition:'filter 0.3s'
                  }}
                  onError={() => setStreamError(true)}
                />
              ) : (
                <div className="video-offline">
                  <div style={{fontSize:32}}>📷</div>
                  <span>Stream unavailable</span>
                  <button onClick={() => setStreamError(false)}
                    style={{marginTop:8,padding:'4px 12px',background:'var(--bg-elevated)',
                    border:'1px solid var(--border)',borderRadius:6,
                    color:'var(--text-primary)',cursor:'pointer',fontSize:12}}>
                    Retry
                  </button>
                </div>
              )}
            </div>
            <div style={{padding:12}}>
              <div className="sub-panel">
                <div style={{fontSize:10,fontWeight:600,color:'var(--text-muted)',
                  textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>
                  Recent Detections
                </div>
                {detections.length === 0 ? (
                  <div style={{color:'var(--text-muted)',fontSize:12,textAlign:'center',padding:'8px 0'}}>
                    No detections yet
                  </div>
                ) : detections.map((d,i) => (
                  <div key={i} style={{display:'flex',alignItems:'center',gap:8,
                    padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:12}}>
                    <span style={{width:8,height:8,borderRadius:'50%',flexShrink:0,
                      background:d.label==='person'?'#388bfd':d.label==='vehicle'?'#d29922':'#f85149'}}/>
                    <span>{d.label}</span>
                    <span style={{color:'var(--text-muted)',fontSize:11}}>{Math.round((d.confidence||0)*100)}%</span>
                    <span style={{color:'var(--text-muted)',fontSize:10,marginLeft:'auto'}}>
                      {d.timestamp ? new Date(d.timestamp).toLocaleTimeString() : 'just now'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            Recorders <span className="badge badge-blue">{recorders.length}</span>
          </div>
          <div className="panel-body">
            {loading ? (
              <><div className="skeleton" style={{height:60,marginBottom:8}}/><div className="skeleton" style={{height:60}}/></>
            ) : recorders.length === 0 ? (
              <div style={{color:'var(--text-muted)',fontSize:12,textAlign:'center',padding:'16px 0'}}>
                No recorders found
              </div>
            ) : recorders.map(rec => (
              <div key={rec.id}
                className={`recorder-card ${selectedId===rec.id?'selected':''}`}
                onClick={() => { setSelectedId(rec.id); setStreamError(false) }}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <strong style={{fontSize:12}}>{rec.display_name||rec.id}</strong>
                  <span className={`badge ${rec.status==='online'?'badge-green':'badge-red'}`}>
                    {rec.status||'online'}
                  </span>
                </div>
                <div style={{fontSize:11,color:'var(--text-muted)',marginTop:3}}>
                  {rec.location||'No location'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
export default LiveFeedsPage
