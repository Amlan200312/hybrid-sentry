import { useState } from 'react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function ServoControl({ nodeId }) {
  const [pan, setPan]   = useState(90)
  const [tilt, setTilt] = useState(45)
  const [busy, setBusy] = useState(false)
  const token = sessionStorage.getItem('hs_token')

  function move() {
    setBusy(true)
    axios.post(`${API}/sensors/servo`, { node_id:nodeId, pan, tilt }, { headers:{ Authorization:`Bearer ${token}` } })
      .catch(()=>{}).finally(() => setBusy(false))
  }

  function preset(p, t) { setPan(p); setTilt(t) }

  return (
    <div className="military-card" style={{ padding:12 }}>
      <div style={{ fontFamily:'JetBrains Mono', fontSize:9, color:'#7aaa7a', letterSpacing:'0.1em', marginBottom:10 }}>SERVO CONTROL</div>

      {/* Presets */}
      <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap' }}>
        {[['FRONT',90,45],['LEFT',0,45],['RIGHT',180,45],['UP',90,10],['DOWN',90,80]].map(([l,p,t]) => (
          <button key={l} className="btn-military" style={{ padding:'4px 8px', fontSize:8 }} onClick={() => preset(p,t)}>{l}</button>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
        <div>
          <div style={{ fontFamily:'JetBrains Mono', fontSize:8, color:'#7aaa7a', marginBottom:4 }}>PAN: {pan}°</div>
          <input type="range" min="0" max="180" value={pan} onChange={e=>setPan(+e.target.value)} style={{ width:'100%', accentColor:'#39ff14' }} />
        </div>
        <div>
          <div style={{ fontFamily:'JetBrains Mono', fontSize:8, color:'#7aaa7a', marginBottom:4 }}>TILT: {tilt}°</div>
          <input type="range" min="0" max="90"  value={tilt} onChange={e=>setTilt(+e.target.value)} style={{ width:'100%', accentColor:'#39ff14' }} />
        </div>
      </div>

      <button className="btn-military" style={{ width:'100%', padding:'8px', opacity: busy?0.6:1 }} onClick={move} disabled={busy}>
        {busy ? '⟳ MOVING…' : '◎ EXECUTE MOVE'}
      </button>
    </div>
  )
}
