import { context, requireRoles, errorResponse } from '@/lib/server/access';
import { googleConfigured } from '@/lib/server/google';
export async function GET() {
  try {
    const ctx = await context();
    requireRoles(ctx, ['owner', 'admin']);
    const { data, error } = await ctx.db.rpc('google_tokens', { org: ctx.org });
    if (error) throw new Error('Status gagal');
    return Response.json({ configured: googleConfigured(), connected: Boolean(data) });
  } catch (e) {
    return errorResponse(e);
  }
}
