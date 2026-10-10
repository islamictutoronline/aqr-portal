-- Verified passwordless sign-up grants no staff role until explicit admin approval.
create table public.tutor_applications (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 auth_user_id uuid not null references auth.users(id), display_name text not null check(length(display_name) between 2 and 120),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 reviewed_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,auth_user_id), foreign key(organization_id,reviewed_by) references public.staff_memberships(organization_id,staff_id)
);
alter table public.tutor_applications enable row level security;
grant select on public.tutor_applications to authenticated;
create policy application_read on public.tutor_applications for select to authenticated using(auth_user_id=auth.uid() or private.has_role(organization_id,array['owner','academic_admin']));
create trigger audit_change after insert or update on public.tutor_applications for each row execute function private.audit_change();

create function private.request_tutor(academy_slug text, applicant_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid; result uuid;
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Sahkan e-mel dahulu' using errcode='42501'; end if;
 select id into org from public.organizations where slug=academy_slug and status='active';
 if org is null then raise exception 'Kod akademi tidak sah'; end if;
 insert into public.tutor_applications(organization_id,auth_user_id,display_name) values(org,auth.uid(),trim(applicant_name))
 on conflict(organization_id,auth_user_id) do update set updated_at=public.tutor_applications.updated_at returning id into result;
 return result;
end $$;
create function public.request_tutor(academy_slug text,applicant_name text) returns uuid language sql security invoker set search_path='' as $$select private.request_tutor(academy_slug,applicant_name)$$;

create function private.review_tutor_application(org uuid,application uuid,accept boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.tutor_applications; profile uuid;
begin
 if not private.has_role(org,array['owner','academic_admin']) then raise exception 'Akses ditolak' using errcode='42501'; end if;
 select * into a from public.tutor_applications where id=application and organization_id=org for update;
 if a.id is null then raise exception 'Permohonan tidak ditemui'; end if;
 if a.status<>'pending' then return a.id; end if;
 if accept then
  insert into public.staff_profiles(auth_user_id,display_name) values(a.auth_user_id,a.display_name)
  on conflict(auth_user_id) do update set display_name=public.staff_profiles.display_name returning id into profile;
  -- Never replace an existing role or reactivate a revoked membership through sign-up.
  insert into public.staff_memberships(organization_id,staff_id,role) values(org,profile,'tutor') on conflict(organization_id,staff_id) do nothing;
 end if;
 update public.tutor_applications set status=case when accept then 'approved' else 'rejected' end,reviewed_by=private.staff_id(),updated_at=now() where id=a.id;
 return a.id;
end $$;
create function public.review_tutor_application(org uuid,application uuid,accept boolean) returns uuid language sql security invoker set search_path='' as $$select private.review_tutor_application(org,application,accept)$$;

-- Link only a pre-existing guardian record matching a confirmed Auth email.
create function private.claim_guardian_access() returns void language plpgsql security definer set search_path='' as $$
declare verified_email text;
begin
 select lower(email) into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if verified_email is null then raise exception 'Sahkan e-mel dahulu' using errcode='42501'; end if;
 update public.guardians g set auth_user_id=auth.uid(),updated_at=now() where lower(g.email)=verified_email and g.auth_user_id is null and g.active
 and exists(select 1 from public.student_guardians sg where sg.guardian_id=g.id and sg.organization_id=g.organization_id and sg.portal_allowed);
end $$;
create function public.claim_guardian_access() returns void language sql security invoker set search_path='' as $$select private.claim_guardian_access()$$;

create function private.tutor_register_student(org uuid,cid uuid,student_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; capacity integer;
begin
 if not private.has_role(org,array['tutor']) or not private.teaches_class(org,cid,current_date) then raise exception 'Kelas bukan tugasan tutor' using errcode='42501'; end if;
 if length(trim(student_name)) not between 2 and 200 then raise exception 'Nama tidak sah'; end if;
 select max_capacity into capacity from public.classes where id=cid and organization_id=org and active for update;
 if capacity is null then raise exception 'Kelas tidak aktif'; end if;
 if (select count(*) from public.enrollments where class_id=cid and organization_id=org and status='active' and (ends_on is null or ends_on>=current_date))>=capacity then raise exception 'Kelas penuh'; end if;
 insert into public.students(organization_id,full_name) values(org,trim(student_name)) returning id into result;
 insert into public.enrollments(organization_id,student_id,class_id) values(org,result,cid);
 -- Guardian links remain admin-controlled to prevent identity/child access reassignment by tutors.
 return result;
end $$;
create function public.tutor_register_student(org uuid,cid uuid,student_name text) returns uuid language sql security invoker set search_path='' as $$select private.tutor_register_student(org,cid,student_name)$$;
revoke all on function private.request_tutor(text,text),private.review_tutor_application(uuid,uuid,boolean),private.claim_guardian_access(),private.tutor_register_student(uuid,uuid,text) from public;
grant execute on function private.request_tutor(text,text),private.review_tutor_application(uuid,uuid,boolean),private.claim_guardian_access(),private.tutor_register_student(uuid,uuid,text) to authenticated;
revoke all on function public.request_tutor(text,text),public.review_tutor_application(uuid,uuid,boolean),public.claim_guardian_access(),public.tutor_register_student(uuid,uuid,text) from public;
grant execute on function public.request_tutor(text,text),public.review_tutor_application(uuid,uuid,boolean),public.claim_guardian_access(),public.tutor_register_student(uuid,uuid,text) to authenticated;
