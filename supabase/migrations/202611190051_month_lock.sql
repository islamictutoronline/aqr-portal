-- Migrasi 51: rekod bulan dikunci selepas tutor menekan Selesai (keputusan pengguna 19 Nov 2026).
-- 1) Kehadiran pada sesi bulan yang sudah Selesai (tutor sesi itu) tidak boleh ditambah, diubah atau
--    dipadam; sesi yang sudah direkod tidak boleh dialih, dibatal, dipindah atau dipadam. Sesi berjadual
--    yang belum direkod tidak terjejas. Sesi kerja penyelenggaraan tanpa pengguna (SQL Editor) dikecualikan.
-- 2) reopen_tutor_month: pemilik/admin membuka semula bulan itu supaya tutor boleh membetulkan rekod;
--    ditolak jika elaun bulan itu sudah direkod dibayar (batalkan rekod bayaran dahulu).
-- 3) close_tutor_month: butang dibuka pada hari terakhir bulan; boleh ditekan pada bulan berikutnya.
-- Boleh dijalankan semula.

create or replace function private.month_closed(org uuid,staff uuid,at_time timestamptz) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tutor_month_closures k where k.organization_id=org and k.staff_id=staff
  and k.period=to_char(at_time at time zone 'Asia/Kuala_Lumpur','YYYY-MM'))
$$;
revoke all on function private.month_closed(uuid,uuid,timestamptz) from public, anon;

create or replace function private.month_locked_error(at_time timestamptz) returns void language plpgsql immutable set search_path='' as $$
begin
 raise exception 'Rekod bulan % sudah dikunci kerana tutor telah menekan Selesai. Minta admin Buka semula untuk membuat pembetulan.',
  to_char(at_time at time zone 'Asia/Kuala_Lumpur','MM/YYYY');
end $$;
revoke all on function private.month_locked_error(timestamptz) from public, anon;

create or replace function private.enforce_month_lock_attendance() returns trigger language plpgsql security definer set search_path='' as $$
declare sess public.class_sessions;
begin
 if auth.uid() is null then return coalesce(new,old); end if;
 select * into sess from public.class_sessions where id=coalesce(new.session_id,old.session_id);
 if sess.id is not null and private.month_closed(sess.organization_id,sess.tutor_id,sess.starts_at) then
  perform private.month_locked_error(sess.starts_at); end if;
 return coalesce(new,old);
end $$;
drop trigger if exists attendance_month_lock on public.attendance;
create trigger attendance_month_lock before insert or update or delete on public.attendance
 for each row execute function private.enforce_month_lock_attendance();

create or replace function private.enforce_month_lock_session() returns trigger language plpgsql security definer set search_path='' as $$
declare recorded boolean;
begin
 if auth.uid() is null then return coalesce(new,old); end if;
 recorded:=exists(select 1 from public.attendance a where a.session_id=old.id);
 if not recorded then return coalesce(new,old); end if;
 if tg_op='DELETE' then
  if private.month_closed(old.organization_id,old.tutor_id,old.starts_at) then perform private.month_locked_error(old.starts_at); end if;
  return old;
 end if;
 if (new.starts_at,new.ends_at,new.status,new.class_id,new.tutor_id,new.extra) is not distinct from
    (old.starts_at,old.ends_at,old.status,old.class_id,old.tutor_id,old.extra) then return new; end if;
 if private.month_closed(old.organization_id,old.tutor_id,old.starts_at) then perform private.month_locked_error(old.starts_at); end if;
 if private.month_closed(new.organization_id,new.tutor_id,new.starts_at) then perform private.month_locked_error(new.starts_at); end if;
 return new;
end $$;
drop trigger if exists class_sessions_month_lock on public.class_sessions;
create trigger class_sessions_month_lock before update or delete on public.class_sessions
 for each row execute function private.enforce_month_lock_session();

-- Buka semula oleh pemilik/admin.
create or replace function private.reopen_tutor_month(org uuid,staff_id uuid,period text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform private.require_role(org,array['owner','admin']);
 if period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Bulan tidak sah'; end if;
 if exists(select 1 from public.tutor_month_payments p where p.organization_id=org and p.staff_id=reopen_tutor_month.staff_id
   and p.period=reopen_tutor_month.period and p.status='paid') then
  raise exception 'Elaun bulan ini sudah direkod dibayar. Batalkan rekod bayaran dahulu sebelum Buka semula.'; end if;
 delete from public.tutor_month_closures k where k.organization_id=org and k.staff_id=reopen_tutor_month.staff_id and k.period=reopen_tutor_month.period
  returning id into result;
 if result is null then raise exception 'Bulan ini belum ditanda Selesai'; end if;
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
  values(org,auth.uid(),'REOPEN_MONTH','staff_profiles',reopen_tutor_month.staff_id,jsonb_build_object('period',period));
 return result;
end $$;
create or replace function public.reopen_tutor_month(org uuid,staff_id uuid,period text) returns uuid language sql security invoker set search_path='' as $$select private.reopen_tutor_month(org,staff_id,period)$$;
revoke all on function private.reopen_tutor_month(uuid,uuid,text) from public;
grant execute on function private.reopen_tutor_month(uuid,uuid,text) to authenticated;
revoke all on function public.reopen_tutor_month(uuid,uuid,text) from public,anon;
grant execute on function public.reopen_tutor_month(uuid,uuid,text) to authenticated;

-- Selesai dibuka pada hari terakhir bulan (berasaskan migrasi 50).
create or replace function private.close_tutor_month(org uuid,period text) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid; m_start date; last_day date; today date:=(now() at time zone 'Asia/Kuala_Lumpur')::date; n integer; result uuid;
begin
 if not private.has_role(org,array['owner','admin','tutor']) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 me:=private.staff_id();
 if me is null then raise exception 'Akaun tutor tidak ditemui'; end if;
 if period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Bulan tidak sah'; end if;
 m_start:=(period||'-01')::date;
 last_day:=(m_start+interval '1 month')::date-1;
 if m_start>today then raise exception 'Bulan ini belum bermula'; end if;
 if today<last_day then
  raise exception 'Butang Selesai dibuka pada hari terakhir bulan (%)',to_char(last_day,'DD/MM/YYYY'); end if;
 select count(*)::int into n from public.class_sessions s
  where s.organization_id=org and s.tutor_id=me and s.status='completed'
   and date_trunc('month',s.starts_at at time zone 'Asia/Kuala_Lumpur')=m_start::timestamp
   and exists(select 1 from public.attendance a where a.session_id=s.id and a.status in ('present','late','makeup','absent'));
 insert into public.tutor_month_closures(organization_id,staff_id,period,sessions,closed_by)
  values(org,me,period,n,auth.uid())
  on conflict on constraint tutor_month_closures_organization_id_staff_id_period_key do nothing
  returning id into result;
 if result is null then raise exception 'Bulan ini sudah ditanda Selesai'; end if;
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
  values(org,auth.uid(),'CLOSE_MONTH','staff_profiles',me,jsonb_build_object('period',period,'sessions',n));
 return result;
end $$;

notify pgrst, 'reload schema';
