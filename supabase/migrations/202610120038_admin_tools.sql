-- Alat admin (keputusan pengguna 12 Okt 2026):
-- 1) Jadual fleksibel: kelas tanpa sesi berjadual automatik (tutor/admin merekod sesi secara manual).
-- 2) Admin boleh mendaftar murid bagi pihak tutor (tutor wajib dipilih).
-- 3) Kemaskini jadual boleh menukar mod fleksibel.
-- 4) Pindah kelas murid kepada tutor lain mulai tarikh dipilih; sesi direkod kekal dengan tutor lama.
-- 5) Kadar khas: yuran/elaun khas bagi kelas, dan pelarasan elaun bagi tutor (sejarah ikut tarikh).
-- 6) Buka semula laporan bulanan yang telah diluluskan.
-- Boleh dijalankan semula.

-- 1) Jadual fleksibel ---------------------------------------------------------------------------
alter table public.classes add column if not exists flexible boolean not null default false;

-- Jana sesi dari tarikh mula jadual (maks 1 tahun ke belakang). Kelas fleksibel tidak dijana.
create or replace function private.fill_class_sessions(org uuid,cid uuid,until date) returns integer language plpgsql security definer set search_path='' as $$
declare r public.class_schedules; d date; tutor uuid; t timestamptz; n integer:=0;
begin
 if exists(select 1 from public.classes k where k.id=cid and k.organization_id=org and k.flexible) then return 0; end if;
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

