// Shared formatting, validation, and theme helpers.
export function fmtDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
export function fmtDate(v) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString();
}
export function waitingSince(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
export function calcAge(dob) {
  if (!dob) return null;
  const d = new Date(dob); const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}
export function fieldError(input, message) {
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  const err = input.closest('.field')?.querySelector('.field-error');
  if (err) err.textContent = message || '';
  return !message;
}
export function validPhone(v) { return /^[+()\-.\s\d]{6,25}$/.test(String(v || '')); }
export function initTheme() {
  const saved = localStorage.getItem('pf-theme') || 'light';
  document.documentElement.dataset.theme = saved;
  return saved;
}
export function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('pf-theme', next);
  return next;
}
export const SYMPTOM_OPTIONS = ['Fever', 'Cough', 'Chest pain', 'Breathing difficulty', 'Headache', 'Abdominal pain', 'Nausea / vomiting', 'Diarrhoea', 'Dizziness', 'Sore throat', 'Back pain', 'Injury / wound', 'Rash', 'Fatigue', 'Palpitations', 'Other'];
export const RED_FLAG_OPTIONS = [
  { value: 'chest-pain', label: 'Chest pain or pressure' },
  { value: 'breathing-difficulty', label: 'Difficulty breathing' },
  { value: 'unresponsive', label: 'Unresponsive / fainted' },
  { value: 'severe-bleeding', label: 'Severe bleeding' },
  { value: 'stroke-signs', label: 'Facial droop, slurred speech, weakness on one side' },
  { value: 'severe-allergic-reaction', label: 'Severe allergic reaction (swelling, wheeze)' },
  { value: 'high-fever-with-rash', label: 'High fever with rash' },
  { value: 'suicidal-thoughts', label: 'Thoughts of harming self' },
  { value: 'severe-abdominal-pain', label: 'Severe abdominal pain' },
  { value: 'head-injury', label: 'Recent head injury' },
];
