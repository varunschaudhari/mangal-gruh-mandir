import axios from 'axios';
import User from '../models/User.js';
import Settings from '../models/Settings.js';

async function getConfig() {
  const s = await Settings.getOrCreate();
  return {
    authKey:    s.msg91AuthKey    || process.env.MSG91_AUTH_KEY,
    templateId: s.msg91TemplateId || process.env.MSG91_TEMPLATE_ID,
    enabled:    s.smsEnabled,
    alertOutOfStock: s.alertOnOutOfStock,
    alertLowStock:   s.alertOnLowStock,
    alertReorder:    s.alertOnReorder,
  };
}

async function getSmsRecipients() {
  return User.find({
    smsAlertsEnabled: true,
    phone: { $exists: true, $ne: '' },
    isActive: true,
  }).select('phone name').lean();
}

async function sendSms(mobile, { product, department, quantity, unit, alertLevel }, cfg) {
  const levelLabel =
    alertLevel === 'out_of_stock' ? 'OUT OF STOCK' :
    alertLevel === 'low_stock'    ? 'Low Stock'    : 'Reorder Soon';

  await axios.post(
    'https://api.msg91.com/api/v5/flow/',
    {
      template_id: cfg.templateId,
      short_url: '0',
      mobiles: mobile,
      product,
      department,
      quantity: String(quantity),
      unit,
      status: levelLabel,
    },
    { headers: { authkey: cfg.authKey, 'Content-Type': 'application/json' } }
  );
}

export async function sendSmsAlerts({ product, department, quantity, unit, alertLevel }) {
  const cfg = await getConfig();
  if (!cfg.enabled || !cfg.authKey || !cfg.templateId) return;

  const recipients = await getSmsRecipients();
  if (!recipients.length) return;

  const results = await Promise.allSettled(
    recipients.map((u) => sendSms(u.phone, { product, department, quantity, unit, alertLevel }, cfg))
  );
  for (const [i, r] of results.entries()) {
    if (r.status === 'rejected') console.error(`[SMS] Failed → ${recipients[i]?.name}:`, r.reason?.response?.data || r.reason?.message);
    else console.log(`[SMS] Sent → ${recipients[i]?.name}`);
  }
}
