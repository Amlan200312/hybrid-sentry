import { useState, useEffect, useRef } from 'react'
import { authFetch, authWS, getUser } from '../../utils/api'

export default function RecorderCommsPage({ isMobile }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  
  const [pttActive, setPttActive] = useState(false)
  const [broadcast, setBroadcast] = useState('')
  const [recorders, setRecorders] = useState([])
  
  const bottomRef = useRef(null)
  const wsRef = useRef(null)

  const user = getUser()
  const myUser = user?.username || 'recorder'
  const myName = user?.display_name || 'Recorder'

  useEffect(() => {
    async function load() {
      const resMsg = await authFetch('/api/comms/my-messages?limit=50').catch(()=>{})
      if (resMsg && resMsg.ok) {
        const data = await resMsg.json().catch(()=>({}))
        const list = Array.isArray(data) ? data : (data.messages || [])
        const mapped = list.map(m => ({
          id: m.id, content: m.text || m.content,
          sender_id: m.username || m.sender_id,
          sender_name: m.callsign || m.username || m.sender_name,
          timestamp: m.timestamp
        }))
        setMessages(mapped.reverse())
      }
      
      const resUsers = await authFetch('/api/recorders').catch(()=>{})
      if (resUsers && resUsers.ok) {
        const data = await resUsers.json().catch(()=>[])
        setRecorders(Array.isArray(data) ? data : (data.recorders || []))
      }
    }
    load()

    try {
      wsRef.current = authWS('/ws/monitor')
      wsRef.current.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'message' || msg.content) {
            setMessages(prev => [...prev, {
              id: msg.id || Date.now(),
              content: msg.content || msg.text,
              sender_id: msg.sender_id || msg.username,
              sender_name: msg.sender_name || msg.callsign || msg.username,
              timestamp: msg.timestamp || new Date().toISOString()
            }])
          }
        } catch {}
      }
    } catch {}
    return () => wsRef.current?.close()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!text.trim() || sending) return
    setSending(true)
    const optimistic = {
      id: Date.now(), content: text.trim(),
      sender_id: myUser, sender_name: myName,
      timestamp: new Date().toISOString(), _mine: true
    }
    setMessages(prev => [...prev, optimistic])
    setText('')
    await authFetch('/api/comms/messages', {
      method: 'POST', body: JSON.stringify({ content: optimistic.content, sender_id: myUser })
    }).catch(()=>{})
    setSending(false)
  }

  // PTT requires hardware mic relay — disabled in web client
  const handlePttStart = () => {}
  const handlePttStop = () => {}

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: 16, height: isMobile ? '100%' : 'calc(100vh - 120px)' }}>
      {/* LEFT: Messages */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: isMobile ? 400 : 0 }}>
        <div className="panel-header">
          <span>Field Comms</span>
          <span className="badge badge-green"><div className="live-dot" style={{ width: 5, height: 5 }} />Live</span>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, minHeight: 0 }}>
          {messages.length === 0 ? (
            <div className="empty-state" style={{ padding: 40 }}>💬 No messages yet</div>
          ) : (
            messages.map((msg, i) => {
              const isMine = msg._mine || msg.sender_id === myUser
              const ts = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              return (
                <div key={msg.id || i} style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: isMine ? 'flex-end' : 'flex-start',
                  marginBottom: 12
                }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
                    {msg.sender_name || msg.sender_id} · {ts}
                  </div>
                  <div style={{
                    background: isMine ? 'rgba(56,139,253,0.15)' : '#1c2128',
                    border: `1px solid ${isMine ? 'rgba(56,139,253,0.2)' : '#30363d'}`,
                    borderRadius: 8, padding: '8px 12px', maxWidth: '70%',
                    fontSize: 13, color: 'var(--text-primary)'
                  }}>
                    {msg.content}
                  </div>
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>

        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          <input
            className="input"
            style={{ flex: 1, height: 38, borderRadius: 20, background: '#1c2128' }}
            placeholder="Type a message..."
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            disabled={sending}
          />
          <button 
            className="btn btn-primary"
            style={{ width: 38, height: 38, borderRadius: '50%', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={sendMessage}
            disabled={!text.trim() || sending}
          >
            ↑
          </button>
        </div>
      </div>

      {/* RIGHT: Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
        <div className="panel">
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 12px' }}>
            <button
              style={{
                width: 88, height: 88, borderRadius: '50%',
                background: '#1c2128',
                border: '2px solid #30363d',
                color: '#4a5568',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
                cursor: 'not-allowed', transition: 'all 0.15s',
              }}
              disabled
            >
              🎙️
            </button>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 12, fontWeight: 600, letterSpacing: '0.05em' }}>
              PTT NOT AVAILABLE
            </div>
            <div style={{ fontSize: 9, color: '#4a5568', marginTop: 4, textAlign: 'center' }}>Hardware relay required</div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">Broadcast</div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <textarea
              className="input"
              rows={3}
              placeholder="Broadcast message..."
              value={broadcast}
              onChange={e => setBroadcast(e.target.value)}
              style={{ width: '100%', resize: 'none' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button 
                className="btn btn-secondary" 
                style={{ flex: 1, borderColor: '#f85149', color: '#f85149' }}
                onClick={() => authFetch('/api/comms/alert', { method: 'POST', body: JSON.stringify({ type: 'emergency' }) }).catch(()=>{})}
              >
                🚨 Alert All
              </button>
              <button 
                className="btn btn-secondary" 
                style={{ flex: 1, borderColor: '#388bfd', color: '#388bfd' }}
                onClick={() => { if (broadcast.trim()) authFetch('/api/comms/messages', { method: 'POST', body: JSON.stringify({ content: broadcast, broadcast: true }) }).catch(()=>{}); setBroadcast('') }}
                disabled={!broadcast.trim()}
              >
                📢 Msg All
              </button>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">Online Now</div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recorders.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>No users online</div>
            ) : (
              recorders.map(r => (
                <div key={r.id || r.username} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', background: 'rgba(56,139,253,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#388bfd', fontSize: 10, fontWeight: 700
                  }}>
                    {(r.display_name || r.username || '?').slice(0, 2).toUpperCase()}
                  </div>
                  <span style={{ fontSize: 13, flex: 1 }}>{r.display_name || r.username}</span>
                  <span className="badge badge-blue">{r.role}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
