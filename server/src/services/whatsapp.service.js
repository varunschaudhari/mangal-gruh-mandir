import User from '../models/User.js';
import Settings from '../models/Settings.js';
import { sendTemplateToAll, whatsappConfig, whatsappReady } from './whatsappClient.service.js';

// Stock alerts on WhatsApp to staff who have "WhatsApp alerts" ticked (Admin → Users).
// Template (named in Settings → WhatsApp, which also shows the wording to submit to Meta):
//   {{1}} product  {{2}} department  {{3}} quantity  {{4}} unit  {{5}} OUT OF STOCK / Low Stock / Reorder Soon

const LEVEL = { out_of_stock: 'OUT OF STOCK', low_stock: 'Low Stock', reorder: 'Reorder Soon' };

export async function checkAndAlert({ balance, product, department }) {
  const cfg = await whatsappConfig();
  if (!whatsappReady(cfg) || !cfg.templates.stockAlert || !balance || !product) return;
  const s = await Settings.getOrCreate();

  const min     = product.minStockLevel || 0;
  const reorder = product.reorderPoint  || 0;
  const qty     = balance.quantity ?? 0;

  let alertLevel = null;
  if (qty === 0 && s.alertOnOutOfStock)                      alertLevel = 'out_of_stock';
  else if (min > 0 && qty <= min && s.alertOnLowStock)       alertLevel = 'low_stock';
  else if (reorder > 0 && qty <= reorder && s.alertOnReorder) alertLevel = 'reorder';
  if (!alertLevel) return;

  const recipients = await User.find({ whatsappAlertsEnabled: true, phone: { $exists: true, $ne: '' }, isActive: true })
    .select('phone name').lean();
  if (!recipients.length) return;

  await sendTemplateToAll(cfg, recipients, {
    template: cfg.templates.stockAlert, label: 'Stock alert',
    body: [product.name, department?.name || 'Unknown', String(qty), product.unit?.symbol || '', LEVEL[alertLevel]],
  });
}
