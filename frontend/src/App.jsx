import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import MonitorDashboard from './pages/MonitorDashboard'
import RecorderDashboard from './pages/RecorderDashboard'
import MobileRecorderDashboard from './pages/MobileRecorderDashboard'
import RoleSelect from './pages/RoleSelect'

const ProtectedRoute = ({ children }) => {
  const user = localStorage.getItem('user')
  const token = localStorage.getItem('token')
  if (!user || !token) return <Navigate to="/login" replace />
  return children
}

const RecorderEntry = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return isMobile ? <MobileRecorderDashboard /> : <RecorderDashboard />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/monitor" element={<ProtectedRoute><MonitorDashboard /></ProtectedRoute>} />
        <Route path="/recorder" element={<ProtectedRoute><RecorderEntry /></ProtectedRoute>} />
        <Route path="/role-select" element={<ProtectedRoute><RoleSelect /></ProtectedRoute>} />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
export default App
