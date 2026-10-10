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
export async function reportPdf(
  snapshot: StudentSnapshot,
  approved: boolean,
  demo = false,
  fontBytes?: Uint8Array,
) {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // Embed a local font rather than loading any third-party resource containing report data.
  const bytes =
    fontBytes ||
    new Uint8Array(
      await (await fetch(new URL('fonts/report-latin.woff', document.baseURI))).arrayBuffer(),
    );
  const font = await doc.embedFont(bytes, { subset: true });
  let page = doc.addPage([595.28, 841.89]);
  let y = 790;
  let pageNumber = 0;
  function footer() {
    pageNumber++;
    page.drawText(`AQR | ${snapshot.period} | ${pageNumber}`, {
      x: 44,
      y: 28,
      size: 9,
      font,
      color: rgb(0.35, 0.4, 0.45),
    });
  }
  function line(text: string, size = 11) {
    const words = text.replace(/[\r\n]+/g, ' ').split(/\s+/);
    let current = '';
    const draw = (value: string) => {
      if (y < 65) {
        footer();
        page = doc.addPage([595.28, 841.89]);
        y = 790;
      }
      page.drawText(value, { x: 44, y, size, font, color: rgb(0.09, 0.16, 0.26) });
      y -= size + 9;
    };
    for (const word of words) {
      if (font.widthOfTextAtSize(current + ' ' + word, size) > 500 && current) {
        draw(current);
        current = '';
      }
      // Bound unbroken text too, so imported/typed names cannot overflow the page.
      for (const char of word) {
        if (font.widthOfTextAtSize(current + char, size) > 500) {
          draw(current);
          current = '';
        }
        current += char;
      }
      current += ' ';
    }
    if (current.trim()) draw(current.trim());
  }
  line(ORGANIZATION, 16);
  line(
    `${demo ? 'DEMO FIKSYEN | ' : ''}${approved ? 'LAPORAN DILULUSKAN' : 'DRAF UNTUK SEMAKAN'}`,
    10,
  );
  y -= 10;
  line(snapshot.student_name, 18);
  line(`Laporan pembelajaran bulanan | ${snapshot.period}`);
  y -= 10;
  line('Kehadiran kelas', 14);
  if (!snapshot.attendance.length) line('Tiada rekod kehadiran bagi bulan ini.');
  snapshot.attendance.forEach((a) =>
    line(`${dateLabel(a.date)} | ${a.class_name} | ${attendanceLabels[a.status] || a.status}`),
  );
  y -= 12;
  line('Ulasan pembelajaran tutor', 14);
  if (!snapshot.feedback.length) line('Belum ada ulasan diterbitkan bagi bulan ini.');
  snapshot.feedback.forEach((f) => {
    line(dateLabel(f.date), 10);
    line(f.text);
    y -= 6;
  });
  line('Perkembangan individu', 14);
  if (!snapshot.progress.length) line('Bukti penilaian unit belum mencukupi.');
  snapshot.progress.forEach((p) =>
    line(`${dateLabel(p.date)} | Tahap penguasaan: ${p.mastery}/5 | ${p.notes || ''}`),
  );
  footer();
  doc.setTitle(`Laporan AQR ${snapshot.period}`);
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
