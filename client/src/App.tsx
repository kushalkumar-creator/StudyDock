import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import { AuthCallback } from './pages/AuthCallback';
import { BookSeat } from './pages/BookSeat';
import { Books } from './pages/Books';
import { Dashboard } from './pages/Dashboard';
import { ForgotPassword } from './pages/ForgotPassword';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Reservations } from './pages/Reservations';
import { ResetPassword } from './pages/ResetPassword';
import { AdminAnalytics } from './pages/admin/AdminAnalytics';
import { AdminBooks } from './pages/admin/AdminBooks';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminSettings } from './pages/admin/AdminSettings';
import { GateCheck } from './pages/admin/GateCheck';
import { ProtectedRoute, RoleRoute } from './routes/ProtectedRoute';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/books" element={<Books />} />

            {/* Student-only routes (admins redirected to /admin) */}
            <Route element={<ProtectedRoute />}>
              <Route element={<RoleRoute allow="student" />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/book" element={<BookSeat />} />
                <Route path="/reservations" element={<Reservations />} />
              </Route>

              {/* Admin-only routes (students redirected to /dashboard) */}
              <Route element={<RoleRoute allow="admin" />}>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/gate" element={<GateCheck />} />
                <Route path="/admin/books" element={<AdminBooks />} />
                <Route path="/admin/analytics" element={<AdminAnalytics />} />
                <Route path="/admin/settings" element={<AdminSettings />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
