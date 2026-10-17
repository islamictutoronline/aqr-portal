-- Pemilik/admin menetapkan semula kata laluan tutor yang terlupa kepada kata laluan sementara yang
-- ditaip oleh admin (tidak disimpan dalam kod). Tutor wajib menukarnya pada log masuk seterusnya
-- (user_metadata.must_change_password). Hanya tutor aktif dalam organisasi yang sama; bukan akaun sendiri.
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
 update auth.users u set encrypted_password=extensions.crypt(temp_password,extensions.gen_salt('bf')),
  raw_user_meta_data=coalesce(u.raw_user_meta_data,'{}'::jsonb)||jsonb_build_object('password_set',false,'must_change_password',true),
  updated_at=now()
  where u.id=target;
 if not found then raise exception 'Akaun log masuk tutor tidak ditemui'; end if;
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
  values(org,auth.uid(),'RESET_TUTOR_PASSWORD','staff_profiles',reset_tutor_password.staff_id,'{}'::jsonb);
 return true;
end $$;
create or replace function public.reset_tutor_password(org uuid,staff_id uuid,temp_password text) returns boolean language sql security invoker set search_path='' as $$select private.reset_tutor_password(org,staff_id,temp_password)$$;
revoke all on function private.reset_tutor_password(uuid,uuid,text) from public;
grant execute on function private.reset_tutor_password(uuid,uuid,text) to authenticated;
revoke all on function public.reset_tutor_password(uuid,uuid,text) from public,anon;
grant execute on function public.reset_tutor_password(uuid,uuid,text) to authenticated;
notify pgrst, 'reload schema';
