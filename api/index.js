require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const app = require('../server/app');
const { connectDB } = require('../server/config/db');

const DB_KEY = '__patientflow_db__';

if (!global[DB_KEY]) {
  global[DB_KEY] = connectDB().catch((err) => {
    console.error('[vercel] MongoDB connection failed:', err.message);
    throw err;
  });
}

module.exports = async function handler(req, res) {
  try {
    await global[DB_KEY];
  } catch (err) {
    console.error('[vercel] Failed to initialize database:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Database connection failed during deployment startup.',
    });
  }

  return app(req, res);
};
