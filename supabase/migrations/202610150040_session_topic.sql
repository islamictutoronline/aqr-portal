-- Migrasi 40: program teori (Fardhu Ain KAFA/Dewasa, Bahasa Arab, Faraid, Tajwid, Tadabbur, Tarannum)
-- menggunakan tajuk/topik yang ditulis sendiri oleh tutor menggantikan pilihan "Kemahiran dinilai".
-- Topik disimpan dalam pilihan ulasan (selections.topic), class_sessions.topic dan snapshot laporan bulanan.
-- Tambahan sahaja; boleh dijalankan semula.

create or replace function private.record_assessment(org uuid, sid uuid, student uuid, attendance_status text, selected jsonb, publish boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare lesson text; actor uuid; sess public.class_sessions; subject uuid; skill_label text; reading_text text; participation_label text; focus_label text; practice_label text; rating integer; generated text; previous uuid; result uuid; begin
 -- Kelas individu: rekod pada tarikh lebih awal (hari lain) melanjutkan tarikh mula tugasan/pendaftaran.
 perform private.extend_backdated(org,sid);
 if not private.can_session(org,sid,true) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 actor:=private.staff_id();
 select * into sess from public.class_sessions where id=sid and organization_id=org for update;
 if sess.status in ('cancelled','rescheduled') or sess.review_status in ('verified','approved','paid') then raise exception 'Sesi dibatalkan atau telah dikunci'; end if;
 if not exists(select 1 from public.enrollments e where e.organization_id=org and e.class_id=sess.class_id and e.student_id=student and e.status<>'withdrawn' and e.starts_on<=(sess.starts_at at time zone 'Asia/Kuala_Lumpur')::date and (e.ends_on is null or e.ends_on>=(sess.starts_at at time zone 'Asia/Kuala_Lumpur')::date)) then raise exception 'Murid tidak berdaftar bagi tarikh sesi'; end if;
 if attendance_status not in ('present','late','absent','excused','makeup') then raise exception 'Kehadiran tidak sah'; end if;
 -- Program teori (KAFA, Bahasa Arab, dll.): tajuk/topik ditulis sendiri oleh tutor menggantikan pilihan kemahiran.
 lesson:=nullif(btrim(selected->>'topic'),'');
 if length(lesson)>120 then raise exception 'Tajuk/topik terlalu panjang (maksimum 120 aksara)'; end if;
 select p.subject_id into subject from public.classes c join public.programs p on p.id=c.program_id and p.organization_id=c.organization_id where c.id=sess.class_id;
 if attendance_status in ('absent','excused') or selected->>'mastery'='not_assessed' then
 generated:=case when lesson is not null and attendance_status in ('present','late','makeup') then 'Topik pembelajaran: '||lesson||'. ' else '' end||'Tiada penilaian pembelajaran untuk sesi ini.'; rating:=null;
 else
 rating:=(selected->>'mastery')::integer;
 if rating not between 1 and 5 or rating is null then raise exception 'Pilih tahap penguasaan'; end if;
 if lesson is not null then skill_label:='topik '||lesson; else
 select label into skill_label from public.assessment_options where organization_id=org and subject_id=subject and group_code='skill' and code=selected->>'skill' and active and rubric_version='1';
 end if;
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
 values(org,sid,student,coalesce(nullif(selected->>'skill',''),case when lesson is not null then 'topik' end),rating,selected->>'participation',selected->>'focus',selected->>'practice',actor)
 on conflict(session_id,student_id,skill) do update set mastery=excluded.mastery,participation=excluded.participation,focus=excluded.focus,home_practice=excluded.home_practice,actor_id=actor,updated_at=now();
 end if;
 select id into previous from public.generated_parent_comments where organization_id=org and session_id=sid and student_id=student and status<>'retracted' order by created_at desc limit 1;
 -- A published snapshot is never edited. A new publication explicitly retracts its predecessor.
 if publish then update public.generated_parent_comments set status='retracted' where organization_id=org and session_id=sid and student_id=student and status='published'; end if;
 insert into public.generated_parent_comments(organization_id,session_id,student_id,selections,template_version,text,status,published_by,published_at,revision_of)
 values(org,sid,student,selected,'1',generated,case when publish then 'published' else 'draft' end,case when publish then actor end,case when publish then now() end,previous) returning id into result;
 update public.class_sessions set status='completed',topic=case when lesson is not null and attendance_status in ('present','late','makeup') then lesson else topic end,updated_at=now() where id=sid;
 return result;
end $$;

-- Snapshot laporan bulanan membawa topik setiap kelas.
create or replace function private.prepare_student_report(org uuid, student uuid, report_month text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; content jsonb; start_at timestamptz; end_at timestamptz;
begin
 if not private.has_role(org,array['owner','academic_admin']) then raise exception 'Akses ditolak' using errcode='42501'; end if;
 if report_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Bulan tidak sah'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||student::text||report_month,0));
 select id into result from public.monthly_student_reports where organization_id=org and student_id=student and period=report_month and status='approved';
 if result is not null then raise exception 'Laporan diluluskan dikunci'; end if;
 start_at := (report_month||'-01')::date::timestamp at time zone 'Asia/Kuala_Lumpur';
 end_at := ((report_month||'-01')::date + interval '1 month')::timestamp at time zone 'Asia/Kuala_Lumpur';
 select jsonb_build_object('student_name',s.full_name,'period',report_month,'attendance',
  coalesce((select jsonb_agg(jsonb_build_object('date',cs.starts_at,'class_name',c.name,'status',a.status,'reading',a.reading,'topic',nullif(cs.topic,'')) order by cs.starts_at)
   from public.attendance a join public.class_sessions cs on cs.id=a.session_id join public.classes c on c.id=cs.class_id
   where a.organization_id=org and a.student_id=student and cs.starts_at>=start_at and cs.starts_at<end_at and cs.status not in ('cancelled','rescheduled')),'[]'::jsonb),
  'feedback',coalesce((select jsonb_agg(jsonb_build_object('date',cs.starts_at,'text',g.text) order by cs.starts_at,g.created_at)
   from public.generated_parent_comments g join public.class_sessions cs on cs.id=g.session_id
   where g.organization_id=org and g.student_id=student and g.status='published' and cs.starts_at>=start_at and cs.starts_at<end_at and cs.status not in ('cancelled','rescheduled')),'[]'::jsonb),
  'tutor_remark',(select r.remark from public.monthly_tutor_remarks r
   where r.organization_id=org and r.student_id=student and r.period=report_month),
  'progress',coalesce((select jsonb_agg(jsonb_build_object('date',cs.starts_at,'mastery',p.mastery,'notes',p.parent_notes) order by cs.starts_at)
   from public.student_progress p join public.class_sessions cs on cs.id=p.session_id
   where p.organization_id=org and p.student_id=student and p.published_at is not null and cs.starts_at>=start_at and cs.starts_at<end_at
   and exists(select 1 from public.attendance a where a.session_id=p.session_id and a.student_id=student and a.status in ('present','late','makeup'))),'[]'::jsonb)
 ) into content from public.students s where s.id=student and s.organization_id=org;
 if content is null then raise exception 'Murid tidak ditemui'; end if;
 insert into public.monthly_student_reports(organization_id,student_id,period,snapshot,created_by)
 values(org,student,report_month,content,private.staff_id())
 on conflict(organization_id,student_id,period) do update set snapshot=excluded.snapshot,updated_at=now()
 returning id into result;
 return result;
end $$;
notify pgrst, 'reload schema';
