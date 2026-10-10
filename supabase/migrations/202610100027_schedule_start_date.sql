-- Jadual bermula pada tarikh mula pilihan (lalai 1 haribulan), sesi lepas turut dijana untuk direkod.
-- "Padam" pada slot berjadual mengosongkan rekod (slot kekal); sesi tambahan dibatalkan.
-- Termasuk pembetulan data sekali: murid yang didaftar Oktober 2026 dimulakan dari 1/10/2026,
-- dan slot berjadual yang pernah "dipadam" dipulihkan. Boleh dijalankan semula.

-- Jana sesi dari tarikh mula jadual (maks 1 tahun ke belakang), bukan hanya dari hari ini.
create or replace function private.fill_class_sessions(org uuid,cid uuid,until date) returns integer language plpgsql security definer set search_path='' as $$
declare r public.class_schedules; d date; tutor uuid; t timestamptz; n integer:=0;
begin
 select staff_id into tutor from public.class_tutors where organization_id=org and class_id=cid and (ends_on is null or ends_on>=current_date) order by starts_on desc limit 1;
 if tutor is null or not exists(select 1 from public.classes where id=cid and organization_id=org and active) then return 0; end if;
 for r in select * from public.class_schedules where organization_id=org and class_id=cid and (effective_to is null or effective_to>=current_date-365) loop
  for d in select g::date from generate_series(greatest(current_date-365,r.effective_from)::timestamp,least(until,coalesce(r.effective_to,until))::timestamp,'1 day') g loop
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

-- Daftar murid dengan tarikh mula (lalai 1 haribulan bulan semasa). Tandatangan baharu menggantikan yang lama.
drop function if exists public.tutor_enrol_student(uuid,text,uuid,integer,jsonb,date);
drop function if exists private.tutor_enrol_student(uuid,text,uuid,integer,jsonb,date);
create or replace function private.tutor_enrol_student(org uuid,student_name text,program_id uuid,minutes integer,slots jsonb,end_date date default '2027-12-31',start_date date default null) returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid; cid uuid; s jsonb; dow integer; tm text; first_day date:=coalesce(start_date,date_trunc('month',current_date)::date);
begin
 if not private.has_role(org,array['tutor']) then raise exception 'Hanya tutor aktif' using errcode='42501'; end if;
 if length(trim(student_name)) not between 2 and 200 then raise exception 'Nama tidak sah'; end if;
 if minutes not in (20,30) then raise exception 'Tempoh sesi mesti 20 atau 30 minit'; end if;
 if first_day<current_date-365 then raise exception 'Tarikh mula terlalu lama (maksimum 1 tahun ke belakang)'; end if;
 if end_date is null or end_date<first_day or end_date>current_date+interval '5 years' then raise exception 'Tarikh tamat tidak sah'; end if;
 if jsonb_typeof(slots)<>'array' or jsonb_array_length(slots) not between 1 and 7 then raise exception 'Pilih 1 hingga 7 sesi seminggu'; end if;
 if (select count(distinct (e->>'day')||' '||(e->>'time')) from jsonb_array_elements(slots) e)<>jsonb_array_length(slots) then raise exception 'Slot sesi berulang'; end if;
 insert into public.students(organization_id,full_name) values(org,trim(student_name)) returning id into sid;
 cid:=private.individual_class(org,sid,tutor_enrol_student.program_id,private.staff_id());
 update public.class_tutors set starts_on=first_day where organization_id=org and class_id=cid;
 update public.enrollments x set starts_on=first_day where x.organization_id=org and x.class_id=cid;
 for s in select * from jsonb_array_elements(slots) loop
  dow:=(s->>'day')::integer; tm:=s->>'time';
  if dow is null or dow not between 0 and 6 or tm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Hari atau jam tidak sah'; end if;
  insert into public.class_schedules(organization_id,class_id,day_of_week,start_time,duration_minutes,effective_from,effective_to)
   values(org,cid,dow,tm::time,minutes,first_day,end_date);
 end loop;
 perform private.fill_class_sessions(org,cid,private.schedule_horizon());
 return sid;
end $$;
create or replace function public.tutor_enrol_student(org uuid,student_name text,program_id uuid,minutes integer,slots jsonb,end_date date default '2027-12-31',start_date date default null) returns uuid language sql security invoker set search_path='' as $$select private.tutor_enrol_student(org,student_name,program_id,minutes,slots,end_date,start_date)$$;
revoke all on function private.tutor_enrol_student(uuid,text,uuid,integer,jsonb,date,date) from public;
grant execute on function private.tutor_enrol_student(uuid,text,uuid,integer,jsonb,date,date) to authenticated;
revoke all on function public.tutor_enrol_student(uuid,text,uuid,integer,jsonb,date,date) from public,anon;
grant execute on function public.tutor_enrol_student(uuid,text,uuid,integer,jsonb,date,date) to authenticated;

