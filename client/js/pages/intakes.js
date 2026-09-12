import { api } from '../api/client.js';
import { toast, showLoading, showEmpty, showError, renderPagination, statusLabel, escapeHtml, refreshIcons } from '../components/ui.js';
import { fmtDateTime } from '../utils/helpers.js';

export async function render(view, session) {
  view.innerHTML = `
    <div class="page-head"><div><h2>Intake requests</h2><p class="muted">Filter by status, search by visit ID or complaint.</p></div>
    <div class="page-actions"><a class="btn btn-primary" href="#/intake/new">New intake</a></div></div>
    <div class="card"><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <input id="q-search" type="search" placeholder="Search visit ID / complaint…" style="flex:1;min-width:200px" aria-label="Search intakes">
      <select id="q-status" aria-label="Filter by status"><option value="">All statuses</option>${['draft', 'submitted', 'awaiting-triage', 'triage-in-progress', 'awaiting-clinical-review', 'escalated', 'assigned', 'in-consultation', 'observation', 'completed', 'cancelled'].map((s) => `<option>${s}</option>`).join('')}</select>
      <select id="q-dept" aria-label="Filter by department"><option value="">All departments</option></select>
      <button class="btn btn-outline btn-sm" id="q-go">Apply</button>
    </div><div id="list"></div><div id="pager"></div></div>`;
  const list = view.querySelector('#list'), pager = view.querySelector('#pager');
  api.get('/departments').then((res) => {
    const sel = view.querySelector('#q-dept');
    (res.data || []).forEach((d) => {
      const o = document.createElement('option');
      o.value = d._id; o.textContent = `${d.name} (${d.code})`;
      sel.appendChild(o);
    });
  }).catch(() => { /* department filter stays All */ });
  async function load(page = 1) {
    showLoading(list, 4);
    try {
      const res = await api.get('/intakes', { query: { page, limit: 15, search: view.querySelector('#q-search').value, status: view.querySelector('#q-status').value, department: view.querySelector('#q-dept').value } });
      if (!res.data.length) { showEmpty(list, 'No intake requests found', 'Adjust filters or create a new intake.'); pager.innerHTML = ''; return; }
      list.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Visit</th><th>Patient</th><th>Complaint</th><th>Status</th><th>Submitted</th><th></th></tr></thead><tbody>
        ${res.data.map((i) => `<tr><td><strong>${escapeHtml(i.visitId)}</strong></td><td>${escapeHtml(i.patient?.fullName || '')}<br><span class="small muted">${escapeHtml(i.patient?.patientId || '')}</span></td><td>${escapeHtml((i.chiefComplaint || '').slice(0, 60))}</td><td>${statusLabel(i.status)}</td><td class="small">${fmtDateTime(i.createdAt)}</td><td><a class="btn btn-sm btn-outline" href="#/intakes/${i._id}">Open</a></td></tr>`).join('')}
        </tbody></table></div>`;
      renderPagination(pager, res.meta, load);
    } catch (err) { showError(list, err.message, () => load(page)); }
    refreshIcons();
  }
  view.querySelector('#q-go').onclick = () => load(1);
  view.querySelector('#q-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') load(1); });
  await load(1);
}
