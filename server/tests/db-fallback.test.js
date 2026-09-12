const mongoose = require('mongoose');
const { connectDB } = require('../config/db');

describe('database connectivity', () => {
  const previousMongoUri = process.env.MONGODB_URI;
  const previousLegacyMongoUri = process.env.MONGO_URI;
  const previousNodeEnv = process.env.NODE_ENV;

  afterEach(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => {});
    }
    if (previousMongoUri === undefined) {
      delete process.env.MONGODB_URI;
    } else {
      process.env.MONGODB_URI = previousMongoUri;
    }
    if (previousLegacyMongoUri === undefined) {
      delete process.env.MONGO_URI;
    } else {
      process.env.MONGO_URI = previousLegacyMongoUri;
    }
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  test('falls back to an in-memory MongoDB when localhost is unreachable in development', async () => {
    process.env.NODE_ENV = 'development';
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/definitely-not-running-patientflow';
    delete process.env.MONGO_URI;

    const connection = await connectDB();

    expect(connection.readyState).toBe(1);
    expect(connection._memoryMongo).toBeDefined();
  });
});
