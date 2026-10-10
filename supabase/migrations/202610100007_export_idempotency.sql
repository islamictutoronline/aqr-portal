alter table public.export_jobs add column idempotency_key text;
alter table public.export_jobs add column spreadsheet_id text;
create unique index export_idempotency on public.export_jobs(organization_id,requester_id,idempotency_key) where idempotency_key is not null;
create function private.reserve_export(org uuid, code text, query_filters jsonb, row_total integer, digest text, idem text) returns public.export_jobs language plpgsql security definer set search_path='' as $$
declare result public.export_jobs; begin
 if not private.has_role(org,array['owner','finance_admin']) then raise exception 'Akses Google tidak dibenarkan' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||auth.uid()::text||idem,0));
 select * into result from public.export_jobs where organization_id=org and requester_id=auth.uid() and idempotency_key=idem for update;
 if result.id is not null then
 if result.checksum<>digest then raise exception 'Kunci eksport tidak sepadan'; end if;
 if result.status='pending' and result.updated_at>now()-interval '2 minutes' then raise exception 'Eksport sedang diproses'; end if;
 if result.status='completed' then return result; end if;
 update public.export_jobs set status='pending',error_code=null where id=result.id returning * into result;
 else insert into public.export_jobs(organization_id,requester_id,report_type,filters,status,row_count,checksum,idempotency_key) values(org,auth.uid(),code,query_filters,'pending',row_total,digest,idem) returning * into result;
 end if; return result;
end $$;
create function public.reserve_export(org uuid,code text,query_filters jsonb,row_total integer,digest text,idem text) returns public.export_jobs language sql security invoker set search_path='' as $$ select private.reserve_export(org,code,query_filters,row_total,digest,idem) $$;
revoke all on function private.reserve_export(uuid,text,jsonb,integer,text,text) from public;
grant execute on function private.reserve_export(uuid,text,jsonb,integer,text,text) to authenticated;
revoke all on function public.reserve_export(uuid,text,jsonb,integer,text,text) from public,anon;
grant execute on function public.reserve_export(uuid,text,jsonb,integer,text,text) to authenticated;
