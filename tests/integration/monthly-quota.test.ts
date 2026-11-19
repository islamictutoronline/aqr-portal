import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';

// Migrasi 50: kuota sesi sebulan dan butang Selesai bulan tutor.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org = id(1),
  owner = id(11),
  tutor = id(12);
const iqra = id(42);
let db: PGlite;
async function asUser(user: string) {
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub','${user}',false); set role authenticated;`,
  );
}
const one = async <T>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0];
// Bulan lepas (KL): sentiasa boleh direkod dan ditanda Selesai.
const kl = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date());
const [y, m] = kl.split('-').map(Number);
const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
const at = (day: number) => `${prev}-${String(day).padStart(2, '0')}T21:00:00+08:00`;

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
async function record(cls: string, student: string, start: string, status = 'present') {
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
    status,
    JSON.stringify({ mastery: 'not_assessed' }),
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
  await db.exec(`insert into auth.users(id) values('${owner}'),('${tutor}');
   insert into organizations(id,slug) values('${org}','aqr-test');
   insert into staff_profiles(id,auth_user_id,display_name) values('${owner}','${owner}','Pemilik'),('${tutor}','${tutor}','Tutor Ujian');
   insert into staff_memberships(organization_id,staff_id,role) values('${org}','${owner}','owner'),('${org}','${tutor}','tutor');
   insert into subjects(id,organization_id,slug,name) values('${id(41)}','${org}','mengaji','Mengaji');
   insert into programs(id,organization_id,subject_id,code,name) values('${iqra}','${org}','${id(41)}','IQRA','Iqra''');`);
});

describe('kuota sesi sebulan', () => {
  it('slot mingguan tunggal = 4 sesi sebulan; rekod kelima ditolak', async () => {
    const { student, cls } = await enrol('Murid Kuota');
    for (const d of [1, 2, 3, 4]) await record(cls, student, at(d));
    await expect(record(cls, student, at(5))).rejects.toThrow(/Kuota 4 sesi sebulan/);
    // Sesi tambahan yang disahkan tutor dibenarkan (5/4) dan dikira seperti biasa.
    const extra = (
      await one<{ id: string }>('select create_session($1,$2,$3,$4,30,$5) id', [
        org,
        cls,
        tutor,
        at(6),
        '',
      ])
    ).id;
    await db.query('select mark_extra_session($1,$2)', [org, extra]);
    await db.query('select record_assessment($1,$2,$3,$4,$5,true)', [
      org,
      extra,
      student,
      'present',
      JSON.stringify({ mastery: 'not_assessed' }),
    ]);
    const used = await one<{ n: number }>(
      "select count(*)::int n from class_sessions where class_id=$1 and status='completed'",
      [cls],
    );
    expect(used.n).toBe(5);
    // Rekod sedia ada boleh disimpan semula (contohnya tukar Hadir → Lewat).
    const first = (
      await one<{ id: string }>(
        'select id from class_sessions where class_id=$1 order by starts_at limit 1',
        [cls],
      )
    ).id;
    await expect(
      db.query('select record_assessment($1,$2,$3,$4,$5,true)', [
        org,
        first,
        student,
        'late',
        JSON.stringify({ mastery: 'not_assessed' }),
      ]),
    ).resolves.toBeTruthy();
  });

  it('Cuti bermaklum tidak dikira; kuota boleh diubah oleh tutor kelas', async () => {
    const { student, cls } = await enrol('Murid Cuti');
    await record(cls, student, at(1), 'excused');
    for (const d of [2, 3, 4, 5]) await record(cls, student, at(d));
    await expect(record(cls, student, at(6))).rejects.toThrow(/Kuota/);
    await db.query('select set_class_quota($1,$2,8)', [org, cls]);
    await expect(record(cls, student, at(7))).resolves.toBeTruthy();
    await expect(db.query('select set_class_quota($1,$2,0)', [org, cls])).rejects.toThrow(
      /antara 1 hingga 31/,
    );
  });
});

