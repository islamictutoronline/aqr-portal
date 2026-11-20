-- Migrasi 52: bayaran ikut amaun, kredit sesi, invois ikut penjaga dan sesi ganti (keputusan pengguna 20 Nov 2026).
-- 1) record_family_payment: butang "Sudah bayar" bagi setiap keluarga dengan satu amaun (kosong = baki
--    penuh). Invois penjaga dikemas kini dahulu; amaun melunaskan baki invois tertua dahulu (ansuran
--    dibenarkan), lebihan menjadi kredit sesi anak-anak secara bergilir (session_credits).
-- 2) Invois sesi menolak kredit dahulu (session_credit_uses: satu baris bagi murid × bulan, dikira semula
--    setiap kali invois dijana). Kredit hanya daripada bulan yang sama atau lebih awal.
-- 3) generate_guardian_invoice: invois seorang penjaga; generate_session_invoices (semua) kekal.
-- 4) Sesi ganti (terus kepada tutor): sesi yang sudah dibayar bagi bulan lepas tetapi belum dilaksanakan
--    (bayaran + kredit − sesi direkod, dibawa ke bulan berikutnya) ditambah pada kuota kelas utama murid.
--    Bermula dengan bulan November 2026.
-- Boleh dijalankan semula.

create table if not exists public.session_credits (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 guardian_id uuid not null,
 student_id uuid not null references public.students(id),
 period text not null check(period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 sessions integer not null check(sessions>0),
 unit_price_sen bigint not null check(unit_price_sen>=0),
 payment_id uuid references public.payments(id),
 class_id uuid references public.classes(id),
 created_at timestamptz not null default now()
);
create table if not exists public.session_credit_uses (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 guardian_id uuid not null,
 student_id uuid not null references public.students(id),
 period text not null check(period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 sessions integer not null check(sessions>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,student_id,period)
);
create table if not exists public.payment_sessions (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 payment_id uuid not null references public.payments(id),
 invoice_id uuid not null references public.invoices(id),
 student_id uuid not null references public.students(id),
 sessions integer not null check(sessions>=0),
 amount_sen bigint not null default 0 check(amount_sen>=0),
 created_at timestamptz not null default now(),
 unique(payment_id,invoice_id,student_id)
);
alter table public.session_credits enable row level security;
alter table public.session_credit_uses enable row level security;
alter table public.payment_sessions enable row level security;
revoke all on public.session_credits, public.session_credit_uses, public.payment_sessions from anon, authenticated;
grant select on public.session_credits, public.session_credit_uses, public.payment_sessions to authenticated;
drop policy if exists session_credits_read on public.session_credits;
create policy session_credits_read on public.session_credits for select to authenticated
 using(private.has_role(organization_id,array['owner','admin']) or private.is_guardian(organization_id,guardian_id));
drop policy if exists session_credit_uses_read on public.session_credit_uses;
create policy session_credit_uses_read on public.session_credit_uses for select to authenticated
 using(private.has_role(organization_id,array['owner','admin']) or private.is_guardian(organization_id,guardian_id));
drop policy if exists payment_sessions_read on public.payment_sessions;
create policy payment_sessions_read on public.payment_sessions for select to authenticated
 using(private.has_role(organization_id,array['owner','admin']) or private.can_invoice(organization_id,invoice_id));

-- Invois sesi seorang penjaga bagi sebulan (berasaskan migrasi 48) + tolakan kredit sesi.
create or replace function private.session_invoice_for(org uuid,billing_period text,guardian uuid) returns integer language plpgsql security definer set search_path='' as $$
declare sessions_json jsonb; rest jsonb; billed jsonb; inv uuid; base text; idem text; k integer; total bigint; due date; month_start date; month_end date; cr record; remaining integer; avail integer; used integer;
begin
 month_start:=(billing_period||'-01')::date; month_end:=(month_start+interval '1 month')::date;
 due:=(month_end+6);
 base:='sessions:'||billing_period||':'||guardian::text;
 -- Invois terbuka: belum menerima bayaran sah (bayaran ditolak/dibalikkan tidak dikira) dan belum dibatalkan.
 select i.id into inv from public.invoices i
  where i.organization_id=org and i.guardian_id=guardian and (i.idempotency_key=base or i.idempotency_key like base||':%')
   and i.status in ('issued','draft','overdue')
   and not exists(select 1 from public.payment_allocations pa join public.payments py on py.id=pa.payment_id and py.organization_id=pa.organization_id
    where pa.organization_id=org and pa.invoice_id=i.id and py.status not in ('rejected','reversed'))
  order by i.created_at desc limit 1;
 -- Sesi setiap murid yang sudah dibilkan dalam invois sesi lain bulan ini (tidak dibatalkan).
 select coalesce(jsonb_object_agg(q.student_id,q.n),'{}'::jsonb) into billed from (
  select ii.student_id::text student_id,sum(ii.quantity) n
  from public.invoice_items ii join public.invoices i on i.id=ii.invoice_id and i.organization_id=ii.organization_id
  where i.organization_id=org and i.guardian_id=guardian and (i.idempotency_key=base or i.idempotency_key like base||':%')
   and i.status<>'void' and i.id is distinct from inv
  group by ii.student_id) q;
 -- Sesi berharga bulan ini, mengikut tertib masa bagi setiap murid; sesi terawal dianggap sudah dibilkan.
 with y as (
  select a.student_id, st.full_name||' · '||p.name||' ('||((extract(epoch from (s.ends_at-s.starts_at))/60)::integer)::text||' minit)' as label,
   coalesce(ov.fee_sen,r.amount_sen) price, s.starts_at, s.id sid
  from public.attendance a
  join public.class_sessions s on s.id=a.session_id and s.organization_id=a.organization_id
  join public.classes c on c.id=s.class_id and c.organization_id=s.organization_id
  join public.programs p on p.id=c.program_id and p.organization_id=c.organization_id
  join public.students st on st.id=a.student_id and st.organization_id=a.organization_id
  join public.student_guardians sg on sg.student_id=a.student_id and sg.organization_id=a.organization_id and sg.guardian_id=guardian and sg.is_billing_contact
  left join public.program_fee_rates r on r.organization_id=org and r.program_code=p.code
   and r.duration_minutes=((extract(epoch from (s.ends_at-s.starts_at))/60)::integer)
   and r.effective_from<=(s.starts_at at time zone 'Asia/Kuala_Lumpur')::date
   and (r.effective_to is null or r.effective_to>=(s.starts_at at time zone 'Asia/Kuala_Lumpur')::date)
  left join lateral (select o.fee_sen from public.class_rate_overrides o
   where o.organization_id=org and o.class_id=c.id and o.effective_from<=(s.starts_at at time zone 'Asia/Kuala_Lumpur')::date
   order by o.effective_from desc,o.created_at desc limit 1) ov on true
  where a.organization_id=org and s.status='completed' and a.status in ('present','late','makeup','absent')
   and (s.starts_at at time zone 'Asia/Kuala_Lumpur')::date>=month_start and (s.starts_at at time zone 'Asia/Kuala_Lumpur')::date<month_end
 ), priced as (
  select y.*, row_number() over (partition by y.student_id order by y.starts_at,y.sid) rn from y where y.price is not null
 )
 select jsonb_agg(jsonb_build_object('student_id',pr.student_id,'label',pr.label,'price',pr.price,'rn',pr.rn)) into sessions_json from priced pr;
 if sessions_json is null then return 0; end if;
 -- Kredit sesi (bulan ini atau lebih awal) menampung sesi yang belum dibilkan, dikira semula setiap kali.
 delete from public.session_credit_uses u where u.organization_id=org and u.guardian_id=guardian and u.period=billing_period;
 for cr in select x->>'student_id' sid, count(*)::integer cnt from jsonb_array_elements(sessions_json) x group by 1 loop
  remaining:=cr.cnt-coalesce((billed->>cr.sid)::integer,0);
  select coalesce((select sum(c.sessions) from public.session_credits c where c.organization_id=org and c.student_id=cr.sid::uuid and c.period<=billing_period),0)
   -coalesce((select sum(u.sessions) from public.session_credit_uses u where u.organization_id=org and u.student_id=cr.sid::uuid and u.period<>billing_period),0)
   into avail;
  used:=greatest(0,least(remaining,avail));
  if used>0 then
   insert into public.session_credit_uses(organization_id,guardian_id,student_id,period,sessions)
    values(org,guardian,cr.sid::uuid,billing_period,used)
    on conflict on constraint session_credit_uses_organization_id_student_id_period_key
    do update set sessions=excluded.sessions,guardian_id=excluded.guardian_id,updated_at=now();
   billed:=jsonb_set(billed,array[cr.sid],to_jsonb(coalesce((billed->>cr.sid)::integer,0)+used));
  end if;
 end loop;
 select jsonb_agg(jsonb_build_object('student_id',x.student_id,'description',x.label,'quantity',x.qty,'unit_price_sen',x.price,'discount_sen',0) order by x.label,x.price)
  into rest
  from (select (e->>'student_id')::uuid student_id,e->>'label' label,count(*)::integer qty,(e->>'price')::bigint price
   from jsonb_array_elements(sessions_json) e
   where (e->>'rn')::integer>coalesce((billed->>(e->>'student_id'))::integer,0)
   group by 1,2,4) x;
 if rest is null then
  -- Semua sesi sudah dibilkan atau ditampung kredit: invois terbuka yang lebih tidak diperlukan.
  if inv is not null then
   update public.invoices set status='void',updated_at=now() where id=inv;
   return 1;
  end if;
  return 0;
 end if;
 if inv is not null then
  delete from public.invoice_items where organization_id=org and invoice_id=inv;
  insert into public.invoice_items(organization_id,invoice_id,student_id,description,quantity,unit_price_sen,discount_sen)
   select org,inv,(i->>'student_id')::uuid,i->>'description',(i->>'quantity')::integer,(i->>'unit_price_sen')::bigint,0 from jsonb_array_elements(rest) i;
  select coalesce(sum((i->>'quantity')::integer*(i->>'unit_price_sen')::bigint),0) into total from jsonb_array_elements(rest) i;
  update public.invoices set total_sen=total,updated_at=now() where id=inv;
 else
  idem:=base; k:=1;
  while exists(select 1 from public.invoices i where i.organization_id=org and i.idempotency_key=idem) loop
   k:=k+1; idem:=base||':'||k::text;
  end loop;
  perform private.create_invoice(org,guardian,due,billing_period,rest,idem);
 end if;
 return 1;
end $$;
revoke all on function private.session_invoice_for(uuid,text,uuid) from public, anon;

create or replace function private.generate_session_invoices(org uuid,billing_period text) returns integer language plpgsql security definer set search_path='' as $$
declare g record; n integer:=0;
begin
 if not private.has_role(org,array['owner','admin']) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 if billing_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Bulan tidak sah'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||billing_period||'session-invoices',0));
 for g in select distinct sg.guardian_id from public.student_guardians sg where sg.organization_id=org and sg.is_billing_contact loop
  n:=n+private.session_invoice_for(org,billing_period,g.guardian_id);
 end loop;
 return n;
end $$;

-- Jana / kemas kini invois seorang penjaga sahaja.
create or replace function private.generate_guardian_invoice(org uuid,billing_period text,guardian uuid) returns integer language plpgsql security definer set search_path='' as $$
begin
 if not private.has_role(org,array['owner','admin']) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 if billing_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Bulan tidak sah'; end if;
 if not exists(select 1 from public.student_guardians sg where sg.organization_id=org and sg.guardian_id=guardian and sg.is_billing_contact) then
  raise exception 'Penjaga bil tidak ditemui'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||billing_period||'session-invoices',0));
 return private.session_invoice_for(org,billing_period,guardian);
