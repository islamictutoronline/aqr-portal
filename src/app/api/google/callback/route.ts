import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { context, requireRoles, errorResponse, AccessError } from '@/lib/server/access';
import { exchangeGoogle, encrypt } from '@/lib/server/google';
export async function GET(request: Request) {
  try {
    const ctx = await context();
    requireRoles(ctx, ['owner', 'admin']);
    const store = await cookies();
    const raw = store.get('aqr_google_oauth')?.value;
    store.delete('aqr_google_oauth');
    if (!raw) throw new AccessError();
    const expected = JSON.parse(raw);
    const url = new URL(request.url);
    const state = url.searchParams.get('state') || '';
    const code = url.searchParams.get('code');
    if (
      !code ||
      state.length !== expected.state.length ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(expected.state)) ||
      expected.userId !== ctx.userId ||
      expected.org !== ctx.org
    )
      throw new AccessError();
    const token = await exchangeGoogle(code, expected.verifier);
    if (!String(token.scope).split(' ').includes('https://www.googleapis.com/auth/drive.file'))
      throw new AccessError('Kebenaran Google yang diperlukan tidak diberi', 403);
    const saved = await ctx.db.rpc('google_tokens', {
      org: ctx.org,
      encrypted: encrypt({ ...token, expires_at: Date.now() + Number(token.expires_in) * 1000 }),
    });
    if (saved.error) throw new Error('Penyimpanan gagal');
    return NextResponse.redirect(
      new URL('/settings', process.env.APP_URL || 'http://localhost:3000'),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
