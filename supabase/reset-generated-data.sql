-- RESET JANAAN AQR — TIDAK BOLEH DIUNDUR. Jalankan sekali dalam Supabase → SQL Editor.
-- BUKAN migrasi: jangan letak dalam supabase/migrations.
--
-- DIPADAM: invois, item invois, bayaran yuran, peruntukan, resit, bukti bayaran; laporan bulanan
--   (draf & diluluskan) dan status penghantaran WhatsApp; rumusan tutor bulanan; elaun dibayar,
--   kelompok/payout/entri elaun dan pelarasan; sejarah eksport. Kehadiran (beserta ulasan, penilaian
--   dan kemajuan) pada kelas yang tutornya BUKAN tutor yang dikekalkan; kelas itu kembali "dijadualkan".
-- DIKEKALKAN: murid, penjaga, kelas, jadual, pendaftaran, akaun tutor/admin, kadar dan tetapan, semua
--   sesi, serta kehadiran (dengan bacaan, ulasan dan penilaian) pada kelas tutor yang dikekalkan.
--
-- Tutor yang kehadirannya dikekalkan (padanan nama paparan, mesti tepat seorang):
--   'AHMAD MUZZAMMIL%'
begin;

create temporary table reset_keep on commit drop as
  select id as staff_id from public.staff_profiles where display_name ilike 'AHMAD MUZZAMMIL%';

do $$
begin
  if (select count(*) from reset_keep) <> 1 then
    raise exception 'Tutor yang dikekalkan mesti tepat seorang (ditemui %). Tiada data dipadam.',
      (select count(*) from reset_keep);
  end if;
end $$;

-- 1) Janaan kewangan, laporan dan elaun. TRUNCATE tanpa CASCADE: gagal (tiada apa dipadam) jika
--    ada jadual lain yang merujuk jadual ini, jadi tiada data lain terpadam tanpa sengaja.
truncate table
  public.report_deliveries,
  public.monthly_student_reports,
  public.monthly_tutor_remarks,
  public.receipts,
  public.payment_evidence,
  public.payment_allocations,
  public.payments,
  public.invoice_items,
  public.invoices,
  public.tutor_adjustments,
  public.tutor_allowance_entries,
  public.tutor_payouts,
  public.tutor_payout_batches,
  public.tutor_month_payments,
  public.export_jobs;

-- 2) Kehadiran pada kelas yang tutornya bukan tutor yang dikekalkan.
create temporary table reset_other_sessions on commit drop as
  select s.id from public.class_sessions s
  where s.tutor_id is distinct from (select staff_id from reset_keep);

delete from public.generated_parent_comments where session_id in (select id from reset_other_sessions);
delete from public.assessment_responses where session_id in (select id from reset_other_sessions);
delete from public.student_progress where session_id in (select id from reset_other_sessions);
delete from public.attendance where session_id in (select id from reset_other_sessions);
update public.class_sessions set status = 'scheduled', updated_at = now()
  where id in (select id from reset_other_sessions) and status = 'completed';

-- 3) Elaun dibayar telah dipadam: buka semula kunci semakan sesi.
update public.class_sessions
  set review_status = 'reported', verified_by = null, verified_at = null,
      approved_by = null, approved_at = null, updated_at = now()
  where review_status in ('verified', 'approved', 'paid');

commit;

-- Semakan selepas reset (baca sahaja).
select
  (select count(*) from public.invoices) as invois,
  (select count(*) from public.payments) as bayaran_yuran,
  (select count(*) from public.monthly_student_reports) as laporan_bulanan,
  (select count(*) from public.tutor_month_payments) as elaun_dibayar,
  (select count(*) from public.students) as murid,
  (select count(*) from public.attendance) as kehadiran_kekal;
