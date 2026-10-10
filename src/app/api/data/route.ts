import { context, loadData, errorResponse } from '@/lib/server/access';
export async function GET() {
  try {
    const ctx = await context();
    return Response.json(await loadData(ctx));
  } catch (e) {
    return errorResponse(e);
  }
}
