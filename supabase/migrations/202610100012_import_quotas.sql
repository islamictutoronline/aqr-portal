create table public.private_import_quotas (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),batch_id uuid not null,source_row integer not null,
 reported_name text,program_code text not null,duration_minutes integer not null,planned_count integer not null check(planned_count>=0),note text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),unique(batch_id,source_row),
 foreign key(organization_id,batch_id)references public.private_import_batches(organization_id,id)
);
alter table public.private_import_quotas enable row level security;
grant select on public.private_import_quotas to authenticated;
create policy quota_read on public.private_import_quotas for select to authenticated using(private.has_role(organization_id,array['owner','academic_admin']));
create index import_quota_org on public.private_import_quotas(organization_id);
create trigger audit_change after insert or update on public.private_import_quotas for each row execute function private.audit_change();
create trigger touch_updated_at before update on public.private_import_quotas for each row execute function private.touch_updated_at();
