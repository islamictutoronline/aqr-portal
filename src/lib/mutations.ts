import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assessmentSchema, Role } from './core';
function requireRoles(ctx: { role: Role }, roles: Role[]) {
  if (!roles.includes(ctx.role)) throw new Error('Akses tidak dibenarkan');
}
const uuid = z.string().uuid();
const text = z.string().trim().min(1).max(200);
const schemas = {
  student: z.object({ full_name: text, preferred_name: z.string().max(80).optional() }),
  guardian: z.object({
    full_name: text,
    email: z.email().optional(),
    phone: z
      .string()
      .regex(/^\+[1-9][0-9]{7,14}$/)
      .optional(),
  }),
  link: z.object({
    student_id: uuid,
    guardian_id: uuid,
    relation: z.enum(['ibu', 'bapa', 'penjaga']),
    portal_allowed: z.boolean(),
    is_billing_contact: z.boolean(),
  }),
  class: z.object({
    name: text,
    program_id: uuid,
    mode: z.enum(['group', 'one_to_one']),
    delivery: z.enum(['physical', 'online']),
    max_capacity: z.number().int().min(1).max(100),
    venue: z.string().max(200).optional(),
  }),
  enrollment: z.object({
    student_id: uuid,
    class_id: uuid,
    starts_on: z.iso.date(),
    planned_quota: z.number().int().min(0).max(100).optional(),
  }),
  assignment: z.object({
    class_id: uuid,
    staff_id: uuid,
    starts_on: z.iso.date(),
    ends_on: z.iso.date().optional(),
  }),
  schedule: z.object({
    class_id: uuid,
    day_of_week: z.number().int().min(0).max(6),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    duration_minutes: z.number().int().min(5).max(240),
    effective_from: z.iso.date(),
  }),
  program: z.object({ subject_id: uuid, code: z.string().regex(/^[A-Z_]+$/), name: text }),
  unit: z.object({
    program_id: uuid,
    code: text,
    name: text,
    outcome: z.string().max(500).optional(),
    sort_order: z.number().int().min(0),
  }),
  fee_plan: z.object({
    name: text,
    basis: z.enum(['monthly', 'per_session', 'package']),
    amount_sen: z.number().int().min(0),
    due_day: z.number().int().min(1).max(28),
  }),
  session: z.object({
    cid: uuid,
    tid: uuid,
    start_time: z.iso.datetime({ offset: true }),
    minutes: z.number().int().min(5).max(240),
    lesson_topic: z.string().max(500),
  }),
  assessment: z.object({
    sid: uuid,
    student: uuid,
    attendance_status: z.enum(['present', 'late', 'absent', 'excused', 'makeup']),
    selected: assessmentSchema,
    publish: z.boolean(),
  }),
  rate: z.object({
    program: text,
    minutes: z.number().int().min(5).max(240),
    amount: z.number().int().positive(),
    effective: z.iso.date(),
    provenance: z.string().min(3).max(500),
  }),
  review: z.object({ sid: uuid, approve: z.boolean() }),
  invoice: z.object({
    guardian: uuid,
    due: z.iso.date(),
    billing_period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    items: z
      .array(
        z.object({
          student_id: uuid,
          description: text,
          quantity: z.number().int().positive(),
          unit_price_sen: z.number().int().nonnegative(),
          discount_sen: z.number().int().nonnegative().default(0),
        }),
      )
      .min(1)
      .max(100),
    idem: z.string().min(8).max(100),
  }),
  payment: z.object({
    guardian: uuid,
    amount: z.number().int().positive(),
    payment_method: z.enum(['cash', 'bank_transfer', 'duitnow_qr', 'other']),
    payment_ref: z.string().max(200),
    idem: z.string().min(8).max(100),
  }),
  verify: z.object({ pid: uuid, inv: uuid, allocation: z.number().int().positive() }),
  reverse: z.object({ pid: uuid, reason: z.string().min(5).max(500) }),
  payout: z.object({
    billing_period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    action: z.enum(['create', 'approve', 'pay']),
    batch: uuid.nullable().optional(),
    payment_ref: z.string().max(200).nullable().optional(),
  }),
  settings: z.object({
    name: z.literal('Akademi Al-Quran Ar-Riyadh (AQR)'),
    phone: z
      .string()
      .regex(/^\+[1-9][0-9]{7,14}$/)
      .nullable(),
    address: z.string().max(500).nullable(),
  }),
  archive: z.object({ id: uuid }),
  fee_assignment: z.object({
    enrollment_id: uuid,
    fee_plan_id: uuid,
    effective_from: z.iso.date(),
    effective_to: z.iso.date().optional(),
    override_sen: z.number().int().nonnegative().optional(),
  }),
  assessment_option: z.object({
    subject_id: uuid,
    group_code: z.enum(['skill', 'participation', 'focus', 'home_practice']),
    code: z.string().regex(/^[a-z_]+$/),
    label: text,
    rubric_version: z.literal('1'),
  }),
  adjustment: z.object({
    entry: uuid,
    amount: z.number().int(),
    reason: z.string().min(5).max(500),
    adjustment: uuid.optional(),
  }),
  milestone: z.object({
    sid: uuid,
    student: uuid,
    unit: uuid,
    score: z.number().int().min(1).max(5),
    notes: z.string().max(1000),
    homework: z.string().max(500),
    publish: z.boolean(),
  }),
  generate_invoices: z.object({ billing_period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }),
  reject: z.object({ pid: uuid, reason: z.string().min(5).max(500) }),
  map_import: z.object({ import_row: uuid, student: uuid, session: uuid }),
  generate_schedule: z.object({
    schedule: uuid,
    tutor: uuid,
    date_from: z.iso.date(),
    date_to: z.iso.date(),
  }),
  change_session: z.object({
    sid: uuid,
    new_status: z.enum(['cancelled', 'rescheduled']),
    reason: z.string().min(5).max(500),
    new_start: z.iso.datetime({ offset: true }).optional(),
  }),
  pay_adjustment: z.object({ adjustment: uuid, payment_ref: z.string().min(3).max(200) }),
  prepare_report: z.object({
    student: uuid,
    report_month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  }),
  approve_report: z.object({ report: uuid }),
  report_delivery: z.object({
    report: uuid,
    guardian: uuid,
    delivery_status: z.enum(['prepared', 'sent', 'acknowledged', 'failed']),
    delivery_note: z.string().max(500).default(''),
  }),
  tutor_application: z.object({ application: uuid, accept: z.boolean() }),
  tutor_student: z.object({ cid: uuid, student_name: text }),
  tutor_add_student: z.object({ student_name: text, program_id: uuid }),
  tutor_enrol: z.object({
    student_name: text,
    program_id: uuid,
    minutes: z.union([z.literal(20), z.literal(30)]),
    slots: z
      .array(
        z.object({
          day: z.number().int().min(0).max(6),
          time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        }),
      )
      .min(1)
      .max(7),
    end_date: z.iso.date(),
    start_date: z.iso.date(),
    guardian_name: z.string().max(200).default(''),
    guardian_phone: z.string().max(30).default(''),
  }),
  save_guardian: z.object({
    student_id: uuid,
    guardian_name: z.string().max(200).default(''),
    guardian_phone: z.string().max(30).default(''),
  }),
  remove_student: z.object({ student_id: uuid }),
  extend_schedule: z.object({}),
  void_session: z.object({ sid: uuid }),
  remove_tutor: z.object({ staff_id: uuid }),
  invoice_paid: z.object({
    inv: uuid,
    paid_on: z.iso.date(),
    payment_method: z.enum(['cash', 'bank_transfer', 'duitnow_qr', 'other']),
    payment_ref: z.string().max(120).default(''),
  }),
  tutor_paid: z.object({
    staff_id: uuid,
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    amount_sen: z.number().int().positive(),
    sessions: z.number().int().min(0),
    paid_on: z.iso.date(),
    payment_ref: z.string().max(120).default(''),
  }),
  void_tutor_paid: z.object({ pid: uuid, reason: z.string().trim().min(3).max(200) }),
  month_package: z.object({
    billing_period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  }),
  generate_session_invoices: z.object({
    billing_period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  }),
  save_payment_details: z.object({
    staff_id: uuid,
    job_title: z.string().max(80),
    department: z.string().max(80),
    bank_name: z.string().max(80),
    account_holder: z.string().max(120),
    account_number: z.string().max(40),
  }),
  move_session: z.object({ sid: uuid, new_start: z.iso.datetime({ offset: true }) }),
  add_program: z.object({ student_id: uuid, program_id: uuid, tutor_id: uuid.optional() }),
  tutor_class: z.object({
    program_id: uuid,
    class_name: text,
    class_mode: z.enum(['group', 'one_to_one']),
    class_delivery: z.enum(['physical', 'online']),
    capacity: z.number().int().min(1).max(100),
    class_venue: z.string().max(200).optional(),
  }),
};

