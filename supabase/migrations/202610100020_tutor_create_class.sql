-- Tutor mencipta kelas sendiri dan ditugaskan secara automatik (satu transaksi).
-- Tutor tidak boleh menugaskan kelas kepada orang lain; admin kekal menggunakan aliran sedia ada.
create function private.tutor_create_class(org uuid,program_id uuid,class_name text,class_mode text,class_delivery text,capacity integer,class_venue text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; me uuid;
begin
 if not private.has_role(org,array['tutor']) then raise exception 'Hanya tutor aktif' using errcode='42501'; end if;
 me:=private.staff_id();
 if length(trim(class_name)) not between 2 and 120 then raise exception 'Nama kelas tidak sah'; end if;
 if class_mode not in ('group','one_to_one') or class_delivery not in ('physical','online') then raise exception 'Jenis kelas tidak sah'; end if;
 if capacity is null or capacity not between 1 and 100 then raise exception 'Kapasiti tidak sah'; end if;
 if not exists(select 1 from public.programs p where p.id=tutor_create_class.program_id and p.organization_id=org) then raise exception 'Program tidak sah'; end if;
 insert into public.classes(organization_id,program_id,name,mode,delivery,max_capacity,venue)
  values(org,tutor_create_class.program_id,trim(class_name),class_mode,class_delivery,case when class_mode='one_to_one' then 1 else capacity end,nullif(trim(coalesce(class_venue,'')),''))
  returning id into result;
 insert into public.class_tutors(organization_id,class_id,staff_id) values(org,result,me);
 return result;
end $$;
create function public.tutor_create_class(org uuid,program_id uuid,class_name text,class_mode text,class_delivery text,capacity integer,class_venue text default null) returns uuid language sql security invoker set search_path='' as $$select private.tutor_create_class(org,program_id,class_name,class_mode,class_delivery,capacity,class_venue)$$;
revoke all on function private.tutor_create_class(uuid,uuid,text,text,text,integer,text) from public;
grant execute on function private.tutor_create_class(uuid,uuid,text,text,text,integer,text) to authenticated;
revoke all on function public.tutor_create_class(uuid,uuid,text,text,text,integer,text) from public,anon;
grant execute on function public.tutor_create_class(uuid,uuid,text,text,text,integer,text) to authenticated;
