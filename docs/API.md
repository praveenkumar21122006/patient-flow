# PatientFlow API (`/api/v1`)

Envelope: `{ success: true|false, message, data, meta? }`. Auth: HttpOnly cookie
`pf_token` (or `Authorization: Bearer`). Roles: `patient receptionist nurse doctor admin`.

## Auth — `/auth`

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/auth/register` | public | Patient self-registration. Validates email + strong password. |
| POST | `/auth/login` | public (rate-limited 20/15min) | Generic 401 message either way. Sets cookie. |
| POST | `/auth/logout` | any | Clears cookie. |
| GET | `/auth/me` | auth | User + role profile. |
| POST | `/auth/forgot-password` | public | Always identical response; dev returns one-time token. |
| POST | `/auth/reset-password` | public | `{ token, password }`, single-use, 1h expiry. |

## Users — `/users`, `/admin/users`

Admin only, except the clinician picker. `GET /users?role=&search=&page=&limit=`, `POST /users` (staff create),
`PATCH /users/:id/active`, `PATCH /users/:id/role`.
- `GET /users/clinicians` (receptionist/nurse/doctor/admin) — active doctors + nurses for assignment (name/role only).

## Patients — `/patients`

- `GET /patients?search=&page=&limit=` — staff search by name/ID/phone/email; patients get own record only.
- `POST /patients` — receptionist/admin/nurse register (incl. guest flag).
- `GET /patients/:id`, `PATCH /patients/:id` — owner or privileged staff.

## Intakes — `/intakes`

- `POST /intakes` — create draft (patient → own; staff → `patient` id required).
- `GET /intakes?status=&search=&page=&limit=&sort=` — role-scoped; reception gets non-clinical projection.
- `GET /intakes/:id` — full detail with symptoms/history/departments/timeline.
- `PUT /intakes/:id` — update draft; staff may set department/status.
- `POST /intakes/:id/symptoms` — `{ symptoms[], painLevel 0–10, severity, redFlags[], … }`.
- `POST /intakes/:id/medical-history` — conditions, allergies, meds, pregnancy, screenings.
- `POST /intakes/:id/submit` — requires `{ dataProcessing: true, accuracyConfirmed: true }`; creates queue entry + staff notifications.
- `POST /intakes/:id/documents` — multipart `documents` (≤3, PDF/JPG/PNG/WebP, size-capped).

## Vitals — `/vitals`

- `GET /vitals?intake=` — full history, newest last (preserved, never overwritten). Staff see all; patients see own only.
- `POST /vitals` (nurse/doctor/admin) — validated ranges; computes BMI + informational abnormal flags; moves `awaiting-triage` → `triage-in-progress`.

## Triage — `/triage`

- `POST /triage/assess` (nurse/doctor/admin) — `{ intake, triageNotes? }` → `{ suggestedPriority, score, matchedRules, riskIndicators, explanation, ruleVersion }`. Sets intake to `awaiting-clinical-review`; critical suggestions notify doctors/nurses/admins.
- `POST /triage/:id/confirm` (nurse/doctor/admin) — `{ confirmedPriority, overrideReason?, triageNotes? }`. Reason **mandatory** when final ≠ suggestion. Logs `triage.confirm` / `triage.override`.
- `GET /triage?intake=&status=` — staff see all; patients see own intakes only.

## Queue — `/queue` (auth; patient sees redacted names)

- `GET /queue/stream` — server-sent events (`text/event-stream`); emits `{ version, reason, at }` on every queue mutation. Same cookie auth; auto-reconnects.
- `GET /queue?status=&priority=&department=&search=&page=&limit=&strategy=` — server-sorted (confirmed priority → escalation → arrival). Adds `position`, `waitingMinutes`, `estimatedWaitMinutes`.
- `POST /queue/:intakeId/escalate` (nurse/doctor/admin) — sets escalated, notifies doctors/admins, audits.
- `POST /queue/:intakeId/assign` — `{ clinicianId?, departmentId? }`, notifies assignee.

## Clinical reviews — `/clinical-reviews` (nurse/doctor/admin)

- `GET /clinical-reviews?intake=` · `POST /clinical-reviews` — `{ intake, reviewNotes*, summary?, newStatus?, acknowledgedEmergency? }`. Notes are documentation, never diagnosis. Status changes notify the patient and bump live queue clients.

## Appointments — `/appointments` (auth; patients see/book own only)

- `GET /appointments?status=&department=&patient=&upcoming=&from=&to=&page=&limit=` — upcoming/past filters, role-scoped.
- `POST /appointments` — `{ patient? (staff only), department*, clinician?, scheduledAt* (future), durationMinutes?, reason*, notes? }`. Overlapping active bookings for the same patient → 409. Books notify patient + clinician.
- `PATCH /appointments/:id` — reschedule / status (`scheduled → checked-in → in-consultation → completed`, plus `cancelled`/`no-show`) / notes. Illegal transitions → 409. Patients may only cancel their own.

## Departments — `/departments`

- `GET /departments?active=true` (auth) · `POST /departments`, `PATCH /departments/:id` (admin).

## Notifications — `/notifications` (auth, own only)

`GET /notifications?unread=&page=` (includes `meta.unreadCount`), `POST /notifications/:id/read`, `POST /notifications/read-all`.

## Reports — `/reports`

- `GET /reports/intake/:id` — full summary + disclaimer (used for print/PDF view). Patients see own only; reception gets a non-clinical projection.
- `GET /reports/intake/:id/pdf` — server-generated PDF with the same content + safety notice (same access rules).
- `GET /reports/daily?date=` (staff) · `/priority-distribution` · `/department-workload` · `/waiting-times` (nurse/doctor/admin) · `/reports/audit?action=&entityType=&from=&to=` (admin).
- `GET /reports/export/:type` (`daily|queue`, staff) — CSV download.
- `GET /reports/export-audit?action=&entityType=&from=&to=` (admin) — audit CSV export (max 2000 rows).

## Analytics — `/analytics/overview` (staff)

Cards (visits, today, staff, awaiting, critical, urgent, assigned, awaiting-review,
completed, escalated, avg wait, avg triage duration, red-flag cases),
priority distribution, weekly trend, peak hours, department workload, recent audits/reviews.

## Admin — `/admin` (admin)

`GET /admin/rules`, `POST /admin/rules/sync`, `PATCH /admin/rules/:ruleId` (points/active),
`GET /admin/audit-logs`, `PATCH /admin/settings` (upload MIME + retention days + default queue strategy),
`GET /admin/notification-templates`, `PATCH /admin/notification-templates/:type`
(allow-listed `{{visitId}} {{token}} {{status}} {{priority}}` variables only; wired into
consultation/queue notifications via `notifyFromTemplate`).

## Audit logs — `/audit-logs` (admin, read-only)

`GET /audit-logs?action=&entityType=&page=`. Entries immutable (no update/delete routes).

## Statuses & priorities

Visit statuses: `draft submitted awaiting-triage triage-in-progress awaiting-clinical-review
escalated assigned in-consultation observation completed cancelled`.
Priorities: `critical urgent moderate low unclassified`.
