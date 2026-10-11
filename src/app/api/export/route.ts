import { z } from 'zod';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { context, loadData, mutationGuard, errorResponse, AccessError } from '@/lib/server/access';
import { demoData, scopeDemo } from '@/lib/demo';
import { REPORTS, ReportCode, allowedReport, fileName, monthLabel } from '@/lib/core';
import { buildReport, toCsv } from '@/lib/reporting';
import { toXlsx } from '@/lib/workbook';
import { sheetsExport } from '@/lib/server/google';
async function run(request: Request, sheets = false) {
  let ctx: Awaited<ReturnType<typeof context>> | undefined, jobId: string | undefined;
  try {
    const p = new URL(request.url).searchParams;
    const code = z.enum(Object.keys(REPORTS) as [ReportCode, ...ReportCode[]]).parse(p.get('code'));
    const month = z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .parse(p.get('month'));
    const demo = p.get('demo') === '1';
    const format = z.enum(['xlsx', 'csv', 'sheets']).parse(p.get('format'));
    if (format === 'sheets' && !sheets)
      throw new AccessError('Gunakan POST untuk eksport Google', 405);
    if (sheets && demo) throw new AccessError('Demo tidak boleh membuat eksport Google', 409);
    const demoRole = z
      .enum(['owner', 'admin', 'tutor', 'guardian'])
      .parse(p.get('role') || 'owner');
    if (!demo) ctx = sheets ? await mutationGuard(request) : await context();
    if (ctx && !allowedReport(ctx.role, code)) throw new AccessError();
    const report = buildReport(
      ctx ? await loadData(ctx) : scopeDemo(demoData(), demoRole),
      code,
      month,
      ctx?.role || demoRole,
      ctx?.name || 'Pengguna demo',
      demo,
    );
    const digest = createHash('sha256').update(JSON.stringify(report.rows)).digest('hex');
    let existingId: string | null = null;
    if (ctx && sheets) {
      const { data, error } = await ctx.db.rpc('reserve_export', {
        org: ctx.org,
        code,
        query_filters: { month, format },
        row_total: report.rows.length,
        digest,
        idem: `${code}:${month}:${digest}`,
      });
      if (error)
        throw new AccessError(
          'Eksport sedang diproses atau tidak boleh ditempah. Cuba semula.',
          409,
        );
      const job = Array.isArray(data) ? data[0] : data;
      jobId = job.id;
      existingId = job.spreadsheet_id;
      if (job.status === 'completed' && job.spreadsheet_url)
        return Response.json({ url: job.spreadsheet_url });
    } else if (ctx) {
      const { data, error } = await ctx.db
        .from('export_jobs')
        .insert({
          organization_id: ctx.org,
          requester_id: ctx.userId,
          report_type: code,
          filters: { month, format },
          status: 'pending',
          row_count: report.rows.length,
          checksum: digest,
        })
        .select('id')
        .single();
      if (error) throw new Error('Audit eksport gagal');
      jobId = data.id;
    }
    if (sheets && ctx) {
      const url = await sheetsExport(ctx, report, jobId!, existingId);
      const result = await ctx.db
        .from('export_jobs')
        .update({ status: 'completed', spreadsheet_url: url })
        .eq('id', jobId!);
      if (result.error) throw new Error('Audit gagal');
      return Response.json({ url });
    }
    const filename = fileName(['AQR', REPORTS[code], monthLabel(month)], format);
    const logo = await readFile(join(process.cwd(), 'public/brand/aqr-mark.png')).catch(
      () => undefined,
    );
    const body =
      format === 'xlsx'
        ? new Uint8Array(await toXlsx(report, logo ? new Uint8Array(logo) : undefined))
        : toCsv(report);
    if (ctx && jobId) {
      const result = await ctx.db
        .from('export_jobs')
        .update({ status: 'completed' })
        .eq('id', jobId);
      if (result.error) throw new Error('Audit gagal');
    }
    return new Response(body, {
      headers: {
        'Content-Type':
          format === 'xlsx'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    if (ctx && jobId)
      await ctx.db
        .from('export_jobs')
        .update({ status: 'failed', error_code: 'EXPORT_FAILED' })
        .eq('id', jobId);
    return errorResponse(e);
  }
}
export const GET = (request: Request) => run(request);
export const POST = (request: Request) => run(request, true);
