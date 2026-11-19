-- Migrasi 50: sesi dikira ikut bulan, bukan minggu (keputusan pengguna 19 Nov 2026).
-- 1) classes.sessions_per_month: kuota sesi sebulan (1–31). Jadual mingguan kekal sebagai masa kelas,
--    tetapi rekod ke-(N+1) dalam bulan yang sama ditolak. Hadir, Lewat, Ganti dan Tidak hadir dikira
--    (sama seperti yuran/elaun); Cuti bermaklum tidak dikira, jadi tutor boleh menggantikannya.
--    Kelas sedia ada: 4 × bilangan slot mingguan aktif. Rekod lama tidak disentuh.
--    Sesi tambahan (class_sessions.extra): tutor mengesahkan sesi melebihi kuota (cth. 5/4); sesi itu
--    dibenarkan dan dikira seperti biasa — tutor dibayar, ibu bapa dicaj.
-- 2) tutor_month_closures: tutor menekan "Selesai" bagi bulannya (satu butang untuk semua murid).
--    Rekod tidak dikunci. Elaun bulan itu hanya boleh direkod dibayar selepas tutor menekan Selesai.
-- Boleh dijalankan semula.

alter table public.classes add column if not exists sessions_per_month integer
 check(sessions_per_month between 1 and 31);
alter table public.class_sessions add column if not exists extra boolean not null default false;
update public.classes c set sessions_per_month=4*least(7,greatest(1,(select count(*)::int from public.class_schedules r
  where r.organization_id=c.organization_id and r.class_id=c.id and (r.effective_to is null or r.effective_to>=current_date))))
 where c.sessions_per_month is null;

-- Kuota kelas bagi bulan tarikh `day`. Tanpa nilai: 4 × slot mingguan yang aktif dalam bulan itu.
create or replace function private.class_quota(org uuid,cid uuid,day date) returns integer language sql stable security definer set search_path='' as $$
 select coalesce(c.sessions_per_month,4*least(7,greatest(1,(select count(*)::int from public.class_schedules r
   where r.organization_id=org and r.class_id=cid
    and r.effective_from<(date_trunc('month',day::timestamp)+interval '1 month')::date
    and (r.effective_to is null or r.effective_to>=date_trunc('month',day::timestamp)::date)))))
 from public.classes c where c.organization_id=org and c.id=cid
$$;
-- Sesi kelas dalam bulan `day` yang sudah dikira dalam kuota (kecuali sesi `skip`).
create or replace function private.quota_used(org uuid,cid uuid,day date,skip uuid) returns integer language sql stable security definer set search_path='' as $$
 select count(*)::int from public.class_sessions s
 where s.organization_id=org and s.class_id=cid and s.id is distinct from skip
  and s.status not in ('cancelled','rescheduled')
  and date_trunc('month',s.starts_at at time zone 'Asia/Kuala_Lumpur')=date_trunc('month',day::timestamp)
  and exists(select 1 from public.attendance a where a.session_id=s.id and a.status in ('present','late','makeup','absent'))
$$;
revoke all on function private.class_quota(uuid,uuid,date), private.quota_used(uuid,uuid,date,uuid) from public, anon;
grant execute on function private.class_quota(uuid,uuid,date), private.quota_used(uuid,uuid,date,uuid) to authenticated;

create or replace function private.quota_check(org uuid,cid uuid,sid uuid,starts timestamptz) returns void language plpgsql stable security definer set search_path='' as $$
declare day date:=(starts at time zone 'Asia/Kuala_Lumpur')::date; quota integer; used integer;
begin
 quota:=private.class_quota(org,cid,day);
 used:=private.quota_used(org,cid,day,sid);
 if quota is not null and used>=quota then
  raise exception 'Kuota % sesi sebulan bagi bulan % sudah penuh. Tandakan Cuti bermaklum, atau rekod sebagai sesi tambahan.',
   quota,to_char(day,'MM/YYYY');
 end if;
end $$;
revoke all on function private.quota_check(uuid,uuid,uuid,timestamptz) from public, anon;

