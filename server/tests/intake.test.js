const request = require('supertest');
const { startDb, stopDb, clearDb, app } = require('./setup');

beforeAll(startDb, 60000);
afterAll(stopDb);
beforeEach(clearDb);

async function patientSession() {
  const agent = request(app());
  const reg = await agent.post('/api/v1/auth/register').send({ fullName: 'Intake Patient', email: 'intake@example.com', password: 'Secret123' });
  return { agent, cookie: reg.headers['set-cookie'] };
}

describe('patient intake workflow', () => {
  test('full draft -> symptoms -> history -> submit flow works', async () => {
    const { agent, cookie } = await patientSession();
    const draft = await agent.post('/api/v1/intakes').set('Cookie', cookie).send({
      fullName: 'Intake Patient', dateOfBirth: '1990-01-01', gender: 'female', phone: '+15550001111',
      email: 'intake@example.com', emergencyContactName: 'EC', emergencyContactPhone: '+15550002222',
      chiefComplaint: 'Persistent headache and fever',
    });
    expect(draft.status).toBe(201);
    const id = draft.body.data._id;
    const sym = await agent.post(`/api/v1/intakes/${id}/symptoms`).set('Cookie', cookie).send({ symptoms: ['Headache', 'Fever'], painLevel: 4, severity: 'moderate', redFlags: [] });
    expect(sym.status).toBe(201);
    const hist = await agent.post(`/api/v1/intakes/${id}/medical-history`).set('Cookie', cookie).send({ conditions: [], pregnancyStatus: 'not-applicable' });
    expect(hist.status).toBe(201);
    const sub = await agent.post(`/api/v1/intakes/${id}/submit`).set('Cookie', cookie).send({ dataProcessing: true, accuracyConfirmed: true });
    expect(sub.status).toBe(200);
    expect(sub.body.data.queue.token).toBeTruthy();
  });

  test('submission without consent is rejected; impossible pain score is rejected', async () => {    const { agent, cookie } = await patientSession();
    const draft = await agent.post('/api/v1/intakes').set('Cookie', cookie).send({
      fullName: 'Intake Patient', dateOfBirth: '1990-01-01', gender: 'female', phone: '+15550001111',
      email: 'intake@example.com', emergencyContactName: 'EC', emergencyContactPhone: '+15550002222',
      chiefComplaint: 'Cough',
    });
    const id = draft.body.data._id;
    const badPain = await agent.post(`/api/v1/intakes/${id}/symptoms`).set('Cookie', cookie).send({ symptoms: ['Cough'], painLevel: 99 });
    expect(badPain.status).toBe(422);
    await agent.post(`/api/v1/intakes/${id}/symptoms`).set('Cookie', cookie).send({ symptoms: ['Cough'], painLevel: 2 });
    await agent.post(`/api/v1/intakes/${id}/medical-history`).set('Cookie', cookie).send({});
    const noConsent = await agent.post(`/api/v1/intakes/${id}/submit`).set('Cookie', cookie).send({ dataProcessing: false, accuracyConfirmed: false });
    expect(noConsent.status).toBe(422);
  });

  test('submit without symptoms succeeds and joins the queue for staff review', async () => {
    const { agent, cookie } = await patientSession();
    const draft = await agent.post('/api/v1/intakes').set('Cookie', cookie).send({
      fullName: 'Intake Patient', dateOfBirth: '1990-01-01', gender: 'female', phone: '+15550001111',
      email: 'intake@example.com', emergencyContactName: 'EC', emergencyContactPhone: '+15550002222',
      chiefComplaint: 'General checkup request',
    });
    const id = draft.body.data._id;
    const sub = await agent.post(`/api/v1/intakes/${id}/submit`).set('Cookie', cookie).send({ dataProcessing: true, accuracyConfirmed: true });
    expect(sub.status).toBe(200);
    expect(sub.body.data.queue.token).toBeTruthy();
  });
});
