-- Rumusan tutor (keputusan pengguna 12 Okt 2026): tutor boleh menulis ayat sendiri untuk rumusan
-- laporan bulanan setiap murid. Teks bebas (maks 1500 aksara) disimpan berasingan daripada ulasan
-- templat dan dimasukkan ke snapshot laporan bulanan sebagai 'tutor_remark'. Boleh dijalankan semula.

create table if not exists public.monthly_tutor_remarks (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 student_id uuid not null references public.students(id),
 period text not null check(period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 remark text not null check(length(remark) between 1 and 1500),
 staff_id uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,student_id,period)
);
alter table public.monthly_tutor_remarks enable row level security;
revoke all on public.monthly_tutor_remarks from anon, authenticated;
grant select on public.monthly_tutor_remarks to authenticated;
drop policy if exists tutor_remarks_read on public.monthly_tutor_remarks;
create policy tutor_remarks_read on public.monthly_tutor_remarks for select to authenticated
 using(private.has_role(organization_id,array['owner','admin'])
  or (private.has_role(organization_id,array['tutor']) and private.can_student(organization_id,student_id)));

-- Simpan/kemas kini/padam (teks kosong) rumusan. Tutor murid itu atau pemilik/admin.
create or replace function private.save_tutor_remark(org uuid,student_id uuid,period text,remark text) returns uuid language plpgsql security definer set search_path='' as $$
declare txt text:=trim(coalesce(remark,'')); result uuid;
begin
 if not (private.has_role(org,array['owner','admin'])
   or (private.has_role(org,array['tutor']) and exists(select 1 from public.enrollments e
        where e.organization_id=org and e.student_id=save_tutor_remark.student_id and e.status='active'
         and private.can_manage_class(org,e.class_id)))) then
  raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 if period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Bulan tidak sah'; end if;
 if length(txt)>1500 then raise exception 'Rumusan terlalu panjang (maksimum 1500 aksara)'; end if;
 if exists(select 1 from public.monthly_student_reports m where m.organization_id=org and m.student_id=save_tutor_remark.student_id
   and m.period=save_tutor_remark.period and m.status='approved') then
  raise exception 'Laporan bulan ini sudah diluluskan; rumusan dikunci'; end if;
 if txt='' then
  delete from public.monthly_tutor_remarks r where r.organization_id=org and r.student_id=save_tutor_remark.student_id and r.period=save_tutor_remark.period;
  return null;
 end if;
 insert into public.monthly_tutor_remarks(organization_id,student_id,period,remark,staff_id)
  values(org,save_tutor_remark.student_id,save_tutor_remark.period,txt,private.staff_id())
  on conflict on constraint monthly_tutor_remarks_organization_id_student_id_period_key
  do update set remark=excluded.remark,staff_id=excluded.staff_id,updated_at=now()
  returning id into result;
 return result;
end $$;
create or replace function public.save_tutor_remark(org uuid,student_id uuid,period text,remark text) returns uuid language sql security invoker set search_path='' as $$select private.save_tutor_remark(org,student_id,period,remark)$$;
revoke all on function private.save_tutor_remark(uuid,uuid,text,text) from public;
grant execute on function private.save_tutor_remark(uuid,uuid,text,text) to authenticated;
revoke all on function public.save_tutor_remark(uuid,uuid,text,text) from public,anon;
grant execute on function public.save_tutor_remark(uuid,uuid,text,text) to authenticated;

-- Snapshot laporan bulanan membawa rumusan tutor.
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
