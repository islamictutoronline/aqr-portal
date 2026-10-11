-- RESET DATA UJIAN AQR — TIDAK BOLEH DIUNDUR.
-- Jalankan sekali dalam Supabase → SQL Editor apabila mahu memulakan ujian baharu dari kosong.
-- BUKAN migrasi: jangan letak dalam supabase/migrations dan jangan jalankan pada data sebenar.
--
-- DIKEKALKAN: organisasi, cawangan, subjek, program, kurikulum, pilihan penilaian, templat ulasan,
--   pelan yuran, kadar elaun tutor, kadar yuran program, dan akaun pemilik/admin (boleh terus log masuk).
-- DIPADAM: semua tutor (profil, keahlian dan akaun log masuk), permohonan tutor, murid, penjaga,
--   kelas/jadual/sesi, kehadiran, penilaian, ulasan, laporan bulanan, invois, bayaran, resit,
--   elaun/payslip/maklumat bank, import, eksport, sambungan Google dan log audit.
begin;

-- 1) Data operasi. Senarai ini merangkumi setiap jadual yang merujuk antara satu sama lain,
--    jadi TRUNCATE tanpa CASCADE akan gagal (dan tiada apa dipadam) jika terlepas satu jadual.
truncate table
  public.report_deliveries,
  public.monthly_student_reports,
  public.generated_parent_comments,
  public.assessment_responses,
  public.attendance,
  public.student_skill_levels,
  public.student_progress,
  public.student_private_notes,
  public.private_import_rows,
  public.private_import_quotas,
  public.private_import_batches,
  public.tutor_adjustments,
  public.tutor_allowance_entries,
  public.tutor_payouts,
  public.tutor_payout_batches,
  public.receipts,
  public.payment_evidence,
  public.payment_allocations,
  public.payments,
  public.invoice_items,
  public.invoices,
  public.fee_assignments,
  public.enrollments,
  public.class_tutors,
  public.class_schedules,
  public.class_sessions,
  public.classes,
  public.guardian_sessions,
  public.guardian_invitations,
  public.student_guardians,
  public.guardians,
  public.students,
  public.tutor_payment_details,
  public.tutor_month_payments,
  public.tutor_applications,
  public.export_jobs,
  public.google_connections,
  public.audit_events
  restart identity;

-- 2) Tutor: buang keahlian bukan pemilik/admin, kemudian profil dan akaun log masuk yang tinggal tanpa keahlian.
create temporary table reset_tutor_users on commit drop as
  select p.id as staff_id, p.auth_user_id
  from public.staff_profiles p
  where not exists (
    select 1 from public.staff_memberships m
    where m.staff_id = p.id and m.role in ('owner', 'admin') and m.active
  );

delete from public.staff_memberships m
  using reset_tutor_users t
  where m.staff_id = t.staff_id;
delete from public.staff_profiles p
  using reset_tutor_users t
  where p.id = t.staff_id;
-- Akaun Auth tutor (dan pemohon yang belum diluluskan) — semua akaun kecuali pemilik/admin.
delete from auth.users u
  where not exists (
    select 1 from public.staff_profiles p where p.auth_user_id = u.id
  );

-- 3) Semakan keselamatan: mesti masih ada sekurang-kurangnya seorang pemilik/admin aktif.
do $$
begin
  if not exists (
    select 1 from public.staff_memberships m
    join public.staff_profiles p on p.id = m.staff_id
    where m.role in ('owner', 'admin') and m.active and p.auth_user_id is not null
  ) then
    raise exception 'Tiada pemilik/admin yang tinggal — reset dibatalkan.';
  end if;
end $$;

commit;

-- Ringkasan selepas reset (semua patut 0 kecuali pentadbir, program dan kadar).
select
  (select count(*) from public.staff_memberships) as pentadbir_kekal,
  (select count(*) from auth.users) as akaun_log_masuk,
  (select count(*) from public.programs) as program_kekal,
  (select count(*) from public.tutor_allowance_rates) as kadar_elaun_kekal,
  (select count(*) from public.program_fee_rates) as kadar_yuran_kekal,
  (select count(*) from public.students) as murid,
  (select count(*) from public.class_sessions) as sesi,
  (select count(*) from public.monthly_student_reports) as laporan,
  (select count(*) from public.tutor_applications) as permohonan_tutor;
