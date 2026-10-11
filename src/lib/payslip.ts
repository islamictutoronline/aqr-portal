import { Dataset, ORGANIZATION, Rate, formatMoney, dateLabel, fileName } from './core';
import { allowanceRows } from './reporting';
import { monthLabel } from './student-reports';

export type PayslipLine = { label: string; rate_sen: number; sessions: number; total_sen: number };
export type Payslip = {
  tutorId: string;
  tutorName: string;
  month: string;
  jobTitle: string;
  department: string;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  lines: PayslipLine[];
  sessions: number;
  total_sen: number;
};

// Penyata pendapatan tutor: satu baris bagi setiap program × tempoh yang ada sesi dibayar,
// dikira daripada elaun automatik (sesi selesai; Berizin tidak dibayar).
export function buildPayslip(data: Dataset, tutorId: string, month: string): Payslip {
  const all = (t: string) => data[t] || [];
  const rows = allowanceRows(data, month).filter((r) => r.tutorId === tutorId && r.payable_sen > 0);
  const programOf = (classId: unknown) => {
    const cls = all('classes').find((c) => c.id === classId);
    return all('programs').find((p) => p.id === cls?.program_id);
  };
  const lastDay = `${month}-28`;
  const rates = (all('tutor_allowance_rates') as unknown as Rate[]).filter(
    (r) =>
      String(r.effective_from) <= lastDay && (!r.effective_to || r.effective_to >= `${month}-01`),
  );
  const lines: PayslipLine[] = rates.map((rate) => {
    const program = all('programs').find((p) => p.code === rate.program_code);
    const matched = rows.filter(
      (r) =>
        programOf(r.session.class_id)?.code === rate.program_code &&
        r.minutes === rate.duration_minutes,
    );
    return {
      label: `${String(program?.name || rate.program_code)} (${rate.duration_minutes} minit)`,
      rate_sen: Number(rate.amount_sen),
      sessions: matched.length,
      total_sen: matched.reduce((n, r) => n + r.payable_sen, 0),
    };
  });
  // Sesi berbayar yang kadarnya tiada dalam senarai semasa (cth. kadar lama) dikumpulkan sebagai Lain-lain.
  const counted = lines.reduce((n, l) => n + l.sessions, 0);
  if (counted < rows.length) {
    const rest = rows.filter(
      (r) =>
        !rates.some(
          (rate) =>
            programOf(r.session.class_id)?.code === rate.program_code &&
            r.minutes === rate.duration_minutes,
        ),
    );
    lines.push({
      label: 'Lain-lain',
      rate_sen: 0,
      sessions: rest.length,
      total_sen: rest.reduce((n, r) => n + r.payable_sen, 0),
    });
  }
  // Hanya baris yang ada sesi bagi tutor ini (tiada senarai program kosong).
  const used = lines.filter((l) => l.sessions > 0);
  const details: Record<string, unknown> =
    all('tutor_payment_details').find((d) => d.staff_id === tutorId) || {};
  return {
    tutorId,
    tutorName: String(all('staff_profiles').find((s) => s.id === tutorId)?.display_name || 'Tutor'),
    month,
    jobTitle: String(details.job_title || 'Guru Online Part Time'),
    department: String(details.department || 'Al-Quran'),
    bankName: String(details.bank_name || ''),
    accountHolder: String(details.account_holder || ''),
    accountNumber: String(details.account_number || ''),
    lines: used,
    sessions: rows.length,
    total_sen: rows.reduce((n, r) => n + r.payable_sen, 0),
  };
}

