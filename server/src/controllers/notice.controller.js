import Notice, { FOR_DEVOTEES, FOR_STAFF, firstFilled } from '../models/Notice.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logAction } from '../services/audit.service.js';
import { sendToUsers } from '../services/push.service.js';
import { temple } from '../services/temple.service.js';

// Notice board: notices for devotees (public page /notices, TV screens) and for staff (Notice
// Board in the app + a phone notification). Posting needs notices:manage.

const SHOWN = 30;   // newest first; older ones stay in the list for those who manage notices

// Staff get the phone notification once, the first time a notice is up for them (posted showing,
// or later shown / turned to staff). Claimed atomically so two saves at once don't send it twice.
async function notifyStaff(notice, byUserId) {
  if (!notice.isActive || !FOR_STAFF.includes(notice.audience) || notice.notifiedAt) return;
  const claimed = await Notice.updateOne({ _id: notice._id, notifiedAt: null }, { $set: { notifiedAt: new Date() } });
  if (!claimed.modifiedCount) return;
  const users = await User.find({ isActive: true, _id: { $ne: byUserId } }).select('_id').lean();
  const body = firstFilled(notice.body);
  sendToUsers(users.map((u) => u._id), {
    title: `📢 ${firstFilled(notice.title)}`,
    body: body.length > 140 ? `${body.slice(0, 137)}…` : body,
    url: '/notice-board',
  });
}

const audit = (req, action, notice) => logAction(req, {
  action: `notice.${action}`, entity: 'Notice', entityId: firstFilled(notice.title).slice(0, 80), entityRef: notice._id,
});

/** Staff notice board: what is showing for staff, newest first. Anyone signed in. */
export const getStaffNotices = asyncHandler(async (req, res) => {
  const notices = await Notice.find({ isActive: true, audience: { $in: FOR_STAFF } })
    .sort({ createdAt: -1 }).limit(SHOWN)
    .select('title body audience createdAt updatedAt createdBy')
    .populate('createdBy', 'name').lean();
  res.json(new ApiResponse(200, notices));
});

/** Every notice, hidden ones too — for those who post them. */
export const getAllNotices = asyncHandler(async (req, res) => {
  const notices = await Notice.find().sort({ createdAt: -1 }).limit(200)
    .populate('createdBy', 'name').populate('updatedBy', 'name').lean();
  res.json(new ApiResponse(200, notices));
});

/** The devotees' notice page and the TV screens: no sign-in. */
export const getPublicNotices = asyncHandler(async (req, res) => {
  const notices = await Notice.find({ isActive: true, audience: { $in: FOR_DEVOTEES } })
    .sort({ createdAt: -1 }).limit(SHOWN).select('title body createdAt updatedAt').lean();
  // The temple's public details for the page header and the office card (as on receipts)
  const { name, nameMr, phone, address } = temple();
  res.json(new ApiResponse(200, { notices, temple: { name, nameMr, phone, address } }));
});

export const createNotice = asyncHandler(async (req, res) => {
  const notice = await Notice.create({ ...req.body, createdBy: req.user._id, updatedBy: req.user._id });
  audit(req, 'create', notice);
  await notifyStaff(notice, req.user._id);
  res.status(201).json(new ApiResponse(201, notice, 'Notice posted'));
});

export const updateNotice = asyncHandler(async (req, res) => {
  const notice = await Notice.findByIdAndUpdate(
    req.params.id,
    { ...req.body, updatedBy: req.user._id },
    { returnDocument: 'after', runValidators: true },
  );
  if (!notice) throw new ApiError(404, 'Notice not found');
  audit(req, 'update', notice);
  await notifyStaff(notice, req.user._id);
  res.json(new ApiResponse(200, notice, 'Notice saved'));
});

export const deleteNotice = asyncHandler(async (req, res) => {
  const notice = await Notice.findByIdAndDelete(req.params.id);
  if (!notice) throw new ApiError(404, 'Notice not found');
  audit(req, 'delete', notice);
  res.json(new ApiResponse(200, null, 'Notice deleted'));
});
