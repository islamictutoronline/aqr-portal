import {
  Dataset,
  Row,
  Role,
  rateReference,
  skillOptions,
  participationOptions,
  focusOptions,
  practiceOptions,
  generateComment,
} from './core';
export function demoData(): Dataset {
  const row = (id: string, values: Record<string, unknown>): Row => ({
    id,
    organization_id: 'demo',
    ...values,
  });
  const subjects = ['mengaji', 'fardhu_ain', 'bahasa_arab'].map((slug, i) =>
    row(`subject-${i}`, { slug, name: ['Mengaji', 'Fardhu Ain', 'Bahasa Arab'][i] }),
  );
  const programs = [
    'IQRA',
    'KELANCARAN_AQ',
    'PRA_TAHFIZ',
    'FARDHU_AIN_KAFA',
    'BAHASA_ARAB',
    'TAHSIN_AQ',
  ].map((code, i) =>
    row(`program-${i}`, {
      code,
      name: rateReference.find((r) => r[0] === code)![1],
      subject_id: `subject-${i === 3 ? 1 : i === 4 ? 2 : 0}`,
      curriculum_version: '1',
    }),
  );
  const students = Array.from({ length: 12 }, (_, i) =>
    row(`student-${i}`, {
      full_name: `Murid Contoh ${String(i + 1).padStart(2, '0')}`,
      status: 'active',
      registration_date: '2026-10-01',
      preferred_name: `Contoh ${i + 1}`,
    }),
  );
  const guardians = Array.from({ length: 5 }, (_, i) =>
    row(`guardian-${i}`, {
      full_name: `Penjaga Contoh ${i + 1}`,
      email: `penjaga${i + 1}@example.invalid`,
      // No. rekaan untuk demo sahaja.
      phone: `+6011000000${i + 1}`,
      active: true,
    }),
  );
  const tutors = Array.from({ length: 3 }, (_, i) =>
    row(`tutor-${i}`, { display_name: `Tutor Contoh ${i + 1}`, active: true, role: 'tutor' }),
  );
  const classes = programs.map((p, i) =>
    row(`class-${i}`, {
      name: `${p.name} · ${i % 2 === 0 ? 'Alif' : 'Baa'}`,
      program_id: p.id,
      mode: i === 5 ? 'one_to_one' : 'group',
      delivery: i === 4 ? 'online' : 'physical',
      max_capacity: i === 5 ? 1 : 8,
      active: true,
      venue: i === 4 ? 'Dalam talian' : `Bilik ${i + 1}`,
    }),
  );
  const enrollments = students.map((s, i) =>
    row(`enroll-${i}`, {
      student_id: s.id,
      class_id: `class-${i === 11 ? 5 : i % 5}`,
      starts_on: '2026-01-01',
      status: 'active',
      planned_quota: 4,
    }),
  );
  const sessions = Array.from({ length: 18 }, (_, i) => {
    const day = 8 + Math.floor(i / 6);
    const hour = 8 + (i % 6);
    return row(`session-${i}`, {
      class_id: `class-${i % 6}`,
      tutor_id: `tutor-${i % 3}`,
      starts_at: `2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+08:00`,
      ends_at: `2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:30:00+08:00`,
      status: i < 12 ? 'completed' : 'scheduled',
      review_status: i < 6 ? 'approved' : 'reported',
      verified_by: i < 6 ? 'demo-finance' : null,
      approved_by: i < 6 ? 'demo-owner' : null,
      topic: 'Latihan berpandukan kurikulum',
    });
  });
  const attendance = sessions
    .filter((s) => s.status === 'completed')
    .flatMap((s) =>
      enrollments
        .filter((e) => e.class_id === s.class_id)
        .map((e) =>
          row(`attendance-${s.id}-${e.student_id}`, {
            session_id: s.id,
            student_id: e.student_id,
            status: 'present',
          }),
        ),
    );
  const comments = attendance
    .filter((a) => a.student_id !== 'student-10')
    .map((a, i) => {
      const session = sessions.find((s) => s.id === a.session_id)!;
      const cls = classes.find((c) => c.id === session.class_id)!;
      const subject = subjects.find(
        (s) => s.id === programs.find((p) => p.id === cls.program_id)!.subject_id,
      )!;
      const selections = {
        skill: skillOptions[String(subject.slug)][0][0],
        mastery: 3,
        participation: 'aktif',
        focus: 'ulangan',
      };
      return row(`comment-${i}`, {
        session_id: a.session_id,
        student_id: a.student_id,
        selections,
        text: generateComment(String(subject.slug), 'present', selections),
        status: i % 4 === 0 ? 'draft' : 'published',
        template_version: '1',
        created_at: session.starts_at,
        published_at: session.starts_at,
      });
    });
  const options = subjects.flatMap((s) =>
    [
      ['skill', skillOptions[String(s.slug)]],
      ['participation', participationOptions],
      ['focus', focusOptions],
      ['home_practice', practiceOptions],
    ].flatMap(([group, list]) =>
      (list as readonly (readonly [string, string])[]).map(([code, label]) =>
        row(`option-${s.id}-${group}-${code}`, {
          subject_id: s.id,
          group_code: group,
          code,
          label,
          active: true,
          rubric_version: '1',
        }),
      ),
    ),
  );
  return {
    organizations: [row('demo', { name: 'Akademi Al-Quran Ar-Riyadh (AQR)' })],
    branches: [row('branch-demo', { name: 'Pusat contoh', timezone: 'Asia/Kuala_Lumpur' })],
    students,
    guardians,
    staff_profiles: tutors,
    subjects,
    programs,
    classes,
    enrollments,
    class_sessions: sessions,
    attendance,
    class_tutors: classes.map((c, i) =>
      row(`assignment-${i}`, {
        class_id: c.id,
        staff_id: `tutor-${i % 3}`,
        starts_on: '2026-01-01',
      }),
    ),
    class_schedules: classes.map((c, i) =>
      row(`schedule-${i}`, {
        class_id: c.id,
        day_of_week: i,
        start_time: `${String(8 + i).padStart(2, '0')}:00`,
        duration_minutes: 30,
      }),
    ),
    student_guardians: students.flatMap((s, i) => [
      row(`link-${i}`, {
        student_id: s.id,
        guardian_id: `guardian-${i % 5}`,
        portal_allowed: true,
        is_billing_contact: true,
      }),
      ...(i === 0
        ? [
            row('link-second', {
              student_id: s.id,
              guardian_id: 'guardian-1',
              portal_allowed: true,
              is_billing_contact: false,
            }),
          ]
        : []),
    ]),
    generated_parent_comments: comments,
    student_progress: [],
    student_skill_levels: [],
    assessment_options: options,
    curriculum_units: programs.flatMap((p) =>
      ['Asas', 'Latihan', 'Pengukuhan'].map((name, i) =>
        row(`unit-${p.id}-${i}`, { program_id: p.id, name, code: `U${i}`, sort_order: i }),
      ),
    ),
    invoices: [
      row('invoice-0', {
        guardian_id: 'guardian-0',
        number: 'DEMO-001',
        total_sen: 15000,
        status: 'partially_paid',
        due_on: '2026-10-05',
        issued_on: '2026-10-01',
        period: '2026-10',
      }),
      row('invoice-1', {
        guardian_id: 'guardian-1',
        number: 'DEMO-002',
        total_sen: 12000,
        status: 'paid',
        due_on: '2026-10-05',
        issued_on: '2026-10-01',
        period: '2026-10',
      }),
      row('invoice-2', {
        guardian_id: 'guardian-2',
        number: 'DEMO-003',
        total_sen: 10000,
        status: 'overdue',
        due_on: '2026-10-05',
        issued_on: '2026-10-01',
        period: '2026-10',
      }),
      row('invoice-3', {
        guardian_id: 'guardian-3',
        number: 'DEMO-004',
        total_sen: 0,
        status: 'draft',
        due_on: '2026-10-20',
        issued_on: '2026-10-01',
        period: '2026-10',
      }),
    ],
    payments: [
      row('payment-0', {
        guardian_id: 'guardian-0',
        amount_sen: 10000,
        status: 'verified',
        paid_on: '2026-10-03',
        method: 'bank_transfer',
        reference: 'CONTOH-001',
      }),
      row('payment-1', {
        guardian_id: 'guardian-1',
        amount_sen: 12000,
        status: 'verified',
        paid_on: '2026-10-03',
        method: 'duitnow_qr',
        reference: 'CONTOH-002',
      }),
      row('payment-2', {
        guardian_id: 'guardian-2',
        amount_sen: 5000,
        status: 'pending_verification',
        paid_on: '2026-10-05',
        method: 'bank_transfer',
      }),
      row('payment-3', {
        guardian_id: 'guardian-3',
        amount_sen: 2000,
        status: 'rejected',
        paid_on: '2026-10-05',
        method: 'bank_transfer',
      }),
    ],
    payment_allocations: [
      row('allocation-0', { payment_id: 'payment-0', invoice_id: 'invoice-0', amount_sen: 10000 }),
      row('allocation-1', { payment_id: 'payment-1', invoice_id: 'invoice-1', amount_sen: 12000 }),
    ],
    invoice_items: [
      row('item-0', {
        invoice_id: 'invoice-0',
        student_id: 'student-0',
        description: 'Contoh pengiraan yuran',
        quantity: 1,
        unit_price_sen: 15000,
        total_sen: 15000,
      }),
    ],
    receipts: [
      row('receipt-0', {
        payment_id: 'payment-0',
        number: 'DEMO-RESIT-001',
        status: 'valid',
        details: { amount_sen: 10000 },
      }),
    ],
    fee_plans: [],
    fee_assignments: [],
    tutor_allowance_rates: rateReference.map((r, i) =>
      row(`rate-${i}`, {
        program_code: r[0],
        program_name: r[1],
        duration_minutes: r[2],
        amount_sen: r[3],
        effective_from: '2026-01-01',
        source: '04_KADAR_ELAUN_TUTOR_AQR.csv · tarikh contoh',
      }),
    ),
    tutor_allowance_entries: sessions.slice(0, 6).map((s, i) =>
      row(`entry-${i}`, {
        session_id: s.id,
        tutor_id: s.tutor_id,
        rate_snapshot_sen: i === 3 ? 1000 : i === 4 ? 1300 : 900,
        amount_sen: i === 3 ? 1000 : i === 4 ? 1300 : 900,
        status: 'approved',
        verified_by: 'demo-finance',
        approved_by: 'demo-owner',
      }),
    ),
    tutor_payout_batches: [],
    tutor_payouts: [],
    tutor_adjustments: [],
    export_jobs: [],
    audit_events: [],
    private_import_rows: [],
  };
}
export function scopeDemo(
  data: Dataset,
  role: Role,
  guardian = 'guardian-0',
  tutor = 'tutor-0',
): Dataset {
  if (['owner', 'admin'].includes(role)) return data;
  const result: Dataset = { ...data };
  const studentIds =
    role === 'guardian'
      ? data.student_guardians
          .filter((l) => l.guardian_id === guardian && l.portal_allowed)
          .map((l) => l.student_id)
      : data.enrollments
          .filter((e) =>
            data.class_tutors.some((t) => t.class_id === e.class_id && t.staff_id === tutor),
          )
          .map((e) => e.student_id);
  // Seperti RLS can_class: tutor juga melihat kelas tugasannya walaupun belum ada murid.
  const classIds = [
    ...data.enrollments.filter((e) => studentIds.includes(e.student_id)).map((e) => e.class_id),
    ...(role === 'tutor'
      ? data.class_tutors.filter((t) => t.staff_id === tutor).map((t) => t.class_id)
      : []),
  ];
  result.students = data.students.filter((s) => studentIds.includes(s.id));
  result.enrollments = data.enrollments.filter((e) => studentIds.includes(e.student_id));
  result.classes = data.classes.filter((c) => classIds.includes(c.id));
  result.class_sessions = data.class_sessions.filter((s) => classIds.includes(s.class_id));
  result.attendance = data.attendance.filter((a) => studentIds.includes(a.student_id));
  result.generated_parent_comments = data.generated_parent_comments.filter(
    (c) => studentIds.includes(c.student_id) && (role !== 'guardian' || c.status === 'published'),
  );
  result.student_progress = data.student_progress.filter(
    (p) => studentIds.includes(p.student_id) && (role !== 'guardian' || p.published_at),
  );
  result.student_skill_levels = data.student_skill_levels.filter((p) =>
    studentIds.includes(p.student_id),
  );
  result.invoices =
    role === 'guardian'
      ? data.invoices.filter((i) => i.guardian_id === guardian && i.status !== 'draft')
      : [];
  result.payments =
    role === 'guardian' ? data.payments.filter((p) => p.guardian_id === guardian) : [];
  result.payment_allocations = data.payment_allocations.filter((a) =>
    result.invoices.some((i) => i.id === a.invoice_id),
  );
  result.invoice_items = data.invoice_items.filter((a) =>
    result.invoices.some((i) => i.id === a.invoice_id),
  );
  result.receipts = data.receipts.filter((r) => result.payments.some((p) => p.id === r.payment_id));
  result.tutor_allowance_entries =
    role === 'tutor' ? data.tutor_allowance_entries.filter((e) => e.tutor_id === tutor) : [];
  result.tutor_payouts =
    role === 'tutor' ? data.tutor_payouts.filter((p) => p.tutor_id === tutor) : [];
  result.tutor_adjustments =
    role === 'tutor' ? data.tutor_adjustments.filter((p) => p.tutor_id === tutor) : [];

  result.staff_profiles = role === 'tutor' ? data.staff_profiles.filter((t) => t.id === tutor) : [];
  result.student_guardians = data.student_guardians.filter((l) =>
    role === 'guardian' ? l.guardian_id === guardian : studentIds.includes(l.student_id),
  );
  // Seperti RLS: tutor melihat penjaga murid yang diajarnya.
  result.guardians =
    role === 'guardian'
      ? data.guardians.filter((g) => g.id === guardian)
      : data.guardians.filter((g) => result.student_guardians.some((l) => l.guardian_id === g.id));
  result.class_tutors = data.class_tutors.filter((t) => classIds.includes(t.class_id));
  result.class_schedules = data.class_schedules.filter((s) => classIds.includes(s.class_id));
  result.export_jobs = [];
  result.monthly_student_reports =
    role === 'guardian'
      ? (data.monthly_student_reports || []).filter(
          (r) => studentIds.includes(r.student_id) && r.status === 'approved',
        )
      : [];
  result.report_deliveries = [];
  result.tutor_applications = [];
  result.audit_events = [];
  result.private_import_rows = [];
  return result;
}
