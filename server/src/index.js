import 'dotenv/config';
import './config/timezone.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import connectDB from './config/db.js';
import routes from './routes/index.js';
import iclockRoutes from './routes/iclock.routes.js';
import errorHandler from './middleware/errorHandler.js';
import { processAssetReminders } from './services/assetReminder.service.js';
import { processOverdueInvoiceAlerts } from './services/overdueInvoiceAlert.service.js';
import { logger } from './utils/logger.js';
import { pushMorningDigest } from './services/pushAlerts.service.js';

const app = express();
const PORT = process.env.PORT || 5000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Trust the first proxy (Nginx) so express-rate-limit reads the real client IP
// from X-Forwarded-For instead of the loopback address.
app.set('trust proxy', 1);

connectDB();

// Mobile apps (Capacitor) load the UI from their own origin, so uploaded files
// (e.g. expense receipts) must be loadable cross-origin.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// Origins used by the Capacitor Android (https://localhost) and iOS (capacitor://localhost) apps.
const MOBILE_APP_ORIGINS = ['https://localhost', 'capacitor://localhost'];

app.use(cors({
  origin: (origin, cb) => {
    const allowed = (process.env.CLIENT_URL || 'http://localhost:3000').split(',').map(s => s.trim());
    // Allow: configured origins, localhost dev, no-origin (Electron proxy strips Origin header),
    // app:// custom scheme (Electron renderer direct requests as fallback), and the mobile apps
    if (!origin || allowed.includes(origin) || origin === 'http://localhost:5000' || origin?.startsWith('app://') || MOBILE_APP_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// The attendance machine polls every ~10 s; only its uploads and errors are worth a log line.
const quietPoll = (req, res) => req.path === '/api/health'
  || (req.originalUrl.startsWith('/iclock/') && req.method === 'GET' && res.statusCode < 400);

// ── HTTP access logging ───────────────────────────────────────────────────────
morgan.token('user', (req) => req.user?.email || '-');
morgan.token('user-id', (req) => req.user?._id?.toString() || '-');

if (IS_PROD) {
  // Production: structured JSON — one line per request, captured by PM2 / systemd
  app.use(morgan((tokens, req, res) => {
    const status = parseInt(tokens.status(req, res)) || 0;
    const ms     = parseFloat(tokens['response-time'](req, res)) || 0;
    const entry  = {
      ts:     new Date().toISOString(),
      level:  status >= 500 ? 'error' : status >= 400 ? 'warn' : 'http',
      method: tokens.method(req, res),
      url:    tokens.url(req, res),
      status,
      ms,
      bytes:  parseInt(tokens.res(req, res, 'content-length')) || 0,
      ip:     tokens['remote-addr'](req, res),
      user:   tokens.user(req, res),
    };
    // Warn on slow requests (> 3 s)
    if (ms > 3000) entry.slow = true;
    return JSON.stringify(entry);
  }, {
    // Skip health-check and machine polling to keep logs clean
    skip: quietPoll,
  }));
} else {
  // Development: terse coloured output
  app.use(morgan('dev', { skip: quietPoll }));
}

// Attendance machine (ADMS protocol) — before the JSON/form parsers, it reads raw text bodies.
app.use('/iclock', iclockRoutes);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
const UPLOADS_DIR = path.join(__dirname, '../uploads');
app.use('/uploads', express.static(UPLOADS_DIR));
// In production nginx only forwards /api/* to this server, so uploads (expense receipts)
// are also served here — /uploads/* never reached it and returned 404.
app.use('/api/uploads', express.static(UPLOADS_DIR));

// Android app updates: latest.json + APK files published by client/scripts/release-android.mjs
// (see MOBILE.md). latest.json must never be cached or phones won't see new versions.
app.use('/api/app', express.static(path.join(__dirname, '../mobile-releases'), {
  setHeaders: (res, file) => { if (file.endsWith('.json')) res.setHeader('Cache-Control', 'no-store'); },
}));

app.get('/api/health', (req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV }));

app.use('/api', routes);

// Serve React build for Electron / direct access — only when client/dist exists
const clientDist = path.join(__dirname, '../../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback — any non-API route returns index.html
  app.use((req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`Server started`, { port: PORT, env: process.env.NODE_ENV });
  startAssetReminderScheduler();
  startOverdueInvoiceAlertScheduler();
  // 08:30 IST — mobile app push: stock needing attention + approvals waiting
  scheduleDaily(8, 30, pushMorningDigest);
});

function scheduleDaily(hour, minute, fn) {
  const tick = () => {
    const now  = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    setTimeout(() => {
      fn().catch(console.error);
      setInterval(() => fn().catch(console.error), 24 * 60 * 60 * 1000);
    }, next - now);
  };
  tick();
}

function startAssetReminderScheduler() {
  scheduleDaily(9, 0, processAssetReminders);
}

function startOverdueInvoiceAlertScheduler() {
  // Run at 09:30 daily — after asset reminders so logs don't interleave
  scheduleDaily(9, 30, processOverdueInvoiceAlerts);
}
