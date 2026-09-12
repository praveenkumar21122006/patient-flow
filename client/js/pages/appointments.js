import { api } from '../api/client.js';
import { toast, showLoading, showEmpty, showError, renderPagination, escapeHtml, openModal, refreshIcons } from '../components/ui.js';
import { fmtDateTime } from '../utils/helpers.js';

const STATUS_BADGE = {
  scheduled: 'b-unclassified', 'checked-in': 'b-moderate', 'in-consultation': 'b-urgent',
  completed: 'b-low', cancelled: 'b-unclassified', 'no-show': 'b-urgent',
};
const NEXT_ACTION = { scheduled: ['checked-in', 'no-show'], 'checked-in': ['in-consultation', 'no-show'], 'in-consultation': ['completed'] };
const ACTION_LABEL = { 'checked-in': 'Check in', 'in-consultation': 'Start', completed: 'Complete', 'no-show': 'No-show', cancelled: 'Cancel' };

export async function render(view, session) {
  const isStaff = session.user.role !== 'patient';
  view.innerHTML = `
    <div class="page-head"><div><h2>Appointments</h2><p class="muted">Booked follow-ups by department and clinician.</p></div>
    <div class="page-actions"><button class="btn btn-primary btn-sm" id="book-btn">Book appointment</button></div></div>
    <div class="card"><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <select id="a-status" aria-label="Status filter"><option value="">All statuses</option>${['scheduled', 'checked-in', 'in-consultation', 'completed', 'cancelled', 'no-show'].map((s) => `<option>${s}</option>`).join('')}</select>
      <select id="a-when" aria-label="Time filter"><option value="">All time</option><option value="true">Upcoming</option><option value="false">Past</option></select>
      <select id="a-dept" aria-label="Department filter"><option value="">All departments</option></select>
    </div><div id="list"></div><div id="pager"></div></div>`;
  const list = view.querySelector('#list'), pager = view.querySelector('#pager');
  let departments = [];
  try {
    departments = (await api.get('/departments')).data || [];
    const sel = view.querySelector('#a-dept');
    departments.forEach((d) => {
      const o = document.createElement('option');
      o.value = d._id; o.textContent = `${d.name} (${d.code})`;
      sel.appendChild(o);
    });
  } catch { /* filter stays All */ }

  async function load(page = 1) {
    showLoading(list, 4);
    try {
      const res = await api.get('/appointments', { query: { page, limit: 15, status: view.querySelector('#a-status').value, upcoming: view.querySelector('#a-when').value || undefined, department: view.querySelector('#a-dept').value } });
      const items = res.data || [];
      if (!items.length) { showEmpty(list, 'No appointments found', 'Book one to get started.'); pager.innerHTML = ''; return; }
      list.innerHTML = `<div class="table-wrap"><table><thead><tr><th>When</th>${isStaff ? '<th>Patient</th>' : ''}<th>Department</th><th>Clinician</th><th>Reason</th><th>Status</th><th></th></tr></thead><tbody>
        ${items.map((a) => `<tr><td><strong>${fmtDateTime(a.scheduledAt)}</strong><br><span class="small muted">${escapeHtml(a.appointmentId)} · ${a.durationMinutes} min</span></td>
        ${isStaff ? `<td>${escapeHtml(a.patient?.fullName || '')}<br><span class="small muted">${escapeHtml(a.patient?.patientId || '')}</span></td>` : ''}
        <td class="small">${escapeHtml(a.department?.name || '—')}</td><td class="small">${escapeHtml(a.clinician?.fullName || '—')}</td>
        <td class="small">${escapeHtml((a.reason || '').slice(0, 60))}</td>
        <td><span class="badge ${STATUS_BADGE[a.status] || 'b-unclassified'}">${escapeHtml(a.status)}</span></td>
        <td style="white-space:nowrap">${actionsFor(a, session)}</td></tr>`).join('')}
        </tbody></table></div>`;
      wireActions(list, load);
      renderPagination(pager, res.meta, load);
    } catch (err) { showError(list, err.message, () => load(page)); }
    refreshIcons();
  }

  ['a-status', 'a-when', 'a-dept'].forEach((id) => view.querySelector(`#${id}`).addEventListener('change', () => load(1)));
  view.querySelector('#book-btn').onclick = () => openBookModal(session, departments, load);
  await load(1);
}

function actionsFor(a, session) {
  const btns = [];
  const active = ['scheduled', 'checked-in', 'in-consultation'].includes(a.status);
  if (!active) return '<span class="muted small">—</span>';
  if (session.user.role === 'patient') {
    return `<button class="btn btn-sm btn-outline" data-cancel="${a._id}">Cancel</button>`;
  }
  (NEXT_ACTION[a.status] || []).forEach((s) => {
    btns.push(`<button class="btn btn-sm btn-outline" data-set="${a._id}" data-status="${s}">${ACTION_LABEL[s]}</button>`);
  });
  btns.push(`<button class="btn btn-sm btn-outline" data-resched="${a._id}">Reschedule</button>`);
  if (a.status !== 'cancelled') btns.push(`<button class="btn btn-sm btn-outline" data-set="${a._id}" data-status="cancelled">Cancel</button>`);
  return btns.join(' ');
}

