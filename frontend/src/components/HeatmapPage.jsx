import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix icons
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow })

const API = 'http://localhost:8000'

/* Canvas heatmap layer using leaflet.heat if available, else simple circles */
function HeatLayer({ points }) {
  const map = useMap()
  const layerRef = useRef(null)

  useEffect(() => {
    if (!map || !points || points.length === 0) return
    // Remove old layer
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null }
    // Try leaflet.heat
    if (typeof window !== 'undefined' && window.L && window.L.heatLayer) {
      layerRef.current = window.L.heatLayer(points, { radius: 25, blur: 15, maxZoom: 17 }).addTo(map)
      return
    }
    // Fallback: canvas overlay
    const canvas = L.canvas({ padding: 0.5 })
    if (canvas.addTo) canvas.addTo(map)
    else {
      // Simple circle markers
      const layerGroup = L.layerGroup()
      points.slice(0, 200).forEach(([lat, lng, intensity = 0.5]) => {
        L.circleMarker([lat, lng], {
          radius: 8,
          fillColor: `rgba(248,81,73,${intensity})`,
          color: 'transparent',
          fillOpacity: 0.5,
        }).addTo(layerGroup)
      })
      layerGroup.addTo(map)
      layerRef.current = layerGroup
    }
    return () => {
      if (layerRef.current && map) {
        try { map.removeLayer(layerRef.current) } catch {}
        layerRef.current = null
      }
    }
  }, [map, points])

  return null
}

export default function HeatmapPage() {
  const [points, setPoints]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [timeRange, setTimeRange]   = useState('today')
  const [typeFilter, setTypeFilter] = useState('all')
  const [hotspots, setHotspots]     = useState([])

  function fetchData() {
    setLoading(true)
    const token = sessionStorage.getItem('hs_token')
    fetch(`${API}/api/detections?limit=500`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const list = d ? (Array.isArray(d) ? d : (d.detections || d.items || [])) : []
        const pts = list
          .filter(e => e.latitude && e.longitude)
          .filter(e => typeFilter === 'all' || (e.label || '').includes(typeFilter))
          .map(e => [e.latitude, e.longitude, e.confidence || 0.5])
        setPoints(pts)
        // Compute hotspots (cluster by proximity)
        setHotspots(list.filter(e => e.latitude).slice(0, 5))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [timeRange, typeFilter]) // eslint-disable-line

  // India center
  const center = [20.5937, 78.9629]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 16 }}>
      {/* LEFT: Heatmap */}
      <div className="panel" style={{ minHeight: 'calc(100vh - 150px)' }}>
        <div className="panel-header">
          <span>Detection Heatmap</span>
          {loading && <div className="spinner" style={{ width: 12, height: 12 }} />}
        </div>
        <div style={{ flex: 1, minHeight: 'calc(100vh - 200px)' }}>
          <MapContainer center={center} zoom={5} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; OpenStreetMap contributors' />
            <HeatLayer points={points} />
          </MapContainer>
        </div>
      </div>

      {/* RIGHT: Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
        <div className="panel">
          <div className="panel-header">Time Range</div>
          <div className="panel-body">
            {['today', 'week', 'month'].map(t => (
              <button
                key={t}
                className={`filter-pill ${timeRange === t ? 'active' : ''}`}
                style={{ marginRight: 6, marginBottom: 6 }}
                onClick={() => setTimeRange(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">Event Type</div>
          <div className="panel-body">
            {['all', 'person', 'vehicle', 'drone'].map(t => (
              <button
                key={t}
                className={`filter-pill ${typeFilter === t ? 'active' : ''}`}
                style={{ marginRight: 6, marginBottom: 6 }}
                onClick={() => setTypeFilter(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">Intensity Legend</div>
          <div className="panel-body">
            <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', marginBottom: 6 }}>
              {['#3fb950','#d29922','#f85149','#bc2f2a'].map(c => (
                <div key={c} style={{ flex: 1, background: c }} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
              <span>Low</span><span>High</span>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">Top Hotspots</div>
          <div className="panel-body">
            {hotspots.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {loading ? 'Loading…' : 'No location data available'}
              </div>
            ) : (
              hotspots.map((h, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 12 }}>
                  <span style={{ color: 'var(--accent-red)', fontWeight: 700, width: 16 }}>{i + 1}</span>
                  <div>
                    <div style={{ color: 'var(--text-primary)' }}>{h.location || `${h.latitude?.toFixed(3)}, ${h.longitude?.toFixed(3)}`}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{h.label || '—'}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
