import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  rateReference,
  skillOptions,
  participationOptions,
  focusOptions,
  practiceOptions,
  ORGANIZATION,
} from '../src/lib/core';
config({ path: '.env.local' });
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const {
    SUPABASE_SERVICE_ROLE_KEY: key,
    BOOTSTRAP_ADMIN_EMAIL: email,
    RATE_EFFECTIVE_FROM: effective,
  } = process.env;
  if (!url || !key || !email)
    throw new Error('Isi Supabase URL, service key dan BOOTSTRAP_ADMIN_EMAIL dalam .env.local');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const existing = await db.from('organizations').select('id').eq('slug', 'aqr').maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data)
    throw new Error(
      'Organisasi sudah wujud. Bootstrap tidak menimpa data; gunakan jemputan pemilik.',
    );
  // Trusted local operation, no public signup and no default passwords.
  const { data: user, error: authError } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (authError) throw authError;
  const { data: profile, error: profileError } = await db
    .from('staff_profiles')
    .insert({ auth_user_id: user.user.id, display_name: 'Pemilik AQR' })
    .select('id')
    .single();
  if (profileError) throw profileError;
  const { data: org, error: orgError } = await db
    .from('organizations')
    .insert({ name: ORGANIZATION, slug: 'aqr' })
    .select('id')
    .single();
  if (orgError) throw orgError;
  const membership = await db
    .from('staff_memberships')
    .insert({ organization_id: org.id, staff_id: profile.id, role: 'owner' });
  if (membership.error) throw membership.error;
  const { data: subjects, error: subjectError } = await db
    .from('subjects')
    .insert(
      [
        { slug: 'mengaji', name: 'Mengaji' },
        { slug: 'fardhu_ain', name: 'Fardhu Ain' },
        { slug: 'bahasa_arab', name: 'Bahasa Arab' },
      ].map((s) => ({ ...s, organization_id: org.id })),
    )
    .select('id,slug');
  if (subjectError) throw subjectError;
  const codes = [...new Set(rateReference.map((r) => r[0]))];
  const programs = await db.from('programs').insert(
    codes.map((code) => ({
      organization_id: org.id,
      code,
      name: rateReference.find((r) => r[0] === code)![1],
      subject_id: subjects.find(
        (s) =>
          s.slug ===
          (code.startsWith('FARDHU')
            ? 'fardhu_ain'
            : code === 'BAHASA_ARAB'
              ? 'bahasa_arab'
              : 'mengaji'),
      )!.id,
    })),
  );
  if (programs.error) throw programs.error;
  const opts = subjects.flatMap((s) =>
    [
      ['skill', skillOptions[s.slug]],
      ['participation', participationOptions],
      ['focus', focusOptions],
      ['home_practice', practiceOptions],
    ].flatMap(([group, list]) =>
      (list as readonly (readonly [string, string])[]).map(([code, label]) => ({
        organization_id: org.id,
        subject_id: s.id,
        group_code: group,
        code,
        label,
        rubric_version: '1',
      })),
    ),
  );
  const optionResult = await db.from('assessment_options').insert(opts);
  if (optionResult.error) throw optionResult.error;
  if (effective) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effective))
      throw new Error('RATE_EFFECTIVE_FROM mesti YYYY-MM-DD');
    const rates = await db.from('tutor_allowance_rates').insert(
      rateReference.map((r) => ({
        organization_id: org.id,
        program_code: r[0],
        duration_minutes: r[2],
        amount_sen: r[3],
        effective_from: effective,
        source: '04_KADAR_ELAUN_TUTOR_AQR.csv · tarikh disahkan oleh bootstrap admin',
        created_by: profile.id,
      })),
    );
    if (rates.error) throw rates.error;
  }
  console.log(
    `Bootstrap selesai. Kadar ${effective ? 'dimuatkan dengan tarikh disahkan' : 'belum dimuatkan: tetapkan tarikh berkuat kuasa melalui skrin kadar'}. Gunakan OTP e-mel untuk log masuk. Tiada murid/yuran contoh dimasukkan.`,
  );
}
main().catch((e: unknown) => {
  // Mesej ralat Supabase tidak mengandungi kunci; paparkan supaya punca boleh dikenal pasti.
  console.error(
    'Bootstrap gagal. Semak konfigurasi atau rekod separa dalam Supabase; tiada reset automatik.',
    e instanceof Error ? e.message : (e as { message?: string })?.message,
  );
  process.exitCode = 1;
});
