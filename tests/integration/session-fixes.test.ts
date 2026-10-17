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

// Migrasi 41: julat muka surat.
describe('julat muka surat', () => {
  it('label ulasan memaparkan julat', async () => {
    await asUser(tutor);
    const sid = await create(daysAgo(10));
    await record(sid, {
      mastery: 'not_assessed',
      reading: { kind: 'quran', page: 531, page_to: 535 },
    });
    const c = await one<{ text: string }>(
      "select text from generated_parent_comments where session_id=$1 and status<>'retracted'",
      [sid],
    );
    // Tiada surah dipilih: surah dan juzuk dikira daripada muka surat (migrasi 45).
    expect(c.text).toContain("Bacaan: Surah Ar-Rahman – Al-Waqi'ah, juzuk 27, muka surat 531–535.");
  });
  it('julat terbalik ditolak', async () => {
    await asUser(tutor);
    const sid = await create(daysAgo(11));
    await expect(
      record(sid, { mastery: 'not_assessed', reading: { kind: 'quran', page: 10, page_to: 8 } }),
    ).rejects.toThrow(/akhir mesti selepas/);
  });
});

describe('invois tambahan', () => {
  it('sesi selepas invois dibayar masuk invois tambahan; tiada sesi dibilkan dua kali', async () => {
    await db.exec(`reset role; insert into program_fee_rates(organization_id,program_code,duration_minutes,amount_sen,effective_from)
      values('${org}','TAHFIZ',30,1000,'2026-01-01') on conflict do nothing;`);
    const day = (d: number) => `2026-06-${String(d).padStart(2, '0')}T20:00:00+08:00`;
    const add = async (d: number) => {
      await asUser(tutor);
      await record(await create(day(d)));
    };
    const invoices = async () => {
      await asUser(owner);
      await db.query('select generate_session_invoices($1,$2)', [org, '2026-06']);
      return (
        await db.query<{ id: string; idempotency_key: string; total_sen: string; status: string }>(
          "select id,idempotency_key,total_sen,status from invoices where period='2026-06' order by created_at,idempotency_key",
        )
      ).rows.map((r) => ({
        id: r.id,
        tambahan: /:\d+$/.test(r.idempotency_key),
        total: Number(r.total_sen),
        status: r.status,
      }));
    };
    await add(1);
    await add(2);
    expect((await invoices()).map((i) => i.total)).toEqual([2000]);
    await add(8);
    const [first] = await invoices();
    expect(first.total).toBe(3000);
    // Ibu bapa bayar pada pertengahan bulan.
    await db.query('select mark_invoice_paid($1,$2)', [org, first.id]);
    await add(15);
    await add(22);
    let list = await invoices();
    expect(list.map(({ tambahan, total, status }) => ({ tambahan, total, status }))).toEqual([
      { tambahan: false, total: 3000, status: 'paid' },
      { tambahan: true, total: 2000, status: 'issued' },
    ]);
    // Jana semula tanpa sesi baharu: tiada invois atau caj tambahan.
    expect((await invoices()).map((i) => i.total)).toEqual([3000, 2000]);
    // Sesi baharu dimasukkan ke invois tambahan yang belum dibayar.
    await add(29);
    list = await invoices();
    expect(list.map((i) => i.total)).toEqual([3000, 3000]);
    expect(
      Number(
        (
          await one<{ q: string }>(
            "select sum(ii.quantity) q from invoice_items ii join invoices i on i.id=ii.invoice_id where i.period='2026-06'",
          )
        ).q,
      ),
    ).toBe(6);
  });
});

describe('tutor nampak murid dengan tarikh mula akan datang', () => {
  it('murid, kelas, pendaftaran dan sesi kelihatan kepada tutornya sahaja', async () => {
    const kl = (days: number) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(
        new Date(Date.now() + days * 86400000),
      );
    await asUser(tutor);
    const kid = (
      await one<{ id: string }>('select tutor_enrol_student($1,$2,$3,30,$4,$5,$6,null,$7) id', [
        org,
        'Murid Mula Lusa',
        id(42),
        JSON.stringify([{ day: 3, time: '21:00' }]),
        '2027-12-31',
        kl(2),
        '0122222222',
      ])
    ).id;
    const seen = async () =>
      Number(
        (
          await one<{ n: number }>(
            `select (select count(*) from students where id=$1)
              + (select count(*) from enrollments where student_id=$1)
              + (select count(*) from classes c join enrollments e on e.class_id=c.id where e.student_id=$1) n`,
            [kid],
          )
        ).n,
      );
    expect(await seen()).toBe(3);
    // Sesi akan datang kelas itu turut kelihatan.
    expect(
      Number(
        (
          await one<{ n: number }>(
            'select count(*) n from class_sessions s join enrollments e on e.class_id=s.class_id where e.student_id=$1',
            [kid],
          )
        ).n,
      ),
    ).toBeGreaterThan(0);
    // Tutor lain tidak nampak.
    await db.exec(`reset role; insert into auth.users(id) values('${id(16)}');
      insert into staff_profiles(id,auth_user_id,display_name) values('${id(16)}','${id(16)}','Tutor Lain');
      insert into staff_memberships(organization_id,staff_id,role) values('${org}','${id(16)}','tutor');`);
    await asUser(id(16));
    expect(await seen()).toBe(0);
    // Tugasan yang telah tamat: tutor asal tidak lagi nampak.
    await db.exec(`reset role; update class_tutors set starts_on=current_date-10, ends_on=current_date-2
      where class_id=(select class_id from enrollments where student_id='${kid}')`);
    await asUser(tutor);
    expect(await seen()).toBe(0);
  });
});

