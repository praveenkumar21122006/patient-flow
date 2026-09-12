const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config/env');
const { HttpError } = require('../utils/asyncHandler');

// Allowed document types are configurable by admins via /admin/settings;
// defaults here are intentionally conservative (images + pdf only).
const DEFAULT_ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname || '').slice(0, 8)}`;
    cb(null, safe);
  },
});

function fileFilter(req, file, cb) {
  const allowed = (req.app.get('uploadAllowedMime') || DEFAULT_ALLOWED);
  if (allowed.includes(file.mimetype)) return cb(null, true);
  return cb(new HttpError(400, `File type not allowed. Permitted types: ${allowed.join(', ')}`));
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: (config.uploadMaxMb || 5) * 1024 * 1024, files: 3 },
});

module.exports = { upload, DEFAULT_ALLOWED };
