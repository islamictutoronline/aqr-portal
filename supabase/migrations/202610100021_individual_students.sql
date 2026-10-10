-- Model individu AQR: tutor mendaftar murid dengan program sahaja. Setiap pasangan murid+program
-- menjadi "kelas individu" tersembunyi (one_to_one, kapasiti 1) supaya kehadiran, kadar elaun
-- dan laporan sedia ada kekal berfungsi.

-- 1) Tutor boleh menjadualkan sesi untuk dirinya sendiri dalam kelas tugasannya.
create or replace function private.create_session(org uuid, cid uuid, tid uuid, start_time timestamptz, minutes integer, lesson_topic text) returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid; begin
 if not (private.has_role(org,array['owner','admin']) or (private.has_role(org,array['tutor']) and tid=private.staff_id())) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 if minutes not between 5 and 240 or not exists(select 1 from public.class_tutors where organization_id=org and class_id=cid and staff_id=tid and starts_on<=(start_time at time zone 'Asia/Kuala_Lumpur')::date and (ends_on is null or ends_on>=(start_time at time zone 'Asia/Kuala_Lumpur')::date)) then raise exception 'Tutor atau tempoh tidak sah'; end if;
 insert into public.class_sessions(organization_id,class_id,tutor_id,starts_at,ends_at,topic) values(org,cid,tid,start_time,start_time+make_interval(mins=>minutes),lesson_topic)
 on conflict(class_id,starts_at) do nothing returning id into sid;
 if sid is null then select id into sid from public.class_sessions where class_id=cid and starts_at=start_time and organization_id=org; end if;
 return sid;
end $$;

-- Cipta kelas individu tersembunyi bagi murid+program+tutor (dalaman, tiada semakan peranan).
create or replace function private.individual_class(org uuid,student uuid,program uuid,tutor uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; label text;
begin
 if not exists(select 1 from public.programs p where p.id=program and p.organization_id=org) then raise exception 'Program tidak sah'; end if;
 if exists(select 1 from public.enrollments e join public.classes c on c.id=e.class_id and c.organization_id=e.organization_id
   join public.class_tutors t on t.class_id=c.id and t.organization_id=c.organization_id
   where e.organization_id=org and e.student_id=student and e.status='active' and c.program_id=program and c.active and t.staff_id=tutor and (t.ends_on is null or t.ends_on>=current_date))
  then raise exception 'Program ini sudah didaftarkan untuk murid ini'; end if;
 select s.full_name||' · '||p.name into label from public.students s, public.programs p where s.id=student and s.organization_id=org and p.id=program;
 if label is null then raise exception 'Murid tidak sah'; end if;
 insert into public.classes(organization_id,program_id,name,mode,delivery,max_capacity) values(org,program,label,'one_to_one','online',1) returning id into result;
 insert into public.class_tutors(organization_id,class_id,staff_id) values(org,result,tutor);
 insert into public.enrollments(organization_id,student_id,class_id) values(org,student,result);
 return result;
end $$;
revoke all on function private.individual_class(uuid,uuid,uuid,uuid) from public, anon, authenticated;

-- 2) Tutor mendaftar murid baharu: nama + program; tutor ditugaskan secara automatik.
create or replace function private.tutor_add_student(org uuid,student_name text,program_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not private.has_role(org,array['tutor']) then raise exception 'Hanya tutor aktif' using errcode='42501'; end if;
 if length(trim(student_name)) not between 2 and 200 then raise exception 'Nama tidak sah'; end if;
 insert into public.students(organization_id,full_name) values(org,trim(student_name)) returning id into result;
 perform private.individual_class(org,result,tutor_add_student.program_id,private.staff_id());
 return result;
end $$;

-- 3) Tambah program kepada murid sedia ada. Tutor: murid sendiri, diajar oleh dirinya.
--    Pemilik/admin: boleh memilih tutor aktif lain (contohnya Fardhu Ain dengan tutor berbeza).
create or replace function private.add_student_program(org uuid,student_id uuid,program_id uuid,tutor_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare tutor uuid;
begin
 if private.has_role(org,array['owner','admin']) then
  tutor:=tutor_id;
  if tutor is null or not exists(select 1 from public.staff_memberships m where m.organization_id=org and m.staff_id=tutor and m.role='tutor' and m.active) then raise exception 'Pilih tutor aktif'; end if;
 elsif private.has_role(org,array['tutor']) and private.can_student(org,add_student_program.student_id) then
  tutor:=private.staff_id();
 else raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 return private.individual_class(org,add_student_program.student_id,add_student_program.program_id,tutor);
end $$;

create or replace function public.tutor_add_student(org uuid,student_name text,program_id uuid) returns uuid language sql security invoker set search_path='' as $$select private.tutor_add_student(org,student_name,program_id)$$;
create or replace function public.add_student_program(org uuid,student_id uuid,program_id uuid,tutor_id uuid default null) returns uuid language sql security invoker set search_path='' as $$select private.add_student_program(org,student_id,program_id,tutor_id)$$;
revoke all on function private.tutor_add_student(uuid,text,uuid),private.add_student_program(uuid,uuid,uuid,uuid) from public;
grant execute on function private.tutor_add_student(uuid,text,uuid),private.add_student_program(uuid,uuid,uuid,uuid) to authenticated;
revoke all on function public.tutor_add_student(uuid,text,uuid),public.add_student_program(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.tutor_add_student(uuid,text,uuid),public.add_student_program(uuid,uuid,uuid,uuid) to authenticated;
notify pgrst, 'reload schema';
