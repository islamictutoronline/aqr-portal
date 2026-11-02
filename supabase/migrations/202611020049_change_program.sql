-- Tukar / padam program murid tanpa memadam murid (keputusan pengguna 2 Nov 2026): murid kadang-kadang
-- naik dari Iqra' ke al-Quran, atau tutor tersalah pilih program semasa mendaftar.
--  * change_student_program(cid,new_program,from_date):
--    - from_date null → betulkan: program kelas ditukar di tempatnya; sesi, kehadiran dan jadual kekal.
--    - from_date diberi dan ada kehadiran sebelum tarikh itu → pecah: kelas baharu bagi program baharu
--      (tutor, jadual, jadual fleksibel dan kadar khas disalin), sesi mulai tarikh itu dipindah ke kelas
--      baharu, kelas lama ditamatkan. Rekod sebelum tarikh itu kekal pada program lama.
--    - from_date diberi tanpa kehadiran sebelumnya → sama seperti betulkan.
--    from_date hanya hari ini atau sebelumnya (maks dua bulan lepas).
--  * remove_student_program(cid): tamatkan satu program sahaja; murid kekal. Program terakhir murid tidak
--    boleh dipadam (guna Tukar program, atau Padam murid jika murid berhenti).
-- Tutor kelas itu, atau pemilik/admin. Boleh dijalankan semula.

create or replace function private.change_student_program(org uuid,cid uuid,new_program uuid,from_date date default null) returns uuid language plpgsql security definer set search_path='' as $$
declare old public.classes; enr public.enrollments; tutor uuid; label text; result uuid; moved integer;
begin
 if not private.can_manage_class(org,cid) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||cid::text||'schedule',0));
 select * into old from public.classes k where k.organization_id=org and k.id=cid and k.active and k.mode='one_to_one' for update;
 if old.id is null then raise exception 'Program murid tidak ditemui'; end if;
 select * into enr from public.enrollments e where e.organization_id=org and e.class_id=cid and e.status='active' limit 1 for update;
 if enr.id is null then raise exception 'Murid tidak aktif dalam program ini'; end if;
 if old.program_id=new_program then raise exception 'Program baharu sama dengan program semasa'; end if;
 select s.full_name||' · '||p.name into label from public.students s, public.programs p
  where s.organization_id=org and s.id=enr.student_id and p.organization_id=org and p.id=new_program and p.status='active';
 if label is null then raise exception 'Program tidak sah'; end if;
 if exists(select 1 from public.enrollments e join public.classes k on k.id=e.class_id and k.organization_id=e.organization_id
   where e.organization_id=org and e.student_id=enr.student_id and e.status='active' and k.active and k.program_id=new_program and k.id<>cid)
  then raise exception 'Murid sudah berdaftar dalam program ini'; end if;
 -- Tiada tarikh akan datang: kelas lama ditamatkan serta-merta, jadi sesinya sebelum tarikh itu akan tersorok.
 if from_date is not null and (from_date<current_date-62 or from_date>current_date) then
  raise exception 'Tarikh mula program baharu mesti antara dua bulan lepas dan hari ini'; end if;

 -- Betulkan di tempatnya: tiada rekod lama yang perlu kekal pada program asal.
 if from_date is null or not exists(select 1 from public.attendance a join public.class_sessions s on s.id=a.session_id and s.organization_id=a.organization_id
   where s.organization_id=org and s.class_id=cid and (s.starts_at at time zone 'Asia/Kuala_Lumpur')::date<from_date) then
  update public.classes k set program_id=new_program,name=label where k.organization_id=org and k.id=cid;
  insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
   values(org,auth.uid(),'CHANGE_PROGRAM','classes',cid,jsonb_build_object('from_program',old.program_id,'to_program',new_program,'from_date',from_date,'split',false));
  return cid;
 end if;

 -- Pecah: program baharu mulai from_date.
 select t.staff_id into tutor from public.class_tutors t where t.organization_id=org and t.class_id=cid and t.ends_on is null
  order by t.starts_on desc, t.created_at desc limit 1;
 if tutor is null then raise exception 'Tutor kelas tidak ditemui'; end if;
 insert into public.classes(organization_id,program_id,name,mode,delivery,max_capacity,venue,flexible)
  values(org,new_program,label,'one_to_one',old.delivery,1,old.venue,old.flexible) returning id into result;
 insert into public.class_tutors(organization_id,class_id,staff_id,starts_on) values(org,result,tutor,from_date);
 insert into public.class_schedules(organization_id,class_id,day_of_week,start_time,duration_minutes,effective_from,effective_to,exceptions)
  select org,result,r.day_of_week,r.start_time,r.duration_minutes,greatest(r.effective_from,from_date),r.effective_to,r.exceptions
  from public.class_schedules r where r.organization_id=org and r.class_id=cid and (r.effective_to is null or r.effective_to>=from_date);
 delete from public.class_schedules r where r.organization_id=org and r.class_id=cid and r.effective_from>=from_date;
 update public.class_schedules r set effective_to=from_date-1 where r.organization_id=org and r.class_id=cid and (r.effective_to is null or r.effective_to>=from_date);
 -- Kadar khas: baris berkuat kuasa pada from_date dan baris kemudian (created_at dikekalkan untuk susunan seri).
 insert into public.class_rate_overrides(organization_id,class_id,fee_sen,allowance_sen,effective_from,created_by,created_at)
  select org,result,o.fee_sen,o.allowance_sen,greatest(o.effective_from,from_date),o.created_by,o.created_at
  from public.class_rate_overrides o where o.organization_id=org and o.class_id=cid
   and (o.effective_from>from_date or o.id=(select x.id from public.class_rate_overrides x where x.organization_id=org and x.class_id=cid
    and x.effective_from<=from_date order by x.effective_from desc, x.created_at desc limit 1));
 update public.class_sessions s set class_id=result where s.organization_id=org and s.class_id=cid
  and (s.starts_at at time zone 'Asia/Kuala_Lumpur')::date>=from_date;
 get diagnostics moved=row_count;
 update public.enrollments e set status='completed',ends_on=greatest(e.starts_on,from_date-1) where e.id=enr.id;
 insert into public.enrollments(organization_id,student_id,class_id,starts_on) values(org,enr.student_id,result,from_date);
 update public.classes k set active=false where k.organization_id=org and k.id=cid;
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
  values(org,auth.uid(),'CHANGE_PROGRAM','classes',cid,jsonb_build_object('from_program',old.program_id,'to_program',new_program,
   'from_date',from_date,'split',true,'new_class',result,'sessions_moved',moved));
 return result;
