import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Context, AccessError, requireRoles } from './access';
import { Report, reportMetadata } from '../reporting';
import { safeCell } from '../core';
function encryptionKey() {
  const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32) throw new Error('Kunci penyulitan Google belum dikonfigurasi');
  return key;
}
export function encrypt(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
}
export function decrypt(value: string): Record<string, unknown> {
  const [iv, tag, data] = value.split('.').map((v) => Buffer.from(v, 'base64'));
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8'));
}
export const googleConfigured = () =>
  Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.TOKEN_ENCRYPTION_KEY,
  );
export const redirectUri = () =>
  `${process.env.APP_URL || 'http://localhost:3000'}/api/google/callback`;
async function tokenRequest(body: Record<string, string>) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      ...body,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    cache: 'no-store',
  });
  if (!r.ok)
    throw new AccessError('Sambungan Google tamat tempoh atau dibatalkan. Hubungkan semula.', 409);
  return r.json();
}
export async function exchangeGoogle(code: string, verifier: string) {
  return tokenRequest({
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri(),
  });
}
export async function googleAccess(ctx: Context) {
  requireRoles(ctx, ['owner', 'admin']);
  const { data, error } = await ctx.db.rpc('google_tokens', { org: ctx.org });
  if (error || !data)
    throw new AccessError(
      'Hubungkan akaun Google dalam Tetapan. Muat turun Excel boleh digunakan sekarang.',
      409,
    );
  let tokens = decrypt(data);
  if (Number(tokens.expires_at) < Date.now() + 60000) {
    if (!tokens.refresh_token) throw new AccessError('Hubungkan semula akaun Google.', 409);
    const refreshed = await tokenRequest({
      refresh_token: String(tokens.refresh_token),
      grant_type: 'refresh_token',
    });
    tokens = {
      ...tokens,
      ...refreshed,
      expires_at: Date.now() + Number(refreshed.expires_in) * 1000,
    };
    const saved = await ctx.db.rpc('google_tokens', { org: ctx.org, encrypted: encrypt(tokens) });
    if (saved.error) throw new Error('Gagal menyimpan token');
  }
  return String(tokens.access_token);
}
export async function sheetsExport(
  ctx: Context,
  report: Report,
  jobId: string,
  existingId?: string | null,
) {
  const token = await googleAccess(ctx);
  const api = async (path: string, body: unknown) => {
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (!r.ok)
      throw new AccessError(
        'Eksport Google gagal. Semak sambungan, kebenaran atau kuota Google.',
        502,
      );
    return r.json();
  };
  const created = existingId
    ? {
        spreadsheetId: existingId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${existingId}/edit`,
      }
    : await api('', {
        properties: {
          title: `AQR_${report.code}_${report.month}`,
          locale: 'ms_MY',
          timeZone: 'Asia/Kuala_Lumpur',
        },
        sheets: [
          { properties: { sheetId: 0, title: 'MAKLUMAT_LAPORAN' } },
          { properties: { sheetId: 1, title: 'DATA', gridProperties: { frozenRowCount: 1 } } },
          { properties: { sheetId: 2, title: 'RINGKASAN' } },
        ],
      });
  if (!existingId) {
    const saved = await ctx.db
      .from('export_jobs')
      .update({ spreadsheet_id: created.spreadsheetId })
      .eq('id', jobId)
      .eq('organization_id', ctx.org);
    if (saved.error) throw new Error('Identiti spreadsheet tidak dapat diaudit');
  }
  // Values use RAW so untrusted cells cannot execute spreadsheet formulas.
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${created.spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data: [
          { range: 'MAKLUMAT_LAPORAN!A1', values: reportMetadata(report) },
          {
            range: 'DATA!A1',
            values: [report.headers, ...report.rows.map((row) => row.map(safeCell))],
          },
          {
            range: 'RINGKASAN!A1',
            values: [
              ['Jumlah baris', report.rows.length],
              ['Jumlah (MYR)', report.total_sen / 100],
            ],
          },
        ],
      }),
      cache: 'no-store',
    },
  );
  if (!r.ok)
    throw new AccessError(
      'Spreadsheet dicipta tetapi penulisan data gagal. Tiada kejayaan eksport direkodkan.',
      502,
    );
  await api(`/${created.spreadsheetId}:batchUpdate`, {
    requests: [
      {
        repeatCell: {
          range: { sheetId: 1, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.094, green: 0.16, blue: 0.26 },
              textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
            },
          },
          fields: 'userEnteredFormat',
        },
      },
      {
        autoResizeDimensions: {
          dimensions: {
            sheetId: 1,
            dimension: 'COLUMNS',
            startIndex: 0,
            endIndex: report.headers.length,
          },
        },
      },
      {
        setBasicFilter: {
          filter: {
            range: {
              sheetId: 1,
              startRowIndex: 0,
              endRowIndex: report.rows.length + 1,
              startColumnIndex: 0,
              endColumnIndex: report.headers.length,
            },
          },
        },
      },
    ],
  });
  return created.spreadsheetUrl as string;
}
