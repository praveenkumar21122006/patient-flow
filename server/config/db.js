const mongoose = require('mongoose');

function isConnectionError(err) {
  const message = String(err?.message || err);
  return /ECONNREFUSED|ENOTFOUND|failed to connect|timeout|MongoServerSelectionError/i.test(message);
}

async function connectDB(uri) {
  const configuredUri = uri || process.env.MONGODB_URI || process.env.MONGO_URI;
  const fallbackLocalUri = 'mongodb://127.0.0.1:27017/patientflow';
  const useFallback = process.env.NODE_ENV !== 'production';

  mongoose.set('strictQuery', true);

  const connect = async (mongoUri) => {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 8000,
    });
    return mongoose.connection;
  };

  if (configuredUri) {
    try {
      return await connect(configuredUri);
    } catch (err) {
      if (!useFallback || !isConnectionError(err)) throw err;
      console.warn('[patientflow] configured MongoDB unavailable, retrying with local dev fallback');
    }
  }

  if (useFallback) {
    try {
      return await connect(fallbackLocalUri);
    } catch (err) {
      if (!isConnectionError(err)) throw err;
    }

    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const memoryMongo = await MongoMemoryServer.create();
      const memoryUri = memoryMongo.getUri('patientflow');
      process.env.MONGODB_URI = memoryUri;
      const connection = await connect(memoryUri);
      connection._memoryMongo = memoryMongo;
      console.log('[patientflow] using temporary MongoDB memory server for local development');
      return connection;
    } catch (memoryErr) {
      console.error('[patientflow] failed to connect to MongoDB and no in-memory fallback is available');
      throw memoryErr;
    }
  }

  return await connect(fallbackLocalUri);
}

module.exports = { connectDB };
