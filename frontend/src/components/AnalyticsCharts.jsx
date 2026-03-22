import { useState, useEffect, useCallback } from 'react'

const API = 'http://localhost:8000'

/* ── Simple bar chart using CSS ─────────────────────────────── */
function BarChart({ data = [], labelKey = 'label', valueKey = 'count', color = 'var(--accent-blue)' }) {
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1)
  if (data.length === 0) return (
    <div className="empty-state" style={{ padding: 32 }}>
      <div className="empty-state-icon" style={{ fontSize: 24 }}>📊</div>
      <div className="empty-state-sub">No data available yet</div>
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {data.map((d, i) => {
        const val = d[valueKey] || 0
        const pct = (val / max) * 100
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 100, flexShrink: 0, textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
              {d[labelKey] || '—'}
            </span>
            <div style={{ flex: 1, background: 'var(--bg-elevated)', borderRadius: 3, height: 16, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.6s ease', minWidth: pct > 0 ? 4 : 0 }} />
            </div>
            <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-primary)', width: 40, textAlign: 'right', flexShrink: 0 }}>
              {val}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ── Timeline chart using CSS ───────────────────────────────── */
function TimelineChart({ data = [] }) {
  const max = Math.max(...data.map(d => d.count || 0), 1)
  if (data.length === 0) return (
    <div className="empty-state" style={{ padding: 32 }}>
      <div className="empty-state-icon" style={{ fontSize: 24 }}>📈</div>
      <div className="empty-state-sub">No timeline data available yet</div>
    </div>
  )
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80, padding: '0 4px' }}>
        {data.map((d, i) => {
          const pct = (d.count / max) * 100
          const hasData = d.count > 0
          return (
            <div
              key={i}
              title={`${d.hour || d.label}: ${d.count} detections`}
              style={{
                flex: 1,
                height: `${Math.max(pct, 4)}%`,
                background: hasData ? 'var(--accent-blue)' : 'var(--bg-elevated)',
                borderRadius: '2px 2px 0 0',
                opacity: hasData ? 0.85 : 0.4,
                transition: 'opacity 0.2s',
                cursor: 'pointer',
                minHeight: 4,
              }}
              onMouseEnter={e => { e.target.style.opacity = 1 }}
              onMouseLeave={e => { e.target.style.opacity = hasData ? 0.85 : 0.4 }}
            />
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>
    </div>
  )
}

/* ── Stat card ──────────────────────────────────────────────── */
function StatCard({ label, value, icon, color = 'var(--accent-blue)', loading }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}>
      <div style={{ fontSize: 24 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
          {label}
        </div>
        {loading
          ? <div className="skeleton skeleton-line" style={{ width: 60, height: 22 }} />
          : <div className="counter-value" style={{ color }}>{value ?? '—'}</div>
        }
      </div>
    </div>
  )
}

/* ── Chart card wrapper ─────────────────────────────────────── */
function ChartCard({ title, loading, error, onRetry, children }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="card-header">
        <span className="card-title">{title}</span>
        {error && <button className="btn btn-ghost btn-xs" onClick={onRetry}>↺</button>}
      </div>
      <div style={{ padding: '16px' }}>
        {loading
          ? <><div className="skeleton skeleton-line" style={{ marginBottom: 8 }} /><div className="skeleton skeleton-line" style={{ width: '70%', marginBottom: 8 }} /><div className="skeleton skeleton-line" style={{ width: '55%' }} /></>
          : error
          ? <div style={{ fontSize: 12, color: 'var(--accent-red)', textAlign: 'center', padding: '16px 0' }}>Failed to load: {error}</div>
          : children
        }
      </div>
    </div>
  )
}

/* ── Custom hook for single endpoint ────────────────────────── */
function useAnalytics(path) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const fetch_ = useCallback(async () => {
    setLoading(true)
    setError(null)
    const token = sessionStorage.getItem('hs_token')
    try {
      const r = await fetch(`${API}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setData(await r.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [path])

  useEffect(() => { fetch_() }, [fetch_])
  return { data, loading, error, refetch: fetch_ }
}

/* ── Main ───────────────────────────────────────────────────── */
export default function AnalyticsCharts() {
  const byClass    = useAnalytics('/api/analytics/detections-by-class')
  const timeline   = useAnalytics('/api/analytics/timeline-24h')
  const verifiedVs = useAnalytics('/api/analytics/verified-vs-dismissed')
  const byCam      = useAnalytics('/api/analytics/by-camera')

  // Summary stats derived from existing data
  const totalDetections = byClass.data
    ? (Array.isArray(byClass.data) ? byClass.data : []).reduce((s, d) => s + (d.count || 0), 0)
    : null

  const confirmedCount = verifiedVs.data
    ? (Array.isArray(verifiedVs.data) ? verifiedVs.data : []).find(d => d.status === 'confirmed')?.count ?? 0
    : null

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>📊 Analytics</h2>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        Live detection statistics from the backend database.
      </p>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard label="Total Detections" value={totalDetections}
          icon="🎯" color="var(--accent-blue)" loading={byClass.loading} />
        <StatCard label="Confirmed" value={confirmedCount}
          icon="✅" color="var(--accent-green)" loading={verifiedVs.loading} />
        <StatCard label="Cameras Active" value={byCam.data ? (Array.isArray(byCam.data) ? byCam.data.length : 0) : null}
          icon="📷" color="var(--accent-amber)" loading={byCam.loading} />
        <StatCard label="Detection Classes" value={byClass.data ? (Array.isArray(byClass.data) ? byClass.data.length : 0) : null}
          icon="🏷️" color="var(--accent-purple)" loading={byClass.loading} />
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <ChartCard title="Detections by Class" loading={byClass.loading} error={byClass.error} onRetry={byClass.refetch}>
          <BarChart
            data={Array.isArray(byClass.data) ? byClass.data : []}
            labelKey="class" valueKey="count"
            color="var(--accent-blue)"
          />
        </ChartCard>

        <ChartCard title="Verified vs Dismissed" loading={verifiedVs.loading} error={verifiedVs.error} onRetry={verifiedVs.refetch}>
          <BarChart
            data={Array.isArray(verifiedVs.data) ? verifiedVs.data : []}
            labelKey="status" valueKey="count"
            color="var(--accent-green)"
          />
        </ChartCard>
      </div>

      <ChartCard title="24-Hour Detection Timeline" loading={timeline.loading} error={timeline.error} onRetry={timeline.refetch}>
        <TimelineChart data={Array.isArray(timeline.data) ? timeline.data : (timeline.data?.hours || [])} />
      </ChartCard>

      <div style={{ marginTop: 16 }}>
        <ChartCard title="Detections by Camera" loading={byCam.loading} error={byCam.error} onRetry={byCam.refetch}>
          <BarChart
            data={Array.isArray(byCam.data) ? byCam.data : []}
            labelKey="camera" valueKey="count"
            color="var(--accent-amber)"
          />
        </ChartCard>
      </div>
    </div>
  )
}
