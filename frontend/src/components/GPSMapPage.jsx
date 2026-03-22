import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

// Fix Leaflet default icons
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
})

// Custom colored icons
function coloredIcon(color) {
  return L.divIcon({
    html: `<div style="
      width:20px;height:20px;border-radius:50%;
      background:${color};border:2px solid rgba(255,255,255,0.5);
      box-shadow:0 0 6px ${color}88;
    "></div>`,
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -12],
  })
}

const API = 'http://localhost:8000'

export default function GPSMapPage() {
  const [recorders, setRecorders] = useState([])
  const [weather, setWeather]     = useState(null)
  const [loading, setLoading]     = useState(true)
  const [mapRef, setMapRef]       = useState(null)

  useEffect(() => {
    const token = sessionStorage.getItem('hs_token')
    const hdrs  = token ? { Authorization: `Bearer ${token}` } : {}
    Promise.all([
      fetch(`${API}/api/recorders`, { headers: hdrs, credentials: 'include' })
        .then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API}/api/weather`, { headers: hdrs, credentials: 'include' })
        .then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([recs, w]) => {
      const list = Array.isArray(recs) ? recs : (recs.recorders || [])
      setRecorders(list)
      setWeather(w)
      setLoading(false)
    })
  }, [])

  // India center
  const center = [20.5937, 78.9629]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 16 }}>
      {/* LEFT: Map */}
      <div className="panel" style={{ minHeight: 'calc(100vh - 150px)' }}>
        <div className="panel-header">
          <span>Live Map</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>OpenStreetMap</span>
        </div>
        <div style={{ flex: 1, position: 'relative', minHeight: 'calc(100vh - 200px)' }}>
          <MapContainer
            center={center}
            zoom={5}
            style={{ height: '100%', width: '100%', background: 'var(--bg-base)' }}
            whenCreated={setMapRef}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; OpenStreetMap contributors'
            />
            {recorders.map(rec => {
              const lat = rec.latitude || rec.lat
              const lng = rec.longitude || rec.lng
              if (!lat || !lng) return null
              const status = rec.status || 'OFFLINE'
              const color = status === 'ONLINE' ? '#3fb950' : status === 'IDLE' ? '#8b949e' : '#f85149'
              return (
                <Marker
                  key={rec.id || rec.recorder_id}
                  position={[lat, lng]}
                  icon={coloredIcon(color)}
                >
                  <Popup>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, minWidth: 140 }}>
                      <strong>{rec.name || rec.recorder_name}</strong><br />
                      Status: <span style={{ color }}>{status}</span><br />
                      {rec.location && <>Zone: {rec.location}<br /></>}
                      Last seen: {rec.last_seen ? new Date(rec.last_seen).toLocaleTimeString() : '—'}
                    </div>
                  </Popup>
                </Marker>
              )
            })}
          </MapContainer>

          {/* Weather overlay */}
          {weather && (
            <div style={{
              position: 'absolute', top: 10, right: 10, zIndex: 1000,
              background: 'rgba(13,17,23,0.9)',
              border: '1px solid var(--border)',
              borderRadius: 6, padding: '8px 12px', fontSize: 11,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🌡️</span>
                <span style={{ color: 'var(--text-primary)' }}>{weather.temperature ?? '—'}°C</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                <span>💨</span>
                <span style={{ color: 'var(--text-muted)' }}>{weather.wind_speed ?? '—'} km/h {weather.wind_dir || ''}</span>
              </div>
              {weather.humidity != null && (
                <div style={{ color: 'var(--text-muted)', marginTop: 3 }}>💧 {weather.humidity}%</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
        {/* Recorder locations */}
        <div className="panel">
          <div className="panel-header">Recorder Locations</div>
          <div className="panel-body">
            {loading ? (
              <div className="skeleton" style={{ height: 80 }} />
            ) : recorders.length === 0 ? (
              <div className="empty-state" style={{ padding: '12px 0' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No recorders found</div>
              </div>
            ) : (
              recorders.map(rec => {
                const lat = rec.latitude || rec.lat
                const lng = rec.longitude || rec.lng
                const status = rec.status || 'OFFLINE'
                return (
                  <div key={rec.id || rec.recorder_id} style={{
                    padding: '8px 0', borderBottom: '1px solid var(--bg-elevated)', fontSize: 12,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontWeight: 500 }}>{rec.name || rec.recorder_name}</span>
                      <span className={`badge badge-${status === 'ONLINE' ? 'green' : 'muted'}`}>{status}</span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                      {lat && lng ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : 'No GPS data'}
                    </div>
                    {lat && lng && mapRef && (
                      <button
                        className="btn btn-ghost btn-xs"
                        style={{ marginTop: 4, padding: '2px 6px', fontSize: 10 }}
                        onClick={() => mapRef.flyTo([lat, lng], 14)}
                      >
                        📍 Center
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Base zones */}
        <div className="panel">
          <div className="panel-header">Base Zones</div>
          <div className="panel-body">
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>
              No zones configured
            </div>
            <button className="btn btn-secondary btn-xs btn-full" style={{ marginTop: 6 }}>
              + Add Zone
            </button>
          </div>
        </div>

        {/* Weather */}
        <div className="panel">
          <div className="panel-header">Weather</div>
          <div className="panel-body">
            {weather ? (
              <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Temperature</span>
                  <span>{weather.temperature ?? '—'}°C</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Wind</span>
                  <span>{weather.wind_speed ?? '—'} km/h</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Humidity</span>
                  <span>{weather.humidity ?? '—'}%</span>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>No weather data</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
