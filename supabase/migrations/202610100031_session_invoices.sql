-- Yuran ibu bapa ikut sesi yang dijalankan (keputusan pengguna 11 Okt 2026):
-- harga sesi daripada Borang Pendaftaran AQR; Hadir/Lewat/Ganti/Tidak hadir dicaj, Berizin tidak.
-- Program baharu daripada borang ditambah. Boleh dijalankan semula.

create table if not exists public.program_fee_rates (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 program_code text not null,
 duration_minutes integer not null check(duration_minutes>0),
 amount_sen bigint not null check(amount_sen>=0),
 effective_from date not null,
 effective_to date,
 source text,
 created_at timestamptz not null default now(),
 unique(organization_id,program_code,duration_minutes,effective_from),
 check(effective_to is null or effective_to>=effective_from)
);
alter table public.program_fee_rates enable row level security;
revoke all on public.program_fee_rates from anon, authenticated;
grant select on public.program_fee_rates to authenticated;
drop policy if exists fee_rates_read on public.program_fee_rates;
create policy fee_rates_read on public.program_fee_rates for select to authenticated
 using(private.has_role(organization_id,array['owner','admin']));

-- Program baharu dan kadar yuran awal bagi setiap organisasi sedia ada.
do $$
declare o record; s_arab uuid; s_quran uuid; s_fardhu uuid;
begin
 for o in select id from public.organizations loop
  select id into s_arab from public.subjects where organization_id=o.id and slug='bahasa_arab';
  select id into s_quran from public.subjects where organization_id=o.id and slug='mengaji';
  select id into s_fardhu from public.subjects where organization_id=o.id and slug='fardhu_ain';
  insert into public.programs(organization_id,subject_id,code,name)
   select o.id,v.subject,v.code,v.name from (values
    (s_arab,'BAHASA_ARAB_KSSM','Bahasa Arab KSSM'),
    (s_arab,'BAHASA_ARAB_MADINAH','Bahasa Arab Madinah'),
    (s_quran,'TADABBUR','Tadabbur / Tafsir Juz 30'),
    (s_fardhu,'FARAID','Faraid Ilmu Pusaka'),
    (s_quran,'TARANNUM','Tarannum')) v(subject,code,name)
   where v.subject is not null and not exists(select 1 from public.programs p where p.organization_id=o.id and p.code=v.code);
  insert into public.program_fee_rates(organization_id,program_code,duration_minutes,amount_sen,effective_from,source)
   select o.id,v.code,v.minutes,v.amount,'2026-10-01','Borang Pendaftaran AQR' from (values
    ('IQRA',20,800),('IQRA',30,1000),
    ('KELANCARAN_AQ',20,800),('KELANCARAN_AQ',30,1000),
    ('TAHSIN_AQ',20,800),('TAHSIN_AQ',30,1000),
    ('PRA_TAHFIZ',30,1000),
    ('FARDHU_AIN_KAFA',30,1200),
    ('TAJWID_TP',30,1200),
    ('BAHASA_ARAB',30,1500),
    ('BAHASA_ARAB_KSSM',30,1700),
    ('BAHASA_ARAB_MADINAH',30,2000),
    ('TADABBUR',30,2000),
    ('FARAID',30,2500),
    ('FARDHU_AIN_DEWASA',30,2000),
    ('TARANNUM',30,2000)) v(code,minutes,amount)
   on conflict (organization_id,program_code,duration_minutes,effective_from) do nothing;
 end loop;
end $$;

