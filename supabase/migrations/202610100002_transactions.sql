create function private.require_role(org uuid, roles text[]) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not private.has_role(org,roles) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 return private.staff_id();
end $$;
create function private.enrollment_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare capacity integer; begin
 select max_capacity into capacity from public.classes where id=new.class_id and organization_id=new.organization_id for update;
 if exists(select 1 from public.enrollments e where e.id<>new.id and e.student_id=new.student_id and e.class_id=new.class_id and e.status<>'withdrawn'
 and daterange(e.starts_on,coalesce(e.ends_on,'infinity'::date),'[]') && daterange(new.starts_on,coalesce(new.ends_on,'infinity'::date),'[]')) then
 raise exception 'Pendaftaran bertindih'; end if;
 if new.status='active' and (select count(*) from public.enrollments where class_id=new.class_id and status='active' and id<>new.id)>=capacity then raise exception 'Kelas telah penuh'; end if;
 return new;
end $$;
create trigger enrollment_guard before insert or update on public.enrollments for each row execute function private.enrollment_guard();

create function private.create_session(org uuid, cid uuid, tid uuid, start_time timestamptz, minutes integer, lesson_topic text) returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid; begin
 perform private.require_role(org,array['owner','academic_admin']);
 if minutes not between 5 and 240 or not exists(select 1 from public.class_tutors where organization_id=org and class_id=cid and staff_id=tid and starts_on<=(start_time at time zone 'Asia/Kuala_Lumpur')::date and (ends_on is null or ends_on>=(start_time at time zone 'Asia/Kuala_Lumpur')::date)) then raise exception 'Tutor atau tempoh tidak sah'; end if;
 insert into public.class_sessions(organization_id,class_id,tutor_id,starts_at,ends_at,topic) values(org,cid,tid,start_time,start_time+make_interval(mins=>minutes),lesson_topic)
 on conflict(class_id,starts_at) do nothing returning id into sid;
 if sid is null then select id into sid from public.class_sessions where class_id=cid and starts_at=start_time and organization_id=org; end if;
 return sid;
end $$;
create function public.create_session(org uuid, cid uuid, tid uuid, start_time timestamptz, minutes integer, lesson_topic text default '') returns uuid language sql security invoker set search_path='' as $$ select private.create_session(org,cid,tid,start_time,minutes,lesson_topic) $$;

create function private.record_assessment(org uuid, sid uuid, student uuid, attendance_status text, selected jsonb, publish boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; sess public.class_sessions; subject uuid; skill_label text; participation_label text; focus_label text; practice_label text; rating integer; generated text; previous uuid; result uuid; begin
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
 insert into public.attendance(organization_id,session_id,student_id,status) values(org,sid,student,attendance_status)
 on conflict(session_id,student_id) do update set status=excluded.status,updated_at=now();
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
create function public.record_assessment(org uuid, sid uuid, student uuid, attendance_status text, selected jsonb, publish boolean) returns uuid language sql security invoker set search_path='' as $$ select private.record_assessment(org,sid,student,attendance_status,selected,publish) $$;

create function private.set_rate(org uuid, program text, minutes integer, amount bigint, effective date, provenance text) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; rid uuid; begin
 actor:=private.require_role(org,array['owner','finance_admin']);
 if amount<=0 or minutes not between 5 and 240 or length(provenance)<3 then raise exception 'Kadar atau sumber tidak sah'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||program||minutes::text,0));
 if exists(select 1 from public.tutor_allowance_rates where organization_id=org and program_code=program and duration_minutes=minutes and effective_from>=effective) then raise exception 'Tarikh kadar baharu mesti selepas versi sedia ada'; end if;
 update public.tutor_allowance_rates set effective_to=effective-1,updated_at=now() where organization_id=org and program_code=program and duration_minutes=minutes and (effective_to is null or effective_to>=effective);
 insert into public.tutor_allowance_rates(organization_id,program_code,duration_minutes,amount_sen,effective_from,source,created_by) values(org,program,minutes,amount,effective,provenance,actor) returning id into rid;
 return rid;
