import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import './styles/brand.css'

// Code-split the authenticated dashboard (Recharts + FullCalendar) away from
// the public marketing/auth pages so first-time visitors don't pay for it.
const DashboardApp = lazy(() => import('./pages/DashboardApp'))

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/app/*"
          element={
            <ProtectedRoute>
              <Suspense fallback={<div className="route-loading">Loading…</div>}>
                <DashboardApp />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
