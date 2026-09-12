const request = require('supertest');
const jwt = require('jsonwebtoken');
const { startDb, stopDb, clearDb, app } = require('./setup');
const User = require('../models/User');
const PatientProfile = require('../models/PatientProfile');
const Department = require('../models/Department');

beforeAll(startDb, 60000);
afterAll(stopDb);
beforeEach(clearDb);

const SECRET = process.env.JWT_SECRET || 'test-secret-min-32-chars-long-abcdef';
function cookieFor(user) {
  const token = jwt.sign({ sub: String(user._id), role: user.role }, SECRET);
  return [`pf_token=${token}`];
}

async function makeStaff(role, email) {
  const u = new User({ email, role, fullName: `${role} t` });
  await u.setPassword('Secret123');
  await u.save();
  return u;
}

async function makePatientProfile(user, name = 'Appt Patient') {
  return PatientProfile.create({
    user: user._id, patientId: `PT-TEST-${Date.now()}`, fullName: name,
    dateOfBirth: new Date('1990-01-01'), gender: 'female', phone: '+15550001111', email: user.email,
    emergencyContactName: 'EC', emergencyContactPhone: '+15550002222',
  });
}

function future(hours = 48) {
  return new Date(Date.now() + hours * 3600 * 1000).toISOString();
}

describe('appointments', () => {
  let nurse, doctor, dept, patientUser, profile, pCookie, nCookie;
  beforeEach(async () => {
    nurse = await makeStaff('nurse', 'nurse-a@test.local');
    doctor = await makeStaff('doctor', 'doctor-a@test.local');
    dept = await Department.create({ name: 'General', code: 'GEN' });
    patientUser = new User({ email: 'appt-p@test.local', role: 'patient', fullName: 'Appt Patient' });
    await patientUser.setPassword('Secret123');
    await patientUser.save();
    profile = await makePatientProfile(patientUser);
    pCookie = cookieFor(patientUser);
    nCookie = cookieFor(nurse);
  });

  test('patient books own appointment; staff books for a patient', async () => {
    const agent = request(app());
    const own = await agent.post('/api/v1/appointments').set('Cookie', pCookie).send({
      department: String(dept._id), scheduledAt: future(), reason: 'Follow-up review',
    });
    expect(own.status).toBe(201);
    expect(own.body.data.appointmentId).toMatch(/^AP-/);
    expect(String(own.body.data.patient)).toBe(String(profile._id));
    const byStaff = await agent.post('/api/v1/appointments').set('Cookie', nCookie).send({
      patient: String(profile._id), department: String(dept._id), clinician: String(doctor._id),
      scheduledAt: future(72), reason: 'Nurse-booked review',
    });
    expect(byStaff.status).toBe(201);
  });

  test('validation: past date, missing department, bad reason rejected', async () => {
    const agent = request(app());
    const past = await agent.post('/api/v1/appointments').set('Cookie', pCookie).send({ department: String(dept._id), scheduledAt: new Date(Date.now() - 3600000).toISOString(), reason: 'x' });
    expect(past.status).toBe(422);
    const noDept = await agent.post('/api/v1/appointments').set('Cookie', pCookie).send({ scheduledAt: future(), reason: 'x' });
    expect(noDept.status).toBe(422);
    const noReason = await agent.post('/api/v1/appointments').set('Cookie', pCookie).send({ department: String(dept._id), scheduledAt: future(), reason: '' });
    expect(noReason.status).toBe(422);
  });

  test('overlapping active bookings rejected with 409', async () => {
    const agent = request(app());
    const slot = future();
    const first = await agent.post('/api/v1/appointments').set('Cookie', pCookie).send({ department: String(dept._id), scheduledAt: slot, durationMinutes: 60, reason: 'First' });
    expect(first.status).toBe(201);
    const clash = await agent.post('/api/v1/appointments').set('Cookie', pCookie).send({ department: String(dept._id), scheduledAt: slot, reason: 'Clash' });
    expect(clash.status).toBe(409);
  });

  test('patient may only cancel own; illegal transitions rejected', async () => {
    const agent = request(app());
    const created = await agent.post('/api/v1/appointments').set('Cookie', nCookie).send({ patient: String(profile._id), department: String(dept._id), scheduledAt: future(), reason: 'Review' });
    const id = created.body.data._id;
    const complete = await agent.patch(`/api/v1/appointments/${id}`).set('Cookie', pCookie).send({ status: 'completed' });
    expect(complete.status).toBe(403);
    const skip = await agent.patch(`/api/v1/appointments/${id}`).set('Cookie', nCookie).send({ status: 'completed' });
    expect(skip.status).toBe(409);
    const checkin = await agent.patch(`/api/v1/appointments/${id}`).set('Cookie', nCookie).send({ status: 'checked-in' });
    expect(checkin.status).toBe(200);
    const cancel = await agent.patch(`/api/v1/appointments/${id}`).set('Cookie', pCookie).send({ status: 'cancelled' });
    expect(cancel.status).toBe(200);
  });

  test('list scoped + filtered; unauthenticated blocked', async () => {
    const agent = request(app());
    await agent.post('/api/v1/appointments').set('Cookie', pCookie).send({ department: String(dept._id), scheduledAt: future(), reason: 'Mine' });
    const other = new User({ email: 'other-a@test.local', role: 'patient', fullName: 'Other' });
    await other.setPassword('Secret123');
    await other.save();
    const mine = await agent.get('/api/v1/appointments').set('Cookie', pCookie);
    expect(mine.status).toBe(200);
    expect(mine.body.data.every((a) => String(a.patient._id || a.patient) === String(profile._id))).toBe(true);
    const upcoming = await agent.get('/api/v1/appointments').set('Cookie', pCookie).query({ upcoming: 'true' });
    expect(upcoming.body.meta.total).toBe(1);
    const anon = await agent.get('/api/v1/appointments');
    expect(anon.status).toBe(401);
  });
});
