-- Invois tambahan: jana yuran sesi boleh diulang sepanjang bulan.
-- Invois yang belum dibayar dikemas kini mengikut sesi terkini (seperti dahulu). Jika invois bulan itu
-- sudah menerima bayaran, sesi yang belum dibilkan masuk ke INVOIS TAMBAHAN (kunci
-- 'sessions:<bulan>:<penjaga>:2', ':3', ...), bukan hilang. Kuantiti dikira berbanding semua invois
-- sesi bulan itu yang tidak dibatalkan, jadi tiada sesi dibilkan dua kali.
create or replace function private.generate_session_invoices(org uuid,billing_period text) returns integer language plpgsql security definer set search_path='' as $$
declare g record; items jsonb; rest jsonb; inv uuid; base text; idem text; k integer; total bigint; n integer:=0; due date; month_start date; month_end date;
begin
 if not private.has_role(org,array['owner','admin']) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 if billing_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Bulan tidak sah'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||billing_period||'session-invoices',0));
 month_start:=(billing_period||'-01')::date; month_end:=(month_start+interval '1 month')::date;
 due:=(month_end+6);
 for g in select distinct sg.guardian_id from public.student_guardians sg where sg.organization_id=org and sg.is_billing_contact loop
  select jsonb_agg(jsonb_build_object('student_id',x.student_id,'description',x.label,'quantity',x.qty,'unit_price_sen',x.price,'discount_sen',0) order by x.label,x.price)
   into items from (
    select y.student_id,y.label,count(*)::integer qty,y.price from (
     select a.student_id, st.full_name||' · '||p.name||' ('||((extract(epoch from (s.ends_at-s.starts_at))/60)::integer)::text||' minit)' as label,
      coalesce(ov.fee_sen,r.amount_sen) price
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
    ) y where y.price is not null
    group by y.student_id,y.label,y.price) x;
  if items is null then continue; end if;
  base:='sessions:'||billing_period||':'||g.guardian_id::text;
  -- Invois terbuka: belum menerima sebarang bayaran dan belum dibatalkan (yang terkini).
  select i.id into inv from public.invoices i
   where i.organization_id=org and i.guardian_id=g.guardian_id and (i.idempotency_key=base or i.idempotency_key like base||':%')
    and i.status in ('issued','draft','overdue')
    and not exists(select 1 from public.payment_allocations pa where pa.organization_id=org and pa.invoice_id=i.id)
   order by i.created_at desc limit 1;
  -- Baki yang belum dibilkan dalam invois sesi lain bulan ini (yang tidak dibatalkan).
  select jsonb_agg(jsonb_build_object('student_id',w.sid,'description',w.d,'quantity',w.q-coalesce(b.q,0),'unit_price_sen',w.p,'discount_sen',0) order by w.d,w.p)
   into rest
   from (select (e->>'student_id')::uuid sid,e->>'description' d,(e->>'unit_price_sen')::bigint p,(e->>'quantity')::integer q
         from jsonb_array_elements(items) e) w
   left join (select ii.student_id sid,ii.description d,ii.unit_price_sen p,sum(ii.quantity)::integer q
              from public.invoice_items ii join public.invoices i on i.id=ii.invoice_id and i.organization_id=ii.organization_id
              where i.organization_id=org and i.guardian_id=g.guardian_id and (i.idempotency_key=base or i.idempotency_key like base||':%')
               and i.status<>'void' and i.id is distinct from inv
              group by 1,2,3) b on b.sid=w.sid and b.d=w.d and b.p=w.p
   where w.q-coalesce(b.q,0)>0;
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
revoke all on function private.generate_session_invoices(uuid,text) from public;
grant execute on function private.generate_session_invoices(uuid,text) to authenticated;
notify pgrst, 'reload schema';
