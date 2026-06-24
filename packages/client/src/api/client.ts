const API_BASE = '';
const TOKEN_KEY = 'agb_token';

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string): void => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY);

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Headers with the session token (if any) attached. */
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getToken();
  return { ...(extra ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    // Session invalid/expired → drop token and let the app fall back to the login screen.
    clearToken();
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  }
  if (!response.ok) {
    const body = await response.text();
    let message: string;
    try {
      const json = JSON.parse(body);
      message = json.error || json.message || body;
    } catch {
      message = body || response.statusText;
    }
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { method: 'GET', headers: authHeaders({ 'Content-Type': 'application/json' }) });
  return handleResponse<T>(response);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: body ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(response);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  return handleResponse<T>(response);
}

export async function apiDelete<T = void>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { method: 'DELETE', headers: authHeaders() });
  return handleResponse<T>(response);
}
