import { useState, useEffect, useRef } from 'react'

export default function AcousticMonitor({ nodeId }) {
  const [level, setLevel]     = useState(0)
  const [history, setHistory] = useState(Array(60).fill(0))
  const [alert, setAlert]     = useState(false)
  const token = sessionStorage.getItem('hs_token')

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8000/ws/sensors?token=${token}`)
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data)
        const lvl = d.sound_level || 0
        setLevel(lvl)
        setHistory(prev => [...prev.slice(1), lvl])
        setAlert(lvl >= 75)
      } catch {}
    }
    ws.onerror = () => {}
    return () => ws.close()
  }, [nodeId])

  const svgH   = 60
  const svgW   = 300
  const pts    = history.map((v, i) => `${(i/59)*svgW},${svgH - (v/100)*svgH}`).join(' ')

  return (
    <div className="military-card" style={{ padding:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
        <span style={{ fontFamily:'JetBrains Mono', fontSize:9, color:'#7aaa7a', letterSpacing:'0.1em' }}>ACOUSTIC MONITOR</span>
        {alert && <span style={{ fontFamily:'JetBrains Mono', fontSize:9, color:'#ff2020', animation:'pulseDot 1s ease-in-out infinite' }}>⚠ LOUD</span>}
      </div>

      {/* Wave SVG */}
      <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ display:'block', marginBottom:6 }}>
        <polyline points={pts} fill="none" stroke="#39ff14" strokeWidth="1.5" />
        <polyline points={`0,${svgH} ${pts} ${svgW},${svgH}`} fill="rgba(57,255,20,0.08)" stroke="none" />
      </svg>

      <div style={{ display:'flex', justifyContent:'space-between' }}>
        <span style={{ fontFamily:'JetBrains Mono', fontSize:8, color:'#3a5a3a' }}>0 dB</span>
        <span style={{ fontFamily:'JetBrains Mono', fontSize:11, fontWeight:700, color: level>=75?'#ff2020':level>=50?'#ffd700':'#39ff14' }}>
          {Math.round(level)} dB
        </span>
        <span style={{ fontFamily:'JetBrains Mono', fontSize:8, color:'#3a5a3a' }}>100 dB</span>
      </div>
    </div>
  )
}
