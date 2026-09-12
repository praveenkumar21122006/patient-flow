require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const app = require('./app');
const config = require('./config/env');
const { connectDB } = require('./config/db');

const port = config.port;

connectDB()
  .then(() => {
    console.log('[patientflow] connected to MongoDB');
    app.listen(port, () => console.log(`[patientflow] listening on http://localhost:${port} (${config.nodeEnv})`));
  })
  .catch((err) => {
    console.error('[patientflow] MongoDB connection failed:', err.message);
    console.error('Hint: start MongoDB locally or set MONGODB_URI in .env (see .env.example). The API will not start without a database.');
    process.exit(1);
  });
