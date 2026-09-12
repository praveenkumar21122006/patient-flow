import { api } from '../api/client.js';
import { toast, showLoading, escapeHtml, refreshIcons } from '../components/ui.js';
import { fmtDateTime } from '../utils/helpers.js';

export async function render(view, session) {
  view.innerHTML = `<div class="page-head"><div><h2>Notifications</h2></div><div class="page-actions"><button class="btn btn-outline btn-sm" id="all-read">Mark all read</button></div></div><div class="card"><div id="list"></div></div>`;
  const list = view.querySelector('#list');
  showLoading(list, 4);
  async function load() {
    try {
      const res = await api.get('/notifications', { query: { limit: 30 } });
      list.innerHTML = (res.data || []).map((n) => `<p class="small" style="${n.isRead ? 'opacity:.65' : ''}"><strong>${escapeHtml(n.title)}</strong> ${n.isRead ? '' : '●'}<br>${escapeHtml(n.body || '')}<br><span class="muted">${fmtDateTime(n.createdAt)}</span> ${n.isRead ? '' : `<button class="btn btn-sm btn-outline" data-read="${n._id}">Mark read</button>`}</p><hr style="border:none;border-top:1px solid var(--border)">`).join('') || '<p class="muted">No notifications.</p>';
      list.querySelectorAll('[data-read]').forEach((b) => {
        b.onclick = async () => { await api.post(`/notifications/${b.dataset.read}/read`, {}); load(); };
      });
    } catch (err) { list.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`; }
  }
  view.querySelector('#all-read').onclick = async () => { await api.post('/notifications/read-all', {}); toast('All marked as read.', 'success'); load(); };
  await load();
  refreshIcons();
}
