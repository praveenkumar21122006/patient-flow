// Central API client: cookie-session auth, JSON envelope handling, session-expiry redirect.
const API_BASE = '/api/v1';

async function request(path, { method = 'GET', body, headers = {}, query = null } = {}) {
  let url = API_BASE + path;
  if (query) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    const s = qs.toString();
    if (s) url += `?${s}`;
  }
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/register')) {
    // Session expired: bounce to login once.
    if (!window.location.pathname.endsWith('login.html') && !window.location.pathname.endsWith('/app.html')) {
      // stay on public pages
    } else if (!sessionStorage.getItem('pf-redirected')) {
      sessionStorage.setItem('pf-redirected', '1');
      window.location.href = '/pages/login.html?expired=1';
    }
  }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { success: false, message: 'Unexpected server response.' }; }
  if (!res.ok || (json && json.success === false)) {
    const err = new Error((json && json.message) || `Request failed (${res.status})`);
    err.status = res.status;
    err.errors = json && json.errors;
    throw err;
  }
  return json;
}

export const api = {
  get: (p, opts) => request(p, { ...opts, method: 'GET' }),
  post: (p, body, opts) => request(p, { ...opts, method: 'POST', body }),
  put: (p, body, opts) => request(p, { ...opts, method: 'PUT', body }),
  patch: (p, body, opts) => request(p, { ...opts, method: 'PATCH', body }),
  del: (p, opts) => request(p, { ...opts, method: 'DELETE' }),
};

export async function uploadDocuments(intakeId, files) {
  const fd = new FormData();
  [...files].slice(0, 3).forEach((f) => fd.append('documents', f));
  const res = await fetch(`${API_BASE}/intakes/${intakeId}/documents`, { method: 'POST', credentials: 'include', body: fd });
  const json = await res.json().catch(() => ({ success: false, message: 'Upload failed.' }));
  if (!res.ok || json.success === false) throw new Error(json.message || 'Upload failed.');
  return json;
}
