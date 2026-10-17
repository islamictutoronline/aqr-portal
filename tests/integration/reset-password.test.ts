import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFile, readdir } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';

// Migrasi 43: admin menetapkan semula kata laluan tutor yang terlupa.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org = id(1),
  owner = id(11),
  tutor = id(12),
  otherTutor = id(13),
  parent = id(14);
let db: PGlite;
async function asUser(user: string) {
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub','${user}',false); set role authenticated;`,
  );
}
const reset = (staff: string, pw: string) =>
  db.query('select reset_tutor_password($1,$2,$3)', [org, staff, pw]);

beforeAll(async () => {
  const src = await readFile('tests/integration/database.test.ts', 'utf8');
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(src.match(/"(create role anon;[^"]*)"/)![1]);
  await db.exec(`create schema extensions; create extension pgcrypto schema extensions;
    alter table auth.users add column encrypted_password text, add column raw_user_meta_data jsonb,
      add column updated_at timestamptz;`);
  for (const f of (await readdir('supabase/migrations')).filter((x) => x.endsWith('.sql')).sort())
    await db.exec(await readFile(`supabase/migrations/${f}`, 'utf8'));
  await db.exec(`insert into auth.users(id,raw_user_meta_data) values('${owner}',null),
     ('${tutor}','{"password_set":true,"full_name":"Tutor Satu"}'),('${otherTutor}',null),('${parent}',null);
   insert into organizations(id,slug) values('${org}','aqr-test');
   insert into staff_profiles(id,auth_user_id,display_name) values('${owner}','${owner}','Pemilik'),
     ('${tutor}','${tutor}','Tutor Satu'),('${otherTutor}','${otherTutor}','Tutor Dua');
   insert into staff_memberships(organization_id,staff_id,role) values('${org}','${owner}','owner'),
     ('${org}','${tutor}','tutor'),('${org}','${otherTutor}','tutor');`);
});

describe('reset kata laluan tutor', () => {
  it('admin menetapkan kata laluan sementara; tutor wajib menukarnya', async () => {
    await asUser(owner);
    await reset(tutor, 'Sementara123');
    await db.exec('reset role');
    const u = (
      await db.query<{ ok: boolean; meta: Record<string, unknown> }>(
        "select encrypted_password = extensions.crypt('Sementara123', encrypted_password) ok, raw_user_meta_data meta from auth.users where id=$1",
        [tutor],
      )
    ).rows[0];
    expect(u.ok).toBe(true);
    // Metadata lain dikekalkan; tanda tukar wajib ditetapkan.
    expect(u.meta).toEqual({
      full_name: 'Tutor Satu',
      password_set: false,
      must_change_password: true,
    });
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from audit_events where operation='RESET_TUTOR_PASSWORD'",
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it('kata laluan sementara yang lemah ditolak', async () => {
    await asUser(owner);
    await expect(reset(tutor, 'abc')).rejects.toThrow(/8 aksara/);
    await expect(reset(tutor, 'abcdefghij')).rejects.toThrow(/huruf dan nombor/);
  });
  it('tutor dan ibu bapa tidak boleh menetapkan semula kata laluan orang lain', async () => {
    await asUser(tutor);
    await expect(reset(otherTutor, 'Sementara123')).rejects.toThrow();
    await asUser(parent);
    await expect(reset(tutor, 'Sementara123')).rejects.toThrow();
  });
  it('pemilik/admin tidak boleh di-reset melalui fungsi ini', async () => {
    await asUser(owner);
    await expect(reset(owner, 'Sementara123')).rejects.toThrow(/sendiri/);
    await db.exec(`reset role; insert into auth.users(id) values('${id(15)}');
      insert into staff_profiles(id,auth_user_id,display_name) values('${id(15)}','${id(15)}','Admin');
      insert into staff_memberships(organization_id,staff_id,role) values('${org}','${id(15)}','admin');`);
    await asUser(owner);
    await expect(reset(id(15), 'Sementara123')).rejects.toThrow(/Tutor aktif/);
  });
});

describe('reset kata laluan: pembetulan migrasi 48', () => {
  it('akaun yang juga admin di organisasi lain ditolak', async () => {
    const org2 = id(2);
    await db.exec(`reset role; insert into organizations(id,slug) values('${org2}','lain');
      insert into staff_memberships(organization_id,staff_id,role) values('${org2}','${otherTutor}','admin');`);
    await asUser(owner);
    await expect(reset(otherTutor, 'Sementara123')).rejects.toThrow(/peranan pentadbir/);
  });
});
