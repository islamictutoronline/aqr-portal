import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';

// Migrasi 39: rekod kelas pada hari lain dan slot kelas yang dipadam.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org = id(1),
  owner = id(11),
  tutor = id(12);
let db: PGlite;
let student = '';
let cls = '';
async function asUser(user: string) {
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub','${user}',false); set role authenticated;`,
  );
}
const one = async <T>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0];
// Jam kelas tetap (20:00 waktu Malaysia) beberapa hari lalu.
const daysAgo = (n: number, hour = 20) => {
  const d = new Date(Date.now() - n * 86400000);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(d);
  return new Date(`${day}T${String(hour).padStart(2, '0')}:00:00+08:00`).toISOString();
};
const create = async (start: string) =>
  (
    await one<{ id: string }>('select create_session($1,$2,$3,$4,30,$5) id', [
      org,
      cls,
      tutor,
      start,
      '',
    ])
  ).id;
const record = (sid: string, selected: object = { mastery: 'not_assessed' }) =>
  db.query('select record_assessment($1,$2,$3,$4,$5,true)', [
    org,
    sid,
    student,
    'present',
    JSON.stringify(selected),
  ]);

beforeAll(async () => {
  const src = await readFile('tests/integration/database.test.ts', 'utf8');
  const stub = src.match(/"(create role anon;[^"]*)"/)![1];
  db = new PGlite();
  await db.exec(stub);
  for (const f of (await readdir('supabase/migrations')).filter((x) => x.endsWith('.sql')).sort())
    await db.exec(await readFile(`supabase/migrations/${f}`, 'utf8'));
  await db.exec(`insert into auth.users(id) values('${owner}'),('${tutor}');
   insert into organizations(id,slug) values('${org}','aqr-test');
   insert into staff_profiles(id,auth_user_id,display_name) values('${owner}','${owner}','Pemilik'),('${tutor}','${tutor}','Tutor Ujian');
   insert into staff_memberships(organization_id,staff_id,role) values('${org}','${owner}','owner'),('${org}','${tutor}','tutor');
   insert into subjects(id,organization_id,slug,name) values('${id(41)}','${org}','mengaji','Mengaji');
   insert into programs(id,organization_id,subject_id,code,name) values('${id(42)}','${org}','${id(41)}','TAHFIZ','Tahfiz');`);
  await asUser(tutor);
  student = (
    await one<{ id: string }>('select tutor_enrol_student($1,$2,$3,30,$4,$5,null,null,$6) id', [
      org,
      'Murid Tahfiz',
      id(42),
      JSON.stringify([{ day: 1, time: '20:00' }]),
      '2027-12-31',
      '0121111111',
    ])
  ).id;
  cls = (
    await one<{ class_id: string }>('select class_id from enrollments where student_id=$1', [
      student,
    ])
  ).class_id;
});

describe('rekod kelas pada hari lain', () => {
  it('kehadiran boleh direkod walaupun tarikh kelas sebelum tarikh mula pendaftaran', async () => {
    const sid = await create(daysAgo(3));
    // Simulasi pendaftaran yang tarikh mulanya selepas tarikh kelas (contoh: dikemas kini kemudian).
    await db.exec('reset role');
    await db.query('update enrollments set starts_on=current_date+1 where student_id=$1', [
      student,
    ]);
    await db.query('update class_tutors set starts_on=current_date+1 where class_id=$1', [cls]);
    await asUser(tutor);
    await expect(record(sid)).resolves.toBeTruthy();
    const s = await one<{ status: string }>('select status from class_sessions where id=$1', [sid]);
    expect(s.status).toBe('completed');
  });

  it('tambah rekod sesi pada masa kelas yang dipadam menghidupkan semula sesi itu', async () => {
    await asUser(tutor);
    const start = daysAgo(2, 21);
    const sid = await create(start);
    await db.query('select void_session($1,$2)', [org, sid]);
    const voided = await one<{ status: string }>('select status from class_sessions where id=$1', [
      sid,
    ]);
    expect(voided.status).toBe('cancelled');
    const again = await create(start);
    expect(again).toBe(sid);
    const revived = await one<{ status: string }>('select status from class_sessions where id=$1', [
      sid,
    ]);
    expect(revived.status).toBe('scheduled');
    await expect(record(again)).resolves.toBeTruthy();
  });

  it('alih sesi ke jam kelas yang telah dipadam dibenarkan', async () => {
    await asUser(tutor);
    const target = daysAgo(1, 19);
    const voided = await create(target);
    await db.query('select void_session($1,$2)', [org, voided]);
    const sid = await create(daysAgo(1, 22));
    await expect(
      db.query('select move_session($1,$2,$3)', [org, sid, target]),
    ).resolves.toBeTruthy();
    const moved = await one<{ starts_at: string }>(
      'select starts_at from class_sessions where id=$1',
      [sid],
    );
    expect(new Date(moved.starts_at).toISOString()).toBe(target);
    // Kelas yang dipadam kekal sebagai sejarah, cuma dianjak beberapa saat.
    const old = await one<{ status: string }>('select status from class_sessions where id=$1', [
      voided,
    ]);
    expect(old.status).toBe('cancelled');
  });

  it('alih ke jam kelas aktif masih ditolak', async () => {
    await asUser(tutor);
    const a = await create(daysAgo(4, 18));
    const b = await create(daysAgo(4, 17));
    await expect(
      db.query('select move_session($1,$2,$3)', [org, b, daysAgo(4, 18)]),
    ).rejects.toThrow(/Sudah ada kelas/);
    expect(a).not.toBe(b);
  });
});

