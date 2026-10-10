-- Qualify outer-row identifiers explicitly in policies.
drop policy org_read on public.organizations;
create policy org_read on public.organizations for select to authenticated using(private.has_role(id,array['owner','academic_admin','finance_admin','tutor']) or exists(select 1 from public.guardians g where g.organization_id=organizations.id and g.auth_user_id=auth.uid() and g.active));
drop policy profiles_read on public.staff_profiles;
create policy profiles_read on public.staff_profiles for select to authenticated using(auth_user_id=auth.uid() or exists(select 1 from public.staff_memberships m where m.staff_id=staff_profiles.id and private.has_role(m.organization_id,array['owner','academic_admin'])));
create function private.touch_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
do $$ declare tn text; begin for tn in select tablename from pg_tables where schemaname='public' loop
 execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()',tn);
 if tn not in ('organizations','staff_profiles') then execute format('create index on public.%I (organization_id)',tn); end if;
 end loop; end $$;
create function private.assignment_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.staff_memberships m where m.organization_id=new.organization_id and m.staff_id=new.staff_id and m.active and m.role='tutor') then raise exception 'Tugasan hanya untuk tutor aktif'; end if;
 return new;
end $$;
create trigger assignment_guard before insert or update on public.class_tutors for each row execute function private.assignment_guard();

create function private.adjust_allowance(org uuid, entry uuid, amount bigint, reason text, adjustment uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; result uuid; original public.tutor_allowance_entries; item public.tutor_adjustments; begin
 actor:=private.require_role(org,array['owner','finance_admin']);
 if adjustment is not null then
 select * into item from public.tutor_adjustments where organization_id=org and id=adjustment for update;
 if item.id is null or item.maker_id=actor then raise exception 'Pelulus pelarasan mesti berlainan'; end if;
 select * into original from public.tutor_allowance_entries where organization_id=org and id=item.entry_id for update;
 if original.amount_sen+coalesce((select sum(amount_sen) from public.tutor_adjustments where entry_id=item.entry_id and checker_id is not null and id<>item.id),0)+item.amount_sen<0 then raise exception 'Pelarasan terkumpul melebihi elaun asal';end if;
 if item.checker_id is null then update public.tutor_adjustments set checker_id=actor where id=item.id; end if;
 return item.id;
 end if;
 select * into original from public.tutor_allowance_entries where organization_id=org and id=entry for update;
 if original.id is null or original.status not in ('approved','paid') or amount=0 or length(trim(reason))<5 then raise exception 'Pelarasan memerlukan entri diluluskan dan sebab sah'; end if;
 if original.amount_sen+coalesce((select sum(amount_sen) from public.tutor_adjustments where entry_id=entry and checker_id is not null),0)+amount<0 then raise exception 'Pelarasan tidak boleh melebihi elaun asal'; end if;
 insert into public.tutor_adjustments(organization_id,tutor_id,entry_id,amount_sen,reason,maker_id) values(org,original.tutor_id,entry,amount,reason,actor) returning id into result;
 return result;
end $$;
create function public.adjust_allowance(org uuid, entry uuid, amount bigint, reason text, adjustment uuid default null) returns uuid language sql security invoker set search_path='' as $$ select private.adjust_allowance(org,entry,amount,reason,adjustment) $$;
revoke all on function private.adjust_allowance(uuid,uuid,bigint,text,uuid),private.touch_updated_at(),private.assignment_guard() from public;
grant execute on function private.adjust_allowance(uuid,uuid,bigint,text,uuid) to authenticated;
revoke all on function public.adjust_allowance(uuid,uuid,bigint,text,uuid) from public,anon;
grant execute on function public.adjust_allowance(uuid,uuid,bigint,text,uuid) to authenticated;
