import { useEffect, useState } from 'react';
import { listSessions, invalidateSession, AdminSession } from '../../api/admin';

interface Props {
  currentUserEmail: string;
}

export default function SessionsPage({ currentUserEmail }: Props) {
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setSessions(await listSessions());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleInvalidate(session: AdminSession) {
    const label = session.email === currentUserEmail ? 'sua sessão atual' : `a sessão de "${session.email}"`;
    if (!confirm(`Invalidar ${label}?`)) return;
    setActionError('');
    try {
      await invalidateSession(session.id);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
    } catch (e: any) {
      setActionError(e.message);
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h2 className="admin-page__title">Sessões Ativas</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="admin-page__count">{sessions.length} ativa{sessions.length !== 1 ? 's' : ''}</span>
          <button className="btn btn--ghost btn--sm" onClick={load}>Atualizar</button>
        </div>
      </div>

      {actionError && <div className="alert alert--error" style={{ marginBottom: 12 }}>{actionError}</div>}

      {loading ? (
        <div className="admin-loading"><span className="spinner spinner--dark" /></div>
      ) : error ? (
        <div className="alert alert--error">{error}</div>
      ) : sessions.length === 0 ? (
        <div className="alert alert--info">Nenhuma sessão ativa no momento.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Iniciada em</th>
                <th>Expira em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => {
                const isSelf = session.email === currentUserEmail;
                return (
                  <tr key={session.id}>
                    <td>
                      {session.email}
                      {isSelf && <span className="admin-badge admin-badge--you">você</span>}
                    </td>
                    <td className="admin-table__date">
                      {new Date(session.created_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="admin-table__date">
                      {new Date(session.expires_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="admin-table__actions">
                      <button
                        className="btn btn--danger btn--sm"
                        onClick={() => handleInvalidate(session)}
                      >
                        Invalidar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
