const BASE = '/api/auth';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, (data as { error?: string }).error ?? 'Erro desconhecido', data);
  }

  return data as T;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly data: unknown = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOTPResponse {
  message: string;
  cooldownSeconds: number;
  expiresAt?: string;
  expiresInSeconds?: number;
}

export interface MeResponse {
  email: string;
  expiresAt: string;
  isAdmin: boolean;
}

export async function requestOTP(email: string): Promise<RequestOTPResponse> {
  return apiFetch<RequestOTPResponse>('/request-otp', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function verifyOTP(email: string, code: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
}

export async function getMe(): Promise<MeResponse | null> {
  try {
    return await apiFetch<MeResponse>('/me');
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  await apiFetch<unknown>('/logout', { method: 'POST' });
}