end $$;
create or replace function public.generate_guardian_invoice(org uuid,billing_period text,guardian uuid) returns integer language sql security invoker set search_path='' as $$select private.generate_guardian_invoice(org,billing_period,guardian)$$;
revoke all on function private.generate_guardian_invoice(uuid,text,uuid) from public;
grant execute on function private.generate_guardian_invoice(uuid,text,uuid) to authenticated;
revoke all on function public.generate_guardian_invoice(uuid,text,uuid) from public,anon;
grant execute on function public.generate_guardian_invoice(uuid,text,uuid) to authenticated;

-- Kelas utama murid (pendaftaran aktif terawal) dan harga sesi kelas pada tarikh tertentu.
create or replace function private.primary_class(org uuid,student uuid) returns uuid language sql stable security definer set search_path='' as $$
 select e.class_id from public.enrollments e where e.organization_id=org and e.student_id=student and e.status='active'
 order by e.starts_on,e.created_at limit 1
$$;
create or replace function private.class_fee(org uuid,cid uuid,day date) returns bigint language sql stable security definer set search_path='' as $$
 select coalesce(
  (select o.fee_sen from public.class_rate_overrides o where o.organization_id=org and o.class_id=cid and o.effective_from<=day
    order by o.effective_from desc,o.created_at desc limit 1),
  (select r.amount_sen from public.classes c join public.programs p on p.id=c.program_id
    join public.program_fee_rates r on r.organization_id=org and r.program_code=p.code
     and r.duration_minutes=coalesce((select sc.duration_minutes from public.class_schedules sc where sc.organization_id=org and sc.class_id=cid
       order by (sc.effective_to is null) desc,sc.effective_from desc limit 1),30)
     and r.effective_from<=day and (r.effective_to is null or r.effective_to>=day)
    where c.organization_id=org and c.id=cid limit 1))
