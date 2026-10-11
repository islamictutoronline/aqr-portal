-- Maklumat bayaran tutor untuk payslip (penyata pendapatan). Data kewangan peribadi:
-- hanya tutor itu sendiri dan pemilik/admin boleh membaca/mengubah. Boleh dijalankan semula.
create table if not exists public.tutor_payment_details (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 staff_id uuid not null references public.staff_profiles(id),
 job_title text not null default 'Guru Online Part Time',
 department text not null default 'Al-Quran',
 bank_name text,
 account_holder text,
 account_number text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,staff_id)
);
alter table public.tutor_payment_details enable row level security;
revoke all on public.tutor_payment_details from anon, authenticated;
grant select on public.tutor_payment_details to authenticated;
drop policy if exists payment_details_read on public.tutor_payment_details;
create policy payment_details_read on public.tutor_payment_details for select to authenticated
 using(private.has_role(organization_id,array['owner','admin']) or staff_id=private.staff_id());

create or replace function private.save_payment_details(org uuid,staff_id uuid,job_title text,department text,bank_name text,account_holder text,account_number text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not (private.has_role(org,array['owner','admin']) or (private.has_role(org,array['tutor']) and save_payment_details.staff_id=private.staff_id())) then
  raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 if not exists(select 1 from public.staff_memberships m where m.organization_id=org and m.staff_id=save_payment_details.staff_id) then
  raise exception 'Kakitangan tidak ditemui'; end if;
 if coalesce(length(account_number),0)>40 or coalesce(length(bank_name),0)>80 or coalesce(length(account_holder),0)>120
  or coalesce(length(job_title),0)>80 or coalesce(length(department),0)>80 then raise exception 'Maklumat terlalu panjang'; end if;
 if account_number is not null and trim(account_number)<>'' and trim(account_number) !~ '^[0-9 -]{6,40}$' then
  raise exception 'Nombor akaun hanya boleh mengandungi nombor'; end if;
 insert into public.tutor_payment_details(organization_id,staff_id,job_title,department,bank_name,account_holder,account_number)
  values(org,save_payment_details.staff_id,coalesce(nullif(trim(job_title),''),'Guru Online Part Time'),coalesce(nullif(trim(department),''),'Al-Quran'),
   nullif(trim(bank_name),''),nullif(trim(account_holder),''),nullif(trim(account_number),''))
  on conflict on constraint tutor_payment_details_organization_id_staff_id_key do update set job_title=excluded.job_title,department=excluded.department,bank_name=excluded.bank_name,
   account_holder=excluded.account_holder,account_number=excluded.account_number,updated_at=now()
  returning id into result;
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
  values(org,auth.uid(),'PAYMENT_DETAILS','staff_profiles',save_payment_details.staff_id,'{}'::jsonb);
 return result;
end $$;
create or replace function public.save_payment_details(org uuid,staff_id uuid,job_title text,department text,bank_name text,account_holder text,account_number text) returns uuid language sql security invoker set search_path='' as $$select private.save_payment_details(org,staff_id,job_title,department,bank_name,account_holder,account_number)$$;
revoke all on function private.save_payment_details(uuid,uuid,text,text,text,text,text) from public;
grant execute on function private.save_payment_details(uuid,uuid,text,text,text,text,text) to authenticated;
revoke all on function public.save_payment_details(uuid,uuid,text,text,text,text,text) from public,anon;
grant execute on function public.save_payment_details(uuid,uuid,text,text,text,text,text) to authenticated;
notify pgrst, 'reload schema';
