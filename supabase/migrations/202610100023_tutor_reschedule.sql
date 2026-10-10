-- Tutor boleh menukar tarikh/jam (atau membatalkan) sesinya sendiri yang belum disahkan.
-- Sesi asal ditanda 'rescheduled' dan sesi baharu dicipta, supaya jadual mingguan tidak
-- mencipta semula slot asal sebagai pendua. Boleh dijalankan semula.
create or replace function private.change_session(org uuid,sid uuid,new_status text,reason text,new_start timestamptz default null)returns uuid language plpgsql security definer set search_path='' as $$
declare sess public.class_sessions;result uuid; begin
 select * into sess from public.class_sessions where organization_id=org and id=sid for update;
 if sess.id is null then raise exception 'Sesi tidak ditemui';end if;
 if not (private.has_role(org,array['owner','admin']) or (private.has_role(org,array['tutor']) and sess.tutor_id=private.staff_id())) then raise exception 'Akses tidak dibenarkan' using errcode='42501';end if;
 if sess.review_status in ('verified','approved','paid') or sess.status in ('cancelled','rescheduled') or length(trim(reason))<5 then raise exception 'Sesi dikunci atau sebab tidak sah';end if;
 if new_status not in ('cancelled','rescheduled') then raise exception 'Status tidak sah';end if;
 if new_status='rescheduled' and new_start is null then raise exception 'Nyatakan masa baharu';end if;
 if new_status='rescheduled' and exists(select 1 from public.attendance a where a.organization_id=org and a.session_id=sid) then raise exception 'Kehadiran sudah direkod; tarikh tidak boleh diubah';end if;
 update public.class_sessions set status=new_status,source_reference=coalesce(source_reference,'manual:'||id::text) where id=sid;
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)values(org,auth.uid(),upper(new_status),'class_sessions',sid,jsonb_build_object('reason',reason));
 if new_status='rescheduled' then result:=private.create_session(org,sess.class_id,sess.tutor_id,new_start,(extract(epoch from(sess.ends_at-sess.starts_at))/60)::integer,sess.topic);else result:=sid;end if;
 return result;
end $$;
notify pgrst, 'reload schema';
