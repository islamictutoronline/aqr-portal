import {
  Dataset,
  Row,
  ReportCode,
  Role,
  ORGANIZATION,
  REPORTS,
  allowedReport,
  safeCell,
  monthBounds,
  invoiceBalance,
  dateLabel,
  statusLabel,
  findRate,
  Rate,
  feeReference,
} from './core';
export type Report = {
  code: ReportCode;
  title: string;
  month: string;
  headers: string[];
  rows: (string | number)[][];
  total_sen: number;
  generated_at: string;
  generated_by: string;
  demo: boolean;
};
// Elaun automatik (keputusan pengguna Okt 2026): tiada semakan manual. Sesi selesai dibayar
// sekali mengikut kadar program + tempoh pada tarikh sesi. Hadir, Lewat, Ganti dan Tidak hadir
// dibayar; Cuti bermaklum tidak dibayar. Sesi tanpa kadar dipaparkan dengan rate_sen null.
// Kadar khas (migrasi 38). Baris sejarah dengan effective_from terbesar <= tarikh sesi (KL)
// terpakai; seri dipecahkan oleh created_at terkini. Medan null = guna kadar standard.
function latestEffective(rows: Row[], day: string) {
  return rows
    .filter((r) => String(r.effective_from) <= day)
    .sort(
      (a, b) =>
        String(b.effective_from).localeCompare(String(a.effective_from)) ||
        String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
    )[0];
}
export function classRateOverride(data: Dataset, classId: unknown, day: string) {
  const row = latestEffective(
    (data.class_rate_overrides ?? []).filter((r) => r.class_id === classId),
    day,
  );
  const sen = (v: unknown) => (v == null || v === '' ? null : Number(v));
  return { fee_sen: sen(row?.fee_sen), allowance_sen: sen(row?.allowance_sen) };
}
export function tutorRateAdjustment(data: Dataset, staffId: unknown, day: string) {
  const row = latestEffective(
    (data.tutor_rate_overrides ?? []).filter((r) => r.staff_id === staffId),
    day,
  );
  return row ? Number(row.adjustment_sen) || 0 : 0;
}
// Elaun sesi: kadar kelas khas jika ada; jika tidak, kadar standard + pelarasan tutor (minimum 0).
export function effectiveAllowance(
  data: Dataset,
  standard: number | null,
  classId: unknown,
  staffId: unknown,
  day: string,
) {
  const override = classRateOverride(data, classId, day).allowance_sen;
  if (override != null) return override;
  if (standard == null) return null;
  return Math.max(0, standard + tutorRateAdjustment(data, staffId, day));
}
export const PAYABLE_ATTENDANCE = ['present', 'late', 'makeup', 'absent'];
export type AllowanceRow = {
  session: Row;
  tutorId: string;
  label: string;
  minutes: number;
  attendance: string;
  rate_sen: number | null;
  payable_sen: number;
};
export function allowanceRows(data: Dataset, month: string): AllowanceRow[] {
  const { start, end } = monthBounds(month);
  const all = (table: string) => data[table] ?? [];
  const rates = all('tutor_allowance_rates') as unknown as Rate[];
  const klDay = (iso: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date(iso));
  return all('class_sessions')
    .filter((s) => {
      const t = new Date(String(s.starts_at));
      return s.status === 'completed' && t >= new Date(start) && t < new Date(end);
    })
    .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
    .map((s) => {
      const cls = all('classes').find((c) => c.id === s.class_id);
      const program = all('programs').find((p) => p.id === cls?.program_id);
      const minutes =
        (new Date(String(s.ends_at)).getTime() - new Date(String(s.starts_at)).getTime()) / 60000;
      const marks = all('attendance').filter((a) => a.session_id === s.id);
      const paid = marks.some((a) => PAYABLE_ATTENDANCE.includes(String(a.status)));
      const day = klDay(String(s.starts_at));
      let standard: number | null = null;
      try {
        standard = Number(findRate(rates, String(program?.code), minutes, day).amount_sen);
      } catch {
        standard = null;
      }
      const rate = effectiveAllowance(data, standard, s.class_id, s.tutor_id, day);
      return {
        session: s,
        tutorId: String(s.tutor_id),
        label: String(cls?.name ?? '—'),
        minutes,
        attendance:
          marks.length === 1
            ? statusLabel(marks[0].status)
            : `${marks.filter((a) => PAYABLE_ATTENDANCE.includes(String(a.status))).length}/${marks.length} dibayar`,
        rate_sen: rate,
        payable_sen: paid && rate ? rate : 0,
      };
    });
}
// Yuran ibu bapa ikut sesi yang dijalankan (sama seperti generate_session_invoices dalam DB):
// Hadir, Lewat, Ganti dan Tidak hadir dicaj; Cuti bermaklum tidak. Satu baris bagi murid × program × tempoh.
export const CHARGEABLE_ATTENDANCE = ['present', 'late', 'makeup', 'absent'];
export type FeeRow = {
  studentId: string;
  student: string;
  program: string;
  minutes: number;
  sessions: number;
  rate_sen: number | null;
  total_sen: number;
  guardianId: string | null;
};
export function feeRows(data: Dataset, month: string): FeeRow[] {
  const { start, end } = monthBounds(month);
  const all = (table: string) => data[table] ?? [];
  const klDay = (iso: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date(iso));
  const stored = all('program_fee_rates');
  const rates: Row[] = stored.length
    ? stored
    : feeReference.map(([program_code, duration_minutes, amount_sen]) => ({
        id: `${program_code}-${duration_minutes}`,
        program_code,
        duration_minutes,
        amount_sen,
        effective_from: '2000-01-01',
      }));
  const groups = new Map<string, FeeRow>();
  for (const a of all('attendance')) {
    if (!CHARGEABLE_ATTENDANCE.includes(String(a.status))) continue;
    const s = all('class_sessions').find((x) => x.id === a.session_id);
    if (!s || s.status !== 'completed') continue;
    const t = new Date(String(s.starts_at));
    if (t < new Date(start) || t >= new Date(end)) continue;
    const cls = all('classes').find((c) => c.id === s.class_id);
    const program = all('programs').find((p) => p.id === cls?.program_id);
    const minutes = (new Date(String(s.ends_at)).getTime() - t.getTime()) / 60000;
    const day = klDay(String(s.starts_at));
    const rate = rates.find(
      (r) =>
        r.program_code === program?.code &&
        Number(r.duration_minutes) === minutes &&
        String(r.effective_from) <= day &&
        (!r.effective_to || String(r.effective_to) >= day),
    );
    // Kadar kelas khas mengatasi kadar program (juga apabila tiada kadar standard).
    const fee =
      classRateOverride(data, s.class_id, day).fee_sen ?? (rate ? Number(rate.amount_sen) : null);
    const key = `${a.student_id}|${program?.id}|${minutes}|${fee}`;
    const row = groups.get(key) || {
      studentId: String(a.student_id),
      student: String(all('students').find((x) => x.id === a.student_id)?.full_name || '—'),
      program: String(program?.name || '—'),
      minutes,
      sessions: 0,
      rate_sen: fee,
      total_sen: 0,
      guardianId:
        String(
          all('student_guardians').find(
            (l) => l.student_id === a.student_id && l.is_billing_contact,
          )?.guardian_id || '',
        ) || null,
    };
    row.sessions += 1;
    row.total_sen += row.rate_sen || 0;
    groups.set(key, row);
  }
  return [...groups.values()].sort((x, y) => x.student.localeCompare(y.student));
}
export function buildReport(
  data: Dataset,
  code: ReportCode,
  month: string,
  role: Role,
  by: string,
  demo = false,
): Report {
  if (!allowedReport(role, code)) throw new Error('Laporan tidak dibenarkan');
  const { start, end } = monthBounds(month);
  const all = (table: string) => data[table] ?? [];
  const find = (table: string, id: unknown, key: string) =>
    String(all(table).find((r) => r.id === id)?.[key] ?? '—');
  const sessions = all('class_sessions').filter(
    (s) =>
      new Date(String(s.starts_at)) >= new Date(start) &&
      new Date(String(s.starts_at)) < new Date(end),
  );
  const inMonth = (r: Row) => sessions.some((s) => s.id === r.session_id);
  let headers: string[] = [],
    rows: (string | number)[][] = [],
    total_sen = 0;
  const option = (code: unknown) =>
    code == null
      ? '—'
      : String(all('assessment_options').find((o) => o.code === code)?.label ?? code);
  const sessionProgram = (s: Row) =>
    all('programs').find(
      (p) => p.id === all('classes').find((c) => c.id === s.class_id)?.program_id,
    );
  if (code === 'monthly_teaching') {
    headers = ['Tarikh', 'Tutor', 'Murid', 'Program', 'Tempoh min', 'Status', 'Nota'];
    rows = sessions.flatMap((s) =>
      all('enrollments')
        .filter(
          (e) =>
            e.class_id === s.class_id &&
            e.starts_on &&
            String(e.starts_on) <= String(s.starts_at).slice(0, 10) &&
            (!e.ends_on || String(e.ends_on) >= String(s.starts_at).slice(0, 10)),
        )
        .map((e) => [
          dateLabel(String(s.starts_at)),
          find('staff_profiles', s.tutor_id, 'display_name'),
          find('students', e.student_id, 'full_name'),
          String(sessionProgram(s)?.name ?? '—'),
          (new Date(String(s.ends_at)).getTime() - new Date(String(s.starts_at)).getTime()) / 60000,
          statusLabel(s.status),
          String(s.topic ?? ''),
        ]),
    );
  } else if (code === 'attendance') {
    headers = ['Tarikh', 'Murid', 'Program', 'Kehadiran', 'Catatan'];
    rows = all('attendance')
      .filter(inMonth)
      .map((a) => {
        const s = sessions.find((s) => s.id === a.session_id)!;
        return [
          dateLabel(String(s.starts_at)),
          find('students', a.student_id, 'full_name'),
          String(sessionProgram(s)?.name ?? '—'),
          statusLabel(a.status),
          String(a.reason ?? ''),
        ];
      });
  } else if (code === 'student_progress') {
    headers = ['Tarikh', 'Murid', 'Kemahiran', 'Skala', 'Penglibatan', 'Fokus', 'Ulasan', 'Status'];
    rows = all('generated_parent_comments')
      .filter(inMonth)
      .filter((c) => role !== 'guardian' || c.status === 'published')
      .map((c) => {
        const a = c.selections as Record<string, unknown>;
        return [
          dateLabel(String(sessions.find((s) => s.id === c.session_id)!.starts_at)),
          find('students', c.student_id, 'full_name'),
          option(a.skill),
          typeof a.mastery === 'number' ? a.mastery : 'Belum dinilai',
          option(a.participation),
          option(a.focus),
          String(c.text),
          statusLabel(c.status),
        ];
      });
  } else if (code === 'tutor_workload') {
    headers = [
      'Tutor',
      'Dirancang',
      'Dilaksana',
      'Dilaporkan',
      'Disahkan',
      'Diluluskan',
      'Dibayar',
    ];
    rows = [...new Set(sessions.map((s) => s.tutor_id))].map((t) => {
      const ss = sessions.filter((s) => s.tutor_id === t);
      return [
        find('staff_profiles', t, 'display_name'),
        ss.length,
        ss.filter((s) => s.status === 'completed').length,
        ss.filter((s) => s.review_status === 'reported').length,
        ss.filter((s) => ['verified', 'approved', 'paid'].includes(String(s.review_status))).length,
        ss.filter((s) => ['approved', 'paid'].includes(String(s.review_status))).length,
        ss.filter((s) => s.review_status === 'paid').length,
      ];
    });
  } else if (code === 'tutor_allowance') {
    headers = [
      'Tarikh',
      'Tutor',
      'Murid · Program',
      'Tempoh min',
      'Kehadiran',
      'Kadar (sen)',
      'Layak dibayar (sen)',
    ];
    rows = allowanceRows(data, month).map((r) => {
      total_sen += r.payable_sen;
      return [
        dateLabel(String(r.session.starts_at)),
        find('staff_profiles', r.tutorId, 'display_name'),
        r.label,
        r.minutes,
        r.attendance,
        r.rate_sen ?? 'Tiada kadar',
        r.payable_sen,
      ];
    });
  } else if (code === 'tutor_payout') {
    headers = ['Tutor', 'Bulan', 'Jenis', 'Amaun (sen)', 'Rujukan', 'Tarikh'];
    rows = all('tutor_payouts')
      .filter((p) =>
        all('tutor_payout_batches').some((b) => b.id === p.batch_id && b.period === month),
      )
      .map((p) => {
        total_sen += Number(p.amount_sen);
        return [
          find('staff_profiles', p.tutor_id, 'display_name'),
          month,
          'Bayaran elaun',
          Number(p.amount_sen),
          String(p.reference),
          dateLabel(String(p.paid_at)),
        ];
      });
    for (const adjustment of all('tutor_adjustments').filter(
      (a) =>
        a.checker_id &&
        a.paid_at &&
        new Date(String(a.paid_at)) >= new Date(start) &&
        new Date(String(a.paid_at)) < new Date(end),
    )) {
      total_sen += Number(adjustment.amount_sen);
      rows.push([
        find('staff_profiles', adjustment.tutor_id, 'display_name'),
        month,
        'Pelarasan',
        Number(adjustment.amount_sen),
        String(adjustment.payment_reference),
        dateLabel(String(adjustment.paid_at)),
      ]);
    }
  } else if (code === 'student_fees') {
    headers = [
      'Invois',
      'Penjaga',
      'Bulan',
      'Jumlah (sen)',
      'Bayaran disahkan (sen)',
      'Baki (sen)',
      'Tarikh akhir',
      'Status',
    ];
    rows = all('invoices')
      .filter((i) => i.period === month && !['draft', 'void'].includes(String(i.status)))
      .map((i) => {
        const b = invoiceBalance(i, all('payments'), all('payment_allocations'));
        total_sen += b.outstanding;
        return [
          String(i.number),
          find('guardians', i.guardian_id, 'full_name'),
          month,
          b.invoiced,
          b.paid,
          b.outstanding,
          dateLabel(String(i.due_on)),
          statusLabel(i.status),
        ];
      });
  } else if (code === 'cash_collection') {
    headers = [
      'Tarikh',
      'Kaedah',
      'Rujukan',
      'Bayaran (sen)',
      'Diperuntukkan (sen)',
      'Kredit belum diperuntukkan (sen)',
    ];
    rows = all('payments')
      .filter((p) => p.status === 'verified' && String(p.paid_on).startsWith(month))
      .map((p) => {
        const allocated = all('payment_allocations')
          .filter((a) => a.payment_id === p.id)
          .reduce((n, a) => n + Number(a.amount_sen), 0);
        total_sen += Number(p.amount_sen);
        return [
          dateLabel(String(p.paid_on)),
          String(p.method),
          String(p.reference ?? ''),
          Number(p.amount_sen),
          allocated,
          Number(p.amount_sen) - allocated,
        ];
      });
  } else {
    headers = ['Ukuran', 'Nilai', 'Unit'];
    const inv = all('invoices').filter(
      (i) => i.period === month && !['draft', 'void'].includes(String(i.status)),
    );
    rows = [
      ['Murid aktif', all('students').filter((s) => s.status === 'active').length, 'murid'],
      ['Kelas aktif', all('classes').filter((c) => c.active).length, 'kelas'],
      ['Sesi dilaksana', sessions.filter((s) => s.status === 'completed').length, 'sesi'],
      ['Jumlah dibilkan', inv.reduce((n, i) => n + Number(i.total_sen), 0), 'sen'],
      [
        'Baki belum bayar',
        inv.reduce(
          (n, i) => n + invoiceBalance(i, all('payments'), all('payment_allocations')).outstanding,
          0,
        ),
        'sen',
      ],
    ];
  }
  return {
    code,
    title: REPORTS[code],
    month,
    headers,
    rows,
    total_sen,
    generated_at: new Date().toISOString(),
    generated_by: by,
    demo,
  };
}
export function reportMetadata(r: Report) {
  return [
    ['Akademi', ORGANIZATION],
    ['Laporan', r.title],
    ['Bulan', r.month],
    ['Dijana oleh', r.generated_by],
    ['Dijana pada', r.generated_at],
    ['Zon masa', 'Asia/Kuala_Lumpur'],
    ['Jumlah baris', r.rows.length],
    ['Unit wang', 'RM (dikira daripada integer sen)'],
    ['Jumlah laporan (RM)', r.total_sen / 100],
    ['Versi skema', '1'],
    ['Mod', r.demo ? 'DEMO FIKSYEN' : 'Pangkalan data berizin'],
  ];
}
export function toCsv(r: Report) {
  return (
    '\uFEFF' +
    [r.headers, ...r.rows]
      .map((row) => row.map((v) => `"${String(safeCell(v)).replace(/"/g, '""')}"`).join(','))
      .join('\r\n')
  );
}