-- Kehadiran yang dikira (baharu, atau bertukar daripada Cuti bermaklum) mesti dalam kuota bulan sesi.
create or replace function private.enforce_monthly_quota() returns trigger language plpgsql security definer set search_path='' as $$
declare sess public.class_sessions;
begin
 if new.status not in ('present','late','makeup','absent') then return new; end if;
 if tg_op='UPDATE' and old.status in ('present','late','makeup','absent') then return new; end if;
 select * into sess from public.class_sessions where id=new.session_id;
 if sess.id is null or sess.status in ('cancelled','rescheduled') or sess.extra then return new; end if;
 -- Sesi ini sudah dikira (rekod murid yang sama disimpan semula, atau murid lain dalam kelas berkumpulan).
 if exists(select 1 from public.attendance a where a.session_id=new.session_id and a.id<>new.id
   and a.status in ('present','late','makeup','absent')) then return new; end if;
 perform private.quota_check(sess.organization_id,sess.class_id,sess.id,sess.starts_at);
 return new;
end $$;
drop trigger if exists attendance_monthly_quota on public.attendance;
create trigger attendance_monthly_quota before insert or update of status on public.attendance
 for each row execute function private.enforce_monthly_quota();

-- Kelas yang sudah direkod dipindah ke bulan lain: bulan destinasi juga mesti ada ruang.
create or replace function private.enforce_quota_on_move() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('cancelled','rescheduled') or new.extra
  or date_trunc('month',new.starts_at at time zone 'Asia/Kuala_Lumpur')=date_trunc('month',old.starts_at at time zone 'Asia/Kuala_Lumpur')
  or not exists(select 1 from public.attendance a where a.session_id=new.id and a.status in ('present','late','makeup','absent')) then
  return new; end if;
 perform private.quota_check(new.organization_id,new.class_id,new.id,new.starts_at);
 return new;
end $$;
drop trigger if exists class_sessions_monthly_quota on public.class_sessions;
create trigger class_sessions_monthly_quota before update of starts_at on public.class_sessions
 for each row execute function private.enforce_quota_on_move();

-- Tutor mengesahkan sesi ini sebagai sesi tambahan (melebihi kuota bulan itu).
create or replace function private.mark_extra_session(org uuid,sid uuid) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not private.can_session(org,sid,true) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 update public.class_sessions s set extra=true,updated_at=now()
  where s.organization_id=org and s.id=sid and s.status not in ('cancelled','rescheduled');
 if not found then raise exception 'Sesi tidak ditemui atau dibatalkan'; end if;
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
  values(org,auth.uid(),'EXTRA_SESSION','class_sessions',sid,'{}'::jsonb);
 return sid;
end $$;
create or replace function public.mark_extra_session(org uuid,sid uuid) returns uuid language sql security invoker set search_path='' as $$select private.mark_extra_session(org,sid)$$;
revoke all on function private.mark_extra_session(uuid,uuid) from public;
grant execute on function private.mark_extra_session(uuid,uuid) to authenticated;
revoke all on function public.mark_extra_session(uuid,uuid) from public,anon;
grant execute on function public.mark_extra_session(uuid,uuid) to authenticated;

-- Tetapkan sesi sebulan: tutor kelas atau pemilik/admin.
create or replace function private.set_class_quota(org uuid,cid uuid,sessions_per_month integer) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not private.can_manage_class(org,cid) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 if sessions_per_month is null or sessions_per_month not between 1 and 31 then raise exception 'Sesi sebulan mesti antara 1 hingga 31'; end if;
 update public.classes c set sessions_per_month=set_class_quota.sessions_per_month,updated_at=now()
  where c.organization_id=org and c.id=cid;
 if not found then raise exception 'Kelas tidak ditemui'; end if;
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
  values(org,auth.uid(),'SET_QUOTA','classes',cid,jsonb_build_object('sessions_per_month',sessions_per_month));
 return cid;
end $$;
create or replace function public.set_class_quota(org uuid,cid uuid,sessions_per_month integer) returns uuid language sql security invoker set search_path='' as $$select private.set_class_quota(org,cid,sessions_per_month)$$;
revoke all on function private.set_class_quota(uuid,uuid,integer) from public;
grant execute on function private.set_class_quota(uuid,uuid,integer) to authenticated;
revoke all on function public.set_class_quota(uuid,uuid,integer) from public,anon;
grant execute on function public.set_class_quota(uuid,uuid,integer) to authenticated;

