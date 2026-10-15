import { test, expect, type Page } from '@playwright/test';
// Isi borang Daftar murid (model individu dengan satu slot mingguan).
async function enrol(page: Page, name: string, program: string) {
  await page.getByRole('button', { name: 'Daftar murid', exact: true }).click();
  await page.getByLabel('Nama penuh', { exact: true }).fill(name);
  await page.getByLabel('No. WhatsApp penjaga').fill('012-345 6789');
  await page.getByRole('combobox', { name: 'Program' }).selectOption({ label: program });
  await page.getByRole('combobox', { name: 'Minit setiap sesi' }).selectOption('30');
  await page.getByRole('combobox', { name: 'Sesi 1: hari' }).selectOption({ label: 'Isnin' });
  await page.getByLabel('Jam').first().fill('20:00');
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
}
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
test('static entrance is locked and does not default to an admin demo', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Selamat kembali ke AQR' })).toBeVisible();
  await expect(page.getByLabel('Pratonton peranan demo')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Daftar murid', exact: true })).toHaveCount(0);
});
test('mobile search remains usable and the menu traps and restores keyboard focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?demo=1#/students');
  const search = page.getByRole('textbox', { name: 'Cari rekod' });
  await expect(search).toBeVisible();
  await search.fill('Murid Contoh 01');
  await expect(page.locator('table').getByText('Murid Contoh 01', { exact: true })).toBeVisible();
  await expect(page.locator('table').getByText('Murid Contoh 02', { exact: true })).toHaveCount(0);
  const toggle = page.getByRole('button', { name: 'Buka menu', exact: true });
  await toggle.click();
  const menu = page.getByRole('dialog', { name: 'Menu utama' });
  const close = menu.getByRole('button', { name: 'Tutup menu', exact: true });
  await expect(close).toBeFocused();
  await close.press('Shift+Tab');
  await expect(menu.locator('nav button').last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.sidebar')).toHaveAttribute('inert', '');
  await toggle.click();
  await page.getByRole('button', { name: 'Tutup latar menu', exact: true }).click({
    position: { x: 370, y: 200 },
  });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
test('all existing modules work as static pages with hash navigation and no local APIs', async ({
  page,
}) => {
  const errors: string[] = [];
  const apis: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/')) apis.push(r.url());
  });
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
    await page.goto(`/?demo=1#/${screen}`);
    await expect(page.locator('#main')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
  }
  expect(errors).toEqual([]);
  expect(apis).toEqual([]);
});
test('compact phones retain search and keep reports and money summaries inside the viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 850 });
  for (const screen of ['dashboard', 'students', 'reports', 'finance', 'allowance']) {
    await page.goto(`/?demo=1#/${screen}`);
    await expect(page.getByRole('textbox', { name: 'Cari rekod' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
  }
});
test('admin approves a report, downloads actual PDF and ZIP, then parent sees only own approved report', async ({
  page,
}) => {
  await page.goto('/?demo=1#/reports');
  await page.getByRole('button', { name: 'Sediakan draf bulanan' }).click();
  // Laporan dikumpulkan mengikut tutor; buka semua kumpulan.
  for (const summary of await page.locator('.tutor-group > summary').all()) await summary.click();
  const card = page
    .locator('.report-item')
    .filter({ has: page.getByRole('heading', { name: 'Murid Contoh 01', exact: true }) });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Lihat laporan' }).click();
  await page.getByRole('button', { name: 'Luluskan laporan ini' }).click();
  await expect(card.getByText('DILULUSKAN', { exact: true })).toBeVisible();
  const pdfWait = page.waitForEvent('download');
  await card.getByRole('button', { name: 'Muat turun PDF' }).click();
  const pdf = await pdfWait;
  await pdf.saveAs(`docs/evidence/student-report-${test.info().project.name}.pdf`);
  const bytes = await readFile((await pdf.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
  const zipWait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Muat turun ZIP bulanan' }).click();
  const zip = await zipWait;
  const files = await JSZip.loadAsync(await readFile((await zip.path())!));
  expect(Object.keys(files.files)).toHaveLength(1);
  await card.getByRole('button', { name: 'Sediakan mesej WhatsApp' }).first().click();
  await expect(page.getByLabel('Draf mesej WhatsApp')).toHaveValue(/Murid Contoh 01/);
  await page.getByRole('button', { name: 'Tutup mesej' }).click();
  await card.getByRole('combobox').first().selectOption('sent');
  await expect(card.getByRole('combobox').first()).toHaveValue('sent');
  await page.getByLabel('Pratonton peranan demo').selectOption('guardian');
  await expect(page.getByRole('heading', { name: 'Perjalanan ilmu anak anda' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Muat turun PDF', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hantar bayaran' })).toHaveCount(0);
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sediakan draf bulanan' })).toHaveCount(0);
  await expect(page.getByText('Murid Contoh 02', { exact: true })).toHaveCount(0);
  // The fixture links more than one child to this guardian.
  expect(await page.locator('.child-selector button').count()).toBeGreaterThan(1);
  await page.locator('.child-selector button').nth(1).click();
  await expect(page.getByRole('button', { name: 'Muat turun PDF', exact: true })).toHaveCount(0);
});
test('tutor can register a student in assigned class and retain tap-only assessment', async ({
  page,
}) => {
  await page.goto('/?demo=1#/students');
  await page.getByLabel('Pratonton peranan demo').selectOption('tutor');
  // Role switch lands on dashboard; use a hash reload to inspect the existing form as owner first is avoided by navigation.
  if ((page.viewportSize()?.width || 0) > 700)
    await page.getByRole('button', { name: 'Murid', exact: true }).click();
  else {
    await page.getByRole('button', { name: 'Buka menu' }).click();
    await page.getByRole('button', { name: 'Murid', exact: true }).click();
  }
  await enrol(page, 'Murid Ujian Baharu', "Iqra'");
  await expect(page.getByText('Murid Ujian Baharu', { exact: true })).toBeVisible();
  await page.goto('/?demo=1#/sessions/session-6');
  await page.reload();
  await page.getByRole('button', { name: 'Hadir', exact: true }).click();
  await page.getByRole('button', { name: 'bacaan', exact: true }).click();
  await page.getByRole('button', { name: '3 Memuaskan', exact: true }).click();
  await page.getByRole('button', { name: 'aktif', exact: true }).click();
  await page.getByRole('button', { name: 'sebutan yang tepat', exact: true }).click();
  await expect(page.getByRole('button', { name: /Simpan (kehadiran|perubahan)/ })).toBeEnabled();
});
test('individual model: tutor registers by program, adds a program and schedules a session', async ({
  page,
}) => {
  await page.goto('/?demo=1#/students');
  await page.getByLabel('Pratonton peranan demo').selectOption('tutor');
  if ((page.viewportSize()?.width || 0) <= 700)
    await page.getByRole('button', { name: 'Buka menu' }).click();
  await page.getByRole('button', { name: 'Murid', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Kelas' })).toHaveCount(0);
  await enrol(page, 'Murid Individu', "Iqra'");
  const row = page.getByRole('row').filter({ hasText: 'Murid Individu' });
  await expect(row).toContainText("Iqra'");
  await row.getByRole('button', { name: /Lihat profil/ }).click();
  await page.getByRole('button', { name: 'Tambah program' }).click();
  await page.getByRole('combobox', { name: 'Program' }).selectOption({ label: 'Bahasa Arab' });
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  await expect(page.getByText('Bahasa Arab', { exact: true })).toBeVisible();
  if ((page.viewportSize()?.width || 0) <= 700)
    await page.getByRole('button', { name: 'Buka menu' }).click();
  await page.getByRole('button', { name: 'Sesi & kehadiran', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Rekod kehadiran' })).toBeVisible();
  await page
    .locator('.student-picker button')
    .filter({ hasText: 'Murid Individu' })
    .first()
    .click();
  await expect(page.getByLabel('Tarikh kelas')).not.toHaveValue('');
  await page.getByLabel('Jam', { exact: true }).fill('21:30');
  await page.getByRole('button', { name: 'Simpan tarikh & jam' }).click();
  await expect(page.getByLabel('Jam', { exact: true })).toHaveValue('21:30');
  await expect(page.getByText('Pencapaian unit kurikulum')).toHaveCount(0);
});
test('admin starts from tutors: list, then tutor profile with students and sessions', async ({
  page,
}) => {
  await page.goto('/?demo=1#/tutors');
  await expect(page.getByRole('tab', { name: 'Tutor', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const row = page.getByRole('row').filter({ hasText: 'Tutor Contoh 1' });
  await row.getByRole('button', { name: /Lihat/ }).click();
  await expect(page.getByRole('heading', { name: 'Tutor Contoh 1', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sesi bulan ini' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Lihat murid/ }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Semua tutor' }).click();
  await expect(page.getByRole('heading', { name: 'Senarai tutor' })).toBeVisible();
});
test('tutor registers a student with a weekly schedule, sees sessions, then removes the student', async ({
  page,
}) => {
  await page.goto('/?demo=1#/students');
  await page.getByLabel('Pratonton peranan demo').selectOption('tutor');
  if ((page.viewportSize()?.width || 0) <= 700)
    await page.getByRole('button', { name: 'Buka menu' }).click();
  await page.getByRole('button', { name: 'Murid', exact: true }).click();
  await page.getByRole('button', { name: 'Daftar murid', exact: true }).click();
  await page.getByLabel('Nama penuh', { exact: true }).fill('Murid Jadual');
  await page.getByLabel('No. WhatsApp penjaga').fill('019-888 7777');
  await page.getByRole('combobox', { name: 'Program' }).selectOption({ label: "Iqra'" });
  await page.getByRole('combobox', { name: 'Minit setiap sesi' }).selectOption('30');
  await expect(page.getByLabel('Sehingga tarikh')).toHaveValue('2027-12-31');
  await expect(page.getByLabel('Mula tarikh')).toHaveValue(/-01$/);
  await page.getByRole('combobox', { name: 'Sesi seminggu' }).selectOption('2');
  await page.getByRole('combobox', { name: 'Sesi 1: hari' }).selectOption({ label: 'Isnin' });
  await page.getByLabel('Jam').nth(0).fill('20:00');
  await page.getByRole('combobox', { name: 'Sesi 2: hari' }).selectOption({ label: 'Khamis' });
  await page.getByLabel('Jam').nth(1).fill('21:00');
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'Murid Jadual' });
  await expect(row).toContainText("Iqra'");
  await row.getByRole('button', { name: /Lihat profil/ }).click();
  const detail = page.locator('.program-detail').first();
  await expect(detail).toContainText('30 minit');
  await expect(detail).toContainText('2 sesi');
  await expect(detail.locator('.slot-chip')).toHaveText(['Isnin 20:00', 'Khamis 21:00']);
  await expect(detail).toContainText('31/12/2027');
  if ((page.viewportSize()?.width || 0) <= 700)
    await page.getByRole('button', { name: 'Buka menu' }).click();
  await page.getByRole('button', { name: 'Murid', exact: true }).first().click();
  await row.getByRole('button', { name: 'Padam' }).click();
  await expect(page.getByText(/sesi akan datang dibatalkan/)).toBeVisible();
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Murid Jadual' })).toHaveCount(0);
});
test('admin views sessions per tutor tab and automatic allowance without approvals', async ({
  page,
}) => {
  await page.goto('/?demo=1#/calendar');
  await expect(page.getByRole('heading', { name: 'Sesi hari ini' })).toBeVisible();
  // Tab Hari ini hanya menyenaraikan tutor yang ada sesi hari ini; semua tutor ada di tab lain.
  await page.getByRole('tab', { name: 'Semua murid' }).click();
  await page.getByRole('tab', { name: 'Tutor Contoh 1' }).click();
  await expect(page.getByRole('heading', { name: 'Tutor Contoh 1' })).toBeVisible();
  await expect(page.locator('td[data-label="Elaun"]').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Lulus|Sahkan/ })).toHaveCount(0);
  // Semakan mengikut murid: satu tekan memaparkan semua kelas murid itu.
  await page.getByRole('button', { name: 'Semak', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: /^Semakan:/ })).toBeVisible();
  await expect(page.locator('td[data-label="Ulasan tutor"]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Tutup semakan' }).click();
  await expect(page.getByRole('heading', { name: /^Semakan:/ })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Semua murid' }).click();
  await expect(page.locator('td[data-label="Tutor"]').first()).toBeVisible();
  await page.goto('/?demo=1#/allowance');
  await page.reload();
  await expect(page.getByText('Jumlah perlu dibayar').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Semakan sesi' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Tutor Contoh 2' }).click();
  await expect(page.locator('.tab-total')).toContainText('RM');
  await expect(page.locator('td[data-label="Kehadiran"]').first()).toBeVisible();
});
test('admin and tutor dashboards hide the learning sessions list', async ({ page }) => {
  await page.goto('/?demo=1#/dashboard');
  await expect(page.getByRole('heading', { name: 'Perlu perhatian' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sesi pembelajaran' })).toHaveCount(0);
  const tile = page.locator('.metric').filter({ hasText: 'Tutor aktif' });
  await expect(tile).toContainText('3');
  await page.getByLabel('Pratonton peranan demo').selectOption('tutor');
  await expect(page.getByRole('heading', { name: 'Perlu perhatian' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sesi pembelajaran' })).toHaveCount(0);
  await expect(page.getByText('Jadual dan tindakan tutor')).toHaveCount(0);
  await expect(page.locator('.metric').filter({ hasText: 'Tutor aktif' })).toHaveCount(0);
});
test('tutor edits a recorded attendance, sees remaining sessions and voids a class', async ({
  page,
}) => {
  await page.goto('/?demo=1#/dashboard');
  await page.getByLabel('Pratonton peranan demo').selectOption('tutor');
  if ((page.viewportSize()?.width || 0) <= 700)
    await page.getByRole('button', { name: 'Buka menu' }).click();
  await page.getByRole('button', { name: 'Sesi & kehadiran', exact: true }).click();
  await expect(page.locator('.student-picker button').first()).toContainText('Berbaki');
  await page.locator('.student-picker button').first().click();
  const history = page.locator('.card').filter({
    has: page.getByRole('heading', { name: 'Kelas telah dilaksanakan' }),
  });
  await expect(history).toContainText('sesi berbaki');
  await history.getByRole('button', { name: 'Edit' }).first().click();
  await expect(page.getByRole('button', { name: 'Simpan perubahan' })).toBeVisible();
  await page.getByRole('button', { name: 'Tidak hadir', exact: true }).click();
  await page.getByRole('button', { name: 'Simpan perubahan' }).click();
  await expect(page.getByRole('status')).toContainText('memori tab');
  const rows = await history.getByRole('button', { name: 'Padam' }).count();
  await history.getByRole('button', { name: 'Padam' }).first().click();
  await expect(page.getByText(/tidak dikira elaun/)).toBeVisible();
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  await expect(history.getByRole('button', { name: 'Padam' })).toHaveCount(rows - 1);
});
test('tutor backdates a recorded class and saves attendance without assessment taps', async ({
  page,
}) => {
  await page.goto('/?demo=1#/dashboard');
  await page.getByLabel('Pratonton peranan demo').selectOption('tutor');
  if ((page.viewportSize()?.width || 0) <= 700)
    await page.getByRole('button', { name: 'Buka menu' }).click();
  await page.getByRole('button', { name: 'Sesi & kehadiran', exact: true }).click();
  await page.locator('.student-picker button').first().click();
  const history = page.locator('.card').filter({
    has: page.getByRole('heading', { name: 'Kelas telah dilaksanakan' }),
  });
  await history.getByRole('button', { name: 'Edit' }).first().click();
  const date = page.getByLabel('Tarikh kelas');
  await expect(date).toBeEnabled();
  await date.fill('2026-09-15');
  await page.getByRole('button', { name: 'Simpan tarikh & jam' }).click();
  await expect(date).toHaveValue('2026-09-15');
  await expect(page.getByRole('button', { name: 'Simpan tarikh & jam' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Hadir', exact: true }).click();
  for (const label of ['bacaan', 'aktif', 'sebutan yang tepat']) {
    const chip = page.getByRole('button', { name: label, exact: true });
    if ((await chip.getAttribute('aria-pressed')) === 'true') await chip.click();
  }
  const save = page.getByRole('button', { name: /Simpan (kehadiran|perubahan)/ });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByRole('status')).toContainText('memori tab');
  // Kelas baharu: hanya kehadiran, tiada tap penilaian.
  await page.getByRole('button', { name: 'Tambah rekod sesi' }).first().click();
  await expect(page.getByLabel('Tarikh kelas').last()).not.toHaveValue('');
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Simpan kehadiran' })).toBeDisabled();
  await expect(page.getByText('Pilih kehadiran dahulu.')).toBeVisible();
  await page.getByRole('button', { name: 'Hadir', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Simpan kehadiran' })).toBeEnabled();
  await page.getByRole('button', { name: 'Simpan kehadiran' }).click();
  await expect(page.getByRole('status')).toContainText('memori tab');
});
test('voiding the open class returns to the list; a voided class is locked', async ({ page }) => {
  await page.goto('/?demo=1#/dashboard');
  await page.getByLabel('Pratonton peranan demo').selectOption('tutor');
  if ((page.viewportSize()?.width || 0) <= 700)
    await page.getByRole('button', { name: 'Buka menu' }).click();
  await page.getByRole('button', { name: 'Sesi & kehadiran', exact: true }).click();
  await page.locator('.student-picker button').first().click();
  await page.getByRole('button', { name: 'Tambah rekod sesi' }).first().click();
  await expect(page.getByLabel('Tarikh kelas').last()).not.toHaveValue('');
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  await page.getByRole('button', { name: 'Hadir', exact: true }).click();
  await page.getByRole('button', { name: 'Simpan kehadiran' }).click();
  const history = page.locator('.card').filter({
    has: page.getByRole('heading', { name: 'Kelas telah dilaksanakan' }),
  });
  await history.getByRole('button', { name: 'Padam' }).first().click();
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Rekod kehadiran' })).toBeVisible();
});
test('Tambah rekod sesi sits at the top of the session screen and supports a past date', async ({
  page,
}) => {
  await page.goto('/?demo=1#/dashboard');
  await page.getByLabel('Pratonton peranan demo').selectOption('tutor');
  if ((page.viewportSize()?.width || 0) <= 700)
    await page.getByRole('button', { name: 'Buka menu' }).click();
  await page.getByRole('button', { name: 'Sesi & kehadiran', exact: true }).click();
  await page.locator('.student-picker button').first().click();
  const top = page.locator('.card').first();
  await top.getByRole('button', { name: 'Tambah rekod sesi' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tarikh kelas').fill('2026-10-02');
  await dialog.getByLabel('Jam').fill('20:00');
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  await expect(page.getByLabel('Tarikh kelas')).toHaveValue('2026-10-02');
  await page.getByRole('button', { name: 'Hadir', exact: true }).click();
  await page.getByRole('button', { name: 'Simpan kehadiran' }).click();
  await expect(page.getByRole('status')).toContainText('memori tab');
});
test('admin removes a tutor only after typing the exact name in the confirmation', async ({
  page,
}) => {
  await page.goto('/?demo=1#/tutors');
  const row = page.getByRole('row').filter({ hasText: 'Tutor Contoh 3' });
  await row.getByRole('button', { name: /Lihat/ }).click();
  await page.getByRole('button', { name: 'Padam tutor' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Akses tutor ke portal ditarik serta-merta.')).toBeVisible();
  const input = dialog.getByLabel(/Taip nama tutor/);
  await input.fill('Tutor Contoh');
  await dialog.getByRole('button', { name: 'Simpan dalam demo' }).click();
  await expect(dialog).toBeVisible();
  await input.fill('Tutor Contoh 3');
  await dialog.getByRole('button', { name: 'Simpan dalam demo' }).click();
  await expect(page.getByRole('heading', { name: 'Senarai tutor' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Tutor Contoh 3' })).toHaveCount(0);
});
test('admin approves all drafts of one tutor at once from the tutor group', async ({ page }) => {
  await page.goto('/?demo=1#/reports');
  await page.getByRole('button', { name: 'Sediakan draf bulanan' }).click();
  const group = page.locator('.tutor-group').first();
  await expect(group.locator('summary')).toContainText('draf');
  await group.locator('summary').click();
  const approveAll = group.getByRole('button', { name: /Luluskan semua draf/ });
  await approveAll.click();
  await expect(group.locator('summary')).not.toContainText('draf');
  await expect(approveAll).toBeDisabled();
  await expect(group.getByText('DILULUSKAN', { exact: true }).first()).toBeVisible();
});
test('admin saves bank details and downloads tutor payslips; tutor sees own payslip', async ({
  page,
}) => {
  await page.goto('/?demo=1#/allowance');
  await page.getByRole('tab', { name: 'Tutor Contoh 2' }).click();
  await page.getByRole('button', { name: 'Maklumat bank tutor' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nama bank').fill('Bank Contoh');
  await dialog.getByLabel('Nama pemegang akaun').fill('Tutor Contoh 2');
  await dialog.getByLabel('No. akaun').fill('0000 1111 2222');
  await dialog.getByRole('button', { name: 'Simpan dalam demo' }).click();
  const [pdf] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Muat turun payslip' }).click(),
  ]);
  expect(pdf.suggestedFilename()).toBe('Payslip - Tutor Contoh 2 - Oktober 2026.pdf');
  await page.getByRole('tab', { name: 'Semua tutor' }).click();
  const [zip] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Payslip semua tutor (ZIP)' }).click(),
  ]);
  expect(zip.suggestedFilename()).toBe('Payslip Semua Tutor - Oktober 2026.zip');
  await page.getByLabel('Pratonton peranan demo').selectOption('tutor');
  await page.goto('/?demo=1#/allowance');
  await page.getByLabel('Pratonton peranan demo').selectOption('tutor');
  if ((page.viewportSize()?.width || 0) <= 700)
    await page.getByRole('button', { name: 'Buka menu' }).click();
  await page.getByRole('button', { name: 'Elaun tutor', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Muat turun payslip saya' })).toBeVisible();
});
test('password is the default sign-in and the email-code choice is remembered', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Selamat kembali ke AQR' })).toBeVisible();
  // CI membina tanpa sambungan Supabase; borang log masuk hanya wujud apabila dikonfigurasi.
  test.skip(
    (await page.getByText('Portal belum dikonfigurasi').count()) > 0,
    'Supabase tidak dikonfigurasi dalam binaan ini',
  );
  await expect(page.getByRole('tab', { name: 'Kata laluan' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByLabel('Kata laluan', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Guna kod e-mel' }).click();
  await expect(page.getByRole('button', { name: 'Hantar kod log masuk' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Kod e-mel' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});
test('tutor is reminded to set a password and can change it in Settings', async ({ page }) => {
  await page.goto('/?demo=1#/dashboard');
  await page.getByLabel('Pratonton peranan demo').selectOption('tutor');
  await expect(page.getByRole('heading', { name: 'Tetapkan kata laluan anda' })).toBeVisible();
  await page.getByLabel('Kata laluan baharu').fill('pendek');
  await page.getByLabel('Ulang kata laluan').fill('pendek');
  await page.getByRole('button', { name: 'Simpan kata laluan' }).click();
  await expect(page.getByText('sekurang-kurangnya 10 aksara').first()).toBeVisible();
  if ((page.viewportSize()?.width || 0) <= 700)
    await page.getByRole('button', { name: 'Buka menu' }).click();
  await page.getByRole('button', { name: 'Tetapan', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Kata laluan log masuk' })).toBeVisible();
});
test('tutor enters the guardian while enrolling; blank name defaults to Ibu/Bapa (student)', async ({
  page,
}) => {
  await page.goto('/?demo=1#/students');
  await page.getByLabel('Pratonton peranan demo').selectOption('tutor');
  if ((page.viewportSize()?.width || 0) <= 700)
    await page.getByRole('button', { name: 'Buka menu' }).click();
  await page.getByRole('button', { name: 'Murid', exact: true }).click();
  await enrol(page, 'Murid Waris Ujian', "Iqra'");
  await expect(page.getByText('Ibu/Bapa Murid Waris Ujian')).toBeVisible();
  await expect(page.getByText('+60123456789').first()).toBeVisible();
  // Kemaskini nama sebenar dari profil murid.
  await page
    .getByRole('row', { name: /Murid Waris Ujian/ })
    .getByRole('button', { name: /Lihat profil/ })
    .click();
  await page.getByRole('button', { name: 'Kemaskini penjaga' }).click();
  await page.getByLabel('Nama penjaga').fill('Puan Aminah');
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  await expect(page.locator('.guardian-line')).toContainText('Puan Aminah');
  await expect(page.locator('.guardian-line a')).toHaveAttribute(
    'href',
    'https://wa.me/60123456789',
  );
  // Penjaga di luar negara: pilih kod negara; nombor tidak sah dipaparkan dalam borang.
  await page.getByRole('button', { name: 'Kemaskini penjaga' }).click();
  await expect(page.getByRole('combobox', { name: 'Kod negara' })).toHaveValue('+60');
  await expect(page.getByLabel('No. WhatsApp penjaga')).toHaveValue('123456789');
  await page.getByRole('combobox', { name: 'Kod negara' }).selectOption('+65');
  await page.getByLabel('No. WhatsApp penjaga').fill('12');
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No. WhatsApp tidak sah');
  await page.getByLabel('No. WhatsApp penjaga').fill('9123 4567');
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  await expect(page.locator('.guardian-line')).toContainText('+6591234567');
});
test('admin sends one WhatsApp package per family: all siblings reports + invoice together', async ({
  page,
  context,
}) => {
  // Jangan hubungi WhatsApp sebenar semasa ujian.
  await context.route('https://wa.me/**', (r) => r.fulfill({ body: 'WhatsApp' }));
  await page.goto('/?demo=1#/reports');
  await page.getByLabel('Bulan laporan').fill('2026-10');
  await page.getByRole('button', { name: 'Sediakan draf bulanan' }).click();
  for (const summary of await page.locator('.monthly-reports .tutor-group > summary').all())
    await summary.click();
  for (const approve of await page.getByRole('button', { name: /Luluskan semua draf/ }).all())
    if (await approve.isEnabled()) await approve.click();
  // Tutup kumpulan semakan laporan; kumpulan penghantaran tertutup sehingga dicari.
  const delivery = page.locator('.family-delivery');
  await expect(delivery.locator('.family-row').first()).toBeHidden();
  // Tag penapis menunjukkan bilangan; carian membuka kumpulan tutor yang sepadan.
  await expect(delivery.getByRole('tab', { name: /Sedia dihantar/ })).toContainText(/\d/);
  await delivery.getByLabel('Cari murid, ibu bapa atau no. telefon').fill('Murid Contoh 06');
  const family = delivery.locator('.family-row').filter({ hasText: 'Penjaga Contoh 1' }).first();
  await expect(family).toBeVisible();
  await expect(delivery.locator('.family-row').filter({ hasText: 'Penjaga Contoh 2' })).toHaveCount(
    0,
  );
  await expect(family).toContainText('Sedia dihantar');
  // Adik-beradik: tiga tag laporan + satu tag invois dalam baris yang sama.
  await expect(family.locator('.family-tags .tag')).toHaveCount(4);
  // Carian no. telefon juga berfungsi.
  await delivery.getByLabel('Cari murid, ibu bapa atau no. telefon').fill('0001');
  await expect(family).toBeVisible();
  const link = family.locator('a.wa-link');
  await expect(link).toHaveAttribute('href', /^https:\/\/wa\.me\/60110000001\?text=.*DEMO-001/);
  await family.getByRole('button', { name: 'Sediakan PDF' }).click();
  // Satu PDF gabungan: laporan semua anak + invois.
  const dl = page.waitForEvent('download');
  await family.getByRole('button', { name: 'Muat turun PDF' }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toMatch(/^Laporan & Invois - Penjaga Contoh 1 - .*\.pdf$/);
  const merged = await PDFDocument.load(await readFile((await file.path())!));
  expect(merged.getPageCount()).toBeGreaterThanOrEqual(4);
  // Komputer: Buka WhatsApp dengan mesej siap ditulis.
  const popup = context.waitForEvent('page');
  await family.getByRole('button', { name: 'Buka WhatsApp' }).click();
  expect((await popup).url()).toContain('wa.me/60110000001');
  await family.getByRole('button', { name: 'Tandakan dihantar' }).click();
  await expect(family).toContainText('Dihantar');
});
test('session reading: Iqra jilid/page and Quran surah/ayah appear in the parent comment; other programs have none', async ({
  page,
}) => {
  await page.goto('/?demo=1#/sessions/session-12');
  await page.reload();
  await page.getByRole('button', { name: 'Hadir', exact: true }).click();
  await page.getByLabel("Jilid Iqra'").selectOption('2');
  await page.getByLabel('Muka surat').fill('5');
  await expect(page.locator('.preview-comment')).toContainText("Bacaan: Iqra' 2, muka surat 5.");
  await page.getByRole('button', { name: /Simpan (kehadiran|perubahan)/ }).click();
  await page.goto('/?demo=1#/sessions/session-13');
  await page.reload();
  await page.getByRole('button', { name: 'Hadir', exact: true }).click();
  await page.getByLabel('Surah').selectOption('112');
  await page.getByLabel('Ayat hingga').fill('9');
  await expect(page.locator('.reading-issue')).toContainText('hanya 4 ayat');
  await expect(page.getByRole('button', { name: /Simpan (kehadiran|perubahan)/ })).toBeDisabled();
  await page.getByLabel('Ayat dari').fill('1');
  await page.getByLabel('Ayat hingga').fill('4');
  await expect(page.locator('.preview-comment')).toContainText('Bacaan: Surah Al-Ikhlas ayat 1–4.');
  await expect(page.getByRole('button', { name: /Simpan (kehadiran|perubahan)/ })).toBeEnabled();
  // Cuti bermaklum: tiada bacaan.
  await page.getByRole('button', { name: 'Cuti bermaklum', exact: true }).click();
  await expect(page.locator('.reading-fields')).toHaveCount(0);
  await page.goto('/?demo=1#/sessions/session-15');
  await page.reload();
  await page.getByRole('button', { name: 'Hadir', exact: true }).click();
  await expect(page.locator('.reading-fields')).toHaveCount(0);
});
test('tutor downloads class reports without invoices; admin generates reports + invoices in one click', async ({
  page,
}) => {
  await page.goto('/?demo=1#/reports');
  await page.getByLabel('Pratonton peranan demo').selectOption('tutor');
  if ((page.viewportSize()?.width || 0) <= 700)
    await page.getByRole('button', { name: 'Buka menu' }).click();
  await page.getByRole('button', { name: 'Laporan', exact: true }).click();
  const card = page.locator('.tutor-class-reports');
  await expect(card).toContainText('Laporan kelas murid saya');
  await expect(card).toContainText('Untuk jumlah yuran, ibu bapa boleh rujuk admin AQR.');
  await expect(page.locator('.family-delivery')).toHaveCount(0);
  const pdfWait = page.waitForEvent('download');
  await card.getByRole('button', { name: 'PDF', exact: true }).first().click();
  expect((await pdfWait).suggestedFilename()).toMatch(/^Laporan Kelas .*\.pdf$/);
  const zipWait = page.waitForEvent('download');
  await card.getByRole('button', { name: /Muat turun semua/ }).click();
  expect((await zipWait).suggestedFilename()).toMatch(/^Laporan Kelas .*\.zip$/);
  // Admin
  await page.goto('/?demo=1#/reports');
  await page.reload();
  await page.getByLabel('Bulan laporan').fill('2026-10');
  await page.getByRole('button', { name: 'Jana laporan + invois' }).click();
  await expect(page.locator('.tutor-group-meta').first()).toContainText('draf');
});
test('one-tap payments: tutor allowance paid (with void kept as history) and invoice fee paid without reference', async ({
  page,
}) => {
  await page.goto('/?demo=1#/allowance');
  await page.reload();
  const firstRow = page.getByRole('row').filter({ hasText: 'Tutor Contoh 1' });
  await firstRow.getByRole('button', { name: 'Elaun telah dibayar' }).click();
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  await expect(firstRow).toContainText('Dibayar ·');
  // Butiran tutor: sejarah bayaran, batal kekal sebagai rekod.
  await firstRow.getByRole('button', { name: /Butiran/ }).click();
  const history = page.locator('.pay-history');
  await expect(history).toContainText('Tiada rujukan');
  await history.getByRole('button', { name: 'Batal' }).click();
  await page.getByLabel('Sebab (cth. tersilap tekan)').fill('Tersilap tekan');
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  await expect(history).toContainText('Dibatalkan');
  await expect(page.getByRole('button', { name: 'Elaun telah dibayar' })).toBeVisible();
  // Yuran: satu langkah, tanpa rujukan.
  await page.goto('/?demo=1#/finance');
  await page.reload();
  const inv = page.getByRole('row').filter({ hasText: 'DEMO-001' });
  await inv.getByRole('button', { name: 'Yuran telah dibayar' }).click();
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  await expect(inv.getByRole('button', { name: 'Yuran telah dibayar' })).toHaveCount(0);
  await expect(inv).toContainText('RM 0.00');
});
test('siblings: pick existing guardian or type the same number; "Daftar adik-beradik" prefills the guardian', async ({
  page,
}) => {
  await page.goto('/?demo=1#/students');
  await page.getByLabel('Pratonton peranan demo').selectOption('tutor');
  if ((page.viewportSize()?.width || 0) <= 700)
    await page.getByRole('button', { name: 'Buka menu' }).click();
  await page.getByRole('button', { name: 'Murid', exact: true }).click();
  // Kakak: penjaga baharu.
  await page.getByRole('button', { name: 'Daftar murid', exact: true }).click();
  await page.getByLabel('Nama penuh', { exact: true }).fill('Kakak Ujian');
  await page.getByLabel('Nama penjaga').fill('Puan Rahmah');
  await page.getByLabel('No. WhatsApp penjaga').fill('019-777 8888');
  await page.getByRole('combobox', { name: 'Program' }).selectOption({ label: "Iqra'" });
  await page.getByRole('combobox', { name: 'Minit setiap sesi' }).selectOption('30');
  await page.getByRole('combobox', { name: 'Sesi 1: hari' }).selectOption({ label: 'Isnin' });
  await page.getByLabel('Jam').first().fill('20:00');
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  // Taip no. yang sama → amaran adik-beradik terus dipaparkan.
  await page.getByRole('button', { name: 'Daftar murid', exact: true }).click();
  await page.getByLabel('No. WhatsApp penjaga').fill('0197778888');
  await expect(page.locator('.sibling-note')).toContainText('Kakak Ujian');
  await page.getByRole('button', { name: 'Tutup borang' }).click();
  // Dari profil kakak: Daftar adik-beradik dengan penjaga sudah dipilih.
  await page
    .getByRole('row', { name: /Kakak Ujian/ })
    .getByRole('button', { name: /Lihat profil/ })
    .click();
  await page.getByRole('button', { name: 'Daftar adik-beradik' }).click();
  await expect(page.getByRole('heading', { name: 'Daftar adik-beradik' })).toBeVisible();
  await expect(page.getByLabel('Nama penjaga')).toHaveValue('Puan Rahmah');
  await expect(page.getByLabel('No. WhatsApp penjaga')).toHaveValue('197778888');
  await expect(page.locator('.sibling-note')).toContainText('Kakak Ujian');
  await page.getByLabel('Nama penuh', { exact: true }).fill('Adik Ujian');
  await page.getByRole('combobox', { name: 'Program' }).selectOption({ label: "Iqra'" });
  await page.getByRole('combobox', { name: 'Minit setiap sesi' }).selectOption('30');
  await page.getByRole('combobox', { name: 'Sesi 1: hari' }).selectOption({ label: 'Selasa' });
  await page.getByLabel('Jam').first().fill('20:00');
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  if ((page.viewportSize()?.width || 0) <= 700)
    await page.getByRole('button', { name: 'Buka menu' }).click();
  await page.getByRole('button', { name: 'Murid', exact: true }).first().click();
  for (const name of ['Kakak Ujian', 'Adik Ujian'])
    await expect(page.getByRole('row', { name: new RegExp(name) })).toContainText('+60197778888');
});
test('student profile: rename student and change weekly schedule (prefilled), sessions follow the new days', async ({
  page,
}) => {
  await page.goto('/?demo=1#/students');
  await page.getByLabel('Pratonton peranan demo').selectOption('tutor');
  if ((page.viewportSize()?.width || 0) <= 700)
    await page.getByRole('button', { name: 'Buka menu' }).click();
  await page.getByRole('button', { name: 'Murid', exact: true }).click();
  await enrol(page, 'Murid Ubah Jadual', "Iqra'");
  await page
    .getByRole('row', { name: /Murid Ubah Jadual/ })
    .getByRole('button', { name: /Lihat profil/ })
    .click();
  // Ubah jadual: nilai semasa diisi.
  await page.getByRole('button', { name: 'Ubah jadual' }).click();
  await expect(page.getByRole('combobox', { name: 'Sesi 1: hari' })).toHaveValue('1');
  await expect(page.getByLabel('Jam').first()).toHaveValue('20:00');
  await page.getByRole('combobox', { name: 'Sesi seminggu' }).selectOption('2');
  await page.getByRole('combobox', { name: 'Sesi 1: hari' }).selectOption({ label: 'Rabu' });
  await page.getByRole('combobox', { name: 'Sesi 2: hari' }).selectOption({ label: 'Jumaat' });
  await page.getByLabel('Jam').nth(1).fill('17:30');
  await page.getByRole('combobox', { name: 'Minit setiap sesi' }).selectOption('20');
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  const detail = page.locator('.program-detail').first();
  await expect(detail.locator('.slot-chip')).toHaveText(['Rabu 20:00', 'Jumaat 17:30']);
  await expect(detail).toContainText('20 minit');
  await expect(detail).toContainText('2 sesi');
  // Kemaskini nama murid.
  await page.getByRole('button', { name: 'Kemaskini murid' }).click();
  await page.getByLabel('Nama penuh murid').fill('Murid Nama Baharu');
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Murid Nama Baharu', level: 1 })).toBeVisible();
});
test('tutor writes own summary (rumusan) for a student; admin sees it in the monthly report preview', async ({
  page,
}) => {
  await page.goto('/?demo=1#/reports');
  await page.getByLabel('Bulan laporan').fill('2026-10');
  await page.getByLabel('Pratonton peranan demo').selectOption('tutor');
  if ((page.viewportSize()?.width || 0) <= 700)
    await page.getByRole('button', { name: 'Buka menu' }).click();
  await page.getByRole('button', { name: 'Laporan', exact: true }).click();
  const row = page.locator('.class-report-list li').filter({ hasText: 'Murid Contoh 01' });
  await row.getByRole('button', { name: 'Tulis rumusan' }).click();
  await page
    .getByLabel('Rumusan untuk laporan bulanan (ayat sendiri)')
    .fill('Alhamdulillah, bacaan semakin lancar. Fokus bulan depan ialah mad asli.');
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  await expect(row).toContainText('Ada rumusan');
  await expect(row.getByRole('button', { name: 'Ubah rumusan' })).toBeVisible();
  // Admin: draf laporan membawa rumusan tutor.
  await page.getByLabel('Pratonton peranan demo').selectOption('owner');
  if ((page.viewportSize()?.width || 0) <= 700)
    await page.getByRole('button', { name: 'Buka menu' }).click();
  await page.getByRole('button', { name: 'Laporan', exact: true }).click();
  await page.getByLabel('Bulan laporan').fill('2026-10');
  await page.getByRole('button', { name: 'Sediakan draf bulanan' }).click();
  for (const summary of await page.locator('.monthly-reports .tutor-group > summary').all())
    await summary.click();
  const card = page
    .locator('.report-item')
    .filter({ has: page.getByRole('heading', { name: 'Murid Contoh 01', exact: true }) });
  await expect(card).toContainText('rumusan tutor ✓');
  await card.getByRole('button', { name: 'Lihat laporan' }).click();
  await expect(page.locator('.remark-quote')).toContainText('Fokus bulan depan ialah mad asli.');
});
test('finance invoices: search by parent, student, tutor or number in two paid/unpaid columns', async ({
  page,
}) => {
  await page.goto('/?demo=1#/finance');
  const due = page.getByRole('region', { name: 'Belum bayar' });
  const done = page.getByRole('region', { name: 'Sudah bayar' });
  await expect(due).toContainText('DEMO-001');
  await expect(due).toContainText('DEMO-003');
  // Draf kekal dalam Belum bayar dengan lencana Draf.
  await expect(due.getByRole('row').filter({ hasText: 'DEMO-004' })).toContainText('Draf');
  await expect(done).toContainText('DEMO-002');
  await expect(done).not.toContainText('DEMO-001');
  await expect(due).toContainText('3 invois');
  await expect(done).toContainText('1 invois');
  // Tindakan per invois dikekalkan.
  await expect(
    due.getByRole('row').filter({ hasText: 'DEMO-003' }).getByRole('button', {
      name: 'Yuran telah dibayar',
    }),
  ).toBeVisible();
  await expect(done.getByRole('link', { name: 'Cetak / PDF' })).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'Cari invois' });
  await search.fill('Murid Contoh 03');
  await expect(due).toContainText('DEMO-003');
  await expect(due).not.toContainText('DEMO-001');
  await expect(done).toContainText('Tiada padanan.');
  await search.fill('penjaga contoh 2');
  await expect(done).toContainText('DEMO-002');
  await expect(due).not.toContainText('DEMO-');
  await search.fill('Tutor Contoh 3');
  await expect(due).toContainText('DEMO-003');
  await expect(done).toContainText('DEMO-002');
  await expect(due).not.toContainText('DEMO-001');
  await search.fill('demo-004');
  await expect(due).toContainText('DEMO-004');
  await expect(due).not.toContainText('DEMO-003');
  // Bayar: invois berpindah ke lajur Sudah bayar.
  await search.fill('');
  await due
    .getByRole('row')
    .filter({ hasText: 'DEMO-003' })
    .getByRole('button', { name: 'Yuran telah dibayar' })
    .click();
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  await expect(done).toContainText('DEMO-003');
  await expect(due).not.toContainText('DEMO-003');
  if ((page.viewportSize()?.width || 0) <= 760) {
    const [a, b] = [await due.boundingBox(), await done.boundingBox()];
    expect(b!.y).toBeGreaterThan(a!.y + a!.height - 1);
  } else {
    const [a, b] = [await due.boundingBox(), await done.boundingBox()];
    expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);
    expect(b!.x).toBeGreaterThan(a!.x);
  }
});
test('tutor allowance: unpaid and paid tutors in two columns; paying moves the tutor across', async ({
  page,
}) => {
  await page.goto('/?demo=1#/allowance');
  const unpaid = page.getByRole('region', { name: 'Belum dibayar' });
  const paid = page.getByRole('region', { name: 'Sudah dibayar' });
  await expect(unpaid).toContainText('Tutor Contoh 1');
  await expect(paid).toContainText('Belum ada elaun dibayar bulan ini.');
  await expect(unpaid).toContainText(/\d tutor · baki RM/);
  const row = unpaid.getByRole('row').filter({ hasText: 'Tutor Contoh 1' });
  await row.getByRole('button', { name: 'Elaun telah dibayar' }).click();
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  const moved = paid.getByRole('row').filter({ hasText: 'Tutor Contoh 1' });
  await expect(moved).toContainText('Dibayar ·');
  await expect(unpaid).not.toContainText('Tutor Contoh 1');
  await expect(paid).toContainText('1 tutor');
  await moved.getByRole('button', { name: /Butiran/ }).click();
  await expect(page.locator('.tab-total')).toContainText('RM');
});
test('admin Hari ini lists only tutors with a session today (KL date)', async ({ page }) => {
  // Tarikh tetap tanpa sesi demo; tutor 1 menambah satu sesi hari ini.
  await page.clock.setFixedTime(new Date('2026-10-13T09:00:00+08:00'));
  await page.goto('/?demo=1#/calendar');
  await expect(page.getByRole('heading', { name: 'Sesi hari ini' })).toBeVisible();
  await expect(page.getByText('Tiada sesi hari ini.')).toBeVisible();
  await expect(page.getByRole('tab', { name: /^Tutor Contoh/ })).toHaveCount(0);
  await page.getByLabel('Pratonton peranan demo').selectOption('tutor');
  if ((page.viewportSize()?.width || 0) <= 700)
    await page.getByRole('button', { name: 'Buka menu' }).click();
  await page.getByRole('button', { name: 'Sesi & kehadiran', exact: true }).click();
  await page.locator('.student-picker button').first().click();
  await page.locator('.card').first().getByRole('button', { name: 'Tambah rekod sesi' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tarikh kelas').fill('2026-10-13');
  await dialog.getByLabel('Jam').fill('20:00');
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  await expect(page.getByLabel('Tarikh kelas')).toHaveValue('2026-10-13');
  await page.getByLabel('Pratonton peranan demo').selectOption('owner');
  if ((page.viewportSize()?.width || 0) <= 700)
    await page.getByRole('button', { name: 'Buka menu' }).click();
  await page.getByRole('button', { name: 'Sesi & kehadiran', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Hari ini' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('tab', { name: 'Tutor Contoh 1' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Tutor Contoh 2' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Tutor Contoh 3' })).toHaveCount(0);
  const block = page.getByRole('region', { name: 'Tutor Contoh 1' });
  await expect(block).toContainText('1 sesi');
  await expect(block.locator('td[data-label="Masa"]')).toHaveCount(1);
  // Tab lain masih memaparkan semua tutor.
  await page.getByRole('tab', { name: 'Semua murid' }).click();
  await expect(page.getByRole('tab', { name: 'Tutor Contoh 2' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Tutor Contoh 3' })).toBeVisible();
});
// Admin mendaftar murid bagi pihak tutor; jadual fleksibel tidak menjana sesi automatik.
async function adminEnrol(page: Page, name: string, tutor: string, flexible = false) {
  await page.getByRole('button', { name: 'Daftar murid', exact: true }).click();
  await page.getByLabel('Nama penuh', { exact: true }).fill(name);
  await page.getByRole('combobox', { name: 'Tutor', exact: true }).selectOption({ label: tutor });
  await page.getByLabel('No. WhatsApp penjaga').fill('019-555 1212');
  await page.getByRole('combobox', { name: 'Program' }).selectOption({ label: "Iqra'" });
  await page.getByRole('combobox', { name: 'Minit setiap sesi' }).selectOption('30');
  await page.getByRole('combobox', { name: 'Sesi 1: hari' }).selectOption({ label: 'Rabu' });
  await page.getByLabel('Jam').first().fill('18:15');
  if (flexible) {
    await page.getByLabel('Jadual fleksibel').check();
    await expect(page.getByText(/sesi tidak dijana automatik/)).toBeVisible();
  }
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
}
test('admin registers a flexible student for a tutor; the tutor records a class on the real date', async ({
  page,
}) => {
  await page.goto('/?demo=1#/students');
  // Admin melihat semua penjaga yang mempunyai anak aktif.
  await page.getByRole('button', { name: 'Daftar murid', exact: true }).click();
  expect(
    await page.getByRole('combobox', { name: 'Penjaga', exact: true }).locator('option').count(),
  ).toBeGreaterThan(3);
  await page.getByRole('button', { name: 'Tutup borang' }).click();
  await adminEnrol(page, 'Murid Fleksibel', 'Tutor Contoh 1', true);
  await page
    .getByRole('row', { name: /Murid Fleksibel/ })
    .getByRole('button', { name: /Lihat profil/ })
    .click();
  const detail = page.locator('.program-detail').first();
  await expect(detail).toContainText('Tutor Contoh 1');
  await expect(detail).toContainText('Jadual fleksibel');
  await expect(detail).toContainText('0 kelas direkod');
  await expect(detail).not.toContainText('berbaki');
  await expect(detail.locator('.slot-chip')).toHaveText(['Rabu 18:15']);
  // Ubah jadual: pilihan fleksibel diisi.
  await detail.getByRole('button', { name: 'Ubah jadual' }).click();
  await expect(page.getByLabel('Jadual fleksibel')).toBeChecked();
  await page.getByRole('button', { name: 'Tutup borang' }).click();
  // Tutor: tiada sesi dijana, jadi pilih murid membuka Tambah rekod sesi dengan masa pilihan.
  await page.getByLabel('Pratonton peranan demo').selectOption('tutor');
  if ((page.viewportSize()?.width || 0) <= 700)
    await page.getByRole('button', { name: 'Buka menu' }).click();
  await page.getByRole('button', { name: 'Sesi & kehadiran', exact: true }).click();
  const pick = page.locator('.student-picker button').filter({ hasText: 'Murid Fleksibel' });
  await expect(pick).toContainText('Jadual fleksibel · 0 kelas direkod');
  await pick.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Tambah rekod sesi' })).toBeVisible();
  await expect(dialog.getByLabel('Jam')).toHaveValue('18:15');
  await dialog.getByLabel('Tarikh kelas').fill('2026-10-07');
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  await expect(page.getByLabel('Tarikh kelas')).toHaveValue('2026-10-07');
  await page.getByRole('button', { name: 'Hadir', exact: true }).click();
  await page.getByRole('button', { name: 'Simpan kehadiran' }).click();
  await expect(page.getByText(/1 kelas direkod · jadual fleksibel/)).toBeVisible();
});
test('admin transfers a class to another tutor and sets special fee and tutor allowance rates', async ({
  page,
}) => {
  await page.goto('/?demo=1#/students');
  await adminEnrol(page, 'Murid Pindah', 'Tutor Contoh 1');
  await page
    .getByRole('row', { name: /Murid Pindah/ })
    .getByRole('button', { name: /Lihat profil/ })
    .click();
  const detail = page.locator('.program-detail').first();
  await expect(detail.locator('.tutor-chip')).toHaveText('Tutor Contoh 1');
  // Pindah tutor mulai hari ini.
  await detail.getByRole('button', { name: 'Pindah tutor' }).click();
  await expect(page.getByLabel('Berkuat kuasa mulai')).not.toHaveValue('');
  await page
    .getByRole('combobox', { name: 'Tutor baharu' })
    .selectOption({ label: 'Tutor Contoh 2' });
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  await expect(detail.locator('.tutor-chip')).toHaveText('Tutor Contoh 2');
  // Kadar khas: yuran sahaja; elaun kosong = kadar standard.
  await detail.getByRole('button', { name: 'Kadar khas' }).click();
  await page.getByLabel('Yuran setiap sesi (RM)').fill('12.50');
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  await expect(detail).toContainText(/Yuran khas RM\s?12\.50/);
  await expect(detail).not.toContainText('Elaun khas');
  await detail.getByRole('button', { name: 'Kadar khas' }).click();
  await expect(page.getByLabel('Yuran setiap sesi (RM)')).toHaveValue('12.50');
  await page.getByLabel('Elaun tutor setiap sesi (RM)').fill('7');
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  await expect(detail).toContainText(/Elaun khas RM\s?7\.00/);
  // Elaun khas tutor (potongan) dalam Kewangan → Elaun tutor.
  await page.goto('/?demo=1#/allowance');
  await page.getByRole('tab', { name: 'Tutor Contoh 2', exact: true }).click();
  const rate = page.locator('.tutor-rate-row');
  await expect(rate).toContainText('Tiada (kadar standard)');
  await rate.getByRole('button', { name: 'Elaun khas tutor' }).click();
  await page.getByLabel('Tambahan/potongan setiap sesi (RM, boleh negatif)').fill('-1.50');
  await page.getByRole('button', { name: 'Simpan dalam demo', exact: true }).click();
  await expect(rate).toContainText(/−RM\s?1\.50 setiap sesi/);
});
test('admin generates reports + invoice for one family at once, then ZIPs a tutor group', async ({
  page,
}) => {
  await page.goto('/?demo=1#/reports');
  await page.getByLabel('Bulan laporan').fill('2026-10');
  const delivery = page.locator('.family-delivery');
  await delivery.getByLabel('Cari murid, ibu bapa atau no. telefon').fill('Murid Contoh 06');
  const family = delivery.locator('.family-row').filter({ hasText: 'Penjaga Contoh 1' }).first();
  await expect(family).toContainText('Belum lengkap');
  await expect(family.getByRole('button', { name: 'Sediakan PDF', exact: true })).toBeDisabled();
  await family.getByRole('button', { name: 'Jana & sediakan PDF' }).click();
  await expect(family.getByRole('button', { name: 'Muat turun PDF' })).toBeVisible();
  await expect(family).toContainText('Sedia dihantar');
  await expect(family.getByRole('button', { name: 'Jana & sediakan PDF' })).toHaveCount(0);
  const dl = page.waitForEvent('download');
  await family.getByRole('button', { name: 'Muat turun PDF' }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toMatch(/^Laporan & Invois - Penjaga Contoh 1 - .*\.pdf$/);
  const merged = await PDFDocument.load(await readFile((await file.path())!));
  expect(merged.getPageCount()).toBeGreaterThanOrEqual(4);
  // ZIP semua PDF keluarga yang lengkap dalam kumpulan tutor ini.
  const group = delivery.locator('.delivery-group').filter({ hasText: 'Penjaga Contoh 1' }).first();
  const zipWait = page.waitForEvent('download');
  await group.getByRole('button', { name: 'Muat turun semua PDF (ZIP)' }).click();
  const zipFile = await zipWait;
  expect(zipFile.suggestedFilename()).toMatch(/^Laporan & Invois - .*\.zip$/);
  const zip = await JSZip.loadAsync(await readFile((await zipFile.path())!));
  expect(Object.keys(zip.files).some((n) => n.includes('Penjaga Contoh 1'))).toBe(true);
  // Jana semua keluarga tutor ini sekali gus.
  await group.getByRole('button', { name: 'Jana semua (tutor ini)' }).click();
  await expect(delivery.getByRole('status')).toContainText(/PDF keluarga sedia/);
  // Laporan kelas gaya tutor (tanpa invois) bagi satu kumpulan tutor dalam semakan laporan.
  await page.locator('.monthly-reports .tutor-group > summary').first().click();
  const classZip = page.waitForEvent('download');
  await page
    .locator('.monthly-reports .tutor-group')
    .first()
    .getByRole('button', { name: 'Laporan kelas tutor (ZIP)' })
    .click();
  expect((await classZip).suggestedFilename()).toMatch(/^Laporan Kelas .*\.zip$/);
});
test('tutor records a class held on another day with one save; reading record lists it', async ({
  page,
}) => {
  await page.goto('/?demo=1#/dashboard');
  await page.getByLabel('Pratonton peranan demo').selectOption('tutor');
  if ((page.viewportSize()?.width || 0) <= 700)
    await page.getByRole('button', { name: 'Buka menu' }).click();
  await page.getByRole('button', { name: 'Sesi & kehadiran', exact: true }).click();
  await page.locator('.student-picker button').first().click();
  // Kelas sebenar berlaku pada hari lain dan jam lain: ubah tarikh/jam, terus simpan kehadiran.
  await page.getByLabel('Tarikh kelas').first().fill('2026-10-07');
  await page.getByLabel('Jam').first().fill('21:00');
  await expect(page.getByText('Tarikh/jam baharu akan disimpan bersama kehadiran')).toBeVisible();
  const first = page.locator('.student-tabs button').first();
  await first.click();
  await page.getByRole('button', { name: 'Hadir', exact: true }).click();
  await page.getByLabel("Jilid Iqra'").selectOption('3');
  await page.getByLabel('Muka surat').fill('12');
  await page.getByRole('button', { name: /Simpan (kehadiran|perubahan)/ }).click();
  await expect(page.locator('.save-notice')).toContainText('memori tab');
  await expect(page.getByLabel('Tarikh kelas').first()).toHaveValue('2026-10-07');
  await first.click();
  const record = page.locator('.reading-record');
  await expect(record).toContainText('Sesi ini');
  await expect(record).toContainText("Iqra' 3");
});
test('theory programme (KAFA) asks for a written topic instead of skill taps', async ({ page }) => {
  await page.goto('/?demo=1&role=tutor#/calendar');
  await page
    .locator('.student-picker button')
    .filter({ hasText: 'Fardhu Ain KAFA' })
    .first()
    .click();
  await expect(page.getByText('2. Kemahiran dinilai')).toHaveCount(0);
  await page.getByRole('button', { name: 'Hadir', exact: true }).click();
  const save = page.getByRole('button', { name: /Simpan (kehadiran|perubahan)/ });
  const topic = page.getByLabel('Tajuk / topik pembelajaran');
  await topic.fill('');
  await expect(save).toBeDisabled();
  await expect(page.getByText('Isi tajuk/topik pembelajaran dahulu.')).toBeVisible();
  await topic.fill('Bab wuduk — rukun dan perkara sunat');
  await expect(page.locator('.preview-comment')).toContainText(
    'Topik pembelajaran: Bab wuduk — rukun dan perkara sunat.',
  );
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.locator('.save-notice')).toContainText('memori tab');
});
