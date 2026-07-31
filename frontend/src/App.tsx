import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import SuperAdminRoute from './components/SuperAdminRoute'
import SplashScreen from './pages/SplashScreen'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import ResendVerificationPage from './pages/ResendVerificationPage'
import InvitationAcceptPage from './pages/InvitationAcceptPage'
import './styles/brand.css'

// Code-split the authenticated dashboard (Recharts + FullCalendar) away from
// the public marketing/auth pages so first-time visitors don't pay for it.
const DashboardApp = lazy(() => import('./pages/DashboardApp'))
const SuperAdminPage = lazy(() => import('./pages/SuperAdminPage'))

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<SplashScreen />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/resend-verification" element={<ResendVerificationPage />} />
        <Route path="/invite/:token" element={<InvitationAcceptPage />} />
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
        <Route
          path="/admin"
          element={
            <SuperAdminRoute>
              <Suspense fallback={<div className="route-loading">Loading…</div>}>
                <SuperAdminPage />
              </Suspense>
            </SuperAdminRoute>
          }
        />
        <Route path="*" element={<SplashScreen />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
