-- Final clarification: preserve parent portal, approved monthly snapshots, manual delivery.
create table public.monthly_student_reports (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 student_id uuid not null, period text not null check(period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 status text not null default 'draft' check(status in ('draft','approved')), snapshot jsonb not null,
 created_by uuid not null, approved_by uuid, approved_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,student_id,period),
 foreign key(organization_id,student_id) references public.students(organization_id,id),
 foreign key(organization_id,created_by) references public.staff_memberships(organization_id,staff_id),
 foreign key(organization_id,approved_by) references public.staff_memberships(organization_id,staff_id),
 check((status='approved')=(approved_by is not null and approved_at is not null))
);
create table public.report_deliveries (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 report_id uuid not null, guardian_id uuid not null,
 status text not null check(status in ('prepared','sent','acknowledged','failed')),
 note text not null default '' check(length(note)<=500), updated_by uuid not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(report_id,guardian_id),
 foreign key(organization_id,report_id) references public.monthly_student_reports(organization_id,id),
 foreign key(organization_id,guardian_id) references public.guardians(organization_id,id),
 foreign key(organization_id,updated_by) references public.staff_memberships(organization_id,staff_id)
);
alter table public.monthly_student_reports enable row level security;
alter table public.report_deliveries enable row level security;
grant select on public.monthly_student_reports,public.report_deliveries to authenticated;
create policy monthly_read on public.monthly_student_reports for select to authenticated using(
 private.has_role(organization_id,array['owner','academic_admin']) or
 (status='approved' and private.owns_student(organization_id,student_id))
);
create policy delivery_read on public.report_deliveries for select to authenticated using(private.has_role(organization_id,array['owner','academic_admin']));
create index monthly_period_idx on public.monthly_student_reports(organization_id,period,status);
create trigger audit_change after insert or update on public.monthly_student_reports for each row execute function private.audit_change();
create trigger audit_change after insert or update on public.report_deliveries for each row execute function private.audit_change();

create function private.prepare_student_report(org uuid, student uuid, report_month text) returns uuid
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
  coalesce((select jsonb_agg(jsonb_build_object('date',cs.starts_at,'class_name',c.name,'status',a.status) order by cs.starts_at)
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
create function public.prepare_student_report(org uuid,student uuid,report_month text) returns uuid language sql security invoker set search_path='' as $$select private.prepare_student_report(org,student,report_month)$$;

create function private.approve_student_report(org uuid,report uuid) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not private.has_role(org,array['owner','academic_admin']) then raise exception 'Akses ditolak' using errcode='42501'; end if;
 -- Same advisory lock as preparation prevents approval of a concurrently replaced draft.
 perform pg_advisory_xact_lock(hashtextextended(org::text||r.student_id::text||r.period,0)) from public.monthly_student_reports r where r.id=report and r.organization_id=org;
 update public.monthly_student_reports set status='approved',approved_by=private.staff_id(),approved_at=now(),updated_at=now()
 where id=report and organization_id=org and status='draft';
 if not found and not exists(select 1 from public.monthly_student_reports where id=report and organization_id=org and status='approved') then raise exception 'Laporan tidak ditemui'; end if;
 return report;
end $$;
create function public.approve_student_report(org uuid,report uuid) returns uuid language sql security invoker set search_path='' as $$select private.approve_student_report(org,report)$$;

create function private.record_report_delivery(org uuid,report uuid,guardian uuid,delivery_status text,delivery_note text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not private.has_role(org,array['owner','academic_admin']) then raise exception 'Akses ditolak' using errcode='42501'; end if;
 if not exists(select 1 from public.monthly_student_reports r join public.student_guardians sg on sg.student_id=r.student_id and sg.organization_id=r.organization_id
 join public.guardians g on g.id=sg.guardian_id where r.id=report and r.organization_id=org and r.status='approved' and sg.guardian_id=guardian and g.active) then raise exception 'Laporan/penjaga tidak sah'; end if;
 insert into public.report_deliveries(organization_id,report_id,guardian_id,status,note,updated_by)
 values(org,report,guardian,delivery_status,delivery_note,private.staff_id())
 on conflict(report_id,guardian_id) do update set status=excluded.status,note=excluded.note,updated_by=excluded.updated_by,updated_at=now() returning id into result;
 return result;
end $$;
create function public.record_report_delivery(org uuid,report uuid,guardian uuid,delivery_status text,delivery_note text default '') returns uuid language sql security invoker set search_path='' as $$select private.record_report_delivery(org,report,guardian,delivery_status,delivery_note)$$;

-- A parent can read financial history but cannot submit or change financial records.
alter function private.submit_payment(uuid,uuid,bigint,text,text,text) rename to submit_payment_before_readonly;
revoke all on function private.submit_payment_before_readonly(uuid,uuid,bigint,text,text,text) from public,authenticated,anon;
create function private.submit_payment(org uuid,guardian uuid,amount bigint,payment_method text,payment_ref text,idem text) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not private.has_role(org,array['owner','finance_admin']) then raise exception 'Portal penjaga baca sahaja' using errcode='42501'; end if;
 return private.submit_payment_before_readonly(org,guardian,amount,payment_method,payment_ref,idem);
end $$;
create or replace function public.submit_payment(org uuid, guardian uuid, amount bigint, payment_method text, payment_ref text, idem text) returns uuid language sql security invoker set search_path='' as $$ select private.submit_payment(org,guardian,amount,payment_method,payment_ref,idem) $$;
drop policy evidence_insert on public.payment_evidence;
create policy evidence_insert on public.payment_evidence for insert to authenticated with check(
 private.has_role(organization_id,array['owner','finance_admin']) and uploaded_by=auth.uid() and private.can_payment(organization_id,payment_id)
 and path like organization_id::text||'/'||payment_id::text||'/%' and path !~ '\.\.'
 and exists(select 1 from public.payments p where p.id=payment_evidence.payment_id and p.organization_id=payment_evidence.organization_id and p.status='pending_verification'));

revoke all on function private.prepare_student_report(uuid,uuid,text),private.approve_student_report(uuid,uuid),private.record_report_delivery(uuid,uuid,uuid,text,text),private.submit_payment(uuid,uuid,bigint,text,text,text) from public;
grant execute on function private.prepare_student_report(uuid,uuid,text),private.approve_student_report(uuid,uuid),private.record_report_delivery(uuid,uuid,uuid,text,text),private.submit_payment(uuid,uuid,bigint,text,text,text) to authenticated;
revoke all on function public.prepare_student_report(uuid,uuid,text),public.approve_student_report(uuid,uuid),public.record_report_delivery(uuid,uuid,uuid,text,text) from public;
grant execute on function public.prepare_student_report(uuid,uuid,text),public.approve_student_report(uuid,uuid),public.record_report_delivery(uuid,uuid,uuid,text,text) to authenticated;
