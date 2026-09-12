import { api } from '../api/client.js';
import { toast, escapeHtml, refreshIcons } from '../components/ui.js';

export async function render(view, session) {
  const staff = ['receptionist', 'nurse', 'doctor', 'admin'].includes(session.user.role);
  const canExport = staff;
  view.innerHTML = `
    <div class="page-head"><div><h2>Reports & exports</h2><p class="muted">Printable summaries and authorized operational reports.</p></div></div>
    <div class="grid-2">
      <div class="card"><h3>Patient intake summary</h3>
        <p class="small muted">Full visit record: identifiers, submitted information, vitals, priorities with rule version, confirmation, timeline, and safety disclaimer. Use the browser print dialog to save as PDF.</p>
        <div style="display:flex;gap:8px"><input id="r-visit" placeholder="Intake ID (open an intake first)" style="flex:1" aria-label="Intake ID"><button class="btn btn-outline btn-sm" id="r-open">Open</button></div>
        <p class="small">Tip: open any intake and use <strong>Print summary / PDF</strong> for a formatted printout.</p></div>
      <div class="card"><h3>Operational reports</h3>
        ${staff ? `<div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm" data-rep="daily">Daily report</button>
          <button class="btn btn-outline btn-sm" data-rep="priority-distribution">Priority distribution</button>
          <button class="btn btn-outline btn-sm" data-rep="department-workload">Department workload</button>
          <button class="btn btn-outline btn-sm" data-rep="waiting-times">Waiting times</button>
          ${session.user.role === 'admin' ? '<button class="btn btn-outline btn-sm" data-rep="audit">Audit report</button>' : ''}
        </div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
          ${canExport ? '<a class="btn btn-outline btn-sm" href="/api/v1/reports/export/daily" target="_blank" rel="noopener">Export daily CSV</a><a class="btn btn-outline btn-sm" href="/api/v1/reports/export/queue" target="_blank" rel="noopener">Export queue CSV</a>' : ''}
          ${session.user.role === 'admin' ? '<a class="btn btn-outline btn-sm" href="/api/v1/reports/export-audit" target="_blank" rel="noopener">Export audit CSV</a>' : ''}
        </div>` : '<p class="small muted">Operational reports require a staff role. Patients can open their own intake summaries from the Intakes list.</p>'}
        <div id="rep-out" style="margin-top:12px"></div></div>
    </div>`;
  view.querySelector('#r-open').onclick = () => {
    const id = view.querySelector('#r-visit').value.trim();
    if (id) window.location.hash = `#/intakes/${id}`;
    else toast('Open an intake from the Intakes or Queue list first.', 'warn');
  };
  view.querySelectorAll('[data-rep]').forEach((b) => {
    b.onclick = async () => {
      const out = view.querySelector('#rep-out');
      out.innerHTML = 'Loading…';
      try {
        const res = await api.get(`/reports/${b.dataset.rep}`);
        out.innerHTML = `<pre class="small" style="white-space:pre-wrap;background:var(--surface-2);padding:12px;border-radius:8px;max-height:360px;overflow:auto">${escapeHtml(JSON.stringify(res.data, null, 2).slice(0, 6000))}</pre>`;
      } catch (err) { out.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`; }
    };
  });
  refreshIcons();
}
