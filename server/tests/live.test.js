const request = require('supertest');
const http = require('http');
const jwt = require('jsonwebtoken');
const { startDb, stopDb, clearDb, app } = require('./setup');
const User = require('../models/User');
const { bumpQueue } = require('../services/queueEvents');

beforeAll(startDb, 60000);
afterAll(stopDb);
beforeEach(clearDb);

const SECRET = process.env.JWT_SECRET || 'test-secret-min-32-chars-long-abcdef';
function cookieFor(user) {
  return [`pf_token=${jwt.sign({ sub: String(user._id), role: user.role }, SECRET)}`];
}

async function makeStaff(role, email) {
  const u = new User({ email, role, fullName: `${role} t` });
  await u.setPassword('Secret123');
  await u.save();
  return u;
}

describe('live queue stream (SSE)', () => {
  test('anonymous stream rejected; authenticated stream emits version + live updates', async () => {
    const anon = await request(app()).get('/api/v1/queue/stream');
    expect(anon.status).toBe(401);

    const nurse = await makeStaff('nurse', 'nurse-s@test.local');
    const server = app().listen(0);
    await new Promise((resolve) => server.on('listening', resolve));
    const port = server.address().port;
    try {
      const events = await new Promise((resolvePromise, rejectPromise) => {
        const seen = [];
        const req = http.get(
          { port, path: '/api/v1/queue/stream', headers: { Cookie: cookieFor(nurse).join('; ') } },
          (res) => {
            try {
              expect(res.headers['content-type']).toMatch(/text\/event-stream/);
            } catch (e) { rejectPromise(e); return; }
            res.on('data', (chunk) => {
              const text = chunk.toString();
              for (const m of text.matchAll(/event: queue\ndata: (\{.*?\})\n\n/g)) {
                try { seen.push(JSON.parse(m[1])); } catch { /* ignore partial */ }
                if (seen.length === 1) setImmediate(() => bumpQueue('smoke-test-event'));
                if (seen.length >= 2) { req.destroy(); resolvePromise(seen); }
              }
            });
            res.on('error', rejectPromise);
          }
        );
        req.on('error', () => { if (seen.length < 2) rejectPromise(new Error('stream closed before 2 events')); });
        setTimeout(() => rejectPromise(new Error(`timed out waiting for stream events (got ${seen.length})`)), 10000);
      });
      expect(events[0].reason).toBe('connected');
      expect(events[1]).toMatchObject({ reason: 'smoke-test-event' });
      expect(events[1].version).toBe(events[0].version + 1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }, 20000);
});

describe('server-side PDF intake summary', () => {
  test('pdf downloads for owner/staff, blocked otherwise', async () => {
    const agent = request(app());
    const reg = await agent.post('/api/v1/auth/register').send({ fullName: 'Pdf Patient', email: 'pdf-p@test.local', password: 'Secret123' });
    const pCookie = reg.headers['set-cookie'];
    const draft = await agent.post('/api/v1/intakes').set('Cookie', pCookie).send({
      fullName: 'Pdf Patient', dateOfBirth: '1990-01-01', gender: 'female', phone: '+15550001111',
      email: 'pdf-p@test.local', emergencyContactName: 'EC', emergencyContactPhone: '+15550002222', chiefComplaint: 'PDF smoke headache',
    });
    const id = draft.body.data._id;
    await agent.post(`/api/v1/intakes/${id}/symptoms`).set('Cookie', pCookie).send({ symptoms: ['Headache'], painLevel: 4 });
    await agent.post(`/api/v1/intakes/${id}/medical-history`).set('Cookie', pCookie).send({});
    await agent.post(`/api/v1/intakes/${id}/submit`).set('Cookie', pCookie).send({ dataProcessing: true, accuracyConfirmed: true });

    const nurse = await makeStaff('nurse', 'nurse-p@test.local');
    const pdf = await agent.get(`/api/v1/reports/intake/${id}/pdf`).set('Cookie', cookieFor(nurse)).buffer(true);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toMatch(/application\/pdf/);
    expect(pdf.headers['content-disposition']).toMatch(/\.pdf/);
    const buf = Buffer.isBuffer(pdf.body) ? pdf.body : Buffer.from(pdf.text || '', 'binary');
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.slice(0, 4).toString()).toBe('%PDF');

    const own = await agent.get(`/api/v1/reports/intake/${id}/pdf`).set('Cookie', pCookie).buffer(true);
    expect(own.status).toBe(200);
    const other = await agent.post('/api/v1/auth/register').send({ fullName: 'Other Pdf', email: 'pdf-other@test.local', password: 'Secret123' });
    const blocked = await agent.get(`/api/v1/reports/intake/${id}/pdf`).set('Cookie', other.headers['set-cookie']).buffer(true);
    expect(blocked.status).toBe(403);
    const anon = await agent.get(`/api/v1/reports/intake/${id}/pdf`).buffer(true);
    expect(anon.status).toBe(401);
  }, 30000);
});

describe('audit export + date filters', () => {
  test('csv export gated to admin; filters narrow rows', async () => {
    const agent = request(app());
    const admin = await makeStaff('admin', 'admin-e@test.local');
    const nurse = await makeStaff('nurse', 'nurse-e@test.local');
    await agent.post('/api/v1/auth/login').set('Cookie', cookieFor(nurse)).send({ email: 'nurse-e@test.local', password: 'Secret123' });

    const denied = await agent.get('/api/v1/reports/export-audit').set('Cookie', cookieFor(nurse));
    expect(denied.status).toBe(403);
    const ok = await agent.get('/api/v1/reports/export-audit').set('Cookie', cookieFor(admin));
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toMatch(/text\/csv/);
    expect(ok.text.split('\n')[0]).toMatch(/action/);
    const empty = await agent.get('/api/v1/reports/export-audit').set('Cookie', cookieFor(admin)).query({ action: 'zzz-no-such-action' });
    expect(empty.status).toBe(200);
    expect(empty.text.trim().split('\n')).toHaveLength(1);
    const ranged = await agent.get('/api/v1/admin/audit-logs').set('Cookie', cookieFor(admin)).query({ from: '2000-01-01', to: '2001-01-01' });
    expect(ranged.status).toBe(200);
    expect(ranged.body.meta.total).toBe(0);
  });
});
