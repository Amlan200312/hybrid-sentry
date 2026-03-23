import { useState, useEffect } from 'react'

const API = 'http://localhost:8000'

export default function ReportsPage() {
  const [dateFrom, setDateFrom]     = useState('')
  const [dateTo, setDateTo]         = useState('')
  const [reportType, setReportType] = useState('daily')
  const [sections, setSections]     = useState({
    detections: true,
    verifications: true,
    alerts: true,
    recorders: false,
    analytics: false,
  })
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress]     = useState(0)
  const [prevReports, setPrevReports] = useState(null)
  const [loadingReports, setLoadingReports] = useState(true)

  useEffect(() => {
    const token = sessionStorage.getItem('hs_token')
    fetch(`http://localhost:8000/api/reports`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setPrevReports(d ? (Array.isArray(d) ? d : (d.reports || [])) : [])
        setLoadingReports(false)
      })
      .catch(() => { setPrevReports([]); setLoadingReports(false) })
  }, [])

  async function generateReport() {
    setGenerating(true)
    setProgress(0)
    // Simulate progress
    const id = setInterval(() => setProgress(p => Math.min(p + 10, 90)), 400)
    const token = sessionStorage.getItem('hs_token')
    try {
      const r = await fetch(`http://localhost:8000/api/reports/pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          type: reportType,
          date_from: dateFrom,
          date_to: dateTo,
          sections,
        }),
      })
      clearInterval(id)
      setProgress(100)
      if (r.ok) {
        const blob = await r.blob()
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        a.href     = url
        a.download = `hybrid-sentry-report-${reportType}-${Date.now()}.pdf`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch {}
    clearInterval(id)
    setTimeout(() => { setGenerating(false); setProgress(0) }, 800)
  }

  const REPORT_TYPES = [
    { value: 'daily',    label: 'Daily Summary' },
    { value: 'incident', label: 'Incident Report' },
    { value: 'full',     label: 'Full Log' },
  ]

  const SECTION_LABELS = {
    detections:    'Detections',
    verifications: 'Verifications',
    alerts:        'Alerts / Unverified',
    recorders:     'Recorder Status',
    analytics:     'Analytics Charts',
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* LEFT: Generate */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="panel">
          <div className="panel-header">Generate Report</div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Date range */}
            <div className="sub-panel">
              <div className="sub-panel-title">Date Range</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <label className="input-label">From</label>
                  <input type="date" className="input-field" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="input-label">To</label>
                  <input type="date" className="input-field" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Report type */}
            <div className="sub-panel">
              <div className="sub-panel-title">Report Type</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {REPORT_TYPES.map(rt => (
                  <button
                    key={rt.value}
                    className={`filter-pill ${reportType === rt.value ? 'active' : ''}`}
                    onClick={() => setReportType(rt.value)}
                  >
                    {rt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sections */}
            <div className="sub-panel">
              <div className="sub-panel-title">Include Sections</div>
              {Object.entries(SECTION_LABELS).map(([key, label]) => (
                <label key={key} style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                  cursor: 'pointer', fontSize: 13,
                }}>
                  <input
                    type="checkbox"
                    checked={sections[key] || false}
                    onChange={e => setSections(p => ({ ...p, [key]: e.target.checked }))}
                    style={{ accentColor: 'var(--accent-blue)' }}
                  />
                  <span style={{ color: sections[key] ? 'var(--text-primary)' : 'var(--text-muted)' }}>{label}</span>
                </label>
              ))}
            </div>

            {/* Progress bar */}
            {generating && (
              <div style={{ background: 'var(--bg-elevated)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${progress}%`,
                  background: 'var(--accent-blue)',
                  transition: 'width 300ms ease',
                  borderRadius: 4,
                }} />
              </div>
            )}

            <button
              className="btn btn-primary btn-full"
              style={{ height: 40, borderRadius: 8 }}
              disabled={generating}
              onClick={generateReport}
            >
              {generating
                ? <><div className="spinner" />Generating… {progress}%</>
                : '⬇ Generate PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT: Previous Reports */}
      <div className="panel">
        <div className="panel-header">Previous Reports</div>
        <div className="panel-body-scroll" style={{ maxHeight: 'calc(100vh - 200px)' }}>
          {loadingReports ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 48 }} />)}
            </div>
          ) : (!prevReports || prevReports.length === 0) ? (
            <div className="empty-state">
              <div className="empty-state-icon">📄</div>
              <div className="empty-state-title">No reports yet</div>
              <div className="empty-state-sub">Generate your first report using the form on the left</div>
            </div>
          ) : (
            prevReports.map((rpt, i) => (
              <div key={rpt.id || i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderBottom: '1px solid var(--bg-elevated)',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                    {rpt.type || 'Report'} — {rpt.created_at ? new Date(rpt.created_at).toLocaleDateString() : '—'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{rpt.filename || ''}</div>
                </div>
                {rpt.url && (
                  <a href={`${API}${rpt.url}`} download className="btn btn-secondary btn-xs">⬇</a>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
