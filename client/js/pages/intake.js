import { api, uploadDocuments } from '../api/client.js';
import { toast, escapeHtml, refreshIcons } from '../components/ui.js';
import { calcAge } from '../utils/helpers.js';

const DRAFT_KEY = 'pf-intake-draft';

export async function renderNew(view, session) {
  let departments = [];
  try { departments = (await api.get('/departments')).data || []; } catch { /* optional */ }
  const isStaff = session.user.role !== 'patient';
  const saved = loadDraft();
  view.innerHTML = `
    ${isStaff ? `<div class="card" style="margin-bottom:12px"><h3 style="margin-top:0">Patient for this intake *</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><input id="staff-patient-search" type="search" placeholder="Search name / ID / phone…" style="flex:1;min-width:200px" aria-label="Search patient">
      <select id="staff-patient-select" aria-label="Select patient" style="flex:2;min-width:220px"><option value="">Select a registered patient…</option></select></div>
      <p class="small muted">Staff must attach the intake to a registered patient (use Patients page to register first). Your selection is sent as the intake owner.</p></div>` : ''}
    <div class="steps" role="list" aria-label="Intake progress">
      ${['1. Patient details', '2. Visit info', '3. Consent & review'].map((s, i) => `<div class="step" data-step="${i + 1}" role="listitem">${s}</div>`).join('')}
    </div>
    <div class="progress" aria-hidden="true"><div id="progress-bar"></div></div>
    <div class="card" style="margin-top:14px"><form id="intake-form" novalidate><div id="step-body"></div>
    <div style="display:flex;gap:8px;justify-content:space-between;margin-top:16px">
      <button type="button" class="btn btn-outline" id="back-btn">Back</button>
      <div style="display:flex;gap:8px"><button type="button" class="btn btn-outline" id="save-draft">Save draft</button>
      <button type="submit" class="btn btn-primary" id="next-btn">Continue</button></div>
    </div></form></div>
    <p class="small muted">Drafts are saved on this device and on the server. Future dates of birth, invalid contacts, and out-of-range pain scores are blocked.</p>`;

  // Clamp to 3 steps so drafts cached by older 4/5-step versions still open correctly.
  let step = Math.min(saved.step || 1, 3);
  let data = saved.data || defaultData(session);
  // Staff drafts must not reuse another patient's cached demographics: reset when switching users/roles.
  if (isStaff && saved.data && !saved.data.patientId) { data = defaultData(session); step = 1; }
  let intakeId = saved.intakeId || null;
  if (isStaff && saved.data && saved.data.patientId) data.patientId = saved.data.patientId;

  const body = view.querySelector('#step-body');
  function gotoStep(n) { step = n; persist(); paint(); window.scrollTo(0, 0); }
  function paint() {
    view.querySelectorAll('.step').forEach((el) => {
      const n = Number(el.dataset.step);
      el.classList.toggle('active', n === step);
      el.classList.toggle('done', n < step);
    });
    view.querySelector('#progress-bar').style.width = `${(step / 3) * 100}%`;
    view.querySelector('#back-btn').disabled = step === 1;
    view.querySelector('#next-btn').textContent = step === 3 ? 'Submit to triage queue' : 'Continue';
    body.innerHTML = stepHtml(step, data, departments);
    wireStep(step, body, data);
    if (step === 3) renderReview(body, data, gotoStep);
    refreshIcons();
  }
  view.querySelector('#back-btn').onclick = () => { if (step > 1) { step -= 1; persist(); paint(); } };
  view.querySelector('#save-draft').onclick = () => { persist(); toast('Draft saved on this device.', 'success'); };
  if (isStaff) wireStaffPatientPicker(view, data, () => persist());
  view.querySelector('#intake-form').onsubmit = async (e) => {
    e.preventDefault();
    collectStep(step, body, data);
    if (isStaff && !data.patientId) { toast('Select a registered patient first.', 'error'); return; }
    const err = validateStep(step, data);
    if (err) { toast(err, 'error'); return; }
    if (step === 3) {
      if (!body.querySelector('#f-consent')?.checked) { toast('Data-processing consent is required.', 'error'); return; }
      if (!body.querySelector('#f-acc')?.checked) { toast('Accuracy confirmation is required.', 'error'); return; }
    }
    persist();
    try {
      if (step === 1) intakeId = await ensureDraft(data, intakeId);
      if (step === 2 && intakeId) await api.put(`/intakes/${intakeId}`, { arrivalMethod: data.arrivalMethod, visitType: data.visitType, chiefComplaint: data.chiefComplaint, departmentPreference: data.departmentPreference || null, symptomOnsetAt: data.symptomOnsetAt || null, previousVisitRef: data.previousVisitRef });
      if (step === 3 && intakeId) {
        const files = body.querySelector('#docs')?.files;
        if (files && files.length) await uploadDocuments(intakeId, files).catch((ex) => toast(ex.message, 'error'));
        await api.post(`/intakes/${intakeId}/submit`, { dataProcessing: true, accuracyConfirmed: true });
        sessionStorage.removeItem(DRAFT_KEY);
        toast('Intake submitted successfully.', 'success');
        window.location.hash = `#/intakes/${intakeId}`;
        return;
      }
      persist();
      if (step < 3) { step += 1; persist(); paint(); window.scrollTo(0, 0); }
    } catch (ex) { toast(ex.message, 'error'); }
  };
  function persist() { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step, data, intakeId })); }
  paint();
}

