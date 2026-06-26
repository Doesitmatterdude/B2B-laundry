// API client for the field PWA. Uses stored JWT token.
// Offline writes queue to IndexedDB and sync on reconnect.

const API_BASE = '/api/v1';

function getToken(): string | null {
  return localStorage.getItem('ff_token');
}

export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export function setToken(token: string) {
  localStorage.setItem('ff_token', token);
}

export function clearToken() {
  localStorage.removeItem('ff_token');
}

// ---- Auth ----
export const login = (identifier: string, password: string) =>
  api<{ access_token: string; user: any }>('/auth/login', {
    method: 'POST', body: JSON.stringify({ identifier, password }),
  });

// ---- Route ----
export const getTodayRoute = () => api<{ data: any[]; meta: any }>('/me/route/today');

// ---- Lots ----
export const createPickup = (payload: any) =>
  api('/lots', { method: 'POST', body: JSON.stringify(payload) });

export const getLot = (id: string) => api(`/lots/${id}`);

export const listLots = (params?: string) => api(`/lots${params ? `?${params}` : ''}`);

// ---- Clients (for category lookup) ----
export const getClient = (id: string) => api(`/clients/${id}`);