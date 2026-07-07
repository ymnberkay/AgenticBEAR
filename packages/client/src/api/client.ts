const TOKEN_KEY = 'agb_token';
const SESSION_BASE_KEY = 'agb_session_base';

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string): void => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY);

// ── Session base (hub topology) ─────────────────────────────────────────────
// After login the hub reports where this user's session pod lives (e.g. '/u/<hash>' behind the
// ingress, or an absolute URL in dev). Data-plane requests go there directly; auth/user
// management stays on the hub origin. Empty base = standalone, same-origin — today's behavior.
export const getSessionBase = (): string => localStorage.getItem(SESSION_BASE_KEY) ?? '';
export const setSessionBase = (base: string): void => {
  if (base) localStorage.setItem(SESSION_BASE_KEY, base);
  else localStorage.removeItem(SESSION_BASE_KEY);
};
export const clearSessionBase = (): void => localStorage.removeItem(SESSION_BASE_KEY);

/** Hub-owned paths (auth, session orchestration, health) — never routed to the session pod. */
const isHubPath = (path: string): boolean => path.startsWith('/api/auth/') || path === '/api/health';

/** Resolve the full URL for an API path: hub origin for auth, session base for the data plane. */
export const apiUrl = (path: string): string => (isHubPath(path) ? path : `${getSessionBase()}${path}`);

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
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getToken();
  return { ...(extra ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function handleResponse<T>(response: Response): Promise<T> {
  // Sliding session: past its half-life the server reissues the token in a header.
  const refreshed = response.headers.get('x-agb-refresh-token');
  if (refreshed && getToken()) setToken(refreshed);
  if (response.status === 401) {
    // Session invalid/expired → drop token and let the app fall back to the login screen.
    clearToken();
    clearSessionBase();
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  }
  if (!response.ok) {
    const body = await response.text();
    let message: string;
    try {
      const json = JSON.parse(body) as { error?: unknown; message?: unknown };
      // API errors are { error: true, message: '…' } — the boolean flag is NOT the message.
      message =
        (typeof json.message === 'string' && json.message) ||
        (typeof json.error === 'string' && json.error) ||
        body;
    } catch {
      message = body || response.statusText;
    }
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

// ── Session wake/recovery ───────────────────────────────────────────────────
// A reaped/crashed session pod answers 502/503/504 (Service with no endpoints) or refuses the
// connection. Ask the hub to recreate it, poll until ready, then retry the original request
// once. The window is generous to cover a cold image pull on a fresh node.
const WAKE_POLL_MS = 3_000;
const WAKE_MAX_MS = 90_000;
let wakeInFlight: Promise<boolean> | null = null;

async function wakeSession(): Promise<boolean> {
  wakeInFlight ??= (async () => {
    try {
      window.dispatchEvent(new CustomEvent('session:starting'));
      await fetch('/api/auth/session/wake', { method: 'POST', headers: authHeaders() });
      const deadline = Date.now() + WAKE_MAX_MS;
      while (Date.now() < deadline) {
        const res = await fetch('/api/auth/session', { headers: authHeaders() });
        if (res.ok) {
          const info = (await res.json()) as { status: string; baseUrl: string };
          if (info.status === 'ready') {
            setSessionBase(info.baseUrl);
            window.dispatchEvent(new CustomEvent('session:ready'));
            return true;
          }
        }
        await new Promise((r) => setTimeout(r, WAKE_POLL_MS));
      }
      return false;
    } catch {
      return false;
    } finally {
      wakeInFlight = null;
    }
  })();
  return wakeInFlight;
}

const isGatewayError = (status: number) => status === 502 || status === 503 || status === 504;

/** Fetch with one-shot session recovery for data-plane requests in hub topology. */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const recoverable = !isHubPath(path) && !!getSessionBase();
  try {
    const response = await fetch(apiUrl(path), init);
    if (recoverable && isGatewayError(response.status) && (await wakeSession())) {
      return fetch(apiUrl(path), init);
    }
    return response;
  } catch (err) {
    // Network-level failure (pod gone, connection refused via dev process backend)
    if (recoverable && (await wakeSession())) {
      return fetch(apiUrl(path), init);
    }
    throw err;
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await apiFetch(path, { method: 'GET', headers: authHeaders({ 'Content-Type': 'application/json' }) });
  return handleResponse<T>(response);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  // No Content-Type on empty POSTs — Fastify rejects 'application/json' with an empty body.
  const response = await apiFetch(path, {
    method: 'POST',
    headers: body === undefined ? authHeaders() : authHeaders({ 'Content-Type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handleResponse<T>(response);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await apiFetch(path, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  return handleResponse<T>(response);
}

export async function apiDelete<T = void>(path: string): Promise<T> {
  const response = await apiFetch(path, { method: 'DELETE', headers: authHeaders() });
  return handleResponse<T>(response);
}