-- 2) Daftar murid: tutor (diri sendiri) atau pemilik/admin bagi pihak tutor yang dipilih ------------
drop function if exists public.tutor_enrol_student(uuid,text,uuid,integer,jsonb,date,date,text,text);
drop function if exists private.tutor_enrol_student(uuid,text,uuid,integer,jsonb,date,date,text,text);
create or replace function private.tutor_enrol_student(org uuid,student_name text,program_id uuid,minutes integer,slots jsonb,end_date date default '2027-12-31',start_date date default null,guardian_name text default null,guardian_phone text default null,tutor_id uuid default null,flexible boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid; cid uuid; s jsonb; dow integer; tm text; teacher uuid; first_day date:=coalesce(start_date,date_trunc('month',current_date)::date);
begin
 if private.has_role(org,array['owner','admin']) then
  teacher:=tutor_enrol_student.tutor_id;
  if teacher is null or not exists(select 1 from public.staff_memberships m
    where m.organization_id=org and m.staff_id=teacher and m.role='tutor' and m.active) then raise exception 'Pilih tutor'; end if;
 elsif private.has_role(org,array['tutor']) then
  teacher:=private.staff_id();
  if tutor_enrol_student.tutor_id is not null and tutor_enrol_student.tutor_id<>teacher then
   raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 else raise exception 'Hanya tutor aktif' using errcode='42501'; end if;
 if length(trim(student_name)) not between 2 and 200 then raise exception 'Nama tidak sah'; end if;
 if minutes not in (20,30) then raise exception 'Tempoh sesi mesti 20 atau 30 minit'; end if;
 if first_day<current_date-365 then raise exception 'Tarikh mula terlalu lama (maksimum 1 tahun ke belakang)'; end if;
 if end_date is null or end_date<first_day or end_date>current_date+interval '5 years' then raise exception 'Tarikh tamat tidak sah'; end if;
 if jsonb_typeof(slots)<>'array' or jsonb_array_length(slots) not between 1 and 7 then raise exception 'Pilih 1 hingga 7 sesi seminggu'; end if;
 if (select count(distinct (e->>'day')||' '||(e->>'time')) from jsonb_array_elements(slots) e)<>jsonb_array_length(slots) then raise exception 'Slot sesi berulang'; end if;
 insert into public.students(organization_id,full_name) values(org,trim(student_name)) returning id into sid;
 cid:=private.individual_class(org,sid,tutor_enrol_student.program_id,teacher);
 if coalesce(tutor_enrol_student.flexible,false) then
  update public.classes k set flexible=true,updated_at=now() where k.organization_id=org and k.id=cid;
 end if;
 update public.class_tutors set starts_on=first_day where organization_id=org and class_id=cid;
 update public.enrollments x set starts_on=first_day where x.organization_id=org and x.class_id=cid;
 for s in select * from jsonb_array_elements(slots) loop
  dow:=(s->>'day')::integer; tm:=s->>'time';
  if dow is null or dow not between 0 and 6 or tm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Hari atau jam tidak sah'; end if;
  insert into public.class_schedules(organization_id,class_id,day_of_week,start_time,duration_minutes,effective_from,effective_to)
   values(org,cid,dow,tm::time,minutes,first_day,end_date);
 end loop;
 -- Kelas fleksibel: fill_class_sessions memulangkan 0 (tiada sesi dijana).
 perform private.fill_class_sessions(org,cid,private.schedule_horizon());
 perform private.save_student_guardian(org,sid,guardian_name,guardian_phone);
 if private.has_role(org,array['owner','admin']) then
  insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
   values(org,auth.uid(),'ENROL_FOR_TUTOR','students',sid,jsonb_build_object('class_id',cid,'tutor_id',teacher,'flexible',coalesce(tutor_enrol_student.flexible,false)));
 end if;
 return sid;
end $$;
create or replace function public.tutor_enrol_student(org uuid,student_name text,program_id uuid,minutes integer,slots jsonb,end_date date default '2027-12-31',start_date date default null,guardian_name text default null,guardian_phone text default null,tutor_id uuid default null,flexible boolean default false) returns uuid language sql security invoker set search_path='' as $$select private.tutor_enrol_student(org,student_name,program_id,minutes,slots,end_date,start_date,guardian_name,guardian_phone,tutor_id,flexible)$$;
revoke all on function private.tutor_enrol_student(uuid,text,uuid,integer,jsonb,date,date,text,text,uuid,boolean) from public;
grant execute on function private.tutor_enrol_student(uuid,text,uuid,integer,jsonb,date,date,text,text,uuid,boolean) to authenticated;
revoke all on function public.tutor_enrol_student(uuid,text,uuid,integer,jsonb,date,date,text,text,uuid,boolean) from public,anon;
grant execute on function public.tutor_enrol_student(uuid,text,uuid,integer,jsonb,date,date,text,text,uuid,boolean) to authenticated;

-- 3) Kemaskini jadual + mod fleksibel ----------------------------------------------------------
drop function if exists public.update_schedule(uuid,uuid,integer,jsonb,date,date);
drop function if exists private.update_schedule(uuid,uuid,integer,jsonb,date,date);
create or replace function private.update_schedule(org uuid,cid uuid,minutes integer,slots jsonb,effective_from date,end_date date,flexible boolean default null) returns integer language plpgsql security definer set search_path='' as $$
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
 -- 0) Mod fleksibel (jika dinyatakan) ditetapkan sebelum sesi dijana semula.
 if update_schedule.flexible is not null then
  update public.classes k set flexible=update_schedule.flexible,updated_at=now() where k.organization_id=org and k.id=cid;
 end if;
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
 -- 3) Jadual baharu, kemudian jana sesi (kelas fleksibel: tiada sesi dijana).
 for s in select * from jsonb_array_elements(slots) loop
  insert into public.class_schedules(organization_id,class_id,day_of_week,start_time,duration_minutes,effective_from,effective_to)
   values(org,cid,(s->>'day')::integer,(s->>'time')::time,minutes,update_schedule.effective_from,end_date);
 end loop;
 perform private.fill_class_sessions(org,cid,private.schedule_horizon());
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
  values(org,auth.uid(),'SCHEDULE_CHANGE','classes',cid,jsonb_build_object('effective_from',update_schedule.effective_from,'slots',slots,'minutes',minutes,'removed_sessions',removed,'flexible',update_schedule.flexible));
 return removed;
end $$;
create or replace function public.update_schedule(org uuid,cid uuid,minutes integer,slots jsonb,effective_from date,end_date date,flexible boolean default null) returns integer language sql security invoker set search_path='' as $$select private.update_schedule(org,cid,minutes,slots,effective_from,end_date,flexible)$$;
revoke all on function private.update_schedule(uuid,uuid,integer,jsonb,date,date,boolean) from public;
grant execute on function private.update_schedule(uuid,uuid,integer,jsonb,date,date,boolean) to authenticated;
revoke all on function public.update_schedule(uuid,uuid,integer,jsonb,date,date,boolean) from public,anon;
grant execute on function public.update_schedule(uuid,uuid,integer,jsonb,date,date,boolean) to authenticated;

