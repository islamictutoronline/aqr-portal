-- Run only on disposable staging: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(3);
select extensions.is((select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),0,'Every application table enables RLS');
select extensions.is((select count(*)::integer from pg_policies where schemaname='public' and tablename in ('guardian_sessions','guardian_invitations','google_connections')),0,'Credential tables have no Data API policies');
select extensions.is((select count(*)::integer from storage.buckets where id in ('payment-proofs','academy-logos') and public),0,'Sensitive buckets remain private');
select extensions.finish();
rollback;
