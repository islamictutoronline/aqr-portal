create table public.private_import_batches (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), source_digest text not null,
 period text not null, reported_count integer not null, planned_count integer not null, indicative_sen bigint not null,
 status text not null default 'needs_review' check(status in ('needs_review','reviewed','archived')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),unique(organization_id,source_digest)
);
alter table public.private_import_batches enable row level security;
grant select on public.private_import_batches to authenticated;
create policy batch_read on public.private_import_batches for select to authenticated using(private.has_role(organization_id,array['owner','academic_admin']));
alter table public.private_import_rows add column batch_id uuid;
alter table public.private_import_rows add foreign key(organization_id,batch_id)references public.private_import_batches(organization_id,id);
create index import_batch_org on public.private_import_batches(organization_id);
create trigger audit_change after insert or update on public.private_import_batches for each row execute function private.audit_change();
create trigger touch_updated_at before update on public.private_import_batches for each row execute function private.touch_updated_at();
drop policy export_update on public.export_jobs;
create policy export_update on public.export_jobs for update to authenticated using(requester_id=auth.uid()) with check(requester_id=auth.uid() and (private.has_role(organization_id,array['owner','academic_admin','finance_admin','tutor']) or exists(select 1 from public.guardians g where g.organization_id=export_jobs.organization_id and g.auth_user_id=auth.uid() and g.active)));
