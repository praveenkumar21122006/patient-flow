const request = require('supertest');
const jwt = require('jsonwebtoken');
const { startDb, stopDb, clearDb, app } = require('./setup');
const User = require('../models/User');

beforeAll(startDb, 60000);
afterAll(stopDb);
beforeEach(clearDb);

function cookieFor(user) {
  const token = jwt.sign({ sub: String(user._id), role: user.role }, process.env.JWT_SECRET || 'test-secret-min-32-chars-long-abcdef');
  return [`pf_token=${token}`];
}

async function registerPatient(agent, name, email) {
  const reg = await agent.post('/api/v1/auth/register').send({ fullName: name, email, password: 'Secret123' });
  return reg.headers['set-cookie'];
}

async function makeStaff(role, email) {
  const u = new User({ email, role, fullName: `${role} t` });
  await u.setPassword('Secret123');
  await u.save();
  return u;
}

async function patientDraft(agent, cookie, complaint = 'Test complaint') {
  const draft = await agent.post('/api/v1/intakes').set('Cookie', cookie).send({
    fullName: 'Owner Patient', dateOfBirth: '1990-01-01', gender: 'female', phone: '+15550001111',
    email: 'owner@example.com', emergencyContactName: 'EC', emergencyContactPhone: '+15550002222',
    chiefComplaint: complaint,
  });
  return draft.body.data._id;
}

describe('cross-patient isolation and new endpoints', () => {
  test('patient cannot mutate or review another patient intake/report', async () => {
    const agent = request(app());
    const cookieA = await registerPatient(agent, 'Owner Patient', 'owner@example.com');
    const cookieB = await registerPatient(agent, 'Other Patient', 'other@example.com');
    const id = await patientDraft(agent, cookieA);
    const forbidden = await agent.post(`/api/v1/intakes/${id}/symptoms`).set('Cookie', cookieB).send({ symptoms: ['Cough'], painLevel: 2 });
    expect(forbidden.status).toBe(403);
    const report = await agent.get(`/api/v1/reports/intake/${id}`).set('Cookie', cookieB);
    expect(report.status).toBe(403);
    const own = await agent.get(`/api/v1/reports/intake/${id}`).set('Cookie', cookieA);
    expect(own.status).toBe(200);
    expect(own.body.data.disclaimer).toMatch(/clinical review/i);
  });

  test('patient can read own vitals/triage endpoints (scoped)', async () => {
    const agent = request(app());
    const cookie = await registerPatient(agent, 'Scope Patient', 'scope@example.com');
    const v = await agent.get('/api/v1/vitals').set('Cookie', cookie);
    expect(v.status).toBe(200);
    const t = await agent.get('/api/v1/triage').set('Cookie', cookie);
    expect(t.status).toBe(200);
  });

  test('draft validation rejects future DOB and bad phone', async () => {
    const agent = request(app());
    const cookie = await registerPatient(agent, 'Valid Patient', 'valid@example.com');
    const future = await agent.post('/api/v1/intakes').set('Cookie', cookie).send({ dateOfBirth: '2999-01-01' });
    expect(future.status).toBe(422);
    const badPhone = await agent.post('/api/v1/intakes').set('Cookie', cookie).send({ phone: 'not-a-phone' });
    expect(badPhone.status).toBe(422);
  });

  test('clinician picker is staff-only; templates are admin-only with variable allow-list', async () => {
    const agent = request(app());
    const nurse = await makeStaff('nurse', 'nurse-t@example.com');
    const admin = await makeStaff('admin', 'admin-t@example.com');
    const pCookie = await registerPatient(agent, 'Tpl Patient', 'tpl@example.com');

    const denied = await agent.get('/api/v1/users/clinicians').set('Cookie', pCookie);
    expect(denied.status).toBe(403);
    const allowed = await agent.get('/api/v1/users/clinicians').set('Cookie', cookieFor(nurse));
    expect(allowed.status).toBe(200);

    const tplDenied = await agent.get('/api/v1/admin/notification-templates').set('Cookie', cookieFor(nurse));
    expect(tplDenied.status).toBe(403);
    const tplList = await agent.get('/api/v1/admin/notification-templates').set('Cookie', cookieFor(admin));
    expect(tplList.status).toBe(200);
    expect(tplList.body.data.length).toBeGreaterThan(5);

    const badVar = await agent.patch('/api/v1/admin/notification-templates/escalation').set('Cookie', cookieFor(admin)).send({ subject: 'Hi', body: 'Leak {{diagnosis}}' });
    expect(badVar.status).toBe(422);
    const good = await agent.patch('/api/v1/admin/notification-templates/escalation').set('Cookie', cookieFor(admin)).send({ subject: 'Escalation {{token}}', body: 'Token {{token}} visit {{visitId}} needs review.' });
    expect(good.status).toBe(200);
  });

  test('queue assignment validates clinician role', async () => {
    const agent = request(app());
    const nurse = await makeStaff('nurse', 'nurse-q@example.com');
    const pCookie = await registerPatient(agent, 'Q Patient', 'qp@example.com');
    const id = await patientDraft(agent, pCookie);
    await agent.post(`/api/v1/intakes/${id}/symptoms`).set('Cookie', pCookie).send({ symptoms: ['Cough'], painLevel: 2 });
    await agent.post(`/api/v1/intakes/${id}/medical-history`).set('Cookie', pCookie).send({});
    await agent.post(`/api/v1/intakes/${id}/submit`).set('Cookie', pCookie).send({ dataProcessing: true, accuracyConfirmed: true });
    const victim = await User.findOne({ email: 'qp@example.com' });
    const badAssign = await agent.post(`/api/v1/queue/${id}/assign`).set('Cookie', cookieFor(nurse)).send({ clinicianId: String(victim._id) });
    expect(badAssign.status).toBe(422);
  });
});
