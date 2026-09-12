import { api } from '../api/client.js';
import { toast, showLoading, escapeHtml, openModal, refreshIcons } from '../components/ui.js';

export async function render(view, session) {
  view.innerHTML = `
    <div class="page-head"><div><h2>Administration</h2><p class="muted">Staff, departments, triage rules, notifications, audits, and upload settings.</p></div></div>
    <div class="grid-2">
      <div class="card"><h3>Staff accounts <button class="btn btn-sm btn-primary" id="add-staff" style="float:right">Add staff</button></h3><div id="users" style="clear:both"></div></div>
      <div class="card"><h3>Departments <button class="btn btn-sm btn-outline" id="add-dept" style="float:right">Add</button></h3><div id="depts" style="clear:both"></div></div>
    </div>
    <div class="card" style="margin-top:12px"><h3>Triage rules <span class="small muted">(demo thresholds — require clinical validation)</span> <button class="btn btn-sm btn-outline" id="sync-rules" style="float:right">Sync catalogue</button></h3><div id="rules" style="clear:both"></div></div>
    <div class="card" style="margin-top:12px"><h3>Notification templates <span class="small muted">(variables: {{visitId}} {{token}} {{status}} {{priority}} only)</span></h3><div id="templates"></div></div>
    <div class="card" style="margin-top:12px"><h3>Audit events (immutable)</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <input id="au-action" type="search" placeholder="Action contains…" style="flex:1;min-width:140px" aria-label="Filter by action">
        <input id="au-entity" type="search" placeholder="Entity type…" style="flex:1;min-width:120px" aria-label="Filter by entity type">
        <input id="au-from" type="date" aria-label="From date">
        <input id="au-to" type="date" aria-label="To date">
        <button class="btn btn-outline btn-sm" id="au-go">Apply</button>
        <a class="btn btn-outline btn-sm" id="au-export" href="/api/v1/reports/export-audit" target="_blank" rel="noopener">Export CSV</a>
      </div><div id="audits"></div></div>
    <div class="card" style="margin-top:12px"><h3>Upload & queue settings</h3>
      <div class="form-grid">
        <div class="field full"><label for="mime">Allowed MIME types (comma-separated)</label><input id="mime" value="application/pdf, image/jpeg, image/png, image/webp"></div>
        <div class="field"><label for="retention">Upload retention (days)</label><input id="retention" type="number" min="1" max="3650" value="90"></div>
        <div class="field"><label for="strategy">Default queue strategy</label><select id="strategy"><option value="clinical-first">Clinical-first</option><option value="arrival-only">Arrival order</option></select></div>
      </div>
      <button class="btn btn-outline btn-sm" id="save-settings" style="margin-top:8px">Save settings</button></div>`;
  const usersEl = view.querySelector('#users'), deptsEl = view.querySelector('#depts'), rulesEl = view.querySelector('#rules'), auditsEl = view.querySelector('#audits'), tplEl = view.querySelector('#templates');
  showLoading(usersEl, 3); showLoading(deptsEl, 3); showLoading(rulesEl, 3); showLoading(auditsEl, 3); showLoading(tplEl, 2);
  try {
    const [users, depts, rules, audits, templates] = await Promise.all([
      api.get('/admin/users', { query: { limit: 50 } }),
      api.get('/departments'),
      api.get('/admin/rules'),
      api.get('/admin/audit-logs', { query: { limit: 15 } }),
      api.get('/admin/notification-templates'),
    ]);
    usersEl.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Active</th><th></th></tr></thead><tbody>
      ${users.data.map((u) => `<tr><td>${escapeHtml(u.fullName)}<br><span class="small muted">${escapeHtml(u.email)}</span></td><td>${u.role}</td><td>${u.isActive ? 'Yes' : 'No'}</td>
      <td style="white-space:nowrap"><button class="btn btn-sm btn-outline" data-role="${u.id}" data-current="${u.role}">Role</button> <button class="btn btn-sm btn-outline" data-toggle="${u.id}" data-active="${u.isActive ? 0 : 1}">${u.isActive ? 'Deactivate' : 'Activate'}</button></td></tr>`).join('')}
      </tbody></table></div>`;
    usersEl.querySelectorAll('[data-toggle]').forEach((b) => {
      b.onclick = async () => {
        try { await api.patch(`/admin/users/${b.dataset.toggle}/active`, { isActive: b.dataset.active === '1' }); toast('Account status updated.', 'success'); render(view, session); }
        catch (err) { toast(err.message, 'error'); }
      };
    });
    usersEl.querySelectorAll('[data-role]').forEach((b) => {
      b.onclick = () => {
        openModal('Update role', `<div class="field"><label for="nr-role">Role for this account</label><select id="nr-role">${['receptionist', 'nurse', 'doctor', 'admin', 'patient'].map((r) => `<option ${b.dataset.current === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>`, [{
          label: 'Save role', primary: true, keepOpen: true, onClick: async () => {
            try { await api.patch(`/admin/users/${b.dataset.role}/role`, { role: document.getElementById('nr-role').value }); toast('Role updated.', 'success'); location.reload(); }
            catch (err) { toast(err.message, 'error'); }
          },
        }]);
      };
    });
    deptsEl.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Department</th><th>Consult</th><th>Active</th><th></th></tr></thead><tbody>
      ${depts.data.map((d) => `<tr><td><strong>${escapeHtml(d.name)}</strong><br><span class="small muted">${escapeHtml(d.code)} · ${escapeHtml(d.location || '')}</span></td><td class="small">${d.averageConsultMinutes || 15} min</td><td>${d.isActive ? 'Yes' : 'No'}</td><td><button class="btn btn-sm btn-outline" data-dept="${d._id}">Edit</button></td></tr>`).join('')}
      </tbody></table></div>`;
    deptsEl.querySelectorAll('[data-dept]').forEach((b) => {
      b.onclick = async () => {
        const current = depts.data.find((d) => String(d._id) === b.dataset.dept) || {};
        openModal('Edit department', `
          <div class="field"><label for="ed-loc">Location</label><input id="ed-loc" value="${escapeHtml(current.location || '')}"></div>
          <div class="form-grid" style="margin-top:8px"><div class="field"><label for="ed-min">Avg consult (min)</label><input id="ed-min" type="number" min="1" max="240" value="${current.averageConsultMinutes || 15}"></div>
          <div class="field"><label for="ed-active">Active</label><select id="ed-active"><option value="1" ${current.isActive ? 'selected' : ''}>Yes</option><option value="0" ${current.isActive ? '' : 'selected'}>No</option></select></div></div>
          <div class="field" style="margin-top:8px"><label for="ed-desc">Description</label><input id="ed-desc" value="${escapeHtml(current.description || '')}"></div>`, [{
          label: 'Save', primary: true, keepOpen: true, onClick: async () => {
            try {
              await api.patch(`/departments/${b.dataset.dept}`, { location: document.getElementById('ed-loc').value, averageConsultMinutes: Number(document.getElementById('ed-min').value) || 15, isActive: document.getElementById('ed-active').value === '1', description: document.getElementById('ed-desc').value });
              toast('Department updated.', 'success'); location.reload();
            } catch (err) { toast(err.message, 'error'); }
          },
        }]);
      };
    });
    rulesEl.innerHTML = `<p class="small muted">Version ${escapeHtml(rules.data.version)}</p><div class="table-wrap"><table><thead><tr><th>Rule</th><th>Points</th><th>Active</th><th></th></tr></thead><tbody>
      ${(rules.data.rules || []).map((r) => `<tr><td><strong>${escapeHtml(r.ruleId)}</strong> ${escapeHtml(r.label)}</td><td>${r.points}</td><td>${r.isActive === false ? 'No' : 'Yes'}</td><td style="white-space:nowrap"><button class="btn btn-sm btn-outline" data-points="${r.ruleId}" data-value="${r.points}">Points</button> <button class="btn btn-sm btn-outline" data-rule="${r.ruleId}" data-active="${r.isActive === false ? 1 : 0}">${r.isActive === false ? 'Enable' : 'Disable'}</button></td></tr>`).join('')}
      </tbody></table></div>`;
    rulesEl.querySelectorAll('[data-rule]').forEach((b) => {
      b.onclick = async () => {
        try { await api.patch(`/admin/rules/${b.dataset.rule}`, { isActive: b.dataset.active === '1' }); toast('Rule updated.', 'success'); render(view, session); }
        catch (err) { toast(err.message, 'error'); }
      };
    });
    rulesEl.querySelectorAll('[data-points]').forEach((b) => {
      b.onclick = () => {
        openModal(`Points — ${b.dataset.points}`, `<div class="field"><label for="pt-val">Points (0–100)</label><input id="pt-val" type="number" min="0" max="100" value="${b.dataset.value}"></div>`, [{
          label: 'Save', primary: true, keepOpen: true, onClick: async () => {
            try { await api.patch(`/admin/rules/${b.dataset.points}`, { points: Number(document.getElementById('pt-val').value) }); toast('Rule points updated.', 'success'); location.reload(); }
            catch (err) { toast(err.message, 'error'); }
          },
        }]);
      };
    });
    tplEl.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Type</th><th>Subject / body</th><th></th></tr></thead><tbody>
      ${(templates.data || []).map((t) => `<tr><td><strong>${escapeHtml(t.type)}</strong>${t.customized ? '<br><span class="small muted">customized</span>' : ''}</td><td class="small"><strong>${escapeHtml(t.subject)}</strong><br>${escapeHtml(t.body)}</td><td><button class="btn btn-sm btn-outline" data-tpl="${t.type}">Edit</button></td></tr>`).join('')}
      </tbody></table></div>`;
    tplEl.querySelectorAll('[data-tpl]').forEach((b) => {
      b.onclick = () => {
        const cur = (templates.data || []).find((t) => t.type === b.dataset.tpl) || {};
        openModal(`Template — ${b.dataset.tpl}`, `
          <div class="field"><label for="tp-sub">Subject (max 160)</label><input id="tp-sub" value="${escapeHtml(cur.subject || '')}"></div>
          <div class="field" style="margin-top:8px"><label for="tp-body">Body (max 500; {{visitId}} {{token}} {{status}} {{priority}} only)</label><textarea id="tp-body" rows="3">${escapeHtml(cur.body || '')}</textarea></div>`, [{
          label: 'Save template', primary: true, keepOpen: true, onClick: async () => {
            try {
              await api.patch(`/admin/notification-templates/${b.dataset.tpl}`, { subject: document.getElementById('tp-sub').value, body: document.getElementById('tp-body').value });
              toast('Template updated.', 'success'); location.reload();
            } catch (err) { toast(err.message, 'error'); }
          },
        }]);
      };
    });
    auditsEl.innerHTML = `<ul class="small">${audits.data.map((a) => `<li>${escapeHtml(a.action)} · ${escapeHtml(a.actorRole || 'system')} · ${new Date(a.createdAt).toLocaleString()}</li>`).join('')}</ul>
      <p class="small muted">Showing ${audits.data.length} of ${audits.meta?.total ?? '?'} events.</p>`;
    const auditQuery = () => {
      const q = new URLSearchParams();
      const v = (id) => view.querySelector(id).value.trim();
      if (v('#au-action')) q.set('action', v('#au-action'));
      if (v('#au-entity')) q.set('entityType', v('#au-entity'));
      if (view.querySelector('#au-from').value) q.set('from', view.querySelector('#au-from').value);
      if (view.querySelector('#au-to').value) q.set('to', view.querySelector('#au-to').value);
      return q.toString();
    };
    view.querySelector('#au-go').onclick = async () => {
      showLoading(auditsEl, 2);
      try {
        const res = await api.get(`/admin/audit-logs?limit=15&${auditQuery()}`);
        auditsEl.innerHTML = `<ul class="small">${res.data.map((a) => `<li>${escapeHtml(a.action)} · ${escapeHtml(a.actorRole || 'system')} · ${new Date(a.createdAt).toLocaleString()}</li>`).join('') || '<li>No matching events.</li>'}</ul>
          <p class="small muted">Showing ${res.data.length} of ${res.meta?.total ?? '?'} events.</p>`;
      } catch (err) { auditsEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`; }
    };
    view.querySelector('#au-export').href = `/api/v1/reports/export-audit?${auditQuery()}`;
    ['#au-action', '#au-entity', '#au-from', '#au-to'].forEach((id) => view.querySelector(id).addEventListener('change', () => {
      view.querySelector('#au-export').href = `/api/v1/reports/export-audit?${auditQuery()}`;
    }));
  } catch (err) { usersEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`; }

  view.querySelector('#sync-rules').onclick = async () => {
    try { await api.post('/admin/rules/sync', {}); toast('Rule catalogue synchronized.', 'success'); } catch (err) { toast(err.message, 'error'); }
  };
  view.querySelector('#save-settings').onclick = async () => {
    try {
      await api.patch('/admin/settings', {
        allowedMime: view.querySelector('#mime').value.split(',').map((s) => s.trim()).filter(Boolean),
        retentionDays: Number(view.querySelector('#retention').value) || 90,
        queueStrategy: view.querySelector('#strategy').value,
      });
      toast('Settings updated.', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };
  view.querySelector('#add-dept').onclick = async () => {
    const name = prompt('Department name:'); if (!name) return;
    const code = prompt('Department code (e.g. CARD):'); if (!code) return;
    try { await api.post('/departments', { name, code }); toast('Department created.', 'success'); render(view, session); }
    catch (err) { toast(err.message, 'error'); }
  };
  view.querySelector('#add-staff').onclick = async () => {
    const fullName = prompt('Full name:'); if (!fullName) return;
    const email = prompt('Email:'); if (!email) return;
    const role = prompt('Role (receptionist/nurse/doctor/admin):', 'nurse'); if (!role) return;
    const password = prompt('Temporary password (min 8 chars, letters+numbers):', 'Temp1234'); if (!password) return;
    try { await api.post('/admin/users', { fullName, email, role, password }); toast('Staff account created.', 'success'); render(view, session); }
    catch (err) { toast(err.message, 'error'); }
  };
  refreshIcons();
}