-- 4) Pindah kelas kepada tutor lain ------------------------------------------------------------
-- Sesi berjadual yang belum direkod mulai tarikh berkuat kuasa dipindah kepada tutor baharu.
-- Sesi yang sudah direkod kekal dengan tutor lama (elaun tutor lama tidak terjejas).
create or replace function private.transfer_class(org uuid,cid uuid,new_tutor uuid,effective_from date) returns integer language plpgsql security definer set search_path='' as $$
declare cur public.class_tutors; moved integer;
begin
 if not private.has_role(org,array['owner','admin']) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 if not exists(select 1 from public.classes k where k.organization_id=org and k.id=cid and k.active) then raise exception 'Kelas tidak ditemui'; end if;
 if transfer_class.new_tutor is null or not exists(select 1 from public.staff_memberships m
   where m.organization_id=org and m.staff_id=transfer_class.new_tutor and m.role='tutor' and m.active) then raise exception 'Pilih tutor'; end if;
 if transfer_class.effective_from is null or transfer_class.effective_from<current_date-62 or transfer_class.effective_from>current_date+365 then
  raise exception 'Tarikh berkuat kuasa mesti dalam tempoh dua bulan lepas hingga setahun hadapan'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||cid::text||'schedule',0));
 select * into cur from public.class_tutors t where t.organization_id=org and t.class_id=cid and t.ends_on is null
  order by t.starts_on desc, t.created_at desc limit 1 for update;
 if cur.id is not null and cur.staff_id=transfer_class.new_tutor then raise exception 'Tutor baharu sama dengan tutor semasa'; end if;
 if cur.id is not null and cur.starts_on>=transfer_class.effective_from then
  update public.class_tutors t set staff_id=transfer_class.new_tutor,updated_at=now() where t.id=cur.id;
 else
  if cur.id is not null then
   update public.class_tutors t set ends_on=transfer_class.effective_from-1,updated_at=now() where t.id=cur.id;
  end if;
  insert into public.class_tutors(organization_id,class_id,staff_id,starts_on)
   values(org,cid,transfer_class.new_tutor,transfer_class.effective_from);
 end if;
 update public.class_sessions cs set tutor_id=transfer_class.new_tutor,updated_at=now()
  where cs.organization_id=org and cs.class_id=cid and cs.status='scheduled'
   and (cs.starts_at at time zone 'Asia/Kuala_Lumpur')::date>=transfer_class.effective_from
   and cs.tutor_id<>transfer_class.new_tutor
   and not exists(select 1 from public.attendance a where a.session_id=cs.id);
 get diagnostics moved=row_count;
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
  values(org,auth.uid(),'TRANSFER_CLASS','classes',cid,jsonb_build_object('from_tutor',cur.staff_id,'to_tutor',transfer_class.new_tutor,
   'effective_from',transfer_class.effective_from,'sessions_moved',moved));
 return moved;
end $$;
create or replace function public.transfer_class(org uuid,cid uuid,new_tutor uuid,effective_from date) returns integer language sql security invoker set search_path='' as $$select private.transfer_class(org,cid,new_tutor,effective_from)$$;
revoke all on function private.transfer_class(uuid,uuid,uuid,date) from public;
grant execute on function private.transfer_class(uuid,uuid,uuid,date) to authenticated;
revoke all on function public.transfer_class(uuid,uuid,uuid,date) from public,anon;
grant execute on function public.transfer_class(uuid,uuid,uuid,date) to authenticated;

