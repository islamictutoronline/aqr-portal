-- Elaun tutor bagi 5 program baharu (keputusan pengguna 11 Okt 2026): elaun = yuran sesi − RM2.
--   Bahasa Arab KSSM    RM17 → RM15      Bahasa Arab Madinah RM20 → RM18
--   Tadabbur / Tafsir   RM20 → RM18      Faraid Ilmu Pusaka  RM25 → RM23
--   Tarannum            RM20 → RM18      (semua 30 minit, berkuat kuasa 1 Okt 2026)
-- Direkod atas nama pemilik organisasi. Boleh dijalankan semula (tidak menduplikasi kadar).
do $$
declare o record; owner_staff uuid;
begin
 for o in select id from public.organizations loop
  select m.staff_id into owner_staff from public.staff_memberships m
   where m.organization_id=o.id and m.role in ('owner','admin') and m.active order by (m.role='owner') desc, m.created_at limit 1;
  if owner_staff is null then continue; end if;
  insert into public.tutor_allowance_rates(organization_id,program_code,duration_minutes,amount_sen,effective_from,source,created_by)
   select o.id,v.code,30,v.amount,'2026-10-01','Keputusan pengguna 11 Okt 2026: yuran sesi tolak RM2',owner_staff
   from (values ('BAHASA_ARAB_KSSM',1500),('BAHASA_ARAB_MADINAH',1800),('TADABBUR',1800),('FARAID',2300),('TARANNUM',1800)) v(code,amount)
   where not exists(select 1 from public.tutor_allowance_rates r
    where r.organization_id=o.id and r.program_code=v.code and r.duration_minutes=30 and r.effective_to is null);
 end loop;
end $$;
-- Semakan: 5 kadar baharu (elaun) bersebelahan yuran.
select r.program_code, r.amount_sen/100.0 as elaun_rm, f.amount_sen/100.0 as yuran_rm
from public.tutor_allowance_rates r
left join public.program_fee_rates f on f.organization_id=r.organization_id and f.program_code=r.program_code and f.duration_minutes=r.duration_minutes
where r.program_code in ('BAHASA_ARAB_KSSM','BAHASA_ARAB_MADINAH','TADABBUR','FARAID','TARANNUM')
order by r.program_code;
