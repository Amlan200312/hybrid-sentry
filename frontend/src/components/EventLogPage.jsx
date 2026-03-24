import { useState, useEffect } from 'react'
import { authFetch } from '../utils/api'

export default function EventLogPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')

  const fetchEvents = () => {
    setLoading(true)
    authFetch('/api/events?limit=50')
      .then(res => res ? res.json() : [])
      .then(data => {
        const arr = Array.isArray(data) ? data : (data?.items || data?.detections || [])
        setEvents(arr)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchEvents()
  }, [])

  const filteredEvents = events.filter(evt => {
    const label = (evt.label || '').toLowerCase()
    const matchesSearch = !search || label.includes(search.toLowerCase()) || (evt.recorder_id || '').toLowerCase().includes(search.toLowerCase())
    const matchesType = typeFilter === 'All' || label.includes(typeFilter.toLowerCase())
    const matchesStatus = statusFilter === 'All' || 
      (statusFilter === 'Verified' && evt.verified) || 
      (statusFilter === 'Unverified' && !evt.verified)
    
    return matchesSearch && matchesType && matchesStatus
  })

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header" style={{ padding: '16px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: '14px', fontWeight: 600 }}>Event Log</div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '12px', width: '100%' }}>
          <input 
            className="input" 
            placeholder="Search recorder or type..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            style={{ flex: 1 }}
          />
          <select className="input" style={{ width: '150px' }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option>All</option>
            <option>Person</option>
            <option>Vehicle</option>
          </select>
          <select className="input" style={{ width: '150px' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option>All</option>
            <option>Verified</option>
            <option>Unverified</option>
          </select>
        </div>
      </div>

      <div className="panel-body-scroll" style={{ padding: 0, flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {Array.from({length: 5}).map((_, i) => <div key={i} className="skeleton-line" style={{ height: '40px' }} />)}
          </div>
        ) : error ? (
          <div className="error-state" style={{ margin: '20px' }}>
            <div>Failed to load: {error}</div>
            <button className="btn btn-secondary" onClick={fetchEvents}>Retry</button>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="empty-state">No events matched your filters</div>
        ) : (
          filteredEvents.map((evt) => {
            const isExpanded = expandedId === evt.id
            const color = evt.label === 'person' ? 'blue' : evt.label === 'vehicle' ? 'amber' : 'red'
            
            return (
              <div key={evt.id} style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-base)' }}>
                {/* Collapsed Row */}
                <div 
                  onClick={() => setExpandedId(isExpanded ? null : evt.id)}
                  style={{ 
                    display: 'flex', gap: '12px', padding: '10px 16px', 
                    alignItems: 'center', cursor: 'pointer',
                    background: isExpanded ? 'var(--bg-elevated)' : 'transparent',
                    transition: 'background 150ms ease'
                  }}
                >
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', width: '140px', flexShrink: 0 }}>
                    {evt.timestamp ? new Date(evt.timestamp).toLocaleString() : 'just now'}
                  </div>
                  <div style={{ width: '100px', flexShrink: 0 }}>
                    <span className={`badge badge-${color}`} style={{textTransform:'capitalize'}}>{evt.label || 'Unknown'}</span>
                  </div>
                  <div style={{ flex: 1, fontSize: '12px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {evt.recorder_id || 'Unknown recorder'}
                  </div>
                  <div style={{ width: '80px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {Math.round((evt.confidence||0)*100)}%
                  </div>
                  <div style={{ width: '100px', flexShrink: 0 }}>
                    <span className={`badge ${evt.verified ? 'badge-green' : 'badge-red'}`} style={{fontSize: '10px'}}>
                      {evt.verified ? '✓ Verified' : 'Unverified'}
                    </span>
                  </div>
                </div>

                {/* Expanded Row */}
                <div style={{ 
                  maxHeight: isExpanded ? '200px' : '0px', 
                  overflow: 'hidden', 
                  transition: 'max-height 300ms ease',
                  background: 'var(--bg-elevated)' 
                }}>
                  <div style={{ padding: '16px', display: 'flex', gap: '16px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ width: '120px', height: '90px', background: '#000', borderRadius: '4px', overflow: 'hidden', flexShrink: 0 }}>
                      <img 
                        src={`http://localhost:8000/api/snapshot/${evt.id}`} 
                        key={evt.id}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.style.background = 'var(--border)' }}
                      />
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>Location Details</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{evt.location || 'Location not tagged'}</div>
                      <div style={{ marginTop: 'auto', display: 'flex', gap: '8px' }}>
                        {!evt.verified && <button className="btn btn-sm btn-success">Verify</button>}
                        <button className="btn btn-sm btn-danger">Flag Issue</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
