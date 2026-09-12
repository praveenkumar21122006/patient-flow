import { api } from '../api/client.js';
import { showLoading, priorityBadge, refreshIcons } from '../components/ui.js';

export async function render(view, session, setHead) {
  setHead('Clinical · Dashboard', 'Doctor dashboard');
  view.innerHTML = `
    <div class="page-head"><div><h2>Clinical overview</h2><p class="muted">Assignments, escalations, and recent review activity.</p></div>
    <div class="page-actions"><a class="btn btn-primary" href="#/reviews">Open reviews</a></div></div>
    <div class="kpi-grid" id="kpis"></div>
    <div class="grid-2"><div class="card"><h3>Priority distribution</h3><canvas id="ch-pri" height="180"></canvas></div>
    <div class="card"><h3>Emergency notifications</h3><div id="emerg"></div></div></div>
    <div class="card" style="margin-top:12px"><h3>Recent clinical activity</h3><div id="act"></div></div>`;
  showLoading(view.querySelector('#act'));
  try {
    const [analytics, notifs] = await Promise.all([
      api.get('/analytics/overview'),
      api.get('/notifications', { query: { limit: 20 } }).catch(() => ({ data: [] })),
    ]);
    const c = analytics.data.cards;
    view.querySelector('#kpis').innerHTML = `
      <div class="kpi"><div class="l">Assigned</div><div class="n">${c.assignedCount ?? 0}</div></div>
      <div class="kpi"><div class="l">Awaiting review</div><div class="n">${c.awaitingReview ?? 0}</div></div>
      <div class="kpi"><div class="l">Escalations</div><div class="n">${c.escalated}</div></div>
      <div class="kpi"><div class="l">Critical in queue</div><div class="n">${c.criticalQueue}</div></div>
      <div class="kpi"><div class="l">Completed</div><div class="n">${c.completed}</div></div>
      <div class="kpi"><div class="l">Avg wait</div><div class="n">${c.avgWait} min</div></div>`;
    const dist = analytics.data.priorityDistribution || [];
    if (window.Chart) {
      new Chart(view.querySelector('#ch-pri'), { type: 'doughnut', data: { labels: dist.map((d) => d._id || 'unclassified'), datasets: [{ data: dist.map((d) => d.count), backgroundColor: ['#c0392b', '#c25700', '#b7791f', '#1e7e34', '#5d6b7a'] }] }, options: { plugins: { legend: { position: 'bottom' } } } });
    }
    const urgent = (notifs.data || []).filter((n) => ['escalation', 'critical-case'].includes(n.type)).slice(0, 5);
    view.querySelector('#emerg').innerHTML = urgent.length ? urgent.map((n) => `<p class="small"><strong>${n.title}</strong><br><span class="muted">${n.body || ''} · ${new Date(n.createdAt).toLocaleString()}</span></p>`).join('') : '<p class="muted small">No emergency notifications.</p>';
    view.querySelector('#act').innerHTML = (analytics.data.recentReviews || []).map((r) => `<p class="small"><strong>${r.reviewer?.fullName || 'Clinician'}</strong>: ${(r.reviewNotes || '').slice(0, 120)}<br><span class="muted">${new Date(r.reviewedAt).toLocaleString()}</span></p>`).join('') || '<p class="muted small">No reviews yet.</p>';
  } catch (err) { view.querySelector('#act').innerHTML = `<div class="alert alert-danger">${err.message}</div>`; }
  refreshIcons();
}
