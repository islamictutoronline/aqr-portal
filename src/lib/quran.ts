// Rujukan bacaan untuk rekod kehadiran: 114 surah (ejaan rumi Melayu) dan bilangan ayat.
// Diselaraskan dengan private.surah_name / private.surah_ayahs dalam migrasi 33.
import { z } from 'zod';

export const surahs: [string, number][] = [
  ['Al-Fatihah', 7],
  ['Al-Baqarah', 286],
  ["Ali 'Imran", 200],
  ["An-Nisa'", 176],
  ["Al-Ma'idah", 120],
  ["Al-An'am", 165],
  ["Al-A'raf", 206],
  ['Al-Anfal', 75],
  ['At-Taubah', 129],
  ['Yunus', 109],
  ['Hud', 123],
  ['Yusuf', 111],
  ["Ar-Ra'd", 43],
  ['Ibrahim', 52],
  ['Al-Hijr', 99],
  ['An-Nahl', 128],
  ["Al-Isra'", 111],
  ['Al-Kahf', 110],
  ['Maryam', 98],
  ['Taha', 135],
  ["Al-Anbiya'", 112],
  ['Al-Hajj', 78],
  ["Al-Mu'minun", 118],
  ['An-Nur', 64],
  ['Al-Furqan', 77],
  ["Asy-Syu'ara'", 227],
  ['An-Naml', 93],
  ['Al-Qasas', 88],
  ["Al-'Ankabut", 69],
  ['Ar-Rum', 60],
  ['Luqman', 34],
  ['As-Sajdah', 30],
  ['Al-Ahzab', 73],
  ["Saba'", 54],
  ['Fatir', 45],
  ['Yasin', 83],
  ['As-Saffat', 182],
  ['Sad', 88],
  ['Az-Zumar', 75],
  ['Ghafir', 85],
  ['Fussilat', 54],
  ['Asy-Syura', 53],
  ['Az-Zukhruf', 89],
  ['Ad-Dukhan', 59],
  ['Al-Jathiyah', 37],
  ['Al-Ahqaf', 35],
  ['Muhammad', 38],
  ['Al-Fath', 29],
  ['Al-Hujurat', 18],
  ['Qaf', 45],
  ['Az-Zariyat', 60],
  ['At-Tur', 49],
  ['An-Najm', 62],
  ['Al-Qamar', 55],
  ['Ar-Rahman', 78],
  ["Al-Waqi'ah", 96],
  ['Al-Hadid', 29],
  ['Al-Mujadalah', 22],
  ['Al-Hasyr', 24],
  ['Al-Mumtahanah', 13],
  ['As-Saff', 14],
  ["Al-Jumu'ah", 11],
  ['Al-Munafiqun', 11],
  ['At-Taghabun', 18],
  ['At-Talaq', 12],
  ['At-Tahrim', 12],
  ['Al-Mulk', 30],
  ['Al-Qalam', 52],
  ['Al-Haqqah', 52],
  ["Al-Ma'arij", 44],
  ['Nuh', 28],
  ['Al-Jinn', 28],
  ['Al-Muzzammil', 20],
  ['Al-Muddaththir', 56],
  ['Al-Qiyamah', 40],
  ['Al-Insan', 31],
  ['Al-Mursalat', 50],
  ["An-Naba'", 40],
  ["An-Nazi'at", 46],
  ["'Abasa", 42],
  ['At-Takwir', 29],
  ['Al-Infitar', 19],
  ['Al-Mutaffifin', 36],
  ['Al-Insyiqaq', 25],
  ['Al-Buruj', 22],
  ['At-Tariq', 17],
  ["Al-A'la", 19],
  ['Al-Ghasyiyah', 26],
  ['Al-Fajr', 30],
  ['Al-Balad', 20],
  ['Asy-Syams', 15],
  ['Al-Lail', 21],
  ['Ad-Duha', 11],
  ['Asy-Syarh', 8],
  ['At-Tin', 8],
  ["Al-'Alaq", 19],
  ['Al-Qadr', 5],
  ['Al-Bayyinah', 8],
  ['Az-Zalzalah', 8],
  ["Al-'Adiyat", 11],
  ["Al-Qari'ah", 11],
  ['At-Takathur', 8],
  ["Al-'Asr", 3],
  ['Al-Humazah', 9],
  ['Al-Fil', 5],
  ['Quraisy', 4],
  ["Al-Ma'un", 7],
  ['Al-Kauthar', 3],
  ['Al-Kafirun', 6],
  ['An-Nasr', 3],
  ['Al-Masad', 5],
  ['Al-Ikhlas', 4],
  ['Al-Falaq', 5],
  ['An-Nas', 6],
];

