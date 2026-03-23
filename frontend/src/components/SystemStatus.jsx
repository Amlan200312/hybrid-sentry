import { useState, useEffect } from 'react'
import { authFetch } from '../utils/api'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function SystemStatus() {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await authFetch('/api/system/stats')
        if (res && res.ok) {
          const data = await res.json()
          setStats(data)
        } else {
          setStats({ cpu:42, ram:61, disk:55, temp:48, uptime:'03:21:45', nodes_online:2 })
        }
      } catch (e) {
        setStats({ cpu:42, ram:61, disk:55, temp:48, uptime:'03:21:45', nodes_online:2 })
      }
    }
    fetchStats()
    const id = setInterval(fetchStats, 5000)
    return () => clearInterval(id)
  }, [])

  if (!stats) return null

  const bars = [
    { label:'CPU',  value:stats.cpu,  warn:80, danger:95 },
    { label:'RAM',  value:stats.ram,  warn:75, danger:90 },
    { label:'DISK', value:stats.disk, warn:80, danger:95 },
    { label:'TEMP', value:stats.temp, warn:70, danger:85 },
  ]

  return (
    <div style={{ padding:'10px 12px', borderBottom:'1px solid #1a2e1a' }}>
      <div style={{ fontFamily:'JetBrains Mono', fontSize:9, color:'#7aaa7a', letterSpacing:'0.1em', marginBottom:8 }}>SYSTEM STATUS</div>

      {/* Uptime + nodes */}
      <div style={{ display:'flex', gap:8, marginBottom:10 }}>
        <div style={{ flex:1 }}>
          <div className="hud-label">UPTIME</div>
          <div style={{ fontFamily:'JetBrains Mono', fontSize:12, color:'#39ff14', fontWeight:700, marginTop:2 }}>{stats.uptime}</div>
        </div>
        <div style={{ flex:1 }}>
          <div className="hud-label">NODES</div>
          <div style={{ fontFamily:'JetBrains Mono', fontSize:12, color:'#39ff14', fontWeight:700, marginTop:2 }}>{stats.nodes_online ?? '--'} ONLINE</div>
        </div>
      </div>

      {/* Resource bars */}
      {bars.map(b => {
        const color = b.value >= b.danger ? '#ff2020' : b.value >= b.warn ? '#ffd700' : '#39ff14'
        return (
          <div key={b.label} style={{ marginBottom:6 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
              <span style={{ fontFamily:'JetBrains Mono', fontSize:8, color:'#7aaa7a', letterSpacing:'0.1em' }}>{b.label}</span>
              <span style={{ fontFamily:'JetBrains Mono', fontSize:8, color }}>
                {typeof b.value==='number' ? `${Math.round(b.value)}%` : b.value}
              </span>
            </div>
            <div className="progress-bar-wrap">
              <div className={`progress-bar-fill ${b.value>=b.danger?'red':b.value>=b.warn?'yellow':''}`}
                style={{ width:`${Math.min(b.value,100)}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