$$;
revoke all on function private.primary_class(uuid,uuid), private.class_fee(uuid,uuid,date) from public, anon;

-- Sesi dan amaun yang sudah dibayar bagi seorang anak pada satu invois. Invois yang dibayar penuh tanpa
-- baris sesi (bayaran lama / "Yuran telah dibayar") dikira dibayar sepenuhnya.
create or replace function private.child_invoice_paid(inv uuid,student uuid) returns table(sessions integer,amount bigint) language sql stable security definer set search_path='' as $$
 select case when i.status='paid' and not exists(select 1 from public.payment_sessions x where x.invoice_id=i.id)
   then (select coalesce(sum(ii.quantity),0)::integer from public.invoice_items ii where ii.invoice_id=i.id and ii.student_id=student)
   else coalesce((select sum(ps.sessions) from public.payment_sessions ps join public.payments py on py.id=ps.payment_id
     where ps.invoice_id=i.id and ps.student_id=student and py.status='verified'),0)::integer end,
  case when i.status='paid' and not exists(select 1 from public.payment_sessions x where x.invoice_id=i.id)
   then (select coalesce(sum(ii.total_sen),0)::bigint from public.invoice_items ii where ii.invoice_id=i.id and ii.student_id=student)
   else coalesce((select sum(ps.amount_sen) from public.payment_sessions ps join public.payments py on py.id=ps.payment_id
     where ps.invoice_id=i.id and ps.student_id=student and py.status='verified'),0)::bigint end
 from public.invoices i where i.id=inv
