create function private.staff_directory(org uuid) returns table(id uuid, display_name text, active boolean) language sql stable security definer set search_path='' as $$
 select p.id,p.display_name,p.active from public.staff_profiles p join public.staff_memberships m on m.staff_id=p.id
 where m.organization_id=org and m.active and (private.has_role(org,array['owner','academic_admin','finance_admin']) or (private.has_role(org,array['tutor']) and p.id=private.staff_id()))
$$;
create function public.staff_directory(org uuid) returns table(id uuid, display_name text, active boolean) language sql security invoker set search_path='' as $$ select * from private.staff_directory(org) $$;
create function private.log_invitation(org uuid, target uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform private.require_role(org,array['owner']); insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id)values(org,auth.uid(),'INVITE','auth_user',target); end $$;
create function public.log_invitation(org uuid, target uuid) returns void language sql security invoker set search_path='' as $$ select private.log_invitation(org,target) $$;
revoke all on function private.staff_directory(uuid),private.log_invitation(uuid,uuid) from public;
grant execute on function private.staff_directory(uuid),private.log_invitation(uuid,uuid) to authenticated;
revoke all on function public.staff_directory(uuid),public.log_invitation(uuid,uuid) from public,anon;
grant execute on function public.staff_directory(uuid),public.log_invitation(uuid,uuid) to authenticated;
