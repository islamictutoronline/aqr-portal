-- Kemaskini murid dan jadual kelas (keputusan pengguna 12 Okt 2026): ibu bapa kadang-kadang menukar
-- hari/jam kelas. Jadual baharu berkuat kuasa mulai tarikh dipilih; sesi yang sudah direkod (kehadiran,
-- ulasan, elaun) tidak disentuh, sesi tambahan manual dikekalkan, dan sesi berjadual lama yang belum
-- direkod dari tarikh itu dibuang lalu dijana semula mengikut jadual baharu. Boleh dijalankan semula.

-- Tutor yang mengajar kelas itu sekarang, atau pemilik/admin.
create or replace function private.can_manage_class(org uuid,cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.has_role(org,array['owner','admin'])
  or (private.has_role(org,array['tutor']) and exists(select 1 from public.class_tutors t
       where t.organization_id=org and t.class_id=cid and t.staff_id=private.staff_id() and t.ends_on is null))
$$;
revoke all on function private.can_manage_class(uuid,uuid) from public, anon;
grant execute on function private.can_manage_class(uuid,uuid) to authenticated;

create or replace function private.update_schedule(org uuid,cid uuid,minutes integer,slots jsonb,effective_from date,end_date date) returns integer language plpgsql security definer set search_path='' as $$
declare s jsonb; dow integer; tm text; removed integer;
begin
 if not private.can_manage_class(org,cid) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 if not exists(select 1 from public.classes c where c.organization_id=org and c.id=cid and c.active) then raise exception 'Kelas tidak ditemui'; end if;
 if minutes not in (20,30) then raise exception 'Tempoh sesi mesti 20 atau 30 minit'; end if;
 if update_schedule.effective_from is null or update_schedule.effective_from<current_date-31 or update_schedule.effective_from>current_date+365 then
  raise exception 'Tarikh berkuat kuasa mesti dalam tempoh sebulan lepas hingga setahun hadapan'; end if;
 if end_date is null or end_date<update_schedule.effective_from or end_date>current_date+interval '5 years' then raise exception 'Tarikh tamat tidak sah'; end if;
 if jsonb_typeof(slots)<>'array' or jsonb_array_length(slots) not between 1 and 7 then raise exception 'Pilih 1 hingga 7 sesi seminggu'; end if;
 if (select count(distinct (e->>'day')||' '||(e->>'time')) from jsonb_array_elements(slots) e)<>jsonb_array_length(slots) then raise exception 'Slot sesi berulang'; end if;
 for s in select * from jsonb_array_elements(slots) loop
  dow:=(s->>'day')::integer; tm:=s->>'time';
  if dow is null or dow not between 0 and 6 or tm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Hari atau jam tidak sah'; end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(org::text||cid::text||'schedule',0));
 -- 1) Buang sesi berjadual lama (bukan tambahan manual) yang belum direkod dari tarikh berkuat kuasa.
 delete from public.class_sessions cs
  where cs.organization_id=org and cs.class_id=cid and cs.status='scheduled'
   and (cs.starts_at at time zone 'Asia/Kuala_Lumpur')::date>=update_schedule.effective_from
   and cs.review_status not in ('verified','approved','paid')
   and private.is_schedule_slot(org,cid,cs.starts_at)
   and not exists(select 1 from public.attendance a where a.session_id=cs.id)
   and not exists(select 1 from public.generated_parent_comments g where g.session_id=cs.id)
   and not exists(select 1 from public.assessment_responses x where x.session_id=cs.id)
   and not exists(select 1 from public.student_progress x where x.session_id=cs.id)
   and not exists(select 1 from public.student_private_notes x where x.session_id=cs.id)
   and not exists(select 1 from public.tutor_allowance_entries x where x.session_id=cs.id)
   and not exists(select 1 from public.private_import_rows x where x.session_id=cs.id);
 get diagnostics removed=row_count;
 -- 2) Tamatkan jadual lama sehari sebelum tarikh berkuat kuasa (jadual yang bermula selepasnya dibuang).
 delete from public.class_schedules r where r.organization_id=org and r.class_id=cid and r.effective_from>=update_schedule.effective_from;
 update public.class_schedules r set effective_to=update_schedule.effective_from-1,updated_at=now()
  where r.organization_id=org and r.class_id=cid and (r.effective_to is null or r.effective_to>=update_schedule.effective_from);
 -- 3) Jadual baharu, kemudian jana sesi.
 for s in select * from jsonb_array_elements(slots) loop
  insert into public.class_schedules(organization_id,class_id,day_of_week,start_time,duration_minutes,effective_from,effective_to)
   values(org,cid,(s->>'day')::integer,(s->>'time')::time,minutes,update_schedule.effective_from,end_date);
 end loop;
 perform private.fill_class_sessions(org,cid,private.schedule_horizon());
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
  values(org,auth.uid(),'SCHEDULE_CHANGE','classes',cid,jsonb_build_object('effective_from',update_schedule.effective_from,'slots',slots,'minutes',minutes,'removed_sessions',removed));
 return removed;
end $$;
create or replace function public.update_schedule(org uuid,cid uuid,minutes integer,slots jsonb,effective_from date,end_date date) returns integer language sql security invoker set search_path='' as $$select private.update_schedule(org,cid,minutes,slots,effective_from,end_date)$$;
revoke all on function private.update_schedule(uuid,uuid,integer,jsonb,date,date) from public;
grant execute on function private.update_schedule(uuid,uuid,integer,jsonb,date,date) to authenticated;
revoke all on function public.update_schedule(uuid,uuid,integer,jsonb,date,date) from public,anon;
grant execute on function public.update_schedule(uuid,uuid,integer,jsonb,date,date) to authenticated;

-- Kemaskini nama murid (nama kelas individu "Murid · Program" turut dikemas kini).
create or replace function private.update_student(org uuid,student_id uuid,full_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare old_name text; nm text:=trim(coalesce(full_name,''));
begin
 if not (private.has_role(org,array['owner','admin'])
   or (private.has_role(org,array['tutor']) and exists(select 1 from public.enrollments e
        where e.organization_id=org and e.student_id=update_student.student_id and e.status='active'
         and private.can_manage_class(org,e.class_id)))) then
  raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 if length(nm) not between 2 and 200 then raise exception 'Nama tidak sah'; end if;
 select s.full_name into old_name from public.students s where s.organization_id=org and s.id=update_student.student_id for update;
 if old_name is null then raise exception 'Murid tidak ditemui'; end if;
 update public.students s set full_name=nm,updated_at=now() where s.organization_id=org and s.id=update_student.student_id;
 update public.classes c set name=nm||substr(c.name,length(old_name)+1),updated_at=now()
  where c.organization_id=org and c.mode='one_to_one' and left(c.name,length(old_name)+3)=old_name||' · '
   and exists(select 1 from public.enrollments e where e.organization_id=org and e.class_id=c.id and e.student_id=update_student.student_id);
 return update_student.student_id;
end $$;
create or replace function public.update_student(org uuid,student_id uuid,full_name text) returns uuid language sql security invoker set search_path='' as $$select private.update_student(org,student_id,full_name)$$;
revoke all on function private.update_student(uuid,uuid,text) from public;
grant execute on function private.update_student(uuid,uuid,text) to authenticated;
revoke all on function public.update_student(uuid,uuid,text) from public,anon;
grant execute on function public.update_student(uuid,uuid,text) to authenticated;
notify pgrst, 'reload schema';
