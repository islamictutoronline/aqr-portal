-- Alih tarikh/jam sesi di tempatnya (kehadiran & ulasan kekal), termasuk sesi yang sudah direkod.
-- Slot jadual mingguan asal ditanda sebagai pengecualian supaya tidak dicipta semula sebagai pendua.
-- Kelas individu: tarikh mula tugasan/pendaftaran dilanjutkan ke belakang (maks 1 tahun). Boleh dijalankan semula.
create or replace function private.move_session(org uuid,sid uuid,new_start timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare sess public.class_sessions; old_day date; new_day date:=(new_start at time zone 'Asia/Kuala_Lumpur')::date; old_time time;
begin
 select * into sess from public.class_sessions where organization_id=org and id=sid for update;
 if sess.id is null then raise exception 'Sesi tidak ditemui'; end if;
 if not (private.has_role(org,array['owner','admin']) or (private.has_role(org,array['tutor']) and sess.tutor_id=private.staff_id())) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 if sess.review_status in ('verified','approved','paid') or sess.status in ('cancelled','rescheduled') then raise exception 'Sesi dikunci atau dibatalkan'; end if;
 if new_day<current_date-365 then raise exception 'Tarikh terlalu lama (maksimum 1 tahun ke belakang)'; end if;
 if new_start=sess.starts_at then return sid; end if;
 if exists(select 1 from public.class_sessions s where s.organization_id=org and s.class_id=sess.class_id and s.starts_at=new_start and s.id<>sid) then
  raise exception 'Sudah ada kelas pada tarikh dan jam ini'; end if;
 if exists(select 1 from public.classes c where c.id=sess.class_id and c.organization_id=org and c.mode='one_to_one') then
  update public.class_tutors t set starts_on=new_day where t.organization_id=org and t.class_id=sess.class_id and t.staff_id=sess.tutor_id and t.starts_on>new_day and (t.ends_on is null or t.ends_on>=current_date);
  update public.enrollments e set starts_on=new_day where e.organization_id=org and e.class_id=sess.class_id and e.status='active' and e.starts_on>new_day;
 end if;
 if not exists(select 1 from public.class_tutors where organization_id=org and class_id=sess.class_id and staff_id=sess.tutor_id and starts_on<=new_day and (ends_on is null or ends_on>=new_day)) then
  raise exception 'Tutor atau tempoh tidak sah'; end if;
 old_day:=(sess.starts_at at time zone 'Asia/Kuala_Lumpur')::date;
 old_time:=(sess.starts_at at time zone 'Asia/Kuala_Lumpur')::time;
 update public.class_schedules r set exceptions=r.exceptions||jsonb_build_array(old_day::text)
  where r.organization_id=org and r.class_id=sess.class_id and r.day_of_week=extract(dow from old_day) and r.start_time=old_time
  and not (r.exceptions @> jsonb_build_array(old_day::text));
 update public.class_sessions set starts_at=new_start,ends_at=new_start+(sess.ends_at-sess.starts_at),updated_at=now() where id=sid;
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
  values(org,auth.uid(),'MOVE','class_sessions',sid,jsonb_build_object('from',sess.starts_at,'to',new_start));
 return sid;
end $$;
create or replace function public.move_session(org uuid,sid uuid,new_start timestamptz) returns uuid language sql security invoker set search_path='' as $$select private.move_session(org,sid,new_start)$$;
revoke all on function private.move_session(uuid,uuid,timestamptz) from public;
grant execute on function private.move_session(uuid,uuid,timestamptz) to authenticated;
revoke all on function public.move_session(uuid,uuid,timestamptz) from public,anon;
grant execute on function public.move_session(uuid,uuid,timestamptz) to authenticated;
notify pgrst, 'reload schema';
