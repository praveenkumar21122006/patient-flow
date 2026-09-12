# Testing

> Software testing validates behaviour. It does **not** constitute clinical validation of
> triage thresholds — that requires qualified governance review (see `TRIAGE_LOGIC.md`).

## Automated suite (Jest + Supertest + mongodb-memory-server)

```bash
npm test
```

Isolated in-memory MongoDB per run; no external services needed.

| File | Coverage |
|---|---|
| `tests/auth.test.js` | register → me, generic 401 on bad/missing account, patient blocked from admin routes, weak-password 422 |
| `tests/intake.test.js` | draft → symptoms → history → submit happy path; consent-required and pain-range rejections; submit without symptoms succeeds and queues |
| `tests/triage.test.js` | engine boundaries (critical composite, low/empty, SpO2 93-vs-89 monotonicity); API override-without-reason 422, override audit path |
| `tests/queue.test.js` | clinical-first ordering (escalation > priority > arrival), arrival-only strategy |
| `tests/reports.test.js` | patient denied admin audit report, admin allowed; 404 envelope has no stack; vitals RBAC + range validation; `.exe` upload rejected |
| `tests/rbac.test.js` | cross-patient isolation (mutate/report forbidden, own allowed); scoped vitals/triage reads; draft future-DOB/phone 422; clinician-picker staff-only; templates admin-only + variable allow-list; queue assign role validation |
| `tests/appointments.test.js` | booking CRUD, patient isolation + cancel-only rule, future-date/department validation, overlap 409, illegal transition 409, staff filters |
| `tests/live.test.js` | SSE stream headers/auth/live-update event, PDF 200 + `%PDF` + isolation, audit CSV export + date filters + admin gating |

## Manual frontend checklist

### Desktop (Chrome/Edge/Firefox, ≥1280px)
- [ ] Public pages render; emergency notice visible on Home/Features/How/Safety/FAQ/Login/Register.
- [ ] Register → auto-login → dashboard; login with each demo role lands on the correct dashboard.
- [ ] New intake wizard: 3 steps, progress bar, back navigation, draft survives reload, review screen accurate; staff must pick a registered patient first; review Edit buttons jump to sections; consent checkboxes enforced.
- [ ] Validation: future DOB blocked, bad phone blocked, consent required (frontend + backend draft validators); pain range and symptom rules enforced by the symptoms API.
- [ ] Nurse: record vitals → history table grows (no overwrite), BMI appears, flags shown as info.
- [ ] Nurse: run assessment → suggestion card shows rules/version/explanation; confirm works; override without reason blocked, with reason logged.
- [ ] Queue: token/priority/status visible; filters/search/pagination work; auto-refresh noted; escalation highlights row + notifies; admin strategy selector; export hidden for patients; intake detail Assign + Print token work.
- [ ] Doctor: escalated case visible; emergency acknowledge + notes + status change persist; patient notified of status changes.
- [ ] Admin: staff activate/deactivate (not self) + role update, department add/edit, rule enable/disable + points + sync, notification templates edit (bad variable rejected), audit list, upload/retention/strategy settings save.
- [ ] Reports: intake JSON opens (patient own-only); daily/priority/workload/waiting-time render; CSVs download (staff only).
- [ ] Notifications bell count, panel, mark-read; session banner logic; theme toggle persists; logout clears session.
- [ ] Loading skeletons, empty states (“Queue is empty”), error + retry states all reachable.
- [ ] Print intake summary is clean (nav/actions hidden).

### Tablet (~768px) & mobile (320–480px)
- [ ] Sidebar collapses to hamburger; tables scroll horizontally; forms single-column; no horizontal page scroll.
- [ ] Touch targets ≥ 40px; focus states visible; modals fit viewport.

### Accessibility
- [ ] Keyboard-only: full intake + triage confirm completable; focus trapped in modal, restored on close; skip links work.
- [ ] Labels on all inputs; `aria-invalid` + error text on failures; `aria-live` toasts.
- [ ] Priorities use text + icon + colour (never colour alone); contrast checked in both themes.
- [ ] 401 expiry redirects to login with notice; no sensitive data in console/storage.

### Failure drills
- [ ] Stop MongoDB → server prints clear hint and exits 1 (no stack to client).
- [ ] Submit without symptoms → 422 with helpful message; upload `.exe` → 400; double-confirm → 409.
