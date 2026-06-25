import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe, logout, MeResponse } from '../api/auth';

interface Props {
  onLogout: () => void;
  isAdmin: boolean;
}

export default function WelcomePage({ onLogout, isAdmin }: Props) {
  const navigate = useNavigate();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    getMe().then((data) => {
      if (!data) {
        navigate('/', { replace: true });
      } else {
        setUser(data);
        setLoading(false);
      }
    });
  }, [navigate]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      // mesmo com erro, limpa o estado local
    }
    onLogout();
    navigate('/', { replace: true });
  }

  if (loading) {
    return (
      <div className="page">
        <div className="spinner spinner--dark" style={{ width: 32, height: 32, borderWidth: 3 }} />
      </div>
    );
  }

  const expiresAt = user?.expiresAt ? new Date(user.expiresAt) : null;
  const sessionHours = expiresAt
    ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 3_600_000))
    : null;

  return (
    <div className="page">
      <div className="card">
        <div className="welcome-icon">✅</div>

        <h1 className="card__title" style={{ textAlign: 'center' }}>
          Bem-vindo!
        </h1>
        <p className="card__subtitle" style={{ textAlign: 'center', marginBottom: 12 }}>
          Você está autenticado como
        </p>
        <p style={{ textAlign: 'center', marginBottom: 24 }}>
          <span className="welcome-email">{user?.email}</span>
        </p>

        {expiresAt && (
          <div className="session-info">
            <p>
              <strong>Sessão ativa</strong><br />
              Expira em: <strong>{expiresAt.toLocaleString('pt-BR')}</strong>
              {sessionHours !== null && sessionHours > 0 && (
                <> (~{sessionHours}h restante{sessionHours !== 1 ? 's' : ''})</>
              )}
            </p>
          </div>
        )}

        <button
          type="button"
          className="btn btn--primary"
          style={{ marginBottom: 8 }}
          onClick={() => navigate('/reports')}
        >
          Relatórios
        </button>

        {isAdmin && (
          <button
            type="button"
            className="btn btn--ghost"
            style={{ marginBottom: 8 }}
            onClick={() => navigate('/admin/users')}
          >
            Painel Administrativo
          </button>
        )}

        <button
          type="button"
          className="btn btn--danger"
          onClick={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? <><span className="spinner" style={{ borderTopColor: '#dc2626', borderColor: 'rgba(220,38,38,0.2)' }} /> Saindo...</> : '🚪 Sair'}
        </button>

        <p className="hint">
          Ao sair, sua sessão é encerrada imediatamente<br />e um novo código OTP será necessário para entrar.
        </p>
      </div>
    </div>
  );
}
