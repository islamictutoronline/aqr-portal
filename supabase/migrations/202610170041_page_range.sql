-- Migrasi 41: muka surat boleh ditulis sebagai julat (contoh 100-102).
-- Bacaan menyimpan page (mula) dan page_to (akhir); label ulasan: "muka surat 100–102".
-- Tambahan sahaja; boleh dijalankan semula.

create or replace function private.reading_label(r jsonb) returns text language plpgsql immutable set search_path='' as $$
declare pt integer; kind text; jilid integer; pg integer; su integer; af integer; a_to integer; mx integer; t text; parts text[]:='{}';
begin
 if r is null or jsonb_typeof(r)<>'object' then return null; end if;
 kind:=r->>'kind';
 if kind is null or kind not in ('iqra','quran') then raise exception 'Jenis bacaan tidak sah'; end if;
 begin
  jilid:=(r->>'jilid')::integer; pg:=(r->>'page')::integer; pt:=(r->>'page_to')::integer; su:=(r->>'surah')::integer;
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
 if kind='quran' then
  if (af is not null or a_to is not null) and su is null then raise exception 'Pilih surah dahulu'; end if;
  mx:=coalesce(private.surah_ayahs(su),286);
  if coalesce(af,1) not between 1 and mx or coalesce(a_to,1) not between 1 and mx then
   raise exception 'Surah % hanya % ayat', private.surah_name(su), mx; end if;
  if af is not null and a_to is not null and a_to<af then raise exception 'Ayat akhir mesti selepas ayat mula'; end if;
 end if;
 if kind='iqra' and jilid is not null then parts:=parts||('Iqra'' '||jilid); end if;
 if kind='quran' and su is not null then
  t:='Surah '||private.surah_name(su);
  if af is not null then t:=t||' ayat '||af||case when a_to is not null and a_to<>af then '–'||a_to else '' end;
  elsif a_to is not null then t:=t||' ayat '||a_to; end if;
  parts:=parts||t;
 end if;
 if pg is not null then parts:=parts||('muka surat '||pg||case when pt is not null and pt<>pg then '–'||pt else '' end); end if;
 if cardinality(parts)=0 then return null; end if;
 t:=array_to_string(parts,', ');
 return upper(left(t,1))||substr(t,2);
end $$;
notify pgrst, 'reload schema';
