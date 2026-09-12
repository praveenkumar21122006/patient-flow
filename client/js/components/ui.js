// Reusable UI primitives: toasts, modal, tables, pagination, empty/error states.
export function toast(message, kind = 'info', ms = 4200) {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

export function showLoading(container, rows = 3) {
  container.innerHTML = Array.from({ length: rows }, () => '<div class="skeleton" style="margin-bottom:8px">&nbsp;</div>').join('');
}

export function showEmpty(container, title, hint = '', actionHtml = '') {
  container.innerHTML = `<div class="empty"><strong>${escapeHtml(title)}</strong>${hint ? `<p class="small muted">${escapeHtml(hint)}</p>` : ''}${actionHtml}</div>`;
}

export function showError(container, message, retryFn) {
  container.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'alert alert-danger';
  div.innerHTML = `<strong>Something went wrong.</strong> ${escapeHtml(message || '')}`;
  if (retryFn) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-outline'; btn.style.marginTop = '8px'; btn.textContent = 'Retry';
    btn.onclick = retryFn; div.appendChild(document.createElement('br')); div.appendChild(btn);
  }
  container.appendChild(div);
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function priorityBadge(priority) {
  const p = (priority || 'unclassified').toLowerCase();
  const labels = { critical: 'Critical', urgent: 'Urgent', moderate: 'Moderate', low: 'Low Priority', unclassified: 'Unclassified' };
  const icons = { critical: 'siren', urgent: 'alert-triangle', moderate: 'clock', low: 'check-circle', unclassified: 'help-circle' };
  return `<span class="badge b-${p}"><span class="dot" aria-hidden="true"></span><i data-lucide="${icons[p] || 'help-circle'}" width="13" height="13" aria-hidden="true"></i>${labels[p] || 'Unclassified'}</span>`;
}

export function statusLabel(s) {
  return escapeHtml(String(s || '').split('-').map((w) => w[0]?.toUpperCase() + w.slice(1)).join(' '));
}

// Accessible modal with focus trap + return focus.
let lastFocus = null;
export function openModal(title, bodyHtml, { actions = [] } = {}) {
  lastFocus = document.activeElement;
  let back = document.querySelector('.modal-back');
  if (!back) {
    back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"></div>';
    document.body.appendChild(back);
  }
  const modal = back.querySelector('.modal');
  modal.innerHTML = `<h3 id="modal-title" style="margin-top:0">${escapeHtml(title)}</h3><div class="modal-body"></div><div class="modal-actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px"></div>`;
  modal.querySelector('.modal-body').innerHTML = bodyHtml;
  const bar = modal.querySelector('.modal-actions');
  actions.forEach((a) => {
    const b = document.createElement('button');
    b.className = `btn ${a.primary ? 'btn-primary' : 'btn-outline'}`;
    b.textContent = a.label;
    b.onclick = () => { a.onClick && a.onClick(); if (!a.keepOpen) closeModal(); };
    bar.appendChild(b);
  });
  const cancel = document.createElement('button');
  cancel.className = 'btn btn-outline'; cancel.textContent = 'Close';
  cancel.onclick = closeModal; bar.appendChild(cancel);
  back.classList.add('open');
  back.onclick = (e) => { if (e.target === back) closeModal(); };
  document.addEventListener('keydown', escClose);
  modal.querySelector('button, input, select, textarea')?.focus();
}
function escClose(e) { if (e.key === 'Escape') closeModal(); }
export function closeModal() {
  document.querySelector('.modal-back')?.classList.remove('open');
  document.removeEventListener('keydown', escClose);
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

export function renderPagination(container, meta, onPage) {
  if (!meta || meta.pages <= 1) { container.innerHTML = ''; return; }
  container.innerHTML = '';
  const info = document.createElement('span');
  info.className = 'small muted';
  info.textContent = `Page ${meta.page} of ${meta.pages} · ${meta.total} records`;
  const prev = document.createElement('button'); prev.className = 'btn btn-sm btn-outline'; prev.textContent = '← Prev'; prev.disabled = meta.page <= 1;
  const next = document.createElement('button'); next.className = 'btn btn-sm btn-outline'; next.textContent = 'Next →'; next.disabled = meta.page >= meta.pages;
  prev.onclick = () => onPage(meta.page - 1);
  next.onclick = () => onPage(meta.page + 1);
  container.style.cssText = 'display:flex;gap:10px;align-items:center;margin-top:12px';
  container.append(prev, info, next);
}

export function refreshIcons() {
  if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
}
