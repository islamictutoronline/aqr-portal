// Logo rasmi untuk dokumen (PDF/Excel): Akademi Quran Ar-Riyadh dan Islamic Tutor Online.
// Dimuatkan daripada aset setempat; jika tiada (cth. ujian Node), dokumen dijana tanpa logo.
import { assetUrl } from './transport';
export type BrandBytes = { aqr?: Uint8Array; ito?: Uint8Array };
let cached: Promise<BrandBytes> | null = null;
export function loadBrandBytes(): Promise<BrandBytes> {
  if (typeof window === 'undefined') return Promise.resolve({});
  cached ??= (async () => {
    const get = async (file: string) => {
      try {
        const r = await fetch(new URL(assetUrl(`brand/${file}`), document.baseURI));
        return r.ok ? new Uint8Array(await r.arrayBuffer()) : undefined;
      } catch {
        return undefined;
      }
    };
    return { aqr: await get('aqr-mark.png'), ito: await get('ito-logo.png') };
  })();
  return cached;
}
