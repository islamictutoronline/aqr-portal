alter table public.tutor_adjustments add column paid_at timestamptz;
alter table public.tutor_adjustments add column payment_reference text;
alter table public.tutor_adjustments add column paid_by uuid;
alter table public.tutor_adjustments add foreign key(organization_id,paid_by)references public.staff_memberships(organization_id,staff_id);
create function private.pay_adjustment(org uuid,adjustment uuid,payment_ref text)returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid;item public.tutor_adjustments;begin
 actor:=private.require_role(org,array['owner','finance_admin']);
 select * into item from public.tutor_adjustments where organization_id=org and id=adjustment for update;
 if item.id is null or item.checker_id is null or length(trim(payment_ref))<3 then raise exception 'Pelarasan mesti diluluskan dan rujukan diperlukan';end if;
 if item.paid_at is not null then if item.payment_reference<>payment_ref then raise exception 'Bayaran pelarasan telah dikunci';end if;return item.id;end if;
 update public.tutor_adjustments set paid_at=now(),payment_reference=payment_ref,paid_by=actor where id=item.id;return item.id;
end $$;
create function public.pay_adjustment(org uuid,adjustment uuid,payment_ref text)returns uuid language sql security invoker set search_path='' as $$select private.pay_adjustment(org,adjustment,payment_ref)$$;
revoke all on function private.pay_adjustment(uuid,uuid,text) from public;
grant execute on function private.pay_adjustment(uuid,uuid,text) to authenticated;
revoke all on function public.pay_adjustment(uuid,uuid,text) from public,anon;
grant execute on function public.pay_adjustment(uuid,uuid,text) to authenticated;
create policy own_adjustment_read on public.tutor_adjustments for select to authenticated using(private.has_role(organization_id,array['tutor']) and tutor_id=private.staff_id());
