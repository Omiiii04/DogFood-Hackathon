const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

const connectDB = require('./config/db');
const { errorHandler, notFoundHandler } = require('./middleware/errorMiddleware');
const { apiRateLimiter } = require('./middleware/rateLimiter');

// Routes
const authRoutes = require('./routes/authRoutes');
const teamRoutes = require('./routes/teamRoutes');
const submissionRoutes = require('./routes/submissionRoutes');
const judgingRoutes = require('./routes/judgingRoutes');
const adminRoutes = require('./routes/adminRoutes');
const voteRoutes = require('./routes/voteRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Security & Parsing Middleware
app.use(
  helmet({
    // Allow static image thumbnails to be embedded across origins (frontend on port 3000)
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    // Air-gap network hardening: prevent speculative DNS lookups
    dnsPrefetchControl: { allow: false },
    // Prevent clickjacking & framing
    frameguard: { action: 'deny' },
    // Strict MIME-type sniffing prevention
    xContentTypeOptions: true,
    // Air-gap strict referrer policy
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    // Disallow Flash/Acrobat cross-domain policies
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    // Hide server technology
    hidePoweredBy: true,
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'http://localhost:5000',
          'http://127.0.0.1:5000',
          'http://localhost:3000',
          'http://127.0.0.1:3000',
        ],
        connectSrc: [
          "'self'",
          'http://localhost:3000',
          'http://127.0.0.1:3000',
          'http://localhost:5000',
          'http://127.0.0.1:5000',
        ],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
  })
);

// Whitelisted CORS configuration with explicit origins, methods, and exposed headers
const clientUrlEnv = process.env.CLIENT_URL || 'http://localhost:3000,http://127.0.0.1:3000';
const configuredOrigins = clientUrlEnv
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

if (!configuredOrigins.includes('http://localhost:3000')) configuredOrigins.push('http://localhost:3000');
if (!configuredOrigins.includes('http://127.0.0.1:3000')) configuredOrigins.push('http://127.0.0.1:3000');

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server, Jest tests)
      if (!origin) return callback(null, true);
      const normalized = origin.replace(/\/+$/, '');
      if (configuredOrigins.includes(normalized)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS origin '${origin}' not allowed.`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'X-CSRF-Token',
      'Cache-Control',
      'Pragma',
    ],
    exposedHeaders: [
      'Content-Disposition',
      'Content-Type',
      'Content-Length',
      'X-Total-Count',
    ],
    maxAge: 86400, // 24 hours preflight cache
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Ensure upload directories exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const thumbnailsDir = path.join(uploadsDir, 'thumbnails');
if (!fs.existsSync(thumbnailsDir)) {
  fs.mkdirSync(thumbnailsDir, { recursive: true });
}

// Serve uploaded images statically
app.use(
  '/uploads',
  express.static(uploadsDir, {
    maxAge: '1d',
    setHeaders: (res) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  })
);

// General API rate limiter
app.use('/api/', apiRateLimiter);

// System Healthcheck Endpoint
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'api',
    uptimeSeconds: Math.floor(process.uptime()),
    version: '1.0.0',
    airGapped: true,
  });
});

// Mount API Endpoints
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/teams', teamRoutes);
app.use('/api/v1/submissions', submissionRoutes);
app.use('/api/v1/judging', judgingRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/votes', voteRoutes);

// Catch-all 404 and Error Handlers
app.use(notFoundHandler);
app.use(errorHandler);

// Start Server if not imported by tests
if (process.env.NODE_ENV !== 'test') {
  connectDB().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[Dogfood Core API] Running on http://0.0.0.0:${PORT}`);
    });
  });
}

module.exports = app;