end $$;

create or replace function private.remove_student_program(org uuid,cid uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare enr public.enrollments;
begin
 if not private.can_manage_class(org,cid) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||cid::text||'schedule',0));
 select e.* into enr from public.enrollments e join public.classes k on k.id=e.class_id and k.organization_id=e.organization_id
  where e.organization_id=org and e.class_id=cid and e.status='active' and k.mode='one_to_one' limit 1 for update of e;
 if enr.id is null then raise exception 'Program murid tidak ditemui'; end if;
 if not exists(select 1 from public.enrollments x where x.organization_id=org and x.student_id=enr.student_id and x.status='active' and x.class_id<>cid) then
  raise exception 'Ini satu-satunya program murid. Guna Tukar program, atau Padam murid jika murid berhenti.'; end if;
 update public.enrollments e set status='withdrawn',ends_on=greatest(e.starts_on,current_date) where e.id=enr.id;
 update public.class_schedules r set effective_to=greatest(r.effective_from,current_date)
  where r.organization_id=org and r.class_id=cid and (r.effective_to is null or r.effective_to>current_date);
 -- Sesi yang belum direkod (lepas atau akan datang) dibatalkan; kehadiran yang sudah direkod kekal.
 update public.class_sessions s set status='cancelled' where s.organization_id=org and s.class_id=cid and s.status='scheduled'
  and not exists(select 1 from public.attendance a where a.organization_id=org and a.session_id=s.id);
 update public.classes k set active=false where k.organization_id=org and k.id=cid;
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
  values(org,auth.uid(),'REMOVE_PROGRAM','classes',cid,jsonb_build_object('student',enr.student_id));
 return cid;
end $$;

create or replace function public.change_student_program(org uuid,cid uuid,new_program uuid,from_date date default null) returns uuid language sql security invoker set search_path='' as $$select private.change_student_program(org,cid,new_program,from_date)$$;
create or replace function public.remove_student_program(org uuid,cid uuid) returns uuid language sql security invoker set search_path='' as $$select private.remove_student_program(org,cid)$$;
revoke all on function private.change_student_program(uuid,uuid,uuid,date),private.remove_student_program(uuid,uuid) from public;
grant execute on function private.change_student_program(uuid,uuid,uuid,date),private.remove_student_program(uuid,uuid) to authenticated;
revoke all on function public.change_student_program(uuid,uuid,uuid,date),public.remove_student_program(uuid,uuid) from public,anon;
grant execute on function public.change_student_program(uuid,uuid,uuid,date),public.remove_student_program(uuid,uuid) to authenticated;
notify pgrst, 'reload schema';
