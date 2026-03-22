import { useState, useEffect } from 'react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function SensorPanel() {
  const [data, setData] = useState({ sound_level:0, servo_pan:90, servo_tilt:45, motion:false })
  const [pan, setPan]   = useState(90)
  const [tilt, setTilt] = useState(45)
  const token = sessionStorage.getItem('hs_token')

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8000/ws/sensors?token=${token}`)
    ws.onmessage = (e) => { try { setData(JSON.parse(e.data)) } catch {} }
    ws.onerror = () => {}
    return () => ws.close()
  }, [])

  function moveServo() {
    axios.post(`${API}/sensors/servo`, { pan, tilt }, { headers:{ Authorization:`Bearer ${token}` } }).catch(() => {})
  }

  const bars = Array.from({length:20}).map((_, i) => {
    const threshold = (i / 20) * 100
    const active = data.sound_level >= threshold
    return { active, color: threshold < 60 ? '#39ff14' : threshold < 80 ? '#ffd700' : '#ff2020' }
  })

  return (
    <div>
      <div style={{ fontFamily:'JetBrains Mono', fontSize:11, color:'#7aaa7a', marginBottom:16, letterSpacing:'0.1em' }}>SENSOR PANEL</div>

      {/* Sound meter */}
      <div className="military-card" style={{ padding:'12px', marginBottom:12 }}>
        <div style={{ fontFamily:'JetBrains Mono', fontSize:9, color:'#7aaa7a', marginBottom:8 }}>ACOUSTIC LEVEL</div>
        <div style={{ display:'flex', gap:2, alignItems:'flex-end', height:40 }}>
          {bars.map((b,i) => (
            <div key={i} style={{
              flex:1, height:`${20 + i*1.5}px`,
              background: b.active ? b.color : '#1a2e1a',
              boxShadow: b.active ? `0 0 4px ${b.color}60` : 'none',
              transition:'background 0.1s',
            }} />
          ))}
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
          <span style={{ fontFamily:'JetBrains Mono', fontSize:8, color:'#3a5a3a' }}>0 dB</span>
          <span style={{ fontFamily:'JetBrains Mono', fontSize:10, color: data.sound_level>=80?'#ff2020':data.sound_level>=60?'#ffd700':'#39ff14', fontWeight:700 }}>
            {Math.round(data.sound_level)} dB
          </span>
          <span style={{ fontFamily:'JetBrains Mono', fontSize:8, color:'#3a5a3a' }}>100 dB</span>
        </div>
        {data.motion && (
          <div style={{ marginTop:8, fontFamily:'JetBrains Mono', fontSize:10, color:'#ff2020', textAlign:'center', animation:'pulseDot 1s ease-in-out infinite' }}>
            ⚠ MOTION DETECTED
          </div>
        )}
      </div>

      {/* Servo control */}
      <div className="military-card" style={{ padding:'12px' }}>
        <div style={{ fontFamily:'JetBrains Mono', fontSize:9, color:'#7aaa7a', marginBottom:10 }}>SERVO CONTROL</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:10 }}>
          <div>
            <div style={{ fontFamily:'JetBrains Mono', fontSize:8, color:'#7aaa7a', marginBottom:4 }}>PAN: {pan}°</div>
            <input type="range" min="0" max="180" value={pan} onChange={e => setPan(+e.target.value)}
              style={{ width:'100%', accentColor:'#39ff14' }} />
          </div>
          <div>
            <div style={{ fontFamily:'JetBrains Mono', fontSize:8, color:'#7aaa7a', marginBottom:4 }}>TILT: {tilt}°</div>
            <input type="range" min="0" max="90" value={tilt} onChange={e => setTilt(+e.target.value)}
              style={{ width:'100%', accentColor:'#39ff14' }} />
          </div>
        </div>
        <button className="btn-military" style={{ width:'100%', padding:'8px' }} onClick={moveServo}>
          ◎ MOVE SERVO
        </button>
        <div style={{ marginTop:6, display:'flex', gap:12 }}>
          <span style={{ fontFamily:'JetBrains Mono', fontSize:8, color:'#3a5a3a' }}>CUR PAN: {data.servo_pan}°</span>
          <span style={{ fontFamily:'JetBrains Mono', fontSize:8, color:'#3a5a3a' }}>CUR TILT: {data.servo_tilt}°</span>
        </div>
      </div>
    </div>
  )
}