end $$;
create function public.set_rate(org uuid, program text, minutes integer, amount bigint, effective date, provenance text) returns uuid language sql security invoker set search_path='' as $$ select private.set_rate(org,program,minutes,amount,effective,provenance) $$;
create function private.review_session(org uuid, sid uuid, approve boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; sess public.class_sessions; rate public.tutor_allowance_rates; program text; minutes integer; result uuid; begin
 actor:=private.require_role(org,array['owner','finance_admin']);
 select * into sess from public.class_sessions where organization_id=org and id=sid for update;
 if sess.id is null or sess.status<>'completed' then raise exception 'Sesi belum selesai'; end if;
 if sess.tutor_id=actor then raise exception 'Tutor tidak boleh menyemak tuntutan sendiri'; end if;
 if approve then
 if sess.review_status in ('approved','paid') then select id into result from public.tutor_allowance_entries where session_id=sid; return result; end if;
 if sess.review_status<>'verified' or sess.verified_by=actor then raise exception 'Penyemak dan pelulus mesti berlainan'; end if;
 update public.class_sessions set review_status='approved',approved_by=actor,approved_at=now() where id=sid;
 update public.tutor_allowance_entries set status='approved',approved_by=actor where session_id=sid returning id into result;
 else
 if sess.review_status in ('verified','approved','paid') then select id into result from public.tutor_allowance_entries where session_id=sid; return result; end if;
 if not exists(select 1 from public.attendance where session_id=sid and status in ('present','late','makeup')) then raise exception 'Tiada bukti murid hadir'; end if;
 select p.code into program from public.classes c join public.programs p on p.id=c.program_id and p.organization_id=c.organization_id where c.id=sess.class_id;
 minutes:=extract(epoch from(sess.ends_at-sess.starts_at))/60;
 select * into rate from public.tutor_allowance_rates where organization_id=org and program_code=program and duration_minutes=minutes and effective_from<=(sess.starts_at at time zone 'Asia/Kuala_Lumpur')::date and (effective_to is null or effective_to>=(sess.starts_at at time zone 'Asia/Kuala_Lumpur')::date);
 if rate.id is null then raise exception 'Tiada kadar untuk program, tempoh dan tarikh sesi'; end if;
 update public.class_sessions set review_status='verified',verified_by=actor,verified_at=now() where id=sid;
 insert into public.tutor_allowance_entries(organization_id,session_id,tutor_id,rate_id,rate_snapshot_sen,amount_sen,status,verified_by) values(org,sid,sess.tutor_id,rate.id,rate.amount_sen,rate.amount_sen,'verified',actor) returning id into result;
 end if;
 return result;
end $$;
create function public.review_session(org uuid, sid uuid, approve boolean) returns uuid language sql security invoker set search_path='' as $$ select private.review_session(org,sid,approve) $$;

create function private.create_invoice(org uuid, guardian uuid, due date, billing_period text, items jsonb, idem text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; item jsonb; total bigint:=0; n bigint; begin
 perform private.require_role(org,array['owner','finance_admin']);
 if billing_period !~ '^\d{4}-\d{2}$' or length(idem)<8 or jsonb_array_length(items)<1 then raise exception 'Butiran invois tidak sah'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||'invoice',0));
 select id into result from public.invoices where organization_id=org and idempotency_key=idem;
 if result is not null then return result; end if;
 for item in select * from jsonb_array_elements(items) loop
 if not exists(select 1 from public.student_guardians where organization_id=org and guardian_id=guardian and student_id=(item->>'student_id')::uuid and is_billing_contact) then raise exception 'Murid bukan anak bil penjaga'; end if;
 if (item->>'quantity')::integer<1 or (item->>'unit_price_sen')::bigint<0 or coalesce((item->>'discount_sen')::bigint,0)<0 or length(item->>'description')<1 then raise exception 'Item tidak sah'; end if;
 total:=total+(item->>'quantity')::integer*(item->>'unit_price_sen')::bigint-coalesce((item->>'discount_sen')::bigint,0);
 end loop;
 if total<0 then raise exception 'Jumlah tidak sah'; end if;
 select count(*)+1 into n from public.invoices where organization_id=org;
 insert into public.invoices(organization_id,guardian_id,number,issued_on,due_on,period,total_sen,idempotency_key) values(org,guardian,'AQR-INV-'||lpad(n::text,6,'0'),current_date,due,billing_period,total,idem) returning id into result;
 for item in select * from jsonb_array_elements(items) loop
 insert into public.invoice_items(organization_id,invoice_id,student_id,description,quantity,unit_price_sen,discount_sen) values(org,result,(item->>'student_id')::uuid,item->>'description',(item->>'quantity')::integer,(item->>'unit_price_sen')::bigint,coalesce((item->>'discount_sen')::bigint,0));
 end loop;
 return result;
