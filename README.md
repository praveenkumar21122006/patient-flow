# PatientFlow – Patient Intake & Triage Assistant

> No credit card? Render sometimes asks new accounts for card verification — use the
> **Koyeb** button or the backups in `docs/DEPLOY.md` instead (Koyeb + Atlas M0 are free with no card).

Workflow support for hospital front doors: structured intake, vital-sign history, transparent
rule-based **suggested** triage priority, priority queue, notifications, reports, and audit.

> **Safety first.** PatientFlow provides workflow support and a *Suggested Priority – Requires
> Clinical Review*. It **never** diagnoses diseases, prescribes medication, or replaces a qualified
> healthcare professional. Demo thresholds are illustrative and require validation by clinical
> governance before any real-world use. In an emergency, contact local emergency services
> immediately — do not wait for an online assessment.

## Problem statement

Emergency and outpatient front desks juggle paper forms, verbal handovers, and opaque urgency
calls. That causes lost information, inconsistent prioritization, and unanswerable questions
(“why was this patient seen first?”). PatientFlow replaces that with a structured, auditable
pipeline: intake → vitals → transparent suggestion → clinician confirmation → ordered queue.

## Objectives

- Collect complete, validated intake data once and reuse it downstream.
- Make every triage suggestion explainable (rules, score, version, indicators).
- Keep a human in the loop: confirmation mandatory, overrides reasoned and logged.
- Run a fair, visible queue ordered by confirmed priority, escalation, then arrival.
- Audit sensitive actions immutably and export authorized reports.

## Features

- Role-based auth (patient, receptionist, nurse, doctor, admin) with JWT HttpOnly cookies.
- 3-step intake wizard with draft preservation, document upload. Symptoms and red-flag screening are recorded by clinical staff during triage.
- Vital-sign history (never overwritten), BMI auto-calc, informational abnormal flags.
- Transparent triage engine (`server/services/triageEngine.js`, version `v1.0-demo`).
- Queue with live SSE updates (polling fallback), tokens, wait estimates, filters, escalation, assignment.
- Appointments: book, reschedule, check in, complete, cancel, no-show — with overlap protection.
- In-app notifications + admin-managed templates + Nodemailer abstraction with safe dev fallback (no PHI by email).
- Printable intake summaries (print/PDF via browser) plus server-generated PDF, daily/priority/workload/waiting-time/audit reports, CSV exports incl. audit.
- Admin: staff, departments, rule catalogue, notification templates, audit trail, upload/retention/queue-strategy settings.
- Light/dark theme, responsive (320px+), keyboard-accessible, text+icon priorities.

## Technology stack

Frontend: HTML5, CSS3, vanilla JS (ES6 modules), Chart.js, Lucide icons.
Backend: Node.js, Express.js, REST (`/api/v1`), JWT, bcryptjs, Multer, Nodemailer-ready service.
Database: MongoDB + Mongoose. Env via dotenv. Validation via express-validator.
Hardening: Helmet, CORS, rate limiting (global + strict login), express-mongo-sanitize.
Tests: Jest + Supertest (+ mongodb-memory-server for isolation).

## Architecture

```
browser (vanilla JS modules)
   │  fetch JSON + HttpOnly cookie session
   ▼
Express app (server/app.js)
   ├─ middleware: auth (JWT), roles, validation, audit, upload, errors
   ├─ routes /api/v1/* → controllers → models + services
   │     services: triageEngine, queueService, queueEvents, notifyService, notificationService, notificationTemplates, reportService, pdfService
   └─ static client/ served from the same process (single deployment)
MongoDB (Mongoose models, 16 collections)
```

Consistent envelope: `{ success, message, data, meta? }` with correct HTTP codes.

## Folder structure

```
patientflow/
├── client/
│   ├── index.html  app.html
│   ├── assets/logo.svg
│   ├── css/main.css
│   ├── js/{api,auth,components,utils,pages}  js/{app,site}.js
│   └── pages/*.html (public + auth pages)
├── server/
│   ├── app.js  server.js
│   ├── config/{db,env}.js
│   ├── controllers/  middleware/  models/  routes/
│   ├── services/{triageEngine,queueService,notifyService,notificationService,reportService}.js
│   ├── validators/  utils/  seeds/seed.js  tests/
├── docs/  uploads/  .env.example  package.json  README.md
```

## Installation

Prerequisites: Node.js 18+, MongoDB 6+ (local or Atlas), VS Code.

```bash
cd patientflow
cp .env.example .env        # Windows: copy .env.example .env
# edit .env: MONGODB_URI, JWT_SECRET (32+ random chars)
npm install
npm run seed                # loads departments, demo users, fictional queue cases
npm run dev                 # API + frontend on http://localhost:5000
```

Open `http://localhost:5000`. The same process serves API (`/api/v1/*`) and frontend.

## Environment variables

See `.env.example`. Required: `PORT`, `NODE_ENV`, `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`,
`JWT_COOKIE_NAME`, `CLIENT_URL`. Optional SMTP (`SMTP_HOST/PORT/USER/PASS/FROM`) —
when unset, email uses a redacted dev log. `UPLOAD_MAX_MB`, `UPLOAD_RETENTION_DAYS`,
`HOSPITAL_NAME`.

## MongoDB setup

- Local: install MongoDB Community, `mongod`, keep default `mongodb://127.0.0.1:27017/patientflow`.
- Atlas: create cluster, allow your IP, paste connection string into `MONGODB_URI`.
- The server refuses to start without a DB and prints a clear hint.

## Demo accounts (fictional)

| Role | Email | Password |
|---|---|---|
| Patient | patient@demo.local | Patient123! |
| Receptionist | reception@demo.local | Reception123! |
| Nurse | nurse@demo.local | Nurse123! |
| Doctor | doctor@demo.local | Doctor123! |
| Admin | admin@demo.local | Admin123! |

## Development commands

```bash
npm install   # install backend + test deps
npm run dev   # start with nodemon
npm start     # production start
npm run seed  # reseed fictional demo data
npm test      # Jest + Supertest suite
```

## API overview

Versioned under `/api/v1`: `/auth`, `/users`, `/patients`, `/intakes`, `/vitals`,
`/triage`, `/queue`, `/clinical-reviews`, `/departments`, `/notifications`,
`/reports`, `/analytics`, `/admin`, `/audit-logs`. See `docs/API.md`.
List endpoints support `page/limit/search/sort/filters` and role-based projections.

## Testing

```bash
npm test
```

Covers auth, RBAC, cross-patient isolation, intake validation, vitals, triage boundaries +
override rule, queue ordering, protected reports, upload restrictions, clinician-picker and
template permissions, assignment validation, error envelope. See `docs/TESTING.md`
for the manual frontend checklist. **Testing validates software behaviour, not clinical
safety.**

## Security notes

HttpOnly SameSite cookies (no tokens in localStorage), bcrypt (cost 12), generic login
errors, login rate limiting, Helmet/CORS/sanitization, strict upload allowlist, audit
log for sensitive actions, sanitized error responses. See `docs/SECURITY.md`.

## Medical safety limitations

- Decision support only; mandatory human confirmation; unclassified fallback.
- Demo thresholds (`TRIAGE_LOGIC.md`) are **not** clinically validated or certified.
- No diagnosis/prescription output anywhere; disclaimers in UI, API, and reports.

## Future improvements

- Real-time queue via WebSocket/SSE; SMS/pager escalation hooks.
- Department capacity planning and shift scheduling.
- HL7/FHIR export, e-signature consent, document retention jobs.
- Accessibility audit with screen-reader users; offline intake PWA mode.
