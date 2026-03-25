import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { authFetch } from '../utils/api'

// Fix Leaflet default icons
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
})

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

const ZONE_COLORS = {
  restricted: '#f85149',
  alert: '#d29922',
  safe: '#3fb950',
  perimeter: '#388bfd',
}

function getZoneColor(type) {
  return ZONE_COLORS[type] || '#8b949e'
}

// Extract center lat/lng from coordinates array
function zoneCenter(coords) {
  if (!coords || !coords.length) return null
  const c = coords[0]
  if (c && c.lat !== undefined) return [c.lat, c.lng]
  return null
}

export default function GPSMapPage() {
  const [recorders, setRecorders] = useState([])
  const [weather, setWeather]     = useState(null)
  const [loading, setLoading]     = useState(true)
  const [mapRef, setMapRef]       = useState(null)

  const [zones, setZones]           = useState([])
  const [zonesLoading, setZonesLoading] = useState(true)
  const [showAddZone, setShowAddZone]  = useState(false)
  const [newZone, setNewZone] = useState({ zone_name: '', zone_type: 'restricted', lat: '', lng: '', radius: 200 })
  const [addingZone, setAddingZone] = useState(false)
  const [userRole, setUserRole] = useState(null)

  useEffect(() => {
    const token = sessionStorage.getItem('hs_token')
    const hdrs  = token ? { Authorization: `Bearer ${token}` } : {}
    Promise.all([
      fetch(`http://localhost:8000/api/recorders`, { headers: hdrs, credentials: 'include' })
        .then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`http://localhost:8000/api/weather`, { headers: hdrs, credentials: 'include' })
        .then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([recs, w]) => {
      const list = Array.isArray(recs) ? recs : (recs.recorders || [])
      setRecorders(list)
      setWeather(w)
      setLoading(false)
    })

    // Get current user role
    authFetch('/api/auth/me').then(r => r?.json()).then(me => {
      if (me?.role) setUserRole(me.role)
    }).catch(() => {})

    fetchZones()
  }, [])

  const fetchZones = () => {
    setZonesLoading(true)
    authFetch('/api/zones').then(r => r?.json()).then(data => {
      setZones(Array.isArray(data) ? data : [])
      setZonesLoading(false)
    }).catch(() => setZonesLoading(false))
  }

  const handleAddZone = async () => {
    if (!newZone.zone_name || !newZone.lat || !newZone.lng) return
    setAddingZone(true)
    const lat = parseFloat(newZone.lat)
    const lng = parseFloat(newZone.lng)
    const coords = [{ lat, lng }]
    await authFetch('/api/zones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        zone_name: newZone.zone_name,
        zone_type: newZone.zone_type,
        coordinates: coords,
        camera_id: 'GPS',
      }),
    }).catch(() => {})
    setAddingZone(false)
    setShowAddZone(false)
    setNewZone({ zone_name: '', zone_type: 'restricted', lat: '', lng: '', radius: 200 })
    fetchZones()
  }

  const handleDeleteZone = async (id) => {
    await authFetch(`/api/zones/${id}`, { method: 'DELETE' }).catch(() => {})
    fetchZones()
  }

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
            {/* Recorder markers */}
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
            {/* Zone circles */}
            {zones.map(zone => {
              const center = zoneCenter(zone.coordinates)
              if (!center) return null
              const color = getZoneColor(zone.zone_type)
              return (
                <Circle
                  key={zone.id}
                  center={center}
                  radius={300}
                  pathOptions={{ color, fillColor: color, fillOpacity: 0.15, weight: 2 }}
                >
                  <Popup>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12 }}>
                      <strong>{zone.zone_name}</strong><br />
                      Type: <span style={{ color }}>{zone.zone_type}</span><br />
                      Created by: {zone.created_by}
                    </div>
                  </Popup>
                </Circle>
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
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>No recorders found</div>
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

        {/* GPS Zones */}
        <div className="panel">
          <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>GPS Zones</span>
            {userRole === 'admin' && (
              <button
                className="btn btn-secondary btn-xs"
                onClick={() => setShowAddZone(v => !v)}
              >
                {showAddZone ? '✕ Cancel' : '+ Add'}
              </button>
            )}
          </div>
          <div className="panel-body">
            {/* Add zone form (admin only) */}
            {showAddZone && userRole === 'admin' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12, padding: '8px', background: 'var(--bg-elevated)', borderRadius: 6 }}>
                <input
                  className="input-field"
                  placeholder="Zone name"
                  value={newZone.zone_name}
                  onChange={e => setNewZone(v => ({ ...v, zone_name: e.target.value }))}
                  style={{ fontSize: 11 }}
                />
                <select
                  className="input-field"
                  value={newZone.zone_type}
                  onChange={e => setNewZone(v => ({ ...v, zone_type: e.target.value }))}
                  style={{ fontSize: 11 }}
                >
                  <option value="restricted">Restricted</option>
                  <option value="alert">Alert</option>
                  <option value="safe">Safe</option>
                  <option value="perimeter">Perimeter</option>
                </select>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <input className="input-field" placeholder="Latitude" value={newZone.lat}
                    onChange={e => setNewZone(v => ({ ...v, lat: e.target.value }))} style={{ fontSize: 11 }} />
                  <input className="input-field" placeholder="Longitude" value={newZone.lng}
                    onChange={e => setNewZone(v => ({ ...v, lng: e.target.value }))} style={{ fontSize: 11 }} />
                </div>
                <button className="btn btn-primary btn-xs" onClick={handleAddZone} disabled={addingZone}>
                  {addingZone ? 'Saving...' : '✓ Create Zone'}
                </button>
              </div>
            )}

            {/* Zone list */}
            {zonesLoading ? (
              <div className="skeleton" style={{ height: 60 }} />
            ) : zones.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>
                No zones configured
              </div>
            ) : (
              zones.map(zone => {
                const color = getZoneColor(zone.zone_type)
                const center = zoneCenter(zone.coordinates)
                return (
                  <div key={zone.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0',
                    borderBottom: '1px solid var(--bg-elevated)', fontSize: 12,
                  }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{zone.zone_name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{zone.zone_type}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {center && mapRef && (
                        <button className="btn btn-ghost btn-xs" style={{ padding: '2px 5px', fontSize: 9 }}
                          onClick={() => mapRef.flyTo(center, 14)}>📍</button>
                      )}
                      {userRole === 'admin' && (
                        <button className="btn btn-ghost btn-xs" style={{ padding: '2px 5px', fontSize: 9, color: 'var(--accent-red)' }}
                          onClick={() => handleDeleteZone(zone.id)}>✕</button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
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
