import { z } from 'zod';

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
  excused: 'Berizin',
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
});
export type Assessment = z.infer<typeof assessmentSchema>;
export function generateComment(
  subject: string,
  attendance: string,
  input: Assessment,
  customOptions: Row[] = [],
) {
  const a = assessmentSchema.parse(input);
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
