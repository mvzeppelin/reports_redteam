import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout } from '../api/auth';
import {
  listReports, uploadReport, toggleReport, renameReport, deleteReport,
  reportViewUrl, formatBytes, Report,
} from '../api/reports';

interface Props {
  onLogout: () => void;
  isAdmin: boolean;
}

export default function ReportsPage({ onLogout, isAdmin }: Props) {
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Upload state
  const [uploadName, setUploadName]       = useState('');
  const [uploadFile, setUploadFile]       = useState<File | null>(null);
  const [uploading, setUploading]         = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError]     = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [actionError, setActionError] = useState('');

  // Edição inline de nome
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [renaming, setRenaming]       = useState(false);

  async function handleLogout() {
    try { await logout(); } catch { /* ignora */ }
    onLogout();
    navigate('/', { replace: true });
  }

  async function load() {
    setLoading(true);
    setError('');
    try { setReports(await listReports()); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadFile || !uploadName.trim()) return;
    setUploading(true);
    setUploadProgress(0);
    setUploadError('');
    try {
      const created = await uploadReport(uploadName.trim(), uploadFile, setUploadProgress);
      setReports((prev) => [created, ...prev]);
      setUploadName('');
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e: any) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  async function handleToggle(report: Report) {
    setActionError('');
    try {
      const updated = await toggleReport(report.id, !report.is_active);
      setReports((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
    } catch (e: any) { setActionError(e.message); }
  }

  function startEdit(report: Report) {
    setEditingId(report.id);
    setEditingName(report.name);
    setActionError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName('');
  }

  async function handleRename(report: Report) {
    const trimmed = editingName.trim();
    if (!trimmed || trimmed === report.name) { cancelEdit(); return; }
    setRenaming(true);
    setActionError('');
    try {
      const updated = await renameReport(report.id, trimmed);
      setReports((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
      cancelEdit();
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setRenaming(false);
    }
  }

  async function handleDelete(report: Report) {
    if (!confirm(`Remover permanentemente "${report.name}"?\nOs arquivos do relatório serão excluídos.`)) return;
    setActionError('');
    try {
      await deleteReport(report.id);
      setReports((prev) => prev.filter((r) => r.id !== report.id));
    } catch (e: any) { setActionError(e.message); }
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <span className="admin-header__brand">Relatórios</span>
        <nav className="admin-nav">
          {isAdmin && (
            <button
              className="admin-nav__link"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => navigate('/admin/users')}
            >
              Painel Administrativo
            </button>
          )}
        </nav>
        <div className="admin-header__actions">
          <button className="btn btn--ghost btn--sm" onClick={() => navigate('/welcome')}>← Voltar</button>
          <button className="btn btn--danger btn--sm" onClick={handleLogout}>Sair</button>
        </div>
      </header>
      <main className="admin-content">
    <div style={{ maxWidth: 860, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Header da página */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e' }}>Relatórios</h1>
          <span className="admin-page__count">{reports.length} relatório{reports.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Upload form */}
        <div className="card" style={{ padding: '24px 28px' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: '#1a1a2e' }}>Novo Relatório</h2>
          <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="text"
              className="input"
              style={{ width: '100%' }}
              placeholder="Nome do relatório (ex: Empresa X — Análise Junho 2026)"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              disabled={uploading}
              maxLength={255}
            />
            <div className="upload-drop">
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,application/zip"
                style={{ display: 'none' }}
                onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setUploadFile(f);
                if (f && !uploadName.trim()) {
                  setUploadName(f.name.replace(/\.zip$/i, ''));
                }
              }}
                disabled={uploading}
              />
              {uploadFile ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 13, color: '#374151' }}>
                    📦 <strong>{uploadFile.name}</strong> ({formatBytes(uploadFile.size)})
                  </span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    style={{ margin: 0 }}
                    onClick={() => { setUploadFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    disabled={uploading}
                  >
                    Trocar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  style={{ margin: 0 }}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  Selecionar arquivo .zip
                </button>
              )}
            </div>

            {uploading && (
              <div className="upload-progress-wrap">
                <div className="upload-progress-bar" style={{ width: `${uploadProgress}%` }} />
                <span className="upload-progress-label">{uploadProgress}%</span>
              </div>
            )}

            {uploadError && <div className="alert alert--error" style={{ margin: 0 }}>{uploadError}</div>}

            <button
              type="submit"
              className="btn btn--primary"
              style={{ marginTop: 0 }}
              disabled={uploading || !uploadFile || !uploadName.trim()}
            >
              {uploading ? <><span className="spinner" /> Enviando...</> : 'Fazer upload'}
            </button>
          </form>
        </div>

        {/* Action error */}
        {actionError && <div className="alert alert--error">{actionError}</div>}

        {/* Aviso de segurança */}
        <div className="alert alert--warning" style={{ fontSize: 13 }}>
          <strong>Atenção:</strong> abra apenas relatórios de fontes confiáveis. O conteúdo HTML é renderizado
          no seu browser — um relatório malicioso pode executar scripts no contexto da sua sessão.
          {isAdmin && (
            <> Como <strong>administrador</strong>, o risco é maior: evite abrir relatórios enviados por terceiros sem revisão prévia.</>
          )}
        </div>

        {/* List */}
        {loading ? (
          <div className="admin-loading"><span className="spinner spinner--dark" /></div>
        ) : error ? (
          <div className="alert alert--error">{error}</div>
        ) : reports.length === 0 ? (
          <div className="alert alert--info">Nenhum relatório cadastrado. Faça upload do primeiro acima.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Status</th>
                  <th>Arquivos</th>
                  <th>Tamanho</th>
                  <th>Enviado por</th>
                  <th>Data</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id} className={!report.is_active ? 'admin-table__row--inactive' : ''}>
                    <td>
                      {editingId === report.id ? (
                        <input
                          type="text"
                          className="input input--sm"
                          style={{ width: '100%', boxSizing: 'border-box' }}
                          value={editingName}
                          maxLength={255}
                          autoFocus
                          disabled={renaming}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRename(report);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                        />
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 600 }}>{report.name}</span>
                          <button
                            className="btn btn--ghost btn--sm"
                            style={{ margin: 0, padding: '2px 8px', fontSize: 12, flexShrink: 0 }}
                            onClick={() => startEdit(report)}
                            title="Editar nome"
                          >
                            ✏️
                          </button>
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`admin-badge ${report.is_active ? 'admin-badge--green' : 'admin-badge--gray'}`}>
                        {report.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td>{report.file_count}</td>
                    <td>{formatBytes(report.size_bytes)}</td>
                    <td style={{ fontSize: 12, color: '#6b7280' }}>{report.uploaded_by_email ?? '—'}</td>
                    <td className="admin-table__date">{new Date(report.created_at).toLocaleString('pt-BR')}</td>
                    <td className="admin-table__actions">
                      {editingId === report.id ? (
                        <>
                          <button
                            className="btn btn--primary btn--sm"
                            style={{ margin: 0 }}
                            disabled={renaming || !editingName.trim()}
                            onClick={() => handleRename(report)}
                          >
                            {renaming ? <span className="spinner" /> : 'Salvar'}
                          </button>
                          <button
                            className="btn btn--ghost btn--sm"
                            style={{ margin: 0 }}
                            disabled={renaming}
                            onClick={cancelEdit}
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="btn btn--primary btn--sm"
                            style={{ margin: 0 }}
                            disabled={!report.is_active}
                            onClick={() => window.open(reportViewUrl(report.id), '_blank')}
                            title={!report.is_active ? 'Relatório desativado' : 'Abrir relatório'}
                          >
                            Abrir
                          </button>
                          <button
                            className="btn btn--ghost btn--sm"
                            style={{ margin: 0 }}
                            onClick={() => handleToggle(report)}
                          >
                            {report.is_active ? 'Desativar' : 'Ativar'}
                          </button>
                          <button
                            className="btn btn--danger btn--sm"
                            style={{ margin: 0 }}
                            onClick={() => handleDelete(report)}
                          >
                            Remover
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </main>
    </div>
  );
}
