import ExcelJS from 'exceljs';
import { ORGANIZATION, safeCell } from './core';
import { Report, reportMetadata } from './reporting';

const NAVY = 'FF182942';
const GOLD = 'FFAD9461';
const IVORY = 'FFF8F5EE';
const ZEBRA = 'FFFBFAF6';
const LINE = 'FFE3E1DA';
const SLATE = 'FF657181';
const TEAL = 'FF3A7369';
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
type Cell = string | number;
const RESERVED = ['LAPORAN', 'SENARAI MURID', 'MAKLUMAT_LAPORAN', 'DATA', 'RINGKASAN'];

// Nama tab Excel: maks 31 aksara, tiada []:*?/\ dan unik.
function sheetName(raw: string, used: Set<string>) {
  const base =
    raw
      .replace(/[[\]:*?/\\]/g, ' ')
      // Tab tidak boleh bermula/berakhir dengan ' (nilai yang dilindungi daripada formula).
      .replace(/^[\s'=+\-@]+|['\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 28) || 'Murid';
  let name = base;
  for (let n = 2; used.has(name.toUpperCase()); n++) name = `${base.slice(0, 26)} ${n}`;
  used.add(name.toUpperCase());
  return name;
}

// Helaian bertajuk, sedia cetak: jalur tajuk, baris maklumat, jadual selang-seli dan baris JUMLAH.
function formattedSheet(
  book: ExcelJS.Workbook,
  name: string,
  title: string,
  subtitle: string,
  info: string,
  headers: string[],
  cells: Cell[][],
  money: boolean[],
) {
  const widths = headers.map((h, i) =>
    Math.min(
      h === 'Ulasan' || h === 'Ulasan tutor' ? 60 : 44,
      Math.max(12, h.length + 4, ...cells.map((row) => String(row[i] ?? '').length + 2)),
    ),
  );
  const span = Math.max(headers.length, 4);
  const sheet = book.addWorksheet(name, {
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
    headerFooter: { oddFooter: `&L&8${ORGANIZATION} · Sulit&R&8Halaman &P / &N` },
  });
  sheet.columns = widths.map((width) => ({ width }));
  const band = (row: number, value: string, size: number, color: string, fill?: string) => {
    sheet.mergeCells(row, 1, row, span);
    const cell = sheet.getCell(row, 1);
    cell.value = value;
    cell.font = { name: 'Calibri', size, bold: size >= 11, color: { argb: color } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  };
  band(1, 'AKADEMI AL-QURAN AR-RIYADH', 9, GOLD, NAVY);
  band(2, title, 18, 'FFFFFFFF', NAVY);
  band(3, subtitle, 11, 'FFFFFFFF', NAVY);
  sheet.getRow(1).height = 20;
  sheet.getRow(2).height = 30;
  sheet.getRow(3).height = 22;
  for (let c = 1; c <= span; c++)
    sheet.getCell(4, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
  sheet.getRow(4).height = 4;
  band(5, info, 10, SLATE);
  sheet.getRow(5).height = 22;
  const head = sheet.getRow(7);
  headers.forEach((h, i) => {
    const cell = head.getCell(i + 1);
    cell.value = h.toUpperCase();
    cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { vertical: 'middle', horizontal: money[i] ? 'right' : 'left', indent: 1 };
  });
  head.height = 24;
  cells.forEach((values, k) => {
    const row = sheet.getRow(8 + k);
    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      const numeric = money[i] || typeof v === 'number';
      cell.value = v;
      cell.font = { name: 'Calibri', size: 10.5, color: { argb: NAVY } };
      cell.alignment = {
        vertical: 'top',
        horizontal: numeric ? 'right' : 'left',
        wrapText: String(v ?? '').length > widths[i],
        indent: numeric ? 0 : 1,
      };
      if (money[i]) cell.numFmt = '"RM" #,##0.00';
      if (k % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
      cell.border = { bottom: thin };
    });
  });
  if (!cells.length) {
    sheet.mergeCells(8, 1, 8, span);
    const cell = sheet.getCell(8, 1);
    cell.value = 'Tiada rekod bagi bulan ini.';
    cell.font = { italic: true, color: { argb: SLATE } };
    cell.alignment = { indent: 1 };
    return sheet;
  }
  const totalRow = sheet.getRow(8 + cells.length);
  totalRow.getCell(1).value = `JUMLAH · ${cells.length} rekod`;
  money.forEach((m, i) => {
    if (!m || i === 0) return;
    totalRow.getCell(i + 1).value = cells.reduce((n, row) => n + (Number(row[i]) || 0), 0);
    totalRow.getCell(i + 1).numFmt = '"RM" #,##0.00';
  });
  for (let c = 1; c <= headers.length; c++) {
    const cell = totalRow.getCell(c);
    cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: NAVY } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: IVORY } };
    cell.border = { top: { style: 'medium', color: { argb: GOLD } } };
    cell.alignment = { horizontal: money[c - 1] ? 'right' : 'left', indent: money[c - 1] ? 0 : 1 };
  }
  totalRow.height = 22;
  return sheet;
}