-- 5) Kadar khas --------------------------------------------------------------------------------
-- Peraturan (dikira dalam TypeScript bagi elaun; dalam SQL bagi invois), ikut tarikh sesi (Asia/Kuala_Lumpur):
--  * Baris berkuat kuasa = effective_from terbesar <= tarikh sesi (seri: created_at terkini).
--  * Yuran sesi = class_rate_overrides.fee_sen jika tidak null, jika tidak kadar standard program_fee_rates.
--  * Elaun sesi dibayar = class_rate_overrides.allowance_sen jika tidak null,
--    jika tidak max(0, kadar standard tutor_allowance_rates + tutor_rate_overrides.adjustment_sen berkuat kuasa).
--  * Nilai null pada baris khas kelas bermaksud "guna kadar standard" (cara kembali ke kadar standard).
create table if not exists public.class_rate_overrides (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 class_id uuid not null references public.classes(id),
 fee_sen bigint check(fee_sen is null or fee_sen>=0),
 allowance_sen bigint check(allowance_sen is null or allowance_sen>=0),
 effective_from date not null,
 created_by uuid,
 created_at timestamptz not null default now()
);
create index if not exists class_rate_overrides_lookup on public.class_rate_overrides(organization_id,class_id,effective_from);
alter table public.class_rate_overrides enable row level security;
revoke all on public.class_rate_overrides from anon, authenticated;
grant select on public.class_rate_overrides to authenticated;
drop policy if exists class_rates_read on public.class_rate_overrides;
create policy class_rates_read on public.class_rate_overrides for select to authenticated
 using(private.has_role(organization_id,array['owner','admin']) or private.can_manage_class(organization_id,class_id));

create table if not exists public.tutor_rate_overrides (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 staff_id uuid not null references public.staff_profiles(id),
 adjustment_sen bigint not null check(adjustment_sen between -100000 and 100000),
 effective_from date not null,
 created_by uuid,
 created_at timestamptz not null default now()
);
create index if not exists tutor_rate_overrides_lookup on public.tutor_rate_overrides(organization_id,staff_id,effective_from);
alter table public.tutor_rate_overrides enable row level security;
revoke all on public.tutor_rate_overrides from anon, authenticated;
grant select on public.tutor_rate_overrides to authenticated;
drop policy if exists tutor_rates_read on public.tutor_rate_overrides;
create policy tutor_rates_read on public.tutor_rate_overrides for select to authenticated
 using(private.has_role(organization_id,array['owner','admin']) or staff_id=private.staff_id());

-- Tetapkan yuran/elaun khas kelas mulai tarikh. Null = kembali ke kadar standard.
create or replace function private.set_class_rates(org uuid,cid uuid,fee_sen bigint,allowance_sen bigint,effective_from date) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not private.has_role(org,array['owner','admin']) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 if not exists(select 1 from public.classes k where k.organization_id=org and k.id=cid) then raise exception 'Kelas tidak ditemui'; end if;
 if set_class_rates.effective_from is null then raise exception 'Tarikh berkuat kuasa diperlukan'; end if;
 if coalesce(set_class_rates.fee_sen,0) not between 0 and 10000000 or coalesce(set_class_rates.allowance_sen,0) not between 0 and 10000000 then
  raise exception 'Kadar tidak sah'; end if;
 insert into public.class_rate_overrides(organization_id,class_id,fee_sen,allowance_sen,effective_from,created_by)
  values(org,cid,set_class_rates.fee_sen,set_class_rates.allowance_sen,set_class_rates.effective_from,private.staff_id())
  returning id into result;
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
  values(org,auth.uid(),'SET_CLASS_RATES','classes',cid,jsonb_build_object('fee_sen',set_class_rates.fee_sen,
   'allowance_sen',set_class_rates.allowance_sen,'effective_from',set_class_rates.effective_from));
 return result;
end $$;
create or replace function public.set_class_rates(org uuid,cid uuid,fee_sen bigint,allowance_sen bigint,effective_from date) returns uuid language sql security invoker set search_path='' as $$select private.set_class_rates(org,cid,fee_sen,allowance_sen,effective_from)$$;
revoke all on function private.set_class_rates(uuid,uuid,bigint,bigint,date) from public;
grant execute on function private.set_class_rates(uuid,uuid,bigint,bigint,date) to authenticated;
revoke all on function public.set_class_rates(uuid,uuid,bigint,bigint,date) from public,anon;
grant execute on function public.set_class_rates(uuid,uuid,bigint,bigint,date) to authenticated;

