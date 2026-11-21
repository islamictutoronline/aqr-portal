-- Migrasi 53: nama penjaga "-" (keputusan pengguna 21 Nov 2026). Ada tutor yang tidak tahu nama ibu bapa
-- lalu mengisi "-", jadi senarai Yuran dan borang "Sudah bayar" memaparkan "-".
-- 1) Nama tanpa huruf/nombor ("-", ".", "–", "--") atau "tiada"/"nil"/"n/a" dianggap tiada nama.
-- 2) Apabila penjaga dipautkan sebagai penjaga bil, nama sebegini ditukar kepada "Ibu/Bapa <nama murid>"
--    (sama seperti medan nama yang dibiarkan kosong).
-- 3) Kemas kini nama penjaga kepada nama kosong/"-" tidak menimpa nama sebenar yang sudah ada.
-- 4) Data sedia ada dibetulkan sekali.
-- 5) record_family_payment (migrasi 52) ditulis semula tanpa jadual sementara — logik sama; jadual sementara
--    dalam fungsi security definer ialah satu-satunya binaan luar biasa dan paling sensitif melalui API.
-- Boleh dijalankan semula.

create or replace function private.placeholder_name(nm text) returns boolean language sql immutable set search_path='' as $$
 select nm is null or btrim(nm) !~ '[[:alnum:]]' or lower(btrim(nm)) in ('tiada','tiada nama','nil','n/a','na','none','-')
$$;
revoke all on function private.placeholder_name(text) from public, anon;
grant execute on function private.placeholder_name(text) to authenticated;

-- Nama sebenar tidak ditimpa oleh nama kosong/"-".
create or replace function private.keep_guardian_name() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if private.placeholder_name(new.full_name) and not private.placeholder_name(old.full_name) then
  new.full_name:=old.full_name;
 end if;
 return new;
end $$;
drop trigger if exists guardians_keep_name on public.guardians;
create trigger guardians_keep_name before update of full_name on public.guardians
 for each row execute function private.keep_guardian_name();

-- Penjaga bil dengan nama kosong/"-" → "Ibu/Bapa <nama murid>".
create or replace function private.default_guardian_name() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.is_billing_contact then
  update public.guardians g set full_name='Ibu/Bapa '||s.full_name,updated_at=now()
   from public.students s
   where g.id=new.guardian_id and g.organization_id=new.organization_id
    and s.id=new.student_id and s.organization_id=new.organization_id
    and private.placeholder_name(g.full_name);
 end if;
 return new;
end $$;
drop trigger if exists student_guardians_default_name on public.student_guardians;
create trigger student_guardians_default_name after insert or update of is_billing_contact on public.student_guardians
 for each row execute function private.default_guardian_name();

-- Data sedia ada: nama penjaga ikut anak bil pertama (ikut nama).
update public.guardians g set full_name='Ibu/Bapa '||(
  select s.full_name from public.student_guardians sg join public.students s on s.id=sg.student_id
  where sg.guardian_id=g.id and sg.organization_id=g.organization_id and sg.is_billing_contact
  order by s.full_name limit 1),updated_at=now()
 where private.placeholder_name(g.full_name)
  and exists(select 1 from public.student_guardians sg where sg.guardian_id=g.id and sg.organization_id=g.organization_id and sg.is_billing_contact);

