import type { Metadata } from 'next';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/noto-naskh-arabic/400.css';
import './globals.css';
export const metadata: Metadata = {
  title: 'AQR · Sistem Pengurusan Akademi',
  description: 'Akademi Al-Quran Ar-Riyadh · Tutor & Learning Management System',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ms">
      <body>{children}</body>
    </html>
  );
}
