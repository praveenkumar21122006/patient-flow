const request = require('supertest');
const { startDb, stopDb, clearDb, app } = require('./setup');

beforeAll(startDb, 60000);
afterAll(stopDb);
beforeEach(clearDb);

describe('authentication & authorization', () => {
  test('patient can register and fetch own profile', async () => {
    const agent = request(app());
    const reg = await agent.post('/api/v1/auth/register').send({ fullName: 'Test Patient', email: 't1@example.com', password: 'Secret123' });
    expect(reg.status).toBe(201);
    expect(reg.body.success).toBe(true);
    const me = await agent.get('/api/v1/auth/me').set('Cookie', reg.headers['set-cookie']);
    expect(me.status).toBe(200);
    expect(me.body.data.user.role).toBe('patient');
  });

  test('login with wrong password returns generic 401 without revealing account existence', async () => {
    const agent = request(app());
    await agent.post('/api/v1/auth/register').send({ fullName: 'Test Two', email: 't2@example.com', password: 'Secret123' });
    const bad = await agent.post('/api/v1/auth/login').send({ email: 't2@example.com', password: 'Wrong9999' });
    expect(bad.status).toBe(401);
    expect(bad.body.message).toMatch(/invalid email or password/i);
    const missing = await agent.post('/api/v1/auth/login').send({ email: 'nobody@example.com', password: 'Wrong9999' });
    expect(missing.body.message).toBe(bad.body.message);
  });

  test('protected route rejects unauthenticated access; admin route rejects patient role', async () => {
    const agent = request(app());
    const anon = await agent.get('/api/v1/auth/me');
    expect(anon.status).toBe(401);
    const reg = await agent.post('/api/v1/auth/register').send({ fullName: 'Role Test', email: 'role@example.com', password: 'Secret123' });
    const cookie = reg.headers['set-cookie'];
    const forbidden = await agent.get('/api/v1/users').set('Cookie', cookie);
    expect(forbidden.status).toBe(403);
  });

  test('weak password is rejected by validation', async () => {
    const res = await request(app()).post('/api/v1/auth/register').send({ fullName: 'Weak', email: 'weak@example.com', password: 'short' });
    expect(res.status).toBe(422);
  });
});
