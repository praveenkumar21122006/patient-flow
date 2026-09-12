import { api } from '../api/client.js';
import { toast, showLoading, showEmpty, escapeHtml, openModal, refreshIcons } from '../components/ui.js';

export async function render(view, session, params) {
  view.innerHTML = `
    <div class="page-head"><div><h2>Patients</h2><p class="muted">Search by name, patient ID, phone, or email.</p></div>
    <div class="page-actions"><button class="btn btn-primary btn-sm" id="new-btn">Register patient</button></div></div>
    <div class="card"><div style="display:flex;gap:8px;margin-bottom:12px"><input id="s" type="search" placeholder="Search…" value="${escapeHtml(params.get('search') || '')}" style="flex:1" aria-label="Search patients"><button class="btn btn-outline btn-sm" id="go">Search</button></div>
    <div id="list"></div></div>`;
  const list = view.querySelector('#list');
  async function load() {
    showLoading(list, 4);
    try {
      const res = await api.get('/patients', { query: { search: view.querySelector('#s').value, limit: 15 } });
      if (!res.data.length) { showEmpty(list, 'No patients found', 'Try a different search or register a new patient.'); return; }
      list.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Patient ID</th><th>Name</th><th>Phone</th><th>Email</th><th></th></tr></thead><tbody>
        ${res.data.map((p) => `<tr><td><strong>${escapeHtml(p.patientId)}</strong></td><td>${escapeHtml(p.fullName)}</td><td>${escapeHtml(p.phone || '')}</td><td class="small">${escapeHtml(p.email || '')}</td><td style="white-space:nowrap"><button class="btn btn-sm btn-outline" data-edit='${escapeHtml(JSON.stringify(p._id))}'>Edit</button> <button class="btn btn-sm btn-outline" data-intake="${p._id}">New intake</button></td></tr>`).join('')}
        </tbody></table></div>`;
      list.querySelectorAll('[data-edit]').forEach((b) => {
        b.onclick = async () => {
          let current = {};
          try { current = (await api.get(`/patients/${JSON.parse(b.dataset.edit)}`)).data || {}; }
          catch (err) { toast(err.message, 'error'); return; }
          openModal('Update demographic & contact details', `
            <div class="form-grid">
            <div class="field"><label for="ep-phone">Phone *</label><input id="ep-phone" value="${escapeHtml(current.phone || '')}"></div>
            <div class="field"><label for="ep-email">Email</label><input id="ep-email" value="${escapeHtml(current.email || '')}"></div>
            <div class="field full"><label for="ep-addr">Address</label><input id="ep-addr" value="${escapeHtml(current.address || '')}"></div>
            <div class="field"><label for="ep-lang">Preferred language</label><input id="ep-lang" value="${escapeHtml(current.preferredLanguage || 'English')}"></div>
            <div class="field"><label for="ep-blood">Blood group</label><select id="ep-blood">${['Unknown', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => `<option ${current.bloodGroup === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
            <div class="field"><label for="ep-ec">Emergency contact</label><input id="ep-ec" value="${escapeHtml(current.emergencyContactName || '')}"></div>
            <div class="field"><label for="ep-ecp">Emergency phone</label><input id="ep-ecp" value="${escapeHtml(current.emergencyContactPhone || '')}"></div>
            </div>`, [{
            label: 'Save changes', primary: true, keepOpen: true, onClick: async () => {
              const g = (id) => document.getElementById(id).value.trim();
              if (!/^[+()\-.\s\d]{6,25}$/.test(g('ep-phone'))) { toast('Enter a valid phone number.', 'error'); return; }
              try {
                await api.patch(`/patients/${current._id}`, { phone: g('ep-phone'), email: g('ep-email') || undefined, address: g('ep-addr'), preferredLanguage: g('ep-lang'), bloodGroup: document.getElementById('ep-blood').value, emergencyContactName: g('ep-ec'), emergencyContactPhone: g('ep-ecp') });
                toast('Patient details updated.', 'success');
                document.querySelector('.modal-back')?.classList.remove('open');
                load();
              } catch (err) { toast(err.message, 'error'); }
            },
          }]);
        };
      });
      list.querySelectorAll('[data-intake]').forEach((b) => {
        b.onclick = async () => {
          try {
            const r = await api.post('/intakes', { patient: b.dataset.intake, chiefComplaint: 'Reception walk-in intake' });
            toast('Intake draft created.', 'success');
            window.location.hash = `#/intakes/${r.data._id}`;
          } catch (err) { toast(err.message, 'error'); }
        };
      });
    } catch (err) { list.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`; }
  }
  view.querySelector('#go').onclick = load;
  view.querySelector('#s').addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });
  view.querySelector('#new-btn').onclick = () => {
    openModal('Register patient', `
      <div class="form-grid">
      <div class="field"><label>Full name *</label><input id="np-name"></div>
      <div class="field"><label>Date of birth *</label><input id="np-dob" type="date"></div>
      <div class="field"><label>Gender</label><select id="np-gender"><option value="female">female</option><option value="male">male</option><option value="other">other</option><option value="prefer-not-to-say">prefer-not-to-say</option></select></div>
      <div class="field"><label>Phone *</label><input id="np-phone"></div>
      <div class="field"><label>Email</label><input id="np-email" type="email"></div>
      <div class="field"><label>Emergency contact *</label><input id="np-ec"></div>
      <div class="field"><label>Emergency phone *</label><input id="np-ecp"></div>
      <div class="field full"><label style="font-weight:400"><input type="checkbox" id="np-guest"> Emergency guest (unidentified arrival — email optional)</label></div>
      </div>`, [{
      label: 'Register', primary: true, keepOpen: true, onClick: async () => {
        const g = (id) => document.getElementById(id).value.trim();
        if (!g('np-name')) { toast('Full name is required.', 'error'); return; }
        if (!document.getElementById('np-dob').value) { toast('Date of birth is required.', 'error'); return; }
        try {
          await api.post('/patients', { fullName: g('np-name'), dateOfBirth: document.getElementById('np-dob').value, gender: document.getElementById('np-gender').value, phone: g('np-phone'), email: g('np-email') || undefined, emergencyContactName: g('np-ec'), emergencyContactPhone: g('np-ecp'), isGuest: document.getElementById('np-guest').checked });
          toast('Patient registered.', 'success'); load();
          document.querySelector('.modal-back')?.classList.remove('open');
        } catch (err) { toast(err.message, 'error'); }
      },
    }]);
  };
  await load();
  refreshIcons();
}
