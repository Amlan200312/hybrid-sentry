/**
 * ObjectProfileCard — shows detailed info for a tracked object.
 * Props: { obj: { id, label, confidence, first_seen, last_seen, track_length, snapshot_url, behavior } }
 */
export default function ObjectProfileCard({ obj, onClose }) {
  if (!obj) return null
  const conf = Math.round((obj.confidence || 0) * 100)
  const duration = obj.last_seen && obj.first_seen
    ? `${Math.round((new Date(obj.last_seen)-new Date(obj.first_seen))/1000)}s`
    : '--'

  return (
    <div style={{
      background:'#111911', border:'1px solid #2a4a2a',
      padding:16, width:240, fontFamily:'JetBrains Mono', fontSize:10,
      position:'relative',
    }}>
      {onClose && (
        <button onClick={onClose} style={{ position:'absolute', top:8, right:8, background:'none', border:'none', color:'#7aaa7a', cursor:'pointer', fontSize:12 }}>✕</button>
      )}

      {/* Snapshot */}
      <div style={{ width:'100%', height:120, background:'#0a0f0a', border:'1px solid #1a2e1a', marginBottom:12, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
        {obj.snapshot_url
          ? <img src={obj.snapshot_url} alt={obj.label} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          : <span style={{ color:'#3a5a3a', fontSize:9 }}>NO SNAPSHOT</span>
        }
      </div>

      {/* Info rows */}
      {[
        ['TRK ID',    `#${obj.id}`],
        ['CLASS',     obj.label?.toUpperCase()],
        ['CONF',      `${conf}%`],
        ['TRACK',     `${obj.track_length || 0} frames`],
        ['DURATION',  duration],
        ['BEHAVIOR',  obj.behavior || 'UNKNOWN'],
      ].map(([label, value]) => (
        <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', borderBottom:'1px solid #111911' }}>
          <span style={{ color:'#7aaa7a', fontSize:8, letterSpacing:'0.08em' }}>{label}</span>
          <span style={{ color:'#e8f5e8', fontWeight:700 }}>{value}</span>
        </div>
      ))}
    </div>
  )
}
