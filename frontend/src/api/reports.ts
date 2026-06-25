const BASE = '/api/reports';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Erro desconhecido');
  return data as T;
}

async function apiFetchEmpty(path: string, options?: RequestInit): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { credentials: 'include', ...options });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? 'Erro desconhecido');
  }
}

export interface Report {
  id: string;
  name: string;
  is_active: boolean;
  file_count: number;
  size_bytes: number;
  created_at: string;
  uploaded_by_email: string | null;
}

export function listReports(): Promise<Report[]> {
  return apiFetch<Report[]>('/');
}

export function uploadReport(
  name: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<Report> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('name', name);
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data as Report);
        else reject(new Error((data as { error?: string }).error ?? 'Erro no upload'));
      } catch {
        reject(new Error('Resposta inválida do servidor'));
      }
    };

    xhr.onerror = () => reject(new Error('Falha de conexão durante o upload'));
    xhr.open('POST', BASE + '/');
    xhr.send(form);
  });
}

export function toggleReport(id: string, is_active: boolean): Promise<Report> {
  return apiFetch<Report>(`/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_active }),
  });
}

export function renameReport(id: string, name: string): Promise<Report> {
  return apiFetch<Report>(`/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export function deleteReport(id: string): Promise<void> {
  return apiFetchEmpty(`/${id}`, { method: 'DELETE' });
}

export function reportViewUrl(id: string): string {
  return `/api/reports/${id}/view/index.html`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
