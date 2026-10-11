-- Penjaga diisi terus oleh tutor semasa mendaftar murid (keputusan pengguna 11 Okt 2026):
-- nama waris (lalai "Ibu/Bapa <nama murid>") + no. WhatsApp → rekod penjaga + pautan penjaga bil,
-- cukup untuk admin menjana invois. No. telefon sama = penjaga sama (adik-beradik digabung dalam satu invois).
-- Tutor boleh melihat penjaga murid yang diajarnya. Boleh dijalankan semula.

-- Nombor Malaysia → E.164: "012-345 6789" → +60123456789; "60…" → +60…; "+…" dikekalkan.
create or replace function private.normalize_phone(raw text) returns text language plpgsql immutable set search_path='' as $$
declare d text;
begin
 if raw is null or trim(raw)='' then return null; end if;
 d:=regexp_replace(raw,'[^0-9]','','g');
 if trim(raw) like '+%' then d:='+'||d;
 elsif d like '0%' then d:='+6'||d;
 elsif d like '60%' then d:='+'||d;
 else d:='+'||d; end if;
 if d !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'No. WhatsApp tidak sah. Contoh: 012-345 6789'; end if;
 return d;
end $$;
revoke all on function private.normalize_phone(text) from public, anon, authenticated;

-- Simpan/kemas kini penjaga bil bagi seorang murid. Pemilik/admin, atau tutor yang mengajar murid itu.
create or replace function private.save_student_guardian(org uuid,student_id uuid,guardian_name text,guardian_phone text) returns uuid language plpgsql security definer set search_path='' as $$
declare st text; nm text; ph text; gid uuid; cur uuid; shared boolean;
begin
 if not (private.has_role(org,array['owner','admin'])
   or (private.has_role(org,array['tutor']) and exists(select 1 from public.enrollments e
        join public.class_tutors t on t.organization_id=e.organization_id and t.class_id=e.class_id and t.staff_id=private.staff_id() and t.ends_on is null
        where e.organization_id=org and e.student_id=save_student_guardian.student_id and e.status='active'))) then
  raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 select full_name into st from public.students where organization_id=org and id=save_student_guardian.student_id;
 if st is null then raise exception 'Murid tidak ditemui'; end if;
 nm:=coalesce(nullif(trim(guardian_name),''),'Ibu/Bapa '||st);
 if length(nm)>200 then raise exception 'Nama penjaga terlalu panjang'; end if;
 ph:=private.normalize_phone(guardian_phone);
 -- Penjaga bil semasa murid ini (jika ada).
 select sg.guardian_id into cur from public.student_guardians sg
  where sg.organization_id=org and sg.student_id=save_student_guardian.student_id and sg.is_billing_contact limit 1;
 -- No. telefon yang sama → gunakan penjaga sedia ada (adik-beradik).
 if ph is not null then
  select g.id into gid from public.guardians g where g.organization_id=org and g.phone=ph and g.active order by g.created_at limit 1;
 end if;
 if gid is not null then
  -- Gantikan nama lalai dengan nama sebenar; nama yang sudah diisi tidak ditimpa.
  update public.guardians g set full_name=nm,updated_at=now()
   where g.id=gid and g.full_name like 'Ibu/Bapa %' and nullif(trim(guardian_name),'') is not null;
 elsif cur is not null then
  select count(*)>1 into shared from public.student_guardians sg where sg.organization_id=org and sg.guardian_id=cur;
  if shared then
   insert into public.guardians(organization_id,full_name,phone,preference) values(org,nm,ph,'whatsapp') returning id into gid;
  else
   update public.guardians g set full_name=nm,phone=ph,updated_at=now() where g.id=cur returning g.id into gid;
  end if;
 else
  insert into public.guardians(organization_id,full_name,phone,preference) values(org,nm,ph,'whatsapp') returning id into gid;
 end if;
 update public.student_guardians sg set is_billing_contact=false,updated_at=now()
  where sg.organization_id=org and sg.student_id=save_student_guardian.student_id and sg.guardian_id<>gid and sg.is_billing_contact;
 insert into public.student_guardians(organization_id,student_id,guardian_id,relation,is_billing_contact)
  values(org,save_student_guardian.student_id,gid,'penjaga',true)
  on conflict on constraint student_guardians_student_id_guardian_id_key do update set is_billing_contact=true,updated_at=now();
 return gid;
end $$;
create or replace function public.save_student_guardian(org uuid,student_id uuid,guardian_name text,guardian_phone text) returns uuid language sql security invoker set search_path='' as $$select private.save_student_guardian(org,student_id,guardian_name,guardian_phone)$$;
revoke all on function private.save_student_guardian(uuid,uuid,text,text) from public;
grant execute on function private.save_student_guardian(uuid,uuid,text,text) to authenticated;
revoke all on function public.save_student_guardian(uuid,uuid,text,text) from public,anon;
grant execute on function public.save_student_guardian(uuid,uuid,text,text) to authenticated;

-- Daftar murid + jadual + penjaga dalam satu transaksi (gagal satu, gagal semua).
drop function if exists public.tutor_enrol_student(uuid,text,uuid,integer,jsonb,date,date);
drop function if exists private.tutor_enrol_student(uuid,text,uuid,integer,jsonb,date,date);
create or replace function private.tutor_enrol_student(org uuid,student_name text,program_id uuid,minutes integer,slots jsonb,end_date date default '2027-12-31',start_date date default null,guardian_name text default null,guardian_phone text default null) returns uuid language plpgsql security definer set search_path='' as $$
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
 perform private.save_student_guardian(org,sid,guardian_name,guardian_phone);
 return sid;
end $$;
create or replace function public.tutor_enrol_student(org uuid,student_name text,program_id uuid,minutes integer,slots jsonb,end_date date default '2027-12-31',start_date date default null,guardian_name text default null,guardian_phone text default null) returns uuid language sql security invoker set search_path='' as $$select private.tutor_enrol_student(org,student_name,program_id,minutes,slots,end_date,start_date,guardian_name,guardian_phone)$$;
revoke all on function private.tutor_enrol_student(uuid,text,uuid,integer,jsonb,date,date,text,text) from public;
grant execute on function private.tutor_enrol_student(uuid,text,uuid,integer,jsonb,date,date,text,text) to authenticated;
revoke all on function public.tutor_enrol_student(uuid,text,uuid,integer,jsonb,date,date,text,text) from public,anon;
grant execute on function public.tutor_enrol_student(uuid,text,uuid,integer,jsonb,date,date,text,text) to authenticated;

-- Tutor boleh membaca penjaga (dan pautan) bagi murid yang diajarnya — untuk menghubungi waris.
create or replace function private.tutor_sees_guardian(org uuid,gid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.has_role(org,array['tutor']) and exists(select 1 from public.student_guardians sg
  where sg.organization_id=org and sg.guardian_id=gid and private.can_student(org,sg.student_id))
$$;
revoke all on function private.tutor_sees_guardian(uuid,uuid) from public, anon;
grant execute on function private.tutor_sees_guardian(uuid,uuid) to authenticated;
drop policy if exists guardian_read_tutor on public.guardians;
create policy guardian_read_tutor on public.guardians for select to authenticated
 using(private.tutor_sees_guardian(organization_id,id));
drop policy if exists links_read_tutor on public.student_guardians;
create policy links_read_tutor on public.student_guardians for select to authenticated
 using(private.has_role(organization_id,array['tutor']) and private.can_student(organization_id,student_id));
notify pgrst, 'reload schema';
