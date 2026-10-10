create function private.record_milestone(org uuid, sid uuid, student uuid, unit uuid, score integer, notes text, homework text, publish boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; sess public.class_sessions; program uuid; result uuid; begin
 if not private.can_session(org,sid,true) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 actor:=private.staff_id();select * into sess from public.class_sessions where organization_id=org and id=sid for update;
 if sess.status<>'completed' or sess.review_status in ('verified','approved','paid') or score not between 1 and 5 then raise exception 'Sesi atau skor tidak sah'; end if;
 select program_id into program from public.classes where id=sess.class_id and organization_id=org;
 if not exists(select 1 from public.curriculum_units where organization_id=org and id=unit and program_id=program) or not exists(select 1 from public.attendance where organization_id=org and session_id=sid and student_id=student and status in ('present','late','makeup')) then raise exception 'Unit atau bukti kehadiran tidak sah'; end if;
 insert into public.student_progress(organization_id,session_id,student_id,curriculum_unit_id,mastery,parent_notes,homework,recorded_by,published_at)
 values(org,sid,student,unit,score,notes,homework,actor,case when publish then now() end) returning id into result;
 if publish then insert into public.student_skill_levels(organization_id,student_id,program_id,curriculum_unit_id,mastery,evidence_progress_id,last_assessed)
 values(org,student,program,unit,score,result,now()) on conflict(student_id,curriculum_unit_id) do update set mastery=score,evidence_progress_id=result,last_assessed=now(); end if;
 return result;
end $$;
create function public.record_milestone(org uuid, sid uuid, student uuid, unit uuid, score integer, notes text, homework text, publish boolean) returns uuid language sql security invoker set search_path='' as $$ select private.record_milestone(org,sid,student,unit,score,notes,homework,publish) $$;
create function private.generate_invoices(org uuid, billing_period text) returns integer language plpgsql security definer set search_path='' as $$
declare g record; items jsonb; total_count integer:=0; due date; begin
 perform private.require_role(org,array['owner','finance_admin']);
 if billing_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Bulan tidak sah'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||billing_period||'fee-generation',0));
 if exists(select 1 from public.fee_assignments f join public.enrollments e on e.id=f.enrollment_id where f.organization_id=org and f.effective_from<=(billing_period||'-01')::date and (f.effective_to is null or f.effective_to>=(billing_period||'-01')::date) and (select count(*) from public.student_guardians sg where sg.organization_id=org and sg.student_id=e.student_id and sg.is_billing_contact)<>1) then raise exception 'Setiap murid mesti mempunyai tepat satu penjaga bil'; end if;
 for g in select distinct sg.guardian_id from public.fee_assignments f join public.enrollments e on e.id=f.enrollment_id join public.student_guardians sg on sg.student_id=e.student_id and sg.organization_id=e.organization_id and sg.is_billing_contact
 where f.organization_id=org and f.effective_from<=(billing_period||'-01')::date and (f.effective_to is null or f.effective_to>=(billing_period||'-01')::date) and e.status='active' loop
 select jsonb_agg(jsonb_build_object('student_id',e.student_id,'description',p.name||' · '||billing_period,'quantity',1,'unit_price_sen',coalesce(f.override_sen,p.amount_sen),'discount_sen',0)), (billing_period||'-'||lpad(coalesce(min(p.due_day),7)::text,2,'0'))::date
 into items,due from public.fee_assignments f join public.fee_plans p on p.id=f.fee_plan_id and p.organization_id=f.organization_id join public.enrollments e on e.id=f.enrollment_id join public.student_guardians sg on sg.student_id=e.student_id and sg.organization_id=e.organization_id
 where f.organization_id=org and sg.guardian_id=g.guardian_id and sg.is_billing_contact and p.active and p.basis='monthly' and e.status='active' and e.starts_on<=(billing_period||'-01')::date and (e.ends_on is null or e.ends_on>=(billing_period||'-01')::date) and f.effective_from<=(billing_period||'-01')::date and (f.effective_to is null or f.effective_to>=(billing_period||'-01')::date);
 if items is not null then perform private.create_invoice(org,g.guardian_id,due,billing_period,items,'monthly:'||billing_period||':'||g.guardian_id::text);total_count:=total_count+1; end if;
 end loop;
 return total_count;
end $$;
create function public.generate_invoices(org uuid, billing_period text) returns integer language sql security invoker set search_path='' as $$ select private.generate_invoices(org,billing_period) $$;
create function private.fee_assignment_guard() returns trigger language plpgsql security definer set search_path='' as $$ begin
 perform 1 from public.enrollments where organization_id=new.organization_id and id=new.enrollment_id for update;
 if exists(select 1 from public.fee_assignments f where f.enrollment_id=new.enrollment_id and f.id<>new.id and daterange(f.effective_from,coalesce(f.effective_to,'infinity'::date),'[]')&&daterange(new.effective_from,coalesce(new.effective_to,'infinity'::date),'[]')) then raise exception 'Penetapan yuran bertindih'; end if; return new;
end $$;
create trigger fee_assignment_guard before insert or update on public.fee_assignments for each row execute function private.fee_assignment_guard();
create function private.reject_payment(org uuid, pid uuid, reason text) returns void language plpgsql security definer set search_path='' as $$ begin
 perform private.require_role(org,array['owner','finance_admin']);if length(trim(reason))<5 then raise exception 'Nyatakan sebab';end if;
 update public.payments set status='rejected',reversal_reason=reason where organization_id=org and id=pid and status='pending_verification';if not found then raise exception 'Bayaran bukan dalam semakan';end if;
end $$;
create function public.reject_payment(org uuid,pid uuid,reason text) returns void language sql security invoker set search_path='' as $$select private.reject_payment(org,pid,reason)$$;
create function private.map_import(org uuid, import_row uuid, student uuid, session uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.private_import_rows; s public.class_sessions; begin
 perform private.require_role(org,array['owner','academic_admin']);
 select * into r from public.private_import_rows where organization_id=org and id=import_row for update;
 select * into s from public.class_sessions where organization_id=org and id=session;
 if r.id is null or s.id is null or s.review_status not in ('reported','needs_review') or (s.starts_at at time zone 'Asia/Kuala_Lumpur')::date<>r.reported_date or not exists(select 1 from public.enrollments where organization_id=org and student_id=student and class_id=s.class_id and starts_on<=r.reported_date and (ends_on is null or ends_on>=r.reported_date)) then raise exception 'Pemetaan atau tarikh tidak sah';end if;
 update public.private_import_rows set student_id=student,session_id=session,status='mapped' where id=r.id;
 -- Import mapping does not approve, publish or pay a session.
end $$;
create function public.map_import(org uuid,import_row uuid,student uuid,session uuid)returns void language sql security invoker set search_path='' as $$select private.map_import(org,import_row,student,session)$$;
revoke all on function private.record_milestone(uuid,uuid,uuid,uuid,integer,text,text,boolean), private.generate_invoices(uuid,text), private.reject_payment(uuid,uuid,text),private.map_import(uuid,uuid,uuid,uuid),private.fee_assignment_guard() from public;
grant execute on function private.record_milestone(uuid,uuid,uuid,uuid,integer,text,text,boolean), private.generate_invoices(uuid,text), private.reject_payment(uuid,uuid,text),private.map_import(uuid,uuid,uuid,uuid) to authenticated;
revoke all on function public.record_milestone(uuid,uuid,uuid,uuid,integer,text,text,boolean),public.generate_invoices(uuid,text),public.reject_payment(uuid,uuid,text),public.map_import(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.record_milestone(uuid,uuid,uuid,uuid,integer,text,text,boolean),public.generate_invoices(uuid,text),public.reject_payment(uuid,uuid,text),public.map_import(uuid,uuid,uuid,uuid) to authenticated;
