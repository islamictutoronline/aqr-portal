import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { AccessError } from './access';
export function uploadStorage() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new AccessError('Muat naik memerlukan konfigurasi storan server. Hubungi admin.', 409);
  // Used for uploads only, after user RLS lookup and byte signature validation.
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  ).storage;
}
