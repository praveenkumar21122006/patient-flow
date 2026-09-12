# Deploying PatientFlow without a credit card

Render asks some new accounts for card verification. These alternatives host the
same code with free tiers that do not require a card. MongoDB Atlas M0 is also
free with no card — use it as the database in every option below.

## Option A — Koyeb (recommended, no card)

1. Sign up at https://app.koyeb.com with GitHub (free tier, no card).
2. **Create Service → GitHub** → select `Patient-Intake-Triage-Assistant`.
3. Builder: **Dockerfile** (auto-detected). Instance: the free type.
4. Health check: HTTP path `/api/v1/health`.
5. Environment variables:
   - `MONGODB_URI` = your Atlas string (see `docs/MONGODB_ATLAS.md`;
     Atlas Network Access must be `0.0.0.0/0`)
   - `CLIENT_URL` = exactly your service URL, e.g. `https://patientflow-xxxx.koyeb.app`
   - `NODE_ENV` = `production`
   - `JWT_SECRET` = any long random string (generate one, keep it secret)
   - `JWT_EXPIRES_IN` = `8h`, `JWT_COOKIE_NAME` = `pf_token`
   - `COOKIE_SECURE` = `true`
6. Deploy, then open the service URL once (cold start can take ~60s).
7. Seed demo data: Koyeb service → **Console** (one-off command) → run
   `npm run seed`. Without this step, no logins exist.
8. Verify: `https://<your-app>.koyeb.app/api/v1/health` → `{"success":true,...}`,
   then log in with `admin@demo.local` / `Admin123!`.

## Option B — Hugging Face Spaces, Docker SDK (no card)

1. Sign up at https://huggingface.co (free, no card) → New **Space** → SDK: **Docker**.
2. Push this repo's files into the Space repo (or duplicate the setup there).
3. In Space **Settings → Variables**: set `PORT=7860` (Spaces require port 7860)
   plus the same variables as Option A (`MONGODB_URI`, `CLIENT_URL` = the Space URL, …).
4. The Space rebuilds automatically; free Spaces sleep after inactivity and wake on visit.

## Option C — Glitch (no card, simplest, sleepiest)

1. https://glitch.com → New Project → **Import from GitHub** → paste the repo URL.
2. Open the `.env` file in the Glitch editor and add the same variables as Option A.
3. Glitch runs `npm start` automatically. Free projects sleep after ~5 minutes
   idle and wake when visited; disk is small, so prefer Atlas (already the setup).

## Applies to every option

- Database is **never** bundled with hosting: always use Atlas M0 (free, no card).
- Always run `npm run seed` once after the first deploy (demo accounts + demo data).
- Uploaded documents live on ephemeral disk on free tiers and disappear on
  restart — fine for demos, not for real records.
- Triage thresholds are demo-only and uncertified regardless of host.
- If a deploy fails, read the service **Logs** tab first: missing `MONGODB_URI`
  is the #1 cause (`[patientflow] MongoDB connection failed`).
