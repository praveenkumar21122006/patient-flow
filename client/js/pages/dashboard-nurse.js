import { api } from '../api/client.js';
import { showLoading, priorityBadge, refreshIcons } from '../components/ui.js';

export async function render(view, session, setHead) {
  setHead('Triage · Dashboard', 'Nurse dashboard');
  view.innerHTML = `
    <div class="page-head"><div><h2>Triage overview</h2><p class="muted">Waiting assessments, red flags, and workload.</p></div>
    <div class="page-actions"><a class="btn btn-primary" href="#/triage">Open worklist</a><a class="btn btn-outline" href="#/queue">Queue</a></div></div>
    <div class="kpi-grid" id="kpis"></div>
    <div class="grid-2"><div class="card"><h3>Department workload</h3><div id="workload"></div></div>
    <div class="card"><h3>Quick actions</h3><p class="small muted">Record vitals from any intake detail page. Escalations notify doctors immediately.</p><p><a class="btn btn-primary btn-sm" href="#/triage">Triage worklist</a> <a class="btn btn-outline btn-sm" href="#/queue">Queue</a></p><p class="small" id="triage-time"></p></div></div>
    <div class="card" style="margin-top:12px"><h3>Prioritized queue (top 10)</h3><div id="q"></div></div>`;
  showLoading(view.querySelector('#q'));
  try {
    const [analytics, queue] = await Promise.all([api.get('/analytics/overview'), api.get('/queue', { query: { limit: 10 } })]);
    const c = analytics.data.cards;
    view.querySelector('#kpis').innerHTML = `
      <div class="kpi"><div class="l">Waiting assessment</div><div class="n">${c.awaitingTriage}</div></div>
      <div class="kpi"><div class="l">Critical in queue</div><div class="n">${c.criticalQueue}</div></div>
      <div class="kpi"><div class="l">Urgent in queue</div><div class="n">${c.urgentQueue ?? 0}</div></div>
      <div class="kpi"><div class="l">Red-flag alerts</div><div class="n">${c.redFlagCases ?? 0}</div></div>
      <div class="kpi"><div class="l">Escalated</div><div class="n">${c.escalated}</div></div>
      <div class="kpi"><div class="l">Avg wait</div><div class="n">${c.avgWait} min</div></div>`;
    view.querySelector('#triage-time').textContent = c.avgTriageMinutes != null ? `Average triage duration (intake → assessment): ~${c.avgTriageMinutes} min (last 100 cases).` : 'Average triage duration: not enough data yet.';
    view.querySelector('#workload').innerHTML = (analytics.data.workload || []).map((w) => `<p class="small"><strong>${w.department ? `${w.department.name} (${w.department.code})` : 'Unassigned'}</strong>: ${w.count} waiting${w.escalated ? ` · ${w.escalated} escalated` : ''}</p>`).join('') || '<p class="muted small">Queue is empty.</p>';
    view.querySelector('#q').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Token</th><th>Visit</th><th>Suggested</th><th>Confirmed</th><th>Status</th></tr></thead><tbody>
      ${(queue.data || []).map((e) => `<tr><td><strong>${e.token}</strong></td><td>${e.intake?.visitId || ''}</td><td>${priorityBadge(e.suggestedPriority)}</td><td>${e.confirmedPriority ? priorityBadge(e.confirmedPriority) : '<span class="muted">—</span>'}</td><td>${e.status}</td></tr>`).join('')}
      </tbody></table></div>`;
  } catch (err) { view.querySelector('#q').innerHTML = `<div class="alert alert-danger">${err.message}</div>`; }
  refreshIcons();
}
