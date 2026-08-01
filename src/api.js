const BASE = import.meta.env.VITE_API_URL || (() => {
  // Vite's dev server always runs on 5173 (vite.config.js) — in that mode there's
  // no nginx in front of anything, so talk to the local/LAN backend on :8000 directly.
  if (window.location.port === '5173') {
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

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
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
  return data;
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
  getLatestData:    ()                      => request('GET',  '/data/latest'),

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
