import ExcelJS from 'exceljs';
import { ORGANIZATION, safeCell } from './core';
import { Report, reportMetadata } from './reporting';

const NAVY = 'FF182942';
const GOLD = 'FFAD9461';
const IVORY = 'FFF8F5EE';
const ZEBRA = 'FFFBFAF6';
const LINE = 'FFE3E1DA';
const SLATE = 'FF657181';
const months = [
  'Januari',
  'Februari',
  'Mac',
  'April',
  'Mei',
  'Jun',
  'Julai',
  'Ogos',
  'September',
  'Oktober',
  'November',
  'Disember',
];
const monthLabel = (period: string) => {
  const [y, m] = period.split('-');
  return `${months[Number(m) - 1] || m} ${y}`;
};
const klStamp = (iso: string) =>
  new Intl.DateTimeFormat('ms-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
const thin = { style: 'thin' as const, color: { argb: LINE } };

export async function toXlsx(r: Report) {
  const book = new ExcelJS.Workbook();
  book.creator = ORGANIZATION;
  book.created = new Date(r.generated_at);
  // Lajur wang disimpan sebagai integer sen; Excel memaparkannya sebagai nombor RM dua perpuluhan.
  const money = r.headers.map((h) => h.includes('(sen)'));
  const headers = r.headers.map((h) => h.replace('(sen)', '(RM)'));
  const cells = r.rows.map((row) =>
    row.map((v, i) => (money[i] && typeof v === 'number' ? v / 100 : safeCell(v))),
  );
  const widths = headers.map((h, i) =>
    Math.min(
      i === headers.length - 1 && headers[i] === 'Ulasan' ? 60 : 44,
      Math.max(12, h.length + 4, ...cells.map((row) => String(row[i] ?? '').length + 2)),
    ),
  );
  const span = Math.max(headers.length, 4);

  // --- Helaian LAPORAN: kemas, bertajuk dan sedia dicetak.
  const report = book.addWorksheet('LAPORAN', {
    views: [{ state: 'frozen', ySplit: 7, showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: headers.length > 5 ? 'landscape' : 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.3 },
      printTitlesRow: '7:7',
    },
    headerFooter: {
      oddFooter: `&L&8${ORGANIZATION} · Sulit&R&8Halaman &P / &N`,
    },
  });
  report.columns = widths.map((width) => ({ width }));
  const band = (row: number, value: string, size: number, color: string, fill?: string) => {
    report.mergeCells(row, 1, row, span);
    const cell = report.getCell(row, 1);
    cell.value = value;
    cell.font = { name: 'Calibri', size, bold: size >= 11, color: { argb: color } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  };
  band(1, 'AKADEMI AL-QURAN AR-RIYADH', 9, GOLD, NAVY);
  band(2, r.title, 18, 'FFFFFFFF', NAVY);
  band(3, `Bulan: ${monthLabel(r.month)}`, 11, 'FFFFFFFF', NAVY);
  report.getRow(1).height = 20;
  report.getRow(2).height = 30;
  report.getRow(3).height = 22;
  for (let c = 1; c <= span; c++)
    report.getCell(4, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
  report.getRow(4).height = 4;
  const moneyTotal = r.total_sen / 100;
  const hasMoney = money.some(Boolean);
  band(
    5,
    `${r.rows.length} rekod${hasMoney ? ` · Jumlah RM ${moneyTotal.toFixed(2)}` : ''} · Dijana ${klStamp(r.generated_at)} oleh ${r.generated_by}${r.demo ? ' · DATA DEMO' : ''}`,
    10,
    SLATE,
  );
  report.getRow(5).height = 22;
  const head = report.getRow(7);
  headers.forEach((h, i) => {
    const cell = head.getCell(i + 1);
    cell.value = h.toUpperCase();
    cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { vertical: 'middle', horizontal: money[i] ? 'right' : 'left', indent: 1 };
  });
  head.height = 24;
  cells.forEach((values, k) => {
    const row = report.getRow(8 + k);
    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v as ExcelJS.CellValue;
      cell.font = { name: 'Calibri', size: 10.5, color: { argb: NAVY } };
      cell.alignment = {
        vertical: 'top',
        horizontal: money[i] || typeof v === 'number' ? 'right' : 'left',
        wrapText: String(v ?? '').length > widths[i],
        indent: money[i] || typeof v === 'number' ? 0 : 1,
      };
      if (money[i]) cell.numFmt = '"RM" #,##0.00';
      if (k % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
      cell.border = { bottom: thin };
    });
  });
  if (!cells.length) {
    report.mergeCells(8, 1, 8, span);
    const cell = report.getCell(8, 1);
    cell.value = 'Tiada rekod bagi bulan ini.';
    cell.font = { italic: true, color: { argb: SLATE } };
    cell.alignment = { indent: 1 };
  } else {
    // Baris jumlah bagi lajur wang.
    const totalRow = report.getRow(8 + cells.length);
    totalRow.getCell(1).value = 'JUMLAH';
    money.forEach((m, i) => {
      if (!m) return;
      totalRow.getCell(i + 1).value = cells.reduce((n, row) => n + (Number(row[i]) || 0), 0);
      totalRow.getCell(i + 1).numFmt = '"RM" #,##0.00';
    });
    for (let c = 1; c <= headers.length; c++) {
      const cell = totalRow.getCell(c);
      cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: NAVY } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: IVORY } };
      cell.border = { top: { style: 'medium', color: { argb: GOLD } } };
      cell.alignment = {
        horizontal: money[c - 1] ? 'right' : 'left',
        indent: money[c - 1] ? 0 : 1,
      };
    }
    totalRow.height = 22;
  }

  // --- Helaian data mentah (untuk tapisan dan Google Sheets).
  const meta = book.addWorksheet('MAKLUMAT_LAPORAN');
  meta.addRows(reportMetadata(r));
  meta.columns = [{ width: 26 }, { width: 65 }];
  const sheet = book.addWorksheet('DATA', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.addRow(headers);
  cells.forEach((row) => sheet.addRow(row));
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, sheet.rowCount), column: headers.length },
  };
  sheet.columns.forEach((c, i) => {
    c.width = widths[i];
    if (money[i]) c.numFmt = '"RM" #,##0.00';
  });
  [meta, sheet].forEach((s) => {
    s.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    s.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    s.getRow(1).height = 28;
  });
  const summary = book.addWorksheet('RINGKASAN');
  summary.addRows([
    ['Laporan', r.title],
    ['Jumlah baris', r.rows.length],
    ['Jumlah (MYR)', r.total_sen / 100],
  ]);
  summary.getCell('B3').numFmt = '"RM" #,##0.00';
  summary.columns = [{ width: 30 }, { width: 45 }];
  return book.xlsx.writeBuffer();
}
