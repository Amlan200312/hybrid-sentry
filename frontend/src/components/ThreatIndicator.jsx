const CONFIG = {
  GREEN:  { color:'#39ff14', label:'SECURE',    bg:'#001400' },
  YELLOW: { color:'#ffd700', label:'ELEVATED',  bg:'#1a1400' },
  RED:    { color:'#ff2020', label:'CRITICAL',  bg:'#1a0000' },
  BLACK:  { color:'#ff2020', label:'EMERGENCY', bg:'#0d0000' },
}

export default function ThreatIndicator({ level='GREEN' }) {
  const c = CONFIG[level] || CONFIG.GREEN
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, background:c.bg, padding:'2px 12px', borderRadius:2, border:`1px solid ${c.color}30` }}>
      <div style={{ width:10, height:10, borderRadius:'50%', background:c.color, boxShadow:`0 0 10px ${c.color}`, animation:'pulseDot 1.5s ease-in-out infinite' }} />
      <div>
        <div style={{ fontFamily:'JetBrains Mono', fontSize:9, color:c.color, fontWeight:700, letterSpacing:'0.12em', textShadow:`0 0 8px ${c.color}60` }}>
          THREAT: {c.label}
        </div>
      </div>
    </div>
  )
}