// Migrasi 40: program teori menulis tajuk/topik sendiri menggantikan pilihan kemahiran.
describe('tajuk/topik program teori', () => {
  it('topik tanpa penilaian disimpan pada sesi dan ulasan', async () => {
    await asUser(tutor);
    const sid = await create(daysAgo(7));
    await record(sid, { mastery: 'not_assessed', topic: '  Bab wuduk — rukun  ' });
    const s = await one<{ topic: string }>('select topic from class_sessions where id=$1', [sid]);
    expect(s.topic).toBe('Bab wuduk — rukun');
    const c = await one<{ text: string }>(
      "select text from generated_parent_comments where session_id=$1 and status<>'retracted'",
      [sid],
    );
    expect(c.text).toBe(
      'Topik pembelajaran: Bab wuduk — rukun. Tiada penilaian pembelajaran untuk sesi ini.',
    );
  });

  it('topik menggantikan kemahiran dalam penilaian penuh', async () => {
    await db.exec('reset role');
    await db.query(
      `insert into assessment_options(organization_id,subject_id,group_code,code,label) values
       ($1,$2,'participation','aktif','aktif'),($1,$2,'focus','kefahaman','kefahaman isi pelajaran')
       on conflict do nothing`,
      [org, id(41)],
    );
    await asUser(tutor);
    const sid = await create(daysAgo(8));
    await record(sid, {
      mastery: 4,
      topic: 'Huruf hijaiyah bersambung',
      participation: 'aktif',
      focus: 'kefahaman',
    });
    const c = await one<{ text: string }>(
      "select text from generated_parent_comments where session_id=$1 and status<>'retracted'",
      [sid],
    );
    expect(c.text).toContain('penguasaan yang baik dalam topik Huruf hijaiyah bersambung');
    const r = await one<{ skill: string }>(
      'select skill from assessment_responses where session_id=$1',
      [sid],
    );
    expect(r.skill).toBe('topik');
  });

  it('topik terlalu panjang ditolak', async () => {
    await asUser(tutor);
    const sid = await create(daysAgo(9));
    await expect(record(sid, { mastery: 'not_assessed', topic: 'x'.repeat(121) })).rejects.toThrow(
      /terlalu panjang/,
    );
  });

  it('snapshot laporan bulanan membawa topik', async () => {
    await asUser(owner);
    const period = (
      await one<{ p: string }>(
        "select to_char((now() - interval '7 days') at time zone 'Asia/Kuala_Lumpur','YYYY-MM') p",
      )
    ).p;
    await db.query('select prepare_student_report($1,$2,$3)', [org, student, period]);
    const snap = await one<{ snapshot: { attendance: { topic?: string }[] } }>(
      'select snapshot from monthly_student_reports where student_id=$1 and period=$2',
      [student, period],
    );
    expect(snap.snapshot.attendance.some((a) => a.topic === 'Bab wuduk — rukun')).toBe(true);
  });
});