export async function executeMutation(
  ctx: { db: SupabaseClient; org: string; role: Role },
  input: unknown,
) {
  const { operation, payload } = z
    .object({
      operation: z.enum(
        Object.keys(schemas) as [keyof typeof schemas, ...(keyof typeof schemas)[]],
      ),
      payload: z.unknown(),
    })
    .parse(input);
  if (ctx.role === 'guardian') throw new Error('Portal penjaga baca sahaja');
  const fields = schemas[operation].parse(payload);
  const tables: Partial<Record<keyof typeof schemas, string>> = {
    student: 'students',
    guardian: 'guardians',
    link: 'student_guardians',
    class: 'classes',
    enrollment: 'enrollments',
    assignment: 'class_tutors',
    schedule: 'class_schedules',
    program: 'programs',
    unit: 'curriculum_units',
    fee_plan: 'fee_plans',
    fee_assignment: 'fee_assignments',
    assessment_option: 'assessment_options',
  };
  let result;
  if (tables[operation]) {
    requireRoles(ctx, ['owner', 'admin']);
    result = await ctx.db
      .from(tables[operation]!)
      .insert({ ...fields, organization_id: ctx.org })
      .select('id')
      .single();
  } else if (operation === 'settings') {
    requireRoles(ctx, ['owner']);
    result = await ctx.db
      .from('organizations')
      .update(fields)
      .eq('id', ctx.org)
      .select('id')
      .single();
  } else if (operation === 'archive') {
    requireRoles(ctx, ['owner', 'admin']);
    result = await ctx.db
      .from('students')
      .update({ status: 'archived' })
      .eq('organization_id', ctx.org)
      .eq('id', (fields as { id: string }).id)
      .select('id')
      .single();
  } else if (operation === 'month_package') {
    // Admin: draf laporan bulanan setiap murid aktif (yang belum diluluskan) + invois ikut sesi.
    requireRoles(ctx, ['owner', 'admin']);
    const period = (fields as { billing_period: string }).billing_period;
    const [students, approved] = await Promise.all([
      ctx.db.from('students').select('id').eq('organization_id', ctx.org).neq('status', 'archived'),
      ctx.db
        .from('monthly_student_reports')
        .select('student_id')
        .eq('organization_id', ctx.org)
        .eq('period', period)
        .eq('status', 'approved'),
    ]);
    if (students.error || approved.error) throw new Error('Senarai murid tidak dapat dibaca');
    const locked = new Set((approved.data ?? []).map((r) => r.student_id));
    result = { data: null, error: null } as { data: unknown; error: unknown };
    for (const st of students.data ?? []) {
      if (locked.has(st.id)) continue;
      result = await ctx.db.rpc('prepare_student_report', {
        org: ctx.org,
        student: st.id,
        report_month: period,
      });
      if (result.error) break;
    }
    if (!result.error)
      result = await ctx.db.rpc('generate_session_invoices', {
        org: ctx.org,
        billing_period: period,
      });
  } else {
    const rpc: Record<string, string> = {
      prepare_report: 'prepare_student_report',
      approve_report: 'approve_student_report',
      report_delivery: 'record_report_delivery',
      tutor_application: 'review_tutor_application',
      tutor_student: 'tutor_register_student',
      tutor_class: 'tutor_create_class',
      tutor_add_student: 'tutor_add_student',
      add_program: 'add_student_program',
      tutor_enrol: 'tutor_enrol_student',
      save_guardian: 'save_student_guardian',
      invoice_paid: 'mark_invoice_paid',
      tutor_paid: 'mark_tutor_paid',
      void_tutor_paid: 'void_tutor_payment',
      remove_student: 'remove_student',
      extend_schedule: 'extend_schedule',
      void_session: 'void_session',
      remove_tutor: 'remove_tutor',
      generate_session_invoices: 'generate_session_invoices',
      save_payment_details: 'save_payment_details',
      move_session: 'move_session',
      session: 'create_session',
      assessment: 'record_assessment',
      rate: 'set_rate',
      review: 'review_session',
      invoice: 'create_invoice',
      payment: 'submit_payment',
      verify: 'verify_payment',
      reverse: 'reverse_payment',
      payout: 'payout_batch',
      adjustment: 'adjust_allowance',
      milestone: 'record_milestone',
      generate_invoices: 'generate_invoices',
      reject: 'reject_payment',
      map_import: 'map_import',
      generate_schedule: 'generate_schedule',
      change_session: 'change_session',
      pay_adjustment: 'pay_adjustment',
    };
    result = await ctx.db.rpc(rpc[operation], { org: ctx.org, ...fields });
  }
  if (result.error) {
    // Mesej daripada `raise exception` dalam fungsi kita ditulis dalam Bahasa Melayu dan selamat
    // dipaparkan; ralat sistem lain kekal umum.
    const { code, message } = result.error as { code?: string; message?: string };
    throw new Error(
      code === 'P0001' && message
        ? message
        : 'Rekod tidak dapat disimpan. Semak kelayakan, status dan peranan penyemak.',
    );
  }
  return { id: result.data, saved: true };
}
