import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
export default defineConfig([
  ...tseslint.configs.recommended,
  { plugins: { 'react-hooks': hooks }, rules: { 'react-hooks/rules-of-hooks': 'error' } },
  globalIgnores([
    '.next/**',
    'dist-pages/**',
    'dist-pages-test/**',
    'node_modules/**',
    'playwright-report/**',
    'test-results/**',
    'next-env.d.ts',
    // Salinan kerja agen sementara (git worktree).
    '.claude/**',
  ]),
]);
