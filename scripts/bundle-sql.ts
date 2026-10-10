// Gabungkan semua migrasi mengikut urutan menjadi satu fail untuk SQL Editor Supabase.
// Hanya untuk projek baharu yang kosong; migrasi tidak direka untuk dijalankan dua kali.
import { readdir, readFile, writeFile } from 'node:fs/promises';

const dir = 'supabase/migrations';
const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
const parts = await Promise.all(
  files.map(async (f) => `-- ===== ${f} =====\n${await readFile(`${dir}/${f}`, 'utf8')}`),
);
const out = 'supabase/setup-all.sql';
await writeFile(
  out,
  `-- AQR: ${files.length} migrasi. Jalankan SEKALI pada projek Supabase baharu.\nbegin;\n${parts.join('\n')}\ncommit;\n`,
);
console.log(`${out} disediakan (${files.length} migrasi).`);
