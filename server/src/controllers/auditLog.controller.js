import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import AuditLog from '../models/AuditLog.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import { logAction, visibleToRole } from '../services/audit.service.js';

// Search text is matched as typed (a "(" or "*" must not break the query)
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The list's filters; an entry is only shown to those who may read its module (audit.service).
async function auditQuery(req, { search = true } = {}) {
  const { dateFrom, dateTo, userId, entity, action } = req.query;
  const filter = {};
  if (dateFrom || dateTo) {
    filter.timestamp = {};
    if (dateFrom) filter.timestamp.$gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      filter.timestamp.$lte = end;
    }
  }
  if (userId && mongoose.isValidObjectId(userId)) filter['user._id'] = userId;
  if (entity) filter.entity = entity;
  if (action) filter.action = action;
  if (search && req.query.search) {
    const s = escapeRegex(String(req.query.search).trim());
    filter.$or = [
      { entityId:    { $regex: s, $options: 'i' } },
      { 'user.name': { $regex: s, $options: 'i' } },
      { action:      { $regex: s, $options: 'i' } },
    ];
  }
  return { $and: [filter, await visibleToRole(req.user.role)] };
}

export const getAuditLogs = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const filter = await auditQuery(req);

  const [total, logs] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  res.json(new ApiResponse(200, {
    logs,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  }));
});

// One record's history (shown on its screen): only the entries the viewer may read
export const getEntityHistory = asyncHandler(async (req, res) => {
  const { entityRef } = req.params;
  if (!mongoose.isValidObjectId(entityRef)) return res.json(new ApiResponse(200, []));
  const logs = await AuditLog.find({ $and: [{ entityRef }, await visibleToRole(req.user.role)] })
    .sort({ timestamp: -1 })
    .limit(100)
    .lean();
  res.json(new ApiResponse(200, logs));
});

export const exportAuditLogs = asyncHandler(async (req, res) => {
  const logs = await AuditLog.find(await auditQuery(req, { search: false })).sort({ timestamp: -1 }).limit(5000).lean();
  const { dateFrom, dateTo, userId, entity, action } = req.query;
  logAction(req, { action: 'audit.export', entity: 'AuditLog', meta: { rows: logs.length, dateFrom, dateTo, userId, entity, action } });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Audit Log');

  ws.columns = [
    { header: 'Timestamp',   key: 'timestamp',  width: 22 },
    { header: 'User',        key: 'user',        width: 20 },
    { header: 'Role',        key: 'role',        width: 14 },
    { header: 'Action',      key: 'action',      width: 22 },
    { header: 'Entity',      key: 'entity',      width: 18 },
    { header: 'Entity ID',   key: 'entityId',    width: 20 },
    { header: 'Details',     key: 'meta',        width: 40 },
    { header: 'IP',          key: 'ip',          width: 16 },
  ];

  ws.getRow(1).font = { bold: true };

  for (const log of logs) {
    ws.addRow({
      timestamp: log.timestamp ? new Date(log.timestamp).toLocaleString('en-IN') : '',
      user:      log.user?.name || 'System',
      role:      log.user?.role || '',
      action:    log.action,
      entity:    log.entity,
      entityId:  log.entityId || '',
      meta:      log.meta ? JSON.stringify(log.meta) : '',
      ip:        log.ip || '',
    });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="audit-log.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});
