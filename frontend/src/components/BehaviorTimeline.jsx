/**
 * BehaviorTimeline — horizontal timeline of detected behaviors for a tracked object.
 * Props: { events: [{time, label, confidence, duration}] }
 */
export default function BehaviorTimeline({ events=[] }) {
  const COLORS = {
    'Running':   '#ff2020', 'Loitering': '#ffd700', 'Walking':   '#39ff14',
    'Standing':  '#00bfff', 'Crouching': '#ffd700', 'default':   '#7aaa7a'
  }

  return (
    <div style={{ fontFamily:'JetBrains Mono', fontSize:9 }}>
      <div style={{ color:'#7aaa7a', letterSpacing:'0.1em', marginBottom:8 }}>BEHAVIOR TIMELINE</div>
      {events.length === 0 ? (
        <div style={{ color:'#3a5a3a' }}>NO EVENTS</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
          {events.map((ev, i) => {
            const c = COLORS[ev.label] || COLORS.default
            return (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ color:'#3a5a3a', width:55, flexShrink:0 }}>{ev.time}</span>
                <div style={{
                  flex: ev.duration || 1, height:14, background:c,
                  opacity:0.7, borderRadius:2, minWidth:12, maxWidth:120,
                  display:'flex', alignItems:'center', padding:'0 4px',
                  boxShadow:`0 0 6px ${c}60`,
                }}>
                  <span style={{ fontSize:7, color:'#0a0f0a', fontWeight:700, whiteSpace:'nowrap', overflow:'hidden' }}>{ev.label}</span>
                </div>
                <span style={{ color:c, width:30 }}>{Math.round((ev.confidence||0)*100)}%</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
