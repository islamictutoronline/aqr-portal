import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseCsv, historicalSummary } from '../src/lib/historical';
import { rateReference } from '../src/lib/core';
import { loadReferenceWorkbook } from '../src/lib/import-workbook';
config({ path: '.env.local' });
async function main() {
  const args = process.argv.slice(2),
    file = args.find((a) => a.startsWith('--file='))?.slice(7);
  if (!file || !args.includes('--private-staging'))
    throw new Error(
      'Gunakan --file=/laluan/peribadi.csv --private-staging; bukan import demo/produksi automatik.',
    );
  const content = await readFile(file, 'utf8'),
    rows = parseCsv(content);
  if (rows.some((r) => !/^2026-09-\d{2}$/.test(r.date)))
    throw new Error('Fail mesti mempunyai tarikh September 2026.');
  const workbookPath = args.find((a) => a.startsWith('--workbook='))?.slice(11);
  const quotas: {
    source_row: number;
    reported_name: string | null;
    program_code: string;
    duration_minutes: number;
    planned_count: number;
    note: string;
  }[] = [];
  if (workbookPath) {
    const workbook = await loadReferenceWorkbook(await readFile(workbookPath));
    const sheet = workbook.getWorksheet('RINGKASAN_MURID');
    if (!sheet) throw new Error('Workbook tiada RINGKASAN_MURID');
    sheet.eachRow((row, index) => {
      if (index > 5 && row.getCell(1).text === '2026-09' && row.getCell(2).text) {
        const name = row.getCell(2).text;
        quotas.push({
          source_row: index,
          reported_name: name.startsWith('BELUM PASTI') ? null : name,
          program_code: row.getCell(3).text,
          duration_minutes: Number(row.getCell(4).value),
          planned_count: Number(row.getCell(5).value),
          note: row.getCell(11).text,
        });
      }
    });
    if (quotas.some((q) => !Number.isInteger(q.planned_count)))
      throw new Error('Kuota workbook tidak sah');
  }
  const planned = quotas.length ? quotas.reduce((n, q) => n + q.planned_count, 0) : 92;
  const summary = historicalSummary(
    rows,
    rateReference.map((r) => ({
      program_code: r[0],
      duration_minutes: r[2],
      amount_sen: r[3],
      effective_from: '2026-09-01',
    })),
    planned,
  );
  console.log(
    `Pratonton peribadi: ${summary.reported} rekod; kuota sumber ${planned}; anggaran ${summary.indicative_sen} sen; elaun layak 0 sen; kumpulan tarikh kabur ${summary.ambiguousGroups}. Nama tidak dicetak.`,
  );
  if (!args.includes('--apply')) return;
  if (!quotas.length)
    throw new Error(
      '--apply memerlukan --workbook=/laluan/07_TEMPLATE_LAPORAN_AQR.xlsx supaya kuota individu dikekalkan.',
    );
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY,
    org = process.env.PRIVATE_IMPORT_ORG_ID;
  if (!url || !key || !org)
    throw new Error('Tetapkan Supabase dan PRIVATE_IMPORT_ORG_ID bagi staging peribadi.');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const checked = await db.from('organizations').select('id').eq('id', org).single();
  if (checked.error) throw new Error('Organisasi tidak sah');
  const sourceHash = createHash('sha256').update(content).digest('hex');
  const existingBatch = await db
    .from('private_import_batches')
    .select('id')
    .eq('organization_id', org)
    .eq('source_digest', sourceHash)
    .maybeSingle();
  if (existingBatch.error) throw new Error('Semakan batch gagal');
  let batchId = existingBatch.data?.id;
  if (!batchId) {
    const created = await db
      .from('private_import_batches')
      .insert({
        organization_id: org,
        source_digest: sourceHash,
        period: '2026-09',
        reported_count: summary.reported,
        planned_count: summary.planned,
        indicative_sen: summary.indicative_sen,
      })
      .select('id')
      .single();
    if (created.error) throw new Error('Batch import gagal');
    batchId = created.data.id;
  }
  const records = rows.map((r, i) => ({
    organization_id: org,
    batch_id: batchId,
    source_key: `${sourceHash}:${i + 1}`,
    reported_name: r.review_flag === 'Semak nama' ? null : r.student_name_reported,
    program_code: r.program_code,
    duration_minutes: Number(r.duration_minutes),
    reported_date: r.date,
    note: r.lesson_note,
    status: 'needs_review',
  }));
  const imported = await db
    .from('private_import_rows')
    .upsert(records, { onConflict: 'organization_id,source_key', ignoreDuplicates: true });
  if (imported.error) throw new Error('Import gagal');
  const importedQuotas = await db.from('private_import_quotas').upsert(
    quotas.map((q) => ({ ...q, organization_id: org, batch_id: batchId })),
    { onConflict: 'batch_id,source_row', ignoreDuplicates: true },
  );
  if (importedQuotas.error)
    throw new Error('Import kuota gagal; jalankan semula tanpa menimpa rekod sedia ada.');
  // Preserve the unnamed KAFA/Jawi block without inventing a student's name.
  console.log(
    'Import disimpan sebagai needs_review. Tiada murid automatik, tiada pengesahan, tiada pembayaran. Dua catatan hari sama kekal sebagai baris berasingan.',
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Import gagal');
  process.exitCode = 1;
});
