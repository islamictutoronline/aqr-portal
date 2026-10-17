import { describe, it, expect } from 'vitest';
import {
  formatPages,
  parsePages,
  readingKind,
  readingLabel,
  readingProblem,
  readingShort,
  surahs,
  surahStartPages,
  surahsOnPages,
  surahFromPage,
  juzLabel,
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
      'Surah Al-Mulk ayat 1–10, juzuk 29, muka surat 562',
    );
    // Tanpa surah: surah dan juzuk dikira daripada muka surat.
    expect(readingLabel({ kind: 'quran', page: 3 })).toBe(
      'Surah Al-Baqarah, juzuk 1, muka surat 3',
    );
    expect(readingShort({ kind: 'quran', surah: 67, ayah_from: 1, ayah_to: 10, page: 562 })).toBe(
      'Al-Mulk 1–10 · Juz 29 · ms 562',
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

describe('julat muka surat', () => {
  it('menghurai satu muka surat atau julat', () => {
    expect(parsePages('100')).toEqual({ page: 100 });
    expect(parsePages('100-102')).toEqual({ page: 100, page_to: 102 });
    expect(parsePages(' 531 – 535 ')).toEqual({ page: 531, page_to: 535 });
    expect(parsePages('ms 23-24')).toEqual({ page: 23, page_to: 24 });
    expect(parsePages('100-100')).toEqual({ page: 100 });
    expect(parsePages('')).toEqual({});
    expect(parsePages('abc')).toBeNull();
  });
  it('memaparkan julat dalam label dan menolak julat terbalik', () => {
    expect(formatPages({ page: 531, page_to: 535 })).toBe('531–535');
    expect(readingLabel({ kind: 'quran', page: 531, page_to: 535 })).toBe(
      "Surah Ar-Rahman – Al-Waqi'ah, juzuk 27, muka surat 531–535",
    );
    expect(readingProblem({ kind: 'quran', page: 10, page_to: 8 })).toMatch(/akhir/);
  });
});

describe('surah dan juzuk automatik daripada muka surat', () => {
  it('data mushaf Madinah: 114 surah, tertib menaik', () => {
    expect(surahStartPages).toHaveLength(114);
    expect(surahStartPages.every((p, i) => i === 0 || p >= surahStartPages[i - 1])).toBe(true);
    // Rujukan biasa: Yasin 440, Al-Kahf 293, Al-Mulk 562, An-Naba' 582, An-Nas 604.
    expect([36, 18, 67, 78, 114].map((s) => surahStartPages[s - 1])).toEqual([
      440, 293, 562, 582, 604,
    ]);
  });
  it('surah pada muka surat dan julat', () => {
    expect(surahsOnPages(100, 102)).toEqual({ surah: 4 });
    expect(surahsOnPages(77)).toEqual({ surah: 4 });
    expect(surahsOnPages(105, 107)).toEqual({ surah: 4, surah_to: 5 });
    expect(surahsOnPages(591)).toEqual({ surah: 86, surah_to: 87 });
    expect(surahsOnPages(0)).toBeNull();
  });
  it('juzuk termasuk julat merentas juzuk', () => {
    expect(juzLabel({ kind: 'quran', page: 100, page_to: 102 })).toBe('5–6');
    expect(juzLabel({ kind: 'quran', page: 582 })).toBe('30');
    expect(juzLabel({ kind: 'quran', page: 100, juz: 7 })).toBe('7');
  });
  it('hanya program bacaan mengisi surah automatik; Pra Tahfiz memilih surah sendiri', () => {
    expect(surahFromPage('TAHSIN_AQ')).toBe(true);
    expect(surahFromPage('KELANCARAN_AQ')).toBe(true);
    expect(surahFromPage('PRA_TAHFIZ')).toBe(false);
    expect(surahFromPage('IQRA')).toBe(false);
  });
  it('label julat surah', () => {
    expect(readingLabel({ kind: 'quran', page: 105, page_to: 107, surah: 4, surah_to: 5 })).toBe(
      "Surah An-Nisa' – Al-Ma'idah, juzuk 6, muka surat 105–107",
    );
    expect(readingShort({ kind: 'quran', page: 105, page_to: 107, surah: 4, surah_to: 5 })).toBe(
      "An-Nisa' – Al-Ma'idah · Juz 6 · ms 105–107",
    );
  });
});

describe('ayat terakhir dibaca', () => {
  it('label dan semakan dalam surah terakhir', () => {
    const r = { kind: 'quran' as const, page: 100, page_to: 102, surah: 4, last_ayah: 45 };
    expect(readingLabel(r)).toBe(
      "Surah An-Nisa', juzuk 5–6, muka surat 100–102, berhenti di ayat 45",
    );
    expect(readingShort(r)).toBe("An-Nisa' · Juz 5–6 · ms 100–102 · berhenti ayat 45");
    expect(readingProblem({ kind: 'quran', page: 591, last_ayah: 20 })).toMatch(/hanya 19 ayat/);
    expect(readingProblem({ kind: 'quran', page: 591, last_ayah: 19 })).toBeNull();
  });
});
