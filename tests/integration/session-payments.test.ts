import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';

// Migrasi 52: bayar ikut sesi, prabayar, invois ikut penjaga dan sesi ganti.
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
const kl = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date());
const [y, m] = kl.split('-').map(Number);
const monthOf = (back: number) => {
  const d = new Date(Date.UTC(y, m - 1 - back, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const at = (month: string, day: number, hour = 21) =>
  `${month}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+08:00`;
let phone = 1;

async function enrol(name: string) {
  await asUser(tutor);
  const student = (
    await one<{ id: string }>('select tutor_enrol_student($1,$2,$3,30,$4,$5,null,null,$6) id', [
      org,
      name,
      iqra,
      JSON.stringify([{ day: 1, time: '20:00' }]),
      '2027-12-31',
      `01211111${String(phone++).padStart(2, '0')}`,
    ])
  ).id;
  const row = await one<{ class_id: string; guardian_id: string }>(
    'select e.class_id,g.guardian_id from enrollments e join student_guardians g on g.student_id=e.student_id where e.student_id=$1',
    [student],
  );
  return { student, cls: row.class_id, guardian: row.guardian_id };
}
async function record(cls: string, student: string, start: string) {
  await asUser(tutor);
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
    JSON.stringify({ mastery: 'not_assessed' }),
  ]);
}
async function invoicesOf(guardian: string, period: string) {
  return (
    await db.query<{ id: string; total_sen: string; status: string }>(
      "select id,total_sen,status from invoices where guardian_id=$1 and period=$2 and status<>'void' order by created_at",
      [guardian, period],
    )
  ).rows.map((r) => ({ id: r.id, total: Number(r.total_sen), status: r.status }));
}
async function generate(guardian: string, period: string) {
  await asUser(owner);
  await db.query('select generate_guardian_invoice($1,$2,$3)', [org, period, guardian]);
  return invoicesOf(guardian, period);
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
   insert into programs(id,organization_id,subject_id,code,name) values('${iqra}','${org}','${id(41)}','IQRA','Iqra''');
   insert into program_fee_rates(organization_id,program_code,duration_minutes,amount_sen,effective_from) values('${org}','IQRA',30,1000,'2020-01-01');`);
});

describe('invois ikut penjaga', () => {
  it('jana untuk seorang penjaga tidak menyentuh penjaga lain', async () => {
    const period = monthOf(1);
    const a = await enrol('Murid Penjaga A');
    const b = await enrol('Murid Penjaga B');
    await record(a.cls, a.student, at(period, 3));
    await record(b.cls, b.student, at(period, 3));
    expect(await generate(a.guardian, period)).toEqual([
      { id: expect.any(String), total: 1000, status: 'issued' },
    ]);
    expect(await invoicesOf(b.guardian, period)).toEqual([]);
  });
});

// "Sudah bayar": satu amaun bagi keluarga (sen); null = baki penuh.
async function pay(guardian: string, period: string, amount: number | null) {
  await asUser(owner);
  await db.query('select record_family_payment($1,$2,$3,null,$4)', [org, period, guardian, amount]);
}

describe('Sudah bayar ikut amaun', () => {
  it('bayar tengah bulan lebih daripada invois: lebihan jadi kredit sesi dan sesi kemudian tidak dicaj', async () => {
    const period = monthOf(2);
    const c = await enrol('Murid Kredit Tengah');
    await record(c.cls, c.student, at(period, 2));
    await record(c.cls, c.student, at(period, 9));
    // Ibu bapa bayar RM40 (4 sesi) pada pertengahan bulan; invois 2 sesi dikemas kini automatik.
    await pay(c.guardian, period, 4000);
    const [inv] = await invoicesOf(c.guardian, period);
    expect(inv).toMatchObject({ total: 2000, status: 'paid' });
    const credit = await one<{ n: number }>(
      'select sum(sessions)::int n from session_credits where student_id=$1',
      [c.student],
    );
    expect(credit.n).toBe(2);
    await record(c.cls, c.student, at(period, 16));
    await record(c.cls, c.student, at(period, 23));
    // Hujung bulan: dua sesi lagi ditampung kredit — tiada invois tambahan.
    expect((await generate(c.guardian, period)).length).toBe(1);
    const used = await one<{ sessions: number }>(
      'select sessions from session_credit_uses where student_id=$1 and period=$2',
      [c.student, period],
    );
    expect(used.sessions).toBe(2);
  });

  it('ansuran: separuh dahulu, baki kemudian (kosong = baki)', async () => {
    const period = monthOf(3);
    const c = await enrol('Murid Ansuran');
    for (const d of [2, 9, 16]) await record(c.cls, c.student, at(period, d));
    await pay(c.guardian, period, 1500);
    expect((await invoicesOf(c.guardian, period))[0].status).toBe('partially_paid');
    let paid = await one<{ n: number }>(
      'select sum(sessions)::int n from payment_sessions where student_id=$1',
      [c.student],
    );
    expect(paid.n).toBe(1);
    await pay(c.guardian, period, null);
    expect((await invoicesOf(c.guardian, period))[0].status).toBe('paid');
    paid = await one<{ n: number }>(
      'select sum(sessions)::int n from payment_sessions where student_id=$1',
      [c.student],
    );
    expect(paid.n).toBe(3);
  });

  it('lebihan yang tidak cukup untuk satu sesi ditolak; tutor tidak boleh merekod bayaran', async () => {
    const period = monthOf(5);
    const c = await enrol('Murid Amaun Ganjil');
    await record(c.cls, c.student, at(period, 2));
    await expect(pay(c.guardian, period, 2500)).rejects.toThrow(/tidak cukup untuk satu sesi/);
    await asUser(tutor);
    await expect(
      db.query('select record_family_payment($1,$2,$3)', [org, period, c.guardian]),
    ).rejects.toThrow();
  });

  it('bayar awal tanpa invois: 4 sesi dibayar, 3 berlaku, baki 1 sesi kekal sebagai kredit', async () => {
    const period = monthOf(4);
    const c = await enrol('Murid Bayar Awal');
    await pay(c.guardian, period, 4000);
    for (const d of [2, 9, 16]) await record(c.cls, c.student, at(period, d));
    expect(await generate(c.guardian, period)).toEqual([]);
    const left = await one<{ n: number }>(
      `select (select sum(sessions) from session_credits where student_id=$1)
        -(select coalesce(sum(sessions),0) from session_credit_uses where student_id=$1) n`,
      [c.student],
    );
    expect(Number(left.n)).toBe(1);
  });
});

describe('kredit adik-beradik', () => {
  it('lebihan dibahagi bergilir: RM80 tanpa baki = 4 sesi kredit setiap anak', async () => {
    const period = monthOf(6);
    const a = await enrol('Adik Satu');
    await asUser(tutor);
    // Adik-beradik: penjaga sama (no. WhatsApp sama).
    const sibling = (
      await one<{ id: string }>('select tutor_enrol_student($1,$2,$3,30,$4,$5,null,null,$6) id', [
        org,
        'Adik Dua',
        iqra,
        JSON.stringify([{ day: 2, time: '20:00' }]),
        '2027-12-31',
        (await one<{ phone: string }>('select phone from guardians where id=$1', [a.guardian]))
          .phone,
      ])
    ).id;
    await pay(a.guardian, period, 8000);
    const rows = (
      await db.query<{ student_id: string; sessions: number }>(
        'select student_id,sessions from session_credits where guardian_id=$1 and period=$2',
        [a.guardian, period],
      )
    ).rows;
    expect(rows.find((r) => r.student_id === a.student)?.sessions).toBe(4);
    expect(rows.find((r) => r.student_id === sibling)?.sessions).toBe(4);
  });
});

describe('sesi ganti terus kepada tutor', () => {
  it('sudah dibayar tetapi belum dilaksanakan = ganti bulan depan; bayar ikut invois = tiada ganti', async () => {
    const now = monthOf(0);
    const next = monthOf(-1);
    const quota = async (cls: string) =>
      one<{ n: number; carry: number }>(
        `select private.class_quota($1,$2,'${next}-15'::date) n, private.quota_carry($1,$2,'${next}-15'::date) carry`,
        [org, cls],
      );
    // Ibu bapa A bayar RM40 (4 sesi) awal bulan; tutor hanya melaksanakan 3.
    const a = await enrol('Murid Ganti Bayar Awal');
    await pay(a.guardian, now, 4000);
    for (const h of [0, 1, 2]) await record(a.cls, a.student, `${now}-01T0${h}:05:00+08:00`);
    expect(await quota(a.cls)).toEqual({ n: 5, carry: 1 });
    // Ibu bapa B bayar ikut invois (3 sesi yang dilaksanakan): tiada sesi ganti.
    const b = await enrol('Murid Ganti Ikut Invois');
    for (const h of [3, 4, 5]) await record(b.cls, b.student, `${now}-01T0${h}:05:00+08:00`);
    await pay(b.guardian, now, null);
    expect(await quota(b.cls)).toEqual({ n: 4, carry: 0 });
  });
});
