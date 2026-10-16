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

const NAME_STATUS = {
  APPROVED: 'approved', AVAILABLE_WITHOUT_REVIEW: 'approved', PENDING_REVIEW: 'in review by Meta',
  DECLINED: 'declined by Meta (change it in WhatsApp Manager)', EXPIRED: 'expired', NONE: 'not set yet',
};

// The number as Meta has it. An unknown field name is also Meta error 100, so then ask for less;
// subcode 33 (no such number, or the token can't use it) is a real error.
async function phoneNumberInfo(phoneNumberId, headers) {
  const get = (fields) => axios.get(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}`, { headers, params: { fields }, timeout: 15000 });
  try {
    return (await get('display_phone_number,verified_name,name_status')).data;
  } catch (err) {
    const e = err.response?.data?.error;
    if (e?.code !== 100 || e.error_subcode === 33) throw err;
    return (await get('display_phone_number,verified_name')).data;
  }
}

// Checks the number ID and token with Meta (no message, no charge) before the switch is turned on.
// Meta's sample "hello_world" goes out only from its public test numbers, so a message is tried
// only when a phone is given, and a real business number refusing it still counts as connected.
export const testWhatsApp = asyncHandler(async (req, res) => {
  const { phoneNumberId, accessToken } = await whatsappConfig();
  if (!phoneNumberId) throw new ApiError(400, 'WhatsApp Phone Number ID is not configured');
  if (!accessToken)   throw new ApiError(400, 'WhatsApp Access Token is not configured');
  const to = req.body.phone ? whatsappNumber(req.body.phone) : null;
  if (req.body.phone && !to) throw new ApiError(400, 'Enter a 10-digit mobile number (or one starting with + and the country code)');
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

  let number;
  try {
    number = await phoneNumberInfo(phoneNumberId, headers);
  } catch (err) {
    throw new ApiError(400, metaErrorText(err.response?.data?.error) || 'Could not reach WhatsApp');
  }
  const nameStatus = NAME_STATUS[number.name_status];
  let message = `Connected to WhatsApp number ${number.display_phone_number}`
    + (number.verified_name ? ` (${number.verified_name}${nameStatus ? `, display name ${nameStatus}` : ''})` : '') + '.';

  if (to) {
    try {
      await axios.post(
        `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
        { messaging_product: 'whatsapp', to, type: 'template', template: { name: 'hello_world', language: { code: 'en_US' } } },
        { headers, timeout: 15000 },
      );
      message += ` Test message sent to +${to}.`;
    } catch (err) {
      const e = err.response?.data?.error;
      if (e?.code !== 131058) throw new ApiError(400, `${message} But the test message failed: ${metaErrorText(e) || err.message}`);
      message += ' No test message was sent: Meta’s sample message goes out only from its test numbers. Once the booking template is approved, make a test booking to see a real receipt.';
    }
  }
  res.json(new ApiResponse(200, { number: number.display_phone_number, name: number.verified_name || '', nameStatus: number.name_status || '' }, message));
});
