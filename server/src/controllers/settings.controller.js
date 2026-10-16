import axios from 'axios';
import Settings, { WA_TEMPLATE_DEFAULTS } from '../models/Settings.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { changedValues, logAction, maskSecret } from '../services/audit.service.js';
import { refreshTemple } from '../services/temple.service.js';
import { GRAPH_VERSION, metaErrorText, whatsappConfig, whatsappNumber } from '../services/whatsappClient.service.js';

// The WhatsApp access token and MSG91 key never leave the server in full — only the last 6 characters.
const withMaskedKeys = (settings) => {
  const obj = settings.toObject();
  if (obj.waAccessToken)   obj.waAccessToken   = obj.waAccessToken.length > 6   ? `${'•'.repeat(20)}${obj.waAccessToken.slice(-6)}`   : obj.waAccessToken;
  if (obj.msg91AuthKey)    obj.msg91AuthKey    = obj.msg91AuthKey.length > 6    ? `${'•'.repeat(20)}${obj.msg91AuthKey.slice(-6)}`    : obj.msg91AuthKey;
  return obj;
};

export const getSettings = asyncHandler(async (req, res) => {
  const settings = await Settings.getOrCreate();
  res.json(new ApiResponse(200, withMaskedKeys(settings)));
});

export const updateSettings = asyncHandler(async (req, res) => {
  const settings = await Settings.getOrCreate();
  const before = settings.toObject();
  const {
    templeName, templeNameMr, trustRegNumber, trustLegalName, templeAddress, templePhone, templeEmail, templeWebsite,
    waEnabled, waPhoneNumberId, waAccessToken, waTemplates,
    smsEnabled, msg91AuthKey, msg91TemplateId,
    alertOnOutOfStock, alertOnLowStock, alertOnReorder,
    trustPAN, reg80GNumber, reg80GFrom, reg80GTo,
    assetMaxBorrowDays,
    mahaprasadDayPricing, mahaprasadDailyCap, mahaprasadCouponValidityDays, mahaprasadPrinterName,
  } = req.body;

  if (templeName    !== undefined) settings.templeName    = templeName;
  if (templeNameMr  !== undefined) settings.templeNameMr  = templeNameMr;
  if (trustRegNumber !== undefined) settings.trustRegNumber = trustRegNumber;
  if (trustLegalName !== undefined) settings.trustLegalName = trustLegalName;
  if (templeAddress !== undefined) settings.templeAddress = templeAddress;
  if (templePhone   !== undefined) settings.templePhone   = templePhone;
  if (templeEmail   !== undefined) settings.templeEmail   = templeEmail;
  if (templeWebsite !== undefined) settings.templeWebsite = templeWebsite;

  if (waEnabled       !== undefined) settings.waEnabled       = waEnabled;
  if (waPhoneNumberId !== undefined) settings.waPhoneNumberId = waPhoneNumberId;
  if (waTemplates) {
    Object.keys(WA_TEMPLATE_DEFAULTS).forEach((k) => { if (waTemplates[k] !== undefined) settings.set(`waTemplates.${k}`, waTemplates[k]); });
  }
  // Only update token if it doesn't look like a masked value
  if (waAccessToken && !waAccessToken.includes('•')) settings.waAccessToken = waAccessToken;

  if (smsEnabled      !== undefined) settings.smsEnabled      = smsEnabled;
  if (msg91TemplateId !== undefined) settings.msg91TemplateId = msg91TemplateId;
  if (msg91AuthKey && !msg91AuthKey.includes('•')) settings.msg91AuthKey = msg91AuthKey;

  if (alertOnOutOfStock !== undefined) settings.alertOnOutOfStock = alertOnOutOfStock;
  if (alertOnLowStock   !== undefined) settings.alertOnLowStock   = alertOnLowStock;
  if (alertOnReorder    !== undefined) settings.alertOnReorder    = alertOnReorder;

  if (trustPAN     !== undefined) settings.trustPAN     = trustPAN;
  if (reg80GNumber !== undefined) settings.reg80GNumber = reg80GNumber;
  if (reg80GFrom   !== undefined) settings.reg80GFrom   = reg80GFrom || undefined;
  if (reg80GTo     !== undefined) settings.reg80GTo     = reg80GTo || undefined;

  if (assetMaxBorrowDays !== undefined) settings.assetMaxBorrowDays = assetMaxBorrowDays;

  if (mahaprasadDayPricing !== undefined && typeof mahaprasadDayPricing === 'object') {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    days.forEach((day) => {
      if (mahaprasadDayPricing[day] !== undefined) settings.mahaprasadDayPricing[day] = mahaprasadDayPricing[day];
    });
    settings.markModified('mahaprasadDayPricing');
  }
  if (mahaprasadDailyCap           !== undefined) settings.mahaprasadDailyCap           = mahaprasadDailyCap;
  if (mahaprasadCouponValidityDays !== undefined) settings.mahaprasadCouponValidityDays = mahaprasadCouponValidityDays;
  if (mahaprasadPrinterName        !== undefined) settings.mahaprasadPrinterName        = mahaprasadPrinterName;

  await settings.save();
  await refreshTemple(settings);
  // Old → new for what changed; access tokens and keys only as "(set)" / "(empty)"
  const change = changedValues(before, settings.toObject(), Object.keys(req.body), { mask: { waAccessToken: maskSecret, msg91AuthKey: maskSecret } });
  if (change) logAction(req, { action: 'settings.update', entity: 'Settings', entityRef: settings._id, ...change });
  res.json(new ApiResponse(200, withMaskedKeys(settings), 'Settings saved'));
});

// Meta's ready-made "hello_world" template (every WhatsApp account has it): checks the number ID
// and token before the switch is turned on.
export const testWhatsApp = asyncHandler(async (req, res) => {
  const { phoneNumberId, accessToken } = await whatsappConfig();
  if (!phoneNumberId) throw new ApiError(400, 'WhatsApp Phone Number ID is not configured');
  if (!accessToken)   throw new ApiError(400, 'WhatsApp Access Token is not configured');
  const to = whatsappNumber(req.body.phone);
  if (!to) throw new ApiError(400, 'Enter a 10-digit mobile number (or one starting with + and the country code)');

  try {
    await axios.post(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: { name: 'hello_world', language: { code: 'en_US' } },
      },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    res.json(new ApiResponse(200, null, `Test message sent to +${to}. Check WhatsApp!`));
  } catch (err) {
    const metaError = err.response?.data?.error;
    throw new ApiError(400, metaErrorText(metaError) || 'Failed to send WhatsApp message');
  }
});
