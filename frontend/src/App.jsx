import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import MonitorDashboard from './pages/MonitorDashboard'
import RecorderDashboard from './pages/RecorderDashboard'
import RoleSelect from './pages/RoleSelect'

const ProtectedRoute = ({ children }) => {
  const user = localStorage.getItem('user')
  const token = localStorage.getItem('token')
  if (!user || !token) return <Navigate to="/login" replace />
  return children
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/monitor" element={<ProtectedRoute><MonitorDashboard /></ProtectedRoute>} />
        <Route path="/recorder" element={<ProtectedRoute><RecorderDashboard /></ProtectedRoute>} />
        <Route path="/role-select" element={<ProtectedRoute><RoleSelect /></ProtectedRoute>} />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
export default App
