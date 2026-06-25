import { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { logout } from '../../api/auth';

interface Props {
  children: ReactNode;
  onLogout: () => void;
}

export default function AdminLayout({ children, onLogout }: Props) {
  const navigate = useNavigate();

  async function handleLogout() {
    try { await logout(); } catch { /* ignora */ }
    onLogout();
    navigate('/', { replace: true });
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <span className="admin-header__brand">Painel Administrativo</span>
        <nav className="admin-nav">
          <NavLink to="/admin/users"    className={({ isActive }) => 'admin-nav__link' + (isActive ? ' admin-nav__link--active' : '')}>Usuários</NavLink>
          <NavLink to="/admin/sessions" className={({ isActive }) => 'admin-nav__link' + (isActive ? ' admin-nav__link--active' : '')}>Sessões Ativas</NavLink>
          <NavLink to="/admin/audit"    className={({ isActive }) => 'admin-nav__link' + (isActive ? ' admin-nav__link--active' : '')}>Histórico</NavLink>
          <NavLink to="/reports"        className={({ isActive }) => 'admin-nav__link' + (isActive ? ' admin-nav__link--active' : '')}>Relatórios</NavLink>
        </nav>
        <div className="admin-header__actions">
          <button className="btn btn--ghost btn--sm" onClick={() => navigate('/welcome')}>← Voltar</button>
          <button className="btn btn--danger btn--sm" onClick={handleLogout}>Sair</button>
        </div>
      </header>
      <main className="admin-content">
        {children}
      </main>
    </div>
  );
}