-- Jana invois bulanan bagi setiap penjaga bil daripada sesi yang dijalankan.
-- Invois yang belum dibayar dikemas kini apabila dijana semula; invois yang ada bayaran dikekalkan.
create or replace function private.generate_session_invoices(org uuid,billing_period text) returns integer language plpgsql security definer set search_path='' as $$
declare g record; items jsonb; inv uuid; total bigint; n integer:=0; due date; month_start date; month_end date;
begin
 if not private.has_role(org,array['owner','admin']) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 if billing_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Bulan tidak sah'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||billing_period||'session-invoices',0));
 month_start:=(billing_period||'-01')::date; month_end:=(month_start+interval '1 month')::date;
 due:=(month_end+6);
 for g in select distinct sg.guardian_id from public.student_guardians sg where sg.organization_id=org and sg.is_billing_contact loop
  select jsonb_agg(jsonb_build_object('student_id',x.student_id,'description',x.label,'quantity',x.qty,'unit_price_sen',x.price,'discount_sen',0) order by x.label)
   into items from (
    select a.student_id, st.full_name||' · '||p.name||' ('||((extract(epoch from (s.ends_at-s.starts_at))/60)::integer)::text||' minit)' as label,
     count(*)::integer qty, r.amount_sen price
    from public.attendance a
    join public.class_sessions s on s.id=a.session_id and s.organization_id=a.organization_id
    join public.classes c on c.id=s.class_id and c.organization_id=s.organization_id
    join public.programs p on p.id=c.program_id and p.organization_id=c.organization_id
    join public.students st on st.id=a.student_id and st.organization_id=a.organization_id
    join public.student_guardians sg on sg.student_id=a.student_id and sg.organization_id=a.organization_id and sg.guardian_id=g.guardian_id and sg.is_billing_contact
    join public.program_fee_rates r on r.organization_id=org and r.program_code=p.code
     and r.duration_minutes=((extract(epoch from (s.ends_at-s.starts_at))/60)::integer)
     and r.effective_from<=(s.starts_at at time zone 'Asia/Kuala_Lumpur')::date
     and (r.effective_to is null or r.effective_to>=(s.starts_at at time zone 'Asia/Kuala_Lumpur')::date)
    where a.organization_id=org and s.status='completed' and a.status in ('present','late','makeup','absent')
     and (s.starts_at at time zone 'Asia/Kuala_Lumpur')::date>=month_start and (s.starts_at at time zone 'Asia/Kuala_Lumpur')::date<month_end
    group by a.student_id,st.full_name,p.name,label,r.amount_sen) x;
  if items is null then continue; end if;
  select id into inv from public.invoices where organization_id=org and idempotency_key='sessions:'||billing_period||':'||g.guardian_id::text;
  if inv is null then
   perform private.create_invoice(org,g.guardian_id,due,billing_period,items,'sessions:'||billing_period||':'||g.guardian_id::text);
   n:=n+1;
  elsif not exists(select 1 from public.payment_allocations pa where pa.organization_id=org and pa.invoice_id=inv)
   and exists(select 1 from public.invoices i where i.id=inv and i.status in ('issued','draft','overdue')) then
   -- Belum dibayar: kemas kini butiran mengikut sesi terkini.
   delete from public.invoice_items where organization_id=org and invoice_id=inv;
   insert into public.invoice_items(organization_id,invoice_id,student_id,description,quantity,unit_price_sen,discount_sen)
    select org,inv,(i->>'student_id')::uuid,i->>'description',(i->>'quantity')::integer,(i->>'unit_price_sen')::bigint,0 from jsonb_array_elements(items) i;
   select coalesce(sum((i->>'quantity')::integer*(i->>'unit_price_sen')::bigint),0) into total from jsonb_array_elements(items) i;
   update public.invoices set total_sen=total,updated_at=now() where id=inv;
   n:=n+1;
  end if;
 end loop;
 return n;
end $$;
create or replace function public.generate_session_invoices(org uuid,billing_period text) returns integer language sql security invoker set search_path='' as $$select private.generate_session_invoices(org,billing_period)$$;
revoke all on function private.generate_session_invoices(uuid,text) from public;
grant execute on function private.generate_session_invoices(uuid,text) to authenticated;
revoke all on function public.generate_session_invoices(uuid,text) from public,anon;
grant execute on function public.generate_session_invoices(uuid,text) to authenticated;
notify pgrst, 'reload schema';