end $$;
create function public.create_invoice(org uuid, guardian uuid, due date, billing_period text, items jsonb, idem text) returns uuid language sql security invoker set search_path='' as $$ select private.create_invoice(org,guardian,due,billing_period,items,idem) $$;
create function private.submit_payment(org uuid, guardian uuid, amount bigint, payment_method text, payment_ref text, idem text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; begin
 if not(private.has_role(org,array['owner','finance_admin']) or private.is_guardian(org,guardian)) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 if length(idem)<8 or amount<=0 then raise exception 'Amaun tidak sah'; end if;
 insert into public.payments(organization_id,guardian_id,paid_on,method,amount_sen,reference,idempotency_key) values(org,guardian,current_date,payment_method,amount,payment_ref,idem)
 on conflict(organization_id,idempotency_key) do nothing returning id into result;
 if result is null then select id into result from public.payments where organization_id=org and idempotency_key=idem and guardian_id=guardian; end if;
 if result is null then raise exception 'Kunci bayaran tidak sah'; end if;
 return result;
end $$;
create function public.submit_payment(org uuid, guardian uuid, amount bigint, payment_method text, payment_ref text, idem text) returns uuid language sql security invoker set search_path='' as $$ select private.submit_payment(org,guardian,amount,payment_method,payment_ref,idem) $$;
create function private.refresh_invoice(inv uuid) returns void language plpgsql security definer set search_path='' as $$
declare allocated bigint; begin
 select coalesce(sum(a.amount_sen),0) into allocated from public.payment_allocations a join public.payments p on p.id=a.payment_id where a.invoice_id=inv and p.status='verified';
 update public.invoices set status=case when allocated>=total_sen then 'paid' when allocated>0 then 'partially_paid' when due_on<current_date then 'overdue' else 'issued' end,updated_at=now() where id=inv and status not in ('draft','void');
end $$;
create function private.verify_payment(org uuid, pid uuid, inv uuid, allocation bigint) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; payment public.payments; invoice public.invoices; already bigint; rid uuid; begin
 actor:=private.require_role(org,array['owner','finance_admin']);
 -- Serialize all allocations in an organization, then lock both economic records.
 perform pg_advisory_xact_lock(hashtextextended(org::text||'payments',0));
 select * into payment from public.payments where id=pid and organization_id=org for update;
 select * into invoice from public.invoices where id=inv and organization_id=org for update;
 if payment.id is null or invoice.id is null or payment.guardian_id<>invoice.guardian_id then raise exception 'Bayaran/invois tidak sepadan'; end if;
 if payment.status in ('rejected','reversed') or invoice.status in ('void','draft') then raise exception 'Status transaksi tidak sah'; end if;
 select coalesce(sum(a.amount_sen),0) into already from public.payment_allocations a join public.payments p on p.id=a.payment_id where a.invoice_id=inv and p.status='verified' and a.payment_id<>pid;
 if allocation<=0 or allocation>invoice.total_sen-already or allocation>payment.amount_sen-coalesce((select sum(amount_sen) from public.payment_allocations where payment_id=pid and invoice_id<>inv),0) then raise exception 'Peruntukan melebihi baki'; end if;
 if exists(select 1 from public.payment_allocations where payment_id=pid and invoice_id=inv) then
 if not exists(select 1 from public.payment_allocations where payment_id=pid and invoice_id=inv and amount_sen=allocation) then raise exception 'Bayaran disahkan tidak boleh disunting'; end if;
 select id into rid from public.receipts where payment_id=pid; return rid;
 end if;
 update public.payments set status='verified',verified_by=coalesce(verified_by,actor),verified_at=coalesce(verified_at,now()) where id=pid;
 insert into public.payment_allocations(organization_id,payment_id,invoice_id,amount_sen) values(org,pid,inv,allocation);
 insert into public.receipts(organization_id,payment_id,number,details) values(org,pid,'AQR-RCT-'||substr(replace(pid::text,'-',''),1,16),jsonb_build_object('academy','Akademi Al-Quran Ar-Riyadh (AQR)','amount_sen',payment.amount_sen,'reference',payment.reference)) on conflict(payment_id) do nothing;
 perform private.refresh_invoice(inv);
 select id into rid from public.receipts where payment_id=pid; return rid;
end $$;
create function public.verify_payment(org uuid, pid uuid, inv uuid, allocation bigint) returns uuid language sql security invoker set search_path='' as $$ select private.verify_payment(org,pid,inv,allocation) $$;
create function private.reverse_payment(org uuid, pid uuid, reason text) returns void language plpgsql security definer set search_path='' as $$
declare inv uuid; begin
 perform private.require_role(org,array['owner','finance_admin']);
 if length(trim(reason))<5 then raise exception 'Nyatakan sebab pembalikan'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||'payments',0));
 update public.payments set status='reversed',reversal_reason=reason where organization_id=org and id=pid and status='verified';
 if not found then raise exception 'Bayaran belum disahkan atau telah dibalikkan'; end if;
 update public.receipts set status='void' where organization_id=org and payment_id=pid;
 for inv in select invoice_id from public.payment_allocations where payment_id=pid and organization_id=org loop perform private.refresh_invoice(inv); end loop;
