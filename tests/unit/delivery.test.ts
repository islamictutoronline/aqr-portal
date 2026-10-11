import { describe, it, expect } from 'vitest';
import { demoData } from '../../src/lib/demo';
import { familyBundles, familyMessage, whatsappUrl } from '../../src/lib/delivery';

describe('penghantaran sekeluarga (laporan + invois)', () => {
  it('menggabungkan adik-beradik di bawah penjaga bil yang sama', () => {
    const d = demoData();
    const families = familyBundles(d, '2026-10');
    const g0 = families.find((f) => f.guardian.id === 'guardian-0')!;
    expect(g0.children.length).toBeGreaterThan(1);
    expect(g0.invoice?.number).toBe('DEMO-001');
    // Penjaga kedua (bukan penjaga bil) tidak menerima pakej anak itu.
    expect(
      families.every((f) => new Set(f.children.map((c) => c.id)).size === f.children.length),
    ).toBe(true);
  });
  it('pakej belum lengkap sehingga semua laporan anak diluluskan dan invois wujud', () => {
    const d = demoData();
    d.monthly_student_reports = [];
    let g0 = familyBundles(d, '2026-10').find((f) => f.guardian.id === 'guardian-0')!;
    expect(g0.missing.some((m) => m.includes('belum disediakan'))).toBe(true);
    d.monthly_student_reports = g0.children.map((c) => ({
      id: `r-${String(c.id)}`,
      student_id: c.id,
      period: '2026-10',
      status: 'approved',
      snapshot: {},
    }));
    g0 = familyBundles(d, '2026-10').find((f) => f.guardian.id === 'guardian-0')!;
    expect(g0.missing).toEqual([]);
    // Draf invois tidak dihantar.
    expect(
      familyBundles(d, '2026-10').find((f) => f.guardian.id === 'guardian-3')?.invoice,
    ).toBeUndefined();
    const text = familyMessage(g0, '2026-10', d);
    expect(text).toContain('Oktober 2026');
    expect(text).toContain(' dan ');
    expect(text).toContain('DEMO-001');
    expect(whatsappUrl('+60 11-000 0001', 'Salam & terima kasih')).toBe(
      'https://wa.me/60110000001?text=Salam%20%26%20terima%20kasih',
    );
  });
});
