import { api } from '../api/client.js';
import { toast, showLoading, showEmpty, showError, renderPagination, priorityBadge, escapeHtml, refreshIcons } from '../components/ui.js';
import { waitingSince } from '../utils/helpers.js';

// Real-time-style queue with 20s polling + filters.
export async function render(view, session) {
  const canExport = session.user.role !== 'patient';
  const isAdmin = session.user.role === 'admin';
  view.innerHTML = `
    <div class="page-head"><div><h2>Patient queue</h2><p class="muted">Ordered by confirmed priority → escalation → arrival. Auto-refreshes every 20 seconds.</p></div>
    <div class="page-actions"><span id="live-pill" class="badge b-unclassified">● Connecting…</span><button class="btn btn-outline btn-sm" id="refresh">Refresh now</button>${canExport ? '<a class="btn btn-outline btn-sm" href="/api/v1/reports/export/queue" target="_blank" rel="noopener">Export CSV</a>' : ''}</div></div>
    <div class="card"><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <input id="f-search" type="search" placeholder="Search token / name / visit…" style="flex:1;min-width:200px" aria-label="Search queue">
      <select id="f-status" aria-label="Status filter"><option value="">All statuses</option>${['awaiting-triage', 'triage-in-progress', 'awaiting-clinical-review', 'escalated', 'assigned', 'in-consultation', 'observation', 'completed', 'cancelled'].map((s) => `<option>${s}</option>`).join('')}</select>
      <select id="f-pri" aria-label="Priority filter"><option value="">All priorities</option><option value="critical">Critical</option><option value="urgent">Urgent</option><option value="moderate">Moderate</option><option value="low">Low</option><option value="unclassified">Unclassified</option></select>
      <select id="f-dept" aria-label="Department filter"><option value="">All departments</option></select>
      ${isAdmin ? '<select id="f-strategy" aria-label="Ordering strategy"><option value="clinical-first">Clinical-first order</option><option value="arrival-only">Arrival order</option></select>' : ''}
    </div><div id="list"></div><div id="pager"></div></div>`;
  const list = view.querySelector('#list'), pager = view.querySelector('#pager');
  let page = 1, cache = [];
  api.get('/departments').then((res) => {
    const sel = view.querySelector('#f-dept');
    if (!sel) return;
    (res.data || []).forEach((d) => {
      const o = document.createElement('option');
      o.value = d._id; o.textContent = `${d.name} (${d.code})`;
      sel.appendChild(o);
    });
  }).catch(() => { /* department filter stays All */ });
  async function load(p = 1) {
    page = p;
    showLoading(list, 5);
    try {
      const strategy = view.querySelector('#f-strategy')?.value || undefined;
      const res = await api.get('/queue', { query: { page: p, limit: 15, search: view.querySelector('#f-search').value, status: view.querySelector('#f-status').value, priority: view.querySelector('#f-pri').value, department: view.querySelector('#f-dept').value, strategy } });
      cache = res.data || [];
      if (!cache.length) { showEmpty(list, 'Queue is empty', 'New submissions will appear here automatically.'); pager.innerHTML = ''; return; }
      const showName = session.user.role !== 'patient';
      list.innerHTML = `<div class="table-wrap"><table><thead><tr><th>#</th><th>Token</th>${showName ? '<th>Patient</th>' : ''}<th>Suggested</th><th>Confirmed</th><th>Wait</th><th>Dept</th><th>Status</th><th></th></tr></thead><tbody>
        ${cache.map((e) => `<tr ${e.isEscalated ? 'style="background:var(--red-bg)"' : ''}><td>${e.position ?? ''}</td><td><strong>${escapeHtml(e.token)}</strong>${e.isEscalated ? ' 🚨' : ''}</td>
        ${showName ? `<td>${escapeHtml(e.patient?.fullName || '')}<br><span class="small muted">${escapeHtml(e.patient?.patientId || '')}</span></td>` : ''}
        <td>${priorityBadge(e.suggestedPriority)}</td><td>${e.confirmedPriority ? priorityBadge(e.confirmedPriority) : '<span class="muted">—</span>'}</td>
        <td class="small">${waitingSince(e.arrivalAt)}</td><td class="small">${escapeHtml(e.department?.name || '—')}</td><td class="small">${escapeHtml(e.status)}</td>
        <td><a class="btn btn-sm btn-outline" href="#/intakes/${e.intake?._id || e.intake}">Open</a></td></tr>`).join('')}
        </tbody></table></div>`;
      renderPagination(pager, res.meta, load);
    } catch (err) { showError(list, err.message, () => load(page)); }
    refreshIcons();
  }
  view.querySelector('#refresh').onclick = () => load(page);
  ['f-search', 'f-status', 'f-pri', 'f-dept', 'f-strategy'].forEach((id) => view.querySelector(`#${id}`)?.addEventListener('change', () => load(1)));
  view.querySelector('#f-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') load(1); });
  // Live updates: server-sent events when available, timed polling as fallback.
  const pill = view.querySelector('#live-pill');
  const setPill = (mode) => {
    if (!pill) return;
    if (mode === 'live') { pill.className = 'badge b-low'; pill.textContent = '● Live'; }
    else if (mode === 'polling') { pill.className = 'badge b-moderate'; pill.textContent = '● Refreshing every 20s'; }
    else { pill.className = 'badge b-unclassified'; pill.textContent = '● Reconnecting…'; }
  };
  let es = null, poll = null;
  const stopAll = () => { if (es) { es.close(); es = null; } if (poll) { clearInterval(poll); poll = null; } };
  if (typeof EventSource !== 'undefined') {
    try {
      es = new EventSource('/api/v1/queue/stream');
      es.addEventListener('queue', () => load(page));
      es.onopen = () => setPill('live');
      es.onerror = () => setPill('reconnecting');
      poll = setInterval(() => load(page), 60000); // safety refresh alongside the stream
      setPill('live');
    } catch { es = null; }
  }
  if (!es) { poll = setInterval(() => load(page), 20000); setPill('polling'); }
  const obs = new MutationObserver(() => { if (!document.contains(view)) { stopAll(); obs.disconnect(); } });
  obs.observe(document.body, { childList: true, subtree: true });
  await load(1);
}
