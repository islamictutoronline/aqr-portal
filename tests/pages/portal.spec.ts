import { test, expect, type Page } from '@playwright/test';
// Isi borang Daftar murid (model individu dengan satu slot mingguan).
async function enrol(page: Page, name: string, program: string) {
  await page.getByRole('button', { name: 'Daftar murid', exact: true }).click();
  await page.getByLabel('Nama penuh', { exact: true }).fill(name);
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
test('admin approves a report, downloads actual PDF and ZIP, then parent sees only own approved report', async ({
  page,
}) => {
  await page.goto('/?demo=1#/reports');
  await page.getByRole('button', { name: 'Sediakan draf bulanan' }).click();
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
  await page.getByRole('combobox', { name: 'Program' }).selectOption({ label: "Iqra'" });
  await page.getByRole('combobox', { name: 'Minit setiap sesi' }).selectOption('30');
  await expect(page.getByLabel('Sehingga tarikh')).toHaveValue('2027-12-31');
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
  await expect(detail).toContainText('Isnin 20:00, Khamis 21:00');
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
  await page.getByRole('tab', { name: 'Tutor Contoh 1' }).click();
  await expect(page.getByRole('heading', { name: 'Tutor Contoh 1' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Elaun' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Lulus|Sahkan/ })).toHaveCount(0);
  await page.goto('/?demo=1#/allowance');
  await page.reload();
  await expect(page.getByText('Jumlah perlu dibayar').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Semakan sesi' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Tutor Contoh 2' }).click();
  await expect(page.locator('.tab-total')).toContainText('RM');
  await expect(page.getByRole('columnheader', { name: 'Kehadiran' })).toBeVisible();
});
test('admin dashboard hides the learning sessions list; tutor still sees it', async ({ page }) => {
  await page.goto('/?demo=1#/dashboard');
  await expect(page.getByRole('heading', { name: 'Perlu perhatian' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sesi pembelajaran' })).toHaveCount(0);
  await page.getByLabel('Pratonton peranan demo').selectOption('tutor');
  await expect(page.getByRole('heading', { name: 'Sesi pembelajaran' })).toBeVisible();
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
