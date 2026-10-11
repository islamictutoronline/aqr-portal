# Kemajuan pelaksanaan AQR

Mula: 10 Oktober 2026, Asia/Kuala_Lumpur.

- [x] Periksa bahan rujukan: folder asal tiada kod, Node 24/npm 11 tersedia.
- [x] Semak dokumentasi rasmi Next.js, Supabase SSR, RLS dan Storage.
- [x] Skema berbilang organisasi, RLS, transaksi kewangan dan ujian PostgreSQL.
- [x] Kod OTP, lapisan akses server dan bootstrap pemilik; SMTP/akses cloud belum diuji.
- [x] Pengurusan akademik asas, sesi, kehadiran, penilaian tap dan portal ibu bapa.
- [x] Kadar berversi, pengiraan elaun, pengesahan, maker-checker dan pelarasan.
- [x] XLSX/CSV, cetak/PDF pelayar, kod OAuth/API Google dengan audit dan retry.
- [x] Import September peribadi: dry-run CSV/workbook sebenar; tiada apply cloud.
- [x] Typecheck, lint, unit/SQL/E2E, build dan dokumentasi batas sebenar.
- [x] Pusingan 2 (`docs/REQUIREMENTS_FINAL.md`): binaan statik GitHub Pages (Vite, `portal/` → `dist-pages/`), laporan bulanan diluluskan + PDF/ZIP, rekod penghantaran WhatsApp manual, permohonan tutor, tuntutan akses penjaga, Edge Function `aqr-admin`, migrasi 15–16.
- [x] Permudahan atas permintaan pengguna (10 Okt): menu 11 → 6 kumpulan dengan tab dalam halaman (laluan asal kekal), alat jarang guna dilipat di bawah "Lagi pilihan", label status lebih mudah; **peranan admin akademik + admin kewangan disatukan menjadi `admin`** (migrasi 17); demo dibuang daripada binaan terbitan (hanya dev/ujian); `docs/SETUP_SUPABASE.md`, `.env.local` kosong dan `npm run db:sql` untuk pemasangan sebenar.
- [x] Laporan Excel admin: status Bahasa Melayu (`statusLabels` kini dalam `src/lib/core.ts`), nama penyemak/pelulus menggantikan ID, label pilihan penilaian, lajur wang dipaparkan sebagai RM dua perpuluhan (data asas kekal integer sen). Contoh fiksyen dalam `contoh-laporan/` (diabaikan Git).
- [x] Sambungan 10 Okt (agen kedua): folder Vite dinamakan semula `pages/` → `portal/` kerana `next build` gagal (Next menganggap `pages/` sebagai Pages Router); 13 fail diformat Prettier (gaya sahaja).

Tiada `.env`, Supabase CLI atau Docker ditemui. Sambungan cloud belum disahkan. Data demo mesti rekaan dan tidak mengandungi murid daripada fail sumber.

## Hasil dan bukti setempat

| Arahan                                                    | Keputusan sebenar                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `npm install` / lockfile                                  | Berjaya; versi dipin dalam package-lock.json                                          |
| `npm run typecheck`                                       | Lulus TypeScript strict                                                               |
| `npm run lint`                                            | Lulus tanpa amaran                                                                    |
| `npm test`                                                | **69/69 lulus**, 5 fail, termasuk 23 ujian PostgreSQL dengan semua 17 migrasi         |
| `npm run build`                                           | Lulus Next.js 16.4.0 App Router + proxy (selepas `pages/` → `portal/`)                |
| `npm run format:check`                                    | Lulus selepas Prettier pada 13 fail                                                   |
| `npm run build:pages`                                     | Lulus; amaran saiz chunk > 500 kB sahaja (workbook/fontkit/PDF)                       |
| `npm run test:pages`                                      | **8/8 lulus** (4 ujian × desktop/telefon) pada `dist-pages/` setempat                 |
| `npm run test:e2e`                                        | **8/8 lulus** pada desktop 1440px dan telefon 390px                                   |
| `npm audit`                                               | **0 vulnerabilities** pada semakan sesi ini                                           |
| Import CSV + workbook tanpa `--apply`                     | **72 / 92 / 56200 sen anggaran / 0 sen layak**; 1 kumpulan tarikh kabur               |
| Screenshot                                                | `docs/evidence/dashboard-desktop.png`, `dashboard-mobile.png`; kedua-duanya diperiksa |
| pgTAP pada Supabase / OTP / Storage HTTP / Google sebenar | **Belum dijalankan**: tiada sambungan/kredensial staging                              |

Ujian pelayar membuka kesemua 10 skrin modul tanpa ralat JavaScript atau overflow dokumen, kemudian menguji penerbitan penilaian tanpa menaip, ketidakhadiran, peranan keluarga dan fail XLSX/CSV sebenar. Ujian eksport turut meliputi 10,000 baris dan escaping formula. Ujian DB menggunakan PostgreSQL PGlite dengan skema Auth/Storage stub; ia menguji SQL/RLS, bukan keseluruhan platform Supabase.

