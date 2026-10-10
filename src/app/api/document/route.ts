import { z } from 'zod';
import { context, errorResponse, AccessError } from '@/lib/server/access';
import { demoData } from '@/lib/demo';
import { ORGANIZATION, formatMoney, Row } from '@/lib/core';
const escape = (v: unknown) =>
  String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const type = z.enum(['invoice', 'receipt']).parse(params.get('type'));
    const id = z.string().max(100).parse(params.get('id'));
    const demo = params.get('demo') === '1';
    const table = type === 'invoice' ? 'invoices' : 'receipts';
    let record: Row | null | undefined;
    if (demo) record = demoData()[table].find((r) => r.id === id);
    else {
      const ctx = await context();
      const { data, error } = await ctx.db
        .from(table)
        .select(
          type === 'invoice' ? 'id,number,total_sen,status,due_on' : 'id,number,details,status',
        )
        .eq('organization_id', ctx.org)
        .eq('id', z.uuid().parse(id))
        .maybeSingle();
      if (error) throw new AccessError();
      record = data as unknown as Row | null;
    }
    if (!record) throw new AccessError('Dokumen tidak ditemui', 404);
    const amount =
      type === 'invoice'
        ? Number(record.total_sen)
        : Number((record.details as Record<string, unknown>)?.amount_sen);
    const html = `<!doctype html><html lang="ms"><head><meta charset="utf-8"><title>${escape(record.number)} · AQR</title><style>body{font:16px Georgia,serif;padding:50px;max-width:800px;margin:auto;color:#182942}h1{font-size:28px}dl{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:40px}dd{text-align:right}button{padding:12px;margin-top:25px}@media print{button{display:none}}</style></head><body><h1>${ORGANIZATION}</h1><p>${demo ? 'DEMO FIKSYEN · ' : ''}${type === 'invoice' ? 'Invois' : 'Resit'}</p><dl><dt>Nombor</dt><dd>${escape(record.number)}</dd><dt>Jumlah</dt><dd>${formatMoney(amount)}</dd><dt>Status</dt><dd>${escape(record.status)}</dd></dl><p>MYR · Asia/Kuala_Lumpur</p><button onclick="window.print()">Cetak / Simpan PDF</button></body></html>`;
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'none'",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
