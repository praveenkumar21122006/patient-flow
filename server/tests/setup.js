const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongo;

async function startDb() {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri('patientflow-test');
  process.env.JWT_SECRET = 'test-secret-min-32-chars-long-abcdef';
  process.env.NODE_ENV = 'test';
  const { connectDB } = require('../config/db');
  await connectDB(process.env.MONGODB_URI);
}

async function stopDb() {
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect().catch(() => {});
  if (mongo) await mongo.stop();
}

async function clearDb() {
  const cols = mongoose.connection.collections;
  for (const c of Object.values(cols)) await c.deleteMany({});
}

function app() {
  return require('../app');
}

module.exports = { startDb, stopDb, clearDb, app };