-- Tetapkan pelarasan elaun tutor (ditambah pada elaun standard bagi setiap sesi dibayar) mulai tarikh.
create or replace function private.set_tutor_rate(org uuid,staff_id uuid,adjustment_sen bigint,effective_from date) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not private.has_role(org,array['owner','admin']) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 if not exists(select 1 from public.staff_memberships m where m.organization_id=org and m.staff_id=set_tutor_rate.staff_id and m.role='tutor') then
  raise exception 'Tutor tidak ditemui'; end if;
 if set_tutor_rate.effective_from is null then raise exception 'Tarikh berkuat kuasa diperlukan'; end if;
 if set_tutor_rate.adjustment_sen is null or set_tutor_rate.adjustment_sen not between -100000 and 100000 then
  raise exception 'Pelarasan elaun mesti antara -RM1000 dan RM1000'; end if;
 insert into public.tutor_rate_overrides(organization_id,staff_id,adjustment_sen,effective_from,created_by)
  values(org,set_tutor_rate.staff_id,set_tutor_rate.adjustment_sen,set_tutor_rate.effective_from,private.staff_id())
  returning id into result;
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
  values(org,auth.uid(),'SET_TUTOR_RATE','staff_profiles',set_tutor_rate.staff_id,jsonb_build_object('adjustment_sen',set_tutor_rate.adjustment_sen,
   'effective_from',set_tutor_rate.effective_from));
 return result;
end $$;
create or replace function public.set_tutor_rate(org uuid,staff_id uuid,adjustment_sen bigint,effective_from date) returns uuid language sql security invoker set search_path='' as $$select private.set_tutor_rate(org,staff_id,adjustment_sen,effective_from)$$;
revoke all on function private.set_tutor_rate(uuid,uuid,bigint,date) from public;
grant execute on function private.set_tutor_rate(uuid,uuid,bigint,date) to authenticated;
revoke all on function public.set_tutor_rate(uuid,uuid,bigint,date) from public,anon;
grant execute on function public.set_tutor_rate(uuid,uuid,bigint,date) to authenticated;