end $$;
create function public.reverse_payment(org uuid, pid uuid, reason text) returns void language sql security invoker set search_path='' as $$ select private.reverse_payment(org,pid,reason) $$;

create function private.payout_batch(org uuid, billing_period text, action text, batch uuid default null, payment_ref text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; b public.tutor_payout_batches; total bigint; begin
 actor:=private.require_role(org,array['owner','finance_admin']);
 if billing_period !~ '^\d{4}-\d{2}$' then raise exception 'Bulan tidak sah'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||billing_period||'payout',0));
 if action='create' then
 select * into b from public.tutor_payout_batches where organization_id=org and period=billing_period;
 if b.id is not null then return b.id; end if;
 select coalesce(sum(e.amount_sen),0) into total from public.tutor_allowance_entries e join public.class_sessions s on s.id=e.session_id where e.organization_id=org and e.status='approved' and e.batch_id is null and to_char(s.starts_at at time zone 'Asia/Kuala_Lumpur','YYYY-MM')=billing_period;
 if total<=0 then raise exception 'Tiada sesi diluluskan'; end if;
 insert into public.tutor_payout_batches(organization_id,period,total_sen,maker_id,status) values(org,billing_period,total,actor,'review') returning * into b;
 update public.tutor_allowance_entries e set batch_id=b.id from public.class_sessions s where s.id=e.session_id and e.organization_id=org and e.status='approved' and e.batch_id is null and to_char(s.starts_at at time zone 'Asia/Kuala_Lumpur','YYYY-MM')=billing_period;
 elsif action='approve' then
 select * into b from public.tutor_payout_batches where id=batch and organization_id=org for update;
 if b.id is null or b.maker_id=actor or b.status<>'review' then raise exception 'Pelulus mesti berlainan dan kelompok dalam semakan'; end if;
 update public.tutor_payout_batches set status='approved',checker_id=actor,approved_at=now() where id=b.id;
 elsif action='pay' then
 select * into b from public.tutor_payout_batches where id=batch and organization_id=org for update;
 if b.id is null or b.status<>'approved' or length(trim(payment_ref))<3 or payment_ref is null then raise exception 'Kelompok belum diluluskan atau rujukan tidak sah'; end if;
 insert into public.tutor_payouts(organization_id,batch_id,tutor_id,amount_sen,reference,confirmed_by) select org,b.id,tutor_id,sum(amount_sen),payment_ref,actor from public.tutor_allowance_entries where batch_id=b.id group by tutor_id;
 update public.tutor_allowance_entries set status='paid' where batch_id=b.id;
 update public.class_sessions set review_status='paid' where id in(select session_id from public.tutor_allowance_entries where batch_id=b.id);
 update public.tutor_payout_batches set status='paid',reference=payment_ref where id=b.id;
 else raise exception 'Tindakan tidak sah'; end if;
 return b.id;
end $$;
create function public.payout_batch(org uuid, billing_period text, action text, batch uuid default null, payment_ref text default null) returns uuid language sql security invoker set search_path='' as $$ select private.payout_batch(org,billing_period,action,batch,payment_ref) $$;
-- Server-side token store: only the connection owner with owner/finance membership.
create function private.google_tokens(org uuid, encrypted text default null, revoke boolean default false) returns text language plpgsql security definer set search_path='' as $$
declare result text; begin
 perform private.require_role(org,array['owner','finance_admin']);
 if revoke then delete from public.google_connections where organization_id=org and auth_user_id=auth.uid(); return null; end if;
 if encrypted is not null then insert into public.google_connections(organization_id,auth_user_id,encrypted_tokens,scope) values(org,auth.uid(),encrypted,'https://www.googleapis.com/auth/spreadsheets') on conflict(organization_id,auth_user_id) do update set encrypted_tokens=excluded.encrypted_tokens,updated_at=now(),revoked_at=null; end if;
 select encrypted_tokens into result from public.google_connections where organization_id=org and auth_user_id=auth.uid() and revoked_at is null; return result;
end $$;
create function public.google_tokens(org uuid, encrypted text default null, revoke boolean default false) returns text language sql security invoker set search_path='' as $$ select private.google_tokens(org,encrypted,revoke) $$;
revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;
revoke all on function private.refresh_invoice(uuid) from authenticated;
revoke all on function private.audit_change() from authenticated;
revoke all on function private.enrollment_guard() from authenticated;
revoke all on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
