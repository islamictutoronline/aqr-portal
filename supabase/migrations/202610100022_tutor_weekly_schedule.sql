-- Tutor mendaftar murid bersama jadual mingguan; sesi dijana sehingga hujung bulan hadapan
-- dan dilanjutkan secara idempoten apabila jadual dibuka. Padam murid = arkib + batal sesi akan datang
-- (sejarah kehadiran/elaun kekal). Boleh dijalankan semula.

-- Dalaman: cipta sesi daripada jadual mingguan kelas sehingga tarikh tertentu.
create or replace function private.fill_class_sessions(org uuid,cid uuid,until date) returns integer language plpgsql security definer set search_path='' as $$
declare r public.class_schedules; d date; tutor uuid; t timestamptz; n integer:=0;
begin
 select staff_id into tutor from public.class_tutors where organization_id=org and class_id=cid and starts_on<=current_date and (ends_on is null or ends_on>=current_date) order by starts_on desc limit 1;
 if tutor is null or not exists(select 1 from public.classes where id=cid and organization_id=org and active) then return 0; end if;
 for r in select * from public.class_schedules where organization_id=org and class_id=cid and (effective_to is null or effective_to>=current_date) loop
  for d in select g::date from generate_series(greatest(current_date,r.effective_from)::timestamp,least(until,coalesce(r.effective_to,until))::timestamp,'1 day') g loop
   if extract(dow from d)=r.day_of_week and not (r.exceptions @> jsonb_build_array(d::text)) then
    t:=(d+r.start_time) at time zone 'Asia/Kuala_Lumpur';
    insert into public.class_sessions(organization_id,class_id,tutor_id,starts_at,ends_at,topic)
     values(org,cid,tutor,t,t+make_interval(mins=>r.duration_minutes),'') on conflict(class_id,starts_at) do nothing;
    if found then n:=n+1; end if;
   end if;
  end loop;
 end loop;
 return n;
end $$;
revoke all on function private.fill_class_sessions(uuid,uuid,date) from public, anon, authenticated;

create or replace function private.schedule_horizon() returns date language sql stable set search_path='' as $$
 select (date_trunc('month',current_date)+interval '2 month'-interval '1 day')::date
$$;

-- Daftar murid baharu dengan program, tempoh sesi dan slot mingguan [{day:0-6,time:"HH:MM"}].
create or replace function private.tutor_enrol_student(org uuid,student_name text,program_id uuid,minutes integer,slots jsonb,end_date date default '2027-12-31') returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid; cid uuid; s jsonb; dow integer; tm text;
begin
 if not private.has_role(org,array['tutor']) then raise exception 'Hanya tutor aktif' using errcode='42501'; end if;
 if length(trim(student_name)) not between 2 and 200 then raise exception 'Nama tidak sah'; end if;
 if minutes not in (20,30) then raise exception 'Tempoh sesi mesti 20 atau 30 minit'; end if;
 if end_date is null or end_date<current_date or end_date>current_date+interval '5 years' then raise exception 'Tarikh tamat tidak sah'; end if;
 if jsonb_typeof(slots)<>'array' or jsonb_array_length(slots) not between 1 and 7 then raise exception 'Pilih 1 hingga 7 sesi seminggu'; end if;
 if (select count(distinct (e->>'day')||' '||(e->>'time')) from jsonb_array_elements(slots) e)<>jsonb_array_length(slots) then raise exception 'Slot sesi berulang'; end if;
 insert into public.students(organization_id,full_name) values(org,trim(student_name)) returning id into sid;
 cid:=private.individual_class(org,sid,tutor_enrol_student.program_id,private.staff_id());
 for s in select * from jsonb_array_elements(slots) loop
  dow:=(s->>'day')::integer; tm:=s->>'time';
  if dow is null or dow not between 0 and 6 or tm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Hari atau jam tidak sah'; end if;
  insert into public.class_schedules(organization_id,class_id,day_of_week,start_time,duration_minutes,effective_from,effective_to)
   values(org,cid,dow,tm::time,minutes,current_date,end_date);
 end loop;
 perform private.fill_class_sessions(org,cid,private.schedule_horizon());
 return sid;
end $$;

