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
import './styles/brand.css'
import { TranslationRuntime } from './components/TranslationControl'

const DashboardApp = lazy(() => import('./pages/DashboardApp'))
const ExecutionPage = lazy(() => import('./pages/ExecutionPage'))
const MailActionPage = lazy(() => import('./pages/MailActionPage'))
const SuperAdminPage = lazy(() => import('./pages/SuperAdminPage'))

function RouteLoading() {
  return (
    <div className="route-loading-skeleton" role="status" aria-label="Loading page">
      <span className="route-loading-skeleton-title" />
      <span className="route-loading-skeleton-line" />
      <span className="route-loading-skeleton-line route-loading-skeleton-line-short" />
      <span className="sr-only">Loading page…</span>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <TranslationRuntime />
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
            <Route
              path="/app/execution"
              element={<ProtectedRoute><Suspense fallback={<RouteLoading />}><ExecutionPage /></Suspense></ProtectedRoute>}
            />
            <Route
              path="/app/mail"
              element={<ProtectedRoute><Suspense fallback={<RouteLoading />}><MailActionPage /></Suspense></ProtectedRoute>}
            />
            <Route
              path="/app/*"
              element={<ProtectedRoute><Suspense fallback={<RouteLoading />}><DashboardApp /></Suspense></ProtectedRoute>}
            />
            <Route
              path="/admin"
              element={<SuperAdminRoute><Suspense fallback={<RouteLoading />}><SuperAdminPage /></Suspense></SuperAdminRoute>}
            />
            <Route path="*" element={<EntryRedirect />} />
          </Routes>
        </DialogProvider>
      </AppSplashGate>
    </AuthProvider>
  )
}

export default App
