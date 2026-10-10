import 'server-only';
import { supabase } from './supabase';
import { Role } from '../core';
export class AccessError extends Error {
  constructor(
    message = 'Akses tidak dibenarkan',
    public status = 403,
  ) {
    super(message);
  }
}
export async function context() {
  const db = await supabase();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new AccessError('Sila sahkan e-mel untuk meneruskan', 401);
  const { data: profile } = await db
    .from('staff_profiles')
    .select('id, display_name')
    .eq('auth_user_id', user.id)
    .eq('active', true)
    .maybeSingle();
  if (profile) {
    const { data: membership } = await db
      .from('staff_memberships')
      .select('organization_id,role')
      .eq('staff_id', profile.id)
      .eq('active', true)
      .order('created_at')
      .limit(1)
      .maybeSingle();
    if (membership)
      return {
        db,
        userId: user.id,
        staffId: profile.id,
        guardianId: null,
        org: membership.organization_id as string,
        role: membership.role as Role,
        name: profile.display_name as string,
      };
  }
  const { data: guardian } = await db
    .from('guardians')
    .select('id, organization_id, full_name')
    .eq('auth_user_id', user.id)
    .eq('active', true)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (!guardian) throw new AccessError('Akaun belum diberi akses oleh pentadbir');
  return {
    db,
    userId: user.id,
    staffId: null,
    guardianId: guardian.id as string,
    org: guardian.organization_id as string,
    role: 'guardian' as Role,
    name: guardian.full_name as string,
  };
}
export type Context = Awaited<ReturnType<typeof context>>;
export function requireRoles(ctx: Context, roles: Role[]) {
  if (!roles.includes(ctx.role)) throw new AccessError();
}
export { loadData } from '../data';
export async function mutationGuard(request: Request) {
  const origin = request.headers.get('origin');
  const expected = new URL(process.env.APP_URL || 'http://localhost:3000').origin;
  if (!origin || origin !== expected) throw new AccessError('Permintaan daripada asal tidak sah');
  return context();
}
export function errorResponse(error: unknown) {
  const status = error instanceof AccessError ? error.status : 400;
  const message =
    error instanceof AccessError
      ? error.message
      : 'Permintaan gagal. Semak input atau hubungi pentadbir.';
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}
