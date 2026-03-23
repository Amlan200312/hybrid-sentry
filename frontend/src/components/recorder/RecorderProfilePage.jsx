import { useState, useEffect } from 'react'
import { authFetch, getUser } from '../../utils/api'

export default function RecorderProfilePage({ isMobile }) {
  const [user, setUser] = useState(null)
  const [location, setLocation] = useState('Unknown')
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    setUser(getUser())
  }, [])

  const handleGetLocation = () => {
    if (navigator.geolocation) {
      setUpdating(true)
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude, longitude } = pos.coords
        setLocation(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`)
        await authFetch('/api/recorders/self/location', {
          method: 'POST',
          body: JSON.stringify({ lat: latitude, lng: longitude })
        }).catch(()=>{})
        setUpdating(false)
      }, () => setUpdating(false))
    }
  }

  const handleCheckIn = async () => {
    await authFetch('/api/ptt/checkin', { method: 'POST' }).catch(()=>{})
  }

  const handleLogout = () => {
    localStorage.clear()
    sessionStorage.clear()
    window.location.href = '/login'
  }

  if (!user) return null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
      {/* LEFT: INFO */}
      <div className="panel">
        <div className="panel-header">My Info</div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(56,139,253,0.12)', border: '1px solid rgba(56,139,253,0.3)', color: '#388bfd',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700
            }}>
              {(user.display_name || user.username || '?').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{user.display_name || 'Operator'}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>@{user.username}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{user.branch || 'N/A'} • RNK</span>
                <span className="badge badge-blue">{user.role}</span>
              </div>
            </div>
          </div>
          
          <div style={{ height: 1, background: 'var(--border)' }} />
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Operator ID</span>
              <span style={{ fontWeight: 600 }}>{user.operator_id || '---'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Badge ID</span>
              <span style={{ fontWeight: 600 }}>{user.badge_id || '---'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Unit</span>
              <span style={{ fontWeight: 600 }}>{user.unit || '---'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Contact</span>
              <span style={{ fontWeight: 600 }}>{user.contact || '---'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: LOCATION & ACTIONS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="panel">
          <div className="panel-header">Location</div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>Current: {location}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button 
                className="btn btn-secondary" 
                onClick={handleGetLocation}
                disabled={updating}
              >
                {updating ? 'Updating...' : '📍 Get GPS Location'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input className="input" placeholder="Manual Input (Lat, Lng)" style={{ flex: 1, height: 36 }} />
              <button className="btn btn-primary">Save</button>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">Account Actions</div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button className="btn btn-primary" style={{ height: 38 }} onClick={handleCheckIn}>
              ✓ Send Check-In
            </button>
            <button className="btn btn-secondary" style={{ height: 38 }}>
              🔑 Change PIN
            </button>
            <button className="btn btn-secondary" style={{ height: 38, borderColor: '#f85149', color: '#f85149' }} onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
