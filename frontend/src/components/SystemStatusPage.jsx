import { useState, useEffect, useCallback } from 'react'

import { authFetch, authWS } from '../utils/api'

function StatusIndicator({ ok, label }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <div className={`status-dot ${ok ? 'online' : 'offline'}`} />
        <span style={{ fontSize: 11, color: ok ? 'var(--accent-green)' : 'var(--text-muted)' }}>
          {ok ? 'Online' : 'Offline'}
        </span>
      </div>
    </div>
  )
}

function MiniBar({ label, value, color = 'var(--accent-blue)' }) {
  const pct = Math.min(100, Math.max(0, value || 0))
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}>{pct.toFixed(0)}%</span>
      </div>
      <div style={{ height: 4, background: 'var(--bg-overlay)', borderRadius: 2 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 300ms' }} />
      </div>
    </div>
  )
}

export default function SystemStatusPage() {
  const [health, setHealth]         = useState(null)
  const [hardware, setHardware]     = useState(null)
  const [recorders, setRecorders]   = useState([])
  const [logs, setLogs]             = useState([])
  const [wsStatus, setWsStatus]     = useState('connecting')

  const fetchAll = useCallback(async () => {
    const [hRes, hwRes, rRes, lRes] = await Promise.all([
      authFetch('/api/system/info'),
      authFetch('/api/system/hardware'),
      authFetch('/api/users'),
      authFetch('/api/logs?limit=20')
    ])
    if (hRes) {
      const data = await hRes.json().catch(()=>null)
      // /api/system/info returns {platform, ai_loaded, org_name, camera_online, ...}
      // Add a pseudo status field for the health indicator
      if (data) setHealth({ ...data, status: 'ok' })
    }
    if (hwRes) setHardware(await hwRes.json().catch(()=>null))
    if (rRes) {
      const users = await rRes.json().catch(()=>[])
      const arr = Array.isArray(users) ? users : []
      // Filter only recorders for the "Active Recorders" panel
      const recs = arr.filter(u => u.role === 'recorder')
      setRecorders(recs.map(u => ({
        id: u.id,
        name: u.display_name || u.username,
        status: 'ONLINE',  // no real-time status; assume online if in user list
        cpu_pct: 0, memory_pct: 0, disk_pct: 0,
      })))
    }
    if (lRes) {
      const lg = await lRes.json().catch(()=>[])
      setLogs(Array.isArray(lg) ? lg : (lg?.logs || []))
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const id = setInterval(fetchAll, 10000)
    return () => clearInterval(id)
  }, [fetchAll])

  // Test WS connectivity
  useEffect(() => {
    let ws
    try {
      ws = authWS('/ws/detections')
      ws.onopen  = () => setWsStatus('connected')
      ws.onerror = () => setWsStatus('error')
      ws.onclose = () => setWsStatus('disconnected')
    } catch { setWsStatus('error') }
    return () => { try { ws?.close() } catch {} }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Fixed-height 3-col grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14,
        padding: 16, flex: 1, minHeight: 0, overflow: 'hidden',
      }}>

        {/* Panel 1: Backend Status */}
        <div className="panel" style={{ overflow: 'hidden' }}>
          <div className="panel-header">Backend Status</div>
          <div className="panel-body-scroll">
            <div className="sub-panel" style={{ marginBottom: 10 }}>
              <div className="sub-panel-title">API Health</div>
              <StatusIndicator ok={health?.status === 'ok' || health?.status === 'healthy'} label="REST API" />
              <StatusIndicator ok={wsStatus === 'connected'} label="WebSocket" />
            </div>
            <div className="sub-panel" style={{ marginBottom: 10 }}>
              <div className="sub-panel-title">Database</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>Size</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{health?.db_size || '—'}</span>
              </div>
            </div>
            <div className="sub-panel">
              <div className="sub-panel-title">System Info</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Version</span>
                  <span>{health?.version || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Platform</span>
                  <span>{health?.platform || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>YOLO</span>
                  <span style={{ color: health?.ai_loaded ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                    {health?.ai_loaded ? 'Loaded' : 'Not loaded'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Panel 2: Hardware Status */}
        <div className="panel" style={{ overflow: 'hidden' }}>
          <div className="panel-header">Hardware Status</div>
          <div className="panel-body-scroll">
            <div className="sub-panel" style={{ marginBottom: 10 }}>
              <div className="sub-panel-title">Servo (Pan / Tilt)</div>
              <div style={{ fontSize: 12, display: 'flex', gap: 16 }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Pan</span>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: 'var(--accent-blue)' }}>
                    {hardware?.servo?.pan ?? '—'}°
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Tilt</span>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: 'var(--accent-blue)' }}>
                    {hardware?.servo?.tilt ?? '—'}°
                  </div>
                </div>
              </div>
            </div>
            <div className="sub-panel" style={{ marginBottom: 10 }}>
              <div className="sub-panel-title">Sound Sensor (KY-038)</div>
              <StatusIndicator ok={hardware?.sound_sensor?.active} label="KY-038 Sound Sensor" />
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Last trigger: {hardware?.sound_sensor?.last_trigger
                  ? new Date(hardware.sound_sensor.last_trigger).toLocaleTimeString()
                  : '—'}
              </div>
            </div>
            <div className="sub-panel">
              <div className="sub-panel-title">GPIO Pins</div>
              {hardware?.gpio ? (
                Object.entries(hardware.gpio).map(([pin, val]) => (
                  <div key={pin} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: 'var(--text-muted)' }}>GPIO {pin}</span>
                    <span className={`badge badge-${val ? 'green' : 'muted'}`} style={{ fontSize: 9 }}>
                      {val ? 'HIGH' : 'LOW'}
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No GPIO data</div>
              )}
            </div>
          </div>
        </div>

        {/* Panel 3: Active Recorders */}
        <div className="panel" style={{ overflow: 'hidden' }}>
          <div className="panel-header">
            <span>Active Recorders</span>
            <span className="badge badge-muted">{recorders.length}</span>
          </div>
          <div className="panel-body-scroll">
            {recorders.length === 0 ? (
              <div className="empty-state" style={{ padding: '20px 0' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No recorders configured</div>
              </div>
            ) : (
              recorders.map(rec => (
                <div key={rec.id || rec.recorder_id} className="sub-panel" style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{rec.name || rec.recorder_name}</span>
                    <span className={`badge badge-${rec.status === 'ONLINE' ? 'green' : 'muted'}`}>
                      {rec.status || 'OFFLINE'}
                    </span>
                  </div>
                  <MiniBar label="CPU"    value={rec.cpu_pct}    color="var(--accent-blue)" />
                  <MiniBar label="Memory" value={rec.memory_pct} color="var(--accent-purple)" />
                  <MiniBar label="Disk"   value={rec.disk_pct}   color="var(--accent-amber)" />
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    WiFi: {rec.wifi_signal || '—'} · Battery: {rec.battery_pct != null ? `${rec.battery_pct}%` : '—'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom: Logs */}
      <div style={{ padding: '0 16px 16px', flexShrink: 0 }}>
        <div className="panel">
          <div className="panel-header">
            <span>Recent Errors / Logs</span>
            <button className="btn btn-ghost btn-xs" onClick={fetchAll}>↺ Refresh</button>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 180 }}>
            {logs.length === 0 ? (
              <div className="empty-state" style={{ padding: '12px 0' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No logs available</div>
              </div>
            ) : (
              logs.map((log, i) => {
                const ts = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''
                const isErr = (log.level || '').toLowerCase() === 'error'
                return (
                  <div key={i} style={{
                    padding: '4px 14px',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 11,
                    color: isErr ? 'var(--accent-red)' : 'var(--text-muted)',
                    borderBottom: '1px solid var(--bg-elevated)',
                    display: 'flex', gap: 10,
                  }}>
                    <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{ts}</span>
                    <span style={{ color: isErr ? 'var(--accent-red)' : 'var(--accent-amber)', flexShrink: 0 }}>
                      [{(log.level || 'INFO').toUpperCase()}]
                    </span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.message || log.text || String(log)}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
