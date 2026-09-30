const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { port, frontendUrl, nodeEnv } = require('./env');
const routes = require('./index');
const { errorHandler, notFound } = require('./errorHandler');
const { bootstrapAdmin } = require('./scripts/bootstrap-admin');

const app = express();
app.set('trust proxy', 1);

// Security & core middleware
app.use(helmet({
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", "https://nominatim.openstreetmap.org", "https://tile.openstreetmap.org"],
      workerSrc: ["'self'", "blob:"],
      manifestSrc: ["'self'"],
    },
  },
}));
app.use(cors({ origin: frontendUrl === '*' ? true : frontendUrl, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
if (nodeEnv === 'development') app.use(morgan('dev'));

// Rate limiting - applies to all /api routes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later', errors: [] },
});
app.use('/api', limiter);



// Uploaded identity, vehicle and delivery documents are private.
// They are served only through authenticated /api/documents/:filename.
app.use('/api', routes);

// Separate team admin portal (ADMIN / MANAGER login).
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// Serve the frontend from the same Render web service.
app.use(express.static(__dirname));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use(notFound);
app.use(errorHandler);

async function startServer() {
  if (String(process.env.ADMIN_BOOTSTRAP_ENABLED || '').toLowerCase() === 'true') {
    console.log('ADMIN_BOOTSTRAP: enabled — creating/updating admin account before server start');
    try {
      await bootstrapAdmin();
      console.log('ADMIN_BOOTSTRAP: success');
    } catch (error) {
      console.error('ADMIN_BOOTSTRAP: failed:', error.message);
      process.exit(1);
    }
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`LoadLink Pakistan API running on http://localhost:${port}`);
    console.log(`Health check: http://localhost:${port}/api/health`);
    console.log('LOADLINK_DEPLOY_VERSION: DRIVER-SIGNUP-FIX-20260927');
  });
}

if (require.main === module) {
  startServer();
}

module.exports = app;