-- Lanjutkan sesi daripada jadual mingguan: tutor untuk kelasnya, pemilik/admin untuk semua.
create or replace function private.extend_schedule(org uuid) returns integer language plpgsql security definer set search_path='' as $$
declare c uuid; n integer:=0; staff uuid;
begin
 if private.has_role(org,array['owner','admin']) then staff:=null;
 elsif private.has_role(org,array['tutor']) then staff:=private.staff_id();
 else raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 for c in select distinct s.class_id from public.class_schedules s join public.classes k on k.id=s.class_id and k.organization_id=s.organization_id
   where s.organization_id=org and k.active and (s.effective_to is null or s.effective_to>=current_date)
   and (staff is null or exists(select 1 from public.class_tutors t where t.organization_id=org and t.class_id=s.class_id and t.staff_id=staff and (t.ends_on is null or t.ends_on>=current_date))) loop
  n:=n+private.fill_class_sessions(org,c,private.schedule_horizon());
 end loop;
 return n;
end $$;

-- Padam murid: tamatkan pendaftaran & jadual, batalkan sesi akan datang yang belum direkod, arkib murid
-- jika tiada program aktif lagi. Rekod lalu (kehadiran, elaun, laporan) tidak dipadam.
create or replace function private.remove_student(org uuid,student_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare c uuid; staff uuid;
begin
 if private.has_role(org,array['owner','admin']) then staff:=null;
 elsif private.has_role(org,array['tutor']) and private.can_student(org,remove_student.student_id) then staff:=private.staff_id();
 else raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 for c in select e.class_id from public.enrollments e where e.organization_id=org and e.student_id=remove_student.student_id and e.status='active'
   and (staff is null or exists(select 1 from public.class_tutors t where t.organization_id=org and t.class_id=e.class_id and t.staff_id=staff and (t.ends_on is null or t.ends_on>=current_date))) loop
  update public.enrollments x set status='withdrawn',ends_on=greatest(x.starts_on,current_date) where x.organization_id=org and x.class_id=c and x.student_id=remove_student.student_id and x.status='active';
  update public.class_schedules set effective_to=greatest(effective_from,current_date) where organization_id=org and class_id=c and (effective_to is null or effective_to>current_date);
  update public.class_sessions s set status='cancelled' where s.organization_id=org and s.class_id=c and s.status='scheduled' and s.starts_at>now()
   and not exists(select 1 from public.attendance a where a.organization_id=org and a.session_id=s.id);
  update public.classes set active=false where organization_id=org and id=c and mode='one_to_one';
 end loop;
 if not exists(select 1 from public.enrollments x where x.organization_id=org and x.student_id=remove_student.student_id and x.status='active') then
  update public.students set status='archived' where organization_id=org and id=remove_student.student_id;
 end if;
 return remove_student.student_id;
end $$;

create or replace function public.tutor_enrol_student(org uuid,student_name text,program_id uuid,minutes integer,slots jsonb,end_date date default '2027-12-31') returns uuid language sql security invoker set search_path='' as $$select private.tutor_enrol_student(org,student_name,program_id,minutes,slots,end_date)$$;
create or replace function public.extend_schedule(org uuid) returns integer language sql security invoker set search_path='' as $$select private.extend_schedule(org)$$;
create or replace function public.remove_student(org uuid,student_id uuid) returns uuid language sql security invoker set search_path='' as $$select private.remove_student(org,student_id)$$;
revoke all on function private.tutor_enrol_student(uuid,text,uuid,integer,jsonb,date),private.extend_schedule(uuid),private.remove_student(uuid,uuid) from public;
grant execute on function private.tutor_enrol_student(uuid,text,uuid,integer,jsonb,date),private.extend_schedule(uuid),private.remove_student(uuid,uuid) to authenticated;
revoke all on function public.tutor_enrol_student(uuid,text,uuid,integer,jsonb,date),public.extend_schedule(uuid),public.remove_student(uuid,uuid) from public,anon;
grant execute on function public.tutor_enrol_student(uuid,text,uuid,integer,jsonb,date),public.extend_schedule(uuid),public.remove_student(uuid,uuid) to authenticated;
notify pgrst, 'reload schema';