$$;
revoke all on function private.child_invoice_paid(uuid,uuid) from public, anon;

-- "Sudah bayar": satu amaun bagi keluarga (sen); null = baki penuh bulan ini.
create or replace function private.record_family_payment(org uuid,billing_period text,guardian uuid,paid_on date default null,amount_sen bigint default null,payment_method text default 'bank_transfer',payment_ref text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; pid uuid; rid uuid; it record; kid record; a bigint; take bigint; total bigint; owed bigint; allocs jsonb:='{}'::jsonb; credits jsonb:='{}'::jsonb; fees jsonb:='{}'::jsonb; inv_id text; outstanding bigint; got integer; progress boolean; min_fee bigint; sid text;
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
 -- Baki setiap anak dalam setiap invois bulan ini (invois tertua dahulu, anak ikut nama).
 create temporary table if not exists family_due(inv uuid,student uuid,qty integer,value bigint,done integer,paid bigint,ord integer) on commit drop;
 delete from family_due;
 insert into family_due
  select i.id,ii.student_id,sum(ii.quantity)::integer,sum(ii.total_sen)::bigint,p.sessions,p.amount,
   (row_number() over (order by i.created_at,st.full_name))::integer
  from public.invoices i join public.invoice_items ii on ii.invoice_id=i.id and ii.organization_id=i.organization_id
  join public.students st on st.id=ii.student_id
  cross join lateral private.child_invoice_paid(i.id,ii.student_id) p
  where i.organization_id=org and i.guardian_id=guardian and i.period=billing_period and i.status not in ('void','draft')
  group by i.id,i.created_at,ii.student_id,st.full_name,p.sessions,p.amount;
 select coalesce(sum(greatest(f.value-f.paid,0)),0) into owed from family_due f;
 a:=coalesce(amount_sen,owed);
 if a<=0 then raise exception 'Tiada baki untuk dibayar bulan ini. Masukkan amaun jika ibu bapa membayar lebih awal.'; end if;
 total:=a;
 insert into public.payments(organization_id,guardian_id,paid_on,method,amount_sen,reference,status,verified_by,verified_at,idempotency_key)
  values(org,guardian,coalesce(paid_on,(now() at time zone 'Asia/Kuala_Lumpur')::date),payment_method,total,
   nullif(trim(payment_ref),''),'verified',actor,now(),'family:'||billing_period||':'||guardian::text||':'||gen_random_uuid()::text)
  returning id into pid;
 for it in select * from family_due order by ord loop
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

-- 4) Sesi ganti. Kuota asas (migrasi 50) + sesi dibayar bulan lepas yang belum dilaksanakan.
create or replace function private.base_quota(org uuid,cid uuid,day date) returns integer language sql stable security definer set search_path='' as $$
 select coalesce(c.sessions_per_month,4*least(7,greatest(1,(select count(*)::int from public.class_schedules r
   where r.organization_id=org and r.class_id=cid
    and r.effective_from<(date_trunc('month',day::timestamp)+interval '1 month')::date
    and (r.effective_to is null or r.effective_to>=date_trunc('month',day::timestamp)::date)))))
 from public.classes c where c.organization_id=org and c.id=cid
