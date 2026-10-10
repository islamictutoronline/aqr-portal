-- Satu peranan Admin menggantikan admin akademik dan admin kewangan.
-- Polisi/fungsi lama yang menyemak 'academic_admin' atau 'finance_admin' kekal sah:
-- has_role menganggap 'admin' memenuhi kedua-duanya. Maker-checker tetap memerlukan dua orang berbeza.
alter table public.staff_memberships drop constraint staff_memberships_role_check;
update public.staff_memberships set role='admin', updated_at=now() where role in ('academic_admin','finance_admin');
alter table public.staff_memberships add constraint staff_memberships_role_check check(role in ('owner','admin','tutor'));
create or replace function private.has_role(org uuid, roles text[]) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.staff_memberships m join public.staff_profiles p on p.id=m.staff_id where m.organization_id=org and m.active and p.active and p.auth_user_id=auth.uid()
  and (m.role=any(roles) or (m.role='admin' and roles && array['admin','academic_admin','finance_admin']::text[])))
$$;
