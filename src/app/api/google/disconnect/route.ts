import { mutationGuard, requireRoles, errorResponse } from '@/lib/server/access';
import { decrypt } from '@/lib/server/google';
export async function POST(request: Request) {
  try {
    const ctx = await mutationGuard(request);
    requireRoles(ctx, ['owner', 'admin']);
    const { data } = await ctx.db.rpc('google_tokens', { org: ctx.org });
    if (data) {
      const token = decrypt(data);
      const r = await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: String(token.refresh_token || token.access_token) }),
      });
      if (!r.ok && r.status !== 400) throw new Error('Pembatalan Google gagal');
    }
    const result = await ctx.db.rpc('google_tokens', { org: ctx.org, revoke: true });
    if (result.error) throw new Error('Pembatalan gagal');
    return Response.json({ saved: true });
  } catch (e) {
    return errorResponse(e);
  }
}
