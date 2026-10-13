-- PADAM SEORANG TUTOR DAN SEMUA DATANYA — TIDAK BOLEH DIUNDUR.
-- Jalankan dalam Supabase → SQL Editor. BUKAN migrasi.
--
-- Dipadam: profil, keahlian dan akaun log masuk tutor; kelas yang diajarnya; murid kelas itu; sesi,
--   kehadiran, penilaian, ulasan, bacaan, rumusan, laporan bulanan; penjaga murid itu; invois, bayaran,
--   resit; elaun/payslip/maklumat bank; kadar khas kelas/tutor; log audit berkaitan (termasuk tindakan admin
--   ke atas data ini).
-- Pagar keselamatan (tiada apa dipadam jika gagal): nama mesti tepat sepadan dengan SEORANG tutor, dan
--   murid/kelas/penjaga tutor itu tidak boleh dikongsi dengan tutor lain.
--
-- >>> Tukar nama di bawah jika perlu (huruf besar/kecil mesti tepat). <<<
begin;
create temporary table rm_target on commit drop as select 'AHMAD NAJIB'::text as display_name;

-- 1) Tentukan skop.
create temporary table rm_staff on commit drop as
 select p.id as staff_id, p.auth_user_id, m.organization_id as org
 from public.staff_profiles p
 join public.staff_memberships m on m.staff_id = p.id and m.role = 'tutor'
 where p.display_name = (select display_name from rm_target);
create temporary table rm_classes on commit drop as
 select distinct ct.class_id from public.class_tutors ct where ct.staff_id in (select staff_id from rm_staff);
create temporary table rm_students on commit drop as
 select distinct e.student_id from public.enrollments e where e.class_id in (select class_id from rm_classes);
create temporary table rm_sessions on commit drop as
 select s.id from public.class_sessions s
 where s.class_id in (select class_id from rm_classes) or s.tutor_id in (select staff_id from rm_staff);
create temporary table rm_guardians on commit drop as
 select distinct sg.guardian_id from public.student_guardians sg where sg.student_id in (select student_id from rm_students);
create temporary table rm_invoices on commit drop as
 select i.id from public.invoices i where i.guardian_id in (select guardian_id from rm_guardians);
create temporary table rm_payments on commit drop as
 select p.id from public.payments p where p.guardian_id in (select guardian_id from rm_guardians);
create temporary table rm_reports on commit drop as
 select r.id from public.monthly_student_reports r where r.student_id in (select student_id from rm_students);

-- 2) Pagar keselamatan.
do $$
begin
 if (select count(*) from rm_staff) <> 1 then
  raise exception 'Nama tutor mesti sepadan dengan tepat seorang tutor (jumpa %).', (select count(*) from rm_staff);
 end if;
 if exists(select 1 from public.class_tutors ct where ct.class_id in (select class_id from rm_classes)
   and ct.staff_id not in (select staff_id from rm_staff)) then
  raise exception 'Ada kelas tutor ini yang pernah diajar tutor lain — dibatalkan.';
 end if;
 if exists(select 1 from public.enrollments e where e.student_id in (select student_id from rm_students)
   and e.class_id not in (select class_id from rm_classes)) then
  raise exception 'Ada murid tutor ini yang turut belajar dengan tutor lain — dibatalkan.';
 end if;
 if exists(select 1 from public.student_guardians sg where sg.guardian_id in (select guardian_id from rm_guardians)
   and sg.student_id not in (select student_id from rm_students)) then
  raise exception 'Ada penjaga yang juga penjaga murid tutor lain — dibatalkan.';
 end if;
end $$;