describe('Selesai bulan tutor', () => {
  it('elaun tidak boleh dibayar sebelum tutor menekan Selesai', async () => {
    await asUser(owner);
    await expect(
      db.query('select mark_tutor_paid($1,$2,$3,1000,1,null,null)', [org, tutor, prev]),
    ).rejects.toThrow(/belum menekan Selesai/);
    await asUser(tutor);
    await expect(db.query('select close_tutor_month($1,$2)', [org, '2099-01'])).rejects.toThrow(
      /belum bermula/,
    );
    await db.query('select close_tutor_month($1,$2)', [org, prev]);
    const k = await one<{ sessions: number }>(
      'select sessions from tutor_month_closures where staff_id=$1 and period=$2',
      [tutor, prev],
    );
    // Murid Kuota 4 + 1 tambahan, Murid Cuti 5 (cuti bermaklum tidak dikira).
    expect(k.sessions).toBe(10);
    await expect(db.query('select close_tutor_month($1,$2)', [org, prev])).rejects.toThrow(
      /sudah ditanda Selesai/,
    );
    await asUser(owner);
    await expect(
      db.query('select mark_tutor_paid($1,$2,$3,1000,9,null,null)', [org, tutor, prev]),
    ).resolves.toBeTruthy();
  });
});

describe('kunci bulan selepas Selesai (migrasi 51)', () => {
  it('rekod dikunci; admin Buka semula hanya sebelum elaun dibayar', async () => {
    const { student, cls } = await enrol('Murid Kunci');
    // Bulan lepas sudah Selesai (ujian di atas): rekod baharu, ubah dan padam ditolak.
    await expect(record(cls, student, at(10))).rejects.toThrow(/sudah dikunci/);
    const done = (
      await one<{ id: string }>(
        "select s.id from class_sessions s join attendance a on a.session_id=s.id where s.tutor_id=$1 and to_char(s.starts_at at time zone 'Asia/Kuala_Lumpur','YYYY-MM')=$2 limit 1",
        [tutor, prev],
      )
    ).id;
    await expect(db.query('select void_session($1,$2)', [org, done])).rejects.toThrow(
      /sudah dikunci/,
    );
    await expect(db.query('select move_session($1,$2,$3)', [org, done, at(25)])).rejects.toThrow(
      /sudah dikunci/,
    );
    // Elaun sudah dibayar: Buka semula ditolak sehingga rekod bayaran dibatalkan.
    await asUser(owner);
    await expect(
      db.query('select reopen_tutor_month($1,$2,$3)', [org, tutor, prev]),
    ).rejects.toThrow(/Batalkan rekod bayaran/);
    const pay = (
      await one<{ id: string }>(
        "select id from tutor_month_payments where staff_id=$1 and period=$2 and status='paid'",
        [tutor, prev],
      )
    ).id;
    await db.query('select void_tutor_payment($1,$2,$3)', [org, pay, 'Tersilap kira']);
    await db.query('select reopen_tutor_month($1,$2,$3)', [org, tutor, prev]);
    await asUser(tutor);
    await expect(
      db.query('select reopen_tutor_month($1,$2,$3)', [org, tutor, prev]),
    ).rejects.toThrow();
    // Dibuka semula: tutor boleh membetulkan, kemudian tekan Selesai sekali lagi.
    await expect(record(cls, student, at(10))).resolves.toBeTruthy();
    await db.query('select close_tutor_month($1,$2)', [org, prev]);
    await expect(record(cls, student, at(11))).rejects.toThrow(/sudah dikunci/);
  });

  it('bulan semasa: butang Selesai hanya pada hari terakhir bulan', async () => {
    await asUser(tutor);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const now = Number(kl.slice(8, 10));
    const attempt = db.query('select close_tutor_month($1,$2)', [org, kl.slice(0, 7)]);
    if (now < lastDay) await expect(attempt).rejects.toThrow(/hari terakhir bulan/);
    else await expect(attempt).resolves.toBeTruthy();
  });
});
