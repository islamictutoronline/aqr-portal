import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
test('dashboard, role scoping and mobile layout', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByText('MOD DEMO', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Assalamualaikum/ })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.getByLabel('Pratonton peranan demo').selectOption('guardian');
  await expect(page.getByRole('heading', { name: 'Perjalanan ilmu anak anda' })).toBeVisible();
  await expect(page.getByText('Murid Contoh 02', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Elaun tutor', exact: true })).toHaveCount(0);
});
test('all module screens render without page errors and screenshot both layouts', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const screen of [
    'students',
    'guardians',
    'tutors',
    'classes',
    'calendar',
    'finance',
    'allowance',
    'reports',
    'parent',
    'settings',
  ]) {
    await page.goto(`/demo/${screen}`);
    await expect(page.locator('#main')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false);
  }
  await page.goto('/demo');
  await page.waitForLoadState('networkidle');
  await mkdir('docs/evidence', { recursive: true });
  await page.screenshot({
    path: `docs/evidence/dashboard-${info.project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test('tutor publishes one student with no typed assessment and absent has no fabricated score', async ({
  page,
}) => {
  await page.goto('/demo/sessions/session-6');
  await expect(page.getByRole('button', { name: 'Terbit kepada ibu bapa' })).toBeDisabled();
  await page.getByRole('button', { name: 'Hadir', exact: true }).click();
  await page.getByRole('button', { name: 'bacaan', exact: true }).click();
  await page.getByRole('button', { name: '3 Memuaskan', exact: true }).click();
  await page.getByRole('button', { name: 'aktif', exact: true }).click();
  await page.getByRole('button', { name: 'sebutan yang tepat', exact: true }).click();
  await expect(
    page.getByText(/Alhamdulillah, murid menunjukkan penguasaan yang memuaskan/).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Terbit kepada ibu bapa' }).click();
  await expect(page.getByRole('status')).toContainText('memori tab');
  await page.getByRole('button', { name: 'Tidak hadir', exact: true }).click();
  await expect(page.getByText('Tiada penilaian pembelajaran untuk sesi ini.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Terbit kepada ibu bapa' })).toBeEnabled();
});
test('Excel and CSV endpoints return working downloads; fake live authorization fails', async ({
  request,
}) => {
  const x = await request.get('/api/export?demo=1&code=tutor_allowance&month=2026-10&format=xlsx');
  expect(x.status()).toBe(200);
  expect((await x.body()).subarray(0, 2).toString()).toBe('PK');
  const c = await request.get('/api/export?demo=1&code=student_fees&month=2026-10&format=csv');
  expect(c.status()).toBe(200);
  expect(await c.text()).toContain('DEMO-001');
  const privateData = await request.get('/api/data');
  expect(privateData.ok()).toBe(false);
  const doc = await request.get(
    '/api/document?type=invoice&id=00000000-0000-4000-8000-000000000001',
  );
  expect(doc.ok()).toBe(false);
});
