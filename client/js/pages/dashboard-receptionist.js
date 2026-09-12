import { api } from '../api/client.js';
import { showLoading, showEmpty, refreshIcons } from '../components/ui.js';
import { fmtDateTime } from '../utils/helpers.js';

export async function render(view, session, setHead) {
  setHead('Front desk · Dashboard', 'Reception dashboard');
  view.innerHTML = `
    <div class="page-head"><div><h2>Today at reception</h2><p class="muted">Registrations, arrivals, and triage readiness.</p></div>
    <div class="page-actions"><a class="btn btn-primary" href="#/patients">Register patient</a><a class="btn btn-outline" href="#/intake/new">Guest intake</a></div></div>
    <div class="kpi-grid" id="kpis"></div>
    <div class="grid-2"><div class="card"><h3>Recent arrivals</h3><div id="arrivals"></div></div>
    <div class="card"><h3>Department queues</h3><div id="depts"></div></div></div>`;
  showLoading(view.querySelector('#arrivals')); showLoading(view.querySelector('#depts'));
  try {
    const [analytics, intakes, queue] = await Promise.all([
      api.get('/analytics/overview'),
      api.get('/intakes', { query: { limit: 8 } }),
      api.get('/queue', { query: { limit: 100 } }),
    ]);
    const c = analytics.data.cards;
    view.querySelector('#kpis').innerHTML = `
      <div class="kpi"><div class="l">Visits today</div><div class="n">${c.todayVisits}</div></div>
      <div class="kpi"><div class="l">Awaiting triage</div><div class="n">${c.awaitingTriage}</div></div>
      <div class="kpi"><div class="l">Avg wait</div><div class="n">${c.avgWait} min</div></div>
      <div class="kpi"><div class="l">Total visits</div><div class="n">${c.totalVisits}</div></div>`;
    const arr = view.querySelector('#arrivals');
    arr.innerHTML = (intakes.data || []).map((i) => `<p class="small"><strong>${i.patient?.fullName || 'Guest'}</strong> · ${i.visitId}<br><span class="muted">${i.status} · ${fmtDateTime(i.createdAt)}</span></p>`).join('') || '';
    if (!intakes.data?.length) showEmpty(arr, 'No arrivals yet today');
    const byDept = {};
    (queue.data || []).forEach((e) => { const k = e.department?.name || 'Unassigned'; byDept[k] = (byDept[k] || 0) + 1; });
    view.querySelector('#depts').innerHTML = Object.entries(byDept).map(([k, v]) => `<p class="small"><strong>${k}</strong>: ${v} waiting</p>`).join('') || '<p class="muted small">Queue is empty.</p>';
  } catch (err) { view.querySelector('#arrivals').innerHTML = `<div class="alert alert-danger">${err.message}</div>`; }
  refreshIcons();
}
