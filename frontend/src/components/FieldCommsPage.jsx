import { useState, useEffect, useCallback } from 'react'

const API = 'http://localhost:8000'

/* ── Skeleton ───────────────────────────────────────────────── */
function MsgSkeleton() {
  return (
    <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
        <div className="skeleton" style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="skeleton skeleton-line" style={{ width: '45%' }} />
          <div className="skeleton skeleton-line" style={{ width: '80%' }} />
        </div>
      </div>
    </div>
  )
}

/* ── Priority badge ─────────────────────────────────────────── */
function PriorityBadge({ level }) {
  const map = {
    emergency: { cls: 'badge-red',   label: '🚨 EMERGENCY' },
    high:      { cls: 'badge-amber', label: '⚠️ HIGH'       },
    medium:    { cls: 'badge-blue',  label: '📢 MEDIUM'     },
    normal:    { cls: 'badge-green', label: '📻 NORMAL'     },
  }
  const { cls, label } = map[level] || map.normal
  return <span className={`badge ${cls}`}>{label}</span>
}

/* ── Message list item ──────────────────────────────────────── */
function MsgItem({ msg, selected, onClick }) {
  const isUnacked = !msg.acknowledged_at
  return (
    <div
      onClick={() => onClick(msg)}
      style={{
        padding: '12px 14px',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        background: selected ? 'rgba(56,139,253,0.08)' : isUnacked ? 'rgba(248,81,73,0.04)' : 'transparent',
        borderLeft: `3px solid ${selected ? 'var(--accent-blue)' : isUnacked ? 'var(--accent-red)' : 'transparent'}`,
        transition: 'background 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%',
          background: 'var(--bg-elevated)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, color: 'var(--accent-blue)',
          flexShrink: 0,
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          {(msg.callsign || 'XX').slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace' }}>
              {msg.callsign || '—'}
            </span>
            <PriorityBadge level={msg.priority} />
            {isUnacked && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-red)', animation: 'pulse 1.5s infinite', flexShrink: 0 }} />}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>
              {msg.time_ago || (msg.created_at ? new Date(msg.created_at).toLocaleTimeString() : '')}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {msg.text || '[Audio message]'}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Message detail panel ───────────────────────────────────── */
function MsgDetail({ msg, onAck, onReply, acking, replyText, setReplyText, sending }) {
  const audioUrl = msg.audio_filename
    ? `${API}/api/comms/audio/${msg.id}`
    : null

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace' }}>
            {msg.callsign || '—'}
          </span>
          <PriorityBadge level={msg.priority} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {msg.created_at ? new Date(msg.created_at).toLocaleString() : ''}
        </div>
        {msg.gps_lat && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>
            📍 {Number(msg.gps_lat).toFixed(5)}, {Number(msg.gps_lng).toFixed(5)}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {msg.text && (
          <div style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '12px 14px',
            fontSize: 14,
            color: 'var(--text-primary)',
            lineHeight: 1.6,
            marginBottom: 16,
          }}>
            {msg.text}
          </div>
        )}

        {/* Audio player */}
        {audioUrl && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Audio Message
            </div>
            <audio
              controls
              src={audioUrl}
              style={{ width: '100%', filter: 'invert(1) hue-rotate(180deg)', borderRadius: 8 }}
            />
          </div>
        )}

        {/* Reply box */}
        <div style={{ marginBottom: 12 }}>
          <label className="input-label">Reply</label>
          <textarea
            className="input"
            rows={3}
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            placeholder="Type your reply…"
            style={{ resize: 'vertical', minHeight: 72 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={onReply}
            disabled={sending || !replyText.trim()}
          >
            {sending ? <><div className="spinner" /> Sending…</> : '↩ Send Reply'}
          </button>
          {!msg.acknowledged_at && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={onAck}
              disabled={acking}
            >
              {acking ? <><div className="spinner" /> …</> : '✅ Acknowledge'}
            </button>
          )}
          {msg.acknowledged_at && (
            <span style={{ fontSize: 12, color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: 4 }}>
              ✅ Acknowledged
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Main FieldCommsPage ────────────────────────────────────── */
export default function FieldCommsPage() {
  const [messages,  setMessages]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [selected,  setSelected]  = useState(null)
  const [filter,    setFilter]    = useState('all')
  const [acking,    setAcking]    = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sending,   setSending]   = useState(false)

  const fetchMessages = useCallback(async () => {
    const token = sessionStorage.getItem('hs_token')
    const params = new URLSearchParams()
    if (filter !== 'all') params.set('priority', filter)
    try {
      const r = await fetch(`${API}/api/comms/messages?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      const list = Array.isArray(data) ? data : (data.items || [])
      setMessages(list)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { fetchMessages() }, [fetchMessages])
  useEffect(() => {
    const id = setInterval(fetchMessages, 15000)
    return () => clearInterval(id)
  }, [fetchMessages])

  async function acknowledge(id) {
    setAcking(true)
    const token = sessionStorage.getItem('hs_token')
    try {
      await fetch(`${API}/api/comms/acknowledge/${id}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      })
      setMessages(prev => prev.map(m => m.id === id ? { ...m, acknowledged_at: new Date().toISOString() } : m))
      if (selected?.id === id) setSelected(m => ({ ...m, acknowledged_at: new Date().toISOString() }))
    } catch {}
    setAcking(false)
  }

  async function reply(id) {
    if (!replyText.trim()) return
    setSending(true)
    const token = sessionStorage.getItem('hs_token')
    try {
      await fetch(`${API}/api/comms/reply/${id}`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: replyText }),
        credentials: 'include',
      })
      setReplyText('')
    } catch (err) {
      alert('Reply failed: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  const FILTERS = [
    { key: 'all',       label: 'All' },
    { key: 'emergency', label: '🚨 Emergency' },
    { key: 'high',      label: '⚠️ High' },
    { key: 'medium',    label: '📢 Medium' },
  ]

  const unacked = messages.filter(m => !m.acknowledged_at).length

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      {/* Left panel — message list */}
      <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>📡 Field Comms</span>
            {unacked > 0 && <span style={{ background: 'var(--accent-red)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>{unacked}</span>}
            <button style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} onClick={fetchMessages}>↺</button>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {FILTERS.map(f => (
              <button key={f.key} className={`filter-pill ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && [1,2,3].map(i => <MsgSkeleton key={i} />)}
          {!loading && error && (
            <div className="error-state" style={{ margin: 16 }}>
              <div className="error-state-title">Load failed</div>
              <div className="error-state-msg">{error}</div>
              <button className="btn btn-secondary btn-sm" onClick={fetchMessages}>↺ Retry</button>
            </div>
          )}
          {!loading && !error && messages.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">📻</div>
              <div className="empty-state-title">No messages</div>
              <div className="empty-state-sub">Field communications will appear here.</div>
            </div>
          )}
          {messages.map(msg => (
            <MsgItem key={msg.id} msg={msg} selected={selected?.id === msg.id} onClick={m => { setSelected(m); setReplyText('') }} />
          ))}
        </div>
      </div>

      {/* Right panel — detail */}
      <div style={{ flex: 1, overflow: 'hidden', background: 'var(--bg-base)' }}>
        {selected ? (
          <MsgDetail
            msg={selected}
            onAck={() => acknowledge(selected.id)}
            onReply={() => reply(selected.id)}
            acking={acking}
            replyText={replyText}
            setReplyText={setReplyText}
            sending={sending}
          />
        ) : (
          <div className="empty-state" style={{ height: '100%' }}>
            <div className="empty-state-icon">💬</div>
            <div className="empty-state-title">Select a message</div>
            <div className="empty-state-sub">Click a message on the left to view details and reply.</div>
          </div>
        )}
      </div>
    </div>
  )
}
