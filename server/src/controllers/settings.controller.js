import axios from 'axios';
import Settings from '../models/Settings.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

export const getSettings = asyncHandler(async (req, res) => {
  const settings = await Settings.getOrCreate();
  const obj = settings.toObject();

  // Mask sensitive keys — show last 6 chars only
  if (obj.waAccessToken)   obj.waAccessToken   = obj.waAccessToken.length > 6   ? `${'•'.repeat(20)}${obj.waAccessToken.slice(-6)}`   : obj.waAccessToken;
  if (obj.msg91AuthKey)    obj.msg91AuthKey    = obj.msg91AuthKey.length > 6    ? `${'•'.repeat(20)}${obj.msg91AuthKey.slice(-6)}`    : obj.msg91AuthKey;

  res.json(new ApiResponse(200, obj));
});

export const updateSettings = asyncHandler(async (req, res) => {
  const settings = await Settings.getOrCreate();
  const {
    templeName, templeAddress, templePhone, templeEmail, templeWebsite,
    waEnabled, waPhoneNumberId, waAccessToken, waTemplateName,
    smsEnabled, msg91AuthKey, msg91TemplateId,
    alertOnOutOfStock, alertOnLowStock, alertOnReorder,
    trustPAN, reg80GNumber, reg80GFrom, reg80GTo,
    assetMaxBorrowDays,
  } = req.body;

  if (templeName    !== undefined) settings.templeName    = templeName;
  if (templeAddress !== undefined) settings.templeAddress = templeAddress;
  if (templePhone   !== undefined) settings.templePhone   = templePhone;
  if (templeEmail   !== undefined) settings.templeEmail   = templeEmail;
  if (templeWebsite !== undefined) settings.templeWebsite = templeWebsite;

  if (waEnabled       !== undefined) settings.waEnabled       = waEnabled;
  if (waPhoneNumberId !== undefined) settings.waPhoneNumberId = waPhoneNumberId;
  if (waTemplateName  !== undefined) settings.waTemplateName  = waTemplateName;
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

  await settings.save();
  res.json(new ApiResponse(200, settings, 'Settings saved'));
});

export const testWhatsApp = asyncHandler(async (req, res) => {
  const { phone } = req.body;
  if (!phone) throw new ApiError(400, 'Phone number is required (with country code, e.g. 919876543210)');

  const settings = await Settings.getOrCreate();
  const phoneNumberId = settings.waPhoneNumberId || process.env.WA_PHONE_NUMBER_ID;
  const accessToken   = settings.waAccessToken   || process.env.WA_ACCESS_TOKEN;

  if (!phoneNumberId) throw new ApiError(400, 'WhatsApp Phone Number ID is not configured');
  if (!accessToken)   throw new ApiError(400, 'WhatsApp Access Token is not configured');

  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: { name: 'hello_world', language: { code: 'en_US' } },
      },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
    res.json(new ApiResponse(200, null, `Test message sent to ${phone}. Check WhatsApp!`));
  } catch (err) {
    const metaError = err.response?.data?.error;
    throw new ApiError(400, metaError?.message || 'Failed to send WhatsApp message');
  }
});
