-- Bacaan sesi untuk laporan (keputusan pengguna 11 Okt 2026), diselaraskan bagi Iqra', Tahsin,
-- Kelancaran dan Pra Tahfiz: Iqra' → jilid + muka surat; al-Quran → surah + ayat (dari–hingga) + muka surat.
-- Disimpan pada attendance.reading, ditambah pada ulasan ibu bapa dan snapshot laporan bulanan.
-- Selari dengan src/lib/quran.ts (readingLabel). Boleh dijalankan semula.

alter table public.attendance add column if not exists reading jsonb;

create or replace function private.surah_name(n integer) returns text language sql immutable set search_path='' as $$
 select (array['Al-Fatihah','Al-Baqarah','Ali ''Imran','An-Nisa''','Al-Ma''idah','Al-An''am','Al-A''raf','Al-Anfal','At-Taubah','Yunus','Hud','Yusuf','Ar-Ra''d','Ibrahim','Al-Hijr','An-Nahl','Al-Isra''','Al-Kahf','Maryam','Taha','Al-Anbiya''','Al-Hajj','Al-Mu''minun','An-Nur','Al-Furqan','Asy-Syu''ara''','An-Naml','Al-Qasas','Al-''Ankabut','Ar-Rum','Luqman','As-Sajdah','Al-Ahzab','Saba''','Fatir','Yasin','As-Saffat','Sad','Az-Zumar','Ghafir','Fussilat','Asy-Syura','Az-Zukhruf','Ad-Dukhan','Al-Jathiyah','Al-Ahqaf','Muhammad','Al-Fath','Al-Hujurat','Qaf','Az-Zariyat','At-Tur','An-Najm','Al-Qamar','Ar-Rahman','Al-Waqi''ah','Al-Hadid','Al-Mujadalah','Al-Hasyr','Al-Mumtahanah','As-Saff','Al-Jumu''ah','Al-Munafiqun','At-Taghabun','At-Talaq','At-Tahrim','Al-Mulk','Al-Qalam','Al-Haqqah','Al-Ma''arij','Nuh','Al-Jinn','Al-Muzzammil','Al-Muddaththir','Al-Qiyamah','Al-Insan','Al-Mursalat','An-Naba''','An-Nazi''at','''Abasa','At-Takwir','Al-Infitar','Al-Mutaffifin','Al-Insyiqaq','Al-Buruj','At-Tariq','Al-A''la','Al-Ghasyiyah','Al-Fajr','Al-Balad','Asy-Syams','Al-Lail','Ad-Duha','Asy-Syarh','At-Tin','Al-''Alaq','Al-Qadr','Al-Bayyinah','Az-Zalzalah','Al-''Adiyat','Al-Qari''ah','At-Takathur','Al-''Asr','Al-Humazah','Al-Fil','Quraisy','Al-Ma''un','Al-Kauthar','Al-Kafirun','An-Nasr','Al-Masad','Al-Ikhlas','Al-Falaq','An-Nas'])[n]
$$;
create or replace function private.surah_ayahs(n integer) returns integer language sql immutable set search_path='' as $$
 select (array[7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6]::integer[])[n]
$$;

-- "Iqra' 3, muka surat 12" · "Surah Al-Mulk ayat 1–10, muka surat 562"; ralat jika julat tidak sah.
create or replace function private.reading_label(r jsonb) returns text language plpgsql immutable set search_path='' as $$
declare kind text; jilid integer; pg integer; su integer; af integer; a_to integer; mx integer; t text; parts text[]:='{}';
begin
 if r is null or jsonb_typeof(r)<>'object' then return null; end if;
 kind:=r->>'kind';
 if kind is null or kind not in ('iqra','quran') then raise exception 'Jenis bacaan tidak sah'; end if;
 begin
  jilid:=(r->>'jilid')::integer; pg:=(r->>'page')::integer; su:=(r->>'surah')::integer;
  af:=(r->>'ayah_from')::integer; a_to:=(r->>'ayah_to')::integer;
 exception when others then raise exception 'Bacaan tidak sah';
 end;
 if jilid is not null and jilid not between 1 and 6 then raise exception 'Jilid Iqra'' mesti 1 hingga 6'; end if;
 if pg is not null and pg not between 1 and 604 then raise exception 'Muka surat mesti 1 hingga 604'; end if;
 if su is not null and su not between 1 and 114 then raise exception 'Surah tidak sah'; end if;
 if kind='quran' then
  if (af is not null or a_to is not null) and su is null then raise exception 'Pilih surah dahulu'; end if;
  mx:=coalesce(private.surah_ayahs(su),286);
  if coalesce(af,1) not between 1 and mx or coalesce(a_to,1) not between 1 and mx then
   raise exception 'Surah % hanya % ayat', private.surah_name(su), mx; end if;
  if af is not null and a_to is not null and a_to<af then raise exception 'Ayat akhir mesti selepas ayat mula'; end if;
 end if;
 if kind='iqra' and jilid is not null then parts:=parts||('Iqra'' '||jilid); end if;
 if kind='quran' and su is not null then
  t:='Surah '||private.surah_name(su);
  if af is not null then t:=t||' ayat '||af||case when a_to is not null and a_to<>af then '–'||a_to else '' end;
  elsif a_to is not null then t:=t||' ayat '||a_to; end if;
  parts:=parts||t;
 end if;
 if pg is not null then parts:=parts||('muka surat '||pg); end if;
 if cardinality(parts)=0 then return null; end if;
 t:=array_to_string(parts,', ');
 return upper(left(t,1))||substr(t,2);
end $$;
revoke all on function private.surah_name(integer), private.surah_ayahs(integer), private.reading_label(jsonb) from public, anon;
grant execute on function private.surah_name(integer), private.surah_ayahs(integer), private.reading_label(jsonb) to authenticated;

-- Rekod kehadiran + penilaian (sama seperti asal) dengan bacaan sesi.
create or replace function private.record_assessment(org uuid, sid uuid, student uuid, attendance_status text, selected jsonb, publish boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; sess public.class_sessions; subject uuid; skill_label text; reading_text text; participation_label text; focus_label text; practice_label text; rating integer; generated text; previous uuid; result uuid; begin
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

-- Snapshot laporan bulanan kini membawa bacaan setiap kelas.
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
  coalesce((select jsonb_agg(jsonb_build_object('date',cs.starts_at,'class_name',c.name,'status',a.status,'reading',a.reading) order by cs.starts_at)
   from public.attendance a join public.class_sessions cs on cs.id=a.session_id join public.classes c on c.id=cs.class_id
   where a.organization_id=org and a.student_id=student and cs.starts_at>=start_at and cs.starts_at<end_at and cs.status not in ('cancelled','rescheduled')),'[]'::jsonb),
  'feedback',coalesce((select jsonb_agg(jsonb_build_object('date',cs.starts_at,'text',g.text) order by cs.starts_at,g.created_at)
   from public.generated_parent_comments g join public.class_sessions cs on cs.id=g.session_id
   where g.organization_id=org and g.student_id=student and g.status='published' and cs.starts_at>=start_at and cs.starts_at<end_at and cs.status not in ('cancelled','rescheduled')),'[]'::jsonb),
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
