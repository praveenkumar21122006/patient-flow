const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { startDb, stopDb, clearDb, app } = require('./setup');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

beforeAll(startDb, 60000);
afterAll(stopDb);
beforeEach(clearDb);

async function cookieFor(role) {
  const u = new User({ email: `${role}-${Date.now()}@test.local`, role, fullName: `${role} test` });
  await u.setPassword('Secret123');
  await u.save();
  const token = jwt.sign({ sub: String(u._id), role }, process.env.JWT_SECRET || 'test-secret-min-32-chars-long-abcdef');
  return `pf_token=${token}`;
}

describe('reports authorization, uploads, and error handling', () => {
  test('patient cannot access admin audit report; admin can', async () => {
    const agent = request(app());
    const reg = await agent.post('/api/v1/auth/register').send({ fullName: 'Rep Pat', email: 'rep@example.com', password: 'Secret123' });
    const denied = await agent.get('/api/v1/reports/audit').set('Cookie', reg.headers['set-cookie']);
    expect(denied.status).toBe(403);
    const adminCookie = await cookieFor('admin');
    const ok = await agent.get('/api/v1/reports/audit').set('Cookie', [adminCookie]);
    expect(ok.status).toBe(200);
  });

  test('unknown route returns consistent 404 envelope without stack trace', async () => {
    const res = await request(app()).get('/api/v1/nope-not-here');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/at .*node_modules|Error:/);
  });

  test('vitals recording requires nurse role and validates ranges', async () => {
    const agent = request(app());
    const reg = await agent.post('/api/v1/auth/register').send({ fullName: 'V Pat', email: 'vpat@example.com', password: 'Secret123' });
    const pCookie = reg.headers['set-cookie'];
    const draft = await agent.post('/api/v1/intakes').set('Cookie', pCookie).send({
      fullName: 'V Pat', dateOfBirth: '1990-01-01', gender: 'female', phone: '+15550001111',
      email: 'vpat@example.com', emergencyContactName: 'EC', emergencyContactPhone: '+15550002222', chiefComplaint: 'Fever',
    });
    const id = draft.body.data._id;
    const forbidden = await agent.post('/api/v1/vitals').set('Cookie', pCookie).send({ intake: id, oxygenSaturation: 98 });
    expect(forbidden.status).toBe(403);
    const nurseCookie = await cookieFor('nurse');
    const badRange = await agent.post('/api/v1/vitals').set('Cookie', [nurseCookie]).send({ intake: id, oxygenSaturation: 5 });
    expect(badRange.status).toBe(422);
  });

  test('disallowed file upload is rejected', async () => {
    const agent = request(app());
    const reg = await agent.post('/api/v1/auth/register').send({ fullName: 'U Pat', email: 'upat@example.com', password: 'Secret123' });
    const pCookie = reg.headers['set-cookie'];
    const draft = await agent.post('/api/v1/intakes').set('Cookie', pCookie).send({
      fullName: 'U Pat', dateOfBirth: '1990-01-01', gender: 'male', phone: '+15550001111',
      email: 'upat@example.com', emergencyContactName: 'EC', emergencyContactPhone: '+15550002222', chiefComplaint: 'Cough',
    });
    const id = draft.body.data._id;
    const tmp = path.join(__dirname, 'evil.exe');
    fs.writeFileSync(tmp, 'MZ-fake-binary');
    const res = await agent.post(`/api/v1/intakes/${id}/documents`).set('Cookie', pCookie).attach('documents', tmp);
    fs.unlinkSync(tmp);
    expect([400, 500]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });
});