$$;
-- Sesi dibayar bagi seorang murid untuk sebulan: sesi dalam bayaran invois bulan itu + kredit yang dibeli
-- pada bulan itu. Sesi direkod: kehadiran yang dicaj (Hadir/Lewat/Ganti/Tidak hadir).
create or replace function private.sessions_paid(org uuid,student uuid,month_key text) returns integer language sql stable security definer set search_path='' as $$
 select (coalesce((select sum(p.sessions) from public.invoices i cross join lateral private.child_invoice_paid(i.id,student) p
   where i.organization_id=org and i.period=month_key and i.status not in ('void','draft')
    and exists(select 1 from public.invoice_items ii where ii.invoice_id=i.id and ii.student_id=student)),0)
  +coalesce((select sum(c.sessions) from public.session_credits c where c.organization_id=org and c.student_id=student and c.period=month_key),0))::integer
$$;
create or replace function private.sessions_held(org uuid,student uuid,month_key text) returns integer language sql stable security definer set search_path='' as $$
 select count(*)::integer from public.attendance a join public.class_sessions s on s.id=a.session_id
 where a.organization_id=org and a.student_id=student and s.status='completed' and a.status in ('present','late','makeup','absent')
  and to_char(s.starts_at at time zone 'Asia/Kuala_Lumpur','YYYY-MM')=month_key
$$;
-- Sesi ganti seorang murid pada bulan `day`: dibawa dari bulan lepas = ganti lepas + dibayar − direkod.
create or replace function private.student_carry(org uuid,student uuid,day date) returns integer language plpgsql stable security definer set search_path='' as $$
declare prev date:=(date_trunc('month',day::timestamp)-interval '1 month')::date; p text;
begin
 if prev<'2026-11-01'::date then return 0; end if;
 p:=to_char(prev,'YYYY-MM');
 return greatest(0,private.student_carry(org,student,prev)+private.sessions_paid(org,student,p)-private.sessions_held(org,student,p));
end $$;
-- Sesi ganti kelas: hanya kelas individu yang menjadi kelas utama murid.
create or replace function private.quota_carry(org uuid,cid uuid,day date) returns integer language plpgsql stable security definer set search_path='' as $$
declare student uuid;
begin
 if not exists(select 1 from public.classes c where c.organization_id=org and c.id=cid and c.mode='one_to_one') then return 0; end if;
 select e.student_id into student from public.enrollments e where e.organization_id=org and e.class_id=cid order by e.created_at limit 1;
 if student is null or private.primary_class(org,student) is distinct from cid then return 0; end if;
 return private.student_carry(org,student,day);
end $$;
revoke all on function private.sessions_paid(uuid,uuid,text), private.sessions_held(uuid,uuid,text), private.student_carry(uuid,uuid,date) from public, anon;
grant execute on function private.sessions_paid(uuid,uuid,text), private.sessions_held(uuid,uuid,text), private.student_carry(uuid,uuid,date), private.child_invoice_paid(uuid,uuid), private.primary_class(uuid,uuid), private.class_fee(uuid,uuid,date) to authenticated;
create or replace function private.class_quota(org uuid,cid uuid,day date) returns integer language sql stable security definer set search_path='' as $$
 select private.base_quota(org,cid,day)+private.quota_carry(org,cid,day)
$$;
revoke all on function private.base_quota(uuid,uuid,date), private.quota_carry(uuid,uuid,date) from public, anon;
grant execute on function private.base_quota(uuid,uuid,date), private.quota_carry(uuid,uuid,date) to authenticated;

notify pgrst, 'reload schema';
