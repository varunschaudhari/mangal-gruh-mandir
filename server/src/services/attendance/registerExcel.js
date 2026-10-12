import ExcelJS from 'exceljs';
import { temple } from '../temple.service.js';
import { dayCode } from '../../../../shared/attendanceCodes.js';   // same codes as the Register screen

// Monthly attendance register: one row per employee, one column per day, totals at the end.

const FILLS = {
  P: 'FFDCFCE7', H: 'FFFEF9C3', A: 'FFFEE2E2', UL: 'FFFEE2E2', WO: 'FFF3F4F6', HO: 'FFFFE4E6', WP: 'FFE0E7FF',
  OD: 'FFDBEAFE', MP: 'FFFFEDD5', PL: 'FFCCFBF1', EL: 'FFCFFAFE',
};

const thin = { style: 'thin', color: { argb: 'FFD1D5DB' } };
const border = { top: thin, bottom: thin, left: thin, right: thin };


const hours = (min) => Math.round((min / 60) * 10) / 10;

export async function writeRegisterExcel(res, { title, dates, staff, days, totals, leave }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = temple().name;
  wb.created = new Date();
  const ws = wb.addWorksheet('Register', { views: [{ state: 'frozen', xSplit: 2, ySplit: 4 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });

  const totalCols = [
    ['Days worked', (t) => t.presentValue],
    ['Paid leave', (t, l) => l.paidUsed],
    ['Extra leave', (t, l) => l.extraUsed],
    ['Unpaid days', (t, l) => l.unpaid],
    ['Late marks', (t, l) => l.lateMarks],
    ['Late cut', (t, l) => l.lateCut],
    ['Paid days', (t, l) => l.paidDays],
    ['Weekly off', (t) => t.off],
    ['Holidays', (t) => t.holidays],
    ['Double', (t) => t.doubles],
    ['Extra hrs', (t) => hours(t.extraMinutes)],
    ['Overtime ₹', (t, l) => l.overtime.total],
  ];
  const lastCol = 2 + dates.length + totalCols.length;
  const paidDaysCol = 3 + dates.length + totalCols.findIndex(([h]) => h === 'Paid days');

  ws.mergeCells(1, 1, 1, lastCol);
  ws.getCell(1, 1).value = `${temple().name} – ${title}`;
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FFEA580C' } };
  ws.mergeCells(2, 1, 2, lastCol);
  ws.getCell(2, 1).value = 'P present · H half day · PL paid leave · EL extra leave · A absent (unpaid) · UL unpaid leave · WO weekly off · HO holiday · WP worked on off day · OD on duty · MP missing punch · + double shift · bold orange = late';
  ws.getCell(2, 1).font = { size: 9, color: { argb: 'FF6B7280' } };

  const head1 = ['Code', 'Name', ...dates.map((d) => Number(d.slice(8))), ...totalCols.map(([h]) => h)];
  const head2 = ['', '', ...dates.map((d) => ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][new Date(`${d}T12:00:00`).getDay()]), ...totalCols.map(() => '')];
  [head1, head2].forEach((values, i) => {
    const row = ws.getRow(3 + i);
    row.values = values;
    row.eachCell((cell) => {
      cell.font = { bold: i === 0, size: i === 0 ? 10 : 8, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEA580C' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = border;
    });
  });

  for (const s of staff) {
    const k = String(s._id);
    const row = ws.addRow([s.staffCode, s.name, ...dates.map((d) => dayCode(days[k]?.[d])), ...totalCols.map(([, f]) => f(totals[k], leave[k]))]);
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      cell.border = border;
      cell.font = { size: 9 };
      if (c > 2) cell.alignment = { horizontal: 'center' };
      if (c > 2 && c <= 2 + dates.length) {
        const day = days[k]?.[dates[c - 3]];
        const fill = FILLS[String(cell.value).replace('+', '')];
        if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        if (day?.lateMinutes > 0) cell.font = { size: 9, bold: true, color: { argb: 'FFC2410C' } };
        const notes = [
          day?.overridden && (day.note || 'Corrected by supervisor'),
          day?.lateCut && `Late mark ${day.lateNo} — half day cut`,
          day?.holiday,
        ].filter(Boolean);
        if (notes.length) cell.note = notes.join('\n');
      }
      if (c === 3 + dates.length || c === paidDaysCol) cell.font = { size: 9, bold: true };
    });
  }

  ws.getColumn(1).width = 10;
  ws.getColumn(2).width = 22;
  for (let c = 3; c <= 2 + dates.length; c += 1) ws.getColumn(c).width = 4.5;
  for (let c = 3 + dates.length; c <= lastCol; c += 1) ws.getColumn(c).width = 9;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="attendance-${dates[0].slice(0, 7)}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}
