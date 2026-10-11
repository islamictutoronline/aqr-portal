import { z } from 'zod';
import { readingLabel, readingSchema } from './quran';

export const ORGANIZATION = 'Akademi Al-Quran Ar-Riyadh (AQR)';
export type Role = 'owner' | 'admin' | 'tutor' | 'guardian';
export type Row = { id: string; organization_id?: string; [key: string]: unknown };
export type Dataset = Record<string, Row[]>;
export const roleLabels: Record<Role, string> = {
  owner: 'Pemilik',
  admin: 'Admin',
  tutor: 'Tutor',
  guardian: 'Ibu bapa / penjaga',
};
export const statusLabels: Record<string, string> = {
  active: 'Aktif',
  archived: 'Diarkib',
  present: 'Hadir',
  late: 'Lewat',
  absent: 'Tidak hadir',
  excused: 'Cuti bermaklum',
  makeup: 'Ganti',
  scheduled: 'Dijadualkan',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
  reported: 'Belum disemak',
  needs_review: 'Perlu semakan',
  verified: 'Disemak',
  approved: 'Diluluskan',
  paid: 'Dibayar',
  pending_verification: 'Menunggu semakan',
  rejected: 'Ditolak',
  reversed: 'Dibalikkan',
  partially_paid: 'Bayaran separa',
  overdue: 'Tertunggak',
  draft: 'Draf',
  published: 'Diterbitkan',
  retracted: 'Ditarik balik',
  review: 'Dalam semakan',
  issued: 'Dikeluarkan',
  void: 'Dibatalkan',
  rescheduled: 'Dijadual semula',
  sent: 'Dihantar',
};
// Label Melayu bagi kod status; digunakan oleh skrin dan fail laporan.
export const statusLabel = (v: unknown) => statusLabels[String(v)] ?? String(v);
// Kata laluan pentadbir: panjang, huruf + nombor, dan bukan kata laluan biasa yang mudah diteka.
const weakPasswords = ['admin', 'password', 'katalaluan', 'qwerty', '123456', 'aqr', 'admin123'];
export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return 'Kata laluan mesti sekurang-kurangnya 10 aksara.';
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw))
    return 'Kata laluan mesti mengandungi huruf dan nombor.';
  const lower = pw.toLowerCase();
  if (weakPasswords.some((w) => lower.replace(/[^a-z0-9]/g, '').startsWith(w) && lower.length < 14))
    return 'Kata laluan terlalu mudah diteka. Pilih yang lain.';
  return null;
}
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
export const monthLabel = (period: string) => {
  const [year, month] = String(period).split('-');
  return `${malayMonths[Number(month) - 1] || month} ${year}`;
};
// Nama fail muat turun yang jelas: "Laporan Bulanan - Ahmad - Oktober 2026.pdf".
export function fileName(parts: unknown[], ext: string) {
  const clean = parts
    .map((p) =>
      String(p ?? '')
        .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
  return `${clean.join(' - ').slice(0, 150)}.${ext}`;
}
export const formatMoney = (sen: number) =>
  new Intl.NumberFormat('ms-MY', { style: 'currency', currency: 'MYR' }).format(sen / 100);
export const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('ms-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date));
export const timeLabel = (date: string) =>
  new Intl.DateTimeFormat('ms-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
export function monthBounds(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Bulan tidak sah');
  const [y, m] = month.split('-').map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1, -8)).toISOString(),
    end: new Date(Date.UTC(y, m, 1, -8)).toISOString(),
  };
}
export function integerSen(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error('Amaun mesti mempunyai maksimum dua tempat perpuluhan');
  const [ringgit, decimal = ''] = value.split('.');
  const result = Number(ringgit) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(result)) throw new Error('Amaun terlalu besar');
  return result;
}
// Harga sesi untuk ibu bapa (Borang Pendaftaran AQR, Okt 2026): [kod program, minit, sen].
export const feeReference = [
  ['IQRA', 20, 800],
  ['IQRA', 30, 1000],
  ['KELANCARAN_AQ', 20, 800],
  ['KELANCARAN_AQ', 30, 1000],
  ['TAHSIN_AQ', 20, 800],
  ['TAHSIN_AQ', 30, 1000],
  ['PRA_TAHFIZ', 30, 1000],
  ['FARDHU_AIN_KAFA', 30, 1200],
  ['TAJWID_TP', 30, 1200],
  ['BAHASA_ARAB', 30, 1500],
  ['BAHASA_ARAB_KSSM', 30, 1700],
  ['BAHASA_ARAB_MADINAH', 30, 2000],
  ['TADABBUR', 30, 2000],
  ['FARAID', 30, 2500],
  ['FARDHU_AIN_DEWASA', 30, 2000],
  ['TARANNUM', 30, 2000],
] as const;
export const rateReference = [
  ['IQRA', "Iqra'", 20, 700],
  ['IQRA', "Iqra'", 30, 900],
  ['KELANCARAN_AQ', 'Kelancaran al-Quran', 20, 700],
  ['KELANCARAN_AQ', 'Kelancaran al-Quran', 30, 900],
  ['TAHSIN_AQ', 'Tahsin al-Quran', 20, 700],
  ['TAHSIN_AQ', 'Tahsin al-Quran', 30, 900],
  ['PRA_TAHFIZ', 'Pra Tahfiz', 30, 900],
  ['FARDHU_AIN_KAFA', 'Fardhu Ain KAFA', 30, 1000],
  ['FARDHU_AIN_DEWASA', 'Fardhu Ain Dewasa', 30, 1300],
  ['BAHASA_ARAB', 'Bahasa Arab', 30, 1300],
  ['TAJWID_TP', 'Tajwid Teori & Praktikal', 30, 1000],
] as const;
export type Rate = {
  program_code: string;
  duration_minutes: number;
  amount_sen: number;
  effective_from: string;
  effective_to?: string | null;
};
export function findRate(rates: Rate[], program: string, minutes: number, day: string) {
  const matches = rates.filter(
    (r) =>
      r.program_code === program &&
      r.duration_minutes === minutes &&
      r.effective_from <= day &&
      (!r.effective_to || r.effective_to >= day),
  );
  if (matches.length !== 1)
    throw new Error(
      matches.length ? 'Kadar bertindih' : 'Tiada kadar bagi program, tempoh dan tarikh ini',
    );
  return matches[0];
}
export function eligibleAllowance(session: {
  status: string;
  review_status: string;
  verified_by?: unknown;
  approved_by?: unknown;
  rate_snapshot_sen?: number;
}) {
  return session.status === 'completed' &&
    ['approved', 'paid'].includes(session.review_status) &&
    session.verified_by &&
    session.approved_by &&
    session.verified_by !== session.approved_by
    ? (session.rate_snapshot_sen ?? 0)
    : 0;
}
export function invoiceBalance(invoice: Row, payments: Row[], allocations: Row[]) {
  const paid = allocations
    .filter(
      (a) =>
        a.invoice_id === invoice.id &&
        payments.some((p) => p.id === a.payment_id && p.status === 'verified'),
    )
    .reduce((n, a) => n + Number(a.amount_sen), 0);
  return {
    invoiced: Number(invoice.total_sen),
    paid,
    outstanding: Number(invoice.total_sen) - paid,
  };
}
export const skillOptions: Record<string, [string, string][]> = {
  mengaji: [
    ['bacaan', 'bacaan'],
    ['kelancaran', 'kelancaran'],
    ['makhraj', 'makhraj'],
    ['tajwid', 'tajwid'],
    ['hafazan', 'hafazan'],
    ['murajaah', 'murajaah'],
  ],
  fardhu_ain: [
    ['kefahaman', 'kefahaman'],
    ['wuduk', 'amali wuduk'],
    ['solat', 'amali solat'],
    ['adab', 'adab'],
  ],
  bahasa_arab: [
    ['mufradat', 'mufradat'],
    ['qiraah', "qira'ah"],
    ['kitabah', 'kitabah'],
    ['kalam', 'kalam'],
    ['istima', "istima'"],
    ['nahu', 'nahu'],
    ['sorof', 'sorof'],
  ],
};
export const participationOptions = [
  ['aktif', 'aktif'],
  ['dibimbing', 'mengambil bahagian dengan bimbingan'],
  ['memerhati', 'memerhati dan mendengar'],
] as const;
export const focusOptions = [
  ['sebutan', 'sebutan yang tepat'],
  ['ulangan', 'pengulangan latihan'],
  ['kefahaman', 'kefahaman isi pelajaran'],
] as const;
export const practiceOptions = [
  ['ulang', 'Ulang latihan secara konsisten di rumah'],
  ['bersama', 'Latihan bersama penjaga digalakkan'],
] as const;
export const assessmentSchema = z.object({
  skill: z.string().optional(),
  mastery: z.union([z.number().int().min(1).max(5), z.literal('not_assessed')]),
  participation: z.string().optional(),
  focus: z.string().optional(),
  practice: z.string().optional(),
  // Bacaan sesi (Iqra'/al-Quran) untuk laporan; hanya bagi kelas yang dihadiri.
  reading: readingSchema.optional(),
});
export type Assessment = z.infer<typeof assessmentSchema>;
export function generateComment(
  subject: string,
  attendance: string,
  input: Assessment,
  customOptions: Row[] = [],
) {
  const a = assessmentSchema.parse(input);
  const reading =
    ['present', 'late', 'makeup'].includes(attendance) && a.reading ? readingLabel(a.reading) : '';
  return (
    baseComment(subject, attendance, a, customOptions) + (reading ? ` Bacaan: ${reading}.` : '')
  );
}
function baseComment(subject: string, attendance: string, a: Assessment, customOptions: Row[]) {
  if (['absent', 'excused'].includes(attendance) || a.mastery === 'not_assessed')
    return 'Tiada penilaian pembelajaran untuk sesi ini.';
  const option = (group: string, code?: string) =>
    customOptions.find((o) => o.group_code === group && o.code === code && o.active !== false)
      ?.label as string | undefined;
  const skill =
    option('skill', a.skill) ?? skillOptions[subject]?.find((s) => s[0] === a.skill)?.[1];
  const part =
    option('participation', a.participation) ??
    participationOptions.find((s) => s[0] === a.participation)?.[1];
  const focus = option('focus', a.focus) ?? focusOptions.find((s) => s[0] === a.focus)?.[1];
  const practice = a.practice
    ? (option('home_practice', a.practice) ?? practiceOptions.find((s) => s[0] === a.practice)?.[1])
    : '';
  if (!skill || !part || !focus || (a.practice && !practice))
    throw new Error('Pilih kemahiran, penglibatan dan fokus');
  const ratings = [
    'yang memerlukan bimbingan',
    'asas',
    'yang memuaskan',
    'yang baik',
    'yang sangat baik',
  ];
  return `Alhamdulillah, murid menunjukkan penguasaan ${ratings[a.mastery - 1]} dalam ${skill}. Murid ${part} dalam kelas. Fokus latihan ialah ${focus}.${practice ? ` ${practice}.` : ''}`;
}
export function comparableTrend(
  records: { mastery: number | null; skill: string; rubric_version: string; published: boolean }[],
) {
  const valid = records.filter((r) => r.published && r.mastery !== null);
  if (valid.length < 2) return 'Rekod penilaian belum mencukupi untuk perbandingan.';
  const [before, after] = valid.slice(-2);
  if (before.skill !== after.skill || before.rubric_version !== after.rubric_version)
    return 'Rekod penilaian belum mencukupi untuk perbandingan.';
  return after.mastery! > before.mastery!
    ? 'Penguasaan meningkat berdasarkan dua penilaian sebanding.'
    : 'Penguasaan berdasarkan penilaian sebanding.';
}
export const safeCell = (value: unknown) =>
  typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/.test(value)
    ? `'${value}`
    : (value ?? '');
