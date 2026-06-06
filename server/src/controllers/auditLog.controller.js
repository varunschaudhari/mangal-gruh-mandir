import AuditLog from '../models/AuditLog.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import ExcelJS from 'exceljs';

export const getAuditLogs = asyncHandler(async (req, res) => {
  const {
    page = 1, limit = 50,
    dateFrom, dateTo,
    userId, entity, action, search,
  } = req.query;

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

  if (userId)  filter['user._id'] = userId;
  if (entity)  filter.entity      = entity;
  if (action)  filter.action      = action;

  if (search) {
    const s = search.trim();
    filter.$or = [
      { entityId:    { $regex: s, $options: 'i' } },
      { 'user.name': { $regex: s, $options: 'i' } },
      { action:      { $regex: s, $options: 'i' } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [total, logs] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
  ]);

  res.json(new ApiResponse(200, {
    logs,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    },
  }));
});

export const getEntityHistory = asyncHandler(async (req, res) => {
  const { entityRef } = req.params;
  const logs = await AuditLog.find({ entityRef })
    .sort({ timestamp: -1 })
    .limit(100)
    .lean();
  res.json(new ApiResponse(200, logs));
});

export const exportAuditLogs = asyncHandler(async (req, res) => {
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
  if (userId) filter['user._id'] = userId;
  if (entity) filter.entity = entity;
  if (action) filter.action = action;

  const logs = await AuditLog.find(filter).sort({ timestamp: -1 }).limit(5000).lean();

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
