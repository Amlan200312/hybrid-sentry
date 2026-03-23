export const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
export const WS = import.meta.env.VITE_WS_URL || 'ws://localhost:8000'

export const getToken = () => localStorage.getItem('token')

export const getUser = () => {
  const user = localStorage.getItem('user')
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
  return new WebSocket(`${WS}${endpoint}${tokenQuery}`)
}