function defaultData(session) {
  if (session.user.role !== 'patient') {
    // Staff start blank and must pick the patient above; never prefill with staff identity.
    return {
      patientId: '', fullName: '', dateOfBirth: '', gender: 'prefer-not-to-say', bloodGroup: 'Unknown', phone: '',
      email: '', address: '', preferredLanguage: 'English', emergencyContactName: '', emergencyContactRelationship: '', emergencyContactPhone: '',
      arrivalMethod: 'walk-in', visitType: 'new', chiefComplaint: '', departmentPreference: '', symptomOnsetAt: '', previousVisitRef: '',
    };
  }
  const p = session.profile || {};
  return {
    patientId: '', fullName: p.fullName || session.user.fullName || '', dateOfBirth: p.dateOfBirth ? String(p.dateOfBirth).slice(0, 10) : '',
    gender: p.gender || 'prefer-not-to-say', bloodGroup: p.bloodGroup || 'Unknown', phone: p.phone || session.user.phone || '',
    email: p.email || session.user.email || '', address: p.address || '', preferredLanguage: p.preferredLanguage || 'English',
    emergencyContactName: p.emergencyContactName || '', emergencyContactRelationship: p.emergencyContactRelationship || '', emergencyContactPhone: p.emergencyContactPhone || '',
    arrivalMethod: 'walk-in', visitType: 'new', chiefComplaint: '', departmentPreference: '', symptomOnsetAt: '', previousVisitRef: '',
  };
}
function loadDraft() { try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || '{}'); } catch { return {}; } }

async function ensureDraft(data, intakeId) {
  if (intakeId) {
    await api.put(`/intakes/${intakeId}`, { chiefComplaint: data.chiefComplaint || 'Not specified yet', arrivalMethod: data.arrivalMethod, visitType: data.visitType, demographics: data });
    return intakeId;
  }
  const payload = { ...data, dateOfBirth: data.dateOfBirth, departmentPreference: data.departmentPreference || null };
  if (data.patientId) payload.patient = data.patientId;
  const res = await api.post('/intakes', payload);
  return res.data._id;
}

