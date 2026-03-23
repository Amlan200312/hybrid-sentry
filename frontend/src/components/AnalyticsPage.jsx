import { useState, useEffect } from 'react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

import { authFetch } from '../utils/api'
const API = 'http://localhost:8000'
const COLORS = ['#388bfd', '#3fb950', '#d29922', '#f85149', '#a371f7']

function StatCard({ label, value, trend, color }) {
  return (
    <div className="panel" style={{ padding: 0 }}>
      <div className="panel-body" style={{ padding: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
          {label}
        </div>
        <div style={{
          fontSize: 28, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace',
          color: color || 'var(--text-primary)',
        }}>
          {value ?? '—'}
        </div>
        {trend != null && (
          <div style={{ fontSize: 11, color: trend >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', marginTop: 4 }}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% vs yesterday
          </div>
        )}
      </div>
    </div>
  )
}

function ErrorState({ onRetry }) {
  return (
    <div className="error-state">
      <div style={{ fontSize: 13, color: 'var(--accent-red)', fontWeight: 600 }}>Failed to load analytics</div>
      <button className="btn btn-secondary btn-sm" onClick={onRetry}>↺ Retry</button>
    </div>
  )
}

export default function AnalyticsPage() {
  const [timeline, setTimeline]   = useState(null)
  const [byType, setByType]       = useState(null)
  const [stats, setStats]         = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  function fetchAll() {
    setLoading(true); setError(null)
    Promise.all([
      authFetch(`/api/analytics/timeline`)
        .then(r => r ? r.json() : null).catch(() => null),
      authFetch(`/api/detections?limit=200`)
        .then(r => r ? r.json() : null).catch(() => null),
    ]).then(([tl, dets]) => {
      setTimeline(tl)
      if (dets) {
        const list = Array.isArray(dets) ? dets : (dets.detections || dets.items || [])
        // Build by-type counts
        const byt = {}
        list.forEach(e => { const k = e.label || e.class || 'unknown'; byt[k] = (byt[k] || 0) + 1 })
        setByType(Object.entries(byt).map(([name, value]) => ({ name, value })))
        setStats({
          total: list.length,
          persons: list.filter(e => (e.label || '').includes('person')).length,
          vehicles: list.filter(e => (e.label || '').includes('vehicle') || (e.label || '').includes('car')).length,
          alerts: list.filter(e => !e.verified).length,
        })
      }
      setLoading(false)
    }).catch(e => { setError(String(e)); setLoading(false) })
  }

  useEffect(() => { fetchAll() }, []) // eslint-disable-line

  // Dummy timeline if no data
  const dummyTimeline = Array.from({ length: 24 }, (_, i) => ({
    hour: `${String(i).padStart(2, '0')}:00`,
    count: Math.floor(Math.random() * 10),
  }))

  const tlData = timeline || dummyTimeline

  if (error) return <ErrorState onRetry={fetchAll} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
        <StatCard label="Total Detections" value={loading ? '…' : stats?.total} trend={12} />
        <StatCard label="Persons" value={loading ? '…' : stats?.persons} color="var(--accent-blue)" />
        <StatCard label="Vehicles" value={loading ? '…' : stats?.vehicles} color="var(--accent-amber)" />
        <StatCard label="Unverified Alerts" value={loading ? '…' : stats?.alerts} color="var(--accent-red)" trend={-5} />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        {/* Timeline chart */}
        <div className="panel">
          <div className="panel-header">Detections Over Time (24h)</div>
          <div className="panel-body" style={{ padding: '16px 8px' }}>
            {loading ? (
              <div className="skeleton" style={{ height: 180 }} />
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={tlData} margin={{ left: -20, right: 10, top: 5, bottom: 0 }}>
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#484f58' }} interval={3} />
                  <YAxis tick={{ fontSize: 10, fill: '#484f58' }} />
                  <Tooltip
                    contentStyle={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: '#e6edf3' }}
                    itemStyle={{ color: '#388bfd' }}
                  />
                  <Bar dataKey="count" fill="#388bfd" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Pie chart */}
        <div className="panel">
          <div className="panel-header">By Type</div>
          <div className="panel-body">
            {loading ? (
              <div className="skeleton" style={{ height: 180 }} />
            ) : !byType || byType.length === 0 ? (
              <div className="empty-state" style={{ padding: '20px 0' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No data</div>
              </div>
            ) : (
              <div>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={byType} cx="50%" cy="50%" innerRadius={40} outerRadius={60} dataKey="value">
                      {byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 6, fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
                {byType.map((entry, i) => (
                  <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length] }} />
                    <span style={{ color: 'var(--text-secondary)', flex: 1, textTransform: 'capitalize' }}>{entry.name}</span>
                    <span style={{ fontWeight: 600 }}>{entry.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="panel">
          <div className="panel-header">Recorder Performance</div>
          <div className="panel-body">
            <div className="empty-state" style={{ padding: '20px 0' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Connect recorders to see performance metrics</div>
            </div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-header">Response Time (Verify Queue)</div>
          <div className="panel-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="sub-panel">
                <div className="sub-panel-title">Avg. Time to Verify</div>
                <span style={{ fontSize: 22, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-amber)' }}>
                  —
                </span>
              </div>
              <div className="sub-panel">
                <div className="sub-panel-title">Fastest Response</div>
                <span style={{ fontSize: 22, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent-green)' }}>
                  —
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
