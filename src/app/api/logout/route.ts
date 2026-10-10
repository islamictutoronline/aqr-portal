import { mutationGuard, errorResponse } from '@/lib/server/access';
export async function POST(request: Request) {
  try {
    const ctx = await mutationGuard(request);
    await ctx.db.auth.signOut({ scope: 'local' });
    return Response.json({ saved: true });
  } catch (e) {
    return errorResponse(e);
  }
}
