import { useState, useEffect, useRef } from 'react'

const API = 'http://localhost:8000'
const WS_URL = 'ws://localhost:8000/ws/messages'

function Avatar({ name, size = 28 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'rgba(56,139,253,0.15)', border: '1px solid rgba(56,139,253,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: 'var(--accent-blue)',
      flexShrink: 0,
    }}>
      {initials}
    </div>
  )
}

export default function FieldCommsPage() {
  const [messages, setMessages]   = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [text, setText]           = useState('')
  const [sending, setSending]     = useState(false)
  const [pttActive, setPttActive] = useState(false)
  const [broadcast, setBroadcast] = useState('')
  const [recorders, setRecorders] = useState([])
  const bottomRef = useRef(null)
  const wsRef = useRef(null)

  const myUser = sessionStorage.getItem('hs_username') || 'monitor'
  const myName = sessionStorage.getItem('hs_display_name') || 'Monitor'

  function fetchMessages() {
    setLoading(true)
    const token = sessionStorage.getItem('hs_token')
    fetch(`${API}/api/comms/messages?limit=50`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => {
        const list = Array.isArray(d) ? d : (d.messages || [])
        setMessages(list)
        setLoading(false)
      })
      .catch(e => { setError(String(e)); setLoading(false) })
  }

  function fetchRecorders() {
    const token = sessionStorage.getItem('hs_token')
    fetch(`${API}/api/recorders`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const list = d ? (Array.isArray(d) ? d : (d.recorders || [])) : []
        setRecorders(list)
      })
      .catch(() => {})
  }

  useEffect(() => {
    fetchMessages()
    fetchRecorders()
    // WebSocket
    try {
      wsRef.current = new WebSocket(WS_URL)
      wsRef.current.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'message' || msg.content) {
            setMessages(prev => [...(prev || []), msg])
          }
        } catch {}
      }
    } catch {}
    return () => { wsRef.current?.close() }
  }, []) // eslint-disable-line

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    if (!text.trim() || sending) return
    setSending(true)
    const token = sessionStorage.getItem('hs_token')
    const optimistic = {
      id: Date.now(),
      content: text.trim(),
      sender_id: myUser,
      sender_name: myName,
      timestamp: new Date().toISOString(),
      _mine: true,
    }
    setMessages(prev => [...(prev || []), optimistic])
    setText('')
    try {
      await fetch(`${API}/api/comms/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ content: optimistic.content, sender_id: myUser }),
      })
    } catch {}
    setSending(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, height: 'calc(100vh - 120px)' }}>
      {/* LEFT: Messages */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="panel-header">
          <span>Field Communications</span>
          <span className="badge badge-green"><div className="live-dot" style={{ width: 5, height: 5 }} />Live</span>
        </div>

        {/* Message list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', minHeight: 0 }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1,2,3,4].map(i => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div className="skeleton" style={{ width: 28, height: 28, borderRadius: '50%' }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ height: 10, width: '30%', marginBottom: 6 }} />
                    <div className="skeleton" style={{ height: 30, width: '70%' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="error-state">
              <div style={{ fontSize: 13, color: 'var(--accent-red)', fontWeight: 600 }}>Failed to load</div>
              <button className="btn btn-secondary btn-sm" onClick={fetchMessages}>↺ Retry</button>
            </div>
          ) : (!messages || messages.length === 0) ? (
            <div className="empty-state">
              <div className="empty-state-icon">💬</div>
              <div className="empty-state-title">No messages yet</div>
            </div>
          ) : (
            messages.map((msg, i) => {
              const isMine = msg._mine || msg.sender_id === myUser
              const ts = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
              return (
                <div
                  key={msg.id || i}
                  style={{
                    display: 'flex',
                    justifyContent: isMine ? 'flex-end' : 'flex-start',
                    gap: 8, marginBottom: 10,
                    alignItems: 'flex-start',
                    flexDirection: isMine ? 'row-reverse' : 'row',
                  }}
                >
                  <Avatar name={msg.sender_name || msg.sender_id || '?'} size={26} />
                  <div style={{ maxWidth: '70%' }}>
                    <div style={{
                      fontSize: 10, color: 'var(--text-muted)', marginBottom: 3,
                      textAlign: isMine ? 'right' : 'left',
                    }}>
                      {msg.sender_name || msg.sender_id} · {ts}
                    </div>
                    <div style={{
                      background: isMine ? 'rgba(56,139,253,0.2)' : 'var(--bg-elevated)',
                      border: `1px solid ${isMine ? 'rgba(56,139,253,0.3)' : 'var(--border)'}`,
                      borderRadius: isMine ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                      padding: '8px 12px',
                      fontSize: 13,
                      color: 'var(--text-primary)',
                    }}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input sub-panel */}
        <div style={{
          padding: '10px 12px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: 8,
          background: 'var(--bg-surface)',
          flexShrink: 0,
        }}>
          <input
            className="input"
            style={{ flex: 1, height: 36 }}
            placeholder="Type a message… (Enter to send)"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={sendMessage}
            disabled={!text.trim() || sending}
          >
            {sending ? <div className="spinner" style={{ width: 12, height: 12, borderTopColor: '#fff' }} /> : '↑'}
          </button>
        </div>
      </div>

      {/* RIGHT: PTT + Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
        {/* PTT */}
        <div className="panel">
          <div className="panel-header">Push to Talk</div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 20 }}>
            <button
              style={{
                width: 80, height: 80, borderRadius: '50%',
                background: pttActive ? 'rgba(248,81,73,0.2)' : 'rgba(56,139,253,0.1)',
                border: `3px solid ${pttActive ? 'var(--accent-red)' : 'var(--accent-blue)'}`,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28, transition: 'all 150ms',
                boxShadow: pttActive ? '0 0 20px rgba(248,81,73,0.4)' : 'none',
              }}
              onMouseDown={() => setPttActive(true)}
              onMouseUp={() => setPttActive(false)}
              onMouseLeave={() => setPttActive(false)}
              onTouchStart={() => setPttActive(true)}
              onTouchEnd={() => setPttActive(false)}
            >
              🎙️
            </button>
            <div style={{ fontSize: 11, fontWeight: 700, color: pttActive ? 'var(--accent-red)' : 'var(--text-muted)', letterSpacing: '0.08em' }}>
              {pttActive ? 'TRANSMITTING…' : 'HOLD TO TALK'}
            </div>
          </div>
        </div>

        {/* Broadcast */}
        <div className="panel">
          <div className="panel-header">Broadcast</div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              className="input"
              style={{ height: 36 }}
              placeholder="Broadcast message…"
              value={broadcast}
              onChange={e => setBroadcast(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-danger btn-sm" style={{ flex: 1 }}>🚨 Alert All</button>
              <button className="btn btn-amber btn-sm" style={{ flex: 1 }}>📡 Message All</button>
            </div>
          </div>
        </div>

        {/* Active Recorders */}
        <div className="panel">
          <div className="panel-header">Active Recorders</div>
          <div className="panel-body">
            {recorders.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>
                No recorders online
              </div>
            ) : (
              recorders.map(rec => (
                <div key={rec.id || rec.recorder_id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 0', borderBottom: '1px solid var(--bg-elevated)', fontSize: 12,
                }}>
                  <span style={{ color: 'var(--text-primary)' }}>{rec.name || rec.recorder_name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className={`badge badge-${rec.status === 'ONLINE' ? 'green' : 'muted'}`}>
                      {rec.status || 'OFFLINE'}
                    </span>
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
