-- Daftar murid terus ke kelas: pemilik/admin untuk mana-mana kelas aktif, tutor hanya kelas tugasannya.
-- Murid dan pendaftaran kelas dicipta dalam satu transaksi dengan semakan kapasiti.
create or replace function private.tutor_register_student(org uuid,cid uuid,student_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; capacity integer;
begin
 if not (private.has_role(org,array['owner','admin']) or (private.has_role(org,array['tutor']) and private.teaches_class(org,cid,current_date))) then raise exception 'Kelas bukan tugasan tutor' using errcode='42501'; end if;
 if length(trim(student_name)) not between 2 and 200 then raise exception 'Nama tidak sah'; end if;
 select max_capacity into capacity from public.classes where id=cid and organization_id=org and active for update;
 if capacity is null then raise exception 'Kelas tidak aktif'; end if;
 if (select count(*) from public.enrollments where class_id=cid and organization_id=org and status='active' and (ends_on is null or ends_on>=current_date))>=capacity then raise exception 'Kelas penuh'; end if;
 insert into public.students(organization_id,full_name) values(org,trim(student_name)) returning id into result;
 insert into public.enrollments(organization_id,student_id,class_id) values(org,result,cid);
 -- Pautan penjaga kekal dikawal admin; tutor tidak boleh menetapkan akses anak.
 return result;
end $$;
