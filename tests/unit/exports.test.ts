import { it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildReport, toCsv, allowanceRows } from '../../src/lib/reporting';
import { toXlsx } from '../../src/lib/workbook';
import { demoData, scopeDemo } from '../../src/lib/demo';
it('creates a real XLSX with metadata, frozen header, literal cells and reconciled counts', async () => {
  const data = demoData();
  data.students[0].full_name = '=HYPERLINK("bad")';
  const report = buildReport(data, 'monthly_teaching', '2026-10', 'owner', 'Tester', true);
  const bytes = await toXlsx(report);
  expect(Buffer.from(bytes).subarray(0, 2).toString()).toBe('PK');
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes);
  const names = book.worksheets.map((s) => s.name);
  expect(names.slice(0, 2)).toEqual(['LAPORAN', 'SENARAI MURID']);
  expect(names.slice(-3)).toEqual(['MAKLUMAT_LAPORAN', 'DATA', 'RINGKASAN']);
  // Satu tab bagi setiap murid dalam laporan.
  const students = new Set(report.rows.map((row) => String(row[2])));
  expect(names.length).toBe(5 + students.size);
  expect(book.getWorksheet('DATA')!.rowCount).toBe(report.rows.length + 1);
  expect(book.getWorksheet('DATA')!.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
  const cell = book
    .getWorksheet('DATA')!
    .getColumn(3)
    .values.find((v) => String(v).includes('HYPERLINK'));
  expect(cell).toBe('\'=HYPERLINK("bad")');
  expect(toCsv(report).startsWith('\uFEFF')).toBe(true);
});
it('exports empty reports and 10,000 facts without losing rows', async () => {
  const r = buildReport(demoData(), 'attendance', '2026-12', 'owner', 'Tester', true);
  expect(r.rows).toHaveLength(0);
  r.rows = Array.from({ length: 10000 }, (_, i) => [
    '01/12/2026',
    `مُرَاجَعَةٌ ${i}`,
    'Program',
    'Hadir',
    '',
  ]);
  const b = new ExcelJS.Workbook();
  await b.xlsx.load(await toXlsx(r));
  expect(b.getWorksheet('DATA')!.rowCount).toBe(10001);
});
it('exports payable snapshots independently of planned quotas', () => {
  const data = demoData();
  const report = buildReport(data, 'tutor_allowance', '2026-10', 'owner', 'Tester', true);
  expect(report.total_sen).toBe(
    allowanceRows(data, '2026-10').reduce((n, r) => n + r.payable_sen, 0),
  );
  expect(report.total_sen).toBeGreaterThan(0);
  data.enrollments.forEach((e) => (e.planned_quota = 999));
  expect(buildReport(data, 'tutor_allowance', '2026-10', 'owner', 'Tester', true).total_sen).toBe(
    report.total_sen,
  );
});
it('guardian demo preview and export use the same scoped rows', () => {
  const data = scopeDemo(demoData(), 'guardian');
  const report = buildReport(data, 'student_fees', '2026-10', 'guardian', 'Guardian', true);
  expect(report.rows).toHaveLength(1);
  expect(report.rows[0][0]).toBe('DEMO-001');
  expect(toCsv(report)).not.toContain('DEMO-002');
  expect(data.generated_parent_comments.every((c) => c.status === 'published')).toBe(true);
});
it('admin Excel shows Malay statuses, staff names and RM amounts from integer sen', async () => {
  const data = demoData();
  const report = buildReport(data, 'tutor_allowance', '2026-10', 'admin', 'Admin', true);
  expect(report.headers).toContain('Kehadiran');
  expect(report.rows.flat()).not.toContain('demo-finance');
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await toXlsx(report));
  const sheet = book.getWorksheet('DATA')!;
  const header = sheet.getRow(1).values as string[];
  const col = header.indexOf('Layak dibayar (RM)');
  expect(col).toBeGreaterThan(0);
  expect(sheet.getRow(2).getCell(col).value).toBe(Number(report.rows[0][col - 1]) / 100);
  expect(sheet.getColumn(col).numFmt).toBe('"RM" #,##0.00');
});

it('automatic allowance: absent is paid, excused is not, no manual approval needed', () => {
  const data = demoData();
  const rows = allowanceRows(data, '2026-10');
  const sample = rows.find((r) => r.rate_sen);
  expect(sample).toBeDefined();
  const marks = data.attendance.filter((a) => a.session_id === sample!.session.id);
  marks.forEach((a) => (a.status = 'absent'));
  expect(
    allowanceRows(data, '2026-10').find((r) => r.session.id === sample!.session.id)!.payable_sen,
  ).toBe(sample!.rate_sen);
  marks.forEach((a) => (a.status = 'excused'));
  expect(
    allowanceRows(data, '2026-10').find((r) => r.session.id === sample!.session.id)!.payable_sen,
  ).toBe(0);
  data.class_sessions.forEach((x) => (x.review_status = 'reported'));
  expect(allowanceRows(data, '2026-10').length).toBe(rows.length);
});
it('payslip totals match the automatic allowance for the tutor', async () => {
  const { buildPayslip } = await import('../../src/lib/payslip');
  const data = demoData();
  const tutorId = String(data.class_sessions[0].tutor_id);
  const slip = buildPayslip(data, tutorId, '2026-10');
  const expected = allowanceRows(data, '2026-10')
    .filter((r) => r.tutorId === tutorId)
    .reduce((n, r) => n + r.payable_sen, 0);
  expect(slip.total_sen).toBe(expected);
  expect(slip.lines.reduce((n, l) => n + l.total_sen, 0)).toBe(expected);
  expect(slip.lines.reduce((n, l) => n + l.sessions, 0)).toBe(slip.sessions);
});
