import { describe, it, expect } from 'vitest';
import {
  readingKind,
  readingLabel,
  readingProblem,
  readingShort,
  surahs,
} from '../../src/lib/quran';
import { generateComment } from '../../src/lib/core';

describe('bacaan sesi Iqra / al-Quran', () => {
  it('114 surah dengan 6236 ayat', () => {
    expect(surahs).toHaveLength(114);
    expect(surahs.reduce((n, [, a]) => n + a, 0)).toBe(6236);
  });
  it('jenis bacaan ikut program', () => {
    expect(readingKind('IQRA')).toBe('iqra');
    expect(readingKind('TAHSIN_AQ')).toBe('quran');
    expect(readingKind('KELANCARAN_AQ')).toBe('quran');
    expect(readingKind('PRA_TAHFIZ')).toBe('quran');
    expect(readingKind('BAHASA_ARAB')).toBeNull();
  });
  it('label penuh dan ringkas', () => {
    expect(readingLabel({ kind: 'iqra', jilid: 3, page: 12 })).toBe("Iqra' 3, muka surat 12");
    expect(readingLabel({ kind: 'quran', surah: 67, ayah_from: 1, ayah_to: 10, page: 562 })).toBe(
      'Surah Al-Mulk ayat 1–10, muka surat 562',
    );
    expect(readingLabel({ kind: 'quran', page: 3 })).toBe('Muka surat 3');
    expect(readingShort({ kind: 'quran', surah: 67, ayah_from: 1, ayah_to: 10, page: 562 })).toBe(
      'Al-Mulk 1–10 · ms 562',
    );
    expect(readingShort({ kind: 'iqra', jilid: 3, page: 12 })).toBe("Iqra' 3 · ms 12");
  });
  it('julat ayat disemak', () => {
    expect(readingProblem({ kind: 'quran', surah: 112, ayah_to: 9 })).toMatch(/hanya 4 ayat/);
    expect(readingProblem({ kind: 'quran', ayah_from: 2 })).toMatch(/Pilih surah/);
    expect(readingProblem({ kind: 'quran', surah: 2, ayah_from: 10, ayah_to: 5 })).toMatch(
      /selepas ayat mula/,
    );
    expect(readingProblem({ kind: 'quran', surah: 2, ayah_from: 255, ayah_to: 257 })).toBeNull();
  });
  it('ulasan ibu bapa menyebut bacaan hanya bagi kelas yang dihadiri', () => {
    const reading = { kind: 'iqra' as const, jilid: 2, page: 5 };
    expect(generateComment('mengaji', 'present', { mastery: 'not_assessed', reading })).toBe(
      "Tiada penilaian pembelajaran untuk sesi ini. Bacaan: Iqra' 2, muka surat 5.",
    );
    expect(generateComment('mengaji', 'absent', { mastery: 'not_assessed', reading })).toBe(
      'Tiada penilaian pembelajaran untuk sesi ini.',
    );
  });
});
