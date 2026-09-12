// App shell: auth guard, role-based navigation, hash router, notifications, theme, search.
import { api } from './api/client.js';
import { cachedSession, fetchMe, logout, armSessionTimeout } from './auth/session.js';
import { toast, refreshIcons } from './components/ui.js';
import { initTheme, toggleTheme } from './utils/helpers.js';

const NAV = {
  patient: [
    { section: 'Care' },
    { hash: '#/dashboard', label: 'My Dashboard', icon: 'layout-dashboard' },
    { hash: '#/intake/new', label: 'New Intake', icon: 'clipboard-plus' },
    { hash: '#/intakes', label: 'My Intakes', icon: 'folder-open' },
    { hash: '#/appointments', label: 'Appointments', icon: 'calendar' },
    { hash: '#/notifications', label: 'Notifications', icon: 'bell' },
    { hash: '#/profile', label: 'Profile & Privacy', icon: 'user' },
  ],
  receptionist: [
    { section: 'Front desk' },
    { hash: '#/dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
    { hash: '#/patients', label: 'Patients', icon: 'users' },
    { hash: '#/intakes', label: 'Intakes', icon: 'folder-open' },
    { hash: '#/queue', label: 'Queue', icon: 'list-ordered' },
    { hash: '#/appointments', label: 'Appointments', icon: 'calendar' },
    { hash: '#/reports', label: 'Reports', icon: 'printer' },
    { hash: '#/profile', label: 'Profile', icon: 'user' },
  ],
  nurse: [
    { section: 'Triage' },
    { hash: '#/dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
    { hash: '#/triage', label: 'Triage Worklist', icon: 'stethoscope' },
    { hash: '#/queue', label: 'Queue', icon: 'list-ordered' },
    { hash: '#/appointments', label: 'Appointments', icon: 'calendar' },
    { hash: '#/intakes', label: 'Intakes', icon: 'folder-open' },
    { hash: '#/reports', label: 'Reports', icon: 'printer' },
    { hash: '#/profile', label: 'Profile', icon: 'user' },
  ],
  doctor: [
    { section: 'Clinical' },
    { hash: '#/dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
    { hash: '#/reviews', label: 'My Reviews', icon: 'clipboard-check' },
    { hash: '#/queue', label: 'Queue', icon: 'list-ordered' },
    { hash: '#/appointments', label: 'Appointments', icon: 'calendar' },
    { hash: '#/intakes', label: 'Intakes', icon: 'folder-open' },
    { hash: '#/reports', label: 'Reports', icon: 'printer' },
    { hash: '#/profile', label: 'Profile', icon: 'user' },
  ],
  admin: [
    { section: 'Operations' },
    { hash: '#/dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
    { hash: '#/queue', label: 'Queue', icon: 'list-ordered' },
    { hash: '#/appointments', label: 'Appointments', icon: 'calendar' },
    { hash: '#/intakes', label: 'Intakes', icon: 'folder-open' },
    { hash: '#/admin', label: 'Administration', icon: 'settings' },
    { hash: '#/reports', label: 'Reports', icon: 'printer' },
    { hash: '#/profile', label: 'Profile', icon: 'user' },
  ],
};

let session = cachedSession();

async function boot() {
  initTheme();
  try {
    session = await fetchMe();
  } catch {
    window.location.href = '/pages/login.html?expired=1';
    return;
  }
  renderNav();
  document.getElementById('user-card').innerHTML = `<strong>${escape(session.user.fullName)}</strong><br><span class="small">${escape(session.user.role)} · ${escape(session.user.email)}</span>`;
  document.getElementById('logout-btn').onclick = logout;
  document.getElementById('theme-btn').onclick = () => toggleTheme();
  document.getElementById('nav-toggle').onclick = () => document.body.classList.toggle('nav-open');
  document.getElementById('notif-btn').onclick = toggleNotifPanel;
  document.getElementById('profile-link').textContent = `${session.user.fullName.split(' ')[0]} · ${session.user.role}`;
  const gs = document.getElementById('global-search');
  if (session.user.role === 'patient') gs.style.display = 'none';
  gs.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') window.location.hash = `#/patients?search=${encodeURIComponent(gs.value)}`;
  });
  armSessionTimeout();
  window.addEventListener('hashchange', route);
  await route();
  pollNotifications();
  setInterval(pollNotifications, 30000);
}

function escape(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function renderNav() {
  const items = NAV[session.user.role] || NAV.patient;
  const nav = document.getElementById('side-nav');
  nav.innerHTML = '';
  items.forEach((it) => {
    if (it.section) {
      const d = document.createElement('div');
      d.className = 'side-section'; d.textContent = it.section;
      nav.appendChild(d); return;
    }
    const a = document.createElement('a');
    a.href = it.hash; a.innerHTML = `<i data-lucide="${it.icon}" width="16" height="16"></i> ${it.label}`;
    if (window.location.hash.startsWith(it.hash)) a.classList.add('active');
    nav.appendChild(a);
  });
  refreshIcons();
}

async function pollNotifications() {
  try {
    const res = await api.get('/notifications', { query: { limit: 1 } });
    const n = res.meta?.unreadCount ?? 0;
    const badge = document.getElementById('notif-count');
    badge.style.display = n > 0 ? '' : 'none';
    badge.textContent = n > 99 ? '99+' : String(n);
  } catch { /* ignore */ }
}

async function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  const open = panel.style.display !== 'none';
  if (open) { panel.style.display = 'none'; return; }
  panel.innerHTML = 'Loading…';
  panel.style.display = 'block';
  try {
    const res = await api.get('/notifications', { query: { limit: 8 } });
    panel.innerHTML = `<strong>Recent notifications</strong><ul class="small">${res.data.map((n) => `<li>${escape(n.title)} — ${escape(n.body || '')}</li>`).join('') || '<li>No notifications.</li>'}</ul><a class="btn btn-sm btn-outline" href="#/notifications">View all</a> <button class="btn btn-sm btn-outline" id="mark-all">Mark all read</button>`;
    panel.querySelector('#mark-all').onclick = async () => { await api.post('/notifications/read-all', {}); pollNotifications(); toggleNotifPanel(); };
  } catch (err) { panel.innerHTML = `Could not load notifications: ${escape(err.message)}`; }
}

function setHead(crumb, title) {
  document.getElementById('breadcrumbs').textContent = crumb;
  document.getElementById('page-title').textContent = title;
  renderNav();
}

async function route() {
  const view = document.getElementById('view');
  const hash = window.location.hash || '#/dashboard';
  document.body.classList.remove('nav-open');
  try {
    if (hash.startsWith('#/dashboard')) {
      const mod = await import(`./pages/dashboard-${session.user.role}.js`);
      await mod.render(view, session, setHead);
    } else if (hash.startsWith('#/intake/new')) {
      setHead('Care · New intake', 'New intake request');
      (await import('./pages/intake.js')).renderNew(view, session);
    } else if (hash.startsWith('#/intakes/')) {
      const id = hash.split('/')[2].split('?')[0];
      setHead('Records · Intake detail', 'Intake detail');
      (await import('./pages/intake-detail.js')).render(view, session, id);
    } else if (hash.startsWith('#/intakes')) {
      setHead('Records · Intakes', 'Intake requests');
      (await import('./pages/intakes.js')).render(view, session);
    } else if (hash.startsWith('#/queue')) {
      setHead('Flow · Patient queue', 'Patient queue');
      (await import('./pages/queue.js')).render(view, session);
    } else if (hash.startsWith('#/triage')) {
      guard(['nurse', 'doctor', 'admin']);
      setHead('Triage · Worklist', 'Triage worklist');
      (await import('./pages/triage.js')).render(view, session);
    } else if (hash.startsWith('#/reviews')) {
      guard(['doctor', 'admin', 'nurse']);
      setHead('Clinical · Reviews', 'Clinical reviews');
      (await import('./pages/reviews.js')).render(view, session);
    } else if (hash.startsWith('#/patients')) {
      guard(['receptionist', 'nurse', 'doctor', 'admin']);
      setHead('Front desk · Patients', 'Patients');
      (await import('./pages/patients.js')).render(view, session, new URLSearchParams(hash.split('?')[1] || ''));
    } else if (hash.startsWith('#/reports')) {
      setHead('Insights · Reports', 'Reports & exports');
      (await import('./pages/reports.js')).render(view, session);
    } else if (hash.startsWith('#/admin')) {
      guard(['admin']);
      setHead('Operations · Administration', 'Administration');
      (await import('./pages/admin.js')).render(view, session);
    } else if (hash.startsWith('#/appointments')) {
      setHead('Care · Appointments', 'Appointments');
      (await import('./pages/appointments.js')).render(view, session);
    } else if (hash.startsWith('#/profile')) {
      setHead('Account · Profile', 'Profile & privacy');
      (await import('./pages/profile.js')).render(view, session);
    } else if (hash.startsWith('#/notifications')) {
      setHead('Account · Notifications', 'Notifications');
      (await import('./pages/notifications.js')).render(view, session);
    } else {
      window.location.hash = '#/dashboard';
    }
  } catch (err) {
    if (err.message === 'FORBIDDEN') { view.innerHTML = '<div class="alert alert-danger">You do not have permission to view this section.</div>'; return; }
    view.innerHTML = `<div class="alert alert-danger"><strong>Could not load this view.</strong> ${escape(err.message)}</div>`;
  }
  refreshIcons();
  view.focus({ preventScroll: true });
}

function guard(roles) {
  if (!roles.includes(session.user.role)) throw new Error('FORBIDDEN');
}

boot();
