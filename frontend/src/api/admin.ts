const BASE = '/api/admin';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? 'Erro desconhecido');
  }

  return data as T;
}

async function apiFetchEmpty(path: string, options?: RequestInit): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? 'Erro desconhecido');
  }
}

export interface AdminUser {
  id: number;
  email: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  last_login: string | null;
}

export interface AdminSession {
  id: number;
  email: string;
  created_at: string;
  expires_at: string;
}

export interface AuditEntry {
  id: number;
  event_type: string;
  ip_address: string | null;
  email: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditResponse {
  data: AuditEntry[];
  total: number;
  page: number;
  limit: number;
}

// ─── Usuários ─────────────────────────────────────────────────────────────────

export function listUsers(): Promise<AdminUser[]> {
  return apiFetch<AdminUser[]>('/users');
}

export function createUser(email: string): Promise<AdminUser> {
  return apiFetch<AdminUser>('/users', { method: 'POST', body: JSON.stringify({ email }) });
}

export function updateUser(id: number, patch: { is_active?: boolean; is_admin?: boolean }): Promise<AdminUser> {
  return apiFetch<AdminUser>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function deleteUser(id: number): Promise<void> {
  return apiFetchEmpty(`/users/${id}`, { method: 'DELETE' });
}

// ─── Sessões ──────────────────────────────────────────────────────────────────

export function listSessions(): Promise<AdminSession[]> {
  return apiFetch<AdminSession[]>('/sessions');
}

export function invalidateSession(id: number): Promise<void> {
  return apiFetchEmpty(`/sessions/${id}`, { method: 'DELETE' });
}

// ─── Auditoria ────────────────────────────────────────────────────────────────

export function listAudit(params: {
  event_type?: string;
  email?: string;
  ip?: string;
  page?: number;
  limit?: number;
}): Promise<AuditResponse> {
  const qs = new URLSearchParams();
  if (params.event_type) qs.set('event_type', params.event_type);
  if (params.email)      qs.set('email', params.email);
  if (params.ip)         qs.set('ip', params.ip);
  if (params.page)       qs.set('page', String(params.page));
  if (params.limit)      qs.set('limit', String(params.limit));
  const query = qs.toString() ? `?${qs}` : '';
  return apiFetch<AuditResponse>(`/audit${query}`);
}
