import { useState, useEffect, useRef, useCallback } from 'react'

const WS_BASE = 'ws://localhost:8000'

/**
 * Robust WebSocket hook with auto-reconnect.
 * Returns { data, send, connected }
 */
export function useWebSocket(path) {
  const [data, setData]           = useState(null)
  const [connected, setConnected] = useState(false)
  const wsRef   = useRef(null)
  const timerRef = useRef(null)
  const mountedRef = useRef(true)

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    try {
      const token = sessionStorage.getItem('hs_token')
      const url   = `${WS_BASE}${path}${path.includes('?') ? '&' : '?'}token=${token || ''}`
      const ws    = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (mountedRef.current) setConnected(true)
      }

      ws.onmessage = (e) => {
        if (!mountedRef.current) return
        try {
          const msg = JSON.parse(e.data)
          setData(msg)
        } catch {}
      }

      ws.onclose = () => {
        if (!mountedRef.current) return
        setConnected(false)
        // Reconnect after 3 seconds
        timerRef.current = setTimeout(connect, 3000)
      }

      ws.onerror = () => {
        try { ws.close() } catch {}
      }
    } catch {}
  }, [path])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      clearTimeout(timerRef.current)
      try { wsRef.current?.close() } catch {}
    }
  }, [connect])

  const send = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof msg === 'string' ? msg : JSON.stringify(msg))
    }
  }, [])

  return { data, send, connected }
}

/**
 * Convenience hook: subscribe to monitor WebSocket and return typed sub-data.
 * Listens to /ws/monitor and dispatches by message type.
 */
export function useMonitorWS() {
  const { data, connected } = useWebSocket('/ws/monitor')
  const [detectionCounts, setDetectionCounts] = useState({ humans: 0, vehicles: 0, aerial: 0, unknown: 0 })
  const [newDetection, setNewDetection]       = useState(null)
  const [gpsUpdates, setGpsUpdates]           = useState({})
  const [systemStats, setSystemStats]         = useState(null)
  const [fieldMessage, setFieldMessage]       = useState(null)
  const [unreadComms, setUnreadComms]         = useState(0)
  const [pendingVerify, setPendingVerify]     = useState(0)

  useEffect(() => {
    if (!data) return
    switch (data.type) {
      case 'detection_counts':
        setDetectionCounts({
          humans:   data.humans   ?? 0,
          vehicles: data.vehicles ?? 0,
          aerial:   data.aerial   ?? 0,
          unknown:  data.unknown  ?? 0,
        })
        break
      case 'new_detection':
        setNewDetection(data)
        setPendingVerify(p => p + 1)
        break
      case 'gps_update':
        setGpsUpdates(prev => ({ ...prev, [data.node_id]: data }))
        break
      case 'system_stats':
        setSystemStats(data)
        break
      case 'field_message':
        setFieldMessage(data)
        setUnreadComms(p => p + 1)
        break
      default: break
    }
  }, [data])

  return {
    connected,
    detectionCounts,
    newDetection,
    gpsUpdates,
    systemStats,
    fieldMessage,
    unreadComms,
    pendingVerify,
    setPendingVerify,
    setUnreadComms,
  }
}

export default useWebSocket
