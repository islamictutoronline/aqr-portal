import ExcelJS from 'exceljs';
import { ORGANIZATION, safeCell } from './core';
import { Report, reportMetadata } from './reporting';
export async function toXlsx(r: Report) {
  const book = new ExcelJS.Workbook();
  book.creator = ORGANIZATION;
  book.created = new Date(r.generated_at);
  const meta = book.addWorksheet('MAKLUMAT_LAPORAN');
  meta.addRows(reportMetadata(r));
  meta.columns = [{ width: 26 }, { width: 65 }];
  const sheet = book.addWorksheet('DATA', { views: [{ state: 'frozen', ySplit: 1 }] });
  // Lajur wang disimpan sebagai integer sen; Excel memaparkannya sebagai nombor RM dua perpuluhan.
  const money = r.headers.map((h) => h.includes('(sen)'));
  sheet.addRow(r.headers.map((h) => h.replace('(sen)', '(RM)')));
  r.rows.forEach((row) =>
    sheet.addRow(row.map((v, i) => (money[i] && typeof v === 'number' ? v / 100 : safeCell(v)))),
  );
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, sheet.rowCount), column: r.headers.length },
  };
  sheet.columns.forEach((c, i) => {
    c.width = Math.min(50, Math.max(18, r.headers[i].length + 4));
    if (money[i]) c.numFmt = '"RM" #,##0.00';
  });
  [meta, sheet].forEach((s) => {
    s.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    s.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF182942' } };
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
