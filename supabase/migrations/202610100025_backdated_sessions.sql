-- Rekod kelas backdated: untuk kelas individu, jika sesi lebih awal daripada tarikh mula tugasan
-- tutor/pendaftaran murid (dicipta pada hari pendaftaran), tarikh mula dilanjutkan ke belakang
-- secara automatik, maksimum 1 tahun. Boleh dijalankan semula.
create or replace function private.create_session(org uuid, cid uuid, tid uuid, start_time timestamptz, minutes integer, lesson_topic text) returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid; day date:=(start_time at time zone 'Asia/Kuala_Lumpur')::date; begin
 if not (private.has_role(org,array['owner','admin']) or (private.has_role(org,array['tutor']) and tid=private.staff_id())) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 if minutes not between 5 and 240 then raise exception 'Tempoh tidak sah'; end if;
 if day<current_date-365 then raise exception 'Tarikh terlalu lama (maksimum 1 tahun ke belakang)'; end if;
 -- Kelas individu: lanjutkan tugasan semasa tutor dan pendaftaran aktif ke tarikh sesi.
 if exists(select 1 from public.classes c where c.id=cid and c.organization_id=org and c.mode='one_to_one')
  and exists(select 1 from public.class_tutors t where t.organization_id=org and t.class_id=cid and t.staff_id=tid and t.starts_on>day and (t.ends_on is null or t.ends_on>=current_date)) then
  update public.class_tutors t set starts_on=day where t.organization_id=org and t.class_id=cid and t.staff_id=tid and t.starts_on>day and (t.ends_on is null or t.ends_on>=current_date);
  update public.enrollments e set starts_on=day where e.organization_id=org and e.class_id=cid and e.status='active' and e.starts_on>day;
 end if;
 if not exists(select 1 from public.class_tutors where organization_id=org and class_id=cid and staff_id=tid and starts_on<=day and (ends_on is null or ends_on>=day)) then raise exception 'Tutor atau tempoh tidak sah'; end if;
 insert into public.class_sessions(organization_id,class_id,tutor_id,starts_at,ends_at,topic) values(org,cid,tid,start_time,start_time+make_interval(mins=>minutes),lesson_topic)
 on conflict(class_id,starts_at) do nothing returning id into sid;
 if sid is null then select id into sid from public.class_sessions where class_id=cid and starts_at=start_time and organization_id=org; end if;
 return sid;
end $$;
notify pgrst, 'reload schema';
