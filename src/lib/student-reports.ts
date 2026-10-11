import { Dataset, Row, monthBounds, dateLabel, ORGANIZATION, formatMoney } from './core';
export type StudentSnapshot = {
  student_name: string;
  period: string;
  attendance: { date: string; class_name: string; status: string }[];
  feedback: { date: string; text: string }[];
  progress: { date: string; mastery: number; notes: string | null }[];
};
// Demo only: production snapshots are assembled by the database, never accepted from a browser.
export function demoSnapshot(data: Dataset, student: Row, period: string): StudentSnapshot {
  const { start, end } = monthBounds(period);
  const sessions = (data.class_sessions || []).filter(
    (s) =>
      String(s.starts_at) >= start &&
      String(s.starts_at) < end &&
      !['cancelled', 'rescheduled'].includes(String(s.status)),
  );
  const get = (id: unknown) => sessions.find((s) => s.id === id);
  return {
    student_name: String(student.full_name),
    period,
    attendance: (data.attendance || [])
      .filter((a) => a.student_id === student.id && get(a.session_id))
      .map((a) => ({
        date: String(get(a.session_id)!.starts_at),
        class_name: String(
          data.classes.find((c) => c.id === get(a.session_id)!.class_id)?.name || '',
        ),
        status: String(a.status),
      })),
    feedback: (data.generated_parent_comments || [])
      .filter((c) => c.student_id === student.id && c.status === 'published' && get(c.session_id))
      .map((c) => ({ date: String(get(c.session_id)!.starts_at), text: String(c.text) })),
    progress: (data.student_progress || [])
      .filter((p) => p.student_id === student.id && p.published_at && get(p.session_id))
      .map((p) => ({
        date: String(get(p.session_id)!.starts_at),
        mastery: Number(p.mastery),
        notes: String(p.parent_notes || ''),
      })),
  };
}
export function whatsappDraft(student: string, period: string, portal: string) {
  return `Assalamualaikum. Laporan pembelajaran ${student} bagi ${period} telah disemak oleh Akademi Al-Quran Ar-Riyadh (AQR). PDF dilampirkan oleh admin. Ibu bapa juga boleh melihat laporan melalui portal selamat: ${portal}. Sila log masuk menggunakan e-mel berdaftar. Terima kasih.`;
}
const attendanceLabels: Record<string, string> = {
  present: 'Hadir',
  late: 'Lewat',
  absent: 'Tidak hadir',
  excused: 'Berizin',
  makeup: 'Ganti',
};
const malayMonths = [
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
const malayDays = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
export const monthLabel = (period: string) => {
  const [year, month] = period.split('-');
  return `${malayMonths[Number(month) - 1] || month} ${year}`;
};
// Waktu Malaysia (UTC+8) tanpa bergantung pada zon masa peranti.
const klParts = (iso: string) => {
  const d = new Date(Date.parse(iso) + 8 * 3600000);
  return {
    day: malayDays[d.getUTCDay()],
    time: `${String(d.getUTCHours() % 12 || 12).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} ${d.getUTCHours() < 12 ? 'PG' : 'PTG'}`,
  };
};
const ATTENDED = ['present', 'late', 'makeup'];
const masteryWords = ['memerlukan bimbingan', 'asas', 'memuaskan', 'baik', 'sangat baik'];
// Ringkasan bertulis berdasarkan rekod sebenar sahaja (tiada markah atau dakwaan rekaan).
export function reportNarrative(snapshot: StudentSnapshot) {
  const month = monthLabel(snapshot.period);
  const total = snapshot.attendance.length;
  const attended = snapshot.attendance.filter((a) => ATTENDED.includes(a.status)).length;
  const absent = snapshot.attendance.filter((a) => a.status === 'absent').length;
  const excused = snapshot.attendance.filter((a) => a.status === 'excused').length;
  const parts: string[] = [];
  if (!total) parts.push(`Tiada kelas direkod bagi ${snapshot.student_name} sepanjang ${month}.`);
  else {
    parts.push(
      `Sepanjang ${month}, ${snapshot.student_name} telah mengikuti ${attended} daripada ${total} kelas yang direkod, iaitu kadar kehadiran ${Math.round((attended / total) * 100)}%.`,
    );
    if (absent || excused)
      parts.push(
        [absent ? `${absent} kelas tidak dihadiri` : '', excused ? `${excused} kelas berizin` : '']
          .filter(Boolean)
          .join(' dan ') + '.',
      );
  }
  const scores = snapshot.progress.map((p) => p.mastery).filter((m) => m >= 1 && m <= 5);
  if (scores.length) {
    const avg = scores.reduce((n, m) => n + m, 0) / scores.length;
    parts.push(
      `Purata tahap penguasaan ialah ${avg.toFixed(1)} daripada 5 (${masteryWords[Math.round(avg) - 1]}).`,
    );
  }
  if (snapshot.feedback.length)
    parts.push(
      `Tutor telah menulis ${snapshot.feedback.length} ulasan pembelajaran yang disertakan di bawah.`,
    );
  parts.push('Terima kasih atas sokongan ibu bapa. Teruskan latihan bersama anak di rumah.');
  return parts.join(' ');
}
export async function reportPdf(
  snapshot: StudentSnapshot,
  approved: boolean,
  demo = false,
  fontBytes?: Uint8Array,
  boldBytes?: Uint8Array,
) {
  const { PDFDocument, rgb, degrees } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // Fon setempat sahaja; tiada sumber pihak ketiga dimuatkan bersama data laporan.
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
    teal: rgb(0.227, 0.451, 0.412),
    ivory: rgb(0.973, 0.961, 0.933),
    zebra: rgb(0.984, 0.98, 0.965),
    slate: rgb(0.396, 0.443, 0.506),
    line: rgb(0.91, 0.91, 0.9),
    white: rgb(1, 1, 1),
    red: rgb(0.71, 0.14, 0.09),
    amber: rgb(0.71, 0.33, 0.04),
  };
  const W = 595.28,
    H = 841.89,
    M = 44,
    CW = W - 2 * M;
  const month = monthLabel(snapshot.period);
  type Font = typeof font;
  const wrap = (text: string, size: number, f: Font, width: number) => {
    const lines: string[] = [];
    let current = '';
    for (const word of text
      .replace(/[\r\n]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean)) {
      const next = current ? `${current} ${word}` : word;
      if (f.widthOfTextAtSize(next, size) <= width) {
        current = next;
        continue;
      }
      if (current) lines.push(current);
      current = '';
      // Perkataan panjang tanpa ruang dipotong supaya tidak melimpah halaman.
      for (const ch of word) {
        if (f.widthOfTextAtSize(current + ch, size) > width) {
          lines.push(current);
          current = '';
        }
        current += ch;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  };
  let page = doc.addPage([W, H]);
  let y = H;
  const text = (t: string, x: number, yy: number, size: number, f: Font = font, color = C.navy) =>
    page.drawText(t, { x, y: yy, size, font: f, color });
  const right = (t: string, xr: number, yy: number, size: number, f: Font = font, color = C.navy) =>
    text(t, xr - f.widthOfTextAtSize(t, size), yy, size, f, color);
  const continuationHeader = () => {
    page.drawRectangle({ x: 0, y: H - 34, width: W, height: 34, color: C.navy });
    text('AQR · Laporan Pembelajaran Bulanan', M, H - 22, 9, bold, C.white);
    right(`${snapshot.student_name} · ${month}`, W - M, H - 22, 9, font, C.white);
    y = H - 60;
  };
  const ensure = (space: number) => {
    if (y - space < 70) {
      page = doc.addPage([W, H]);
      continuationHeader();
      return true;
    }
    return false;
  };
  const section = (title: string) => {
    ensure(40);
    y -= 8;
    text(title, M, y, 13, bold);
    page.drawRectangle({ x: M, y: y - 7, width: 28, height: 2.5, color: C.gold });
    y -= 22;
  };
  // --- Jalur tajuk
  page.drawRectangle({ x: 0, y: H - 112, width: W, height: 112, color: C.navy });
  page.drawRectangle({ x: 0, y: H - 116, width: W, height: 4, color: C.gold });
  text('AKADEMI AL-QURAN AR-RIYADH', M, H - 40, 9, bold, C.gold);
  text('Laporan Pembelajaran Bulanan', M, H - 68, 21, bold, C.white);
  text(
    'Rekod kehadiran dan perkembangan individu murid',
    M,
    H - 88,
    9.5,
    font,
    rgb(0.8, 0.84, 0.88),
  );
  right(month, W - M, H - 52, 14, bold, C.white);
  const badge = demo ? 'DEMO' : approved ? 'DILULUSKAN' : 'DRAF';
  const bw = bold.widthOfTextAtSize(badge, 8.5) + 18;
  page.drawRectangle({
    x: W - M - bw,
    y: H - 84,
    width: bw,
    height: 18,
    color: approved && !demo ? C.teal : C.gold,
  });
  text(badge, W - M - bw + 9, H - 78, 8.5, bold, C.white);
  y = H - 140;
  // --- Kad murid
  const programs = [
    ...new Set(
      snapshot.attendance.map(
        (a) => a.class_name.split(' · ').slice(1).join(' · ') || a.class_name,
      ),
    ),
  ].filter(Boolean);
  page.drawRectangle({
    x: M,
    y: y - 64,
    width: CW,
    height: 64,
    color: C.ivory,
    borderColor: C.line,
    borderWidth: 0.8,
  });
  page.drawRectangle({ x: M, y: y - 64, width: 4, height: 64, color: C.gold });
  text('NAMA MURID', M + 18, y - 18, 7.5, bold, C.slate);
  text(snapshot.student_name, M + 18, y - 38, 16, bold);
  text('PROGRAM', M + 310, y - 18, 7.5, bold, C.slate);
  wrap(programs.join(', ') || '—', 11, bold, CW - 330)
    .slice(0, 2)
    .forEach((l, i) => text(l, M + 310, y - 36 - i * 14, 11, bold));
  y -= 86;
  // --- Kotak ringkasan
  const total = snapshot.attendance.length;
  const attended = snapshot.attendance.filter((a) => ATTENDED.includes(a.status)).length;
  const tiles: [string, string][] = [
    ['KELAS DIREKOD', String(total)],
    ['HADIR', String(attended)],
    ['KADAR KEHADIRAN', total ? `${Math.round((attended / total) * 100)}%` : '—'],
    ['ULASAN TUTOR', String(snapshot.feedback.length)],
  ];
  const tw = (CW - 3 * 10) / 4;
  tiles.forEach(([label, value], i) => {
    const x = M + i * (tw + 10);
    page.drawRectangle({
      x,
      y: y - 58,
      width: tw,
      height: 58,
      color: C.white,
      borderColor: C.line,
      borderWidth: 0.8,
    });
    text(label, x + 12, y - 18, 7.5, bold, C.slate);
    text(value, x + 12, y - 44, 20, bold, i === 2 ? C.teal : C.navy);
  });
  y -= 82;
  // --- Ringkasan bertulis
  section('Ringkasan');
  for (const l of wrap(reportNarrative(snapshot), 10.5, font, CW)) {
    ensure(16);
    text(l, M, y, 10.5, font);
    y -= 16;
  }
  y -= 10;
  // --- Jadual kehadiran
  section('Rekod kehadiran');
  const cols: [string, number][] = [
    ['BIL', 32],
    ['TARIKH', 78],
    ['HARI', 64],
    ['MASA', 66],
    ['PROGRAM', CW - 32 - 78 - 64 - 66 - 84],
    ['KEHADIRAN', 84],
  ];
  const tableHeader = () => {
    page.drawRectangle({ x: M, y: y - 8, width: CW, height: 22, color: C.ivory });
    let x = M + 8;
    cols.forEach(([h, w]) => {
      text(h, x, y, 7.5, bold, C.slate);
      x += w;
    });
    y -= 24;
  };
  if (!snapshot.attendance.length) {
    text('Tiada rekod kehadiran bagi bulan ini.', M, y, 10.5, font, C.slate);
    y -= 20;
  } else {
    tableHeader();
    snapshot.attendance.forEach((a, i) => {
      if (ensure(22)) tableHeader();
      if (i % 2) page.drawRectangle({ x: M, y: y - 7, width: CW, height: 21, color: C.zebra });
      const { day, time } = klParts(a.date);
      const status = attendanceLabels[a.status] || a.status;
      const program = a.class_name.split(' · ').slice(1).join(' · ') || a.class_name;
      const values = [String(i + 1), dateLabel(a.date), day, time, program, status];
      let x = M + 8;
      values.forEach((v, k) => {
        const [, w] = cols[k];
        const clipped = wrap(v, 9.5, k === 5 ? bold : font, w - 10)[0];
        const color =
          k === 5
            ? a.status === 'absent'
              ? C.red
              : a.status === 'excused'
                ? C.slate
                : a.status === 'late'
                  ? C.amber
                  : C.teal
            : C.navy;
        text(clipped, x, y, 9.5, k === 5 ? bold : font, color);
        x += w;
      });
      page.drawLine({
        start: { x: M, y: y - 7 },
        end: { x: M + CW, y: y - 7 },
        thickness: 0.5,
        color: C.line,
      });
      y -= 21;
    });
  }
  y -= 12;
  // --- Ulasan tutor
  section('Ulasan pembelajaran tutor');
  if (!snapshot.feedback.length) {
    text('Belum ada ulasan diterbitkan bagi bulan ini.', M, y, 10.5, font, C.slate);
    y -= 20;
  }
  snapshot.feedback.forEach((f) => {
    const lines = wrap(f.text, 10, font, CW - 18);
    ensure(20 + lines.length * 14);
    const top = y + 10;
    const { day } = klParts(f.date);
    text(`${day}, ${dateLabel(f.date)}`, M + 12, y, 8.5, bold, C.slate);
    y -= 15;
    lines.forEach((l) => {
      text(l, M + 12, y, 10, font);
      y -= 14;
    });
    page.drawRectangle({ x: M, y: y + 8, width: 2.5, height: top - (y + 8), color: C.gold });
    y -= 10;
  });
  // --- Perkembangan individu (jika ada)
  if (snapshot.progress.length) {
    y -= 4;
    section('Perkembangan individu');
    snapshot.progress.forEach((p) => {
      ensure(18);
      text(dateLabel(p.date), M, y, 9.5, bold, C.slate);
      text(`Tahap ${p.mastery}/5 · ${masteryWords[p.mastery - 1] || ''}`, M + 90, y, 9.5, bold);
      if (p.notes) text(wrap(p.notes, 9.5, font, CW - 260)[0], M + 260, y, 9.5, font, C.slate);
      y -= 18;
    });
  }
  // --- Pengaki, penanda draf dan nombor halaman pada setiap halaman
  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    if (!approved)
      pg.drawText('DRAF', {
        x: 150,
        y: 330,
        size: 120,
        font: bold,
        color: C.gold,
        opacity: 0.08,
        rotate: degrees(35),
      });
    pg.drawLine({
      start: { x: M, y: 48 },
      end: { x: W - M, y: 48 },
      thickness: 0.6,
      color: C.line,
    });
    pg.drawText('Akademi Al-Quran Ar-Riyadh · Dokumen sulit untuk ibu bapa / penjaga', {
      x: M,
      y: 32,
      size: 8,
      font,
      color: C.slate,
    });
    const label = `Halaman ${i + 1} / ${pages.length}`;
    pg.drawText(label, {
      x: W - M - font.widthOfTextAtSize(label, 8),
      y: 32,
      size: 8,
      font,
      color: C.slate,
    });
  });
  doc.setTitle(`Laporan ${snapshot.student_name} ${month}`);
  doc.setAuthor(ORGANIZATION);
  return new Uint8Array(await doc.save());
}
export async function reportsZip(reports: Row[], demo: boolean) {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  for (const r of reports) {
    if (r.status !== 'approved') continue;
    zip.file(
      `AQR_${r.period}_${r.student_id}.pdf`,
      await reportPdf(r.snapshot as StudentSnapshot, true, demo),
    );
  }
  return zip.generateAsync({ type: 'blob' });
}

export async function financialPdf(record: Row, type: 'invoice' | 'receipt', demo: boolean) {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(
    await (await fetch(new URL('fonts/report-latin.woff', document.baseURI))).arrayBuffer(),
    { subset: true },
  );
  const page = doc.addPage([595.28, 841.89]);
  const amount =
    type === 'invoice'
      ? Number(record.total_sen)
      : Number((record.details as Record<string, unknown>)?.amount_sen || 0);
  const lines = [
    ORGANIZATION,
    `${demo ? 'DEMO FIKSYEN | ' : ''}${type === 'invoice' ? 'INVOIS' : 'RESIT'}`,
    `Nombor: ${record.number}`,
    `Jumlah: ${formatMoney(amount)}`,
    `Status: ${record.status}`,
    'MYR | Asia/Kuala_Lumpur',
  ];
  lines.forEach((text, i) =>
    page.drawText(text, {
      x: 44,
      y: 780 - i * 42,
      size: i === 0 ? 16 : 12,
      font,
      color: rgb(0.09, 0.16, 0.26),
    }),
  );
  return new Uint8Array(await doc.save());
}
