const BASE = import.meta.env.VITE_API_URL || (() => {
  // import.meta.env.DEV is true under `vite dev`, false in a production build —
  // unlike checking window.location.port, this doesn't break when Vite bumps to
  // 5174/5175/etc. because 5173 was already taken by another process.
  if (import.meta.env.DEV) {
    const h = window.location.hostname;
    const isLocal = h === 'localhost' || h === '127.0.0.1';
    return isLocal ? 'http://localhost:8000' : `${window.location.protocol}//${h}:8000`;
  }
  // Production build (served by the nginx container from this repo's Dockerfile):
  // nginx.conf reverse-proxies /api/* to the backend container over Docker's
  // internal network — same origin, no separate backend domain or CORS needed.
  return '/api';
})();

async function request(method, path, body, timeoutMs = 5000, { skipReloadOn401 = false } = {}) {
  const token = localStorage.getItem('nia_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new Error('Cannot reach the backend server. Make sure start_all.bat is running.');
  } finally {
    clearTimeout(timer);
  }

  // Token expired or invalid — force re-login (unless caller opts out, e.g. during logout)
  if (res.status === 401 && !skipReloadOn401) {
    localStorage.removeItem('nia_token');
    window.location.reload();
    throw new Error('Session expired — please log in again.');
  }

  if (res.ok) {
    // A successful response that fails to parse is a real problem (e.g. the body
    // was too large for the browser to handle) — never silently treat it as "{}",
    // since callers checking things like `data.rows.length` would then see an
    // empty result indistinguishable from "there's genuinely no data yet".
    try {
      return await res.json();
    } catch (err) {
      throw new Error(`Server responded but the response could not be read (${err.message}). This usually means the dataset is too large for the browser to load in one request.`);
    }
  }

  const data = await res.json().catch(() => ({}));
  let msg = `Request failed (${res.status})`;
  if (data.detail) {
    if (typeof data.detail === 'string') {
      msg = data.detail;
    } else if (Array.isArray(data.detail) && data.detail.length > 0) {
      // Pydantic 422 validation errors — extract the first meaningful message
      const first = data.detail[0];
      msg = (first.msg || '').replace(/^Value error,\s*/i, '') || msg;
    }
  }
  throw new Error(msg);
}

export const api = {
  // ── Auth: login (2FA) ─────────────────────────────────────────────────────
  login:            (username)              => request('POST', '/auth/login',              { username }, 20000),
  verifyLoginOTP:   (temp_token, otp)       => request('POST', '/auth/verify-login-otp',   { temp_token, otp }),

  // ── Auth: registration ────────────────────────────────────────────────────
  registerSendOTP:  (data)                  => request('POST', '/auth/register/send-otp',  data, 20000),
  registerVerify:   (email, otp)            => request('POST', '/auth/register/verify',    { email, otp }),

  // ── Auth: session ─────────────────────────────────────────────────────────
  logout:           ()                      => request('POST', '/auth/logout', undefined, 5000, { skipReloadOn401: true }),
  getMe:            ()                      => request('GET',  '/auth/me'),
  getMeSilent:      ()                      => request('GET',  '/auth/me', undefined, 5000, { skipReloadOn401: true }),
  changePassword:   (password)              => request('PUT',  '/auth/me/password',        { password }),

  // ── Data ──────────────────────────────────────────────────────────────────
  uploadData:       (rows, fileName)        => request('POST', '/data/upload',             { rows, file_name: fileName }, 30000),
  // Large datasets take a while server-side (gzip-compressing a 200MB+ JSON
  // response is CPU-bound and can take 10+ seconds on its own, well before any
  // bytes reach the browser) — the default 5s timeout was aborting this before
  // the response could ever complete, which surfaced as a misleading "cannot
  // reach the backend" error even though the backend was working fine.
  getLatestData:    ()                      => request('GET',  '/data/latest', undefined, 60000),

  // ── Audit ─────────────────────────────────────────────────────────────────
  getAuditLogs:     (page = 1, limit = 100, action) =>
    request('GET', `/audit/logs?page=${page}&limit=${limit}${action ? `&action=${action}` : ''}`, undefined, 15000),

  // ── Admin: user management ────────────────────────────────────────────────
  getUsers:         ()                      => request('GET',  '/admin/users'),
  createUser:       (data)                  => request('POST', '/admin/users',              data),
  updateUser:       (id, data)              => request('PUT',  `/admin/users/${id}`,        data),
  resetPassword:    (id, password)          => request('PUT',  `/admin/users/${id}/password`, { password }),
  deactivateUser:   (id)                    => request('DELETE', `/admin/users/${id}`),
  deleteUser:       (id)                    => request('DELETE', `/admin/users/${id}/delete`),
};
