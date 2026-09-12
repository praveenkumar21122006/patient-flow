# MongoDB Atlas connection string — PatientFlow deployment

## Your connection string (fill in YOUR values from Atlas, step 1–4 below)

```text
mongodb+srv://YOUR_DB_USERNAME:YOUR_DB_PASSWORD@YOUR_CLUSTER_HOST/patientflow?retryWrites=true&w=majority
```

Example of what a finished one looks like (values will differ for you):

```text
mongodb+srv://patientflow_app:S3curePass123@cluster0.ab12c.mongodb.net/patientflow?retryWrites=true&w=majority
```

Paste the finished string as the `MONGODB_URI` environment variable on Render
(or Railway). Keep `/patientflow` in the path — that selects the database.

## Get your values from Atlas (5 minutes, free)

1. Sign in at https://cloud.mongodb.com and create a free **M0** cluster
   (any cloud region close to you). Wait until status is green.
2. Left menu → **Database Access** → Add New Database User:
   - username, e.g. `patientflow_app`
   - strong password (save it now — Atlas shows it only once)
   - role: **Read and write to any database** (or Atlas admin)
3. Left menu → **Network Access** → Add IP Address → **Allow Access from
   Anywhere** (`0.0.0.0/0`) → Confirm. (Required: Render uses dynamic IPs.)
4. Clusters → your cluster → **Connect** → **Drivers** → Node.js:
   copy the `mongodb+srv://...` string, replace `<username>` and `<password>`
   with the values from step 2, and make sure the path says `/patientflow`.

## Password rules

If your password contains `@ : / ? # [ ]` it MUST be URL-encoded, e.g.
`@` → `%40`, `:` → `%3A`, `/` → `%2F`. Simplest: use only letters, numbers,
and `-` or `_` in the Atlas password.

## Render settings checklist

- `MONGODB_URI` = finished string above
- `CLIENT_URL` = exactly your Render URL, e.g. `https://patientflow-xxxx.onrender.com`
- `NODE_ENV` = `production`, `COOKIE_SECURE` = `true`
- After first deploy: open the **Shell** tab and run `npm run seed`
  (creates demo accounts; without it, no logins exist).
- First visit can take ~60s (free-tier cold start). This is normal.

## Verify it worked

- `https://YOUR-APP.onrender.com/api/v1/health` → `{"success":true,...}`
- Log in with `admin@demo.local` / `Admin123!` (only after `npm run seed`).

## Never commit this file with real values

This template contains placeholders only. Real credentials live in the
host dashboard (Render → Environment), never in git.