-- 2) Selesai bulan oleh tutor.
create table if not exists public.tutor_month_closures (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 staff_id uuid not null references public.staff_profiles(id),
 period text not null check(period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 sessions integer not null default 0 check(sessions>=0),
 closed_by uuid,
 closed_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 unique(organization_id,staff_id,period)
);
alter table public.tutor_month_closures enable row level security;
revoke all on public.tutor_month_closures from anon, authenticated;
grant select on public.tutor_month_closures to authenticated;
drop policy if exists tutor_month_closures_read on public.tutor_month_closures;
create policy tutor_month_closures_read on public.tutor_month_closures for select to authenticated
 using(private.has_role(organization_id,array['owner','admin']) or staff_id=private.staff_id());

-- Tutor menekan Selesai bagi bulannya: dibuka pada 7 hari terakhir bulan, atau bila-bila masa bagi bulan lepas.
-- Bilangan sesi dibayar disimpan sebagai rujukan sahaja; elaun tetap dikira daripada rekod semasa.
create or replace function private.close_tutor_month(org uuid,period text) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid; m_start date; today date:=(now() at time zone 'Asia/Kuala_Lumpur')::date; n integer; result uuid;
begin
 if not private.has_role(org,array['owner','admin','tutor']) then raise exception 'Akses tidak dibenarkan' using errcode='42501'; end if;
 me:=private.staff_id();
 if me is null then raise exception 'Akaun tutor tidak ditemui'; end if;
 if period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Bulan tidak sah'; end if;
 m_start:=(period||'-01')::date;
 if m_start>today then raise exception 'Bulan ini belum bermula'; end if;
 if today<(m_start+interval '1 month')::date-7 then
  raise exception 'Butang Selesai dibuka pada 7 hari terakhir bulan (mulai %)',to_char((m_start+interval '1 month')::date-7,'DD/MM/YYYY'); end if;
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
create or replace function public.close_tutor_month(org uuid,period text) returns uuid language sql security invoker set search_path='' as $$select private.close_tutor_month(org,period)$$;
revoke all on function private.close_tutor_month(uuid,text) from public;
grant execute on function private.close_tutor_month(uuid,text) to authenticated;
revoke all on function public.close_tutor_month(uuid,text) from public,anon;
grant execute on function public.close_tutor_month(uuid,text) to authenticated;

-- Elaun dibayar hanya selepas tutor menekan Selesai (berasaskan migrasi 35).
create or replace function private.mark_tutor_paid(org uuid,staff_id uuid,period text,amount_sen bigint,sessions integer default 0,paid_on date default null,payment_ref text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; result uuid;
begin
 actor:=private.require_role(org,array['owner','admin']);
 if not exists(select 1 from public.staff_memberships m where m.organization_id=org and m.staff_id=mark_tutor_paid.staff_id) then
  raise exception 'Tutor tidak ditemui'; end if;
 if period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Bulan tidak sah'; end if;
 if not exists(select 1 from public.tutor_month_closures k where k.organization_id=org and k.staff_id=mark_tutor_paid.staff_id and k.period=mark_tutor_paid.period) then
  raise exception 'Tutor belum menekan Selesai bagi bulan ini; elaun belum boleh dibayar'; end if;
 if amount_sen is null or amount_sen<=0 then raise exception 'Tiada elaun untuk dibayar'; end if;
 if paid_on is not null and (paid_on>current_date+1 or paid_on<current_date-730) then raise exception 'Tarikh bayaran tidak sah'; end if;
 if length(coalesce(payment_ref,''))>120 then raise exception 'Rujukan terlalu panjang'; end if;
 insert into public.tutor_month_payments(organization_id,staff_id,period,amount_sen,sessions,paid_on,reference,paid_by)
  values(org,mark_tutor_paid.staff_id,period,amount_sen,greatest(coalesce(sessions,0),0),
   coalesce(paid_on,(now() at time zone 'Asia/Kuala_Lumpur')::date),nullif(trim(payment_ref),''),actor)
  returning id into result;
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
  values(org,auth.uid(),'TUTOR_PAID','staff_profiles',mark_tutor_paid.staff_id,jsonb_build_object('period',period,'amount_sen',amount_sen));
 return result;
end $$;

notify pgrst, 'reload schema';
