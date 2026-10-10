-- Tutor memadam kelas yang tersilap rekod: sesi dibatalkan (tidak dikira elaun) dan ulasan
-- ibu bapa ditarik balik. Rekod tidak dipadam secara fizikal; tindakan diaudit. Boleh dijalankan semula.
create or replace function private.void_session(org uuid,sid uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare sess public.class_sessions;
begin
 select * into sess from public.class_sessions where organization_id=org and id=sid for update;
 if sess.id is null then raise exception 'Sesi tidak ditemui'; end if;
 if not (private.has_role(org,array['owner','admin']) or (private.has_role(org,array['tutor']) and sess.tutor_id=private.staff_id())) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 if sess.review_status in ('verified','approved','paid') then raise exception 'Sesi telah dikunci'; end if;
 if sess.status in ('cancelled','rescheduled') then return sid; end if;
 update public.class_sessions set status='cancelled',updated_at=now() where id=sid;
 update public.generated_parent_comments set status='retracted' where organization_id=org and session_id=sid and status in ('draft','published');
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
  values(org,auth.uid(),'VOID','class_sessions',sid,jsonb_build_object('previous_status',sess.status));
 return sid;
end $$;
create or replace function public.void_session(org uuid,sid uuid) returns uuid language sql security invoker set search_path='' as $$select private.void_session(org,sid)$$;
revoke all on function private.void_session(uuid,uuid) from public;
grant execute on function private.void_session(uuid,uuid) to authenticated;
revoke all on function public.void_session(uuid,uuid) from public,anon;
grant execute on function public.void_session(uuid,uuid) to authenticated;
notify pgrst, 'reload schema';
