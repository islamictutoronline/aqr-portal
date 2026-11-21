import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: { '@': path.resolve('src') } },
  // Persediaan PGlite memuatkan semua migrasi bagi setiap fail; mesin yang sibuk boleh melebihi 10 saat.
  test: { include: ['tests/**/*.test.ts'], testTimeout: 30000, hookTimeout: 60000 },
});