async function wireStaffPatientPicker(view, data, persist) {
  const search = view.querySelector('#staff-patient-search');
  const select = view.querySelector('#staff-patient-select');
  async function load(q = '') {
    try {
      const res = await api.get('/patients', { query: { search: q, limit: 20 } });
      const current = select.value;
      select.innerHTML = '<option value="">Select a registered patient…</option>' + (res.data || []).map((p) => `<option value="${p._id}" ${data.patientId === String(p._id) ? 'selected' : ''}>${escapeHtml(p.fullName)} · ${escapeHtml(p.patientId)} · ${escapeHtml(p.phone || '')}</option>`).join('');
      if (current && [...select.options].some((o) => o.value === current)) select.value = current;
      else if (data.patientId) select.value = data.patientId;
    } catch (err) { toast(err.message, 'error'); }
  }
  await load('');
  let t = null;
  search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => load(search.value.trim()), 300); });
  select.addEventListener('change', async () => {
    data.patientId = select.value || '';
    if (!data.patientId) { persist(); return; }
    try {
      const res = await api.get(`/patients/${data.patientId}`);
      const p = res.data || {};
      Object.assign(data, {
        fullName: p.fullName || '', dateOfBirth: p.dateOfBirth ? String(p.dateOfBirth).slice(0, 10) : data.dateOfBirth,
        gender: p.gender || data.gender, bloodGroup: p.bloodGroup || data.bloodGroup, phone: p.phone || '',
        email: p.email || '', address: p.address || '', preferredLanguage: p.preferredLanguage || 'English',
        emergencyContactName: p.emergencyContactName || '', emergencyContactRelationship: p.emergencyContactRelationship || '', emergencyContactPhone: p.emergencyContactPhone || '',
      });
      persist();
      // Reflect the pick immediately when step 1 is visible.
      const set = (sel, val) => { const el = view.querySelector(sel); if (el) el.value = val ?? ''; };
      set('#f-fullName', data.fullName); set('#f-dob', data.dateOfBirth); set('#f-gender', data.gender);
      set('#f-blood', data.bloodGroup); set('#f-phone', data.phone); set('#f-email', data.email);
      set('#f-addr', data.address); set('#f-lang', data.preferredLanguage); set('#f-ec-name', data.emergencyContactName);
      set('#f-ec-rel', data.emergencyContactRelationship); set('#f-ec-phone', data.emergencyContactPhone);
      toast(`Intake patient set to ${p.fullName || 'selected patient'}.`, 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
}

function stepHtml(step, d, departments) {
  if (step === 1) return `
    <h3>Step 1 — Patient details</h3>
    <div class="form-grid">
      <div class="field"><label for="f-fullName">Full name *</label><input id="f-fullName" value="${escapeHtml(d.fullName)}"><span class="field-error"></span></div>
      <div class="field"><label for="f-dob">Date of birth * <span class="muted" id="age-hint">${d.dateOfBirth ? `Age ${calcAge(d.dateOfBirth)}` : ''}</span></label><input id="f-dob" type="date" value="${escapeHtml(d.dateOfBirth)}"><span class="field-error"></span></div>
      <div class="field"><label for="f-gender">Gender *</label><select id="f-gender">${['male', 'female', 'other', 'prefer-not-to-say'].map((g) => `<option ${d.gender === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
      <div class="field"><label for="f-blood">Blood group</label><select id="f-blood">${['Unknown', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => `<option ${d.bloodGroup === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
      <div class="field"><label for="f-phone">Phone *</label><input id="f-phone" value="${escapeHtml(d.phone)}"><span class="field-error"></span></div>
      <div class="field"><label for="f-email">Email</label><input id="f-email" type="email" value="${escapeHtml(d.email)}"><span class="field-error"></span></div>
      <div class="field full"><label for="f-addr">Address</label><input id="f-addr" value="${escapeHtml(d.address)}"></div>
      <div class="field"><label for="f-lang">Preferred language</label><input id="f-lang" value="${escapeHtml(d.preferredLanguage)}"></div>
      <div class="field"><label for="f-ec-name">Emergency contact name *</label><input id="f-ec-name" value="${escapeHtml(d.emergencyContactName)}"><span class="field-error"></span></div>
      <div class="field"><label for="f-ec-rel">Emergency contact relationship</label><input id="f-ec-rel" value="${escapeHtml(d.emergencyContactRelationship)}"></div>
      <div class="field"><label for="f-ec-phone">Emergency contact phone *</label><input id="f-ec-phone" value="${escapeHtml(d.emergencyContactPhone)}"><span class="field-error"></span></div>
    </div>`;
  if (step === 2) return `
    <h3>Step 2 — Visit information</h3>
    <div class="form-grid">
      <div class="field"><label for="f-arrival">Arrival method</label><select id="f-arrival">${['walk-in', 'ambulance', 'wheelchair', 'stretcher', 'referred', 'other'].map((g) => `<option ${d.arrivalMethod === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
      <div class="field"><label for="f-vtype">Visit type</label><select id="f-vtype">${['new', 'follow-up', 'emergency', 'referral'].map((g) => `<option ${d.visitType === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
      <div class="field full"><label for="f-cc">Chief complaint *</label><textarea id="f-cc" rows="3">${escapeHtml(d.chiefComplaint)}</textarea><span class="field-error"></span></div>
      <div class="field"><label for="f-dept">Department preference</label><select id="f-dept"><option value="">No preference</option>${departments.map((x) => `<option value="${x._id}" ${d.departmentPreference === x._id ? 'selected' : ''}>${escapeHtml(x.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="f-onset">Symptom start date/time</label><input id="f-onset" type="datetime-local" value="${escapeHtml(d.symptomOnsetAt)}"></div>
      <div class="field full"><label for="f-prev">Previous visit reference</label><input id="f-prev" value="${escapeHtml(d.previousVisitRef)}"></div>
    </div>`;
  return `<h3>Step 3 — Consent & review</h3><div id="review"></div>
    <div class="field full" style="margin-top:10px"><label for="docs">Supporting documents (PDF/JPG/PNG, max 3)</label><input id="docs" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp"></div>
    <label class="small" style="display:block;margin-top:10px"><input type="checkbox" id="f-consent"> I consent to processing of this information for care and queue management. *</label>
    <label class="small" style="display:block"><input type="checkbox" id="f-acc"> I confirm the information is accurate to the best of my knowledge. *</label>`;
}

function wireStep(step, body, d) {
  if (step === 1) {
    body.querySelector('#f-dob').addEventListener('change', (e) => {
      const hint = body.querySelector('#age-hint');
      hint.textContent = e.target.value ? `Age ${calcAge(e.target.value)}` : '';
    });
  }
}

function collectStep(step, body, d) {
  const g = (id) => body.querySelector(id)?.value ?? '';
  if (step === 1) Object.assign(d, { fullName: g('#f-fullName'), dateOfBirth: g('#f-dob'), gender: g('#f-gender'), bloodGroup: g('#f-blood'), phone: g('#f-phone'), email: g('#f-email'), address: g('#f-addr'), preferredLanguage: g('#f-lang'), emergencyContactName: g('#f-ec-name'), emergencyContactRelationship: g('#f-ec-rel'), emergencyContactPhone: g('#f-ec-phone') });
  if (step === 2) Object.assign(d, { arrivalMethod: g('#f-arrival'), visitType: g('#f-vtype'), chiefComplaint: g('#f-cc'), departmentPreference: g('#f-dept'), symptomOnsetAt: g('#f-onset'), previousVisitRef: g('#f-prev') });
}

function validateStep(step, d) {
  if (step === 1) {
    if (!d.fullName.trim()) return 'Full name is required.';
    if (!d.dateOfBirth) return 'Date of birth is required.';
    if (new Date(d.dateOfBirth) > new Date()) return 'Date of birth cannot be in the future.';
    if (!/^[+()\-.\s\d]{6,25}$/.test(d.phone)) return 'Enter a valid phone number.';
    if (d.email && !/.+@.+\..+/.test(d.email)) return 'Enter a valid email address.';
    if (!d.emergencyContactName.trim()) return 'Emergency contact name is required.';
    if (!/^[+()\-.\s\d]{6,25}$/.test(d.emergencyContactPhone)) return 'Enter a valid emergency contact phone.';
  }
  if (step === 2 && !d.chiefComplaint.trim()) return 'Chief complaint is required.';
  return null;
}

function renderReview(body, d, gotoStep) {
  body.querySelector('#review').innerHTML = `
    <div class="table-wrap"><table><tbody>
    <tr><th>Patient</th><td>${escapeHtml(d.fullName)} · Age ${calcAge(d.dateOfBirth) ?? '—'} · ${escapeHtml(d.phone)}</td><td><button type="button" class="btn btn-sm btn-outline" data-goto="1">Edit</button></td></tr>
    <tr><th>Complaint</th><td>${escapeHtml(d.chiefComplaint)} (${escapeHtml(d.visitType)}, ${escapeHtml(d.arrivalMethod)})</td><td><button type="button" class="btn btn-sm btn-outline" data-goto="2">Edit</button></td></tr>
    </tbody></table></div>
    <p class="small muted">Submitting places this visit in the triage queue. A nurse or doctor must review the suggested priority before it takes effect.</p>`;
  body.querySelectorAll('[data-goto]').forEach((b) => { b.onclick = () => gotoStep(Number(b.dataset.goto)); });
}
