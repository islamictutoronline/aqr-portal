import { NextResponse } from 'next/server';
import { supabase } from '@/lib/server/supabase';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const db = await supabase();
  const code = url.searchParams.get('code');
  const hash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') === 'invite' ? 'invite' : 'email';
  const result = code
    ? await db.auth.exchangeCodeForSession(code)
    : hash
      ? await db.auth.verifyOtp({ token_hash: hash, type })
      : { error: true };
  return NextResponse.redirect(
    new URL(
      result.error ? '/login?error=verification' : '/dashboard',
      process.env.APP_URL || 'http://localhost:3000',
    ),
  );
}