-- Adakah sesi ini slot jadual mingguan (bukan sesi tambahan)?
create or replace function private.is_schedule_slot(org uuid,cid uuid,start_at timestamptz) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.class_schedules r where r.organization_id=org and r.class_id=cid
  and r.day_of_week=extract(dow from (start_at at time zone 'Asia/Kuala_Lumpur'))
  and r.start_time=(start_at at time zone 'Asia/Kuala_Lumpur')::time
  and (start_at at time zone 'Asia/Kuala_Lumpur')::date between r.effective_from and coalesce(r.effective_to,'infinity'::date))
$$;
revoke all on function private.is_schedule_slot(uuid,uuid,timestamptz) from public, anon, authenticated;

-- Padam: slot berjadual dikosongkan (kekal untuk direkod semula); sesi tambahan dibatalkan.
-- Kehadiran & penilaian sesi itu dibuang, ulasan ditarik balik; tindakan diaudit.
create or replace function private.void_session(org uuid,sid uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare sess public.class_sessions; slot boolean;
begin
 select * into sess from public.class_sessions where organization_id=org and id=sid for update;
 if sess.id is null then raise exception 'Sesi tidak ditemui'; end if;
 if not (private.has_role(org,array['owner','admin']) or (private.has_role(org,array['tutor']) and sess.tutor_id=private.staff_id())) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 if sess.review_status in ('verified','approved','paid') then raise exception 'Sesi telah dikunci'; end if;
 if sess.status in ('cancelled','rescheduled') then return sid; end if;
 slot:=private.is_schedule_slot(org,sess.class_id,sess.starts_at);
 delete from public.attendance where organization_id=org and session_id=sid;
 delete from public.assessment_responses where organization_id=org and session_id=sid;
 update public.generated_parent_comments set status='retracted' where organization_id=org and session_id=sid and status in ('draft','published');
 update public.class_sessions set status=case when slot then 'scheduled' else 'cancelled' end,updated_at=now() where id=sid;
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
  values(org,auth.uid(),'VOID','class_sessions',sid,jsonb_build_object('previous_status',sess.status,'kept_slot',slot));
 return sid;
end $$;

-- Pembetulan data sekali (idempoten).
do $$
declare c record;
begin
 -- 1) Murid individu yang jadualnya bermula dalam Oktober 2026 dimulakan dari 1/10/2026.
 for c in select distinct r.organization_id org,r.class_id cid from public.class_schedules r join public.classes k on k.id=r.class_id
   where k.mode='one_to_one' and k.active and r.effective_from between '2026-10-02' and '2026-10-31' loop
  update public.class_schedules set effective_from='2026-10-01' where organization_id=c.org and class_id=c.cid and effective_from between '2026-10-02' and '2026-10-31';
  update public.class_tutors set starts_on='2026-10-01' where organization_id=c.org and class_id=c.cid and starts_on>'2026-10-01' and ends_on is null;
  update public.enrollments x set starts_on='2026-10-01' where x.organization_id=c.org and x.class_id=c.cid and x.status='active' and x.starts_on>'2026-10-01';
 end loop;
 -- 2) Slot berjadual yang pernah "dipadam" (dibatalkan melalui VOID) dipulihkan sebagai belum direkod.
 for c in select s.id sid,s.organization_id org from public.class_sessions s
   where s.status='cancelled' and private.is_schedule_slot(s.organization_id,s.class_id,s.starts_at)
   and exists(select 1 from public.audit_events a where a.object_type='class_sessions' and a.object_id=s.id and a.operation='VOID') loop
  delete from public.attendance where organization_id=c.org and session_id=c.sid;
  delete from public.assessment_responses where organization_id=c.org and session_id=c.sid;
  update public.class_sessions set status='scheduled',updated_at=now() where id=c.sid;
 end loop;
 -- 3) Jana sesi yang belum wujud bagi semua kelas berjadual aktif.
 for c in select distinct r.organization_id org,r.class_id cid from public.class_schedules r join public.classes k on k.id=r.class_id where k.active loop
  perform private.fill_class_sessions(c.org,c.cid,private.schedule_horizon());
 end loop;
end $$;
notify pgrst, 'reload schema';
