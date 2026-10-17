-- Migrasi 46: penilaian sesi dengan pilihan berbilang.
-- Kemahiran (skills), Penglibatan (participations), Fokus latihan (focuses) dan Latihan rumah (practices)
-- boleh dipilih lebih daripada satu; ulasan menggabungkan label: "bacaan, tajwid dan sebutan".
-- Penguasaan (masteries) boleh dipilih sebagai julat: "penguasaan yang memuaskan hingga baik"; tahap
-- tertinggi disimpan sebagai mastery. Medan tunggal lama (skill, mastery, ...) masih diterima.
-- assessment_responses: satu baris bagi setiap murid/sesi (diganti setiap kali disimpan).
-- Berasaskan private.record_assessment migrasi 40. Boleh dijalankan semula.

-- Kod pilihan: senarai (kunci jamak) atau satu kod (kunci tunggal, rekod lama); tanpa pendua, ikut tertib.
create or replace function private.selected_codes(selected jsonb,plural text,single text) returns text[] language sql immutable set search_path='' as $$
 select coalesce(
  case when jsonb_typeof(selected->plural)='array' and jsonb_array_length(selected->plural)>0 then
   (select array_agg(x order by p) from (select x,min(pos) p from jsonb_array_elements_text(selected->plural) with ordinality t(x,pos) where btrim(x)<>'' group by x) d)
  end,
  array_remove(array[nullif(btrim(selected->>single),'')],null))
$$;
-- Label pilihan digabung "a, b dan c"; null jika tiada kod atau mana-mana kod tidak sah.
create or replace function private.option_list(org uuid,subject uuid,grp text,codes text[]) returns text language plpgsql stable security definer set search_path='' as $$
declare labels text[]; n integer;
begin
 n:=cardinality(codes);
 if n is null or n=0 or n>10 then return null; end if;
 select array_agg(o.label order by array_position(codes,o.code)) into labels from public.assessment_options o
  where o.organization_id=org and o.subject_id=subject and o.group_code=grp and o.code=any(codes) and o.active and o.rubric_version='1';
 if cardinality(labels) is distinct from n then return null; end if;
 return case when n=1 then labels[1] else array_to_string(labels[1:n-1],', ')||' dan '||labels[n] end;
end $$;
revoke all on function private.selected_codes(jsonb,text,text), private.option_list(uuid,uuid,text,text[]) from public, anon;
grant execute on function private.selected_codes(jsonb,text,text), private.option_list(uuid,uuid,text,text[]) to authenticated;

create or replace function private.record_assessment(org uuid, sid uuid, student uuid, attendance_status text, selected jsonb, publish boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare skill_codes text[]; part_codes text[]; focus_codes text[]; practice_codes text[]; levels integer[]; low integer; lesson text; actor uuid; sess public.class_sessions; subject uuid; skill_label text; reading_text text; participation_label text; focus_label text; practice_label text; rating integer; generated text; previous uuid; result uuid; begin
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
 -- Penguasaan: satu tahap atau julat (selected.masteries); disimpan sebagai tahap tertinggi.
 begin
  if jsonb_typeof(selected->'masteries')='array' and jsonb_array_length(selected->'masteries')>0 then
   select array_agg(distinct x::integer order by x::integer) into levels from jsonb_array_elements_text(selected->'masteries') x;
  else levels:=array[(selected->>'mastery')::integer]; end if;
 exception when others then raise exception 'Pilih tahap penguasaan';
 end;
 if levels is null or array_position(levels,null) is not null or exists(select 1 from unnest(levels) v where v not between 1 and 5) then
  raise exception 'Pilih tahap penguasaan'; end if;
 low:=levels[1]; rating:=levels[cardinality(levels)];
 skill_codes:=private.selected_codes(selected,'skills','skill');
 part_codes:=private.selected_codes(selected,'participations','participation');
 focus_codes:=private.selected_codes(selected,'focuses','focus');
 practice_codes:=private.selected_codes(selected,'practices','practice');
 if lesson is not null then skill_label:='topik '||lesson;
 else skill_label:=private.option_list(org,subject,'skill',skill_codes); end if;
 participation_label:=private.option_list(org,subject,'participation',part_codes);
 focus_label:=private.option_list(org,subject,'focus',focus_codes);
 if skill_label is null or participation_label is null or focus_label is null then raise exception 'Pilihan penilaian tidak sah'; end if;
 if cardinality(practice_codes)>0 then
  select string_agg(o.label||'.',' ' order by array_position(practice_codes,o.code)) into practice_label from public.assessment_options o
   where o.organization_id=org and o.subject_id=subject and o.group_code='home_practice' and o.code=any(practice_codes) and o.active and o.rubric_version='1';
  if practice_label is null or (select count(*) from public.assessment_options o where o.organization_id=org and o.subject_id=subject and o.group_code='home_practice' and o.code=any(practice_codes) and o.active and o.rubric_version='1')<>cardinality(practice_codes) then
   raise exception 'Latihan tidak sah'; end if;
 end if;
 generated:='Alhamdulillah, murid menunjukkan penguasaan '||(array['yang memerlukan bimbingan','asas','yang memuaskan','yang baik','yang sangat baik'])[low]
  ||case when rating<>low then ' hingga '||(array['memerlukan bimbingan','asas','memuaskan','baik','sangat baik'])[rating] else '' end
  ||' dalam '||skill_label||'. Murid '||participation_label||' dalam kelas. Fokus latihan ialah '||focus_label||'.'||case when practice_label is not null then ' '||practice_label else '' end;
 end if;
 -- Bacaan (pilihan) hanya bagi kelas yang dihadiri; disahkan dan ditambah pada ulasan.
 if attendance_status in ('present','late','makeup') then reading_text:=private.reading_label(selected->'reading'); end if;
 if reading_text is not null then generated:=generated||' Bacaan: '||reading_text||'.'; end if;
 insert into public.attendance(organization_id,session_id,student_id,status,reading)
 values(org,sid,student,attendance_status,case when reading_text is not null then selected->'reading' end)
 on conflict(session_id,student_id) do update set status=excluded.status,reading=excluded.reading,updated_at=now();
 if rating is not null then
 -- Satu baris penilaian bagi setiap murid/sesi; pilihan berbilang disimpan sebagai kod dipisah koma.
 delete from public.assessment_responses where organization_id=org and session_id=sid and student_id=student;
 insert into public.assessment_responses(organization_id,session_id,student_id,skill,mastery,participation,focus,home_practice,actor_id)
 values(org,sid,student,coalesce(case when lesson is null then array_to_string(skill_codes,',') end,'topik'),rating,array_to_string(part_codes,','),array_to_string(focus_codes,','),nullif(array_to_string(practice_codes,','),''),actor)
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
notify pgrst, 'reload schema';
