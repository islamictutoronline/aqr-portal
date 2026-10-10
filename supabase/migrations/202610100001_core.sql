-- Additive initial schema. Never drop existing academy data.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.organizations (
 id uuid primary key default gen_random_uuid(), name text not null default 'Akademi Al-Quran Ar-Riyadh (AQR)', slug text not null unique,
 phone text, address text, logo_path text, status text not null default 'active' check(status in ('active','archived')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.staff_profiles (
 id uuid primary key default gen_random_uuid(), auth_user_id uuid not null unique references auth.users(id), display_name text not null,
 active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.staff_memberships (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), staff_id uuid not null references public.staff_profiles(id),
 role text not null check(role in ('owner','academic_admin','finance_admin','tutor')), active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,staff_id), unique(organization_id,id)
);
create table public.branches (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), name text not null, location text,
 timezone text not null default 'Asia/Kuala_Lumpur', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id)
);
create table public.guardians (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), auth_user_id uuid references auth.users(id),
 full_name text not null, phone text check(phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'), email text,
 active boolean not null default true, consent_at timestamptz, preference text not null default 'email',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), unique(organization_id,auth_user_id)
);
create table public.students (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), full_name text not null, preferred_name text,
 birth_date date, status text not null default 'active' check(status in ('active','paused','archived')), registration_date date not null default current_date,
 consent_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id)
);
create table public.student_guardians (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), student_id uuid not null, guardian_id uuid not null,
 relation text not null default 'penjaga' check(relation in ('ibu','bapa','penjaga')), portal_allowed boolean not null default true, is_billing_contact boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), unique(student_id,guardian_id),
 foreign key(organization_id,student_id) references public.students(organization_id,id), foreign key(organization_id,guardian_id) references public.guardians(organization_id,id)
);
create table public.subjects (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), slug text not null, name text not null, active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), unique(organization_id,slug)
);
create table public.programs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), subject_id uuid not null, code text not null, name text not null,
 level text, curriculum_version text not null default '1', status text not null default 'active',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), unique(organization_id,code),
 foreign key(organization_id,subject_id) references public.subjects(organization_id,id)
);
create table public.curriculum_units (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), program_id uuid not null, parent_id uuid,
 code text not null, name text not null, outcome text, skill_category text, criteria text, sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), unique(program_id,code),
 foreign key(organization_id,program_id) references public.programs(organization_id,id), foreign key(organization_id,parent_id) references public.curriculum_units(organization_id,id)
);
create table public.classes (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), branch_id uuid, program_id uuid not null, name text not null,
 mode text not null default 'group' check(mode in ('group','one_to_one')), delivery text not null default 'physical' check(delivery in ('physical','online')),
 max_capacity integer not null default 10 check(max_capacity>0), venue text, active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,branch_id) references public.branches(organization_id,id), foreign key(organization_id,program_id) references public.programs(organization_id,id)
);
create table public.class_tutors (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), class_id uuid not null, staff_id uuid not null,
 starts_on date not null default current_date, ends_on date, designation text not null default 'primary' check(designation in ('primary','backup')),
 check(ends_on is null or ends_on>=starts_on),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,class_id) references public.classes(organization_id,id), foreign key(organization_id,staff_id) references public.staff_memberships(organization_id,staff_id)
);
create table public.class_schedules (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), class_id uuid not null,
 day_of_week integer not null check(day_of_week between 0 and 6), start_time time not null, duration_minutes integer not null check(duration_minutes>0),
 effective_from date not null, effective_to date, exceptions jsonb not null default '[]',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,class_id) references public.classes(organization_id,id)
);
create table public.enrollments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), student_id uuid not null, class_id uuid not null,
 starts_on date not null default current_date, ends_on date, status text not null default 'active' check(status in ('active','completed','withdrawn')),
 planned_quota integer check(planned_quota>=0), check(ends_on is null or ends_on>=starts_on),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,student_id) references public.students(organization_id,id), foreign key(organization_id,class_id) references public.classes(organization_id,id)
);
create unique index enrollments_active_unique on public.enrollments(student_id,class_id) where status='active';
create table public.class_sessions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), class_id uuid not null, tutor_id uuid not null,
 starts_at timestamptz not null, ends_at timestamptz not null, actual_start timestamptz, actual_end timestamptz,
 status text not null default 'scheduled' check(status in ('scheduled','completed','cancelled','rescheduled')),
 review_status text not null default 'reported' check(review_status in ('reported','needs_review','verified','approved','paid')),
 topic text, materials text, source_reference text, verified_by uuid, verified_at timestamptz, approved_by uuid, approved_at timestamptz,
 check(ends_at>starts_at), check(review_status not in ('verified','approved','paid') or (verified_by is not null and verified_at is not null and status='completed')),
 check(review_status not in ('approved','paid') or (approved_by is not null and approved_at is not null and approved_by<>verified_by)),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), unique(class_id,starts_at), unique(organization_id,source_reference),
 foreign key(organization_id,class_id) references public.classes(organization_id,id), foreign key(organization_id,tutor_id) references public.staff_memberships(organization_id,staff_id),
 foreign key(organization_id,verified_by) references public.staff_memberships(organization_id,staff_id), foreign key(organization_id,approved_by) references public.staff_memberships(organization_id,staff_id)
);
create table public.attendance (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), session_id uuid not null, student_id uuid not null,
 status text not null check(status in ('present','late','absent','excused','makeup')), reason text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), unique(session_id,student_id),
 foreign key(organization_id,session_id) references public.class_sessions(organization_id,id), foreign key(organization_id,student_id) references public.students(organization_id,id)
);
create table public.assessment_options (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), subject_id uuid not null,
 group_code text not null check(group_code in ('skill','mastery','participation','focus','home_practice')), code text not null, label text not null,
 rubric_version text not null default '1', sort_order integer not null default 0, active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), unique(subject_id,group_code,code,rubric_version),
 foreign key(organization_id,subject_id) references public.subjects(organization_id,id)
);
create table public.assessment_responses (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), session_id uuid not null, student_id uuid not null,
 skill text not null, mastery integer check(mastery between 1 and 5), participation text, focus text, home_practice text, rubric_version text not null default '1', actor_id uuid not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), unique(session_id,student_id,skill),
 foreign key(organization_id,session_id) references public.class_sessions(organization_id,id), foreign key(organization_id,student_id) references public.students(organization_id,id),
 foreign key(organization_id,actor_id) references public.staff_memberships(organization_id,staff_id)
);
create table public.comment_templates (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), subject_id uuid not null,
 version text not null, template text not null, allowed_tokens jsonb not null default '[]', effective_from date not null default current_date,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), unique(subject_id,version),
 foreign key(organization_id,subject_id) references public.subjects(organization_id,id)
);
create table public.generated_parent_comments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), session_id uuid not null, student_id uuid not null,
 selections jsonb not null, template_version text not null, text text not null, status text not null default 'draft' check(status in ('draft','published','retracted')),
 published_by uuid, published_at timestamptz, revision_of uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,session_id) references public.class_sessions(organization_id,id), foreign key(organization_id,student_id) references public.students(organization_id,id),
 foreign key(organization_id,published_by) references public.staff_memberships(organization_id,staff_id), foreign key(organization_id,revision_of) references public.generated_parent_comments(organization_id,id),
 check(status<>'published' or (published_by is not null and published_at is not null))
);
create table public.student_progress (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), session_id uuid not null, student_id uuid not null, curriculum_unit_id uuid,
 mastery integer check(mastery between 1 and 5), achievement text, reading_from text, reading_to text, parent_notes text, homework text, next_goal text,
 published_at timestamptz, recorded_by uuid not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,session_id) references public.class_sessions(organization_id,id), foreign key(organization_id,student_id) references public.students(organization_id,id),
 foreign key(organization_id,curriculum_unit_id) references public.curriculum_units(organization_id,id), foreign key(organization_id,recorded_by) references public.staff_memberships(organization_id,staff_id)
);
create table public.student_skill_levels (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), student_id uuid not null, program_id uuid not null, curriculum_unit_id uuid not null,
 mastery integer not null check(mastery between 1 and 5), evidence_progress_id uuid not null, last_assessed timestamptz not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), unique(student_id,curriculum_unit_id),
 foreign key(organization_id,student_id) references public.students(organization_id,id), foreign key(organization_id,program_id) references public.programs(organization_id,id),
 foreign key(organization_id,curriculum_unit_id) references public.curriculum_units(organization_id,id), foreign key(organization_id,evidence_progress_id) references public.student_progress(organization_id,id)
);
create table public.student_private_notes (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), student_id uuid not null, session_id uuid, text text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,student_id) references public.students(organization_id,id), foreign key(organization_id,session_id) references public.class_sessions(organization_id,id)
);
create table public.fee_plans (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), name text not null,
 basis text not null check(basis in ('monthly','per_session','package')), amount_sen bigint not null check(amount_sen>=0), due_day integer check(due_day between 1 and 28), policy text, active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id)
);
create table public.fee_assignments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), enrollment_id uuid not null, fee_plan_id uuid not null,
 override_sen bigint check(override_sen>=0), effective_from date not null, effective_to date,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,enrollment_id) references public.enrollments(organization_id,id), foreign key(organization_id,fee_plan_id) references public.fee_plans(organization_id,id)
);
create table public.invoices (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), guardian_id uuid not null,
 number text not null, issued_on date not null, due_on date not null, period text not null, total_sen bigint not null check(total_sen>=0),
 status text not null default 'issued' check(status in ('draft','issued','partially_paid','paid','void','overdue')), idempotency_key text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), unique(organization_id,number), unique(organization_id,idempotency_key),
 foreign key(organization_id,guardian_id) references public.guardians(organization_id,id)
);
create table public.invoice_items (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), invoice_id uuid not null, student_id uuid not null, enrollment_id uuid,
 description text not null, quantity integer not null check(quantity>0), unit_price_sen bigint not null check(unit_price_sen>=0), discount_sen bigint not null default 0 check(discount_sen>=0),
 total_sen bigint generated always as (quantity*unit_price_sen-discount_sen) stored, check(quantity*unit_price_sen>=discount_sen),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,invoice_id) references public.invoices(organization_id,id), foreign key(organization_id,student_id) references public.students(organization_id,id),
 foreign key(organization_id,enrollment_id) references public.enrollments(organization_id,id)
);
create table public.payments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), guardian_id uuid not null, paid_on date not null,
 method text not null check(method in ('cash','bank_transfer','duitnow_qr','other')), amount_sen bigint not null check(amount_sen>0), reference text,
 status text not null default 'pending_verification' check(status in ('pending_verification','verified','rejected','reversed')),
 verified_by uuid, verified_at timestamptz, idempotency_key text not null, reversal_reason text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), unique(organization_id,idempotency_key),
 foreign key(organization_id,guardian_id) references public.guardians(organization_id,id), foreign key(organization_id,verified_by) references public.staff_memberships(organization_id,staff_id),
 check(status<>'verified' or (verified_by is not null and verified_at is not null))
);
create table public.payment_allocations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), payment_id uuid not null, invoice_id uuid not null,
 amount_sen bigint not null check(amount_sen>0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(payment_id,invoice_id), foreign key(organization_id,payment_id) references public.payments(organization_id,id),
 foreign key(organization_id,invoice_id) references public.invoices(organization_id,id)
);
create table public.payment_evidence (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), payment_id uuid not null,
 path text not null unique, content_type text not null check(content_type in ('image/jpeg','image/png','application/pdf')), size_bytes bigint not null check(size_bytes between 1 and 5242880), uploaded_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), foreign key(organization_id,payment_id) references public.payments(organization_id,id)
);
create table public.receipts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), payment_id uuid not null,
 number text not null, details jsonb not null, status text not null default 'valid' check(status in ('valid','void')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), unique(payment_id), unique(organization_id,number),
 foreign key(organization_id,payment_id) references public.payments(organization_id,id)
);
-- Reserved, not exposed and not enabled as an authentication flow in this release.
create table public.guardian_invitations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), guardian_id uuid not null, token_digest text not null unique,
 expires_at timestamptz not null, redeemed_at timestamptz, revoked_at timestamptz, created_by uuid not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), foreign key(organization_id,guardian_id) references public.guardians(organization_id,id),
 foreign key(organization_id,created_by) references public.staff_memberships(organization_id,staff_id)
);
create table public.guardian_sessions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), guardian_id uuid not null, token_digest text not null unique,
 expires_at timestamptz not null, last_used_at timestamptz, revoked_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), foreign key(organization_id,guardian_id) references public.guardians(organization_id,id)
);
create table public.tutor_allowance_rates (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), program_code text not null,
 duration_minutes integer not null check(duration_minutes>0), amount_sen bigint not null check(amount_sen>0), effective_from date not null, effective_to date,
 payout_basis text not null default 'class_session' check(payout_basis='class_session'), source text not null, created_by uuid not null,
 check(effective_to is null or effective_to>=effective_from),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,created_by) references public.staff_memberships(organization_id,staff_id)
);
create table public.tutor_payout_batches (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), period text not null,
 status text not null default 'draft' check(status in ('draft','review','approved','paid','void')), total_sen bigint not null check(total_sen>=0),
 maker_id uuid not null, checker_id uuid, approved_at timestamptz, reference text, check(checker_id is null or checker_id<>maker_id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), unique(organization_id,period),
 foreign key(organization_id,maker_id) references public.staff_memberships(organization_id,staff_id), foreign key(organization_id,checker_id) references public.staff_memberships(organization_id,staff_id)
);
create table public.tutor_allowance_entries (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), session_id uuid not null, tutor_id uuid not null, rate_id uuid not null,
 rate_snapshot_sen bigint not null check(rate_snapshot_sen>0), amount_sen bigint not null check(amount_sen>0), status text not null check(status in ('verified','approved','paid')),
 verified_by uuid not null, approved_by uuid, batch_id uuid, check(approved_by is null or approved_by<>verified_by),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), unique(session_id),
 foreign key(organization_id,session_id) references public.class_sessions(organization_id,id), foreign key(organization_id,tutor_id) references public.staff_memberships(organization_id,staff_id),
 foreign key(organization_id,rate_id) references public.tutor_allowance_rates(organization_id,id), foreign key(organization_id,batch_id) references public.tutor_payout_batches(organization_id,id),
 foreign key(organization_id,verified_by) references public.staff_memberships(organization_id,staff_id), foreign key(organization_id,approved_by) references public.staff_memberships(organization_id,staff_id)
);
create table public.tutor_payouts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), batch_id uuid not null, tutor_id uuid not null,
 amount_sen bigint not null check(amount_sen>0), reference text not null, paid_at timestamptz not null default now(), confirmed_by uuid not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), unique(batch_id,tutor_id),
 foreign key(organization_id,batch_id) references public.tutor_payout_batches(organization_id,id), foreign key(organization_id,tutor_id) references public.staff_memberships(organization_id,staff_id),
 foreign key(organization_id,confirmed_by) references public.staff_memberships(organization_id,staff_id)
);
create table public.tutor_adjustments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), tutor_id uuid not null, entry_id uuid not null,
 amount_sen bigint not null check(amount_sen<>0), reason text not null, maker_id uuid not null, checker_id uuid, check(checker_id is null or maker_id<>checker_id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,tutor_id) references public.staff_memberships(organization_id,staff_id), foreign key(organization_id,entry_id) references public.tutor_allowance_entries(organization_id,id),
 foreign key(organization_id,maker_id) references public.staff_memberships(organization_id,staff_id), foreign key(organization_id,checker_id) references public.staff_memberships(organization_id,staff_id)
);
create table public.audit_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), actor_id uuid references auth.users(id), operation text not null,
 object_type text not null, object_id uuid, delta jsonb not null default '{}', correlation_id uuid not null default gen_random_uuid(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id)
);
create table public.export_jobs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), requester_id uuid not null references auth.users(id),
 report_type text not null, filters jsonb not null, schema_version text not null default '1', status text not null check(status in ('pending','completed','failed')),
 row_count integer, checksum text, spreadsheet_url text, error_code text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id)
);
create table public.google_connections (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), auth_user_id uuid not null references auth.users(id),
 encrypted_tokens text not null, scope text not null, revoked_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), unique(organization_id,auth_user_id)
);
create table public.private_import_rows (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), source_key text not null, reported_name text,
 program_code text not null, duration_minutes integer not null, reported_date date, planned_quota integer, note text,
 status text not null default 'needs_review' check(status in ('needs_review','mapped','rejected')), student_id uuid, session_id uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), unique(organization_id,source_key),
 foreign key(organization_id,student_id) references public.students(organization_id,id), foreign key(organization_id,session_id) references public.class_sessions(organization_id,id)
);

