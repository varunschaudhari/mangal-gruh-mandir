import Settings from '../models/Settings.js';
import ApiResponse from '../utils/ApiResponse.js';
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

  if (assetMaxBorrowDays !== undefined) settings.assetMaxBorrowDays = assetMaxBorrowDays;

  await settings.save();
  res.json(new ApiResponse(200, settings, 'Settings saved'));
});
