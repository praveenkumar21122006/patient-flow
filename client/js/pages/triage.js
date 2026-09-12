import { api } from '../api/client.js';
import { toast, showLoading, showEmpty, priorityBadge, escapeHtml, openModal, refreshIcons } from '../components/ui.js';
import { fmtDateTime } from '../utils/helpers.js';

export async function render(view, session) {
  view.innerHTML = `
    <div class="page-head"><div><h2>Triage worklist</h2><p class="muted">Record vitals, run transparent assessments, confirm or override with reason.</p></div></div>
    <div class="card"><h3>Waiting for assessment</h3><div id="list"></div></div>
    <div class="card" style="margin-top:12px"><h3>Suggestions awaiting confirmation</h3><div id="pending"></div></div>`;
  const list = view.querySelector('#list'), pending = view.querySelector('#pending');
  const row = (i, action) => `<tr><td><strong>${escapeHtml(i.visitId)}</strong></td><td>${escapeHtml(i.patient?.fullName || '')}</td><td>${escapeHtml((i.chiefComplaint || '').slice(0, 70))}</td><td>${escapeHtml(i.status)}</td><td class="small">${fmtDateTime(i.createdAt)}</td><td style="white-space:nowrap"><a class="btn btn-sm btn-outline" href="#/intakes/${i._id}">${action}</a></td></tr>`;
  showLoading(list, 5); showLoading(pending, 3);
  try {
    const [a, b, c] = await Promise.all([
      api.get('/intakes', { query: { limit: 30, status: 'awaiting-triage' } }),
      api.get('/intakes', { query: { limit: 30, status: 'triage-in-progress' } }).catch(() => ({ data: [] })),
      api.get('/intakes', { query: { limit: 30, status: 'awaiting-clinical-review' } }).catch(() => ({ data: [] })),
    ]);
    const waiting = [...(b.data || []), ...(a.data || [])];
    const confirm = c.data || [];
    if (!waiting.length) showEmpty(list, 'No patients waiting for triage', 'New submissions will appear here.');
    else list.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Visit</th><th>Patient</th><th>Complaint</th><th>Status</th><th>Arrived</th><th></th></tr></thead><tbody>${waiting.map((i) => row(i, 'Assess')).join('')}</tbody></table></div>`;
    if (!confirm.length) showEmpty(pending, 'No suggestions pending confirmation', 'Run an assessment from an intake to create one.');
    else pending.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Visit</th><th>Patient</th><th>Complaint</th><th>Status</th><th>Arrived</th><th></th></tr></thead><tbody>${confirm.map((i) => row(i, 'Confirm')).join('')}</tbody></table></div>`;
  } catch (err) { list.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`; }
  refreshIcons();
}
