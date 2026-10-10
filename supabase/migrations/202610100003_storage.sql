insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('payment-proofs','payment-proofs',false,5242880,array['image/jpeg','image/png','application/pdf']) on conflict(id) do nothing;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('academy-logos','academy-logos',false,2097152,array['image/jpeg','image/png']) on conflict(id) do nothing;
create policy proof_read on storage.objects for select to authenticated using(bucket_id='payment-proofs' and exists(select 1 from public.payment_evidence e where e.path=name and private.can_payment(e.organization_id,e.payment_id)));
create policy proof_insert on storage.objects for insert to authenticated with check(bucket_id='payment-proofs' and cardinality(storage.foldername(name))=2 and private.can_payment((storage.foldername(name))[1]::uuid,(storage.foldername(name))[2]::uuid));
create policy logo_read on storage.objects for select to authenticated using(bucket_id='academy-logos' and exists(select 1 from public.organizations o where o.id=(storage.foldername(name))[1]::uuid));
create policy logo_insert on storage.objects for insert to authenticated with check(bucket_id='academy-logos' and private.has_role((storage.foldername(name))[1]::uuid,array['owner']));
create policy evidence_insert on public.payment_evidence for insert to authenticated with check(uploaded_by=auth.uid() and private.can_payment(organization_id,payment_id) and path like organization_id::text||'/'||payment_id::text||'/%' and path !~ '\.\.' and exists(select 1 from public.payments p where p.id=payment_id and p.organization_id=organization_id and p.status='pending_verification'));