-- Invois bulanan: harga seunit = yuran khas kelas (jika ada) atau kadar standard program.
-- Sesi tanpa kedua-duanya dilangkau. Satu baris bagi setiap murid × program × minit × harga.
create or replace function private.generate_session_invoices(org uuid,billing_period text) returns integer language plpgsql security definer set search_path='' as $$
declare g record; items jsonb; inv uuid; total bigint; n integer:=0; due date; month_start date; month_end date;
begin
 if not private.has_role(org,array['owner','admin']) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 if billing_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Bulan tidak sah'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||billing_period||'session-invoices',0));
 month_start:=(billing_period||'-01')::date; month_end:=(month_start+interval '1 month')::date;
 due:=(month_end+6);
 for g in select distinct sg.guardian_id from public.student_guardians sg where sg.organization_id=org and sg.is_billing_contact loop
  select jsonb_agg(jsonb_build_object('student_id',x.student_id,'description',x.label,'quantity',x.qty,'unit_price_sen',x.price,'discount_sen',0) order by x.label,x.price)
   into items from (
    select y.student_id,y.label,count(*)::integer qty,y.price from (
     select a.student_id, st.full_name||' · '||p.name||' ('||((extract(epoch from (s.ends_at-s.starts_at))/60)::integer)::text||' minit)' as label,
      coalesce(ov.fee_sen,r.amount_sen) price
     from public.attendance a
     join public.class_sessions s on s.id=a.session_id and s.organization_id=a.organization_id
     join public.classes c on c.id=s.class_id and c.organization_id=s.organization_id
     join public.programs p on p.id=c.program_id and p.organization_id=c.organization_id
     join public.students st on st.id=a.student_id and st.organization_id=a.organization_id
     join public.student_guardians sg on sg.student_id=a.student_id and sg.organization_id=a.organization_id and sg.guardian_id=g.guardian_id and sg.is_billing_contact
     left join public.program_fee_rates r on r.organization_id=org and r.program_code=p.code
      and r.duration_minutes=((extract(epoch from (s.ends_at-s.starts_at))/60)::integer)
      and r.effective_from<=(s.starts_at at time zone 'Asia/Kuala_Lumpur')::date
      and (r.effective_to is null or r.effective_to>=(s.starts_at at time zone 'Asia/Kuala_Lumpur')::date)
     left join lateral (select o.fee_sen from public.class_rate_overrides o
      where o.organization_id=org and o.class_id=c.id and o.effective_from<=(s.starts_at at time zone 'Asia/Kuala_Lumpur')::date
      order by o.effective_from desc,o.created_at desc limit 1) ov on true
     where a.organization_id=org and s.status='completed' and a.status in ('present','late','makeup','absent')
      and (s.starts_at at time zone 'Asia/Kuala_Lumpur')::date>=month_start and (s.starts_at at time zone 'Asia/Kuala_Lumpur')::date<month_end
    ) y where y.price is not null
    group by y.student_id,y.label,y.price) x;
  if items is null then continue; end if;
  select id into inv from public.invoices where organization_id=org and idempotency_key='sessions:'||billing_period||':'||g.guardian_id::text;
  if inv is null then
   perform private.create_invoice(org,g.guardian_id,due,billing_period,items,'sessions:'||billing_period||':'||g.guardian_id::text);
   n:=n+1;
  elsif not exists(select 1 from public.payment_allocations pa where pa.organization_id=org and pa.invoice_id=inv)
   and exists(select 1 from public.invoices i where i.id=inv and i.status in ('issued','draft','overdue')) then
   -- Belum dibayar: kemas kini butiran mengikut sesi terkini.
   delete from public.invoice_items where organization_id=org and invoice_id=inv;
   insert into public.invoice_items(organization_id,invoice_id,student_id,description,quantity,unit_price_sen,discount_sen)
    select org,inv,(i->>'student_id')::uuid,i->>'description',(i->>'quantity')::integer,(i->>'unit_price_sen')::bigint,0 from jsonb_array_elements(items) i;
   select coalesce(sum((i->>'quantity')::integer*(i->>'unit_price_sen')::bigint),0) into total from jsonb_array_elements(items) i;
   update public.invoices set total_sen=total,updated_at=now() where id=inv;
   n:=n+1;
  end if;
 end loop;
 return n;
end $$;
create or replace function public.generate_session_invoices(org uuid,billing_period text) returns integer language sql security invoker set search_path='' as $$select private.generate_session_invoices(org,billing_period)$$;
revoke all on function private.generate_session_invoices(uuid,text) from public;
grant execute on function private.generate_session_invoices(uuid,text) to authenticated;
revoke all on function public.generate_session_invoices(uuid,text) from public,anon;
grant execute on function public.generate_session_invoices(uuid,text) to authenticated;

-- 6) Buka semula laporan bulanan yang diluluskan (kembali ke draf; rumusan tutor boleh diubah semula) --
create or replace function private.reopen_student_report(org uuid,report uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare rep public.monthly_student_reports;
begin
 if not private.has_role(org,array['owner','admin']) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 select * into rep from public.monthly_student_reports m where m.organization_id=org and m.id=report for update;
 if rep.id is null then raise exception 'Laporan tidak ditemui'; end if;
 if rep.status<>'approved' then raise exception 'Laporan belum diluluskan'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||rep.student_id::text||rep.period,0));
 update public.monthly_student_reports m set status='draft',approved_by=null,approved_at=null,updated_at=now() where m.id=rep.id;
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
  values(org,auth.uid(),'REOPEN_REPORT','monthly_student_reports',rep.id,jsonb_build_object('student_id',rep.student_id,'period',rep.period,
   'approved_by',rep.approved_by,'approved_at',rep.approved_at));
 return rep.id;
end $$;
create or replace function public.reopen_student_report(org uuid,report uuid) returns uuid language sql security invoker set search_path='' as $$select private.reopen_student_report(org,report)$$;
revoke all on function private.reopen_student_report(uuid,uuid) from public;
grant execute on function private.reopen_student_report(uuid,uuid) to authenticated;
revoke all on function public.reopen_student_report(uuid,uuid) from public,anon;
grant execute on function public.reopen_student_report(uuid,uuid) to authenticated;
notify pgrst, 'reload schema';
