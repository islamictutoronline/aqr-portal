-- Migrasi 39: pembetulan rekod kelas (Edit / kelas hari lain).
-- Tambahan sahaja; tiada data dipadam. Boleh dijalankan semula.

-- 1) Kelas individu: sesi pada tarikh lebih awal daripada tarikh mula tugasan tutor/pendaftaran murid
--    melanjutkan tarikh mula itu ke belakang (maksimum 1 tahun), sama seperti create_session/move_session.
create or replace function private.extend_backdated(org uuid, sid uuid) returns void language plpgsql security definer set search_path='' as $$
declare sess public.class_sessions; day date;
begin
 select * into sess from public.class_sessions where organization_id=org and id=sid;
 if sess.id is null then return; end if;
 day:=(sess.starts_at at time zone 'Asia/Kuala_Lumpur')::date;
 if day<current_date-365 then return; end if;
 if not (private.has_role(org,array['owner','admin']) or (private.has_role(org,array['tutor']) and sess.tutor_id=private.staff_id())) then return; end if;
 if not exists(select 1 from public.classes c where c.id=sess.class_id and c.organization_id=org and c.mode='one_to_one') then return; end if;
 update public.class_tutors t set starts_on=day where t.organization_id=org and t.class_id=sess.class_id and t.staff_id=sess.tutor_id and t.starts_on>day and (t.ends_on is null or t.ends_on>=current_date);
 update public.enrollments e set starts_on=day where e.organization_id=org and e.class_id=sess.class_id and e.status='active' and e.starts_on>day;
end $$;
revoke all on function private.extend_backdated(uuid,uuid) from public, anon;

-- 2) Rekod kehadiran: panggil extend_backdated dahulu (badan fungsi lain sama seperti migrasi 33).
create or replace function private.record_assessment(org uuid, sid uuid, student uuid, attendance_status text, selected jsonb, publish boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; sess public.class_sessions; subject uuid; skill_label text; reading_text text; participation_label text; focus_label text; practice_label text; rating integer; generated text; previous uuid; result uuid; begin
 -- Kelas individu: rekod pada tarikh lebih awal (hari lain) melanjutkan tarikh mula tugasan/pendaftaran.
 perform private.extend_backdated(org,sid);
 if not private.can_session(org,sid,true) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 actor:=private.staff_id();
 select * into sess from public.class_sessions where id=sid and organization_id=org for update;
 if sess.status in ('cancelled','rescheduled') or sess.review_status in ('verified','approved','paid') then raise exception 'Sesi dibatalkan atau telah dikunci'; end if;
 if not exists(select 1 from public.enrollments e where e.organization_id=org and e.class_id=sess.class_id and e.student_id=student and e.status<>'withdrawn' and e.starts_on<=(sess.starts_at at time zone 'Asia/Kuala_Lumpur')::date and (e.ends_on is null or e.ends_on>=(sess.starts_at at time zone 'Asia/Kuala_Lumpur')::date)) then raise exception 'Murid tidak berdaftar bagi tarikh sesi'; end if;
 if attendance_status not in ('present','late','absent','excused','makeup') then raise exception 'Kehadiran tidak sah'; end if;
 select p.subject_id into subject from public.classes c join public.programs p on p.id=c.program_id and p.organization_id=c.organization_id where c.id=sess.class_id;
 if attendance_status in ('absent','excused') or selected->>'mastery'='not_assessed' then
 generated:='Tiada penilaian pembelajaran untuk sesi ini.'; rating:=null;
 else
 rating:=(selected->>'mastery')::integer;
 if rating not between 1 and 5 or rating is null then raise exception 'Pilih tahap penguasaan'; end if;
 select label into skill_label from public.assessment_options where organization_id=org and subject_id=subject and group_code='skill' and code=selected->>'skill' and active and rubric_version='1';
 select label into participation_label from public.assessment_options where organization_id=org and subject_id=subject and group_code='participation' and code=selected->>'participation' and active and rubric_version='1';
 select label into focus_label from public.assessment_options where organization_id=org and subject_id=subject and group_code='focus' and code=selected->>'focus' and active and rubric_version='1';
 if skill_label is null or participation_label is null or focus_label is null then raise exception 'Pilihan penilaian tidak sah'; end if;
 if selected->>'practice' is not null and selected->>'practice'<>'' then
 select label into practice_label from public.assessment_options where organization_id=org and subject_id=subject and group_code='home_practice' and code=selected->>'practice' and active and rubric_version='1';
 if practice_label is null then raise exception 'Latihan tidak sah'; end if;
 end if;
 generated:='Alhamdulillah, murid menunjukkan penguasaan '||(array['yang memerlukan bimbingan','asas','yang memuaskan','yang baik','yang sangat baik'])[rating]||' dalam '||skill_label||'. Murid '||participation_label||' dalam kelas. Fokus latihan ialah '||focus_label||'.'||case when practice_label is not null then ' '||practice_label||'.' else '' end;
 end if;
 -- Bacaan (pilihan) hanya bagi kelas yang dihadiri; disahkan dan ditambah pada ulasan.
 if attendance_status in ('present','late','makeup') then reading_text:=private.reading_label(selected->'reading'); end if;
 if reading_text is not null then generated:=generated||' Bacaan: '||reading_text||'.'; end if;
 insert into public.attendance(organization_id,session_id,student_id,status,reading)
 values(org,sid,student,attendance_status,case when reading_text is not null then selected->'reading' end)
 on conflict(session_id,student_id) do update set status=excluded.status,reading=excluded.reading,updated_at=now();
 if rating is not null then
 insert into public.assessment_responses(organization_id,session_id,student_id,skill,mastery,participation,focus,home_practice,actor_id)
 values(org,sid,student,selected->>'skill',rating,selected->>'participation',selected->>'focus',selected->>'practice',actor)
 on conflict(session_id,student_id,skill) do update set mastery=excluded.mastery,participation=excluded.participation,focus=excluded.focus,home_practice=excluded.home_practice,actor_id=actor,updated_at=now();
 end if;
 select id into previous from public.generated_parent_comments where organization_id=org and session_id=sid and student_id=student and status<>'retracted' order by created_at desc limit 1;
 -- A published snapshot is never edited. A new publication explicitly retracts its predecessor.
 if publish then update public.generated_parent_comments set status='retracted' where organization_id=org and session_id=sid and student_id=student and status='published'; end if;
 insert into public.generated_parent_comments(organization_id,session_id,student_id,selections,template_version,text,status,published_by,published_at,revision_of)
 values(org,sid,student,selected,'1',generated,case when publish then 'published' else 'draft' end,case when publish then actor end,case when publish then now() end,previous) returning id into result;
 update public.class_sessions set status='completed',updated_at=now() where id=sid;
 return result;
end $$;

-- 3) Tambah rekod sesi pada tarikh/jam kelas yang pernah dipadam: sesi lama dihidupkan semula
--    (sebelum ini fungsi memulangkan sesi berstatus dibatalkan, jadi skrin rekod tidak terbuka).
create or replace function private.create_session(org uuid, cid uuid, tid uuid, start_time timestamptz, minutes integer, lesson_topic text) returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid; old public.class_sessions; day date:=(start_time at time zone 'Asia/Kuala_Lumpur')::date; begin
 if not (private.has_role(org,array['owner','admin']) or (private.has_role(org,array['tutor']) and tid=private.staff_id())) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 if minutes not between 5 and 240 then raise exception 'Tempoh tidak sah'; end if;
 if day<current_date-365 then raise exception 'Tarikh terlalu lama (maksimum 1 tahun ke belakang)'; end if;
 if exists(select 1 from public.classes c where c.id=cid and c.organization_id=org and c.mode='one_to_one')
  and exists(select 1 from public.class_tutors t where t.organization_id=org and t.class_id=cid and t.staff_id=tid and t.starts_on>day and (t.ends_on is null or t.ends_on>=current_date)) then
  update public.class_tutors t set starts_on=day where t.organization_id=org and t.class_id=cid and t.staff_id=tid and t.starts_on>day and (t.ends_on is null or t.ends_on>=current_date);
  update public.enrollments e set starts_on=day where e.organization_id=org and e.class_id=cid and e.status='active' and e.starts_on>day;
 end if;
 if not exists(select 1 from public.class_tutors where organization_id=org and class_id=cid and staff_id=tid and starts_on<=day and (ends_on is null or ends_on>=day)) then raise exception 'Tutor atau tempoh tidak sah'; end if;
 select * into old from public.class_sessions where organization_id=org and class_id=cid and starts_at=start_time for update;
 if old.id is not null then
  if old.status in ('cancelled','rescheduled') and old.review_status not in ('verified','approved','paid') then
   update public.class_sessions set status='scheduled',tutor_id=tid,ends_at=start_time+make_interval(mins=>minutes),updated_at=now() where id=old.id;
   insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
    values(org,auth.uid(),'REVIVE','class_sessions',old.id,jsonb_build_object('previous_status',old.status));
  end if;
  return old.id;
 end if;
 insert into public.class_sessions(organization_id,class_id,tutor_id,starts_at,ends_at,topic) values(org,cid,tid,start_time,start_time+make_interval(mins=>minutes),lesson_topic) returning id into sid;
 return sid;