## Jadual pelaksanaan

| Modul                                                         | Status                  | Batas / tindakan seterusnya                                                                               |
| ------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------- |
| Asas, branding, locale, fon tempatan, UI telefon              | Dilaksanakan            | Semakan aksesibiliti formal penuh belum dibuat                                                            |
| Organisasi, pelajar, penjaga, pautan, tutor, kelas, kurikulum | Dilaksanakan sebahagian | Cipta/paut/tugas/arkib ada; suntingan umum dan branch scoping belum lengkap                               |
| RLS / data access / composite FK / audit                      | Dilaksanakan, diuji SQL | Jalankan semula di Supabase staging dengan pengguna sebenar                                               |
| OTP, jemputan pemilik, cookie, logout lokal                   | Kod dilaksanakan        | Konfigurasikan SMTP, URL dan matikan signup; uji tamat tempoh / refresh                                   |
| Sesi/jadual/penjana/pembatalan/jadual semula                  | Kod dilaksanakan        | Uji pengecualian dan pertindihan operasi di staging                                                       |
| Kehadiran & ulasan tap / draft / published                    | Dilaksanakan, diuji     | Template v1 digunakan; editor template berversi penuh dan koreksi selepas kunci payroll belum lengkap     |
| Milestone dan paparan unit penjaga                            | Dilaksanakan, diuji SQL | Perlu bukti kehadiran/unit sepadan; trend longitudinal belum lengkap                                      |
| Yuran, invois, bayaran, peruntukan, resit, pembalikan         | Dilaksanakan, diuji SQL | Tiada kadar yuran AQR dicipta; refund bank sebenar dan ageing lengkap belum ada                           |
| Pelan & invois bulanan idempotent                             | Dilaksanakan, diuji SQL | Per sesi/pakej masih melalui invois eksplisit; polisi lanjutan perlu ditetapkan                           |
| Kadar, snapshot, semakan, kelompok, payout, pelarasan         | Dilaksanakan, diuji SQL | Bayaran ialah catatan rujukan sebenar, bukan pemindahan bank automatik                                    |
| Bukti bayaran / logo                                          | Kod dilaksanakan        | Bucket private; server sniff saiz/MIME/bait; uji Storage API dan pengendalian orphan di staging           |
| 9 jenis laporan XLSX/CSV                                      | Dilaksanakan, diuji     | DTO sama pada pratonton/eksport, peranan demo juga diskop; penapis tutor/program lanjutan belum lengkap   |
| Google OAuth / tokens / create / RAW / retry / audit          | Kod dilaksanakan        | Owner/finance sahaja; tiada ujian akaun sebenar; update spreadsheet pilihan pengguna belum ada            |
| PDF                                                           | Sebahagian              | Cetak/Simpan PDF pelayar; bukan penjana PDF server                                                        |
| Import September                                              | Dry-run disahkan        | Opt-in apply ke staging sahaja; petakan 16 nama dan blok tanpa nama secara manual; jangan automatik bayar |
| WhatsApp tanpa e-mel                                          | Belum dilaksanakan      | Fallback OTP e-mel, seperti pilihan selamat dalam master prompt                                           |
| Revocation peranti lain / retention automatik / produksi      | Belum dilaksanakan      | Perlu konfigurasi operasi dan semakan staging                                                             |
| Logo AQR + Islamic Tutor Online (11 Okt)                      | Dilaksanakan, diuji     | PDF laporan/payslip/invois/resit, Excel setiap tab, UI & favicon; CSV teks sahaja (tiada imej)            |
| Kata laluan tutor (11 Okt)                                    | Dilaksanakan, diuji     | Kod e-mel hanya kali pertama/lupa; diuji setempat (demo), log masuk sebenar perlu disahkan pengguna       |

## Langkah berikut yang nyata

1. Konfigurasikan Supabase staging peribadi dan `.env.local` seperti README; jalankan migrasi serta bootstrap pemilik tanpa reset.
2. Jemput admin kewangan kedua, tutor dan dua penjaga ujian. Jalankan matriks akses terhadap HTTP Auth/Storage dan eksport sebenar.
3. Sahkan tarikh kadar, tetapkan yuran pusat sendiri, kemudian uji satu kitaran sesi → semak → lulus → payout, serta invois → bayaran separa → resit → pembalikan.
4. Sambungkan OAuth Google dengan akaun ujian dan uji kegagalan, revocation serta retry. Tiada URL kejayaan cloud diberikan tanpa pengakuan API.
5. Tutup baki modul yang disenaraikan di atas sebelum go-live. Tiada tuntutan bahawa sistem penuh telah dideploy atau bersedia produksi dibuat.
