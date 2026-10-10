import ExcelJS from 'exceljs';
import JSZip from 'jszip';
export async function loadReferenceWorkbook(bytes: Buffer) {
  // The supplied v2.1 workbook uses a prefixed SpreadsheetML namespace and
  // BOMs. ExcelJS expects default SpreadsheetML tags. Normalize in memory
  // only; retain formulas/content and never rewrite the user's source.
  const zip = await JSZip.loadAsync(bytes);
  for (const file of Object.values(zip.files))
    if (file.name.endsWith('.xml') || file.name.endsWith('.rels')) {
      let text = (await file.async('string')).replace(/^\uFEFF/, '');
      if (text.includes('xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'))
        text = text
          .replace(
            'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
            'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
          )
          .replace(/(<\/?)x:/g, '$1');
      zip.file(file.name, text);
    }
  const book = new ExcelJS.Workbook();
  const normalized = await zip.generateAsync({ type: 'nodebuffer' });
  await book.xlsx.load(normalized as unknown as Parameters<typeof book.xlsx.load>[0]);
  return book;
}
