import { useEffect, useRef, useState, useCallback } from 'react'
import {
  MapContainer, TileLayer, Marker, Popup, Circle, Polyline,
  useMap, useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

/* ── Fix leaflet icons ───────────────────────────────────────── */
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

/* ── Style injection ─────────────────────────────────────────── */
const STYLE_ID = 'gpsmap-styles'
if (!document.getElementById(STYLE_ID)) {
  const s = document.createElement('style')
  s.id = STYLE_ID
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    .leaflet-popup-content-wrapper { background:#161b22 !important; border:1px solid #30363d !important; color:#e6edf3 !important; border-radius:8px !important; }
    .leaflet-popup-tip { background:#161b22 !important; }
    .leaflet-popup-close-button { color:#8b949e !important; }
    .zone-panel { scrollbar-width:thin; scrollbar-color:#30363d #0d1117; }
    @keyframes fadeIn { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
    .zone-panel-anim { animation: fadeIn 0.25s ease; }
  `
  document.head.appendChild(s)
}

/* ── Zone type config ────────────────────────────────────────── */
const ZONE_TYPES = {
  BASE:      { color: '#388bfd', emoji: '🏛️', label: 'Base',      radius: 500 },
  POST:      { color: '#f85149', emoji: '🚩', label: 'Post',      radius: 100 },
  SEASIDE:   { color: '#00bfff', emoji: '⚓', label: 'Seaside',   radius: 200 },
  LIMA:      { color: '#ffd700', emoji: '📍', label: 'Lima',      radius: 200 },
  ROAD:      { color: '#3fb950', emoji: '🛣️', label: 'Road',      radius: 150 },
  PERIMETER: { color: '#ff6600', emoji: '🔶', label: 'Perimeter', radius: 800 },
  CUSTOM:    { color: '#8b949e', emoji: '📌', label: 'Custom',    radius: 200 },
}

const TYPE_OPTIONS = Object.keys(ZONE_TYPES)
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

/* ── Tile layers ─────────────────────────────────────────────── */
const TILES = {
  dark: {
    label: '🌙 Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attr: '© CARTO',
  },
  street: {
    label: '🗺️ Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr: '© OpenStreetMap',
  },
  satellite: {
    label: '🛰️ Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr: '© Esri',
  },
}

/* ── Custom icons ────────────────────────────────────────────── */
function svgIcon(fill, stroke, pulse = false) {
  return new L.DivIcon({
    className: '',
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
      ${pulse ? `<circle cx="11" cy="11" r="10" fill="${fill}" fill-opacity="0.25" stroke="${stroke}" stroke-width="1.5"/>` : ''}
      <circle cx="11" cy="11" r="5" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
    </svg>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -14],
  })
}

const RECORDER_COLORS = ['#3fb950', '#388bfd', '#ffd700', '#ff6ec7', '#00bfff', '#ff6600']

/* ── Click-to-place helper ───────────────────────────────────── */
function MapClickHandler({ active, onPlace }) {
  useMapEvents({
    click(e) {
      if (active) onPlace(e.latlng)
    },
  })
  return null
}

/* ── TileLayer switcher ──────────────────────────────────────── */
function TileSwitcher({ tileKey }) {
  const map = useMap()
  const tileRef = useRef(null)

  useEffect(() => {
    if (tileRef.current) map.removeLayer(tileRef.current)
    const t = TILES[tileKey]
    tileRef.current = L.tileLayer(t.url, { attribution: t.attr }).addTo(map)
    return () => { if (tileRef.current) map.removeLayer(tileRef.current) }
  }, [tileKey, map])

  return null
}

/* ── Main component ──────────────────────────────────────────── */
export default function GPSMap() {
  const role = sessionStorage.getItem('hs_role') || 'recorder'
  const isAdmin = role === 'admin'

  /* Map state */
  const [tileKey, setTileKey] = useState('dark')
  const [layers, setLayers] = useState({
    recorders: true, zones: true, detections: true, messages: true,
  })

  /* Recorder positions (WebSocket) */
  const [nodes, setNodes]   = useState([])
  const [tracks, setTracks] = useState({})

  /* Base zones */
  const [zones, setZones]   = useState([])

  /* Detection pins */
  const [detections, setDetections] = useState([])

  /* Field messages */
  const [messages, setMessages] = useState([])

  /* Zone panel */
  const [panelOpen, setPanelOpen] = useState(false)
  const [editZone, setEditZone] = useState(null)   // null = add, obj = edit
  const [formZone, setFormZone] = useState(blankForm())
  const [placing, setPlacing]   = useState(false)   // click-to-place mode
  const [saving, setSaving]     = useState(false)
  const [formErr, setFormErr]   = useState('')

  function blankForm() {
    return {
      zone_name: '', zone_type: 'POST', description: '',
      color_hex: '#388bfd', latitude: '', longitude: '', radius_meters: 200,
    }
  }

  /* ── Load zones ─────────────────────────────────────────────── */
  const loadZones = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/base-zones`, { credentials: 'include' })
      if (r.ok) setZones(await r.json())
    } catch {}
  }, [])

  /* ── Load recent detections ──────────────────────────────────── */
  const loadDetections = useCallback(async () => {
    try {
      const token = sessionStorage.getItem('hs_token')
      const r = await fetch(`${API}/api/detections/events?limit=50&has_gps=true`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      })
      if (r.ok) {
        const data = await r.json()
        const items = Array.isArray(data) ? data : (data.items || [])
        setDetections(items.filter(d => d.gps_lat && d.gps_lng))
      }
    } catch {}
  }, [])

  /* ── Load recent field messages ──────────────────────────────── */
  const loadMessages = useCallback(async () => {
    try {
      const token = sessionStorage.getItem('hs_token')
      const r = await fetch(`${API}/api/comms/messages?limit=30`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      })
      if (r.ok) {
        const data = await r.json()
        const items = Array.isArray(data) ? data : (data.items || [])
        setMessages(items.filter(m => m.gps_lat && m.gps_lng))
      }
    } catch {}
  }, [])

  useEffect(() => {
    loadZones()
    loadDetections()
    loadMessages()
  }, [loadZones, loadDetections, loadMessages])

  /* ── GPS WebSocket ───────────────────────────────────────────── */
  useEffect(() => {
    const token = sessionStorage.getItem('hs_token')
    const ws = new WebSocket(`ws://localhost:8000/ws/gps?token=${token || ''}`)
    ws.onmessage = e => {
      try {
        const d = JSON.parse(e.data)
        setNodes(prev => {
          const idx = prev.findIndex(n => n.id === d.node_id)
          const updated = {
            id: d.node_id, lat: d.lat, lng: d.lng,
            name: d.name || d.node_id, speed: d.speed || 0,
            streaming: d.streaming || false,
            colorIdx: idx >= 0 ? prev[idx].colorIdx : prev.length,
          }
          if (idx >= 0) { const a = [...prev]; a[idx] = updated; return a }
          return [...prev, updated]
        })
        setTracks(prev => {
          const trail = (prev[d.node_id] || []).slice(-60)
          return { ...prev, [d.node_id]: [...trail, [d.lat, d.lng]] }
        })
      } catch {}
    }
    ws.onerror = () => {}
    return () => ws.close()
  }, [])

  /* ── Helpers ─────────────────────────────────────────────────── */
  const mapCenter = nodes.length
    ? [nodes[0].lat, nodes[0].lng]
    : [28.6139, 77.2090]

  function toggleLayer(key) {
    setLayers(l => ({ ...l, [key]: !l[key] }))
  }

  function openAdd() {
    setEditZone(null)
    setFormZone(blankForm())
    setFormErr('')
    setPanelOpen(true)
  }

  function openEdit(zone) {
    setEditZone(zone)
    setFormZone({
      zone_name: zone.zone_name, zone_type: zone.zone_type,
      description: zone.description || '', color_hex: zone.color_hex,
      latitude: zone.latitude, longitude: zone.longitude,
      radius_meters: zone.radius_meters,
    })
    setFormErr('')
    setPanelOpen(true)
  }

  async function deleteZone(id) {
    if (!window.confirm('Delete this zone?')) return
    await fetch(`${API}/api/base-zones/${id}`, { method: 'DELETE', credentials: 'include' })
    loadZones()
  }

  async function saveZone() {
    if (!formZone.zone_name.trim())  { setFormErr('Zone name required.'); return }
    if (!formZone.latitude || !formZone.longitude) { setFormErr('Set location on map or enter coordinates.'); return }
    setSaving(true); setFormErr('')
    try {
      const body = {
        ...formZone,
        latitude: parseFloat(formZone.latitude),
        longitude: parseFloat(formZone.longitude),
        radius_meters: parseFloat(formZone.radius_meters),
        color_hex: ZONE_TYPES[formZone.zone_type]?.color || formZone.color_hex,
      }
      const url = editZone ? `${API}/api/base-zones/${editZone.id}` : `${API}/api/base-zones`
      const method = editZone ? 'PUT' : 'POST'
      const r = await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) { const d = await r.json(); setFormErr(d.detail || 'Save failed.'); return }
      await loadZones()
      setPanelOpen(false)
    } catch { setFormErr('Network error.') }
    finally { setSaving(false) }
  }

  /* ── Styles ──────────────────────────────────────────────────── */
  const st = {
    wrap: { height: '100%', position: 'relative', fontFamily: "'Inter', sans-serif" },
    // Top-right controls
    topRight: {
      position: 'absolute', top: 10, right: panelOpen ? 370 : 10, zIndex: 1000,
      display: 'flex', flexDirection: 'column', gap: 6, transition: 'right 0.25s',
    },
    btnGroup: { display: 'flex', gap: 4, background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: 4 },
    tileBtn: (active) => ({
      background: active ? '#388bfd22' : 'none', border: active ? '1px solid #388bfd' : '1px solid transparent',
      color: active ? '#388bfd' : '#8b949e', borderRadius: 4, padding: '3px 8px', fontSize: 11,
      cursor: 'pointer', fontWeight: 500,
    }),
    layerBtn: (active) => ({
      background: active ? '#30363d' : 'none', border: 'none',
      color: active ? '#e6edf3' : '#6e7681', padding: '3px 8px', borderRadius: 4,
      fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
    }),
    // Manage zones button (admin)
    manageBtn: {
      background: '#388bfd', color: '#fff', border: 'none', borderRadius: 6,
      padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 500,
    },
    // Zone panel
    panel: {
      position: 'absolute', top: 0, right: 0, bottom: 0, width: 340, zIndex: 1001,
      background: '#161b22', borderLeft: '1px solid #30363d',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    },
    panelHead: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 16px', borderBottom: '1px solid #30363d',
    },
    panelTitle: { color: '#e6edf3', fontSize: 14, fontWeight: 600 },
    closeBtn: { background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 18, lineHeight: 1 },
    scroll: { flex: 1, overflowY: 'auto', padding: '12px 16px' },
    addBtn: {
      background: '#388bfd', color: '#fff', border: 'none', borderRadius: 6,
      padding: '7px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer', width: '100%', marginBottom: 12,
    },
    zoneRow: {
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
      background: '#0d1117', borderRadius: 6, marginBottom: 6, border: '1px solid #21262d',
    },
    zoneEmoji: { fontSize: 18, flexShrink: 0 },
    zoneName: { color: '#e6edf3', fontSize: 12, fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    zoneType: (color) => ({ background: color + '22', color, fontSize: 10, padding: '1px 6px', borderRadius: 10, flexShrink: 0 }),
    iconBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#8b949e', fontSize: 14, padding: '2px 4px' },
    // Form
    formSect: { marginBottom: 12 },
    lbl: { display: 'block', color: '#8b949e', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 },
    inp: { width: '100%', background: '#0d1117', border: '1px solid #30363d', borderRadius: 5, padding: '7px 10px', color: '#e6edf3', fontSize: 13, outline: 'none', boxSizing: 'border-box' },
    sel: { width: '100%', background: '#0d1117', border: '1px solid #30363d', borderRadius: 5, padding: '7px 10px', color: '#e6edf3', fontSize: 13, outline: 'none', boxSizing: 'border-box', appearance: 'none' },
    row2: { display: 'flex', gap: 8 },
    saveBtn: {
      width: '100%', background: '#388bfd', color: '#fff', border: 'none', borderRadius: 6,
      padding: '9px', fontSize: 13, fontWeight: 500, cursor: 'pointer', marginTop: 8,
    },
    placingBanner: {
      position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
      background: '#388bfd', color: '#fff', padding: '8px 16px', borderRadius: 8,
      fontSize: 12, fontWeight: 500, zIndex: 1200, pointerEvents: 'none',
    },
    // Legend
    legend: {
      position: 'absolute', bottom: 16, left: 16, zIndex: 1000,
      background: 'rgba(22,27,34,0.92)', border: '1px solid #30363d',
      borderRadius: 8, padding: '10px 14px', minWidth: 140,
    },
    legendTitle: { color: '#e6edf3', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8 },
    legendDot: (color) => ({
      width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0,
    }),
    legendRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, cursor: 'pointer' },
    legendLabel: { color: '#8b949e', fontSize: 10 },
  }

  /* ── Popup content ───────────────────────────────────────────── */
  function ZonePopup({ zone }) {
    const cfg = ZONE_TYPES[zone.zone_type] || ZONE_TYPES.CUSTOM
    return (
      <div style={{ fontFamily: "'Inter',sans-serif", minWidth: 180 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 20 }}>{cfg.emoji}</span>
          <div>
            <div style={{ color: '#e6edf3', fontSize: 13, fontWeight: 600 }}>{zone.zone_name}</div>
            <span style={{ background: cfg.color + '22', color: cfg.color, fontSize: 10, padding: '1px 6px', borderRadius: 10 }}>{zone.zone_type}</span>
          </div>
        </div>
        {zone.description && <div style={{ color: '#8b949e', fontSize: 11, marginBottom: 6 }}>{zone.description}</div>}
        <div style={{ color: '#6e7681', fontSize: 10, marginBottom: 8 }}>
          {Number(zone.latitude).toFixed(6)}, {Number(zone.longitude).toFixed(6)}<br />
          Radius: {zone.radius_meters}m
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => openEdit(zone)} style={{ background: '#21262d', border: 'none', color: '#e6edf3', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>Edit</button>
            <button onClick={() => deleteZone(zone.id)} style={{ background: '#2d1117', border: 'none', color: '#f85149', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>Delete</button>
          </div>
        )}
      </div>
    )
  }

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div style={st.wrap}>
      <MapContainer center={mapCenter} zoom={14} style={{ height: '100%', width: '100%' }} zoomControl={false}>
        <TileSwitcher tileKey={tileKey} />
        <MapClickHandler
          active={placing}
          onPlace={latlng => {
            setFormZone(f => ({ ...f, latitude: latlng.lat.toFixed(6), longitude: latlng.lng.toFixed(6) }))
            setPlacing(false)
          }}
        />

        {/* ── Recorder markers ── */}
        {layers.recorders && nodes.map((n, i) => {
          const color = RECORDER_COLORS[n.colorIdx % RECORDER_COLORS.length]
          const icon = svgIcon(color, color, n.streaming)
          return (
            <Marker key={n.id} position={[n.lat, n.lng]} icon={icon}>
              <Popup>
                <div style={{ fontFamily: "'Inter',sans-serif" }}>
                  <div style={{ color: '#e6edf3', fontWeight: 600 }}>{n.name}</div>
                  <div style={{ color: '#8b949e', fontSize: 11, marginTop: 4 }}>
                    {n.lat.toFixed(6)}, {n.lng.toFixed(6)}<br />
                    Speed: {n.speed} m/s<br />
                    <span style={{ color: n.streaming ? '#3fb950' : '#ffd700' }}>
                      {n.streaming ? '● Streaming' : '● Online'}
                    </span>
                  </div>
                </div>
              </Popup>
            </Marker>
          )
        })}

        {/* ── Recorder trails ── */}
        {layers.recorders && Object.entries(tracks).map(([id, trail]) => {
          const node = nodes.find(n => n.id === id)
          const color = node ? RECORDER_COLORS[node.colorIdx % RECORDER_COLORS.length] : '#3fb950'
          return trail.length > 1 && (
            <Polyline key={id} positions={trail} pathOptions={{ color, weight: 1.5, opacity: 0.4 }} />
          )
        })}

        {/* ── Base zone circles ── */}
        {layers.zones && zones.map(zone => {
          const cfg = ZONE_TYPES[zone.zone_type] || ZONE_TYPES.CUSTOM
          const color = cfg.color
          const isDashed = zone.zone_type === 'PERIMETER'
          return (
            <Circle
              key={zone.id}
              center={[zone.latitude, zone.longitude]}
              radius={zone.radius_meters}
              pathOptions={{
                color, fillColor: color, fillOpacity: 0.08, weight: isDashed ? 2 : 1.5,
                dashArray: isDashed ? '8 6' : undefined,
              }}
            >
              <Popup><ZonePopup zone={zone} /></Popup>
            </Circle>
          )
        })}

        {/* ── Detection pins ── */}
        {layers.detections && detections.map(d => {
          const confirmed = d.status === 'confirmed'
          const icon = svgIcon(confirmed ? '#f85149' : '#ffd700', confirmed ? '#f85149' : '#ffd700', !confirmed)
          return (
            <Marker key={d.id} position={[d.gps_lat, d.gps_lng]} icon={icon}>
              <Popup>
                <div style={{ fontFamily: "'Inter',sans-serif" }}>
                  <div style={{ color: '#e6edf3', fontWeight: 600, fontSize: 12 }}>{d.display_label}</div>
                  <div style={{ color: '#8b949e', fontSize: 10, marginTop: 4 }}>
                    {d.camera_id} · {d.confidence ? (d.confidence * 100).toFixed(0) + '%' : ''}<br />
                    <span style={{ color: confirmed ? '#3fb950' : '#ffd700' }}>{confirmed ? 'Confirmed' : 'Pending'}</span>
                  </div>
                </div>
              </Popup>
            </Marker>
          )
        })}

        {/* ── Field message pins ── */}
        {layers.messages && messages.map(m => {
          const prioColor = { emergency: '#f85149', high: '#ffd700', medium: '#ff6600', normal: '#3fb950' }[m.priority] || '#3fb950'
          const icon = svgIcon(prioColor, prioColor, false)
          return (
            <Marker key={m.id} position={[m.gps_lat, m.gps_lng]} icon={icon}>
              <Popup>
                <div style={{ fontFamily: "'Inter',sans-serif", maxWidth: 200 }}>
                  <div style={{ color: '#e6edf3', fontWeight: 600, fontSize: 12 }}>{m.callsign}</div>
                  <div style={{ color: '#8b949e', fontSize: 11, margin: '4px 0' }}>{m.text}</div>
                  <span style={{ background: prioColor + '22', color: prioColor, fontSize: 10, padding: '1px 6px', borderRadius: 10 }}>{m.priority?.toUpperCase()}</span>
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>

      {/* ── top-right controls ── */}
      <div style={st.topRight}>
        {/* Tile switcher */}
        <div style={st.btnGroup}>
          {Object.entries(TILES).map(([key, t]) => (
            <button key={key} style={st.tileBtn(tileKey === key)} onClick={() => setTileKey(key)}>{t.label}</button>
          ))}
        </div>
        {/* Layer toggles */}
        <div style={st.btnGroup}>
          {[
            { key: 'recorders', label: '📡 Recorders' },
            { key: 'zones',     label: '🗺 Zones' },
            { key: 'detections',label: '🔴 Detections' },
            { key: 'messages',  label: '💬 Messages' },
          ].map(({ key, label }) => (
            <button key={key} style={st.layerBtn(layers[key])} onClick={() => toggleLayer(key)}>{label}</button>
          ))}
        </div>
        {/* Admin manage zones button */}
        {isAdmin && (
          <button style={st.manageBtn} onClick={() => setPanelOpen(o => !o)}>
            {panelOpen ? '✕ Close Panel' : '⚙ Manage Zones'}
          </button>
        )}
      </div>

      {/* ── Zone management panel ── */}
      {panelOpen && (
        <div style={st.panel} className="zone-panel zone-panel-anim">
          <div style={st.panelHead}>
            <span style={st.panelTitle}>{editZone ? 'Edit Zone' : 'Manage Zones'}</span>
            <button style={st.closeBtn} onClick={() => { setPanelOpen(false); setEditZone(null) }}>×</button>
          </div>
          <div style={st.scroll} className="zone-panel">
            {/* Add button (only when not in form) */}
            {!editZone && (
              <>
                <button style={st.addBtn} onClick={openAdd}>+ Add Zone</button>
                {zones.map(zone => {
                  const cfg = ZONE_TYPES[zone.zone_type] || ZONE_TYPES.CUSTOM
                  return (
                    <div key={zone.id} style={st.zoneRow}>
                      <span style={st.zoneEmoji}>{cfg.emoji}</span>
                      <span style={st.zoneName}>{zone.zone_name}</span>
                      <span style={st.zoneType(cfg.color)}>{zone.zone_type}</span>
                      <button style={st.iconBtn} onClick={() => openEdit(zone)} title="Edit">✏️</button>
                      <button style={{ ...st.iconBtn, color: '#f85149' }} onClick={() => deleteZone(zone.id)} title="Delete">🗑️</button>
                    </div>
                  )
                })}
                {zones.length === 0 && (
                  <div style={{ color: '#6e7681', fontSize: 12, textAlign: 'center', marginTop: 20 }}>No zones yet. Click "Add Zone".</div>
                )}
              </>
            )}

            {/* Add/Edit form */}
            {(panelOpen && (editZone !== null || editZone === null)) && editZone !== undefined && (
              <div /> /* separator */
            )}
            {panelOpen && (
              <div style={st.formSect}>
                {editZone === null && <div style={{ color: '#e6edf3', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>New Zone</div>}
                {editZone && <div style={{ color: '#e6edf3', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Editing: {editZone.zone_name}</div>}

                <label style={st.lbl}>Zone Name *</label>
                <input style={{ ...st.inp, marginBottom: 10 }} value={formZone.zone_name}
                  onChange={e => setFormZone(f => ({ ...f, zone_name: e.target.value }))} placeholder="e.g. Alpha Post" />

                <label style={st.lbl}>Zone Type *</label>
                <select style={{ ...st.sel, marginBottom: 10 }} value={formZone.zone_type}
                  onChange={e => setFormZone(f => ({ ...f, zone_type: e.target.value, color_hex: ZONE_TYPES[e.target.value]?.color || f.color_hex }))}>
                  {TYPE_OPTIONS.map(t => <option key={t} value={t}>{ZONE_TYPES[t].emoji} {ZONE_TYPES[t].label}</option>)}
                </select>

                <label style={st.lbl}>Description</label>
                <input style={{ ...st.inp, marginBottom: 10 }} value={formZone.description}
                  onChange={e => setFormZone(f => ({ ...f, description: e.target.value }))} placeholder="Optional notes" />

                <label style={st.lbl}>Location</label>
                <button
                  onClick={() => setPlacing(true)}
                  style={{ width: '100%', background: placing ? '#1f6feb' : '#21262d', border: '1px solid #30363d', color: placing ? '#fff' : '#8b949e', borderRadius: 5, padding: '7px', fontSize: 12, cursor: 'pointer', marginBottom: 6 }}>
                  {placing ? '🎯 Click on map…' : '📍 Click map to place'}
                </button>
                <div style={st.row2}>
                  <input style={{ ...st.inp }} value={formZone.latitude}
                    onChange={e => setFormZone(f => ({ ...f, latitude: e.target.value }))} placeholder="Latitude" type="number" step="any" />
                  <input style={{ ...st.inp }} value={formZone.longitude}
                    onChange={e => setFormZone(f => ({ ...f, longitude: e.target.value }))} placeholder="Longitude" type="number" step="any" />
                </div>
                {formZone.latitude && formZone.longitude && (
                  <div style={{ color: '#3fb950', fontSize: 10, marginTop: 4 }}>✓ {Number(formZone.latitude).toFixed(5)}, {Number(formZone.longitude).toFixed(5)}</div>
                )}

                <label style={{ ...st.lbl, marginTop: 10 }}>Radius — {formZone.radius_meters}m</label>
                <input type="range" min={50} max={5000} value={formZone.radius_meters}
                  onChange={e => setFormZone(f => ({ ...f, radius_meters: Number(e.target.value) }))}
                  style={{ width: '100%', accentColor: '#388bfd', marginBottom: 10 }} />

                {formErr && <div style={{ color: '#f85149', fontSize: 11, marginBottom: 8 }}>{formErr}</div>}

                <div style={st.row2}>
                  {editZone && (
                    <button style={{ flex: 1, background: '#21262d', color: '#8b949e', border: 'none', borderRadius: 6, padding: '8px', fontSize: 12, cursor: 'pointer' }}
                      onClick={() => { setEditZone(null); setFormZone(blankForm()) }}>
                      ← Back
                    </button>
                  )}
                  <button style={{ ...st.saveBtn, flex: editZone ? 1 : undefined, marginTop: 0 }} onClick={saveZone} disabled={saving}>
                    {saving ? 'Saving…' : editZone ? 'Update Zone' : 'Save Zone'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Click-to-place hint ── */}
      {placing && <div style={st.placingBanner}>🎯 Click anywhere on the map to place the zone</div>}

      {/* ── Legend ── */}
      <div style={st.legend}>
        <div style={st.legendTitle}>LEGEND</div>
        <div style={st.legendRow} onClick={() => toggleLayer('recorders')}>
          <div style={st.legendDot('#3fb950')} />
          <span style={st.legendLabel}>Recorders ({nodes.length})</span>
        </div>
        {Object.entries(ZONE_TYPES).map(([type, cfg]) => {
          const count = zones.filter(z => z.zone_type === type).length
          if (count === 0) return null
          return (
            <div key={type} style={st.legendRow} onClick={() => toggleLayer('zones')}>
              <div style={st.legendDot(cfg.color)} />
              <span style={st.legendLabel}>{cfg.label} ({count})</span>
            </div>
          )
        })}
        <div style={st.legendRow} onClick={() => toggleLayer('detections')}>
          <div style={st.legendDot('#f85149')} />
          <span style={st.legendLabel}>Detections ({detections.length})</span>
        </div>
        <div style={st.legendRow} onClick={() => toggleLayer('messages')}>
          <div style={st.legendDot('#388bfd')} />
          <span style={st.legendLabel}>Field Msgs ({messages.length})</span>
        </div>
      </div>
    </div>
  )
}
