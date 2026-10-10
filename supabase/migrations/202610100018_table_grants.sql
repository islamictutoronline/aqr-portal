-- Jadual yang dicipta selepas migrasi teras mewarisi kebenaran lalai Supabase (termasuk anon).
-- RLS sudah menyekat baris; ini lapisan kedua: pelawat tiada akses, pengguna log masuk baca sahaja.
-- Penulisan berlaku melalui fungsi SECURITY DEFINER atau skrip dipercayai.
revoke all on public.private_import_batches, public.private_import_quotas, public.monthly_student_reports,
  public.report_deliveries, public.tutor_applications from anon, authenticated;
grant select on public.private_import_batches, public.private_import_quotas, public.monthly_student_reports,
  public.report_deliveries, public.tutor_applications to authenticated;
-- Jadual masa depan tidak lagi diberikan kepada pelawat secara automatik.
alter default privileges in schema public revoke all on tables from anon;
