import { useState, useEffect, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import './index.css'
import Login            from './pages/Login'
import Register         from './pages/Register'
import RoleSelect       from './pages/RoleSelect'
import SetupWizard      from './pages/SetupWizard'
import MonitorDashboard from './pages/MonitorDashboard'
import RecorderMobile   from './pages/RecorderMobile'
import RecorderPC       from './pages/RecorderPC'
import SentryPortal     from './pages/SentryPortal'
import RecorderDashboard from './pages/RecorderDashboard'
import LoadingScreen    from './components/LoadingScreen'

const API = '/api'

/* ── Auth guard ──────────────────────────────────────────────── */
function RequireAuth({ children, allowedRoles }) {
  const token = sessionStorage.getItem('hs_token')
  const role  = sessionStorage.getItem('hs_role')
  if (!token) return <Navigate to="/login" replace />
  if (allowedRoles && !allowedRoles.includes(role)) {
    // redirect to correct destination based on role
    const dest = (role === 'recorder') ? '/recorder' : '/monitor'
    return <Navigate to={dest} replace />
  }
  return children
}

/* ── App routes ──────────────────────────────────────────────── */
function AppRoutes() {
  const navigate  = useNavigate()
  const [checking, setChecking] = useState(true)
  const [apiError, setApiError] = useState(null)
  const [retryKey, setRetryKey] = useState(0)

  const checkStartup = useCallback(() => {
    setChecking(true)
    setApiError(null)

    fetch(`${API}/api/system/setup-required`, { signal: AbortSignal.timeout(8000) })
      .then(r => r.json())
      .then(data => {
        if (data.setup_required) {
          navigate('/setup', { replace: true })
          return
        }
        const token = sessionStorage.getItem('hs_token')
        const role  = sessionStorage.getItem('hs_role')
        const path  = window.location.pathname
        if (!token && path !== '/login' && path !== '/register' && path !== '/setup') {
          navigate('/login', { replace: true })
        } else if (token && (path === '/' || path === '/login')) {
          // Role-based redirect
          if (role === 'recorder') navigate('/recorder', { replace: true })
          else navigate('/monitor', { replace: true })
        }
      })
      .catch(() => {
        setApiError({
          title: 'Cannot reach server',
          detail: 'Make sure the backend is running:',
        })
      })
      .finally(() => setChecking(false))
  }, [navigate])

  useEffect(() => { checkStartup() }, [checkStartup, retryKey]) // eslint-disable-line

  if (checking) {
    return <LoadingScreen />
  }

  if (apiError) {
    return (
      <LoadingScreen
        error={apiError}
        showSpinner={false}
        onRetry={() => setRetryKey(k => k + 1)}
      />
    )
  }

  return (
    <Routes>
      {/* Public */}
      <Route path="/setup"    element={<SetupWizard />} />
      <Route path="/login"    element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Post-login workspace chooser */}
      <Route path="/select" element={
        <RequireAuth allowedRoles={['admin', 'monitor', 'recorder']}>
          <RoleSelect />
        </RequireAuth>
      } />

      {/* Command Center — admin + monitor */}
      <Route path="/dashboard" element={
        <RequireAuth allowedRoles={['admin', 'monitor']}>
          <MonitorDashboard />
        </RequireAuth>
      } />
      <Route path="/monitor" element={<Navigate to="/dashboard" replace />} />

      {/* Field Recorder — dedicated dashboard for recorder role */}
      <Route path="/recorder" element={
        <RequireAuth allowedRoles={['admin', 'monitor', 'recorder']}>
          <RecorderDashboard />
        </RequireAuth>
      } />

      {/* Legacy recorder routes — still work */}
      <Route path="/record/pc" element={
        <RequireAuth allowedRoles={['admin', 'monitor', 'recorder']}>
          <RecorderMobile />
        </RequireAuth>
      } />
      <Route path="/record/mobile" element={
        <RequireAuth allowedRoles={['admin', 'monitor', 'recorder']}>
          <RecorderMobile />
        </RequireAuth>
      } />
      <Route path="/recorder-mobile" element={<Navigate to="/record/mobile" replace />} />

      {/* Sentry Portal */}
      <Route path="/portal" element={
        <RequireAuth allowedRoles={['admin', 'monitor', 'recorder']}>
          <SentryPortal />
        </RequireAuth>
      } />

      {/* Root fallback */}
      <Route path="/" element={
        (() => {
          const token = sessionStorage.getItem('hs_token')
          const role  = sessionStorage.getItem('hs_role')
          if (!token) return <Navigate to="/login" replace />
          return <Navigate to={role === 'recorder' ? '/recorder' : '/monitor'} replace />
        })()
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
