import { api } from '../api/client.js';
import { showLoading, showEmpty, showError, priorityBadge, refreshIcons } from '../components/ui.js';
import { fmtDateTime, waitingSince } from '../utils/helpers.js';

export async function render(view, session, setHead) {
  setHead('Care · Dashboard', 'My dashboard');
  view.innerHTML = `
    <div class="page-head"><div><h2>Hello, ${session.user.fullName.split(' ')[0]}</h2><p class="muted">Your intake status, queue position, and next steps.</p></div>
    <div class="page-actions"><a class="btn btn-primary" href="#/intake/new">Start new intake</a></div></div>
    <div class="kpi-grid" id="kpis"></div>
    <div class="grid-2"><div class="card"><h3>Current visit</h3><div id="current"></div></div>
    <div class="card"><h3>Profile & emergency contact</h3><div id="profile-box"></div></div></div>
    <div class="grid-2" style="margin-top:16px"><div class="card"><h3>Recent intake requests</h3><div id="recent"></div></div>
    <div class="card"><h3>Upcoming appointments</h3><div id="upcoming"></div></div></div>
    <div class="card" style="margin-top:16px"><h3>Notifications</h3><div id="notifs"></div></div>`;
  const kpis = view.querySelector('#kpis');
  showLoading(view.querySelector('#current')); showLoading(view.querySelector('#recent')); showLoading(view.querySelector('#notifs')); showLoading(view.querySelector('#upcoming'));
  try {
    const [intakes, notifs, queue, appts] = await Promise.all([
      api.get('/intakes', { query: { limit: 10 } }),
      api.get('/notifications', { query: { limit: 5 } }),
      api.get('/queue', { query: { limit: 50 } }).catch(() => ({ data: [] })),
      api.get('/appointments', { query: { upcoming: 'true', limit: 3 } }).catch(() => ({ data: [] })),
    ]);
    const list = intakes.data || [];
    const latest = list[0];
    const q = queue.data?.find((e) => latest && (e.intake?.visitId === latest.visitId || String(e.intake?._id || e.intake) === String(latest._id)));
    kpis.innerHTML = `
      <div class="kpi"><div class="l">Intake status</div><div class="n" style="font-size:16px">${latest ? latest.status : 'No intake yet'}</div></div>
      <div class="kpi"><div class="l">Reviewed priority</div><div>${q?.confirmedPriority ? priorityBadge(q.confirmedPriority) : '<span class="muted small">Pending review</span>'}</div></div>
      <div class="kpi"><div class="l">Queue token</div><div class="n">${q?.token || '—'}</div></div>
      <div class="kpi"><div class="l">Est. wait</div><div class="n">${q?.estimatedWaitMinutes != null ? `${q.estimatedWaitMinutes} min` : q ? waitingSince(q.arrivalAt) : '—'}</div></div>
      <div class="kpi"><div class="l">Department</div><div class="n" style="font-size:15px">${latest?.assignedDepartment?.name || q?.department?.name || 'Not assigned'}</div></div>`;
    view.querySelector('#current').innerHTML = latest ? `
      <p><strong>${latest.visitId}</strong> · ${latest.chiefComplaint || ''}</p>
      <p class="small muted">Submitted ${fmtDateTime(latest.createdAt)} · Status: ${latest.status}</p>
      <p class="small">Department: ${latest.assignedDepartment?.name || 'Not assigned yet'}</p>
      <a class="btn btn-sm btn-outline" href="#/intakes/${latest._id}">View details & summary</a>`
      : '<p class="muted">No intake yet. Start one to join the queue.</p>';
    const rec = view.querySelector('#recent');
    rec.innerHTML = list.length ? `<ul class="small">${list.map((i) => `<li><a href="#/intakes/${i._id}">${i.visitId}</a> — ${i.status} · ${fmtDateTime(i.createdAt)}</li>`).join('')}</ul>` : '';
    if (!list.length) showEmpty(rec, 'No intake requests yet', 'Your submissions will appear here.');
    // Emergency contact + profile completion (from the cached session profile).
    const p = session.profile || {};
    const fields = [p.fullName, p.dateOfBirth, p.phone, p.emergencyContactName, p.emergencyContactPhone];
    const done = fields.filter((f) => f).length;
    view.querySelector('#profile-box').innerHTML = `
      <p class="small"><strong>Emergency contact:</strong> ${p.emergencyContactName || '—'}${p.emergencyContactRelationship ? ` (${p.emergencyContactRelationship})` : ''}<br>${p.emergencyContactPhone || 'No number on file'}</p>
      <div class="progress" aria-label="Profile completion"><div style="width:${Math.round((done / fields.length) * 100)}%"></div></div>
      <p class="small muted">Profile ${done}/${fields.length} complete. <a href="#/profile">Manage profile & privacy</a></p>`;
    view.querySelector('#notifs').innerHTML = (notifs.data || []).map((n) => `<p class="small"><strong>${n.title}</strong><br><span class="muted">${n.body || ''} · ${fmtDateTime(n.createdAt)}</span></p>`).join('') || '<p class="muted small">No notifications.</p>';
    const up = appts.data || [];
    view.querySelector('#upcoming').innerHTML = up.length
      ? `<ul class="small">${up.map((a) => `<li><strong>${fmtDateTime(a.scheduledAt)}</strong> — ${a.department?.name || 'Clinic'}<br><span class="muted">${a.reason || ''} · ${a.status}</span></li>`).join('')}</ul><p><a class="btn btn-sm btn-outline" href="#/appointments">Manage appointments</a></p>`
      : '<p class="muted small">No upcoming appointments. <a href="#/appointments">Book one</a></p>';
  } catch (err) { showError(view.querySelector('#current'), err.message); }
  refreshIcons();
}
