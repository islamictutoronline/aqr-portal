-- Pentadbir memadam tutor: akses ditarik serta-merta, tugasan ditamatkan, sesi akan datang yang belum
-- direkod dibatalkan. Rekod lalu (kehadiran, elaun, laporan) kekal. Boleh dijalankan semula.

-- Direktori kakitangan kini turut memulangkan ahli tidak aktif (dengan active=false) supaya nama
-- tutor yang telah dipadam masih dipaparkan dalam sejarah sesi dan elaun.
create or replace function private.staff_directory_v2(org uuid) returns table(id uuid,display_name text,active boolean,role text) language sql stable security definer set search_path='' as $$
 select p.id,p.display_name,(p.active and m.active),m.role from public.staff_profiles p join public.staff_memberships m on m.staff_id=p.id
 where m.organization_id=org and (private.has_role(org,array['owner','admin']) or (private.has_role(org,array['tutor']) and p.id=private.staff_id()))
$$;

create or replace function private.remove_tutor(org uuid,staff_id uuid) returns integer language plpgsql security definer set search_path='' as $$
declare students integer;
begin
 if not private.has_role(org,array['owner','admin']) then raise exception 'Hanya pemilik atau admin boleh memadam tutor' using errcode='42501'; end if;
 if remove_tutor.staff_id=private.staff_id() then raise exception 'Anda tidak boleh memadam akaun sendiri'; end if;
 if not exists(select 1 from public.staff_memberships m where m.organization_id=org and m.staff_id=remove_tutor.staff_id and m.role='tutor' and m.active) then
  raise exception 'Tutor aktif tidak ditemui'; end if;
 select count(distinct e.student_id) into students from public.enrollments e join public.class_tutors t on t.class_id=e.class_id and t.organization_id=e.organization_id
  where e.organization_id=org and e.status='active' and t.staff_id=remove_tutor.staff_id and t.ends_on is null;
 update public.class_tutors t set ends_on=greatest(t.starts_on,current_date) where t.organization_id=org and t.staff_id=remove_tutor.staff_id and (t.ends_on is null or t.ends_on>current_date);
 update public.class_sessions s set status='cancelled' where s.organization_id=org and s.tutor_id=remove_tutor.staff_id and s.status='scheduled' and s.starts_at>now()
  and not exists(select 1 from public.attendance a where a.organization_id=org and a.session_id=s.id);
 -- Nyahaktif akses selepas tugasan ditamatkan (pencetus tugasan memerlukan tutor aktif).
 update public.staff_memberships m set active=false where m.organization_id=org and m.staff_id=remove_tutor.staff_id and m.role='tutor';
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
  values(org,auth.uid(),'REMOVE_TUTOR','staff_profiles',remove_tutor.staff_id,jsonb_build_object('students',students));
 return students;
end $$;
create or replace function public.remove_tutor(org uuid,staff_id uuid) returns integer language sql security invoker set search_path='' as $$select private.remove_tutor(org,staff_id)$$;
revoke all on function private.remove_tutor(uuid,uuid) from public;
grant execute on function private.remove_tutor(uuid,uuid) to authenticated;
revoke all on function public.remove_tutor(uuid,uuid) from public,anon;
grant execute on function public.remove_tutor(uuid,uuid) to authenticated;
notify pgrst, 'reload schema';
