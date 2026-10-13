import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';

// Skrip supabase/remove-tutor-data.sql: padam seorang tutor dan semua datanya; tutor lain tidak terjejas.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org = id(1),
  owner = id(11),
  keep = id(12),
  gone = id(13);
let db: PGlite;
async function asUser(user: string) {
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub','${user}',false); set role authenticated;`,
  );
}
const count = async (sql: string, params: unknown[] = []) =>
  Number((await db.query<{ n: number }>(sql, params)).rows[0].n);

beforeAll(async () => {
  const src = await readFile('tests/integration/database.test.ts', 'utf8');
  const stub = src.match(/"(create role anon;[^"]*)"/)![1];
  db = new PGlite();
  await db.exec(stub);
  for (const f of (await readdir('supabase/migrations')).filter((x) => x.endsWith('.sql')).sort())
    await db.exec(await readFile(`supabase/migrations/${f}`, 'utf8'));
  await db.exec(`insert into auth.users(id) values('${owner}'),('${keep}'),('${gone}');
   insert into organizations(id,slug) values('${org}','aqr-test');
   insert into staff_profiles(id,auth_user_id,display_name) values('${owner}','${owner}','Pemilik'),('${keep}','${keep}','AHMAD MUZZAMMIL BIN MOHAMMAD NAJIB'),('${gone}','${gone}','AHMAD NAJIB');
   insert into staff_memberships(organization_id,staff_id,role) values('${org}','${owner}','owner'),('${org}','${keep}','tutor'),('${org}','${gone}','tutor');
   insert into subjects(id,organization_id,slug,name) values('${id(41)}','${org}','mengaji','Mengaji');
   insert into programs(id,organization_id,subject_id,code,name) values('${id(42)}','${org}','${id(41)}','IQRA','Iqra');
   insert into program_fee_rates(organization_id,program_code,duration_minutes,amount_sen,effective_from) values('${org}','IQRA',30,1000,'2020-01-01');
   insert into tutor_allowance_rates(organization_id,program_code,duration_minutes,amount_sen,effective_from,source,created_by) values('${org}','IQRA',30,900,'2020-01-01','ujian','${owner}');`);
  const slots = JSON.stringify([{ day: 1, time: '20:00' }]);
  const enrol = async (tutor: string, name: string, phone: string) => {
    await asUser(tutor);
    return (
      await db.query<{ id: string }>(
        'select tutor_enrol_student($1,$2,$3,30,$4,$5,null,null,$6) id',
        [org, name, id(42), slots, '2027-12-31', phone],
      )
    ).rows[0].id;
  };
  const record = async (tutor: string, student: string) => {
    await asUser(tutor);
    const s = (
      await db.query<{ id: string }>(
        'select s.id from class_sessions s join enrollments e on e.class_id=s.class_id where e.student_id=$1 and s.starts_at<now() order by s.starts_at limit 1',
        [student],
      )
    ).rows[0];
    if (s)
      await db.query('select record_assessment($1,$2,$3,$4,$5,true)', [
        org,
        s.id,
        student,
        'present',
        JSON.stringify({ mastery: 'not_assessed' }),
      ]);
  };
  const k1 = await enrol(keep, 'Murid Kekal', '0121111111');
  const g1 = await enrol(gone, 'Murid Padam 1', '0132222222');
  const g2 = await enrol(gone, 'Murid Padam 2', '0132222222'); // adik-beradik
  await record(keep, k1);
  await record(gone, g1);
  await record(gone, g2);
  await asUser(gone);
  const period = (
    await db.query<{ p: string }>(
      "select to_char(now() at time zone 'Asia/Kuala_Lumpur','YYYY-MM') p",
    )
  ).rows[0].p;
  await db.query('select save_tutor_remark($1,$2,$3,$4)', [org, g1, period, 'Rumusan tutor']);
  // Tindakan admin ke atas data tutor itu.
  await asUser(owner);
  const cls = (
    await db.query<{ class_id: string }>('select class_id from enrollments where student_id=$1', [
      g1,
    ])
  ).rows[0].class_id;
  await db.query('select set_class_rates($1,$2,1500,1200,$3)', [org, cls, '2020-01-01']);
  await db.query('select set_tutor_rate($1,$2,100,$3)', [org, gone, '2020-01-01']);
  await db.query('select mark_tutor_paid($1,$2,$3,900,1)', [org, gone, period]);
  for (const st of [k1, g1, g2])
    await db.query('select prepare_student_report($1,$2,$3)', [org, st, period]);
  await db.query('select generate_session_invoices($1,$2)', [org, period]);
  const inv = (
    await db.query<{ id: string }>(
      'select i.id from invoices i join student_guardians sg on sg.guardian_id=i.guardian_id where sg.student_id=$1',
      [g1],
    )
  ).rows[0];
  if (inv) await db.query('select mark_invoice_paid($1,$2)', [org, inv.id]);
  await db.exec('reset role');
});

