import axios from 'axios';
import User from '../models/User.js';
import Settings from '../models/Settings.js';

async function getConfig() {
  const s = await Settings.getOrCreate();
  return {
    phoneNumberId: s.waPhoneNumberId || process.env.WA_PHONE_NUMBER_ID,
    accessToken:   s.waAccessToken   || process.env.WA_ACCESS_TOKEN,
    templateName:  s.waTemplateName  || process.env.WA_TEMPLATE_NAME || 'stock_alert',
    enabled:       s.waEnabled,
    alertOutOfStock: s.alertOnOutOfStock,
    alertLowStock:   s.alertOnLowStock,
    alertReorder:    s.alertOnReorder,
  };
}

async function getRecipients() {
  return User.find({
    whatsappAlertsEnabled: true,
    phone: { $exists: true, $ne: '' },
    isActive: true,
  }).select('phone name').lean();
}

async function sendToNumber(to, { product, department, quantity, unit, alertLevel }, cfg) {
  const levelLabel =
    alertLevel === 'out_of_stock' ? 'OUT OF STOCK' :
    alertLevel === 'low_stock'    ? 'Low Stock'    : 'Reorder Soon';

  await axios.post(
    `https://graph.facebook.com/v19.0/${cfg.phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: cfg.templateName,
        language: { code: 'en' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: product },
            { type: 'text', text: department },
            { type: 'text', text: String(quantity) },
            { type: 'text', text: unit },
            { type: 'text', text: levelLabel },
          ],
        }],
      },
    },
    { headers: { Authorization: `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' } }
  );
}

export async function checkAndAlert({ balance, product, department }) {
  const cfg = await getConfig();
  if (!cfg.enabled || !cfg.accessToken || !cfg.phoneNumberId) return;
  if (!balance || !product) return;

  const min     = product.minStockLevel || 0;
  const reorder = product.reorderPoint  || 0;
  const qty     = balance.quantity ?? 0;

  let alertLevel = null;
  if (qty === 0 && cfg.alertOutOfStock)                      alertLevel = 'out_of_stock';
  else if (min > 0 && qty <= min && cfg.alertLowStock)       alertLevel = 'low_stock';
  else if (reorder > 0 && qty <= reorder && cfg.alertReorder) alertLevel = 'reorder';
  if (!alertLevel) return;

  const recipients = await getRecipients();
  if (!recipients.length) return;

  const payload = {
    product: product.name, department: department?.name || 'Unknown',
    quantity: qty, unit: product.unit?.symbol || '', alertLevel,
  };

  const results = await Promise.allSettled(recipients.map((u) => sendToNumber(u.phone, payload, cfg)));
  for (const [i, r] of results.entries()) {
    if (r.status === 'rejected') console.error(`[WhatsApp] Failed → ${recipients[i]?.name}:`, r.reason?.response?.data || r.reason?.message);
    else console.log(`[WhatsApp] Sent → ${recipients[i]?.name}`);
  }
}
