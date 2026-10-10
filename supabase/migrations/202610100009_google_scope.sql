create or replace function private.google_tokens(org uuid, encrypted text default null, revoke boolean default false) returns text language plpgsql security definer set search_path='' as $$
declare result text; begin
 perform private.require_role(org,array['owner','finance_admin']);
 if revoke then delete from public.google_connections where organization_id=org and auth_user_id=auth.uid(); return null; end if;
 if encrypted is not null then insert into public.google_connections(organization_id,auth_user_id,encrypted_tokens,scope) values(org,auth.uid(),encrypted,'https://www.googleapis.com/auth/drive.file') on conflict(organization_id,auth_user_id) do update set encrypted_tokens=excluded.encrypted_tokens,scope=excluded.scope,updated_at=now(),revoked_at=null; end if;
 select encrypted_tokens into result from public.google_connections where organization_id=org and auth_user_id=auth.uid() and revoked_at is null; return result;
end $$;
