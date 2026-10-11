import type { SupabaseClient } from '@supabase/supabase-js';
import { Dataset } from './core';
export const projections: Record<string, string> = {
  monthly_student_reports: 'id,student_id,period,status,snapshot,approved_at,created_at',
  report_deliveries: 'id,report_id,guardian_id,status,note,updated_at,created_at',
  program_fee_rates: 'id,program_code,duration_minutes,amount_sen,effective_from,effective_to',
  tutor_payment_details: 'id,staff_id,job_title,department,bank_name,account_holder,account_number',
  tutor_month_payments:
    'id,staff_id,period,amount_sen,sessions,paid_on,reference,status,void_reason,created_at',
  tutor_applications: 'id,display_name,status,created_at',
  student_guardians: 'id,student_id,guardian_id,portal_allowed,is_billing_contact',
  organizations: 'id,name,phone,address,logo_path',
  branches: 'id,name,timezone',
  students: 'id,full_name,preferred_name,status,registration_date',
  guardians: 'id,full_name,email,phone,active',
  staff_profiles: 'id,display_name,active',
  subjects: 'id,slug,name',
  programs: 'id,subject_id,code,name,curriculum_version',
  curriculum_units: 'id,program_id,code,name,outcome,sort_order',
  classes: 'id,program_id,name,mode,delivery,max_capacity,venue,active',
  class_tutors: 'id,class_id,staff_id,starts_on,ends_on',
  class_schedules:
    'id,class_id,day_of_week,start_time,duration_minutes,effective_from,effective_to',
  enrollments: 'id,student_id,class_id,starts_on,ends_on,status,planned_quota',
  class_sessions:
    'id,class_id,tutor_id,starts_at,ends_at,status,review_status,topic,verified_by,approved_by',
  attendance: 'id,session_id,student_id,status,reason,reading',
  generated_parent_comments:
    'id,session_id,student_id,selections,template_version,text,status,published_at,created_at',
  student_progress: 'id,student_id,session_id,mastery,parent_notes,published_at',
  student_skill_levels: 'id,student_id,curriculum_unit_id,mastery',
  assessment_options: 'id,subject_id,group_code,code,label,active,rubric_version',
  fee_plans: 'id,name,basis,amount_sen,due_day,active',
  fee_assignments: 'id,enrollment_id,fee_plan_id,override_sen,effective_from,effective_to',
  invoices: 'id,guardian_id,number,issued_on,due_on,period,total_sen,status',
  invoice_items:
    'id,invoice_id,student_id,description,quantity,unit_price_sen,discount_sen,total_sen',
  payments: 'id,guardian_id,paid_on,method,amount_sen,reference,status,verified_by',
  payment_allocations: 'id,payment_id,invoice_id,amount_sen',
  payment_evidence: 'id,payment_id,content_type,size_bytes',
  receipts: 'id,payment_id,number,details,status',
  tutor_allowance_rates:
    'id,program_code,duration_minutes,amount_sen,effective_from,effective_to,source',
  tutor_allowance_entries:
    'id,session_id,tutor_id,rate_snapshot_sen,amount_sen,status,verified_by,approved_by,batch_id',
  tutor_payout_batches: 'id,period,status,total_sen,maker_id,checker_id,reference',
  tutor_payouts: 'id,batch_id,tutor_id,amount_sen,reference,paid_at',
  tutor_adjustments:
    'id,tutor_id,entry_id,amount_sen,reason,maker_id,checker_id,created_at,paid_at,payment_reference',
  export_jobs: 'id,report_type,filters,status,row_count,created_at,spreadsheet_url',
  private_import_rows:
    'id,reported_name,note,program_code,duration_minutes,reported_date,planned_quota,status,student_id,session_id',
  private_import_batches: 'id,period,reported_count,planned_count,indicative_sen,status',
};
export async function loadData(ctx: { db: SupabaseClient; org: string }): Promise<Dataset> {
  const pairs = await Promise.all(
    Object.entries(projections).map(async ([table, fields]) => {
      if (table === 'staff_profiles') {
        const { data, error } = await ctx.db.rpc('staff_directory_v2', { org: ctx.org });
        if (error) throw new Error('Gagal membaca direktori tutor');
        return [table, data ?? []] as const;
      }
      let query = ctx.db.from(table).select(fields).order('created_at');
      if (table === 'organizations') query = query.eq('id', ctx.org);
      else if (table !== 'staff_profiles') query = query.eq('organization_id', ctx.org);
      // Pagination avoids Supabase's default 1000-row truncation. Every page remains under RLS.
      const rows = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await query.range(offset, offset + 999);
        if (error) throw new Error(`Gagal membaca ${table}`);
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return [table, rows] as const;
    }),
  );
  const dataset = Object.fromEntries(pairs) as unknown as Dataset;
  const logo = dataset.organizations[0]?.logo_path;
  if (logo) {
    const { data } = await ctx.db.storage.from('academy-logos').createSignedUrl(String(logo), 3600);
    if (data) dataset.organizations[0].logo_url = data.signedUrl;
  }
  return dataset;
}
