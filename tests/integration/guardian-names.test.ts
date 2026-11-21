import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';

// Migrasi 53: nama penjaga "-" ditukar kepada "Ibu/Bapa <nama murid>"; nama sebenar tidak ditimpa.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org = id(1),
  tutor = id(12),
  iqra = id(42);
let db: PGlite;
const one = async <T>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0];

beforeAll(async () => {
  const src = await readFile('tests/integration/database.test.ts', 'utf8');
  db = new PGlite();
  await db.exec(src.match(/"(create role anon;[^"]*)"/)![1]);
  for (const f of (await readdir('supabase/migrations')).filter((x) => x.endsWith('.sql')).sort())
    await db.exec(await readFile(`supabase/migrations/${f}`, 'utf8'));
  await db.exec(`insert into auth.users(id) values('${tutor}');
   insert into organizations(id,slug) values('${org}','aqr-test');
   insert into staff_profiles(id,auth_user_id,display_name) values('${tutor}','${tutor}','Tutor');
   insert into staff_memberships(organization_id,staff_id,role) values('${org}','${tutor}','tutor');
   insert into subjects(id,organization_id,slug,name) values('${id(41)}','${org}','mengaji','Mengaji');
   insert into programs(id,organization_id,subject_id,code,name) values('${iqra}','${org}','${id(41)}','IQRA','Iqra''');
   select set_config('request.jwt.claim.sub','${tutor}',false); set role authenticated;`);
});

describe('nama penjaga "-"', () => {
  it('daftar dengan "-" menjadi Ibu/Bapa <murid>; nama sebenar kemudian tidak ditimpa oleh "-"', async () => {
    const student = (
      await one<{ id: string }>('select tutor_enrol_student($1,$2,$3,30,$4,$5,null,$6,$7) id', [
        org,
        'Qasih Qaleesya',
        iqra,
        JSON.stringify([{ day: 1, time: '20:00' }]),
        '2027-12-31',
        '-',
        '0125556666',
      ])
    ).id;
    const name = async () =>
      (
        await one<{ full_name: string }>(
          'select g.full_name from guardians g join student_guardians sg on sg.guardian_id=g.id where sg.student_id=$1 and sg.is_billing_contact',
          [student],
        )
      ).full_name;
    expect(await name()).toBe('Ibu/Bapa Qasih Qaleesya');
    await db.query('select save_student_guardian($1,$2,$3,$4)', [
      org,
      student,
      'Puan Aminah',
      '0125556666',
    ]);
    expect(await name()).toBe('Puan Aminah');
    await db.query('select save_student_guardian($1,$2,$3,$4)', [
      org,
      student,
      ' - ',
      '0125556666',
    ]);
    expect(await name()).toBe('Puan Aminah');
  });

  it('murid baharu oleh tutor baharu, adik-beradik dan pelbagai bentuk "-" semuanya mendapat nama lalai', async () => {
    // Tutor baharu ditambah selepas migrasi.
    const fresh = id(13);
    await db.exec(`reset role;
     insert into auth.users(id) values('${fresh}');
     insert into staff_profiles(id,auth_user_id,display_name) values('${fresh}','${fresh}','Tutor Baharu');
     insert into staff_memberships(organization_id,staff_id,role) values('${org}','${fresh}','tutor');
     select set_config('request.jwt.claim.sub','${fresh}',false); set role authenticated;`);
    const enrol = async (student: string, guardian: string, phone: string) =>
      (
        await one<{ id: string }>('select tutor_enrol_student($1,$2,$3,30,$4,$5,null,$6,$7) id', [
          org,
          student,
          iqra,
          JSON.stringify([{ day: 2, time: '20:00' }]),
          '2027-12-31',
          guardian,
          phone,
        ])
      ).id;
    const guardianOf = (student: string) =>
      one<{ full_name: string; id: string }>(
        'select g.full_name,g.id from guardians g join student_guardians sg on sg.guardian_id=g.id where sg.student_id=$1 and sg.is_billing_contact',
        [student],
      );
    for (const [i, typed] of ['.', '–', '--', ' ', 'Tiada', 'n/a'].entries()) {
      const s = await enrol(`Murid Baharu ${i}`, typed, `01377700${i}0`);
      expect((await guardianOf(s)).full_name).toBe(`Ibu/Bapa Murid Baharu ${i}`);
    }
    // Adik-beradik (no. sama) dengan "-": penjaga sama, nama tidak bertukar kepada "-".
    const kakak = await enrol('Kakak Ali', '-', '0138889999');
    const adik = await enrol('Adik Ali', '-', '0138889999');
    const a = await guardianOf(kakak);
    const b = await guardianOf(adik);
    expect(b.id).toBe(a.id);
    expect(b.full_name).toBe('Ibu/Bapa Kakak Ali');
  });
});