// Program yang merekod bacaan: Iqra' (jilid + muka surat) atau al-Quran (surah + ayat + muka surat).
export type ReadingKind = 'iqra' | 'quran';
export function readingKind(programCode: unknown): ReadingKind | null {
  const code = String(programCode || '').toUpperCase();
  if (code === 'IQRA') return 'iqra';
  if (['KELANCARAN_AQ', 'TAHSIN_AQ', 'PRA_TAHFIZ'].includes(code) || code.startsWith('TAHFIZ'))
    return 'quran';
  return null;
}

export const readingSchema = z.object({
  kind: z.enum(['iqra', 'quran']),
  jilid: z.number().int().min(1).max(6).optional(),
  page: z.number().int().min(1).max(604).optional(),
  surah: z.number().int().min(1).max(114).optional(),
  ayah_from: z.number().int().min(1).max(286).optional(),
  ayah_to: z.number().int().min(1).max(286).optional(),
});
export type Reading = z.infer<typeof readingSchema>;
// Juzuk mushaf Madinah 604 muka surat: juzuk 1 = ms 1–21, kemudian 20 muka surat setiap juzuk.
export function juzOf(page?: number | null): number | null {
  if (!page || page < 1 || page > 604) return null;
  return page <= 21 ? 1 : Math.min(30, Math.floor((page - 2) / 20) + 1);
}

// Semakan julat ayat; mesej sama seperti pangkalan data.
export function readingProblem(r: Reading): string | null {
  if (r.kind === 'iqra') return null;
  const max = r.surah ? surahs[r.surah - 1][1] : 286;
  if ((r.ayah_from || r.ayah_to) && !r.surah) return 'Pilih surah dahulu';
  if ((r.ayah_from && r.ayah_from > max) || (r.ayah_to && r.ayah_to > max))
    return `Surah ${surahs[r.surah! - 1][0]} hanya ${max} ayat`;
  if (r.ayah_from && r.ayah_to && r.ayah_to < r.ayah_from)
    return 'Ayat akhir mesti selepas ayat mula';
  return null;
}
export const hasReading = (r?: Partial<Reading> | null) =>
  !!r && !!(r.jilid || r.page || r.surah || r.ayah_from || r.ayah_to);

// "Iqra' 3, muka surat 12" · "Surah Al-Mulk ayat 1–10, muka surat 562" (sama seperti private.reading_label).
export function readingLabel(r?: Partial<Reading> | null): string {
  if (!hasReading(r)) return '';
  const parts: string[] = [];
  if (r!.kind === 'iqra') {
    if (r!.jilid) parts.push(`Iqra' ${r!.jilid}`);
  } else if (r!.surah) {
    const from = r!.ayah_from;
    const to = r!.ayah_to && r!.ayah_to !== from ? r!.ayah_to : undefined;
    parts.push(
      `Surah ${surahs[r!.surah - 1][0]}` +
        (from ? ` ayat ${from}${to ? `–${to}` : ''}` : to ? ` ayat ${to}` : ''),
    );
  }
  if (r!.page) parts.push(`muka surat ${r!.page}`);
  const text = parts.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
// Versi ringkas untuk jadual PDF: "Al-Mulk 1–10 · ms 562" / "Iqra' 3 · ms 12".
export function readingShort(r?: Partial<Reading> | null): string {
  if (!hasReading(r)) return '';
  const parts: string[] = [];
  if (r!.kind === 'iqra' && r!.jilid) parts.push(`Iqra' ${r!.jilid}`);
  if (r!.kind === 'quran' && r!.surah) {
    const to = r!.ayah_to && r!.ayah_to !== r!.ayah_from ? `–${r!.ayah_to}` : '';
    parts.push(`${surahs[r!.surah - 1][0]}${r!.ayah_from ? ` ${r!.ayah_from}${to}` : ''}`);
  }
  if (r!.page) parts.push(`ms ${r!.page}`);
  return parts.join(' · ');
}
