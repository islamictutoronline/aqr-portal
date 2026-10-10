import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/pages',
  // Ujian membina salinan berasingan dengan demo dibuka; dist-pages yang diterbitkan kekal tanpa demo.
  use: { baseURL: 'http://127.0.0.1:4174' },
  webServer: {
    command:
      'VITE_ENABLE_DEMO=1 npx vite build --outDir ../dist-pages-test && npx vite preview --outDir ../dist-pages-test --port 4174',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
  ],
});
