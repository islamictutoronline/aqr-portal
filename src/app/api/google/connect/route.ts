import { NextResponse } from 'next/server';
import { randomBytes, createHash } from 'node:crypto';
import { context, requireRoles, errorResponse, AccessError } from '@/lib/server/access';
import { googleConfigured, redirectUri } from '@/lib/server/google';
export async function GET() {
  try {
    const ctx = await context();
    requireRoles(ctx, ['owner', 'admin']);
    if (!googleConfigured())
      throw new AccessError(
        'Google OAuth belum dikonfigurasi. Gunakan eksport Excel sementara itu.',
        409,
      );
    const state = randomBytes(32).toString('base64url'),
      verifier = randomBytes(32).toString('base64url');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri(),
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.file',
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent',
    }).toString();
    const response = NextResponse.redirect(url);
    response.cookies.set(
      'aqr_google_oauth',
      JSON.stringify({ state, verifier, userId: ctx.userId, org: ctx.org }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/google',
        maxAge: 600,
      },
    );
    return response;
  } catch (e) {
    return errorResponse(e);
  }
}