describe('label bacaan surah dan juzuk (migrasi 45)', () => {
  it('pangkalan data dan portal menghasilkan label yang sama', async () => {
    const { readingLabel } = await import('../../src/lib/quran');
    await db.exec('reset role');
    for (const r of [
      { kind: 'quran', page: 100, page_to: 102, surah: 4 },
      { kind: 'quran', page: 105, page_to: 107, surah: 4, surah_to: 5 },
      { kind: 'quran', page: 591 },
      { kind: 'quran', page: 562, surah: 67, ayah_from: 1, ayah_to: 10 },
      { kind: 'quran', page: 293, surah: 18, juz: 15 },
      { kind: 'iqra', jilid: 3, page: 12 },
      { kind: 'quran', page: 100, page_to: 102, surah: 4, last_ayah: 45 },
      { kind: 'quran', page: 591, last_ayah: 19 },
    ]) {
      const db_label = (
        await one<{ l: string }>('select private.reading_label($1::jsonb) l', [JSON.stringify(r)])
      ).l;
      expect(db_label).toBe(readingLabel(r as Parameters<typeof readingLabel>[0]));
    }
    await expect(
      db.query('select private.reading_label($1::jsonb)', [
        JSON.stringify({ kind: 'quran', page: 100, surah: 5, surah_to: 4 }),
      ]),
    ).rejects.toThrow(/Surah tidak sah/);
    // Ayat terakhir melebihi bilangan ayat surah terakhir (Al-A'la 19 ayat) ditolak.
    await expect(
      db.query('select private.reading_label($1::jsonb)', [
        JSON.stringify({ kind: 'quran', page: 591, last_ayah: 20 }),
      ]),
    ).rejects.toThrow(/hanya 19 ayat/);
  });
});

describe('penilaian pilihan berbilang (migrasi 46)', () => {
  it('ulasan pangkalan data sama dengan portal; julat tahap; satu baris penilaian', async () => {
    const { generateComment } = await import('../../src/lib/core');
    await db.exec(`reset role; insert into assessment_options(organization_id,subject_id,group_code,code,label) values
      ('${org}','${id(41)}','skill','bacaan','bacaan'),('${org}','${id(41)}','skill','tajwid','tajwid'),
      ('${org}','${id(41)}','skill','sebutan','sebutan'),
      ('${org}','${id(41)}','participation','aktif','aktif'),('${org}','${id(41)}','participation','bertanya','bertanya soalan'),
      ('${org}','${id(41)}','focus','mad','hukum mad'),('${org}','${id(41)}','focus','makhraj','makhraj huruf'),
      ('${org}','${id(41)}','home_practice','ulang','Ulang bacaan di rumah'),('${org}','${id(41)}','home_practice','dengar','Dengar bacaan qari')
      on conflict do nothing;`);
    const options = (await db.query('select group_code,code,label,active from assessment_options'))
      .rows as Parameters<typeof generateComment>[3];
    await asUser(tutor);
    const sid = await create(daysAgo(6, 21));
    const latest = async () =>
      (
        await one<{ text: string }>(
          "select text from generated_parent_comments where session_id=$1 and status='published' order by created_at desc limit 1",
          [sid],
        )
      ).text;
    const multi = {
      mastery: 4,
      masteries: [4, 3],
      skill: 'bacaan',
      skills: ['bacaan', 'tajwid', 'sebutan'],
      participation: 'aktif',
      participations: ['aktif', 'bertanya'],
      focus: 'mad',
      focuses: ['mad', 'makhraj'],
      practice: 'ulang',
      practices: ['ulang', 'dengar'],
    };
    await record(sid, multi);
    const text = await latest();
    expect(text).toBe(
      'Alhamdulillah, murid menunjukkan penguasaan yang memuaskan hingga baik dalam bacaan, tajwid dan sebutan. Murid aktif dan bertanya soalan dalam kelas. Fokus latihan ialah hukum mad dan makhraj huruf. Ulang bacaan di rumah. Dengar bacaan qari.',
    );
    expect(text).toBe(generateComment('mengaji', 'present', multi, options));
    // Rekod lama (medan tunggal) kekal sama.
    const single = { mastery: 5, skill: 'tajwid', participation: 'aktif', focus: 'mad' };
    await record(sid, single);
    expect(await latest()).toBe(generateComment('mengaji', 'present', single, options));
    expect(await latest()).toContain('penguasaan yang sangat baik dalam tajwid.');
    // Satu baris penilaian bagi murid/sesi (bukan baris lama yang tertinggal).
    const rows = await db.query<{ skill: string; mastery: number }>(
      'select skill,mastery from assessment_responses where session_id=$1',
      [sid],
    );
    expect(rows.rows).toEqual([{ skill: 'tajwid', mastery: 5 }]);
    // Kod tidak sah ditolak.
    await expect(record(sid, { ...multi, skills: ['bacaan', 'tiada'] })).rejects.toThrow(
      /tidak sah/,
    );
    await expect(record(sid, { ...multi, masteries: [2, 9] })).rejects.toThrow(/penguasaan/);
  });
});
