import { findRate, Rate } from './core';
export function parseCsv(text: string): Record<string, string>[] {
  const records: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(field);
      if (row.some(Boolean)) records.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (quoted) throw new Error('CSV mempunyai petikan tidak lengkap');
  if (field || row.length) {
    row.push(field);
    records.push(row);
  }
  const headers = records.shift() || [];
  if (new Set(headers).size !== headers.length) throw new Error('Header CSV berulang');
  return records.map((r) => {
    if (r.length !== headers.length) throw new Error('Bilangan lajur CSV tidak sepadan');
    return Object.fromEntries(headers.map((h, i) => [h, r[i]]));
  });
}
export function historicalSummary(rows: Record<string, string>[], rates: Rate[], planned: number) {
  const duplicates = new Map<string, number>();
  let indicative_sen = 0;
  for (const r of rows) {
    indicative_sen += findRate(
      rates,
      r.program_code,
      Number(r.duration_minutes),
      r.date,
    ).amount_sen;
    const k = `${r.student_name_reported}|${r.program_code}|${r.date}`;
    duplicates.set(k, (duplicates.get(k) || 0) + 1);
  }
  return {
    reported: rows.length,
    planned,
    missing: planned - rows.length,
    indicative_sen,
    payable_sen: 0,
    ambiguousGroups: [...duplicates.values()].filter((n) => n > 1).length,
    needsReview: rows.length,
  };
}
