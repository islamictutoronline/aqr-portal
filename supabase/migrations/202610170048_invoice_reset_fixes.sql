-- Migrasi 48: pembetulan invois tambahan dan reset kata laluan.
-- 1) Sesi yang sudah dibilkan dikira mengikut murid (tertib masa), bukan padanan teks/harga baris invois:
--    tukar nama murid/program, kadar khas atau tempoh selepas bayaran tidak lagi mengecaj semula sesi.
-- 2) Invois yang bayarannya ditolak/dibalikkan dianggap belum dibayar (boleh dikemas kini semula).
-- 3) reset_tutor_password: menolak akaun yang menjadi pemilik/admin dalam mana-mana organisasi, dan
--    menamatkan sesi log masuk sedia ada tutor itu.
-- Boleh dijalankan semula.

create or replace function private.generate_session_invoices(org uuid,billing_period text) returns integer language plpgsql security definer set search_path='' as $$
declare g record; items jsonb; rest jsonb; billed jsonb; inv uuid; base text; idem text; k integer; total bigint; n integer:=0; due date; month_start date; month_end date;
begin
 if not private.has_role(org,array['owner','admin']) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 if billing_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Bulan tidak sah'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||billing_period||'session-invoices',0));
 month_start:=(billing_period||'-01')::date; month_end:=(month_start+interval '1 month')::date;
 due:=(month_end+6);
 for g in select distinct sg.guardian_id from public.student_guardians sg where sg.organization_id=org and sg.is_billing_contact loop
  base:='sessions:'||billing_period||':'||g.guardian_id::text;
  -- Invois terbuka: belum menerima bayaran sah (bayaran ditolak/dibalikkan tidak dikira) dan belum dibatalkan.
  select i.id into inv from public.invoices i
   where i.organization_id=org and i.guardian_id=g.guardian_id and (i.idempotency_key=base or i.idempotency_key like base||':%')
    and i.status in ('issued','draft','overdue')
    and not exists(select 1 from public.payment_allocations pa join public.payments py on py.id=pa.payment_id and py.organization_id=pa.organization_id
     where pa.organization_id=org and pa.invoice_id=i.id and py.status not in ('rejected','reversed'))
   order by i.created_at desc limit 1;
  -- Bilangan sesi setiap murid yang sudah dibilkan dalam invois sesi lain bulan ini (tidak dibatalkan).
  -- Dikira mengikut murid sahaja supaya tukar nama murid/program atau harga tidak mengecaj semula sesi.
  select coalesce(jsonb_object_agg(q.student_id,q.n),'{}'::jsonb) into billed from (
   select ii.student_id::text student_id,sum(ii.quantity) n
   from public.invoice_items ii join public.invoices i on i.id=ii.invoice_id and i.organization_id=ii.organization_id
   where i.organization_id=org and i.guardian_id=g.guardian_id and (i.idempotency_key=base or i.idempotency_key like base||':%')
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
   join public.student_guardians sg on sg.student_id=a.student_id and sg.organization_id=a.organization_id and sg.guardian_id=g.guardian_id and sg.is_billing_contact
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
  select (select jsonb_agg(1) from priced),
   (select jsonb_agg(jsonb_build_object('student_id',x.student_id,'description',x.label,'quantity',x.qty,'unit_price_sen',x.price,'discount_sen',0) order by x.label,x.price)
    from (select pr.student_id,pr.label,count(*)::integer qty,pr.price from priced pr
     where pr.rn>coalesce((billed->>pr.student_id::text)::integer,0)
     group by pr.student_id,pr.label,pr.price) x)
   into items, rest;
  if items is null then continue; end if;
  if rest is null then
   -- Semua sesi sudah dibilkan dalam invois lain: invois terbuka yang lebih tidak diperlukan.
   if inv is not null then
    update public.invoices set status='void',updated_at=now() where id=inv;
    n:=n+1;
   end if;
   continue;
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
   perform private.create_invoice(org,g.guardian_id,due,billing_period,rest,idem);
  end if;
  n:=n+1;
 end loop;
 return n;
end $$;

create or replace function private.reset_tutor_password(org uuid,staff_id uuid,temp_password text) returns boolean language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if not private.has_role(org,array['owner','admin']) then
  raise exception 'Hanya pemilik atau admin boleh menetapkan semula kata laluan' using errcode='42501'; end if;
 if reset_tutor_password.staff_id=private.staff_id() then raise exception 'Tukar kata laluan anda sendiri di Tetapan'; end if;
 if length(coalesce(temp_password,''))<8 or temp_password !~ '[A-Za-z]' or temp_password !~ '[0-9]' then
  raise exception 'Kata laluan sementara mesti sekurang-kurangnya 8 aksara dengan huruf dan nombor'; end if;
 select p.auth_user_id into target from public.staff_profiles p
  join public.staff_memberships m on m.staff_id=p.id
  where m.organization_id=org and p.id=reset_tutor_password.staff_id and m.role='tutor' and m.active and p.active;
 if target is null then raise exception 'Tutor aktif tidak ditemui'; end if;
 -- Akaun yang juga pemilik/admin (mana-mana organisasi) tidak boleh di-reset melalui fungsi ini.
 if exists(select 1 from public.staff_memberships m where m.staff_id=reset_tutor_password.staff_id and m.role in ('owner','admin') and m.active) then
  raise exception 'Akaun ini mempunyai peranan pentadbir; tukar kata laluan melalui akaun itu sendiri'; end if;
 update auth.users u set encrypted_password=extensions.crypt(temp_password,extensions.gen_salt('bf')),
  raw_user_meta_data=coalesce(u.raw_user_meta_data,'{}'::jsonb)||jsonb_build_object('password_set',false,'must_change_password',true),
  updated_at=now()
  where u.id=target;
 if not found then raise exception 'Akaun log masuk tutor tidak ditemui'; end if;
 -- Tamatkan sesi log masuk sedia ada (peranti lain perlu log masuk semula dengan kata laluan baharu).
 if to_regclass('auth.sessions') is not null then execute 'delete from auth.sessions where user_id=$1' using target; end if;
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
  values(org,auth.uid(),'RESET_TUTOR_PASSWORD','staff_profiles',reset_tutor_password.staff_id,'{}'::jsonb);
 return true;
end $$;
notify pgrst, 'reload schema';
