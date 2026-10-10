create function private.staff_directory_v2(org uuid) returns table(id uuid,display_name text,active boolean,role text) language sql stable security definer set search_path='' as $$
 select p.id,p.display_name,p.active,m.role from public.staff_profiles p join public.staff_memberships m on m.staff_id=p.id
 where m.organization_id=org and m.active and (private.has_role(org,array['owner','academic_admin','finance_admin']) or (private.has_role(org,array['tutor']) and p.id=private.staff_id()))
$$;
create function public.staff_directory_v2(org uuid)returns table(id uuid,display_name text,active boolean,role text)language sql security invoker set search_path='' as $$select * from private.staff_directory_v2(org)$$;
revoke all on function private.staff_directory_v2(uuid) from public;
grant execute on function private.staff_directory_v2(uuid) to authenticated;
revoke all on function public.staff_directory_v2(uuid) from public,anon;
grant execute on function public.staff_directory_v2(uuid) to authenticated;
