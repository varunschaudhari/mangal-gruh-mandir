import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import connectDB from './config/db.js';
import routes from './routes/index.js';
import errorHandler from './middleware/errorHandler.js';
import { processAssetReminders } from './services/assetReminder.service.js';
import { processOverdueInvoiceAlerts } from './services/overdueInvoiceAlert.service.js';

const app = express();
const PORT = process.env.PORT || 5000;

connectDB();

app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV }));

app.use('/api', routes);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} [${process.env.NODE_ENV}]`);
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
