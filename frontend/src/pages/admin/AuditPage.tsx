import { useEffect, useState } from 'react';
import { listAudit, AuditEntry } from '../../api/admin';

const EVENT_TYPES = [
  'OTP_REQUESTED',
  'OTP_REQUEST_UNKNOWN_EMAIL',
  'OTP_VERIFIED',
  'OTP_INVALID',
  'OTP_EXPIRED',
  'OTP_ALREADY_USED',
  'SESSION_CREATED',
  'SESSION_INVALIDATED',
  'LOGOUT',
  'RATE_LIMIT_OTP_REQUEST',
  'RATE_LIMIT_OTP_VERIFY',
  'EMAIL_COOLDOWN_ACTIVE',
  'REPORT_UPLOADED',
  'REPORT_UPLOAD_FAILED',
  'REPORT_TOGGLED',
  'REPORT_RENAMED',
  'REPORT_DELETED',
  'ADMIN_USER_CREATED',
  'ADMIN_USER_UPDATED',
  'ADMIN_USER_DELETED',
  'ADMIN_SESSION_INVALIDATED',
  'RATE_LIMIT_REPORT_UPLOAD',
];

function badgeClass(event: string): string {
  if (['OTP_VERIFIED', 'SESSION_CREATED', 'REPORT_UPLOADED', 'ADMIN_USER_CREATED'].includes(event)) return 'admin-badge--green';
  if (event.startsWith('RATE_LIMIT') || ['OTP_INVALID', 'OTP_EXPIRED', 'OTP_ALREADY_USED', 'OTP_REQUEST_UNKNOWN_EMAIL', 'REPORT_UPLOAD_FAILED', 'REPORT_DELETED', 'ADMIN_USER_DELETED', 'RATE_LIMIT_REPORT_UPLOAD'].includes(event)) return 'admin-badge--red';
  if (['REPORT_TOGGLED', 'REPORT_RENAMED', 'ADMIN_USER_UPDATED', 'ADMIN_SESSION_INVALIDATED'].includes(event)) return 'admin-badge--blue';
  return 'admin-badge--gray';
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filterEvent, setFilterEvent] = useState('');
  const [filterEmail, setFilterEmail] = useState('');
  const [filterIp, setFilterIp] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const LIMIT = 50;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  async function load(p = page) {
    setLoading(true);
    setError('');
    try {
      const res = await listAudit({
        event_type: filterEvent || undefined,
        email: filterEmail || undefined,
        ip: filterIp || undefined,
        page: p,
        limit: LIMIT,
      });
      setEntries(res.data);
      setTotal(res.total);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(1); setPage(1); }, [filterEvent, filterEmail, filterIp]);
  useEffect(() => { load(page); }, [page]);

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    load(1);
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h2 className="admin-page__title">Histórico de Auditoria</h2>
        <span className="admin-page__count">{total} registro{total !== 1 ? 's' : ''}</span>
      </div>

      <form className="admin-filters" onSubmit={handleFilterSubmit}>
        <select
          className="input input--sm"
          value={filterEvent}
          onChange={(e) => setFilterEvent(e.target.value)}
        >
          <option value="">Todos os eventos</option>
          {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input
          type="text"
          className="input input--sm"
          placeholder="E-mail"
          value={filterEmail}
          onChange={(e) => setFilterEmail(e.target.value)}
        />
        <input
          type="text"
          className="input input--sm"
          placeholder="IP"
          value={filterIp}
          onChange={(e) => setFilterIp(e.target.value)}
        />
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setFilterEvent(''); setFilterEmail(''); setFilterIp(''); }}>
          Limpar
        </button>
      </form>

      {loading ? (
        <div className="admin-loading"><span className="spinner spinner--dark" /></div>
      ) : error ? (
        <div className="alert alert--error">{error}</div>
      ) : entries.length === 0 ? (
        <div className="alert alert--info">Nenhum registro encontrado.</div>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Evento</th>
                  <th>E-mail</th>
                  <th>IP</th>
                  <th>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <>
                    <tr key={entry.id}>
                      <td className="admin-table__date">
                        {new Date(entry.created_at).toLocaleString('pt-BR')}
                      </td>
                      <td>
                        <span className={`admin-badge ${badgeClass(entry.event_type)}`}>
                          {entry.event_type}
                        </span>
                      </td>
                      <td>{entry.email ?? '—'}</td>
                      <td className="admin-table__mono">{entry.ip_address ?? '—'}</td>
                      <td>
                        {entry.details && Object.keys(entry.details).length > 0 ? (
                          <button
                            className="btn btn--ghost btn--sm"
                            onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                          >
                            {expandedId === entry.id ? 'Fechar' : 'Ver'}
                          </button>
                        ) : '—'}
                      </td>
                    </tr>
                    {expandedId === entry.id && (
                      <tr key={`${entry.id}-details`} className="admin-table__detail-row">
                        <td colSpan={5}>
                          <pre className="admin-json">{JSON.stringify(entry.details, null, 2)}</pre>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-pagination">
            <button
              className="btn btn--ghost btn--sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              ← Anterior
            </button>
            <span className="admin-pagination__info">Página {page} de {totalPages}</span>
            <button
              className="btn btn--ghost btn--sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
