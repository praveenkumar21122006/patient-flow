import { api } from '../api/client.js';

// Session state lives in memory + sessionStorage (never localStorage for tokens).
// The JWT itself is an HttpOnly cookie; here we cache only the safe user profile.
const KEY = 'pf-user';

export async function fetchMe() {
  const res = await api.get('/auth/me');
  sessionStorage.setItem(KEY, JSON.stringify(res.data));
  return res.data;
}

export function cachedSession() {
  try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; }
}

export function clearSession() {
  sessionStorage.removeItem(KEY);
  sessionStorage.removeItem('pf-redirected');
}

export async function logout() {
  try { await api.post('/auth/logout', {}); } catch { /* ignore */ }
  clearSession();
  window.location.href = '/pages/login.html';
}

export function requireRole(session, roles) {
  if (!session) return false;
  return roles.includes(session.user.role);
}

// Idle session warning: 25 min idle -> banner; 30 min -> force logout prompt.
export function armSessionTimeout(onWarn) {
  let last = Date.now();
  const bump = () => { last = Date.now(); hideWarn(); };
  ['click', 'keydown', 'mousemove', 'touchstart'].forEach((e) => window.addEventListener(e, bump, { passive: true }));
  function hideWarn() { document.querySelector('.session-banner')?.classList.remove('show'); }
  setInterval(() => {
    const idle = Date.now() - last;
    if (idle > 25 * 60 * 1000 && idle < 30 * 60 * 1000) {
      document.querySelector('.session-banner')?.classList.add('show');
      onWarn && onWarn(Math.round((30 * 60 * 1000 - idle) / 60000));
    } else if (idle >= 30 * 60 * 1000) {
      logout();
    }
  }, 30000);
}
