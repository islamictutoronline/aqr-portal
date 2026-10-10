import { createClient } from '@supabase/supabase-js';
import { Role } from '../src/lib/core';
import { loadData } from '../src/lib/data';
import { executeMutation } from '../src/lib/mutations';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key);
// Session storage for shared devices; explicit opt-in local storage for trusted devices.
const storage = {
  getItem: (k: string) =>
    localStorage.getItem('aqr.trusted') === 'yes'
      ? localStorage.getItem(k)
      : sessionStorage.getItem(k),
  setItem: (k: string, v: string) => {
    (localStorage.getItem('aqr.trusted') === 'yes' ? localStorage : sessionStorage).setItem(k, v);
  },
  removeItem: (k: string) => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  },
};
export const db = createClient(url || 'https://unconfigured.supabase.co', key || 'unconfigured', {
  auth: {
    storage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});
export async function getContext() {
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new Error('Sila log masuk.');
  const { data: profile } = await db
    .from('staff_profiles')
    .select('id,display_name')
    .eq('auth_user_id', user.id)
    .eq('active', true)
    .maybeSingle();
  if (profile) {
    const { data: m } = await db
      .from('staff_memberships')
      .select('organization_id,role')
      .eq('staff_id', profile.id)
      .eq('active', true)
      .order('created_at')
      .limit(1)
      .maybeSingle();
    if (m)
      return {
        db,
        org: m.organization_id,
        role: m.role as Role,
        name: profile.display_name as string,
        staffId: profile.id as string,
        guardianId: undefined,
      };
  }
  const claimed = await db.rpc('claim_guardian_access');
  if (claimed.error) throw new Error('Akses portal belum dapat disahkan.');
  const { data: g } = await db
    .from('guardians')
    .select('id,organization_id,full_name')
    .eq('auth_user_id', user.id)
    .eq('active', true)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (!g) throw new Error('Akaun belum diluluskan atau anak belum dipautkan.');
  return {
    db,
    org: g.organization_id,
    role: 'guardian' as Role,
    name: g.full_name as string,
    staffId: undefined,
    guardianId: g.id as string,
  };
}
export async function staticTransport(input: string, init?: RequestInit) {
  try {
    const path = new URL(input, window.location.origin).pathname;
    if (path === '/api/logout') {
      const { error } = await db.auth.signOut({ scope: 'local' });
      if (error) throw error;
      return Response.json({ saved: true });
    }
    const ctx = await getContext();
    if (path === '/api/data') return Response.json(await loadData(ctx));
    if (path === '/api/mutate')
      return Response.json(await executeMutation(ctx, JSON.parse(String(init?.body))));
    if (path === '/api/google/status')
      return Response.json({
        connected: false,
        message: 'Google Sheets memerlukan backend OAuth; XLSX tersedia.',
      });
    // Privileged file and invitation operations remain server-side in Supabase Edge Functions.
    if (['/api/upload', '/api/logo', '/api/staff'].includes(path)) {
      const body =
        init?.body instanceof FormData
          ? init.body
          : { path, ...JSON.parse(String(init?.body || '{}')) };
      if (body instanceof FormData) body.set('operation', path);
      const { data, error } = await db.functions.invoke('aqr-admin', { body });
      if (error) throw new Error('Operasi memerlukan Edge Function aqr-admin yang dikonfigurasi.');
      return Response.json(data);
    }
    throw new Error('Operasi ini menggunakan backend legasi. Gunakan eksport XLSX pada Pages.');
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Permintaan gagal' },
      { status: 400 },
    );
  }
}
