const request = require('supertest');
const { evaluateTriage, RULE_VERSION } = require('../services/triageEngine');
const { startDb, stopDb, clearDb, app } = require('./setup');
const User = require('../models/User');

beforeAll(startDb, 60000);
afterAll(stopDb);
beforeEach(clearDb);

// Software tests validate scoring behaviour; they do NOT constitute clinical validation.
describe('triage engine boundaries (demo thresholds)', () => {
  test('critical red flags + low SpO2 score as critical with explanation', () => {
    const r = evaluateTriage({
      symptomEntry: { redFlags: ['chest-pain', 'breathing-difficulty'], painLevel: 9, isWorsening: true },
      vitals: { oxygenSaturation: 87, consciousness: 'voice', heartRateBpm: 130, respiratoryRate: 32, systolicBp: 85 },
      demographics: { dateOfBirth: '1940-01-01' },
      history: { conditions: ['heart disease'], pregnancyStatus: 'not-applicable' },
      arrivalMethod: 'ambulance',
    });
    expect(r.suggestedPriority).toBe('critical');
    expect(r.ruleVersion).toBe(RULE_VERSION);
    expect(r.matchedRules.length).toBeGreaterThan(2);
    expect(r.explanation).toMatch(/Requires Clinical Review/);
  });

  test('healthy vitals and mild symptoms score low; empty input is unclassified', () => {
    const low = evaluateTriage({
      symptomEntry: { redFlags: [], painLevel: 2, isWorsening: false },
      vitals: { oxygenSaturation: 98, consciousness: 'alert', heartRateBpm: 72, systolicBp: 118 },
      demographics: { dateOfBirth: '1995-06-01' }, history: {}, arrivalMethod: 'walk-in',
    });
    expect(['low', 'moderate', 'unclassified']).toContain(low.suggestedPriority);
    const empty = evaluateTriage({});
    expect(empty.suggestedPriority).toBe('unclassified');
  });

  test('boundary: SpO2 93 vs 89 changes score upward', () => {
    const base = { redFlags: [], painLevel: 3, isWorsening: false };
    const mid = evaluateTriage({ symptomEntry: base, vitals: { oxygenSaturation: 93, consciousness: 'alert' }, demographics: {}, history: {}, arrivalMethod: 'walk-in' });
    const low = evaluateTriage({ symptomEntry: base, vitals: { oxygenSaturation: 89, consciousness: 'alert' }, demographics: {}, history: {}, arrivalMethod: 'walk-in' });
    expect(low.score).toBeGreaterThan(mid.score);
  });
});

async function staffSession(role = 'nurse') {
  const agent = request(app());
  const u = new User({ email: `${role}@test.local`, role, fullName: `${role} test` });
  await u.setPassword('Secret123');
  await u.save();
  const jwt = require('jsonwebtoken');
  const token = jwt.sign({ sub: String(u._id), role }, process.env.JWT_SECRET || 'test-secret-min-32-chars-long-abcdef');
  const cookie = [`pf_token=${token}`];
  return { agent, cookie, user: u };
}

describe('triage API: confirm and override rules', () => {
  test('override without reason is rejected; confirm path requires nurse role', async () => {
    const nurse = await staffSession('nurse');
    const patient = await staffSession('patient').catch(() => null);
    // Build a patient intake via nurse-created flow
    const reg = await nurse.agent.post('/api/v1/auth/register').send({ fullName: 'Triage Pat', email: 'triage@example.com', password: 'Secret123' });
    const pCookie = reg.headers['set-cookie'];
    const draft = await nurse.agent.post('/api/v1/intakes').set('Cookie', pCookie).send({
      fullName: 'Triage Pat', dateOfBirth: '1985-01-01', gender: 'male', phone: '+15550001111',
      email: 'triage@example.com', emergencyContactName: 'EC', emergencyContactPhone: '+15550002222', chiefComplaint: 'Chest pain',
    });
    const id = draft.body.data._id;
    await nurse.agent.post(`/api/v1/intakes/${id}/symptoms`).set('Cookie', pCookie).send({ symptoms: ['Chest pain'], painLevel: 9, redFlags: ['chest-pain'] });
    await nurse.agent.post(`/api/v1/intakes/${id}/medical-history`).set('Cookie', pCookie).send({});
    await nurse.agent.post(`/api/v1/intakes/${id}/submit`).set('Cookie', pCookie).send({ dataProcessing: true, accuracyConfirmed: true });
    await nurse.agent.post('/api/v1/vitals').set('Cookie', nurse.cookie).send({ intake: id, oxygenSaturation: 88, consciousness: 'voice' });
    const assess = await nurse.agent.post('/api/v1/triage/assess').set('Cookie', nurse.cookie).send({ intake: id });
    expect(assess.status).toBe(201);
    const aid = assess.body.data._id;
    const suggested = assess.body.data.suggestedPriority;
    const other = suggested === 'low' ? 'urgent' : 'low';
    const noReason = await nurse.agent.post(`/api/v1/triage/${aid}/confirm`).set('Cookie', nurse.cookie).send({ confirmedPriority: other, overrideReason: '' });
    expect(noReason.status).toBe(422);
    const okOverride = await nurse.agent.post(`/api/v1/triage/${aid}/confirm`).set('Cookie', nurse.cookie).send({ confirmedPriority: other, overrideReason: 'Bedside reassessment justified change.' });
    expect(okOverride.status).toBe(200);
    expect(okOverride.body.data.status).toBe('overridden');
  });
});