export async function toXlsx(r: Report) {
  const book = new ExcelJS.Workbook();
  book.creator = ORGANIZATION;
  book.created = new Date(r.generated_at);
  // Lajur wang disimpan sebagai integer sen; Excel memaparkannya sebagai nombor RM dua perpuluhan.
  const money = r.headers.map((h) => h.includes('(sen)'));
  const headers = r.headers.map((h) => h.replace('(sen)', '(RM)'));
  const cells: Cell[][] = r.rows.map((row) =>
    row.map((v, i) => (money[i] && typeof v === 'number' ? v / 100 : (safeCell(v) as Cell))),
  );
  const subtitle = `Bulan: ${monthLabel(r.month)}`;
  const info = `${r.rows.length} rekod${money.some(Boolean) ? ` · Jumlah RM ${(r.total_sen / 100).toFixed(2)}` : ''} · Dijana ${klStamp(r.generated_at)} oleh ${r.generated_by}${r.demo ? ' · DATA DEMO' : ''}`;

  // --- Helaian LAPORAN (keseluruhan).
  formattedSheet(book, 'LAPORAN', r.title, subtitle, info, headers, cells, money);

  // --- Satu tab bagi setiap murid, supaya mudah dirujuk; ditambah senarai murid berpautan.
  const groupIdx = headers.findIndex((h) => h === 'Murid · Program' || h === 'Murid');
  // Had tab murid supaya fail kekal ringan (≥400 murid masih muat).
  const MAX_STUDENT_TABS = 500;
  const groupCount =
    groupIdx >= 0 ? new Set(cells.map((row) => String(row[groupIdx] ?? '—'))).size : 0;
  if (groupIdx >= 0 && cells.length && groupCount <= MAX_STUDENT_TABS) {
    const groups = new Map<string, Cell[][]>();
    cells.forEach((row) => {
      const key = String(row[groupIdx] ?? '—');
      groups.set(key, [...(groups.get(key) || []), row]);
    });
    const keys = [...groups.keys()].sort((a, b) => a.localeCompare(b));
    const used = new Set(RESERVED);
    const names = new Map(keys.map((k) => [k, sheetName(k, used)]));
    const statusIdx = headers.findIndex((h) => h === 'Kehadiran' || h === 'Status');
    const subHeaders = headers.filter((_, i) => i !== groupIdx);
    const subMoney = money.filter((_, i) => i !== groupIdx);
    // Senarai murid dengan pautan ke tab masing-masing.
    const index = book.addWorksheet('SENARAI MURID', {
      views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
    });
    index.columns = [{ width: 44 }, { width: 12 }, { width: 46 }, { width: 18 }];
    index.mergeCells(1, 1, 1, 4);
    index.getCell(1, 1).value = `Senarai murid · ${r.title} · ${monthLabel(r.month)}`;
    index.getCell(1, 1).font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    index.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    index.getCell(1, 1).alignment = { vertical: 'middle', indent: 1 };
    index.getRow(1).height = 30;
    const hasMoney = money.some(Boolean);
    ['MURID', 'REKOD', 'RINGKASAN', hasMoney ? 'JUMLAH (RM)' : ''].forEach((h, i) => {
      const cell = index.getCell(3, i + 1);
      cell.value = h;
      cell.font = { bold: true, size: 9.5, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      cell.alignment = { indent: 1, vertical: 'middle' };
    });
    index.getRow(3).height = 22;
    keys.forEach((key, k) => {
      const rows = groups.get(key)!;
      const counts = new Map<string, number>();
      if (statusIdx >= 0)
        rows.forEach((row) =>
          counts.set(String(row[statusIdx]), (counts.get(String(row[statusIdx])) || 0) + 1),
        );
      const summary = [...counts.entries()].map(([s, n]) => `${s} ${n}`).join(' · ');
      const total = money.reduce(
        (sum, m, i) => (m ? sum + rows.reduce((n, row) => n + (Number(row[i]) || 0), 0) : sum),
        0,
      );
      const name = names.get(key)!;
      formattedSheet(
        book,
        name,
        key,
        `${r.title} · ${monthLabel(r.month)}`,
        `${rows.length} rekod${summary ? ` · ${summary}` : ''}${hasMoney ? ` · Jumlah RM ${total.toFixed(2)}` : ''}`,
        subHeaders,
        rows.map((row) => row.filter((_, i) => i !== groupIdx)),
        subMoney,
      );
      const line = index.getRow(4 + k);
      line.getCell(1).value = { text: key, hyperlink: `#'${name.replace(/'/g, "''")}'!A1` };
      line.getCell(1).font = { color: { argb: TEAL }, underline: true };
      line.getCell(2).value = rows.length;
      line.getCell(3).value = summary || '—';
      if (hasMoney) {
        line.getCell(4).value = total;
        line.getCell(4).numFmt = '"RM" #,##0.00';
      }
      for (let c = 1; c <= 4; c++) {
        line.getCell(c).border = { bottom: thin };
        line.getCell(c).alignment = { indent: c === 2 || c === 4 ? 0 : 1, vertical: 'middle' };
        if (k % 2)
          line.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
      }
    });
    // Letak senarai murid terus selepas LAPORAN (ExcelJS menyusun tab mengikut orderNo).
    const order = (w: ExcelJS.Worksheet) => w as unknown as { orderNo: number };
    order(index).orderNo = order(book.getWorksheet('LAPORAN')!).orderNo + 0.5;
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
    c.width = Math.min(44, Math.max(12, headers[i].length + 4));
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
