import { it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { loadReferenceWorkbook } from '../../src/lib/import-workbook';
it('normalizes prefixed SpreadsheetML / BOM without changing source bytes or quotas', async () => {
  const original = new ExcelJS.Workbook();
  const sheet = original.addWorksheet('RINGKASAN_MURID');
  sheet.addRow(['Bulan', 'Murid', 'Kod', 'Minit', 'Kuota']);
  sheet.addRow(['2026-09', 'Anonymous', 'IQRA', 20, 4]);
  const zip = await JSZip.loadAsync(await original.xlsx.writeBuffer());
  const xml = await zip.file('xl/workbook.xml')!.async('string');
  zip.file(
    'xl/workbook.xml',
    '\uFEFF' +
      xml
        .replace(
          'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
          'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
        )
        .replace(
          /(<\/?)(workbook|sheets|sheet|bookViews|workbookView|definedNames|definedName|calcPr|workbookPr)(?=[\s/>])/g,
          '$1x:$2',
        ),
  );
  const bytes = await zip.generateAsync({ type: 'nodebuffer' }),
    before = Buffer.from(bytes);
  const normalized = await loadReferenceWorkbook(bytes);
  expect(normalized.getWorksheet('RINGKASAN_MURID')!.getCell('E2').value).toBe(4);
  expect(bytes.equals(before)).toBe(true);
});