function wireActions(list, reload) {
  list.querySelectorAll('[data-set]').forEach((b) => {
    b.onclick = async () => {
      const payload = { status: b.dataset.status };
      if (b.dataset.status === 'cancelled') {
        const reason = prompt('Cancellation reason (optional):') || '';
        payload.cancelReason = reason;
      }
      try { await api.patch(`/appointments/${b.dataset.set}`, payload); toast('Appointment updated.', 'success'); reload(); }
      catch (err) { toast(err.message, 'error'); }
    };
  });
  list.querySelectorAll('[data-cancel]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Cancel this appointment?')) return;
      try { await api.patch(`/appointments/${b.dataset.cancel}`, { status: 'cancelled' }); toast('Appointment cancelled.', 'success'); reload(); }
      catch (err) { toast(err.message, 'error'); }
    };
  });
  list.querySelectorAll('[data-resched]').forEach((b) => {
    b.onclick = () => {
      const def = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
      openModal('Reschedule', `<div class="field"><label for="rs-at">New date & time (future) *</label><input id="rs-at" type="datetime-local" value="${def}"></div>`, [{
        label: 'Save', primary: true, keepOpen: true, onClick: async () => {
          try { await api.patch(`/appointments/${b.dataset.resched}`, { scheduledAt: document.getElementById('rs-at').value }); toast('Appointment rescheduled.', 'success'); location.reload(); }
          catch (err) { toast(err.message, 'error'); }
        },
      }]);
    };
  });
}

async function openBookModal(session, departments, reload) {
  const isStaff = session.user.role !== 'patient';
  let clinicians = [];
  try { clinicians = (await api.get('/users/clinicians')).data || []; } catch { /* optional */ }
  const def = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
  openModal('Book appointment', `
    ${isStaff ? `<div class="field"><label for="bk-psearch">Find patient *</label><input id="bk-psearch" type="search" placeholder="Search name / ID / phone…"></div>
    <div class="field" style="margin-top:8px"><label for="bk-patient">Patient *</label><select id="bk-patient"><option value="">Select…</option></select></div>` : ''}
    <div class="form-grid" style="margin-top:8px">
      <div class="field"><label for="bk-dept">Department *</label><select id="bk-dept"><option value="">Select…</option>${departments.map((d) => `<option value="${d._id}">${escapeHtml(d.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="bk-clin">Clinician (optional)</label><select id="bk-clin"><option value="">Any</option>${clinicians.map((u) => `<option value="${u.id}">${escapeHtml(u.fullName)} · ${escapeHtml(u.role)}</option>`).join('')}</select></div>
      <div class="field"><label for="bk-at">Date & time (future) *</label><input id="bk-at" type="datetime-local" value="${def}"></div>
      <div class="field"><label for="bk-dur">Duration (min)</label><input id="bk-dur" type="number" min="5" max="480" value="30"></div>
      <div class="field full"><label for="bk-reason">Reason *</label><input id="bk-reason" placeholder="e.g. wound check, BP review"></div>
      <div class="field full"><label for="bk-notes">Notes</label><input id="bk-notes"></div>
    </div>`, [{
    label: 'Book', primary: true, keepOpen: true, onClick: async () => {
      const g = (id) => document.getElementById(id).value;
      const payload = {
        department: g('bk-dept') || undefined,
        clinician: g('bk-clin') || undefined,
        scheduledAt: g('bk-at'),
        durationMinutes: Number(g('bk-dur')) || 30,
        reason: g('bk-reason').trim(),
        notes: g('bk-notes').trim(),
      };
      if (isStaff) {
        payload.patient = g('bk-patient') || undefined;
        if (!payload.patient) { toast('Select a patient first.', 'error'); return; }
      }
      if (!payload.department) { toast('Choose a department.', 'error'); return; }
      if (!payload.reason) { toast('Reason is required.', 'error'); return; }
      try {
        await api.post('/appointments', payload);
        toast('Appointment booked.', 'success'); reload();
        document.querySelector('.modal-back')?.classList.remove('open');
      } catch (err) { toast(err.message, 'error'); }
    },
  }]);
  if (isStaff) {
    const search = document.getElementById('bk-psearch');
    const sel = document.getElementById('bk-patient');
    const fill = async (q = '') => {
      try {
        const res = await api.get('/patients', { query: { search: q, limit: 20 } });
        sel.innerHTML = '<option value="">Select…</option>' + (res.data || []).map((p) => `<option value="${p._id}">${escapeHtml(p.fullName)} · ${escapeHtml(p.patientId)}</option>`).join('');
      } catch (err) { toast(err.message, 'error'); }
    };
    await fill('');
    let t = null;
    search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => fill(search.value.trim()), 300); });
  }
  refreshIcons();
}