create function private.staff_id() returns uuid language sql stable security definer set search_path='' as $$
 select id from public.staff_profiles where auth_user_id=auth.uid() and active
$$;
create function private.has_role(org uuid, roles text[]) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.staff_memberships m join public.staff_profiles p on p.id=m.staff_id where m.organization_id=org and m.active and p.active and p.auth_user_id=auth.uid() and m.role=any(roles))
$$;
create function private.is_guardian(org uuid, gid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.guardians where id=gid and organization_id=org and active and auth_user_id=auth.uid())
$$;
create function private.owns_student(org uuid, sid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.student_guardians sg join public.guardians g on g.id=sg.guardian_id and g.organization_id=sg.organization_id where sg.organization_id=org and sg.student_id=sid and sg.portal_allowed and g.active and g.auth_user_id=auth.uid())
$$;
create function private.teaches_class(org uuid, cid uuid, day date) returns boolean language sql stable security definer set search_path='' as $$
 select private.has_role(org,array['tutor']) and exists(select 1 from public.class_tutors where organization_id=org and class_id=cid and staff_id=private.staff_id() and starts_on<=day and (ends_on is null or ends_on>=day))
$$;
create function private.can_class(org uuid, cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.has_role(org,array['owner','academic_admin']) or private.teaches_class(org,cid,current_date) or exists(select 1 from public.enrollments e where e.organization_id=org and e.class_id=cid and private.owns_student(org,e.student_id))
$$;
create function private.can_student(org uuid, sid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.has_role(org,array['owner','academic_admin','finance_admin']) or private.owns_student(org,sid) or exists(select 1 from public.enrollments e where e.organization_id=org and e.student_id=sid and e.status='active' and private.teaches_class(org,e.class_id,current_date))
$$;
create function private.can_session(org uuid, sess uuid, write_access boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.class_sessions s where s.id=sess and s.organization_id=org and (private.has_role(org,array['owner','academic_admin']) or private.teaches_class(org,s.class_id,(s.starts_at at time zone 'Asia/Kuala_Lumpur')::date) or (not write_access and private.can_class(org,s.class_id))))
$$;
create function private.can_invoice(org uuid, inv uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.invoices i where i.organization_id=org and i.id=inv and (private.has_role(org,array['owner','finance_admin']) or (i.status<>'draft' and private.is_guardian(org,i.guardian_id))))
$$;
create function private.can_payment(org uuid, pid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.payments p where p.organization_id=org and p.id=pid and (private.has_role(org,array['owner','finance_admin']) or private.is_guardian(org,p.guardian_id)))
$$;

-- Every exposed table defaults to no privileges and no policy.
do $$ declare t record; begin for t in select tablename from pg_tables where schemaname='public' loop
 execute format('alter table public.%I enable row level security',t.tablename);
 execute format('revoke all on public.%I from anon, authenticated',t.tablename);
 execute format('grant select, insert, update on public.%I to authenticated',t.tablename);
 if t.tablename not in ('guardian_invitations','guardian_sessions','google_connections') then
 execute format('create index on public.%I (created_at)',t.tablename);
 end if;
 end loop; end $$;
create policy org_read on public.organizations for select to authenticated using(private.has_role(id,array['owner','academic_admin','finance_admin','tutor']) or exists(select 1 from public.guardians g where g.organization_id=id and g.auth_user_id=auth.uid() and g.active));
create policy org_update on public.organizations for update to authenticated using(private.has_role(id,array['owner'])) with check(private.has_role(id,array['owner']));
create policy profiles_read on public.staff_profiles for select to authenticated using(auth_user_id=auth.uid() or exists(select 1 from public.staff_memberships m where m.staff_id=id and private.has_role(m.organization_id,array['owner','academic_admin'])));
create policy membership_read on public.staff_memberships for select to authenticated using(staff_id=private.staff_id() or private.has_role(organization_id,array['owner','academic_admin']));
create policy student_read on public.students for select to authenticated using(private.can_student(organization_id,id));
create policy guardian_read on public.guardians for select to authenticated using(private.has_role(organization_id,array['owner','academic_admin','finance_admin']) or private.is_guardian(organization_id,id));
create policy links_read on public.student_guardians for select to authenticated using(private.has_role(organization_id,array['owner','academic_admin','finance_admin']) or private.is_guardian(organization_id,guardian_id));
create policy class_read on public.classes for select to authenticated using(private.can_class(organization_id,id));
create policy tutor_assignment_read on public.class_tutors for select to authenticated using(private.has_role(organization_id,array['owner','academic_admin']) or staff_id=private.staff_id());
create policy schedule_read on public.class_schedules for select to authenticated using(private.can_class(organization_id,class_id));
create policy enrollment_read on public.enrollments for select to authenticated using(private.has_role(organization_id,array['owner','academic_admin','finance_admin']) or private.owns_student(organization_id,student_id) or private.teaches_class(organization_id,class_id,current_date));
create policy session_read on public.class_sessions for select to authenticated using(private.can_session(organization_id,id) or private.has_role(organization_id,array['finance_admin']));
do $$ declare tn text; begin
 foreach tn in array array['branches','subjects','programs','curriculum_units','assessment_options','comment_templates'] loop
 execute format('create policy reference_read on public.%I for select to authenticated using(private.has_role(organization_id,array[''owner'',''academic_admin'',''finance_admin'',''tutor'']) or exists(select 1 from public.guardians g where g.organization_id=%I.organization_id and g.auth_user_id=auth.uid() and g.active))',tn,tn);
 end loop;
 foreach tn in array array['branches','students','guardians','student_guardians','subjects','programs','curriculum_units','classes','class_tutors','class_schedules','enrollments','assessment_options','comment_templates','private_import_rows'] loop
 execute format('create policy academic_insert on public.%I for insert to authenticated with check(private.has_role(organization_id,array[''owner'',''academic_admin'']))',tn);
 execute format('create policy academic_update on public.%I for update to authenticated using(private.has_role(organization_id,array[''owner'',''academic_admin''])) with check(private.has_role(organization_id,array[''owner'',''academic_admin'']))',tn);
 end loop;
 foreach tn in array array['attendance','assessment_responses'] loop
 execute format('create policy academic_read on public.%I for select to authenticated using(private.has_role(organization_id,array[''owner'',''academic_admin'']) or (private.can_session(organization_id,session_id,true) and private.can_student(organization_id,student_id)) or private.owns_student(organization_id,student_id))',tn);
 end loop;
end $$;
create policy progress_read on public.student_progress for select to authenticated using(private.can_session(organization_id,session_id,true) or (published_at is not null and private.owns_student(organization_id,student_id)));
create policy comments_read on public.generated_parent_comments for select to authenticated using(private.can_session(organization_id,session_id,true) or (status='published' and private.owns_student(organization_id,student_id)));
create policy mastery_read on public.student_skill_levels for select to authenticated using(private.can_student(organization_id,student_id));
create policy notes_read on public.student_private_notes for select to authenticated using(private.has_role(organization_id,array['owner','academic_admin']) or (session_id is not null and private.can_session(organization_id,session_id,true)));
create policy invoice_read on public.invoices for select to authenticated using(private.can_invoice(organization_id,id));
create policy items_read on public.invoice_items for select to authenticated using(private.can_invoice(organization_id,invoice_id));
create policy payment_read on public.payments for select to authenticated using(private.can_payment(organization_id,id));
create policy allocations_read on public.payment_allocations for select to authenticated using(private.can_invoice(organization_id,invoice_id));
create policy evidence_read on public.payment_evidence for select to authenticated using(private.can_payment(organization_id,payment_id));
create policy receipt_read on public.receipts for select to authenticated using(private.can_payment(organization_id,payment_id));
do $$ declare tn text; begin
 foreach tn in array array['fee_plans','fee_assignments','tutor_allowance_rates','tutor_payout_batches','tutor_adjustments'] loop
 execute format('create policy finance_read on public.%I for select to authenticated using(private.has_role(organization_id,array[''owner'',''finance_admin'']))',tn);
 end loop;
 foreach tn in array array['fee_plans','fee_assignments'] loop
 execute format('create policy finance_insert on public.%I for insert to authenticated with check(private.has_role(organization_id,array[''owner'',''finance_admin'']))',tn);
 execute format('create policy finance_update on public.%I for update to authenticated using(private.has_role(organization_id,array[''owner'',''finance_admin''])) with check(private.has_role(organization_id,array[''owner'',''finance_admin'']))',tn);
 end loop;
 foreach tn in array array['tutor_allowance_entries','tutor_payouts'] loop
 execute format('create policy allowance_read on public.%I for select to authenticated using(private.has_role(organization_id,array[''owner'',''finance_admin'']) or (private.has_role(organization_id,array[''tutor'']) and tutor_id=private.staff_id()))',tn);
 end loop;
end $$;
create policy rates_tutor_read on public.tutor_allowance_rates for select to authenticated using(private.has_role(organization_id,array['tutor']));
create policy imports_read on public.private_import_rows for select to authenticated using(private.has_role(organization_id,array['owner','academic_admin']));
create policy audit_read on public.audit_events for select to authenticated using(private.has_role(organization_id,array['owner']));
create policy export_read on public.export_jobs for select to authenticated using(requester_id=auth.uid() and (private.has_role(organization_id,array['owner','academic_admin','finance_admin','tutor']) or exists(select 1 from public.guardians g where g.organization_id=export_jobs.organization_id and g.auth_user_id=auth.uid() and g.active)));
create policy export_insert on public.export_jobs for insert to authenticated with check(requester_id=auth.uid() and (private.has_role(organization_id,array['owner','academic_admin','finance_admin','tutor']) or exists(select 1 from public.guardians g where g.organization_id=export_jobs.organization_id and g.auth_user_id=auth.uid() and g.active)));
create policy export_update on public.export_jobs for update to authenticated using(requester_id=auth.uid()) with check(requester_id=auth.uid());
create index sessions_start_idx on public.class_sessions(organization_id,starts_at);
create index progress_student_idx on public.student_progress(organization_id,student_id,created_at);
create index invoice_due_idx on public.invoices(organization_id,due_on);
create index payment_status_idx on public.payments(organization_id,status);
create index assignments_lookup on public.class_tutors(organization_id,class_id,staff_id,starts_on);
create index guardian_lookup on public.student_guardians(organization_id,guardian_id,student_id);

create function private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name not in ('audit_events','export_jobs','google_connections','guardian_sessions','guardian_invitations') then
 insert into public.audit_events(organization_id,actor_id,operation,object_type,object_id,delta)
 values(new.organization_id,auth.uid(),tg_op,tg_table_name,new.id,jsonb_build_object('changed',true));
 end if;
 return new;
end $$;
do $$ declare tn text; begin for tn in select tablename from pg_tables where schemaname='public' and tablename not in ('organizations','staff_profiles') loop
 execute format('create trigger audit_change after insert or update on public.%I for each row execute function private.audit_change()',tn);
 end loop; end $$;
-- No parent access to raw assessment drafts.
drop policy academic_read on public.assessment_responses;
create policy assessment_read on public.assessment_responses for select to authenticated using(private.can_session(organization_id,session_id,true));
revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;
