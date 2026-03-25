export const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
export const WS = import.meta.env.VITE_WS_URL || 'ws://localhost:8000'

export const getToken = () => localStorage.getItem('token') || sessionStorage.getItem('token')

export const getUser = () => {
  const user = localStorage.getItem('user') || sessionStorage.getItem('user')
  try {
    return user ? JSON.parse(user) : null
  } catch (e) {
    return null
  }
}

export const authFetch = async (endpoint, options = {}) => {
  const token = getToken()
  const headers = {
    ...options.headers,
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  // Default to include credentials for CORS if needed, but not required if token is sent
  // headers['Content-Type'] will be set by the caller if needed, except if it's FormData.
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const url = `${API}${endpoint}`

  try {
    const response = await fetch(url, {
      ...options,
      headers
    })

    if (response.status === 401) {
      // Unauthorized, clear token and redirect to login
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      sessionStorage.removeItem('token')
      sessionStorage.removeItem('user')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
      return null
    }

    return response
  } catch (error) {
    console.error('authFetch Error:', error)
    return null
  }
}

export const authWS = (endpoint) => {
  const token = getToken()
  const tokenQuery = token ? `?token=${token}` : ''
  const url = `${WS}${endpoint}${tokenQuery}`

  let ws = null
  let reconnectAttempts = 0
  const maxReconnectAttempts = 5
  const baseDelay = 1000
  // User-supplied handlers stored here so we can re-attach after reconnect
  let _onmessage = null
  let _onerror = null
  let _onopen = null
  let _onclose = null

  const connect = () => {
    ws = new WebSocket(url)
    ws.onopen = (ev) => {
      console.log(`[WS] Connected to ${endpoint}`)
      reconnectAttempts = 0
      _onopen?.(ev)
    }
    ws.onmessage = (ev) => _onmessage?.(ev)
    ws.onerror = (ev) => { console.error(`[WS] Error ${endpoint}:`, ev); _onerror?.(ev) }
    ws.onclose = (ev) => {
      console.log(`[WS] Closed ${endpoint}, code=${ev.code}`)
      _onclose?.(ev)
      if (reconnectAttempts < maxReconnectAttempts) {
        const delay = Math.min(baseDelay * Math.pow(2, reconnectAttempts), 30000)
        reconnectAttempts++
        console.warn(`[WS] Reconnecting ${endpoint} in ${delay}ms (attempt ${reconnectAttempts})`)
        setTimeout(connect, delay)
      }
    }
  }

  connect()

  // Return a proxy that stores handler assignments and forwards to current ws
  return {
    get readyState() { return ws?.readyState ?? WebSocket.CLOSED },
    set onmessage(fn) { _onmessage = fn; if (ws) ws.onmessage = (ev) => fn(ev) },
    get onmessage() { return _onmessage },
    set onerror(fn) { _onerror = fn },
    get onerror() { return _onerror },
    set onopen(fn) { _onopen = fn },
    get onopen() { return _onopen },
    set onclose(fn) { _onclose = fn },
    get onclose() { return _onclose },
    send(data) { if (ws?.readyState === WebSocket.OPEN) ws.send(data) },
    close() { reconnectAttempts = maxReconnectAttempts; ws?.close() },
  }
}
