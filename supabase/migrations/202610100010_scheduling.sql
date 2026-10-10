alter table public.classes add constraint one_to_one_capacity check(mode<>'one_to_one' or max_capacity=1);
create function private.generate_schedule(org uuid, schedule uuid, tutor uuid, date_from date, date_to date) returns integer language plpgsql security definer set search_path='' as $$
declare rule public.class_schedules; day date; result integer:=0; begin
 perform private.require_role(org,array['owner','academic_admin']);
 if date_to<date_from or date_to-date_from>62 then raise exception 'Pilih julat maksimum 62 hari';end if;
 select * into rule from public.class_schedules where organization_id=org and id=schedule;
 if rule.id is null then raise exception 'Jadual tidak ditemui';end if;
 for day in select d::date from generate_series(date_from::timestamp,date_to::timestamp,'1 day') d loop
 if extract(dow from day)=rule.day_of_week and day>=rule.effective_from and (rule.effective_to is null or day<=rule.effective_to) and not (rule.exceptions @> jsonb_build_array(day::text)) then
 perform private.create_session(org,rule.class_id,tutor,(day+rule.start_time) at time zone 'Asia/Kuala_Lumpur',rule.duration_minutes,'');result:=result+1;
 end if;
 end loop;return result;
end $$;
create function public.generate_schedule(org uuid,schedule uuid,tutor uuid,date_from date,date_to date)returns integer language sql security invoker set search_path='' as $$ select private.generate_schedule(org,schedule,tutor,date_from,date_to) $$;
create function private.change_session(org uuid,sid uuid,new_status text,reason text,new_start timestamptz default null)returns uuid language plpgsql security definer set search_path='' as $$
declare sess public.class_sessions;result uuid; begin
 perform private.require_role(org,array['owner','academic_admin']);
 select * into sess from public.class_sessions where organization_id=org and id=sid for update;
 if sess.id is null or sess.review_status in ('verified','approved','paid') or sess.status in ('cancelled','rescheduled') or length(trim(reason))<5 then raise exception 'Sesi dikunci atau sebab tidak sah';end if;
 if new_status not in ('cancelled','rescheduled') then raise exception 'Status tidak sah';end if;
 if new_status='rescheduled' and new_start is null then raise exception 'Nyatakan masa baharu';end if;
 update public.class_sessions set status=new_status,source_reference=coalesce(source_reference,'manual:'||id::text) where id=sid;
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)values(org,auth.uid(),upper(new_status),'class_sessions',sid,jsonb_build_object('reason',reason));
 if new_status='rescheduled' then result:=private.create_session(org,sess.class_id,sess.tutor_id,new_start,(extract(epoch from(sess.ends_at-sess.starts_at))/60)::integer,sess.topic);else result:=sid;end if;
 return result;
end $$;
create function public.change_session(org uuid,sid uuid,new_status text,reason text,new_start timestamptz default null)returns uuid language sql security invoker set search_path='' as $$select private.change_session(org,sid,new_status,reason,new_start)$$;
revoke all on function private.generate_schedule(uuid,uuid,uuid,date,date),private.change_session(uuid,uuid,text,text,timestamptz) from public;
grant execute on function private.generate_schedule(uuid,uuid,uuid,date,date),private.change_session(uuid,uuid,text,text,timestamptz) to authenticated;
revoke all on function public.generate_schedule(uuid,uuid,uuid,date,date),public.change_session(uuid,uuid,text,text,timestamptz) from public,anon;
grant execute on function public.generate_schedule(uuid,uuid,uuid,date,date),public.change_session(uuid,uuid,text,text,timestamptz) to authenticated;
