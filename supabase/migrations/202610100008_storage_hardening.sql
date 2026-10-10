-- Browser uploads cannot bypass server byte-sniffing. Server storage capability
-- is used only after an authenticated, organization-scoped lookup.
drop policy proof_insert on storage.objects;
drop policy logo_insert on storage.objects;
drop policy evidence_insert on public.payment_evidence;
create policy evidence_insert on public.payment_evidence for insert to authenticated with check(uploaded_by=auth.uid() and private.can_payment(organization_id,payment_id) and path like organization_id::text||'/'||payment_id::text||'/%' and path !~ '\.\.' and exists(select 1 from public.payments p where p.id=payment_evidence.payment_id and p.organization_id=payment_evidence.organization_id and p.status='pending_verification'));
drop policy mastery_read on public.student_skill_levels;
create policy mastery_read on public.student_skill_levels for select to authenticated using(private.has_role(organization_id,array['owner','academic_admin']) or private.owns_student(organization_id,student_id) or exists(select 1 from public.enrollments e where e.organization_id=student_skill_levels.organization_id and e.student_id=student_skill_levels.student_id and private.teaches_class(e.organization_id,e.class_id,current_date)));
