import { api } from '../api/client.js';
import { showLoading, refreshIcons } from '../components/ui.js';

export async function render(view, session, setHead) {
  setHead('Operations · Dashboard', 'Administrator dashboard');
  view.innerHTML = `
    <div class="page-head"><div><h2>Operations</h2><p class="muted">Visits, staffing, waits, and trends.</p></div>
    <div class="page-actions"><a class="btn btn-outline" href="#/admin">Manage system</a><a class="btn btn-outline" href="#/reports">Reports</a></div></div>
    <div class="kpi-grid" id="kpis"></div>
    <div class="grid-2">
      <div class="chart-box"><h3>Daily & weekly arrivals</h3><canvas id="ch-trend"></canvas></div>
      <div class="chart-box"><h3>Priority distribution</h3><canvas id="ch-pri"></canvas></div>
    </div>
    <div class="grid-2">
      <div class="card"><h3>Department workload</h3><div id="workload"></div></div>
      <div class="card"><h3>Peak arrival hours</h3><div id="peaks"></div></div>
    </div>
    <div class="card" style="margin-top:12px"><h3>Audit-event summary</h3><div id="audit"></div></div>`;
  try {
    const analytics = await api.get('/analytics/overview');
    const c = analytics.data.cards;
    view.querySelector('#kpis').innerHTML = `
      <div class="kpi"><div class="l">Total visits</div><div class="n">${c.totalVisits}</div></div>
      <div class="kpi"><div class="l">Today</div><div class="n">${c.todayVisits}</div></div>
      <div class="kpi"><div class="l">Active staff</div><div class="n">${c.activeStaff}</div></div>
      <div class="kpi"><div class="l">Avg wait</div><div class="n">${c.avgWait} min</div></div>
      <div class="kpi"><div class="l">Avg triage</div><div class="n">${c.avgTriageMinutes != null ? `${c.avgTriageMinutes} min` : '—'}</div></div>
      <div class="kpi"><div class="l">Completed</div><div class="n">${c.completed}</div></div>`;
    if (window.Chart) {
      const trend = analytics.data.weeklyTrend || [];
      new Chart(view.querySelector('#ch-trend'), { type: 'bar', data: { labels: trend.map((t) => t._id), datasets: [{ label: 'Visits', data: trend.map((t) => t.count), backgroundColor: '#0e7c7b' }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
      const dist = analytics.data.priorityDistribution || [];
      new Chart(view.querySelector('#ch-pri'), { type: 'doughnut', data: { labels: dist.map((d) => d._id || 'unclassified'), datasets: [{ data: dist.map((d) => d.count), backgroundColor: ['#c0392b', '#c25700', '#b7791f', '#1e7e34', '#5d6b7a'] }] }, options: { plugins: { legend: { position: 'bottom' } } } });
    }
    view.querySelector('#audit').innerHTML = `<ul class="small">${(analytics.data.recentAudit || []).map((a) => `<li>${a.action} · ${a.actorRole || 'system'} · ${new Date(a.at).toLocaleString()}</li>`).join('')}</ul>`;
    view.querySelector('#workload').innerHTML = (analytics.data.workload || []).map((w) => `<p class="small"><strong>${w.department ? `${w.department.name} (${w.department.code})` : 'Unassigned'}</strong>: ${w.count} waiting${w.escalated ? ` · ${w.escalated} escalated` : ''}</p>`).join('') || '<p class="muted small">No active queue.</p>';
    view.querySelector('#peaks').innerHTML = (analytics.data.peakHours || []).map((h) => `<p class="small"><strong>${String(h._id).padStart(2, '0')}:00</strong> — ${h.count} arrivals</p>`).join('') || '<p class="muted small">Not enough data yet.</p>';
  } catch (err) { view.querySelector('#kpis').innerHTML = `<div class="alert alert-danger">${err.message}</div>`; }
  refreshIcons();
}
