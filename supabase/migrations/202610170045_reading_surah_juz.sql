-- Migrasi 45: label bacaan al-Quran memaparkan surah (termasuk julat surah) dan juzuk.
-- Program bacaan (Kelancaran/Tahsin): portal mengisi surah, surah_to dan juzuk secara automatik
-- daripada muka surat (mushaf Madinah 604 muka surat). Pra Tahfiz/Tahfiz memilih surah sendiri.
-- Juzuk dipaparkan daripada `juz` (jika diisi) atau dikira daripada muka surat. Boleh dijalankan semula.

create or replace function private.juz_of(p integer) returns integer language sql immutable set search_path='' as $$
 select case when p is null or p not between 1 and 604 then null when p<=21 then 1 else least(30,(p-2)/20+1) end
$$;

-- Muka surat permulaan setiap surah (sama seperti surahStartPages dalam src/lib/quran.ts).
create or replace function private.surah_start_pages() returns integer[] language sql immutable set search_path='' as $$
 select array[1,2,50,77,106,128,151,177,187,208,221,235,249,255,262,267,282,293,305,312,
  322,332,342,350,359,367,377,385,396,404,411,415,418,428,434,440,446,453,458,467,
  477,483,489,496,499,502,507,511,515,518,520,523,526,528,531,534,537,542,545,549,
  551,553,554,556,558,560,562,564,566,568,570,572,574,575,577,578,580,582,583,585,
  586,587,587,589,590,591,591,592,593,594,595,595,596,596,597,597,598,598,599,599,
  600,600,601,601,601,602,602,602,603,603,603,604,604,604]::integer[]
$$;
-- Surah yang sedang dibaca pada muka surat p (surah terakhir yang bermula pada/sebelum p).
create or replace function private.surah_at_page(p integer) returns integer language sql immutable set search_path='' as $$
 select max(i) from generate_subscripts(private.surah_start_pages(),1) i where (private.surah_start_pages())[i]<=p
$$;

create or replace function private.reading_label(r jsonb) returns text language plpgsql immutable set search_path='' as $$
declare pt integer; kind text; jilid integer; pg integer; su integer; su_to integer; jz integer; jz_to integer;
 af integer; a_to integer; mx integer; t text; parts text[]:='{}';
begin
 if r is null or jsonb_typeof(r)<>'object' then return null; end if;
 kind:=r->>'kind';
 if kind is null or kind not in ('iqra','quran') then raise exception 'Jenis bacaan tidak sah'; end if;
 begin
  jilid:=(r->>'jilid')::integer; pg:=(r->>'page')::integer; pt:=(r->>'page_to')::integer; su:=(r->>'surah')::integer;
  su_to:=(r->>'surah_to')::integer; jz:=(r->>'juz')::integer;
  af:=(r->>'ayah_from')::integer; a_to:=(r->>'ayah_to')::integer;
 exception when others then raise exception 'Bacaan tidak sah';
 end;
 if jilid is not null and jilid not between 1 and 6 then raise exception 'Jilid Iqra'' mesti 1 hingga 6'; end if;
 if pg is not null and pg not between 1 and 604 then raise exception 'Muka surat mesti 1 hingga 604'; end if;
 if pt is not null then
  if pg is null then raise exception 'Isi muka surat mula'; end if;
  if pt not between 1 and 604 then raise exception 'Muka surat mesti 1 hingga 604'; end if;
  if pt<pg then raise exception 'Muka surat akhir mesti selepas muka surat mula'; end if;
 end if;
 if su is not null and su not between 1 and 114 then raise exception 'Surah tidak sah'; end if;
 if su_to is not null and (su is null or su_to not between su and 114) then raise exception 'Surah tidak sah'; end if;
 if jz is not null and jz not between 1 and 30 then raise exception 'Juzuk mesti 1 hingga 30'; end if;
 if kind='quran' then
  if (af is not null or a_to is not null) and su is null then raise exception 'Pilih surah dahulu'; end if;
  mx:=coalesce(private.surah_ayahs(su),286);
  if coalesce(af,1) not between 1 and mx or coalesce(a_to,1) not between 1 and mx then
   raise exception 'Surah % hanya % ayat', private.surah_name(su), mx; end if;
  if af is not null and a_to is not null and a_to<af then raise exception 'Ayat akhir mesti selepas ayat mula'; end if;
  -- Tiada surah (bacaan muka surat sahaja): surah dikira daripada muka surat.
  if su is null and pg is not null then
   su:=coalesce(array_position(private.surah_start_pages(),pg),private.surah_at_page(pg));
   su_to:=private.surah_at_page(coalesce(pt,pg));
  end if;
 end if;
 if kind='iqra' and jilid is not null then parts:=parts||('Iqra'' '||jilid); end if;
 if kind='quran' then
  if su is not null and su_to is not null and su_to<>su then
   parts:=parts||('Surah '||private.surah_name(su)||' – '||private.surah_name(su_to));
  elsif su is not null then
   t:='Surah '||private.surah_name(su);
   if af is not null then t:=t||' ayat '||af||case when a_to is not null and a_to<>af then '–'||a_to else '' end;
   elsif a_to is not null then t:=t||' ayat '||a_to; end if;
   parts:=parts||t;
  end if;
  jz_to:=case when jz is null then private.juz_of(pt) end;
  jz:=coalesce(jz,private.juz_of(pg));
  if jz is not null then
   parts:=parts||('juzuk '||jz||case when jz_to is not null and jz_to<>jz then '–'||jz_to else '' end);
  end if;
 end if;
 if pg is not null then parts:=parts||('muka surat '||pg||case when pt is not null and pt<>pg then '–'||pt else '' end); end if;
 if cardinality(parts)=0 then return null; end if;
 t:=array_to_string(parts,', ');
 return upper(left(t,1))||substr(t,2);
end $$;
revoke all on function private.juz_of(integer), private.surah_start_pages(), private.surah_at_page(integer) from public, anon;
grant execute on function private.juz_of(integer), private.surah_start_pages(), private.surah_at_page(integer) to authenticated;
notify pgrst, 'reload schema';
