# Security

## Authentication

- bcrypt password hashing (cost 12); passwords never returned or logged.
- JWT access tokens carried in an **HttpOnly, SameSite=Lax** cookie (`pf_token`); the
  frontend caches only the safe user profile in `sessionStorage` — never tokens, passwords,
  or health data in `localStorage`.
- `GET /auth/me` revalidates the session; 401s redirect to login with an expiry notice.
- Forgot/reset flow uses single-use sha256-hashed tokens with 1h TTL; responses are
  identical whether or not the account exists (no enumeration).
- Account `isActive` flag blocks login and API use; users cannot deactivate themselves.

## Authorization

- `requireAuth` + `requireRoles(...)` on every route group; UI navigation is a convenience
  layer only — the API re-checks everything (e.g. patients can only read their own intake;
  reception gets a non-clinical projection; vitals/triage/admin are staff-gated).
- Generic 401/403 messages; no role leakage beyond what the UI already shows.

## Input & transport hardening

- `express-validator` on auth/intake/vitals/triage paths: future DOB blocked, phone regex,
  pain 0–10, enum guards, consent booleans required.
- `helmet`, restrictive `cors` (env allowlist + credentials), `express-mongo-sanitize`
  against NoSQL injection, 1 MB JSON cap.
- Rate limiting: global 600/15 min on `/api/*`; login 20/15 min with a clear message.

## Uploads

- Multer with disk storage, `UPLOAD_MAX_MB` cap (default 5), max 3 files, allowlist
  (PDF/JPEG/PNG/WebP) configurable by admins; violations return 400 without stack traces.

## Audit & errors

- `writeAudit` fire-and-forget logger on register/login/intake submit/vitals/triage
  confirm+override/escalation/admin changes; `AuditLog` has no update/delete API and a
  schema hook blocks modification.
- Central `notFound` + `errorHandler`: consistent `{ success:false, message }` envelope,
  500s sanitized (“An unexpected error occurred”), server logs carry method/path/status
  only — never credentials, secrets, or PHI.

## Notifications & email

- `notificationService` sends identifiers + generic status only (never records). Without
  SMTP config it logs a redacted dev preview.

## Deployment checklist

- Set a 32+ char `JWT_SECRET`, `COOKIE_SECURE=true` behind HTTPS, narrow `CLIENT_URL`,
  configure SMTP, restrict MongoDB network access, rotate secrets, back up the database,
  and set `UPLOAD_RETENTION_DAYS` with a janitor job before any pilot.
