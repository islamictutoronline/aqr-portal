import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { mutationGuard, requireRoles, errorResponse } from '@/lib/server/access';
import { limit } from '@/lib/server/rate-limit';
export async function POST(request: Request) {
  try {
    const ctx = await mutationGuard(request);
    requireRoles(ctx, ['owner']);
    limit(`invite:${ctx.userId}`, 5);
    const input = z
      .object({
        email: z.email(),
        role: z.enum(['tutor', 'admin', 'guardian']),
        guardianId: z.uuid().optional(),
      })
      .parse(await request.json());
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
      throw new Error('Kunci jemputan server belum dikonfigurasi');
    if (input.role === 'guardian') {
      const { data } = await ctx.db
        .from('guardians')
        .select('id,email,auth_user_id')
        .eq('organization_id', ctx.org)
        .eq('id', input.guardianId || '')
        .maybeSingle();
      if (
        !data ||
        String(data.email).toLowerCase() !== input.email.toLowerCase() ||
        data.auth_user_id
      )
        throw new Error('Penjaga tidak sepadan atau sudah dipautkan');
    }
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
      redirectTo: `${process.env.APP_URL || 'http://localhost:3000'}/auth/callback`,
    });
    if (error || !data.user) throw new Error('Jemputan gagal');
    if (input.role === 'guardian') {
      const result = await admin
        .from('guardians')
        .update({ auth_user_id: data.user.id })
        .eq('organization_id', ctx.org)
        .eq('id', input.guardianId!)
        .is('auth_user_id', null);
      if (result.error) throw new Error('Pautan penjaga gagal');
    } else {
      const { data: profile, error: profileError } = await admin
        .from('staff_profiles')
        .insert({ auth_user_id: data.user.id, display_name: input.email.split('@')[0] })
        .select('id')
        .single();
      if (profileError) throw new Error('Profil gagal');
      const result = await admin
        .from('staff_memberships')
        .insert({ organization_id: ctx.org, staff_id: profile.id, role: input.role });
      if (result.error) throw new Error('Keahlian gagal');
    }
    await ctx.db.rpc('log_invitation', { org: ctx.org, target: data.user.id });
    return Response.json({ saved: true });
  } catch (e) {
    return errorResponse(e);
  }
}