describe('remove-tutor-data.sql', () => {
  it('rejects a name that does not match exactly one tutor (nothing deleted)', async () => {
    const sql = (await readFile('supabase/remove-tutor-data.sql', 'utf8')).replace(
      "'AHMAD NAJIB'::text",
      "'TIADA SESIAPA'::text",
    );
    const before = await count('select count(*) n from students');
    await expect(db.exec(sql)).rejects.toThrow(/tepat seorang tutor/);
    await db.exec('rollback');
    expect(await count('select count(*) n from students')).toBe(before);
  });
  it('removes only AHMAD NAJIB and all his data; the other tutor is untouched', async () => {
    const keepBefore = {
      students: await count(
        'select count(*) n from enrollments e join class_tutors t on t.class_id=e.class_id where t.staff_id=$1',
        [keep],
      ),
      sessions: await count('select count(*) n from class_sessions where tutor_id=$1', [keep]),
      attendance: await count(
        'select count(*) n from attendance a join class_sessions s on s.id=a.session_id where s.tutor_id=$1',
        [keep],
      ),
    };
    expect(keepBefore.students).toBe(1);
    expect(keepBefore.attendance).toBe(1);
    await db.exec(await readFile('supabase/remove-tutor-data.sql', 'utf8'));
    // Tutor dipadam sepenuhnya.
    expect(
      await count("select count(*) n from staff_profiles where display_name='AHMAD NAJIB'"),
    ).toBe(0);
    expect(await count('select count(*) n from auth.users where id=$1', [gone])).toBe(0);
    expect(await count("select count(*) n from students where full_name like 'Murid Padam%'")).toBe(
      0,
    );
    expect(await count('select count(*) n from guardians where phone=$1', ['+60132222222'])).toBe(
      0,
    );
    expect(await count('select count(*) n from tutor_month_payments')).toBe(0);
    expect(await count('select count(*) n from tutor_rate_overrides')).toBe(0);
    expect(await count('select count(*) n from class_rate_overrides')).toBe(0);
    expect(await count('select count(*) n from monthly_tutor_remarks')).toBe(0);
    expect(await count('select count(*) n from payments')).toBe(0);
    expect(await count('select count(*) n from audit_events where actor_id=$1', [gone])).toBe(0);
    // Tutor lain kekal utuh.
    expect(
      await count(
        "select count(*) n from staff_profiles where display_name like 'AHMAD MUZZAMMIL%'",
      ),
    ).toBe(1);
    expect(await count("select count(*) n from students where full_name='Murid Kekal'")).toBe(1);
    expect(await count('select count(*) n from class_sessions where tutor_id=$1', [keep])).toBe(
      keepBefore.sessions,
    );
    expect(
      await count(
        'select count(*) n from attendance a join class_sessions s on s.id=a.session_id where s.tutor_id=$1',
        [keep],
      ),
    ).toBe(1);
    expect(await count('select count(*) n from guardians where phone=$1', ['+60121111111'])).toBe(
      1,
    );
    expect(await count('select count(*) n from invoices')).toBe(1);
    expect(await count('select count(*) n from monthly_student_reports')).toBe(1);
  });
});
