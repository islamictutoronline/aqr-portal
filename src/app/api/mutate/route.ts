import { mutationGuard, errorResponse } from '@/lib/server/access';
import { executeMutation } from '@/lib/mutations';
export async function POST(request: Request) {
  try {
    const ctx = await mutationGuard(request);
    if (Number(request.headers.get('content-length') ?? 0) > 32000)
      throw new Error('Input terlalu besar');
    return Response.json(await executeMutation(ctx, await request.json()));
  } catch (e) {
    return errorResponse(e);
  }
}