end $$;

-- 4) Alih sesi ke tarikh/jam yang hanya diduduki kelas yang telah dipadam: kelas dipadam itu
--    diundur beberapa saat (paparan jam tidak berubah) supaya slot boleh digunakan semula.
create or replace function private.free_voided_slot(org uuid, cid uuid, at_time timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare v public.class_sessions; k integer:=1;
begin
 select * into v from public.class_sessions where organization_id=org and class_id=cid and starts_at=at_time and status in ('cancelled','rescheduled');
 if v.id is null then return; end if;
 while exists(select 1 from public.class_sessions where class_id=cid and starts_at=at_time-make_interval(secs=>k)) loop k:=k+1; end loop;
 update public.class_sessions set starts_at=at_time-make_interval(secs=>k),ends_at=ends_at-make_interval(secs=>k),updated_at=now() where id=v.id;
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
  values(org,auth.uid(),'FREE_SLOT','class_sessions',v.id,jsonb_build_object('from',at_time,'shift_seconds',k));
end $$;
revoke all on function private.free_voided_slot(uuid,uuid,timestamptz) from public, anon;

create or replace function private.move_session(org uuid,sid uuid,new_start timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare sess public.class_sessions; old_day date; new_day date:=(new_start at time zone 'Asia/Kuala_Lumpur')::date; old_time time; new_time time:=(new_start at time zone 'Asia/Kuala_Lumpur')::time;
begin
 select * into sess from public.class_sessions where organization_id=org and id=sid for update;
 if sess.id is null then raise exception 'Sesi tidak ditemui'; end if;
 if not (private.has_role(org,array['owner','admin']) or (private.has_role(org,array['tutor']) and sess.tutor_id=private.staff_id())) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 if sess.review_status in ('verified','approved','paid') or sess.status in ('cancelled','rescheduled') then raise exception 'Sesi dikunci atau dibatalkan'; end if;
 if new_day<current_date-365 then raise exception 'Tarikh terlalu lama (maksimum 1 tahun ke belakang)'; end if;
 if new_start=sess.starts_at then return sid; end if;
 perform private.free_voided_slot(org,sess.class_id,new_start);
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


notify pgrst, 'reload schema';
