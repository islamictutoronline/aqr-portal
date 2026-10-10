import { z } from 'zod';
import { supabase } from '@/lib/server/supabase';
import { limit } from '@/lib/server/rate-limit';
import { errorResponse, AccessError } from '@/lib/server/access';
export async function POST(request: Request) {
  try {
    if (
      request.headers.get('origin') !==
      new URL(process.env.APP_URL || 'http://localhost:3000').origin
    )
      throw new AccessError();
    const { email } = z.object({ email: z.email().max(254) }).parse(await request.json());
    limit(`auth:${email.toLowerCase()}`);
    const db = await supabase();
    await db.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${process.env.APP_URL || 'http://localhost:3000'}/auth/callback`,
      },
    });
    // Uniform response deliberately avoids disclosing whether a child/family account exists.
    return Response.json({
      message: 'Jika akaun telah dijemput, pautan pengesahan dihantar. Semak e-mel anda.',
    });
  } catch (e) {
    return errorResponse(e);
  }
}
