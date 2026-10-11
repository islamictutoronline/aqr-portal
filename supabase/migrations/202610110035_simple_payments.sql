-- Butang bayaran mudah (keputusan pengguna 11 Okt 2026):
--  1) "Yuran telah dibayar" — admin menandakan invois dibayar dengan satu pengesahan; rujukan pilihan.
--     Rekod bayaran, peruntukan dan resit dicipta seperti biasa (sejarah dikekalkan).
--  2) "Elaun telah dibayar" — admin merekod bayaran elaun tutor bagi sebulan; rujukan pilihan.
--     Rekod tidak dipadam: pembatalan menanda 'void' dengan sebab.
-- Boleh dijalankan semula.

-- 1) Yuran: bayar baki invois sepenuhnya.
create or replace function private.mark_invoice_paid(org uuid,inv uuid,paid_on date default null,payment_method text default 'bank_transfer',payment_ref text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; invoice public.invoices; already bigint; outstanding bigint; pid uuid; rid uuid;
begin
 actor:=private.require_role(org,array['owner','admin']);
 perform pg_advisory_xact_lock(hashtextextended(org::text||'payments',0));
 select * into invoice from public.invoices where id=inv and organization_id=org for update;
 if invoice.id is null then raise exception 'Invois tidak ditemui'; end if;
 if invoice.status in ('void','draft') then raise exception 'Invois draf atau batal tidak boleh dibayar'; end if;
 if coalesce(payment_method,'') not in ('cash','bank_transfer','duitnow_qr','other') then raise exception 'Kaedah bayaran tidak sah'; end if;
 if paid_on is not null and (paid_on>current_date+1 or paid_on<current_date-730) then raise exception 'Tarikh bayaran tidak sah'; end if;
 if length(coalesce(payment_ref,''))>120 then raise exception 'Rujukan terlalu panjang'; end if;
 select coalesce(sum(a.amount_sen),0) into already from public.payment_allocations a join public.payments p on p.id=a.payment_id
  where a.invoice_id=inv and p.status='verified';
 outstanding:=invoice.total_sen-already;
 if outstanding<=0 then raise exception 'Invois ini sudah dibayar sepenuhnya'; end if;
 insert into public.payments(organization_id,guardian_id,paid_on,method,amount_sen,reference,status,verified_by,verified_at,idempotency_key)
  values(org,invoice.guardian_id,coalesce(paid_on,(now() at time zone 'Asia/Kuala_Lumpur')::date),payment_method,outstanding,
   nullif(trim(payment_ref),''),'verified',actor,now(),'mark-paid:'||inv::text||':'||gen_random_uuid()::text)
  returning id into pid;
 insert into public.payment_allocations(organization_id,payment_id,invoice_id,amount_sen) values(org,pid,inv,outstanding);
 insert into public.receipts(organization_id,payment_id,number,details)
  values(org,pid,'AQR-RCT-'||substr(replace(pid::text,'-',''),1,16),
   jsonb_build_object('academy','Akademi Al-Quran Ar-Riyadh (AQR)','amount_sen',outstanding,'reference',nullif(trim(payment_ref),''),'invoice',invoice.number))
  returning id into rid;
 perform private.refresh_invoice(inv);
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
  values(org,auth.uid(),'MARK_PAID','invoices',inv,jsonb_build_object('amount_sen',outstanding,'reference',nullif(trim(payment_ref),'')));
 return rid;
end $$;
create or replace function public.mark_invoice_paid(org uuid,inv uuid,paid_on date default null,payment_method text default 'bank_transfer',payment_ref text default null) returns uuid language sql security invoker set search_path='' as $$select private.mark_invoice_paid(org,inv,paid_on,payment_method,payment_ref)$$;
revoke all on function private.mark_invoice_paid(uuid,uuid,date,text,text) from public;
grant execute on function private.mark_invoice_paid(uuid,uuid,date,text,text) to authenticated;
revoke all on function public.mark_invoice_paid(uuid,uuid,date,text,text) from public,anon;
grant execute on function public.mark_invoice_paid(uuid,uuid,date,text,text) to authenticated;

-- 2) Elaun tutor: rekod bayaran bulanan (jumlah elaun ketika dibayar disimpan sebagai rujukan).
create table if not exists public.tutor_month_payments (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 staff_id uuid not null references public.staff_profiles(id),
 period text not null check(period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 amount_sen bigint not null check(amount_sen>0),
 sessions integer not null default 0 check(sessions>=0),
 paid_on date not null,
 reference text check(reference is null or length(reference)<=120),
 status text not null default 'paid' check(status in ('paid','void')),
 paid_by uuid,
 void_reason text,
 voided_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists tutor_month_payments_lookup on public.tutor_month_payments(organization_id,staff_id,period);
alter table public.tutor_month_payments enable row level security;
revoke all on public.tutor_month_payments from anon, authenticated;
grant select on public.tutor_month_payments to authenticated;
drop policy if exists tutor_month_payments_read on public.tutor_month_payments;
create policy tutor_month_payments_read on public.tutor_month_payments for select to authenticated
 using(private.has_role(organization_id,array['owner','admin']) or staff_id=private.staff_id());

create or replace function private.mark_tutor_paid(org uuid,staff_id uuid,period text,amount_sen bigint,sessions integer default 0,paid_on date default null,payment_ref text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; result uuid;
begin
 actor:=private.require_role(org,array['owner','admin']);
 if not exists(select 1 from public.staff_memberships m where m.organization_id=org and m.staff_id=mark_tutor_paid.staff_id) then
  raise exception 'Tutor tidak ditemui'; end if;
 if period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Bulan tidak sah'; end if;
 if amount_sen is null or amount_sen<=0 then raise exception 'Tiada elaun untuk dibayar'; end if;
 if paid_on is not null and (paid_on>current_date+1 or paid_on<current_date-730) then raise exception 'Tarikh bayaran tidak sah'; end if;
 if length(coalesce(payment_ref,''))>120 then raise exception 'Rujukan terlalu panjang'; end if;
 insert into public.tutor_month_payments(organization_id,staff_id,period,amount_sen,sessions,paid_on,reference,paid_by)
  values(org,mark_tutor_paid.staff_id,period,amount_sen,greatest(coalesce(sessions,0),0),
   coalesce(paid_on,(now() at time zone 'Asia/Kuala_Lumpur')::date),nullif(trim(payment_ref),''),actor)
  returning id into result;
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
  values(org,auth.uid(),'TUTOR_PAID','staff_profiles',mark_tutor_paid.staff_id,jsonb_build_object('period',period,'amount_sen',amount_sen));
 return result;
end $$;
create or replace function public.mark_tutor_paid(org uuid,staff_id uuid,period text,amount_sen bigint,sessions integer default 0,paid_on date default null,payment_ref text default null) returns uuid language sql security invoker set search_path='' as $$select private.mark_tutor_paid(org,staff_id,period,amount_sen,sessions,paid_on,payment_ref)$$;
revoke all on function private.mark_tutor_paid(uuid,uuid,text,bigint,integer,date,text) from public;
grant execute on function private.mark_tutor_paid(uuid,uuid,text,bigint,integer,date,text) to authenticated;
revoke all on function public.mark_tutor_paid(uuid,uuid,text,bigint,integer,date,text) from public,anon;
grant execute on function public.mark_tutor_paid(uuid,uuid,text,bigint,integer,date,text) to authenticated;

-- Batal rekod bayaran elaun (tersilap tekan): rekod kekal sebagai 'void' dengan sebab.
create or replace function private.void_tutor_payment(org uuid,pid uuid,reason text) returns uuid language plpgsql security definer set search_path='' as $$
begin
 perform private.require_role(org,array['owner','admin']);
 if length(trim(coalesce(reason,'')))<3 then raise exception 'Nyatakan sebab pembatalan'; end if;
 update public.tutor_month_payments set status='void',void_reason=trim(reason),voided_at=now()
  where organization_id=org and id=pid and status='paid';
 if not found then raise exception 'Rekod bayaran tidak ditemui'; end if;
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
  values(org,auth.uid(),'TUTOR_PAID_VOID','tutor_month_payments',pid,jsonb_build_object('reason',trim(reason)));
 return pid;
end $$;
create or replace function public.void_tutor_payment(org uuid,pid uuid,reason text) returns uuid language sql security invoker set search_path='' as $$select private.void_tutor_payment(org,pid,reason)$$;
revoke all on function private.void_tutor_payment(uuid,uuid,text) from public;
grant execute on function private.void_tutor_payment(uuid,uuid,text) to authenticated;
revoke all on function public.void_tutor_payment(uuid,uuid,text) from public,anon;
grant execute on function public.void_tutor_payment(uuid,uuid,text) to authenticated;
notify pgrst, 'reload schema';
