import { useEffect, useState } from 'react';
import { listUsers, createUser, updateUser, deleteUser, AdminUser, UserRole } from '../../api/admin';

interface Props {
  currentUserId: string;
}

export default function UsersPage({ currentUserId }: Props) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setUsers(await listUsers());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setCreating(true);
    setActionError('');
    try {
      const created = await createUser(newEmail.trim().toLowerCase());
      setUsers((prev) => [created, ...prev]);
      setNewEmail('');
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(user: AdminUser) {
    setActionError('');
    try {
      const updated = await updateUser(user.id, { is_active: !user.is_active });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (e: any) {
      setActionError(e.message);
    }
  }

  async function handleRoleChange(user: AdminUser, role: UserRole) {
    setActionError('');
    try {
      const updated = await updateUser(user.id, { role });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (e: any) {
      setActionError(e.message);
    }
  }

  async function handleDelete(user: AdminUser) {
    if (!confirm(`Excluir permanentemente "${user.email}"?`)) return;
    setActionError('');
    try {
      await deleteUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (e: any) {
      setActionError(e.message);
    }
  }

  const isSelf = (user: AdminUser) => user.email === currentUserId;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h2 className="admin-page__title">Usuários</h2>
        <span className="admin-page__count">{users.length} cadastrado{users.length !== 1 ? 's' : ''}</span>
      </div>

      <form className="admin-create-form" onSubmit={handleCreate}>
        <input
          type="email"
          className="input"
          placeholder="novo@email.com"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          disabled={creating}
        />
        <button type="submit" className="btn btn--primary btn--sm" disabled={creating || !newEmail.trim()}>
          {creating ? <span className="spinner" /> : 'Adicionar usuário'}
        </button>
      </form>

      {actionError && <div className="alert alert--error" style={{ marginBottom: 12 }}>{actionError}</div>}

      {loading ? (
        <div className="admin-loading"><span className="spinner spinner--dark" /></div>
      ) : error ? (
        <div className="alert alert--error">{error}</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>E-mail</th>
                <th>Status</th>
                <th>Perfil</th>
                <th>Criado em</th>
                <th>Último login</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className={!user.is_active ? 'admin-table__row--inactive' : ''}>
                  <td>
                    {user.email}
                    {isSelf(user) && <span className="admin-badge admin-badge--you">você</span>}
                  </td>
                  <td>
                    <span className={`admin-badge ${user.is_active ? 'admin-badge--green' : 'admin-badge--gray'}`}>
                      {user.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td>
                    <span className={`admin-badge ${
                      user.role === 'admin'   ? 'admin-badge--blue'
                      : user.role === 'redteam' ? 'admin-badge--orange'
                      : 'admin-badge--gray'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="admin-table__date">
                    {new Date(user.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="admin-table__date">
                    {user.last_login
                      ? new Date(user.last_login).toLocaleString('pt-BR')
                      : <span style={{ color: 'var(--color-text-muted, #999)' }}>Nunca</span>}
                  </td>
                  <td className="admin-table__actions">
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => handleToggleActive(user)}
                      disabled={isSelf(user)}
                      title={isSelf(user) ? 'Não pode alterar sua própria conta' : ''}
                    >
                      {user.is_active ? 'Desativar' : 'Ativar'}
                    </button>
                    <select
                      className="input input--sm"
                      style={{ padding: '2px 6px', fontSize: 12, width: 'auto' }}
                      value={user.role}
                      disabled={isSelf(user)}
                      title={isSelf(user) ? 'Não pode alterar seu próprio perfil' : 'Alterar perfil'}
                      onChange={(e) => handleRoleChange(user, e.target.value as UserRole)}
                    >
                      <option value="admin">admin</option>
                      <option value="redteam">redteam</option>
                      <option value="report">report</option>
                    </select>
                    <button
                      className="btn btn--danger btn--sm"
                      onClick={() => handleDelete(user)}
                      disabled={isSelf(user)}
                      title={isSelf(user) ? 'Não pode excluir sua própria conta' : ''}
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
