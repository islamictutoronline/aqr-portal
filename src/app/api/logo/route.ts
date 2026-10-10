import { mutationGuard, requireRoles, errorResponse } from '@/lib/server/access';
import { uploadStorage } from '@/lib/server/storage';
export async function POST(request: Request) {
  try {
    const ctx = await mutationGuard(request);
    requireRoles(ctx, ['owner']);
    const file = (await request.formData()).get('file');
    if (!(file instanceof File) || file.size < 1 || file.size > 2097152)
      throw new Error('Saiz logo tidak sah');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sig = Buffer.from(bytes.slice(0, 8)).toString('hex');
    const type = sig.startsWith('ffd8ff')
      ? 'image/jpeg'
      : sig === '89504e470d0a1a0a'
        ? 'image/png'
        : null;
    if (!type || file.type !== type) throw new Error('Logo mesti JPG/PNG');
    const path = `${ctx.org}/${crypto.randomUUID()}.${type === 'image/jpeg' ? 'jpg' : 'png'}`;
    const upload = await uploadStorage()
      .from('academy-logos')
      .upload(path, bytes, { contentType: type });
    if (upload.error) throw new Error('Muat naik gagal');
    const saved = await ctx.db.from('organizations').update({ logo_path: path }).eq('id', ctx.org);
    if (saved.error) throw new Error('Logo tidak disimpan');
    return Response.json({ saved: true });
  } catch (e) {
    return errorResponse(e);
  }
}
