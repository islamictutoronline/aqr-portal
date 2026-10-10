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
// dibayar; Berizin tidak dibayar. Sesi tanpa kadar dipaparkan dengan rate_sen null.
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
      let rate: number | null = null;
      try {
        rate = Number(
          findRate(rates, String(program?.code), minutes, klDay(String(s.starts_at))).amount_sen,
        );
      } catch {
        rate = null;
      }
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
  // Nama kakitangan, bukan ID dalaman; ID yang tiada profil dipaparkan sebagai kakitangan umum.
  const staffName = (id: unknown) =>
    id ? (all('staff_profiles').find((r) => r.id === id)?.display_name ?? 'Kakitangan') : '—';
  const option = (code: unknown) =>
    code == null
      ? '—'
      : String(all('assessment_options').find((o) => o.code === code)?.label ?? code);
  const sessionProgram = (s: Row) =>
    all('programs').find(
      (p) => p.id === all('classes').find((c) => c.id === s.class_id)?.program_id,
    );
  if (code === 'monthly_teaching') {
    headers = [
      'Tarikh',
      'ID sesi',
      'Tutor',
      'Murid',
      'Program',
      'Tempoh min',
      'Kuota dirancang',
      'Status',
      'Semakan',
      'Nota',
      'Penyemak',
    ];
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
          s.id,
          find('staff_profiles', s.tutor_id, 'display_name'),
          find('students', e.student_id, 'full_name'),
          String(sessionProgram(s)?.name ?? '—'),
          (new Date(String(s.ends_at)).getTime() - new Date(String(s.starts_at)).getTime()) / 60000,
          Number(e.planned_quota ?? 0),
          statusLabel(s.status),
          statusLabel(s.review_status),
          String(s.topic ?? ''),
          String(staffName(s.verified_by)),
        ]),
    );
  } else if (code === 'attendance') {
    headers = ['Tarikh', 'ID sesi', 'Murid', 'Kelas', 'Kehadiran', 'Catatan'];
    rows = all('attendance')
      .filter(inMonth)
      .map((a) => {
        const s = sessions.find((s) => s.id === a.session_id)!;
        return [
          dateLabel(String(s.starts_at)),
          s.id,
          find('students', a.student_id, 'full_name'),
          find('classes', s.class_id, 'name'),
          statusLabel(a.status),
          String(a.reason ?? ''),
        ];
      });
  } else if (code === 'student_progress') {
    headers = [
      'Tarikh',
      'ID sesi',
      'Murid',
      'Kemahiran',
      'Skala',
      'Penglibatan',
      'Fokus',
      'Ulasan',
      'Status',
      'Versi',
    ];
    rows = all('generated_parent_comments')
      .filter(inMonth)
      .filter((c) => role !== 'guardian' || c.status === 'published')
      .map((c) => {
        const a = c.selections as Record<string, unknown>;
        return [
          dateLabel(String(sessions.find((s) => s.id === c.session_id)!.starts_at)),
          String(c.session_id),
          find('students', c.student_id, 'full_name'),
          option(a.skill),
          typeof a.mastery === 'number' ? a.mastery : 'Belum dinilai',
          option(a.participation),
          option(a.focus),
          String(c.text),
          statusLabel(c.status),
          String(c.template_version),
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
    headers = ['Tutor', 'Bulan', 'Kelompok', 'Amaun (sen)', 'Rujukan', 'Tarikh'];
    rows = all('tutor_payouts')
      .filter((p) =>
        all('tutor_payout_batches').some((b) => b.id === p.batch_id && b.period === month),
      )
      .map((p) => {
        total_sen += Number(p.amount_sen);
        return [
          find('staff_profiles', p.tutor_id, 'display_name'),
          month,
          String(p.batch_id),
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
        `Pelarasan ${adjustment.id}`,
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
