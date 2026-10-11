import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
let db: PGlite;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org = id(1),
  other = id(2),
  owner = id(11),
  finance = id(12),
  tutor = id(13),
  unrelated = id(14),
  parent = id(15),
  parentOther = id(16),
  academic = id(17);
async function asUser(user: string) {
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub','${user}',false); set role authenticated;`,
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update on storage.objects to authenticated;create function storage.foldername(name text)returns text[] language sql as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;",
  );
  for (const file of (await readdir('supabase/migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
  await db.exec(`insert into auth.users(id) select x::uuid from unnest(array['${owner}','${finance}','${tutor}','${unrelated}','${parent}','${parentOther}','${academic}'])x;
 insert into organizations(id,slug)values('${org}','aqr-test'),('${other}','other-test');
 insert into staff_profiles(id,auth_user_id,display_name)values('${owner}','${owner}','Owner'),('${finance}','${finance}','Finance'),('${tutor}','${tutor}','Tutor A'),('${unrelated}','${unrelated}','Tutor B'),('${academic}','${academic}','Academic');
 insert into staff_memberships(organization_id,staff_id,role)values('${org}','${owner}','owner'),('${org}','${finance}','admin'),('${org}','${tutor}','tutor'),('${org}','${unrelated}','tutor'),('${org}','${academic}','admin');
 insert into guardians(id,organization_id,auth_user_id,full_name)values('${id(21)}','${org}','${parent}','Parent A'),('${id(22)}','${org}','${parentOther}','Parent B');
 insert into students(id,organization_id,full_name)values('${id(31)}','${org}','Anonymous A'),('${id(32)}','${org}','Anonymous B'),('${id(33)}','${other}','Cross tenant');
 insert into student_guardians(organization_id,student_id,guardian_id,is_billing_contact)values('${org}','${id(31)}','${id(21)}',true),('${org}','${id(32)}','${id(22)}',true);
 insert into subjects(id,organization_id,slug,name)values('${id(41)}','${org}','mengaji','Mengaji');
 insert into programs(id,organization_id,subject_id,code,name)values('${id(42)}','${org}','${id(41)}','IQRA','Iqra');
 insert into classes(id,organization_id,program_id,name,max_capacity)values('${id(43)}','${org}','${id(42)}','Class A',10),('${id(44)}','${org}','${id(42)}','Class B',10);
 insert into class_tutors(organization_id,class_id,staff_id,starts_on)values('${org}','${id(43)}','${tutor}','2026-01-01'),('${org}','${id(44)}','${unrelated}','2026-01-01');
 insert into enrollments(organization_id,student_id,class_id,starts_on)values('${org}','${id(31)}','${id(43)}','2026-01-01'),('${org}','${id(32)}','${id(44)}','2026-01-01');
 insert into class_sessions(id,organization_id,class_id,tutor_id,starts_at,ends_at)values('${id(51)}','${org}','${id(43)}','${tutor}','2026-10-10 10:00+08','2026-10-10 10:20+08'),('${id(52)}','${org}','${id(44)}','${unrelated}','2026-10-10 10:00+08','2026-10-10 10:20+08');
 insert into assessment_options(organization_id,subject_id,group_code,code,label)values('${org}','${id(41)}','skill','bacaan','bacaan'),('${org}','${id(41)}','participation','aktif','aktif'),('${org}','${id(41)}','focus','sebutan','sebutan yang tepat');
 insert into student_private_notes(organization_id,student_id,text)values('${org}','${id(31)}','Never parent-visible');
 `);
});
afterAll(async () => {
  await db?.close();
});
describe('PostgreSQL RLS / transaction boundaries', () => {
  it('anonymous cannot read private rows', async () => {
    await db.exec('set role anon');
    await expect(db.query('select * from students')).rejects.toThrow();
    await db.exec('reset role');
  });
  it('guardian sees own child and no private notes / draft assessments', async () => {
    await asUser(parent);
    expect((await db.query('select id from students')).rows).toEqual([{ id: id(31) }]);
    expect((await db.query('select * from student_private_notes')).rows).toHaveLength(0);
    expect((await db.query('select * from assessment_responses')).rows).toHaveLength(0);
  });
  it('tutor cannot read another tutor class/student or inject a cross-tenant record', async () => {
    await asUser(tutor);
    expect((await db.query('select id from students')).rows).toEqual([{ id: id(31) }]);
    expect((await db.query('select id from class_sessions')).rows).toEqual([{ id: id(51) }]);
    await expect(
      db.exec(`insert into students(organization_id,full_name)values('${other}','Illegal')`),
    ).rejects.toThrow();
    expect(
      (await db.exec(`update students set organization_id='${other}' where id='${id(31)}'`))[0]
        .affectedRows,
    ).toBe(0);
  });
  it('owner cannot write rows into another org via WITH CHECK', async () => {
    await asUser(owner);
    await expect(
      db.exec(`insert into students(organization_id,full_name)values('${other}','Illegal')`),
    ).rejects.toThrow();
    await expect(
      db.exec(`update students set organization_id='${other}' where id='${id(31)}'`),
    ).rejects.toThrow();
  });
  it('composite FKs prohibit cross-organization references', async () => {
    await db.exec('reset role');
    await expect(
      db.exec(
        `insert into student_guardians(organization_id,student_id,guardian_id)values('${org}','${id(33)}','${id(21)}')`,
      ),
    ).rejects.toThrow();
  });
  it('tutor can save zero-typing draft; guardian cannot see it; unrelated tutor cannot write it', async () => {
    await asUser(tutor);
    await db.query(`select record_assessment($1,$2,$3,'present',$4,false)`, [
      org,
      id(51),
      id(31),
      JSON.stringify({ skill: 'bacaan', mastery: 3, participation: 'aktif', focus: 'sebutan' }),
    ]);
    await asUser(parent);
    expect((await db.query('select * from generated_parent_comments')).rows).toHaveLength(0);
    await asUser(unrelated);
    await expect(
      db.query(`select record_assessment($1,$2,$3,'present',$4,true)`, [
        org,
        id(51),
        id(31),
        JSON.stringify({ mastery: 'not_assessed' }),
      ]),
    ).rejects.toThrow();
  });
  it('publication creates a factual immutable snapshot isolated by family', async () => {
    await asUser(tutor);
    await db.query(`select record_assessment($1,$2,$3,'present',$4,true)`, [
      org,
      id(51),
      id(31),
      JSON.stringify({ skill: 'bacaan', mastery: 3, participation: 'aktif', focus: 'sebutan' }),
    ]);
    await asUser(parent);
    const own = await db.query<{ text: string }>('select text from generated_parent_comments');
    expect(own.rows).toHaveLength(1);
    expect(own.rows[0].text).toContain('memuaskan');
    await asUser(parentOther);
    expect((await db.query('select * from generated_parent_comments')).rows).toHaveLength(0);
  });
  it('unknown rate fails; unverified entries remain zero; verifier/checker differ; snapshot does not change', async () => {
    await asUser(finance);
    await expect(db.query('select review_session($1,$2,false)', [org, id(51)])).rejects.toThrow(
      'Tiada kadar',
    );
    await db.query('select set_rate($1,$2,20,700,$3,$4)', [
      org,
      'IQRA',
      '2026-01-01',
      'Source test',
    ]);
    await db.query('select review_session($1,$2,false)', [org, id(51)]);
    await expect(db.query('select review_session($1,$2,true)', [org, id(51)])).rejects.toThrow(
      'berlainan',
    );
    await asUser(owner);
    await db.query('select review_session($1,$2,true)', [org, id(51)]);
    await db.query('select set_rate($1,$2,20,800,$3,$4)', [org, 'IQRA', '2026-11-01', 'New rate']);
    expect(
      (
        await db.query<{ rate_snapshot_sen: number }>(
          'select rate_snapshot_sen from tutor_allowance_entries',
        )
      ).rows[0].rate_snapshot_sen,
    ).toBe(700);
    await expect(
      db.query('select record_assessment($1,$2,$3,$4,$5,true)', [
        org,
        id(51),
        id(31),
        'absent',
        JSON.stringify({ mastery: 'not_assessed' }),
      ]),
    ).rejects.toThrow('dikunci');
  });
  it('invoice and payments reconcile, cannot overallocate or duplicate receipts', async () => {
    await asUser(finance);
    const inv = (
      await db.query<{ create_invoice: string }>('select create_invoice($1,$2,$3,$4,$5,$6)', [
        org,
        id(21),
        '2026-10-20',
        '2026-10',
        JSON.stringify([
          { student_id: id(31), description: 'Configured fee', quantity: 1, unit_price_sen: 15000 },
        ]),
        'invoice-idem-1',
      ])
    ).rows[0].create_invoice;
    const p = (
      await db.query<{ submit_payment: string }>('select submit_payment($1,$2,$3,$4,$5,$6)', [
        org,
        id(21),
        10000,
        'bank_transfer',
        'REAL-REF',
        'payment-idem-1',
      ])
    ).rows[0].submit_payment;
    await expect(
      db.query('select verify_payment($1,$2,$3,$4)', [org, p, inv, 16000]),
    ).rejects.toThrow('melebihi');
    await db.query('select verify_payment($1,$2,$3,$4)', [org, p, inv, 10000]);
    await db.query('select verify_payment($1,$2,$3,$4)', [org, p, inv, 10000]);
    const invoice = await db.query<{ status: string }>('select status from invoices where id=$1', [
      inv,
    ]);
    expect(invoice.rows[0].status).toBe('partially_paid');
    expect((await db.query('select * from receipts')).rows).toHaveLength(1);
    expect(
      Number(
        (
          await db.query<{ n: string }>(
            'select total_sen-(select sum(amount_sen) from payment_allocations where invoice_id=$1) as n from invoices where id=$1',
            [inv],
          )
        ).rows[0].n,
      ),
    ).toBe(5000);
    // Admin tunggal mempunyai akses akademik dan kewangan.
    await asUser(academic);
    expect((await db.query('select * from invoices')).rows).toHaveLength(1);
    await asUser(parentOther);
    expect((await db.query('select * from invoices')).rows).toHaveLength(0);
    await asUser(parent);
    expect((await db.query('select * from invoices')).rows).toHaveLength(1);
    await expect(
      db.query('select verify_payment($1,$2,$3,$4)', [org, p, inv, 10000]),
    ).rejects.toThrow();
    await asUser(finance);
    await db.query('select reverse_payment($1,$2,$3)', [org, p, 'Duplicate bank entry']);
    expect((await db.query<{ status: string }>('select status from receipts')).rows[0].status).toBe(
      'void',
    );
    expect((await db.query<{ status: string }>('select status from invoices')).rows[0].status).toBe(
      'issued',
    );
  });
  it('maker-checker payout enforces separate approval and locks paid ledger', async () => {
    await asUser(finance);
    const b = (
      await db.query<{ payout_batch: string }>('select payout_batch($1,$2,$3)', [
        org,
        '2026-10',
        'create',
      ])
    ).rows[0].payout_batch;
    await expect(
      db.query('select payout_batch($1,$2,$3,$4)', [org, '2026-10', 'approve', b]),
    ).rejects.toThrow('berlainan');
    await asUser(owner);
    await db.query('select payout_batch($1,$2,$3,$4)', [org, '2026-10', 'approve', b]);
    await db.query('select payout_batch($1,$2,$3,$4,$5)', [
      org,
      '2026-10',
      'pay',
      b,
      'BANK-REFERENCE',
    ]);
    expect(
      (await db.query<{ status: string }>('select status from tutor_allowance_entries')).rows[0]
        .status,
    ).toBe('paid');
    expect((await db.exec('update tutor_allowance_entries set amount_sen=1'))[0].affectedRows).toBe(
      0,
    );
    expect(
      (await db.query<{ amount_sen: number }>('select amount_sen from tutor_allowance_entries'))
        .rows[0].amount_sen,
    ).toBe(700);
  });
  it('sensitive session tokens and Google token tables have no exposed policies', async () => {
    await asUser(owner);
    for (const table of ['guardian_sessions', 'guardian_invitations', 'google_connections'])
      expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0);
  });
  it('all application tables use RLS; browser cannot upload arbitrary storage objects', async () => {
    await db.exec('reset role');
    expect(
      (
        await db.query(
          "select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity",
        )
      ).rows,
    ).toHaveLength(0);
    await asUser(parent);
    await expect(
      db.exec(
        `insert into storage.objects(bucket_id,name)values('payment-proofs','${org}/${id(21)}/unsafe.pdf')`,
      ),
    ).rejects.toThrow();
  });
  it('rate, payout and export reservations cannot be created across tenants', async () => {
    await asUser(finance);
    await expect(
      db.query('select set_rate($1,$2,20,700,$3,$4)', [other, 'IQRA', '2026-01-01', 'Source']),
    ).rejects.toThrow();
    await expect(
      db.query('select reserve_export($1,$2,$3,$4,$5,$6)', [
        other,
        'tutor_allowance',
        '{}',
        1,
        'sha',
        'idem',
      ]),
    ).rejects.toThrow();
  });
  it('Google export reservations reject concurrent retry and reuse acknowledged URL', async () => {
    await asUser(owner);
    const query = 'select (reserve_export($1,$2,$3,$4,$5,$6)).id as id';
    const args = [org, 'tutor_allowance', '{"month":"2026-10"}', 1, 'hash', 'unique-export'];
    const result = await db.query<{ id: string }>(query, args);
    await expect(db.query(query, args)).rejects.toThrow('sedang diproses');
    await db.query("update export_jobs set status='completed',spreadsheet_url=$2 where id=$1", [
      result.rows[0].id,
      'https://docs.google.com/spreadsheets/d/owned',
    ]);
    expect((await db.query<{ id: string }>(query, args)).rows[0].id).toBe(result.rows[0].id);
  });
  it('fee plans create idempotent monthly invoices from configured assignments', async () => {
    await asUser(finance);
    await db.exec(
      `insert into fee_plans(id,organization_id,name,basis,amount_sen,due_day)values('${id(71)}','${org}','Configured monthly','monthly',15000,7)`,
    );
    await db.exec('reset role');
    const e = (
      await db.query<{ id: string }>('select id from enrollments where student_id=$1', [id(32)])
    ).rows[0].id;
    await asUser(finance);
    await db.query(
      'insert into fee_assignments(organization_id,enrollment_id,fee_plan_id,effective_from)values($1,$2,$3,$4)',
      [org, e, id(71), '2026-01-01'],
    );
    await db.query('select generate_invoices($1,$2)', [org, '2026-11']);
    await db.query('select generate_invoices($1,$2)', [org, '2026-11']);
    expect((await db.query("select * from invoices where period='2026-11'")).rows).toHaveLength(1);
    await expect(
      db.query(
        'insert into fee_assignments(organization_id,enrollment_id,fee_plan_id,effective_from)values($1,$2,$3,$4)',
        [org, e, id(71), '2026-02-01'],
      ),
    ).rejects.toThrow('bertindih');
  });
  it('curriculum publication requires attendance evidence and a matching unit', async () => {
    await db.exec('reset role');
    await db.exec(
      `insert into curriculum_units(id,organization_id,program_id,code,name)values('${id(81)}','${org}','${id(42)}','U1','Reading evidence')`,
    );
    await asUser(unrelated);
    await db.query('select record_assessment($1,$2,$3,$4,$5,true)', [
      org,
      id(52),
      id(32),
      'absent',
      JSON.stringify({ mastery: 'not_assessed' }),
    ]);
    await expect(
      db.query('select record_milestone($1,$2,$3,$4,4,$5,$6,true)', [
        org,
        id(52),
        id(32),
        id(81),
        '',
        '',
      ]),
    ).rejects.toThrow('bukti kehadiran');
    await db.query('select record_assessment($1,$2,$3,$4,$5,true)', [
      org,
      id(52),
      id(32),
      'present',
      JSON.stringify({ skill: 'bacaan', mastery: 4, participation: 'aktif', focus: 'sebutan' }),
    ]);
    await db.query('select record_milestone($1,$2,$3,$4,4,$5,$6,true)', [
      org,
      id(52),
      id(32),
      id(81),
      '',
      '',
    ]);
    await asUser(parent);
    expect((await db.query('select * from student_skill_levels')).rows).toHaveLength(0);
    await asUser(parentOther);
    expect((await db.query('select * from student_skill_levels')).rows).toHaveLength(1);
    await asUser(finance);
    expect((await db.query('select * from student_skill_levels')).rows).toHaveLength(1);
  });
  it('adjustment proposal requires a different approver and retains original snapshot', async () => {
    await asUser(finance);
    const e = (await db.query<{ id: string }>('select id from tutor_allowance_entries')).rows[0].id;
    const result = (
      await db.query<{ adjust_allowance: string }>('select adjust_allowance($1,$2,$3,$4)', [
        org,
        e,
        -100,
        'Corrected duration policy',
      ])
    ).rows[0].adjust_allowance;
    await expect(
      db.query('select adjust_allowance($1,$2,$3,$4,$5)', [
        org,
        e,
        0,
        'Approve adjustment',
        result,
      ]),
    ).rejects.toThrow('berlainan');
    await asUser(owner);
    await db.query('select adjust_allowance($1,$2,$3,$4,$5)', [
      org,
      e,
      0,
      'Approve adjustment',
      result,
    ]);
    expect(
      (
        await db.query<{ rate_snapshot_sen: number }>(
          'select rate_snapshot_sen from tutor_allowance_entries',
        )
      ).rows[0].rate_snapshot_sen,
    ).toBe(700);
  });
  it('monthly drafts are private, approved reports are family scoped and immutable', async () => {
    await asUser(owner);
    const result = await db.query<{ id: string }>('select prepare_student_report($1,$2,$3) as id', [
      org,
      id(31),
      '2026-10',
    ]);
    const report = result.rows[0].id;
    await asUser(parent);
    expect((await db.query('select * from monthly_student_reports')).rows).toHaveLength(0);
    await expect(
      db.query('select prepare_student_report($1,$2,$3)', [org, id(31), '2026-10']),
    ).rejects.toThrow();
    await expect(db.query('select approve_student_report($1,$2)', [org, report])).rejects.toThrow();
    await asUser(unrelated);
    expect((await db.query('select * from monthly_student_reports')).rows).toHaveLength(0);
    await asUser(owner);
    await db.query('select approve_student_report($1,$2)', [org, report]);
    await expect(
      db.query('select prepare_student_report($1,$2,$3)', [org, id(31), '2026-10']),
    ).rejects.toThrow('dikunci');
    await expect(db.query("update monthly_student_reports set snapshot='{}'")).rejects.toThrow();
    await asUser(parentOther);
    expect((await db.query('select * from monthly_student_reports')).rows).toHaveLength(0);
    await asUser(parent);
    const rows = (
      await db.query<{ snapshot: { student_name: string } }>(
        'select snapshot from monthly_student_reports',
      )
    ).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].snapshot.student_name).toBe('Anonymous A');
    expect(JSON.stringify(rows)).not.toContain('Never parent-visible');
  });
  it('parents cannot submit payments or upload metadata even when owning the child', async () => {
    await asUser(parent);
    await expect(
      db.query('select submit_payment($1,$2,100,$3,$4,$5)', [
        org,
        id(21),
        'cash',
        'parent-test',
        'parent-readonly',
      ]),
    ).rejects.toThrow('baca sahaja');
    await expect(
      db.query('select private.submit_payment_before_readonly($1,$2,100,$3,$4,$5)', [
        org,
        id(21),
        'cash',
        'parent-test',
        'parent-bypass',
      ]),
    ).rejects.toThrow();
  });
  it('manual report delivery cannot target another family or tenant', async () => {
    await asUser(owner);
    const report = (await db.query<{ id: string }>('select id from monthly_student_reports'))
      .rows[0].id;
    await expect(
      db.query('select record_report_delivery($1,$2,$3,$4)', [org, report, id(22), 'sent']),
    ).rejects.toThrow();
    await expect(
      db.query('select record_report_delivery($1,$2,$3,$4)', [other, report, id(21), 'sent']),
    ).rejects.toThrow();
    await db.query('select record_report_delivery($1,$2,$3,$4)', [org, report, id(21), 'prepared']);
    await db.query('select record_report_delivery($1,$2,$3,$4)', [org, report, id(21), 'sent']);
    expect((await db.query('select * from report_deliveries')).rows).toHaveLength(1);
    await asUser(parent);
    expect((await db.query('select * from report_deliveries')).rows).toHaveLength(0);
    await expect(
      db.query('select record_report_delivery($1,$2,$3,$4)', [org, report, id(21), 'sent']),
    ).rejects.toThrow();
  });
  it('tutor registers a student only in an assigned class without assigning guardians', async () => {
    await asUser(tutor);
    await expect(
      db.query('select tutor_register_student($1,$2,$3)', [org, id(44), 'New child']),
    ).rejects.toThrow();
    await expect(
      db.query('select tutor_register_student($1,$2,$3)', [other, id(43), 'New child']),
    ).rejects.toThrow();
    const newStudent = (
      await db.query<{ id: string }>('select tutor_register_student($1,$2,$3) as id', [
        org,
        id(43),
        'New fictional child',
      ])
    ).rows[0].id;
    expect((await db.query('select id from students where id=$1', [newStudent])).rows).toHaveLength(
      1,
    );
    await asUser(parent);
    expect((await db.query('select id from students where id=$1', [newStudent])).rows).toHaveLength(
      0,
    );
  });
  it('tutor creates an own class, is auto-assigned and registers a student; guardians cannot', async () => {
    await asUser(tutor);
    const cls = (
      await db.query<{ id: string }>('select tutor_create_class($1,$2,$3,$4,$5,$6) as id', [
        org,
        id(42),
        'Iqra tutor class',
        'group',
        'online',
        6,
      ])
    ).rows[0].id;
    expect(
      (await db.query('select staff_id from class_tutors where class_id=$1', [cls])).rows,
    ).toEqual([{ staff_id: tutor }]);
    const kid = (
      await db.query<{ id: string }>('select tutor_register_student($1,$2,$3) as id', [
        org,
        cls,
        'Tutor class child',
      ])
    ).rows[0].id;
    expect(
      (await db.query('select id from enrollments where student_id=$1', [kid])).rows,
    ).toHaveLength(1);
    await expect(
      db.query('select tutor_create_class($1,$2,$3,$4,$5,$6)', [
        other,
        id(42),
        'X',
        'group',
        'online',
        6,
      ]),
    ).rejects.toThrow();
    await asUser(parent);
    await expect(
      db.query('select tutor_create_class($1,$2,$3,$4,$5,$6)', [
        org,
        id(42),
        'Parent class',
        'group',
        'online',
        6,
      ]),
    ).rejects.toThrow();
  });
  it('individual model: tutor adds student by program, schedules own sessions, adds programs', async () => {
    await asUser(owner);
    await db.query(
      "insert into programs(id,organization_id,subject_id,code,name)values($1,$2,$3,'FARDHU_AIN_KAFA','Fardhu Ain')",
      [id(45), org, id(41)],
    );
    await asUser(tutor);
    const kid = (
      await db.query<{ id: string }>('select tutor_add_student($1,$2,$3) as id', [
        org,
        'Individual child',
        id(42),
      ])
    ).rows[0].id;
    const cls = (
      await db.query<{ class_id: string; name: string; mode: string; max_capacity: number }>(
        'select e.class_id,c.name,c.mode,c.max_capacity from enrollments e join classes c on c.id=e.class_id where e.student_id=$1',
        [kid],
      )
    ).rows;
    expect(cls).toHaveLength(1);
    expect(cls[0]).toMatchObject({
      name: 'Individual child · Iqra',
      mode: 'one_to_one',
      max_capacity: 1,
    });
    const sid = (
      await db.query<{ id: string }>('select create_session($1,$2,$3,$4,$5,$6) as id', [
        org,
        cls[0].class_id,
        tutor,
        '2026-10-12T12:00:00Z',
        30,
        '',
      ])
    ).rows[0].id;
    expect(sid).toBeTruthy();
    await expect(
      db.query('select create_session($1,$2,$3,$4,$5,$6)', [
        org,
        cls[0].class_id,
        unrelated,
        '2026-10-12T13:00:00Z',
        30,
        '',
      ]),
    ).rejects.toThrow();
    await expect(
      db.query('select add_student_program($1,$2,$3)', [org, kid, id(42)]),
    ).rejects.toThrow();
    await db.query('select add_student_program($1,$2,$3)', [org, kid, id(45)]);
    await asUser(unrelated);
    await expect(
      db.query('select add_student_program($1,$2,$3)', [org, kid, id(45)]),
    ).rejects.toThrow();
    await asUser(academic);
    await db.query('select add_student_program($1,$2,$3,$4)', [org, kid, id(42), unrelated]);
    expect(
      (await db.query('select id from enrollments where student_id=$1', [kid])).rows,
    ).toHaveLength(3);
    await asUser(parent);
    await expect(
      db.query('select tutor_add_student($1,$2,$3)', [org, 'Parent child', id(42)]),
    ).rejects.toThrow();
  });
  it('tutor enrols a student with a weekly schedule; sessions appear; removal keeps history', async () => {
    await asUser(tutor);
    const slots = JSON.stringify([
      { day: 1, time: '20:00' },
      { day: 4, time: '21:00' },
    ]);
    await expect(
      db.query('select tutor_enrol_student($1,$2,$3,$4,$5)', [org, 'Bad', id(42), 45, slots]),
    ).rejects.toThrow();
    await expect(
      db.query('select tutor_enrol_student($1,$2,$3,$4,$5)', [
        org,
        'Dup child',
        id(42),
        30,
        JSON.stringify([
          { day: 1, time: '20:00' },
          { day: 1, time: '20:00' },
        ]),
      ]),
    ).rejects.toThrow();
    const kid = (
      await db.query<{ id: string }>('select tutor_enrol_student($1,$2,$3,$4,$5) as id', [
        org,
        'Weekly child',
        id(42),
        30,
        slots,
      ])
    ).rows[0].id;
    const cls = (
      await db.query<{ class_id: string }>(
        "select class_id from enrollments where student_id=$1 and status='active'",
        [kid],
      )
    ).rows[0].class_id;
    const rules = (
      await db.query<{ effective_to: string }>(
        "select to_char(effective_to,'YYYY-MM-DD') as effective_to from class_schedules where class_id=$1",
        [cls],
      )
    ).rows;
    expect(rules).toHaveLength(2);
    expect(rules.every((r) => r.effective_to === '2027-12-31')).toBe(true);
    const sessions = (
      await db.query<{ starts_at: string; tutor_id: string; ends_at: string }>(
        'select starts_at,ends_at,tutor_id from class_sessions where class_id=$1',
        [cls],
      )
    ).rows;
    expect(sessions.length).toBeGreaterThanOrEqual(8);
    expect(sessions.every((x) => x.tutor_id === tutor)).toBe(true);
    expect(
      sessions.every(
        (x) => new Date(x.ends_at).getTime() - new Date(x.starts_at).getTime() === 30 * 60000,
      ),
    ).toBe(true);
    expect(
      (await db.query<{ n: number }>('select extend_schedule($1) as n', [org])).rows[0].n,
    ).toBe(0);
    await asUser(unrelated);
    await expect(db.query('select remove_student($1,$2)', [org, kid])).rejects.toThrow();
    await asUser(parent);
    await expect(db.query('select remove_student($1,$2)', [org, kid])).rejects.toThrow();
    await asUser(tutor);
    await db.query('select remove_student($1,$2)', [org, kid]);
    await asUser(owner);
    expect(
      (await db.query<{ status: string }>('select status from students where id=$1', [kid])).rows[0]
        .status,
    ).toBe('archived');
    expect(
      (
        await db.query(
          "select id from class_sessions where class_id=$1 and status='scheduled' and starts_at>now()",
          [cls],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it('tutor reschedules own unrecorded session; schedule refill does not duplicate', async () => {
    await asUser(tutor);
    const kid = (
      await db.query<{ id: string }>('select tutor_enrol_student($1,$2,$3,$4,$5) as id', [
        org,
        'Reschedule child',
        id(42),
        30,
        JSON.stringify([{ day: 2, time: '19:00' }]),
      ])
    ).rows[0].id;
    const first = (
      await db.query<{ id: string; class_id: string }>(
        "select s.id,s.class_id from class_sessions s join enrollments e on e.class_id=s.class_id where e.student_id=$1 and s.status='scheduled' order by s.starts_at limit 1",
        [kid],
      )
    ).rows[0];
    const before = (
      await db.query('select id from class_sessions where class_id=$1', [first.class_id])
    ).rows.length;
    const moved = (
      await db.query<{ id: string }>('select change_session($1,$2,$3,$4,$5) as id', [
        org,
        first.id,
        'rescheduled',
        'Ditukar oleh tutor',
        '2026-12-30T12:30:00Z',
      ])
    ).rows[0].id;
    expect(moved).not.toBe(first.id);
    expect(
      (
        await db.query<{ status: string }>('select status from class_sessions where id=$1', [
          first.id,
        ])
      ).rows[0].status,
    ).toBe('rescheduled');
    await db.query('select extend_schedule($1)', [org]);
    expect(
      (await db.query('select id from class_sessions where class_id=$1', [first.class_id])).rows,
    ).toHaveLength(before + 1);
    await asUser(unrelated);
    await expect(
      db.query('select change_session($1,$2,$3,$4,$5)', [
        org,
        moved,
        'rescheduled',
        'Bukan tutor ini',
        '2026-12-31T12:30:00Z',
      ]),
    ).rejects.toThrow();
  });
  it('tutor re-records attendance and voids a mistaken session; voided is excluded', async () => {
    await asUser(tutor);
    const kid = (
      await db.query<{ id: string }>('select tutor_enrol_student($1,$2,$3,$4,$5) as id', [
        org,
        'Void child',
        id(42),
        30,
        JSON.stringify([{ day: 3, time: '18:00' }]),
      ])
    ).rows[0].id;
    const sid = (
      await db.query<{ id: string }>(
        "select s.id from class_sessions s join enrollments e on e.class_id=s.class_id where e.student_id=$1 and s.status='scheduled' order by s.starts_at limit 1",
        [kid],
      )
    ).rows[0].id;
    const record = (status: string) =>
      db.query('select record_assessment($1,$2,$3,$4,$5,$6)', [
        org,
        sid,
        kid,
        status,
        JSON.stringify({ mastery: 'not_assessed' }),
        true,
      ]);
    await record('absent');
    await record('excused');
    expect(
      (
        await db.query<{ status: string }>('select status from attendance where session_id=$1', [
          sid,
        ])
      ).rows,
    ).toEqual([{ status: 'excused' }]);
    await asUser(unrelated);
    await expect(db.query('select void_session($1,$2)', [org, sid])).rejects.toThrow();
    await asUser(tutor);
    await db.query('select void_session($1,$2)', [org, sid]);
    // Slot berjadual dikosongkan (kekal untuk direkod semula), kehadiran dibuang.
    expect(
      (await db.query<{ status: string }>('select status from class_sessions where id=$1', [sid]))
        .rows[0].status,
    ).toBe('scheduled');
    expect(
      (await db.query('select id from attendance where session_id=$1', [sid])).rows,
    ).toHaveLength(0);
    // Sesi tambahan (bukan slot jadual) dibatalkan.
    const extraCls = (
      await db.query<{ class_id: string }>('select class_id from class_sessions where id=$1', [sid])
    ).rows[0].class_id;
    const extra = (
      await db.query<{ id: string }>('select create_session($1,$2,$3,$4,$5,$6) as id', [
        org,
        extraCls,
        tutor,
        new Date(Date.now() - 2 * 86400000 + 3600000 * 3).toISOString(),
        30,
        '',
      ])
    ).rows[0].id;
    await db.query('select void_session($1,$2)', [org, extra]);
    expect(
      (await db.query<{ status: string }>('select status from class_sessions where id=$1', [extra]))
        .rows[0].status,
    ).toBe('cancelled');
    expect(
      (
        await db.query(
          "select id from generated_parent_comments where session_id=$1 and status='published'",
          [sid],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it('tutor records a backdated class before the registration date', async () => {
    await asUser(tutor);
    const kid = (
      await db.query<{ id: string }>('select tutor_enrol_student($1,$2,$3,$4,$5) as id', [
        org,
        'Backdated child',
        id(42),
        30,
        JSON.stringify([{ day: 5, time: '17:00' }]),
      ])
    ).rows[0].id;
    const cls = (
      await db.query<{ class_id: string }>(
        "select class_id from enrollments where student_id=$1 and status='active'",
        [kid],
      )
    ).rows[0].class_id;
    const past = new Date(Date.now() - 20 * 86400000).toISOString();
    const sid = (
      await db.query<{ id: string }>('select create_session($1,$2,$3,$4,$5,$6) as id', [
        org,
        cls,
        tutor,
        past,
        30,
        '',
      ])
    ).rows[0].id;
    await db.query('select record_assessment($1,$2,$3,$4,$5,$6)', [
      org,
      sid,
      kid,
      'present',
      JSON.stringify({ mastery: 'not_assessed' }),
      true,
    ]);
    expect(
      (await db.query<{ status: string }>('select status from class_sessions where id=$1', [sid]))
        .rows[0].status,
    ).toBe('completed');
    const tooOld = new Date(Date.now() - 400 * 86400000).toISOString();
    await expect(
      db.query('select create_session($1,$2,$3,$4,$5,$6)', [org, cls, tutor, tooOld, 30, '']),
    ).rejects.toThrow();
  });
  it('tutor moves a recorded session to a past date; attendance kept; no duplicate slot', async () => {
    await asUser(tutor);
    const kid = (
      await db.query<{ id: string }>('select tutor_enrol_student($1,$2,$3,$4,$5) as id', [
        org,
        'Move child',
        id(42),
        30,
        JSON.stringify([{ day: 6, time: '09:00' }]),
      ])
    ).rows[0].id;
    const first = (
      await db.query<{ id: string; class_id: string }>(
        "select s.id,s.class_id from class_sessions s join enrollments e on e.class_id=s.class_id where e.student_id=$1 and s.status='scheduled' order by s.starts_at limit 1",
        [kid],
      )
    ).rows[0];
    await db.query('select record_assessment($1,$2,$3,$4,$5,$6)', [
      org,
      first.id,
      kid,
      'present',
      JSON.stringify({ mastery: 'not_assessed' }),
      true,
    ]);
    const count = async () =>
      (await db.query('select id from class_sessions where class_id=$1', [first.class_id])).rows
        .length;
    const before = await count();
    const past = new Date(Date.now() - 30 * 86400000).toISOString();
    await db.query('select move_session($1,$2,$3)', [org, first.id, past]);
    expect(
      (
        await db.query<{ status: string }>('select status from attendance where session_id=$1', [
          first.id,
        ])
      ).rows,
    ).toEqual([{ status: 'present' }]);
    await db.query('select extend_schedule($1)', [org]);
    expect(await count()).toBe(before);
    await asUser(unrelated);
    await expect(
      db.query('select move_session($1,$2,$3)', [org, first.id, new Date().toISOString()]),
    ).rejects.toThrow();
  });
  it('enrolment starts on the first of the month by default and generates past slots', async () => {
    await asUser(tutor);
    const kid = (
      await db.query<{ id: string }>('select tutor_enrol_student($1,$2,$3,$4,$5) as id', [
        org,
        'Start child',
        id(42),
        30,
        JSON.stringify([
          { day: 2, time: '20:00' },
          { day: 3, time: '19:40' },
        ]),
      ])
    ).rows[0].id;
    const first = (
      await db.query<{ d: string }>(
        "select to_char(min((s.starts_at at time zone 'Asia/Kuala_Lumpur')::date),'YYYY-MM-DD') d from class_sessions s join enrollments e on e.class_id=s.class_id where e.student_id=$1",
        [kid],
      )
    ).rows[0].d;
    const monthStart = new Date().toISOString().slice(0, 8) + '01';
    expect(first >= monthStart).toBe(true);
    expect(
      first <= new Date(Date.parse(monthStart) + 7 * 86400000).toISOString().slice(0, 10),
    ).toBe(true);
  });
  it('moving a session back onto its slot clears the vacated mark; no duplicates', async () => {
    await asUser(tutor);
    const kid = (
      await db.query<{ id: string }>('select tutor_enrol_student($1,$2,$3,$4,$5) as id', [
        org,
        'Back and forth child',
        id(42),
        30,
        JSON.stringify([{ day: 4, time: '16:00' }]),
      ])
    ).rows[0].id;
    const first = (
      await db.query<{ id: string; class_id: string; starts_at: string }>(
        'select s.id,s.class_id,s.starts_at from class_sessions s join enrollments e on e.class_id=s.class_id where e.student_id=$1 order by s.starts_at limit 1',
        [kid],
      )
    ).rows[0];
    const original = new Date(first.starts_at).toISOString();
    const count = async () =>
      (await db.query('select id from class_sessions where class_id=$1', [first.class_id])).rows
        .length;
    const before = await count();
    await db.query('select move_session($1,$2,$3)', [
      org,
      first.id,
      new Date(Date.parse(original) + 3600000).toISOString(),
    ]);
    await db.query('select move_session($1,$2,$3)', [org, first.id, original]);
    const ex = (
      await db.query<{ exceptions: string[] }>(
        'select exceptions from class_schedules where class_id=$1',
        [first.class_id],
      )
    ).rows[0].exceptions;
    expect(ex).toEqual([]);
    await db.query('select extend_schedule($1)', [org]);
    expect(await count()).toBe(before);
  });
  it('admin removes a tutor: access revoked, future sessions cancelled, name kept in history', async () => {
    await asUser(tutor);
    await expect(db.query('select remove_tutor($1,$2)', [org, unrelated])).rejects.toThrow();
    await asUser(academic);
    await expect(db.query('select remove_tutor($1,$2)', [org, owner])).rejects.toThrow();
    await expect(db.query('select remove_tutor($1,$2)', [org, academic])).rejects.toThrow();
    const future = new Date(Date.now() + 5 * 86400000).toISOString();
    const sid = (
      await db.query<{ id: string }>('select create_session($1,$2,$3,$4,$5,$6) as id', [
        org,
        id(44),
        unrelated,
        future,
        30,
        '',
      ])
    ).rows[0].id;
    await db.query('select remove_tutor($1,$2)', [org, unrelated]);
    expect(
      (await db.query<{ status: string }>('select status from class_sessions where id=$1', [sid]))
        .rows[0].status,
    ).toBe('cancelled');
    const dir = (
      await db.query<{ id: string; active: boolean }>(
        'select id,active from staff_directory_v2($1)',
        [org],
      )
    ).rows.find((r) => r.id === unrelated);
    expect(dir).toMatchObject({ active: false });
    await asUser(unrelated);
    expect((await db.query('select id from students')).rows).toHaveLength(0);
    await expect(
      db.query('select create_session($1,$2,$3,$4,$5,$6)', [
        org,
        id(44),
        unrelated,
        future,
        30,
        '',
      ]),
    ).rejects.toThrow();
  });
  it('tutor payment details: own or admin only, never other tutors or guardians', async () => {
    await asUser(tutor);
    await db.query('select save_payment_details($1,$2,$3,$4,$5,$6,$7)', [
      org,
      tutor,
      '',
      '',
      'Bank Ujian',
      'Tutor A',
      '1234 5678 90',
    ]);
    await expect(
      db.query('select save_payment_details($1,$2,$3,$4,$5,$6,$7)', [
        org,
        tutor,
        '',
        '',
        'Bank',
        'X',
        'ABC123',
      ]),
    ).rejects.toThrow();
    await expect(
      db.query('select save_payment_details($1,$2,$3,$4,$5,$6,$7)', [
        org,
        academic,
        '',
        '',
        'Bank',
        'X',
        '123456',
      ]),
    ).rejects.toThrow();
    expect(
      (await db.query<{ job_title: string }>('select job_title from tutor_payment_details')).rows,
    ).toEqual([{ job_title: 'Guru Online Part Time' }]);
    await asUser(academic);
    expect((await db.query('select id from tutor_payment_details')).rows).toHaveLength(1);
    await asUser(parent);
    expect((await db.query('select id from tutor_payment_details')).rows).toHaveLength(0);
  });
  it('session invoices: absent and makeup charged, excused not; unpaid invoice regenerates', async () => {
    await db.exec(`reset role; insert into program_fee_rates(organization_id,program_code,duration_minutes,amount_sen,effective_from)
      values('${org}','IQRA',30,1000,'2026-01-01') on conflict do nothing;`);
    await asUser(tutor);
    const record = async (iso: string, status: string) => {
      const sid = (
        await db.query<{ id: string }>('select create_session($1,$2,$3,$4,$5,$6) as id', [
          org,
          id(43),
          tutor,
          iso,
          30,
          '',
        ])
      ).rows[0].id;
      await db.query('select record_assessment($1,$2,$3,$4,$5,$6)', [
        org,
        sid,
        id(31),
        status,
        JSON.stringify({ mastery: 'not_assessed' }),
        true,
      ]);
    };
    await record('2026-08-03T12:00:00Z', 'absent');
    await record('2026-08-04T12:00:00Z', 'excused');
    await asUser(parent);
    await expect(
      db.query('select generate_session_invoices($1,$2)', [org, '2026-08']),
    ).rejects.toThrow();
    await asUser(academic);
    await db.query('select generate_session_invoices($1,$2)', [org, '2026-08']);
    const items = async () =>
      (
        await db.query<{ quantity: number; unit_price_sen: string }>(
          "select ii.quantity,ii.unit_price_sen from invoice_items ii join invoices i on i.id=ii.invoice_id where i.idempotency_key like 'sessions:2026-08:%'",
        )
      ).rows.map((r) => ({ quantity: Number(r.quantity), price: Number(r.unit_price_sen) }));
    expect(await items()).toEqual([{ quantity: 1, price: 1000 }]);
    await asUser(tutor);
    await record('2026-08-05T12:00:00Z', 'makeup');
    await asUser(academic);
    await db.query('select generate_session_invoices($1,$2)', [org, '2026-08']);
    expect(await items()).toEqual([{ quantity: 2, price: 1000 }]);
    expect(
      (
        await db.query<{ total_sen: string }>(
          "select total_sen from invoices where idempotency_key like 'sessions:2026-08:%'",
        )
      ).rows.map((r) => Number(r.total_sen)),
    ).toEqual([2000]);
  });
  it('admin registers a student directly into any active class; guardians cannot', async () => {
    await asUser(academic);
    const created = (
      await db.query<{ id: string }>('select tutor_register_student($1,$2,$3) as id', [
        org,
        id(44),
        'Admin fictional child',
      ])
    ).rows[0].id;
    expect(
      (
        await db.query('select class_id from enrollments where student_id=$1 and class_id=$2', [
          created,
          id(44),
        ])
      ).rows,
    ).toHaveLength(1);
    await asUser(parent);
    await expect(
      db.query('select tutor_register_student($1,$2,$3)', [org, id(43), 'Parent child']),
    ).rejects.toThrow();
  });
  it('self-registration stays pending and cannot self-promote', async () => {
    const newcomer = id(90);
    await db.exec('reset role');
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,'fictional@example.test',now())",
      [newcomer],
    );
    await asUser(newcomer);
    const application = (
      await db.query<{ id: string }>("select request_tutor('aqr-test','Fictional applicant') as id")
    ).rows[0].id;
    expect((await db.query('select * from students')).rows).toHaveLength(0);
    await expect(
      db.query('select review_tutor_application($1,$2,true)', [org, application]),
    ).rejects.toThrow();
    await asUser(owner);
    await db.query('select review_tutor_application($1,$2,true)', [org, application]);
    await asUser(newcomer);
    expect(
      (await db.query<{ role: string }>('select role from staff_memberships')).rows[0].role,
    ).toBe('tutor');
    expect((await db.query('select * from students')).rows).toHaveLength(0);
  });
  it('guardian email claim requires confirmed matching Auth email', async () => {
    const newcomer = id(91);
    await db.exec('reset role');
    await db.query("insert into auth.users(id,email) values($1,'guardian@example.test')", [
      newcomer,
    ]);
    await db.query(
      "insert into guardians(id,organization_id,full_name,email)values($1,$2,'Fictional guardian','guardian@example.test')",
      [id(92), org],
    );
    await db.query(
      'insert into student_guardians(organization_id,student_id,guardian_id) values($1,$2,$3)',
      [org, id(31), id(92)],
    );
    await asUser(newcomer);
    await expect(db.query('select claim_guardian_access()')).rejects.toThrow();
    await db.exec('reset role');
    await db.query('update auth.users set email_confirmed_at=now() where id=$1', [newcomer]);
    await asUser(newcomer);
    await db.query('select claim_guardian_access()');
    expect((await db.query('select id from students')).rows).toEqual([{ id: id(31) }]);
  });
  it('enrolment saves the billing guardian: default name, phone normalised, siblings share one guardian', async () => {
    await asUser(tutor);
    const slots = JSON.stringify([{ day: 2, time: '19:00' }]);
    const enrol = async (name: string, gname: string | null, phone: string | null) =>
      (
        await db.query<{ id: string }>(
          'select tutor_enrol_student($1,$2,$3,30,$4,$5,null,$6,$7) as id',
          [org, name, id(42), slots, '2027-12-31', gname, phone],
        )
      ).rows[0].id;
    const guardianOf = async (sid: string) =>
      (
        await db.query<{ full_name: string; phone: string; gid: string }>(
          'select g.full_name, g.phone, g.id gid from student_guardians sg join guardians g on g.id=sg.guardian_id where sg.student_id=$1 and sg.is_billing_contact',
          [sid],
        )
      ).rows;
    await expect(enrol('Bad phone child', null, '12')).rejects.toThrow(/WhatsApp tidak sah/);
    const a = await enrol('Aisyah Kakak', null, '012-345 6789');
    // Tutor boleh melihat penjaga murid sendiri.
    expect(await guardianOf(a)).toEqual([
      expect.objectContaining({ full_name: 'Ibu/Bapa Aisyah Kakak', phone: '+60123456789' }),
    ]);
    const b = await enrol('Adik Aisyah', 'Puan Salmah', '+60 12-345 6789');
    const [ga] = await guardianOf(a);
    const [gb] = await guardianOf(b);
    expect(gb.gid).toBe(ga.gid);
    expect(gb.full_name).toBe('Puan Salmah');
    // Kemas kini penjaga kemudian; tutor lain tidak dibenarkan.
    await db.query('select save_student_guardian($1,$2,$3,$4)', [
      org,
      a,
      'Encik Ali',
      '0198887777',
    ]);
    expect((await guardianOf(a))[0]).toEqual(
      expect.objectContaining({ full_name: 'Encik Ali', phone: '+60198887777' }),
    );
    expect((await guardianOf(b))[0].phone).toBe('+60123456789');
    await asUser(unrelated);
    await expect(
      db.query('select save_student_guardian($1,$2,$3,$4)', [org, a, 'X', '0111111111']),
    ).rejects.toThrow();
    expect(await guardianOf(a)).toHaveLength(0);
    // Admin boleh menjana invois kerana pautan penjaga bil kini wujud.
    await db.exec('reset role');
    expect(
      Number(
        (
          await db.query<{ n: number }>(
            'select count(*) n from student_guardians where student_id in ($1,$2) and is_billing_contact',
            [a, b],
          )
        ).rows[0].n,
      ),
    ).toBe(2);
  });
  it('reset-test-data.sql empties operational data and tutors but keeps admins and settings', async () => {
    await db.exec('reset role');
    const programs = Number(
      (await db.query<{ n: number }>('select count(*) n from programs')).rows[0].n,
    );
    expect(
      Number((await db.query<{ n: number }>('select count(*) n from class_sessions')).rows[0].n),
    ).toBeGreaterThan(0);
    await db.exec(await readFile('supabase/reset-test-data.sql', 'utf8'));
    const count = async (sql: string) => Number((await db.query<{ n: number }>(sql)).rows[0].n);
    for (const t of [
      'students',
      'guardians',
      'classes',
      'class_sessions',
      'attendance',
      'invoices',
      'monthly_student_reports',
      'tutor_applications',
      'audit_events',
    ])
      expect(await count(`select count(*) n from ${t}`)).toBe(0);
    expect(
      await count("select count(*) n from staff_memberships where role not in ('owner','admin')"),
    ).toBe(0);
    expect(
      await count(
        'select count(*) n from staff_profiles where id in ($$' +
          tutor +
          '$$,$$' +
          unrelated +
          '$$)',
      ),
    ).toBe(0);
    expect(
      await count('select count(*) n from staff_memberships where staff_id=$$' + owner + '$$'),
    ).toBe(1);
    // Hanya akaun pentadbir yang tinggal dalam Auth; tutor, pemohon dan ibu bapa dibuang.
    expect(await count('select count(*) n from auth.users')).toBe(
      await count('select count(*) n from staff_profiles'),
    );
    expect(await count('select count(*) n from programs')).toBe(programs);
    expect(await count('select count(*) n from tutor_allowance_rates')).toBeGreaterThan(0);
    // Pemilik masih boleh bekerja selepas reset.
    await asUser(owner);
    expect(await count('select count(*) n from organizations')).toBeGreaterThan(0);
  });
});
