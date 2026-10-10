import { z } from 'zod';
import { mutationGuard, errorResponse, AccessError, requireRoles } from '@/lib/server/access';
import { limit } from '@/lib/server/rate-limit';
import { uploadStorage } from '@/lib/server/storage';
export async function POST(request: Request) {
  try {
    const ctx = await mutationGuard(request);
    requireRoles(ctx, ['owner', 'admin']);
    limit(`upload:${ctx.userId}`, 10);
    const form = await request.formData();
    const pid = z.uuid().parse(form.get('paymentId'));
    const file = form.get('file');
    if (!(file instanceof File) || file.size < 1 || file.size > 5242880)
      throw new Error('Saiz tidak sah');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const signature = Buffer.from(bytes.slice(0, 8)).toString('hex');
    const type = signature.startsWith('ffd8ff')
      ? 'image/jpeg'
      : signature === '89504e470d0a1a0a'
        ? 'image/png'
        : Buffer.from(bytes.slice(0, 5)).toString() === '%PDF-'
          ? 'application/pdf'
          : null;
    if (!type || file.type !== type) throw new Error('Jenis fail tidak sah');
    const { data } = await ctx.db
      .from('payments')
      .select('id,status')
      .eq('organization_id', ctx.org)
      .eq('id', pid)
      .maybeSingle();
    if (!data || data.status !== 'pending_verification') throw new AccessError();
    const path = `${ctx.org}/${pid}/${crypto.randomUUID()}.${type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : 'pdf'}`;
    const upload = await uploadStorage()
      .from('payment-proofs')
      .upload(path, bytes, { contentType: type, upsert: false });
    if (upload.error) throw new Error('Muat naik gagal');
    const saved = await ctx.db.from('payment_evidence').insert({
      organization_id: ctx.org,
      payment_id: pid,
      path,
      content_type: type,
      size_bytes: file.size,
      uploaded_by: ctx.userId,
    });
    if (saved.error) throw new Error('Metadata bukti gagal disimpan');
    return Response.json({ saved: true });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function GET(request: Request) {
  try {
    const ctx = await (await import('@/lib/server/access')).context();
    const id = z.uuid().parse(new URL(request.url).searchParams.get('id'));
    const { data } = await ctx.db
      .from('payment_evidence')
      .select('path')
      .eq('organization_id', ctx.org)
      .eq('id', id)
      .maybeSingle();
    if (!data) throw new AccessError('Bukti tidak ditemui', 404);
    const signed = await ctx.db.storage.from('payment-proofs').createSignedUrl(data.path, 60);
    if (signed.error) throw new Error('Akses fail gagal');
    return Response.json({ url: signed.data.signedUrl });
  } catch (e) {
    return errorResponse(e);
  }
}
