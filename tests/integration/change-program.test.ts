import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';

// Migrasi 49: tukar / padam program murid tanpa memadam murid.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org = id(1),
  owner = id(11),
  tutor = id(12),
  other = id(13);
const iqra = id(42),
  quran = id(43),
  kafa = id(44);
let db: PGlite;
async function asUser(user: string) {
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub','${user}',false); set role authenticated;`,
  );
}
const one = async <T>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0];
const klDate = (n: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(
    new Date(Date.now() - n * 86400000),
  );
const daysAgo = (n: number) => new Date(`${klDate(n)}T20:00:00+08:00`).toISOString();
async function enrol(name: string) {
  await asUser(tutor);
  const student = (
    await one<{ id: string }>('select tutor_enrol_student($1,$2,$3,30,$4,$5,null,null,$6) id', [
      org,
      name,
      iqra,
      JSON.stringify([{ day: 1, time: '20:00' }]),
      '2027-12-31',
      '0121111111',
    ])
  ).id;
  const cls = (
    await one<{ class_id: string }>('select class_id from enrollments where student_id=$1', [
      student,
    ])
  ).class_id;
  return { student, cls };
}
async function attend(cls: string, student: string, start: string) {
  const sid = (
    await one<{ id: string }>('select create_session($1,$2,$3,$4,30,$5) id', [
      org,
      cls,
      tutor,
      start,
      '',
    ])
  ).id;
  await db.query('select record_assessment($1,$2,$3,$4,$5,true)', [
    org,
    sid,
    student,
    'present',
    JSON.stringify({ mastery: 'not_assessed', reading: { kind: 'iqra', jilid: 3, page: 10 } }),
  ]);
  return sid;
}

beforeAll(async () => {
  const src = await readFile('tests/integration/database.test.ts', 'utf8');
  const stub = src.match(/"(create role anon;[^"]*)"/)![1];
  db = new PGlite();
  await db.exec(stub);
  for (const f of (await readdir('supabase/migrations')).filter((x) => x.endsWith('.sql')).sort())
    await db.exec(await readFile(`supabase/migrations/${f}`, 'utf8'));
  await db.exec(`insert into auth.users(id) values('${owner}'),('${tutor}'),('${other}');
   insert into organizations(id,slug) values('${org}','aqr-test');
   insert into staff_profiles(id,auth_user_id,display_name) values('${owner}','${owner}','Pemilik'),('${tutor}','${tutor}','Tutor Ujian'),('${other}','${other}','Tutor Lain');
   insert into staff_memberships(organization_id,staff_id,role) values('${org}','${owner}','owner'),('${org}','${tutor}','tutor'),('${org}','${other}','tutor');
   insert into subjects(id,organization_id,slug,name) values('${id(41)}','${org}','mengaji','Mengaji');
   insert into programs(id,organization_id,subject_id,code,name) values('${iqra}','${org}','${id(41)}','IQRA','Iqra'''),
    ('${quran}','${org}','${id(41)}','KELANCARAN_AQ','Kelancaran al-Quran'),('${kafa}','${org}','${id(41)}','KAFA','Fardhu Ain KAFA');`);
});

