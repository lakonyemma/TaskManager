import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import DialogProvider from './context/DialogProvider'
import ProtectedRoute from './components/ProtectedRoute'
import SuperAdminRoute from './components/SuperAdminRoute'
import AppSplashGate from './components/AppSplashGate'
import EntryRedirect from './pages/EntryRedirect'
import './styles/brand.css'
import { TranslationRuntime } from './components/TranslationControl'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'))
const ResendVerificationPage = lazy(() => import('./pages/ResendVerificationPage'))
const InvitationAcceptPage = lazy(() => import('./pages/InvitationAcceptPage'))
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'))
const TermsPage = lazy(() => import('./pages/TermsPage'))

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
            <Route path="/login" element={<Suspense fallback={<RouteLoading />}><LoginPage /></Suspense>} />
            <Route path="/register" element={<Suspense fallback={<RouteLoading />}><RegisterPage /></Suspense>} />
            <Route path="/verify-email" element={<Suspense fallback={<RouteLoading />}><VerifyEmailPage /></Suspense>} />
            <Route path="/resend-verification" element={<Suspense fallback={<RouteLoading />}><ResendVerificationPage /></Suspense>} />
            <Route path="/invite/:token" element={<Suspense fallback={<RouteLoading />}><InvitationAcceptPage /></Suspense>} />
            <Route path="/privacy" element={<Suspense fallback={<RouteLoading />}><PrivacyPolicyPage /></Suspense>} />
            <Route path="/terms" element={<Suspense fallback={<RouteLoading />}><TermsPage /></Suspense>} />
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