-- 3) Padam data (anak dahulu, induk kemudian).
delete from public.report_deliveries where report_id in (select id from rm_reports) or guardian_id in (select guardian_id from rm_guardians);
delete from public.monthly_student_reports where id in (select id from rm_reports);
delete from public.monthly_tutor_remarks where student_id in (select student_id from rm_students);
delete from public.generated_parent_comments where session_id in (select id from rm_sessions) or student_id in (select student_id from rm_students);
delete from public.assessment_responses where session_id in (select id from rm_sessions) or student_id in (select student_id from rm_students);
delete from public.attendance where session_id in (select id from rm_sessions) or student_id in (select student_id from rm_students);
delete from public.student_skill_levels where student_id in (select student_id from rm_students);
delete from public.student_progress where session_id in (select id from rm_sessions) or student_id in (select student_id from rm_students);
delete from public.student_private_notes where session_id in (select id from rm_sessions) or student_id in (select student_id from rm_students);
delete from public.private_import_rows where session_id in (select id from rm_sessions) or student_id in (select student_id from rm_students);
delete from public.tutor_adjustments where tutor_id in (select staff_id from rm_staff)
 or entry_id in (select e.id from public.tutor_allowance_entries e where e.session_id in (select id from rm_sessions));
delete from public.tutor_allowance_entries where session_id in (select id from rm_sessions) or tutor_id in (select staff_id from rm_staff);
delete from public.tutor_payouts where tutor_id in (select staff_id from rm_staff);
delete from public.receipts where payment_id in (select id from rm_payments);
delete from public.payment_evidence where payment_id in (select id from rm_payments);
delete from public.payment_allocations where payment_id in (select id from rm_payments) or invoice_id in (select id from rm_invoices);
delete from public.payments where id in (select id from rm_payments);
delete from public.invoice_items where invoice_id in (select id from rm_invoices) or student_id in (select student_id from rm_students);
delete from public.invoices where id in (select id from rm_invoices);
delete from public.fee_assignments where enrollment_id in (select e.id from public.enrollments e where e.class_id in (select class_id from rm_classes));
delete from public.class_rate_overrides where class_id in (select class_id from rm_classes);
delete from public.tutor_rate_overrides where staff_id in (select staff_id from rm_staff);
delete from public.enrollments where class_id in (select class_id from rm_classes) or student_id in (select student_id from rm_students);
delete from public.class_tutors where class_id in (select class_id from rm_classes) or staff_id in (select staff_id from rm_staff);
delete from public.class_schedules where class_id in (select class_id from rm_classes);
delete from public.class_sessions where id in (select id from rm_sessions);
delete from public.classes where id in (select class_id from rm_classes);
delete from public.guardian_sessions where guardian_id in (select guardian_id from rm_guardians);
delete from public.guardian_invitations where guardian_id in (select guardian_id from rm_guardians);
delete from public.student_guardians where student_id in (select student_id from rm_students) or guardian_id in (select guardian_id from rm_guardians);
delete from public.guardians where id in (select guardian_id from rm_guardians);
delete from public.students where id in (select student_id from rm_students);
delete from public.tutor_payment_details where staff_id in (select staff_id from rm_staff);
delete from public.tutor_month_payments where staff_id in (select staff_id from rm_staff);
delete from public.tutor_applications where auth_user_id in (select auth_user_id from rm_staff);
-- Log audit tutor ini dan log admin ke atas data yang dipadam.
delete from public.audit_events where actor_id in (select auth_user_id from rm_staff)
 or object_id in (select staff_id from rm_staff) or object_id in (select class_id from rm_classes)
 or object_id in (select student_id from rm_students) or object_id in (select id from rm_sessions)
 or object_id in (select guardian_id from rm_guardians) or object_id in (select id from rm_invoices)
 or object_id in (select id from rm_payments) or object_id in (select id from rm_reports);
delete from public.staff_memberships where staff_id in (select staff_id from rm_staff);
delete from public.staff_profiles where id in (select staff_id from rm_staff);
delete from auth.users where id in (select auth_user_id from rm_staff where auth_user_id is not null);

-- Ringkasan (semua patut 0).
select
 (select count(*) from public.staff_profiles where display_name = (select display_name from rm_target)) as tutor_tinggal,
 (select count(*) from public.students where id in (select student_id from rm_students)) as murid_tinggal,
 (select count(*) from public.class_sessions where id in (select id from rm_sessions)) as sesi_tinggal,
 (select count(*) from public.invoices where id in (select id from rm_invoices)) as invois_tinggal;
commit;
