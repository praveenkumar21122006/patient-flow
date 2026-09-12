import { api } from '../api/client.js';
import { showLoading, showEmpty, escapeHtml, refreshIcons } from '../components/ui.js';
import { fmtDateTime } from '../utils/helpers.js';

export async function render(view, session) {
  view.innerHTML = `<div class="page-head"><div><h2>Clinical reviews</h2><p class="muted">Assigned, escalated, and awaiting-review visits.</p></div></div><div class="card"><div id="list"></div></div>`;
  const list = view.querySelector('#list');
  showLoading(list, 4);
  try {
    const res = await api.get('/intakes', { query: { limit: 30 } });
    const items = (res.data || []).filter((i) => ['escalated', 'awaiting-clinical-review', 'assigned', 'in-consultation'].includes(i.status));
    if (!items.length) { showEmpty(list, 'No patients awaiting review'); return; }
    list.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Visit</th><th>Patient</th><th>Status</th><th>Complaint</th><th></th></tr></thead><tbody>
      ${items.map((i) => `<tr ${i.status === 'escalated' ? 'style="background:var(--red-bg)"' : ''}><td><strong>${escapeHtml(i.visitId)}</strong>${i.status === 'escalated' ? ' 🚨' : ''}</td><td>${escapeHtml(i.patient?.fullName || '')}</td><td>${escapeHtml(i.status)}</td><td>${escapeHtml((i.chiefComplaint || '').slice(0, 60))}</td><td><a class="btn btn-sm btn-primary" href="#/intakes/${i._id}">Review</a></td></tr>`).join('')}
      </tbody></table></div>`;
  } catch (err) { list.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`; }
  refreshIcons();
}
