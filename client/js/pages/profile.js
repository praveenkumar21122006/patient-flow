import { api } from '../api/client.js';
import { toast, escapeHtml, refreshIcons } from '../components/ui.js';

export async function render(view, session) {
  const p = session.profile || {};
  view.innerHTML = `
    <div class="page-head"><div><h2>Profile & privacy</h2><p class="muted">Manage contact details and privacy preferences.</p></div></div>
    <div class="grid-2">
    <div class="card"><h3>Contact details</h3>
      <div class="field"><label for="pf-phone">Phone</label><input id="pf-phone" value="${escapeHtml(p.phone || session.user.phone || '')}"></div>
      <div class="field" style="margin-top:8px"><label for="pf-addr">Address</label><input id="pf-addr" value="${escapeHtml(p.address || '')}"></div>
      <div class="field" style="margin-top:8px"><label for="pf-lang">Preferred language</label><input id="pf-lang" value="${escapeHtml(p.preferredLanguage || 'English')}"></div>
      <button class="btn btn-primary btn-sm" id="pf-save" style="margin-top:10px">Save changes</button></div>
    <div class="card"><h3>Privacy preferences</h3>
      ${['shareForCare', 'allowSms', 'allowEmail'].map((k) => `<label class="small" style="display:block;font-weight:400;margin:6px 0"><input type="checkbox" id="pr-${k}" ${p.privacyPreferences?.[k] !== false ? 'checked' : ''}> ${k}</label>`).join('')}
      <button class="btn btn-outline btn-sm" id="pr-save" style="margin-top:8px">Save preferences</button>
      <hr style="border:none;border-top:1px solid var(--border);margin:14px 0">
      <p class="small muted">Signed in as <strong>${escapeHtml(session.user.email)}</strong> (${escapeHtml(session.user.role)}). Sessions use secure HttpOnly cookies; nothing sensitive is stored in browser storage.</p>
      <a class="btn btn-outline btn-sm" href="/pages/forgot-password.html">Change password</a></div>
    </div>`;
  view.querySelector('#pf-save').onclick = async () => {
    try {
      if (session.user.role !== 'patient') { toast('Staff contact details are managed by an administrator.', 'warn'); return; }
      await api.patch(`/patients/${p._id}`, { phone: view.querySelector('#pf-phone').value, address: view.querySelector('#pf-addr').value, preferredLanguage: view.querySelector('#pf-lang').value });
      toast('Profile updated.', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };
  view.querySelector('#pr-save').onclick = async () => {
    try {
      if (session.user.role !== 'patient') { toast('No patient privacy record for staff accounts.', 'warn'); return; }
      await api.patch(`/patients/${p._id}`, { privacyPreferences: { shareForCare: view.querySelector('#pr-shareForCare').checked, allowSms: view.querySelector('#pr-allowSms').checked, allowEmail: view.querySelector('#pr-allowEmail').checked } });
      toast('Preferences saved.', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };
  refreshIcons();
}
