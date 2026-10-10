-- move_session: apabila sesi dialihkan ke tarikh/jam slot jadual, tanda "dikosongkan" pada tarikh itu
-- dibuang (slot kini terisi semula). Pembetulan data sekali: alihan dari satu slot ke slot lebih awal
-- bagi jadual yang sama (jalan pintas sebelum jadual bermula 1/10) dipulihkan. Boleh dijalankan semula.
create or replace function private.move_session(org uuid,sid uuid,new_start timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare sess public.class_sessions; old_day date; new_day date:=(new_start at time zone 'Asia/Kuala_Lumpur')::date; old_time time; new_time time:=(new_start at time zone 'Asia/Kuala_Lumpur')::time;
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
 -- Slot asal dikosongkan.
 update public.class_schedules r set exceptions=r.exceptions||jsonb_build_array(old_day::text)
  where r.organization_id=org and r.class_id=sess.class_id and r.day_of_week=extract(dow from old_day) and r.start_time=old_time
  and not (r.exceptions @> jsonb_build_array(old_day::text));
 -- Slot destinasi kini terisi: buang tandanya.
 update public.class_schedules r set exceptions=coalesce((select jsonb_agg(x) from jsonb_array_elements(r.exceptions) x where x<>to_jsonb(new_day::text)),'[]'::jsonb)
  where r.organization_id=org and r.class_id=sess.class_id and r.day_of_week=extract(dow from new_day) and r.start_time=new_time
  and r.exceptions @> jsonb_build_array(new_day::text);
 update public.class_sessions set starts_at=new_start,ends_at=new_start+(sess.ends_at-sess.starts_at),updated_at=now() where id=sid;
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
  values(org,auth.uid(),'MOVE','class_sessions',sid,jsonb_build_object('from',sess.starts_at,'to',new_start));
 return sid;
end $$;

-- Pembetulan data sekali: alihan slot→slot lebih awal bagi jadual yang sama dipulihkan.
do $$
declare a record; f timestamptz; t timestamptz; fd date; td date;
begin
 for a in select e.organization_id org,s.class_id cid,e.delta from public.audit_events e join public.class_sessions s on s.id=e.object_id
   where e.operation='MOVE' and e.object_type='class_sessions' loop
  f:=(a.delta->>'from')::timestamptz; t:=(a.delta->>'to')::timestamptz;
  fd:=(f at time zone 'Asia/Kuala_Lumpur')::date; td:=(t at time zone 'Asia/Kuala_Lumpur')::date;
  if td<fd and extract(dow from fd)=extract(dow from td) and (f at time zone 'Asia/Kuala_Lumpur')::time=(t at time zone 'Asia/Kuala_Lumpur')::time then
   update public.class_schedules r set exceptions=coalesce((select jsonb_agg(x) from jsonb_array_elements(r.exceptions) x where x not in (to_jsonb(fd::text),to_jsonb(td::text))),'[]'::jsonb)
    where r.organization_id=a.org and r.class_id=a.cid and r.day_of_week=extract(dow from fd) and r.start_time=(f at time zone 'Asia/Kuala_Lumpur')::time;
  end if;
 end loop;
 -- Buang tanda "dikosongkan" pada tarikh yang slotnya sebenarnya terisi.
 update public.class_schedules r set exceptions=coalesce((select jsonb_agg(x) from jsonb_array_elements(r.exceptions) x
   where not exists(select 1 from public.class_sessions s where s.organization_id=r.organization_id and s.class_id=r.class_id and s.status not in ('cancelled','rescheduled')
    and (s.starts_at at time zone 'Asia/Kuala_Lumpur')=((x#>>'{}')::date+r.start_time))),'[]'::jsonb)
  where jsonb_array_length(r.exceptions)>0;
 for a in select distinct r.organization_id org,r.class_id cid from public.class_schedules r join public.classes k on k.id=r.class_id where k.active loop
  perform private.fill_class_sessions(a.org,a.cid,private.schedule_horizon());
 end loop;
end $$;
notify pgrst, 'reload schema';