export const REPORTS = {
  monthly_teaching: 'Laporan mengajar bulanan',
  attendance: 'Kehadiran',
  student_progress: 'Kemajuan murid',
  tutor_workload: 'Tugasan tutor',
  tutor_allowance: 'Pengiraan elaun',
  tutor_payout: 'Penyata elaun',
  student_fees: 'Yuran dan tunggakan',
  cash_collection: 'Kutipan disahkan',
  executive_summary: 'Ringkasan AQR',
} as const;
export type ReportCode = keyof typeof REPORTS;
export function allowedReport(role: Role, code: ReportCode) {
  if (role === 'owner' || role === 'admin') return true;
  const allowed: Record<'tutor' | 'guardian', ReportCode[]> = {
    tutor: [
      'monthly_teaching',
      'attendance',
      'student_progress',
      'tutor_workload',
      'tutor_allowance',
      'tutor_payout',
    ],
    guardian: ['attendance', 'student_progress', 'student_fees'],
  };
  return allowed[role].includes(code);
}

// No. WhatsApp Malaysia → E.164 (sama seperti private.normalize_phone): 012-345 6789 → +60123456789.
export function normalizePhone(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  let d = t.replace(/[^0-9]/g, '');
  d = t.startsWith('+') ? `+${d}` : d.startsWith('0') ? `+6${d}` : `+${d}`;
  if (!/^\+[1-9][0-9]{7,14}$/.test(d))
    throw new Error('No. WhatsApp tidak sah. Contoh: 012-345 6789');
  return d;
}
// Kod negara untuk no. WhatsApp penjaga (Malaysia lalai). Senarai ringkas negara biasa waris AQR.
export const countryCodes: [string, string][] = [
  ['+60', 'Malaysia (+60)'],
  ['+65', 'Singapura (+65)'],
  ['+673', 'Brunei (+673)'],
  ['+62', 'Indonesia (+62)'],
  ['+66', 'Thailand (+66)'],
  ['+966', 'Arab Saudi (+966)'],
  ['+971', 'UAE (+971)'],
  ['+974', 'Qatar (+974)'],
  ['+965', 'Kuwait (+965)'],
  ['+968', 'Oman (+968)'],
  ['+973', 'Bahrain (+973)'],
  ['+20', 'Mesir (+20)'],
  ['+90', 'Turki (+90)'],
  ['+44', 'United Kingdom (+44)'],
  ['+353', 'Ireland (+353)'],
  ['+49', 'Jerman (+49)'],
  ['+33', 'Perancis (+33)'],
  ['+31', 'Belanda (+31)'],
  ['+61', 'Australia (+61)'],
  ['+64', 'New Zealand (+64)'],
  ['+1', 'AS / Kanada (+1)'],
  ['+81', 'Jepun (+81)'],
  ['+82', 'Korea Selatan (+82)'],
  ['+86', 'China (+86)'],
  ['+91', 'India (+91)'],
  ['+92', 'Pakistan (+92)'],
  ['+880', 'Bangladesh (+880)'],
];
// Gabung kod negara + nombor yang ditaip bebas oleh tutor, dibaiki secara automatik:
// sengkang/jarak dibuang, 0 di depan dibuang, kod negara yang ditaip semula (60…, +60…, +6 0…) dikesan.
// (+60, "012-345 6789") → +60123456789; (+60, "6012 3456789") → +60123456789; "+65 9123 4567" → +6591234567.
export function joinPhone(code: string, number: string): string | null {
  const n = number.trim();
  if (!n) return null;
  let digits = n.replace(/[^0-9]/g, '');
  let cc = code.replace(/[^0-9]/g, '');
  if (n.startsWith('+')) {
    // Nombor bermula "+" mengatasi kod yang dipilih.
    const known = countryCodes
      .map(([c]) => c.slice(1))
      .sort((x, y) => y.length - x.length)
      .find((c) => digits.startsWith(c));
    if (!known) return normalizePhone(n);
    cc = known;
    digits = digits.slice(known.length);
  } else {
    digits = digits.replace(/^0+/, '');
    if (digits.startsWith(cc) && digits.length - cc.length >= 8) digits = digits.slice(cc.length);
  }
  digits = digits.replace(/^0+/, '');
  // Malaysia: telefon bimbit 1X + 7–8 digit, atau talian tetap 3–9 + 7–8 digit.
  if (cc === '60' && !/^(1\d{8,9}|[3-9]\d{7,8})$/.test(digits))
    throw new Error('No. Malaysia tidak lengkap. Contoh: 0123456789');
  return normalizePhone(`+${cc}${digits}`);
}
// Pisah nombor E.164 kepada [kod negara, nombor tempatan] untuk borang kemas kini.
export function splitPhone(phone: string): [string, string] {
  const match = [...countryCodes]
    .map(([c]) => c)
    .sort((a, b) => b.length - a.length)
    .find((c) => phone.startsWith(c));
  return match ? [match, phone.slice(match.length)] : ['+60', phone];
}
