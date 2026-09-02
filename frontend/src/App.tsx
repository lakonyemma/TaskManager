import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import DialogProvider from './context/DialogProvider'
import ProtectedRoute from './components/ProtectedRoute'
import SuperAdminRoute from './components/SuperAdminRoute'
import AppSplashGate from './components/AppSplashGate'
import EntryRedirect from './pages/EntryRedirect'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import ResendVerificationPage from './pages/ResendVerificationPage'
import InvitationAcceptPage from './pages/InvitationAcceptPage'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'
import TermsPage from './pages/TermsPage'
import BillingPage from './pages/BillingPage'
import BillingAdminPage from './pages/BillingAdminPage'
import './styles/brand.css'

const DashboardApp = lazy(() => import('./pages/DashboardApp'))
const SuperAdminPage = lazy(() => import('./pages/SuperAdminPage'))

function App() {
  return (
    <AuthProvider>
      <AppSplashGate>
        <DialogProvider>
          <Routes>
            <Route path="/" element={<EntryRedirect />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/resend-verification" element={<ResendVerificationPage />} />
            <Route path="/invite/:token" element={<InvitationAcceptPage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/billing" element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
            <Route path="/admin/billing" element={<SuperAdminRoute><BillingAdminPage /></SuperAdminRoute>} />
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
            <Route path="*" element={<EntryRedirect />} />
          </Routes>
        </DialogProvider>
      </AppSplashGate>
    </AuthProvider>
  )
}

export default App
