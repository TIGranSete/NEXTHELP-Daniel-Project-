export function getApiUrl(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

// The session (including the bearer token issued at login) lives under this
// same key as before — see App.tsx's currentSession state.
const SESSION_STORAGE_KEY = "gran7_session";

export function getAuthToken(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    return typeof session?.token === "string" ? session.token : null;
  } catch (e) {
    return null;
  }
}

// Thin wrapper around fetch that attaches the session's bearer token to
// every request, so the server can verify who's actually calling instead of
// trusting whatever identity the request body/headers claim.
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(getApiUrl(path), { ...options, headers });

  // A 401 while the app believes it has an active session (whether or not a
  // token made it into this particular request — older cached sessions from
  // before login started issuing tokens won't have one) means that session
  // is no longer valid: expired, invalidated elsewhere, or simply predates
  // this auth requirement. Not to be confused with /api/login's own 401 for
  // a wrong password, which is a normal expected response, not a stale
  // session. Force back to the login screen so the user can get a fresh one.
  if (response.status === 401 && !path.includes("/api/login")) {
    try {
      if (localStorage.getItem("gran7_session")) {
        localStorage.removeItem("gran7_session");
        window.location.reload();
      }
    } catch (e) {}
  }

  return response;
}
