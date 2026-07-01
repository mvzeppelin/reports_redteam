import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { getMe, MeResponse } from './api/auth';
import LoginPage from './pages/LoginPage';
import OTPPage from './pages/OTPPage';
import WelcomePage from './pages/WelcomePage';
import AdminLayout from './pages/admin/AdminLayout';
import UsersPage from './pages/admin/UsersPage';
import SessionsPage from './pages/admin/SessionsPage';
import AuditPage from './pages/admin/AuditPage';
import ReportsPage from './pages/ReportsPage';

type AuthState = 'loading' | 'unauthenticated' | 'authenticated';

export default function App() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [user, setUser] = useState<MeResponse | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string>(() => {
    return sessionStorage.getItem('pending_email') ?? '';
  });

  useEffect(() => {
    getMe().then((me) => {
      setUser(me);
      setAuthState(me ? 'authenticated' : 'unauthenticated');
    });
  }, []);

  function handleEmailSent(email: string, _expiresAt: string) {
    setPendingEmail(email);
    sessionStorage.setItem('pending_email', email);
  }

  function handleAuthenticated() {
    sessionStorage.removeItem('pending_email');
    setPendingEmail('');
    getMe().then((me) => {
      setUser(me);
      setAuthState('authenticated');
    });
  }

  function handleLogout() {
    sessionStorage.removeItem('pending_email');
    setPendingEmail('');
    setUser(null);
    setAuthState('unauthenticated');
  }

  if (authState === 'loading') {
    return (
      <div className="page">
        <div className="spinner spinner--dark" style={{ width: 32, height: 32, borderWidth: 3 }} />
      </div>
    );
  }

  const isAdmin = user?.isAdmin === true;
  const userRole = user?.role ?? 'report';

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            authState === 'authenticated'
              ? <Navigate to="/welcome" replace />
              : <LoginPage onEmailSent={handleEmailSent} />
          }
        />
        <Route
          path="/otp"
          element={
            authState === 'authenticated'
              ? <Navigate to="/welcome" replace />
              : !pendingEmail
              ? <Navigate to="/" replace />
              : <OTPPage email={pendingEmail} onAuthenticated={handleAuthenticated} onBack={() => setPendingEmail('')} />
          }
        />
        <Route
          path="/welcome"
          element={
            authState !== 'authenticated'
              ? <Navigate to="/" replace />
              : <WelcomePage onLogout={handleLogout} isAdmin={isAdmin} />
          }
        />
        <Route
          path="/admin"
          element={
            authState !== 'authenticated'
              ? <Navigate to="/" replace />
              : !isAdmin
              ? <Navigate to="/welcome" replace />
              : <AdminLayout onLogout={handleLogout}><Outlet /></AdminLayout>
          }
        >
          <Route index element={<Navigate to="/admin/users" replace />} />
          <Route path="users"    element={<UsersPage currentUserId={user?.email ?? ''} />} />
          <Route path="sessions" element={<SessionsPage currentUserEmail={user?.email ?? ''} />} />
          <Route path="audit"    element={<AuditPage />} />
        </Route>
        <Route
          path="/reports"
          element={
            authState !== 'authenticated'
              ? <Navigate to="/" replace />
              : <ReportsPage onLogout={handleLogout} role={userRole} />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
