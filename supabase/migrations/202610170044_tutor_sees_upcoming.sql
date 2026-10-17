-- Tutor melihat murid sebaik sahaja didaftarkan, termasuk murid yang tarikh mulanya akan datang.
-- Sebelum ini akses BACA tutor memerlukan class_tutors.starts_on <= current_date (tarikh UTC), jadi murid
-- yang didaftar dengan tarikh mula esok tidak kelihatan kepada tutornya (admin nampak). Kini bacaan
-- hanya menyemak tugasan belum tamat mengikut tarikh Malaysia. Akses TULIS (rekod kehadiran) kekal ikut
-- tarikh sesi melalui private.teaches_class.
create or replace function private.tutor_reads_class(org uuid,cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.has_role(org,array['tutor']) and exists(select 1 from public.class_tutors t where t.organization_id=org and t.class_id=cid
  and t.staff_id=private.staff_id() and (t.ends_on is null or t.ends_on>=(now() at time zone 'Asia/Kuala_Lumpur')::date))
$$;
revoke all on function private.tutor_reads_class(uuid,uuid) from public;
grant execute on function private.tutor_reads_class(uuid,uuid) to authenticated;

create or replace function private.can_class(org uuid, cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.has_role(org,array['owner','academic_admin']) or private.tutor_reads_class(org,cid) or exists(select 1 from public.enrollments e where e.organization_id=org and e.class_id=cid and private.owns_student(org,e.student_id))
$$;
create or replace function private.can_student(org uuid, sid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.has_role(org,array['owner','academic_admin','finance_admin']) or private.owns_student(org,sid) or exists(select 1 from public.enrollments e where e.organization_id=org and e.student_id=sid and e.status='active' and private.tutor_reads_class(org,e.class_id))
$$;

drop policy if exists enrollment_read on public.enrollments;
create policy enrollment_read on public.enrollments for select to authenticated using(private.has_role(organization_id,array['owner','academic_admin','finance_admin']) or private.owns_student(organization_id,student_id) or private.tutor_reads_class(organization_id,class_id));
drop policy if exists mastery_read on public.student_skill_levels;
create policy mastery_read on public.student_skill_levels for select to authenticated using(private.has_role(organization_id,array['owner','academic_admin']) or private.owns_student(organization_id,student_id) or exists(select 1 from public.enrollments e where e.organization_id=student_skill_levels.organization_id and e.student_id=student_skill_levels.student_id and private.tutor_reads_class(e.organization_id,e.class_id)));
notify pgrst, 'reload schema';
