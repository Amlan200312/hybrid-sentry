import { useState, useRef, useEffect, useCallback } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

/* ── One-time style injection ───────────────────────────────── */
const FEED_STYLE_ID = 'hs-livefeed-styles'
if (!document.getElementById(FEED_STYLE_ID)) {
  const s = document.createElement('style')
  s.id = FEED_STYLE_ID
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap');
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
    .rec-blink { animation: blink 1.2s ease infinite; }
    .lf-btn:hover { filter: brightness(1.3); }
    .lf-tog:hover { background: #1a3a1a !important; }
    ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-track { background:#0a0f0a; }
    ::-webkit-scrollbar-thumb { background:#2a4a2a; border-radius:2px; }
  `
  document.head.appendChild(s)
}

const MONO = "'JetBrains Mono', monospace"
const CLR = {
  bg:     '#0a0f0a',
  bg2:    '#111811',
  border: '#1a2e1a',
  border2:'#2a4a2a',
  green:  '#39ff14',
  green2: '#3fb950',
  muted:  '#3a5a3a',
  text:   '#7aaa7a',
  amber:  '#ffd700',
  red:    '#ff4444',
  blue:   '#00bfff',
}

function mono(size, color = CLR.text, weight = 400) {
  return { fontFamily: MONO, fontSize: size, color, fontWeight: weight }
}

export default function LiveFeed({
  nodeId, label = 'NODE', displayName, positionName,
  large = false, selected = false, online = true,
  detectionCounts = {}, alerts = [], lastEvent = null,
  fps = 0, mode = 'FULL SCAN', nightMode = false,
  soundLevel = 0, servoInfo = null, isRpi = false,
}) {
  const [nvg, setNvg]               = useState(false)
  const [detections, setDetections] = useState([])
  const [frozen, setFrozen]         = useState(false)
  const [snapping, setSnapping]     = useState(false)
  const [snapMsg,  setSnapMsg]      = useState('')
  const [zoomed, setZoomed]         = useState(false)
  const [edges, setEdges]           = useState(false)
  const [enhanced, setEnhanced]     = useState(false)
  const [recording, setRecording]   = useState(false)
  const wsRef = useRef()

  const token     = sessionStorage.getItem('hs_token')
  const streamUrl = `${API_BASE}/feed/${nodeId}/stream?token=${token}`

  /* Detection WebSocket */
  useEffect(() => {
    if (!online || !large) return
    const ws = new WebSocket(`ws://localhost:8000/ws/detections/${nodeId}?token=${token}`)
    wsRef.current = ws
    ws.onmessage = e => { try { setDetections(JSON.parse(e.data)) } catch {} }
    ws.onerror = () => {}
    return () => ws.close()
  }, [nodeId, online, large])

  /* Screenshot */
  async function snap() {
    if (snapping) return
    setSnapping(true)
    try {
      const r = await fetch(`${API_BASE}/api/recordings/screenshots/${nodeId}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      })
      setSnapMsg(r.ok ? 'SAVED ✓' : 'FAIL ✕')
    } catch {
      setSnapMsg('ERR ✕')
    }
    setSnapping(false)
    setTimeout(() => setSnapMsg(''), 2000)
  }

  /* ── Thumbnail-only mode (small grid cell) ─────────────────── */
  if (!large) {
    if (!online) {
      return (
        <div style={{ width:'100%', height:'100%', minHeight:100, display:'flex',
          flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4 }}>
          <div style={mono(7, CLR.muted, 600)}>SIGNAL LOST</div>
          <div style={mono(9, '#1d2e1d')}>{displayName || label}</div>
        </div>
      )
    }
    return (
      <div style={{ position:'relative', width:'100%', height:'100%', minHeight:100, background:'#000', overflow:'hidden' }}>
        <img src={streamUrl} alt={label} style={{ width:'100%', height:'100%', objectFit:'cover',
          filter: nvg ? 'hue-rotate(100deg) saturate(2) brightness(0.8)' : 'none' }}
          onError={e => { e.target.style.display = 'none' }} />
        <div style={{ position:'absolute', bottom:0, left:0, right:0, background:'rgba(10,15,10,0.8)',
          display:'flex', alignItems:'center', padding:'2px 6px', gap:6, borderTop:`1px solid ${selected?CLR.green:CLR.border}` }}>
          <div style={{ width:5,height:5,borderRadius:'50%',background:CLR.green2,flexShrink:0 }} />
          <span style={mono(8, selected ? CLR.green : CLR.text)}>{displayName || label}</span>
        </div>
        {selected && <div style={{ position:'absolute', inset:0, border:`1px solid ${CLR.green}`,
          pointerEvents:'none', boxShadow:`inset 0 0 12px ${CLR.green}20` }} />}
      </div>
    )
  }

  /* ── Full 3-column large view ──────────────────────────────── */
  const counts = {
    '👤 Humans':   detectionCounts.humans   || 0,
    '🚗 Vehicles': detectionCounts.vehicles || 0,
    '🚁 Aerial':   detectionCounts.aerial   || 0,
    '🐾 Animals':  detectionCounts.animals  || 0,
    '❓ Unknown':  detectionCounts.unknown  || 0,
  }

  const videoFilter = [
    nvg       ? 'hue-rotate(100deg) saturate(2) brightness(0.8)' : '',
    edges     ? 'contrast(2) brightness(0.6)' : '',
    enhanced  ? 'contrast(1.2) brightness(1.1) saturate(1.2)' : '',
    zoomed    ? 'scale(1.5)' : '',
  ].filter(Boolean).join(' ')

  const colSt = {
    left: {
      width: '18%', minWidth: 140, background: CLR.bg2,
      borderRight: `1px solid ${CLR.border}`, padding: '10px 10px',
      display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto',
    },
    center: {
      flex: 1, position: 'relative', background: '#000', overflow: 'hidden',
    },
    right: {
      width: '18%', minWidth: 130, background: CLR.bg2,
      borderLeft: `1px solid ${CLR.border}`, padding: '10px 8px',
      display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto',
    },
  }

  const sec = { borderTop: `1px solid ${CLR.border}`, marginTop: 8, paddingTop: 8 }

  function BarChart({ value, max = 100, color = CLR.green }) {
    const pct = Math.min((value / max) * 100, 100)
    return (
      <div style={{ background: CLR.bg, borderRadius: 3, height: 8, overflow: 'hidden', marginTop: 4 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.3s', borderRadius: 3 }} />
      </div>
    )
  }

  const speedColor = (spd) => spd > 4 ? CLR.red : spd > 2 ? CLR.amber : CLR.green2
  const maxSpeed   = lastEvent?.speed_ms || 0

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: CLR.bg, fontFamily: MONO }}>

      {/* ── 3-column layout ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* LEFT PANEL */}
        <div style={colSt.left}>
          {/* Camera name */}
          <div style={{ ...mono(11, CLR.green, 600), marginBottom: 1, lineHeight: 1.3 }}>
            {displayName || label}
          </div>
          {positionName && <div style={mono(8, CLR.muted)}>{positionName}</div>}

          {/* Status */}
          <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:4, marginBottom:4 }}>
            {online
              ? <><div style={{ width:6,height:6,borderRadius:'50%',background:CLR.green }} /><span style={mono(8,CLR.green)}>LIVE</span></>
              : <><div style={{ width:6,height:6,borderRadius:'50%',background:CLR.red }} /><span style={mono(8,CLR.red)}>OFFLINE</span></>
            }
          </div>

          {/* Object counts */}
          <div style={sec}>
            {Object.entries(counts).map(([k, v]) => (
              <div key={k} style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                <span style={mono(9, CLR.muted)}>{k}</span>
                <span style={mono(9, v > 0 ? CLR.green : CLR.muted, v > 0 ? 600 : 400)}>{v}</span>
              </div>
            ))}
          </div>

          {/* Active alerts */}
          {alerts.length > 0 && (
            <div style={sec}>
              <div style={{ ...mono(8, CLR.amber, 600), marginBottom:4, letterSpacing:'0.06em' }}>ALERTS</div>
              <div style={{ maxHeight:80, overflowY:'auto' }}>
                {alerts.map((a, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:4, marginBottom:3 }}>
                    <div style={{ width:5,height:5,borderRadius:'50%',background:CLR.red,marginTop:3,flexShrink:0 }} />
                    <span style={mono(8, CLR.red)}>{a}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mode + FPS */}
          <div style={sec}>
            <div style={{ background:'#1a3a1a', borderRadius:4, padding:'2px 6px',
              display:'inline-block', ...mono(8, CLR.text, 600), marginBottom:4 }}>
              {mode}
            </div>
            <div style={mono(8, CLR.muted)}>FPS: <span style={{ color: CLR.text }}>{fps}</span></div>
            {nightMode && <div style={{ ...mono(8, CLR.amber), marginTop:2 }}>🌙 NIGHT MODE</div>}
          </div>
        </div>

        {/* CENTER: VIDEO */}
        <div style={colSt.center}>
          {!online ? (
            <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center',
              flexDirection:'column', gap:8 }}>
              <div style={mono(9, CLR.muted, 600)}>SIGNAL LOST</div>
              <div style={mono(11, '#1d2e1d')}>{displayName || label}</div>
            </div>
          ) : (
            <>
              <img src={streamUrl} alt={label}
                style={{ width:'100%', height:'100%', objectFit:'cover',
                  filter: videoFilter || 'none', display:'block',
                  transform: zoomed ? 'scale(1.5)' : 'none', transition:'transform 0.3s' }}
                onError={e => { e.target.style.opacity = '0.2' }} />

              {/* YOLO bounding boxes */}
              <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none' }}>
                {!frozen && detections.map((d, i) => (
                  <g key={i}>
                    <rect x={`${d.x1_pct}%`} y={`${d.y1_pct}%`}
                      width={`${d.x2_pct - d.x1_pct}%`} height={`${d.y2_pct - d.y1_pct}%`}
                      fill="none" stroke={CLR.green} strokeWidth="1.5" />
                    <text x={`${d.x1_pct + 0.5}%`} y={`${d.y1_pct + 2.2}%`}
                      fill={CLR.green} fontSize="9" fontFamily={MONO}>
                      {d.label}|{Math.round(d.confidence * 100)}%{d.distance ? `|${d.distance}m` : ''}#{d.track_id || i}
                    </text>
                  </g>
                ))}
              </svg>

              {/* Bottom overlay */}
              <div style={{ position:'absolute', bottom:0, left:0, right:0,
                background:'rgba(10,15,10,0.82)', padding:'4px 10px',
                display:'flex', alignItems:'center', gap:10, borderTop:`1px solid ${CLR.border}` }}>
                {recording && <div className="rec-blink" style={{ ...mono(8, CLR.red, 600) }}>⏺ REC</div>}
                {frozen && <div style={mono(8, CLR.amber)}>❄ FROZEN</div>}
                <div style={mono(7, CLR.muted, 600)}>HYBRID SENTRY</div>
                {selected && <div style={{ marginLeft:'auto', ...mono(8, CLR.green) }}>● SELECTED</div>}
              </div>

              {/* Corner brackets */}
              {[['0,0','top:0,left:0'],['0,100','top:0,right:0'],['100,0','bottom:0,left:0'],['100,100','bottom:0,right:0']].map((_,i) => {
                const pos = i===0 ? {top:6,left:6} : i===1 ? {top:6,right:6} : i===2 ? {bottom:6,left:6} : {bottom:6,right:6}
                const bdr = i===0 ? {borderTop:`1px solid ${CLR.green}33`,borderLeft:`1px solid ${CLR.green}33`}
                  : i===1 ? {borderTop:`1px solid ${CLR.green}33`,borderRight:`1px solid ${CLR.green}33`}
                  : i===2 ? {borderBottom:`1px solid ${CLR.green}33`,borderLeft:`1px solid ${CLR.green}33`}
                  : {borderBottom:`1px solid ${CLR.green}33`,borderRight:`1px solid ${CLR.green}33`}
                return <div key={i} style={{ position:'absolute',width:18,height:18,...pos,...bdr,pointerEvents:'none' }} />
              })}
            </>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div style={colSt.right}>
          {/* Live count summary */}
          <div style={mono(9, CLR.muted, 600)}>LIVE COUNT</div>
          {[
            ['👤', counts['👤 Humans']],
            ['🚗', counts['🚗 Vehicles']],
            ['❓', counts['❓ Unknown']],
          ].map(([icon, v]) => (
            <div key={icon} style={{ display:'flex', justifyContent:'space-between', marginTop:2 }}>
              <span style={{ fontSize:12 }}>{icon}</span>
              <span style={mono(9, v > 0 ? CLR.green : CLR.muted, 600)}>{v}</span>
            </div>
          ))}

          {/* Last detection card */}
          {lastEvent && (
            <div style={{ ...sec }}>
              <div style={mono(8, CLR.muted, 600)}>LAST EVENT</div>
              {lastEvent.screenshot_path && (
                <img src={`${API_BASE}/media/${lastEvent.screenshot_path}`}
                  style={{ width:'100%', borderRadius:3, marginTop:4, marginBottom:4, maxHeight:55, objectFit:'cover' }}
                  onError={e => { e.target.style.display='none' }} />
              )}
              <div style={mono(9, CLR.text, 600)}>{lastEvent.display_label}</div>
              <div style={mono(8, CLR.muted)}>{Math.round((lastEvent.confidence||0)*100)}% · {lastEvent.time_ago || ''}</div>
            </div>
          )}

          {/* Speed bar */}
          <div style={sec}>
            <div style={mono(8, CLR.muted)}>MAX SPEED</div>
            <div style={{ ...mono(10, speedColor(maxSpeed), 600), marginTop:2 }}>{maxSpeed.toFixed(1)} m/s</div>
            <BarChart value={maxSpeed} max={8} color={speedColor(maxSpeed)} />
          </div>

          {/* Sound bar (RPi only) */}
          {isRpi && (
            <div style={sec}>
              <div style={mono(8, CLR.muted)}>SOUND LEVEL</div>
              <BarChart value={soundLevel} max={100} color={soundLevel > 70 ? CLR.red : CLR.green2} />
            </div>
          )}

          {/* Servo (RPi only) */}
          {isRpi && servoInfo && (
            <div style={sec}>
              <div style={mono(8, CLR.muted)}>SERVO</div>
              <div style={mono(8, CLR.text)}>Pan: {servoInfo.pan}°</div>
              <div style={mono(8, CLR.text)}>Tilt: {servoInfo.tilt}°</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Processing toggles ── */}
      <div style={{ borderTop:`1px solid ${CLR.border}`, padding:'5px 10px',
        display:'flex', gap:4, background: CLR.bg2, flexWrap:'wrap', alignItems:'center' }}>
        {[
          { lbl:'🌙 NIGHT',   active:nvg,       toggle:() => setNvg(v=>!v) },
          { lbl:'◻ EDGES',    active:edges,      toggle:() => setEdges(v=>!v) },
          { lbl:'🔆 ENHANCE', active:enhanced,   toggle:() => setEnhanced(v=>!v) },
          { lbl:'🔍 ZOOM',    active:zoomed,     toggle:() => setZoomed(v=>!v) },
          { lbl:'❄ FREEZE',  active:frozen,     toggle:() => setFrozen(v=>!v) },
        ].map(({ lbl, active, toggle }) => (
          <button key={lbl} className="lf-tog" onClick={toggle}
            style={{ background: active ? '#1a3a1a' : 'none', border:`1px solid ${active?CLR.green:CLR.border}`,
              color: active ? CLR.green : CLR.muted, borderRadius:4, padding:'2px 7px',
              fontSize:9, fontFamily:MONO, cursor:'pointer' }}>
            {lbl}
          </button>
        ))}
        <div style={{ marginLeft:'auto', display:'flex', gap:4 }}>
          <button className="lf-btn" onClick={() => setRecording(v=>!v)}
            style={{ background: recording ? '#2d0a0a' : CLR.bg, border:`1px solid ${recording?CLR.red:CLR.border}`,
              color: recording ? CLR.red : CLR.muted, borderRadius:4, padding:'2px 7px',
              fontSize:9, fontFamily:MONO, cursor:'pointer' }}>
            {recording ? '⏹ STOP' : '⏺ REC'}
          </button>
          <button className="lf-btn" onClick={snap} disabled={snapping}
            style={{ background:CLR.bg, border:`1px solid ${snapMsg ? CLR.green : CLR.border}`, color: snapMsg ? CLR.green : CLR.muted,
              borderRadius:4, padding:'2px 7px', fontSize:9, fontFamily:MONO, cursor:'pointer', minWidth:60 }}>
            {snapMsg || (snapping ? '⏳' : '📸 SNAP')}
          </button>
        </div>
      </div>
    </div>
  )
}
