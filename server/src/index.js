import 'dotenv/config';
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
import errorHandler from './middleware/errorHandler.js';
import { processAssetReminders } from './services/assetReminder.service.js';
import { processOverdueInvoiceAlerts } from './services/overdueInvoiceAlert.service.js';
import { logger } from './utils/logger.js';

const app = express();
const PORT = process.env.PORT || 5000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Trust the first proxy (Nginx) so express-rate-limit reads the real client IP
// from X-Forwarded-For instead of the loopback address.
app.set('trust proxy', 1);

connectDB();

app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    const allowed = (process.env.CLIENT_URL || 'http://localhost:3000').split(',').map(s => s.trim());
    // Also allow same-server (Electron loads from port 5000) and no-origin (Electron IPC)
    if (!origin || allowed.includes(origin) || origin === 'http://localhost:5000') return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

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
    // Skip health-check polling to keep logs clean
    skip: (req) => req.path === '/api/health',
  }));
} else {
  // Development: terse coloured output
  app.use(morgan('dev', {
    skip: (req) => req.path === '/api/health',
  }));
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

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