describe('tukar program murid', () => {
  it('tersalah pilih: program kelas ditukar di tempatnya, kehadiran kekal', async () => {
    const { student, cls } = await enrol('Murid Salah Isi');
    const sid = await attend(cls, student, daysAgo(3));
    await expect(
      db.query('select change_student_program($1,$2,$3,null)', [org, cls, quran]),
    ).resolves.toBeTruthy();
    const c = await one<{ program_id: string; name: string; active: boolean }>(
      'select program_id,name,active from classes where id=$1',
      [cls],
    );
    expect(c).toMatchObject({ program_id: quran, name: 'Murid Salah Isi · Kelancaran al-Quran' });
    expect(c.active).toBe(true);
    const s = await one<{ class_id: string }>('select class_id from class_sessions where id=$1', [
      sid,
    ]);
    expect(s.class_id).toBe(cls);
    const n = await one<{ n: number }>(
      "select count(*)::int n from enrollments where student_id=$1 and status='active'",
      [student],
    );
    expect(n.n).toBe(1);
  });

  it('bertukar program mulai tarikh: rekod lama kekal pada Iqra, sesi baharu ke al-Quran', async () => {
    const { student, cls } = await enrol('Murid Naik');
    const old = await attend(cls, student, daysAgo(6));
    const later = await attend(cls, student, daysAgo(1));
    const created = (
      await one<{ id: string }>('select change_student_program($1,$2,$3,$4) id', [
        org,
        cls,
        quran,
        klDate(2),
      ])
    ).id;
    expect(created).not.toBe(cls);
    const sessions = (
      await db.query<{ id: string; class_id: string }>(
        'select id,class_id from class_sessions where id in ($1,$2)',
        [old, later],
      )
    ).rows;
    expect(sessions.find((x) => x.id === old)!.class_id).toBe(cls);
    expect(sessions.find((x) => x.id === later)!.class_id).toBe(created);
    const enr = (
      await db.query<{ class_id: string; status: string }>(
        'select class_id,status from enrollments where student_id=$1',
        [student],
      )
    ).rows;
    expect(enr.find((e) => e.class_id === cls)!.status).toBe('completed');
    expect(enr.find((e) => e.class_id === created)!.status).toBe('active');
    const k = await one<{ program_id: string; active: boolean }>(
      'select program_id,active from classes where id=$1',
      [created],
    );
    expect(k).toEqual({ program_id: quran, active: true });
    // Jadual dan tutor disalin; murid kekal aktif; tutor masih boleh merekod di kelas baharu.
    const rules = await one<{ n: number }>(
      'select count(*)::int n from class_schedules where class_id=$1 and effective_to is not distinct from $2::date',
      [created, '2027-12-31'],
    );
    expect(rules.n).toBe(1);
    const st = await one<{ status: string }>('select status from students where id=$1', [student]);
    expect(st.status).toBe('active');
    await expect(attend(created, student, daysAgo(0))).resolves.toBeTruthy();
  });

  it('menolak tutor lain, program sama dan tarikh akan datang', async () => {
    const { cls } = await enrol('Murid Semakan');
    await asUser(other);
    await expect(
      db.query('select change_student_program($1,$2,$3,null)', [org, cls, quran]),
    ).rejects.toThrow();
    await asUser(tutor);
    await expect(
      db.query('select change_student_program($1,$2,$3,null)', [org, cls, iqra]),
    ).rejects.toThrow(/sama/);
    await expect(
      db.query('select change_student_program($1,$2,$3,$4)', [org, cls, quran, klDate(-3)]),
    ).rejects.toThrow(/hari ini/);
  });
});

describe('padam program murid', () => {
  it('program terakhir tidak boleh dipadam; program tambahan dipadam tanpa memadam murid', async () => {
    const { student, cls } = await enrol('Murid Dua Program');
    await expect(db.query('select remove_student_program($1,$2)', [org, cls])).rejects.toThrow(
      /satu-satunya/,
    );
    const extra = (
      await one<{ id: string }>('select add_student_program($1,$2,$3) id', [org, student, kafa])
    ).id;
    await db.query('select remove_student_program($1,$2)', [org, extra]);
    const e = await one<{ status: string }>(
      'select status from enrollments where class_id=$1 and student_id=$2',
      [extra, student],
    );
    expect(e.status).toBe('withdrawn');
    const st = await one<{ status: string }>('select status from students where id=$1', [student]);
    expect(st.status).toBe('active');
    const left = await one<{ n: number }>(
      "select count(*)::int n from enrollments where student_id=$1 and status='active'",
      [student],
    );
    expect(left.n).toBe(1);
  });
});