-- "Sudah bayar": satu amaun bagi keluarga (sen); null = baki penuh bulan ini.
create or replace function private.record_family_payment(org uuid,billing_period text,guardian uuid,paid_on date default null,amount_sen bigint default null,payment_method text default 'bank_transfer',payment_ref text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; pid uuid; rid uuid; it record; due jsonb; kid record; a bigint; take bigint; total bigint; owed bigint; allocs jsonb:='{}'::jsonb; credits jsonb:='{}'::jsonb; fees jsonb:='{}'::jsonb; inv_id text; outstanding bigint; got integer; progress boolean; min_fee bigint; sid text;
begin
 actor:=private.require_role(org,array['owner','admin']);
 if billing_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Bulan tidak sah'; end if;
 if not exists(select 1 from public.student_guardians sg where sg.organization_id=org and sg.guardian_id=guardian and sg.is_billing_contact) then
  raise exception 'Penjaga bil tidak ditemui'; end if;
 if coalesce(payment_method,'') not in ('cash','bank_transfer','duitnow_qr','other') then raise exception 'Kaedah bayaran tidak sah'; end if;
 if paid_on is not null and (paid_on>current_date+1 or paid_on<current_date-730) then raise exception 'Tarikh bayaran tidak sah'; end if;
 if length(coalesce(payment_ref,''))>120 then raise exception 'Rujukan terlalu panjang'; end if;
 if amount_sen is not null and (amount_sen<=0 or amount_sen>10000000) then raise exception 'Amaun tidak sah'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||billing_period||'session-invoices',0));
 perform pg_advisory_xact_lock(hashtextextended(org::text||'payments',0));
 -- Invois keluarga dikemas kini ikut sesi terkini sebelum bayaran direkod.
 perform private.session_invoice_for(org,billing_period,guardian);
 -- Baki setiap anak dalam setiap invois bulan ini (invois tertua dahulu, anak ikut nama). Disimpan dalam
 -- jsonb (bukan jadual sementara) supaya selamat melalui API Supabase.
 select coalesce(jsonb_agg(jsonb_build_object('inv',q.inv,'student',q.student,'qty',q.qty,'value',q.value,'done',q.done,'paid',q.paid) order by q.created_at,q.full_name),'[]'::jsonb)
  into due from (
  select i.id inv,i.created_at,ii.student_id student,st.full_name,sum(ii.quantity)::integer qty,sum(ii.total_sen)::bigint value,p.sessions done,p.amount paid
  from public.invoices i join public.invoice_items ii on ii.invoice_id=i.id and ii.organization_id=i.organization_id
  join public.students st on st.id=ii.student_id
  cross join lateral private.child_invoice_paid(i.id,ii.student_id) p
  where i.organization_id=org and i.guardian_id=guardian and i.period=billing_period and i.status not in ('void','draft')
  group by i.id,i.created_at,ii.student_id,st.full_name,p.sessions,p.amount) q;
 select coalesce(sum(greatest((x->>'value')::bigint-(x->>'paid')::bigint,0)),0) into owed from jsonb_array_elements(due) x;
 a:=coalesce(amount_sen,owed);
 if a<=0 then raise exception 'Tiada baki untuk dibayar bulan ini. Masukkan amaun jika ibu bapa membayar lebih awal.'; end if;
 total:=a;
 insert into public.payments(organization_id,guardian_id,paid_on,method,amount_sen,reference,status,verified_by,verified_at,idempotency_key)
  values(org,guardian,coalesce(paid_on,(now() at time zone 'Asia/Kuala_Lumpur')::date),payment_method,total,
   nullif(trim(payment_ref),''),'verified',actor,now(),'family:'||billing_period||':'||guardian::text||':'||gen_random_uuid()::text)
  returning id into pid;
 for it in select * from jsonb_to_recordset(due) as x(inv uuid,student uuid,qty integer,value bigint,done integer,paid bigint) loop
  exit when a<=0;
  take:=least(a,greatest(it.value-it.paid,0));
  continue when take<=0;
  got:=least(it.qty,((it.paid+take)*it.qty/nullif(it.value,0))::integer)-it.done;
  insert into public.payment_sessions(organization_id,payment_id,invoice_id,student_id,sessions,amount_sen)
   values(org,pid,it.inv,it.student,greatest(got,0),take);
  allocs:=jsonb_set(allocs,array[it.inv::text],to_jsonb(coalesce((allocs->>it.inv::text)::bigint,0)+take));
  a:=a-take;
 end loop;
 if a>0 then
  -- Lebihan: kredit sesi bergilir antara anak (harga sesi kelas utama setiap anak).
  for kid in select sg.student_id from public.student_guardians sg join public.students st on st.id=sg.student_id
    where sg.organization_id=org and sg.guardian_id=guardian and sg.is_billing_contact and st.status<>'archived' order by st.full_name
  loop
   take:=private.class_fee(org,private.primary_class(org,kid.student_id),(billing_period||'-01')::date);
   if take>0 then fees:=fees||jsonb_build_object(kid.student_id::text,take); end if;
  end loop;
  if fees='{}'::jsonb then raise exception 'Tiada harga sesi untuk menyimpan kredit'; end if;
  select min(value::bigint) into min_fee from jsonb_each_text(fees);
  loop
   progress:=false;
   for sid in select jsonb_object_keys(fees) loop
    if a>=(fees->>sid)::bigint then
     credits:=jsonb_set(credits,array[sid],to_jsonb(coalesce((credits->>sid)::integer,0)+1));
     a:=a-(fees->>sid)::bigint; progress:=true;
    end if;
   end loop;
   exit when not progress or a<=0;
  end loop;
  if a>0 then
   raise exception 'Lebihan RM % tidak cukup untuk satu sesi (harga sesi RM %). Semak amaun.',
    to_char(a/100.0,'FM999990.00'),to_char(min_fee/100.0,'FM999990.00'); end if;
  for sid in select jsonb_object_keys(credits) loop
   insert into public.session_credits(organization_id,guardian_id,student_id,period,sessions,unit_price_sen,payment_id,class_id)
    values(org,guardian,sid::uuid,billing_period,(credits->>sid)::integer,(fees->>sid)::bigint,pid,private.primary_class(org,sid::uuid));
  end loop;
 end if;
 for inv_id in select jsonb_object_keys(allocs) loop
  select i.total_sen-coalesce((select sum(al.amount_sen) from public.payment_allocations al join public.payments p on p.id=al.payment_id
    where al.invoice_id=i.id and p.status='verified' and p.id<>pid),0) into outstanding from public.invoices i where i.id=inv_id::uuid;
  take:=least((allocs->>inv_id)::bigint,greatest(outstanding,0));
  if take>0 then
   insert into public.payment_allocations(organization_id,payment_id,invoice_id,amount_sen) values(org,pid,inv_id::uuid,take);
  end if;
  perform private.refresh_invoice(inv_id::uuid);
 end loop;
 insert into public.receipts(organization_id,payment_id,number,details)
  values(org,pid,'AQR-RCT-'||substr(replace(pid::text,'-',''),1,16),
   jsonb_build_object('academy','Akademi Al-Quran Ar-Riyadh (AQR)','amount_sen',total,'reference',nullif(trim(payment_ref),''),
    'period',billing_period,'credit_sessions',credits))
  returning id into rid;
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
  values(org,auth.uid(),'FAMILY_PAYMENT','guardians',guardian,jsonb_build_object('period',billing_period,'amount_sen',total,'credit_sessions',credits));
 return rid;
end $$;
create or replace function public.record_family_payment(org uuid,billing_period text,guardian uuid,paid_on date default null,amount_sen bigint default null,payment_method text default 'bank_transfer',payment_ref text default null) returns uuid language sql security invoker set search_path='' as $$select private.record_family_payment(org,billing_period,guardian,paid_on,amount_sen,payment_method,payment_ref)$$;
revoke all on function private.record_family_payment(uuid,text,uuid,date,bigint,text,text) from public;
grant execute on function private.record_family_payment(uuid,text,uuid,date,bigint,text,text) to authenticated;
revoke all on function public.record_family_payment(uuid,text,uuid,date,bigint,text,text) from public,anon;
grant execute on function public.record_family_payment(uuid,text,uuid,date,bigint,text,text) to authenticated;

notify pgrst, 'reload schema';
