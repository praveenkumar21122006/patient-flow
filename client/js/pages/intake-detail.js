import { api } from '../api/client.js';
import { toast, showLoading, priorityBadge, statusLabel, escapeHtml, openModal, refreshIcons } from '../components/ui.js';
import { fmtDateTime, SYMPTOM_OPTIONS, RED_FLAG_OPTIONS } from '../utils/helpers.js';

// Intake detail: summary, vitals history + entry, triage run/confirm, escalation, assignment, reviews, print.
export async function render(view, session, id) {
  view.innerHTML = `<div id="body"><div class="skeleton"></div><div class="skeleton"></div></div>`;
  const body = view.querySelector('#body');
  let intake, assessments = [], vitalsHistory = [], queueEntry = null, departments = [];
  try {
    const [iRes, aRes, vRes, dRes] = await Promise.all([
      api.get(`/intakes/${id}`),
      api.get('/triage', { query: { intake: id } }).catch(() => ({ data: [] })),
      api.get('/vitals', { query: { intake: id } }).catch(() => ({ data: [] })),
      api.get('/departments').catch(() => ({ data: [] })),
    ]);
    intake = iRes.data; assessments = aRes.data || []; vitalsHistory = vRes.data || []; departments = dRes.data || [];
    try { const q = await api.get('/queue', { query: { search: intake.visitId, limit: 5 } }); queueEntry = (q.data || [])[0] || null; } catch { /* ignore */ }
  } catch (err) { body.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`; return; }

  const latest = assessments[0];
  const canTriage = ['nurse', 'doctor', 'admin'].includes(session.user.role);
  const canReview = ['doctor', 'admin', 'nurse'].includes(session.user.role);
  body.innerHTML = `
    <div class="page-head"><div><h2>${escapeHtml(intake.visitId)} · ${escapeHtml(intake.patient?.fullName || intake.demographics?.fullName || '')}</h2>
    <p class="muted">Status: ${statusLabel(intake.status)} · Submitted ${fmtDateTime(intake.createdAt)}</p></div>
    <div class="page-actions no-print">
      <button class="btn btn-outline btn-sm" id="print-btn">Print summary / PDF</button>
      <a class="btn btn-outline btn-sm" id="pdf-btn" href="/api/v1/reports/intake/${intake._id}/pdf" target="_blank" rel="noopener">Download PDF</a>
      <button class="btn btn-outline btn-sm" id="token-btn">Print token</button>
      <a class="btn btn-outline btn-sm" href="/api/v1/reports/intake/${intake._id}" target="_blank" rel="noopener">JSON summary</a>
      ${queueEntry && canTriage ? `<button class="btn btn-outline btn-sm" id="assign-btn">Assign</button>` : ''}
      ${queueEntry && canTriage ? `<button class="btn btn-outline btn-sm" id="esc-btn">Escalate</button>` : ''}
    </div></div>
    ${latest ? `<div class="alert alert-warn"><strong>Suggested Priority – Requires Clinical Review:</strong> ${priorityBadge(latest.suggestedPriority)} ${latest.confirmedPriority ? `· Confirmed: ${priorityBadge(latest.confirmedPriority)}` : '· Awaiting confirmation'}<br><span class="small">${escapeHtml(latest.explanation || '')} (rule ${escapeHtml(latest.ruleVersion)})</span></div>` : '<div class="alert alert-info">No triage suggestion yet. Complete symptoms and vitals, then run an assessment.</div>'}
    <div class="grid-2">
      <div class="card"><h3>Visit & patient</h3>
        <p class="small"><strong>Complaint:</strong> ${escapeHtml(intake.chiefComplaint)}<br>
        <strong>Arrival:</strong> ${escapeHtml(intake.arrivalMethod)} · <strong>Type:</strong> ${escapeHtml(intake.visitType)}<br>
        <strong>Department:</strong> ${escapeHtml(intake.assignedDepartment?.name || 'Unassigned')} · <strong>Token:</strong> ${escapeHtml(queueEntry?.token || '—')}</p>
        <p class="small"><strong>Contact:</strong> ${escapeHtml(intake.demographics?.phone || '')} · <strong>Emergency:</strong> ${escapeHtml(intake.demographics?.emergencyContactName || '')} (${escapeHtml(intake.demographics?.emergencyContactPhone || '')})</p>
        <h4>Symptoms ${canTriage ? '<button class="btn btn-sm btn-outline" id="symptoms-btn" style="margin-left:8px">Record symptoms</button>' : ''}</h4><div class="small">${(intake.symptoms || []).map((s) => `<p>• ${(s.symptoms || []).join(', ')} · Pain ${s.painLevel}/10 · Red flags: ${(s.redFlags || []).join(', ') || 'none'}<br><span class="muted">${escapeHtml(s.description || '')}</span></p>`).join('') || '<p class="muted">No symptoms recorded.</p>'}</div>
        <h4>Medical background</h4><div class="small" id="history-box"></div>
        <h4>Status timeline</h4><ul class="small">${(intake.statusTimeline || []).map((t) => `<li>${statusLabel(t.status)} · ${fmtDateTime(t.at)}${t.note ? ` — ${escapeHtml(t.note)}` : ''}</li>`).join('')}</ul>
        <p class="small muted" style="margin-top:12px">Safety notice: PatientFlow provides workflow support and a suggested priority only. It does not diagnose, prescribe, or replace a qualified healthcare professional.</p>
      </div>
      <div>
        <div class="card"><h3>Vital signs ${canTriage ? '<button class="btn btn-sm btn-primary" id="vitals-btn" style="float:right">Record vitals</button>' : ''}</h3><div id="vitals-list" style="clear:both"></div></div>
        <div class="card" style="margin-top:12px"><h3>Triage</h3><div id="triage-box"></div></div>
      </div>
    </div>
    ${canReview ? `<div class="card" style="margin-top:12px"><h3>Clinical review</h3>
      <div class="field"><label for="rv-notes">Review notes * (structured note, not a diagnosis)</label><textarea id="rv-notes" rows="3"></textarea></div>
      <div class="form-grid" style="margin-top:8px">
        <div class="field"><label for="rv-status">Update visit status</label><select id="rv-status"><option value="">No change</option>${['assigned', 'in-consultation', 'observation', 'completed', 'cancelled'].map((s) => `<option>${s}</option>`).join('')}</select></div>
        <div class="field"><label for="rv-ack">Emergency acknowledgement</label><select id="rv-ack"><option value="">—</option><option value="yes">I acknowledge the emergency alert</option></select></div>
      </div>
      <button class="btn btn-primary btn-sm" id="rv-save" style="margin-top:10px">Save clinical review</button></div>` : ''}`;

  // Vitals history
  const vl = body.querySelector('#vitals-list');
  vl.innerHTML = vitalsHistory.length ? `<div class="table-wrap"><table><thead><tr><th>At</th><th>Temp</th><th>HR</th><th>RR</th><th>BP</th><th>SpO2</th><th>Flags</th></tr></thead><tbody>
    ${vitalsHistory.map((v) => `<tr><td class="small">${fmtDateTime(v.recordedAt)}<br>${escapeHtml(v.recordedBy?.fullName || '')}</td><td>${v.temperatureC ?? '—'}</td><td>${v.heartRateBpm ?? '—'}</td><td>${v.respiratoryRate ?? '—'}</td><td>${v.systolicBp ?? '—'}/${v.diastolicBp ?? '—'}</td><td>${v.oxygenSaturation ?? '—'}</td><td class="small">${(v.abnormalFlags || []).join(', ') || '—'}</td></tr>`).join('')}
    </tbody></table></div><p class="small muted">Abnormal flags are informational only, not a diagnosis. Previous readings are preserved.</p>`
    : '<p class="muted small">No vital signs recorded yet.</p>';

  // Triage box
  const tb = body.querySelector('#triage-box');
  tb.innerHTML = assessments.length
    ? assessments.map((a) => `<div style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px">
        <p class="small"><strong>Suggested:</strong> ${priorityBadge(a.suggestedPriority)} ${a.confirmedPriority ? `<strong>Confirmed:</strong> ${priorityBadge(a.confirmedPriority)}` : '<em>awaiting confirmation</em>'} <span class="muted">· rule ${escapeHtml(a.ruleVersion)} · score ${a.score}</span></p>
        <ul class="small">${(a.matchedRules || []).map((m) => `<li>${escapeHtml(m.label)} (+${m.points}) ${m.detail ? `— ${escapeHtml(m.detail)}` : ''}</li>`).join('')}</ul>
        ${a.status === 'suggested' && canTriage ? `<button class="btn btn-sm btn-primary" data-confirm="${a._id}">Confirm / override</button>` : ''}
        ${a.overrideReason ? `<p class="small"><strong>Override reason:</strong> ${escapeHtml(a.overrideReason)}</p>` : ''}
      </div>`).join('')
    : '<p class="muted small">No assessments yet.</p>';
  if (canTriage) {
    const run = document.createElement('button');
    run.className = 'btn btn-outline btn-sm'; run.textContent = 'Run triage assessment';
    run.onclick = async () => {
      const notes = prompt('Structured triage notes (optional):') || '';
      try { const res = await api.post('/triage/assess', { intake: intake._id, triageNotes: notes }); toast('Suggestion generated — requires clinical review.', 'success'); location.reload(); }
      catch (err) { toast(err.message, 'error'); }
    };
    tb.appendChild(run);
    tb.querySelectorAll('[data-confirm]').forEach((b) => {
      b.onclick = () => {
        const aid = b.dataset.confirm;
        openModal('Confirm priority', `
          <div class="field"><label for="m-pri">Final priority *</label><select id="m-pri">${['critical', 'urgent', 'moderate', 'low', 'unclassified'].map((p) => `<option>${p}</option>`).join('')}</select></div>
          <div class="field" style="margin-top:8px"><label for="m-reason">Reason (mandatory when overriding the suggestion)</label><textarea id="m-reason" rows="3" placeholder="Clinical rationale for the final priority…"></textarea></div>
          <p class="small muted">The original suggestion, final priority, staff, timestamp, and reason are logged immutably.</p>`, [{
          label: 'Save confirmation', primary: true, keepOpen: true, onClick: async () => {
            try {
              await api.post(`/triage/${aid}/confirm`, { confirmedPriority: document.getElementById('m-pri').value, overrideReason: document.getElementById('m-reason').value });
              toast('Priority decision recorded.', 'success'); location.reload();
            } catch (err) { toast(err.message, 'error'); }
          },
        }]);
      };
    });
  }

  body.querySelector('#print-btn').onclick = () => window.print();
  body.querySelector('#token-btn').onclick = () => {
    const w = window.open('', '_blank', 'width=420,height=560');
    if (!w) { toast('Allow pop-ups to print the token.', 'warn'); return; }
    w.document.write(`<html><head><title>Queue token ${escapeHtml(queueEntry?.token || intake.visitId)}</title>
      <style>body{font-family:Arial,sans-serif;padding:32px;text-align:center}h1{font-size:44px;margin:8px 0}.box{border:2px dashed #333;border-radius:12px;padding:24px;margin-top:16px}.small{color:#444;font-size:13px}</style></head><body>
      <div>City General Hospital · PatientFlow</div>
      <div class="box"><div>QUEUE TOKEN</div><h1>${escapeHtml(queueEntry?.token || '—')}</h1>
      <div>Visit ${escapeHtml(intake.visitId)} · ${escapeHtml(intake.assignedDepartment?.name || 'Triage queue')}</div>
      <div>Arrival ${escapeHtml(fmtDateTime(queueEntry?.arrivalAt || intake.createdAt))}</div></div>
      <p class="small">If your condition worsens, tell front-desk staff immediately. In an emergency, contact local emergency services. Suggested priorities require clinical review.</p>
      <script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  };
  body.querySelector('#assign-btn')?.addEventListener('click', async () => {
    let clinicians = [];
    try { clinicians = (await api.get('/users/clinicians')).data || []; } catch (err) { toast(err.message, 'error'); return; }
    openModal('Assign patient', `
      <div class="field"><label for="a-dept">Department</label><select id="a-dept"><option value="">Keep current (${escapeHtml(intake.assignedDepartment?.name || 'unassigned')})</option>${departments.map((d) => `<option value="${d._id}">${escapeHtml(d.name)} (${escapeHtml(d.code)})</option>`).join('')}</select></div>
      <div class="field" style="margin-top:8px"><label for="a-clin">Clinician (doctor / nurse)</label><select id="a-clin"><option value="">No change</option>${clinicians.map((u) => `<option value="${u.id}">${escapeHtml(u.fullName)} · ${escapeHtml(u.role)}</option>`).join('')}</select></div>
      <p class="small muted">The assignee is notified in-app. Assignment is audit-logged with staff and timestamp.</p>`, [{
      label: 'Save assignment', primary: true, keepOpen: true, onClick: async () => {
        const departmentId = document.getElementById('a-dept').value || undefined;
        const clinicianId = document.getElementById('a-clin').value || undefined;
        if (!departmentId && !clinicianId) { toast('Choose a department, a clinician, or both.', 'warn'); return; }
        try {
          await api.post(`/queue/${intake._id}/assign`, { departmentId, clinicianId });
          toast('Patient assigned.', 'success'); location.reload();
        } catch (err) { toast(err.message, 'error'); }
      },
    }]);
  });
  body.querySelector('#esc-btn')?.addEventListener('click', async () => {
    const reason = prompt('Escalation reason:') || 'Escalated to doctor';
    try { await api.post(`/queue/${intake._id}/escalate`, { reason }); toast('Escalated. Emergency staff notified.', 'success'); location.reload(); }
    catch (err) { toast(err.message, 'error'); }
  });
  body.querySelector('#vitals-btn')?.addEventListener('click', () => {
    openModal('Record vital signs', `
      <div class="form-grid">
      ${[['v-temp', 'Temp °C'], ['v-hr', 'Heart rate bpm'], ['v-rr', 'Resp. rate /min'], ['v-sys', 'Systolic mmHg'], ['v-dia', 'Diastolic mmHg'], ['v-spo2', 'SpO2 %'], ['v-gluc', 'Glucose mg/dL'], ['v-wt', 'Weight kg'], ['v-ht', 'Height cm']].map(([id, l]) => `<div class="field"><label for="${id}">${l}</label><input id="${id}" type="number" step="any"></div>`).join('')}
      <div class="field"><label for="v-con">Consciousness (AVPU)</label><select id="v-con"><option value="alert">Alert</option><option value="voice">Voice</option><option value="pain">Pain</option><option value="unresponsive">Unresponsive</option></select></div>
      <div class="field"><label for="v-mob">Mobility</label><select id="v-mob"><option value="independent">Independent</option><option value="assisted">Assisted</option><option value="wheelchair">Wheelchair</option><option value="stretcher">Stretcher</option><option value="immobile">Immobile</option></select></div>
      <div class="field full"><label for="v-obs">Staff observations</label><textarea id="v-obs" rows="2"></textarea></div></div>`, [{
      label: 'Save reading', primary: true, keepOpen: true, onClick: async () => {
        const num = (id) => { const v = document.getElementById(id).value; return v === '' ? null : Number(v); };
        try {
          await api.post('/vitals', { intake: intake._id, temperatureC: num('v-temp'), heartRateBpm: num('v-hr'), respiratoryRate: num('v-rr'), systolicBp: num('v-sys'), diastolicBp: num('v-dia'), oxygenSaturation: num('v-spo2'), bloodGlucoseMgDl: num('v-gluc'), weightKg: num('v-wt'), heightCm: num('v-ht'), consciousness: document.getElementById('v-con').value, mobility: document.getElementById('v-mob').value, observations: document.getElementById('v-obs').value });
          toast('Vital signs recorded.', 'success'); location.reload();
        } catch (err) { toast(err.message, 'error'); }
      },
    }]);
  });
  body.querySelector('#symptoms-btn')?.addEventListener('click', () => {
    openModal('Record symptoms', `
      <div class="field"><label>Symptoms * (select at least one)</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
        ${SYMPTOM_OPTIONS.map((s) => `<label style="font-weight:400;border:1px solid var(--border);border-radius:99px;padding:6px 12px;font-size:13px"><input type="checkbox" data-ms="${escapeHtml(s)}"> ${escapeHtml(s)}</label>`).join('')}
      </div></div>
      <div class="form-grid" style="margin-top:10px">
        <div class="field"><label for="ms-sev">Severity</label><select id="ms-sev"><option value="mild">mild</option><option value="moderate" selected>moderate</option><option value="severe">severe</option></select></div>
        <div class="field"><label for="ms-pain">Pain level 0–10 *</label><input id="ms-pain" type="number" min="0" max="10" value="0"></div>
        <div class="field"><label for="ms-dur">Duration (e.g. “2 days”)</label><input id="ms-dur"></div>
        <div class="field"><label for="ms-loc">Pain location</label><input id="ms-loc"></div>
        <div class="field full"><label for="ms-desc">Description</label><textarea id="ms-desc" rows="2"></textarea></div>
      </div>
      <fieldset style="border:1px solid var(--border);border-radius:8px;margin-top:10px"><legend class="small"><strong>Red-flag screening</strong></legend>
        ${RED_FLAG_OPTIONS.map((r) => `<label class="small" style="display:block;font-weight:400;margin:4px 0"><input type="checkbox" data-mrf="${r.value}"> ${r.label}</label>`).join('')}
        <label class="small" style="display:block;font-weight:400;margin-top:8px"><input type="checkbox" id="ms-worse"> Symptoms are getting worse</label>
      </fieldset>`, [{
      label: 'Save symptoms', primary: true, keepOpen: true, onClick: async () => {
        const picked = [...document.querySelectorAll('[data-ms]:checked')].map((x) => x.dataset.ms);
        const pain = Number(document.getElementById('ms-pain').value);
        if (!picked.length) { toast('Select at least one symptom.', 'error'); return; }
        if (!(pain >= 0 && pain <= 10)) { toast('Pain level must be between 0 and 10.', 'error'); return; }
        try {
          await api.post(`/intakes/${intake._id}/symptoms`, {
            symptoms: picked, severity: document.getElementById('ms-sev').value, painLevel: pain,
            duration: document.getElementById('ms-dur').value, painLocation: document.getElementById('ms-loc').value,
            description: document.getElementById('ms-desc').value,
            redFlags: [...document.querySelectorAll('[data-mrf]:checked')].map((x) => x.dataset.mrf),
            isWorsening: document.getElementById('ms-worse').checked,
          });
          toast('Symptoms recorded.', 'success'); location.reload();
        } catch (err) { toast(err.message, 'error'); }
      },
    }]);
  });
  body.querySelector('#rv-save')?.addEventListener('click', async () => {
    const notes = body.querySelector('#rv-notes').value.trim();
    if (!notes) { toast('Review notes are required.', 'error'); return; }
    try {
      await api.post('/clinical-reviews', { intake: intake._id, reviewNotes: notes, summary: notes.slice(0, 200), newStatus: body.querySelector('#rv-status').value || undefined, acknowledgedEmergency: body.querySelector('#rv-ack').value === 'yes' });
      toast('Clinical review saved.', 'success'); location.reload();
    } catch (err) { toast(err.message, 'error'); }
  });
  // Medical background (allergies/meds/conditions visible to clinical roles; reception projection already strips it server-side).
  const hb = body.querySelector('#history-box');
  const h = intake.medicalHistory && !Array.isArray(intake.medicalHistory) ? intake.medicalHistory : null;
  hb.innerHTML = h ? `
    <p><strong>Conditions:</strong> ${(h.conditions || []).map(escapeHtml).join(', ') || '—'}<br>
    <strong>Surgeries:</strong> ${(h.previousSurgeries || []).map(escapeHtml).join(', ') || '—'}<br>
    <strong>Pregnancy:</strong> ${escapeHtml(h.pregnancyStatus || '—')}<br>
    <strong>Allergies:</strong> ${(h.allergies || []).map((a) => escapeHtml(`${a.name || ''}${a.reaction ? ` (${a.reaction})` : ''}`)).join(', ') || 'none recorded'}<br>
    <strong>Medications:</strong> ${(h.medications || []).map((m) => escapeHtml(m.name || '')).join(', ') || 'none recorded'}<br>
    <strong>Recent hospitalization:</strong> ${escapeHtml(h.recentHospitalization || '—')}<br>
    <strong>Family history:</strong> ${escapeHtml(h.familyHistory || '—')}</p>`
    : '<p class="muted">No medical background recorded yet.</p>';
  refreshIcons();
}
