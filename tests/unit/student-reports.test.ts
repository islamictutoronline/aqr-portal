import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { demoData } from '../../src/lib/demo';
import { demoSnapshot, reportPdf, whatsappDraft } from '../../src/lib/student-reports';
describe('Individual learning reports', () => {
  it('uses only one child and one MYT month, with no draft feedback', () => {
    const d = demoData();
    const student = d.students[0];
    const s = demoSnapshot(d, student, '2026-10');
    expect(s.student_name).toBe(student.full_name);
    expect(
      s.feedback.every((f) =>
        d.generated_parent_comments.some(
          (c) => c.student_id === student.id && c.status === 'published' && c.text === f.text,
        ),
      ),
    ).toBe(true);
    expect(demoSnapshot(d, student, '2020-01').attendance).toHaveLength(0);
  });
  it('generates a real multi-page PDF with a local embedded font', async () => {
    const pdf = await reportPdf(
      {
        student_name: 'Murid Ujian',
        period: '2026-10',
        attendance: [],
        progress: [],
        feedback: Array.from({ length: 120 }, () => ({
          date: '2026-10-10T02:00:00Z',
          text: 'Bacaan murid semakin lancar. Teruskan latihan di rumah.',
        })),
      },
      true,
      true,
      new Uint8Array(await readFile('public/fonts/report-latin.woff')),
    );
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe('%PDF-');
    const parsed = await PDFDocument.load(pdf);
    expect(parsed.getPageCount()).toBeGreaterThan(1);
  });
  it('prepares a message without public report tokens or sending it', () => {
    const text = whatsappDraft('Murid Contoh', '2026-10', 'https://example.test/aqr/');
    expect(text).toContain('https://example.test/aqr/');
    expect(text).toContain('e-mel berdaftar');
    expect(text).not.toContain('token=');
  });
});