export async function payslipPdf(
  slip: Payslip,
  payDate: string,
  org: { phone?: string; address?: string } = {},
  fontBytes?: Uint8Array,
  boldBytes?: Uint8Array,
) {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const load = async (file: string) =>
    new Uint8Array(await (await fetch(new URL(`fonts/${file}`, document.baseURI))).arrayBuffer());
  const regularBytes = fontBytes || (await load('report-latin.woff'));
  const font = await doc.embedFont(regularBytes, { subset: true });
  const bold = await doc.embedFont(
    boldBytes || (fontBytes ? regularBytes : await load('report-latin-bold.woff')),
    { subset: true },
  );
  const C = {
    navy: rgb(0.094, 0.161, 0.259),
    gold: rgb(0.678, 0.58, 0.38),
    ivory: rgb(0.973, 0.961, 0.933),
    zebra: rgb(0.984, 0.98, 0.965),
    slate: rgb(0.396, 0.443, 0.506),
    line: rgb(0.91, 0.91, 0.9),
    white: rgb(1, 1, 1),
    muted: rgb(0.8, 0.84, 0.88),
  };
  const W = 595.28,
    H = 841.89,
    M = 44,
    CW = W - 2 * M;
  const page = doc.addPage([W, H]);
  type Font = typeof font;
  const text = (t: string, x: number, y: number, size: number, f: Font = font, color = C.navy) =>
    page.drawText(t, { x, y, size, font: f, color });
  const right = (t: string, xr: number, y: number, size: number, f: Font = font, color = C.navy) =>
    text(t, xr - f.widthOfTextAtSize(t, size), y, size, f, color);
  const fit = (t: string, size: number, f: Font, width: number) => {
    let v = t;
    while (v && f.widthOfTextAtSize(v, size) > width) v = v.slice(0, -1);
    return v === t ? t : `${v.slice(0, -1)}…`;
  };
  // --- Jalur tajuk
  page.drawRectangle({ x: 0, y: H - 112, width: W, height: 112, color: C.navy });
  page.drawRectangle({ x: 0, y: H - 116, width: W, height: 4, color: C.gold });
  text('AKADEMI AL-QURAN AR-RIYADH', M, H - 40, 9, bold, C.gold);
  text('Penyata Pendapatan', M, H - 68, 22, bold, C.white);
  text(`Bulan ${monthLabel(slip.month)}`, M, H - 88, 10, font, C.muted);
  const badge = 'SULIT';
  const bw = bold.widthOfTextAtSize(badge, 14) + 30;
  page.drawRectangle({ x: W - M - bw, y: H - 82, width: bw, height: 32, color: C.gold });
  text(badge, W - M - bw + 15, H - 71, 14, bold, C.white);
  // --- Maklumat tutor
  let y = H - 140;
  page.drawRectangle({
    x: M,
    y: y - 70,
    width: CW,
    height: 70,
    color: C.ivory,
    borderColor: C.line,
    borderWidth: 0.8,
  });
  page.drawRectangle({ x: M, y: y - 70, width: 4, height: 70, color: C.gold });
  const field = (label: string, value: string, x: number, yy: number, width: number) => {
    text(label.toUpperCase(), x, yy, 7.5, bold, C.slate);
    text(fit(value || '—', 11, bold, width), x, yy - 16, 11, bold);
  };
  field('Nama', slip.tutorName, M + 18, y - 18, 240);
  field('Jawatan', slip.jobTitle, M + 280, y - 18, 220);
  field('Jabatan', slip.department, M + 18, y - 50 + 4, 240);
  text('BULAN', M + 280, y - 46, 7.5, bold, C.slate);
  text(monthLabel(slip.month), M + 280, y - 62, 11, bold);
  y -= 96;
  // --- Jadual butiran
  const cols: [string, number, 'l' | 'r'][] = [
    ['BUTIRAN', CW - 110 - 110 - 110, 'l'],
    ['HARGA', 110, 'r'],
    ['BILANGAN SESI', 110, 'r'],
    ['JUMLAH', 110, 'r'],
  ];
  page.drawRectangle({ x: M, y: y - 9, width: CW, height: 26, color: C.navy });
  let x = M;
  cols.forEach(([h, w, align]) => {
    if (align === 'l') text(h, x + 12, y, 8, bold, C.white);
    else right(h, x + w - 12, y, 8, bold, C.white);
    x += w;
  });
  y -= 26;
  if (!slip.lines.length) {
    text('Tiada sesi dibayar bagi bulan ini.', M + 12, y, 10, font, C.slate);
    y -= 24;
  }
  slip.lines.forEach((l, i) => {
    if (i % 2) page.drawRectangle({ x: M, y: y - 8, width: CW, height: 24, color: C.zebra });
    const muted = l.sessions === 0;
    const color = muted ? C.slate : C.navy;
    const values = [
      l.label,
      l.rate_sen ? formatMoney(l.rate_sen) : '—',
      String(l.sessions),
      formatMoney(l.total_sen),
    ];
    let cx = M;
    values.forEach((v, k) => {
      const [, w, align] = cols[k];
      const f = k === 3 && !muted ? bold : font;
      if (align === 'l') text(fit(v, 10, f, w - 24), cx + 12, y, 10, f, color);
      else right(v, cx + w - 12, y, 10, f, color);
      cx += w;
    });
    page.drawLine({
      start: { x: M, y: y - 8 },
      end: { x: M + CW, y: y - 8 },
      thickness: 0.5,
      color: C.line,
    });
    y -= 24;
  });
  page.drawRectangle({ x: M, y: y - 10, width: CW, height: 28, color: C.ivory });
  page.drawRectangle({ x: M, y: y + 17, width: CW, height: 1.5, color: C.gold });
  text('JUMLAH', M + 12, y, 10, bold);
  right(String(slip.sessions), M + CW - 110 - 12, y, 10, bold);
  right(formatMoney(slip.total_sen), M + CW - 12, y, 10, bold);
  y -= 46;
  // --- Maklumat bayaran & pendapatan bersih
  const boxH = 104;
  const leftW = CW * 0.58;
  page.drawRectangle({
    x: M,
    y: y - boxH,
    width: leftW - 10,
    height: boxH,
    color: C.white,
    borderColor: C.line,
    borderWidth: 0.8,
  });
  text('MAKLUMAT BAYARAN', M + 16, y - 20, 8, bold, C.slate);
  const rows: [string, string][] = [
    ['Tarikh bayaran', payDate ? dateLabel(`${payDate}T04:00:00Z`) : '—'],
    ['Nama bank', slip.bankName || '—'],
    ['Nama pemegang akaun', slip.accountHolder || '—'],
    ['No. akaun', slip.accountNumber || '—'],
  ];
  rows.forEach(([k, v], i) => {
    text(k, M + 16, y - 40 - i * 16, 9.5, font, C.slate);
    text(fit(v, 9.5, bold, leftW - 170), M + 150, y - 40 - i * 16, 9.5, bold);
  });
  const rx = M + leftW;
  const rw = CW - leftW;
  page.drawRectangle({ x: rx, y: y - boxH, width: rw, height: boxH, color: C.navy });
  text('PENDAPATAN BERSIH', rx + 18, y - 24, 8.5, bold, C.gold);
  text(formatMoney(slip.total_sen), rx + 18, y - 62, 24, bold, C.white);
  text(`${slip.sessions} sesi dibayar`, rx + 18, y - 84, 9, font, C.muted);
  y -= boxH + 30;
  text(
    'Elaun dikira automatik daripada sesi yang direkod: Hadir, Lewat, Ganti dan Tidak hadir dibayar; Berizin tidak dibayar.',
    M,
    y,
    8,
    font,
    C.slate,
  );
  // --- Pengaki organisasi
  page.drawLine({
    start: { x: M, y: 64 },
    end: { x: W - M, y: 64 },
    thickness: 0.6,
    color: C.line,
  });
  text(ORGANIZATION, M, 48, 8.5, bold);
  const contact = [org.phone, org.address].filter(Boolean).join(' · ');
  if (contact) text(fit(contact, 8, font, CW * 0.7), M, 35, 8, font, C.slate);
  right('Dokumen sulit · dijana oleh portal AQR', W - M, 48, 8, font, C.slate);
  doc.setTitle(`Penyata Pendapatan ${slip.tutorName} ${monthLabel(slip.month)}`);
  doc.setAuthor(ORGANIZATION);
  return new Uint8Array(await doc.save());
}

export const payslipFileName = (s: Payslip) =>
  fileName(['Payslip', s.tutorName, monthLabel(s.month)], 'pdf');
export async function payslipsZip(
  slips: Payslip[],
  payDate: string,
  org: { phone?: string; address?: string },
) {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  for (const s of slips) zip.file(payslipFileName(s), await payslipPdf(s, payDate, org));
  return zip.generateAsync({ type: 'blob' });
}
