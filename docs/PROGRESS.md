# Kemajuan pelaksanaan AQR

Mula: 10 Oktober 2026, Asia/Kuala_Lumpur.

Bacaan al-Quran (15 Okt): surah + muka surat wajib, ayat + juzuk pilihan — dideploy (`279651c`, Pages #38746070030 success).

Pembetulan rekod kelas + rekod bacaan gaya Tahfiz — 15 Oktober 2026:

- [x] Butang Edit kelas direkod: tatal ke editor + penanda "Sedang dibuka di atas"; mesej simpan dipaparkan di sebelah butang Simpan.
- [x] Kelas direkod lewat / hari lain: tarikh-jam yang diubah disimpan bersama kehadiran; migrasi 39 (`extend_backdated`, `create_session` hidupkan semula slot dipadam, `free_voided_slot` dalam `move_session`).
- [x] Rekod bacaan gaya SMAP: Juzuk (auto), Muka surat, Surah/Jilid, sejarah 3 terkini setiap perkara dengan Edit (tiada medan Status — rekod disimpan = selesai).
- [x] Program teori (KAFA, Bahasa Arab, Faraid, Tajwid, Tadabbur, Tarannum): tajuk/topik ditulis sendiri menggantikan kemahiran; masuk ulasan, sesi, laporan kemajuan dan PDF bulanan (migrasi 40).
- [x] Typecheck/lint/Prettier; `npm test` 124/124; `test:pages` 72/72; Pages/Next.js build; E2E 8/8.
- [x] Migrasi 39 dan 40 dipasang di Supabase sebenar dan disahkan (15 Okt).
- [x] Push dan deploy: commit `7be11e8`; AQR checks #38741932570 dan Pages #38741943641 success; laman sebenar HTTP 200 dengan aset baharu.

Push dan deploy — 13 Oktober 2026:

- [x] Commit UI `80fd127` dipush ke `main`; AQR checks [#38396303210](https://github.com/islamictutoronline/aqr-portal/actions/runs/38396303210) dan Pages [#38396313209](https://github.com/islamictutoronline/aqr-portal/actions/runs/38396313209) **success**.
- [x] [Portal sebenar](https://islamictutoronline.github.io/aqr-portal/) HTTP 200; CSS dan JavaScript tema bersama disahkan. Log masuk desktop/telefon tanpa ralat, telefon 390px tanpa limpahan, demo produksi kekal terkunci.
- [x] Tiada perubahan data/migrasi atau ujian semula Supabase berautentikasi. Catatan selepas deploy ialah dokumentasi sahaja (`[skip ci]`); aset terbitan kekal daripada `80fd127`.

Tema emerald semua tab — 13 Oktober 2026:

- [x] `portal-theme.css` menggantikan `dashboard.css`; kelas tema dikongsi oleh semua tab `App`. Sidebar, subtab, kad, jadual, borang/dialog, profil, program, sesi, laporan, kewangan, tetapan dan Parent Portal kini seragam emerald/mint/sage.
- [x] Sebelas halaman × empat lebar (320/390/768/1440px), 44 paparan tanpa limpahan dokumen atau ralat JavaScript. Jadual lejar elaun dalam “Lagi pilihan” kini skrol di dalam pembalut pada telefon. Borang, profil tutor, editor sesi dan peranan penjaga turut disemak.
- [x] Typecheck/lint/Prettier, binaan Pages/Next.js, Pages 68/68 dan E2E Next.js 8/8 lulus. Bukti rekaan `docs/evidence/portal-emerald-*.png` disimpan setempat. Parent Portal kekal baca sahaja; cetakan asal dikekalkan. Tiada perubahan data/cloud atau deploy.

Dashboard emerald cerah — 13 Oktober 2026 (arahan susulan dengan imej rujukan):

- [x] Tema gelap awal diganti dengan latar mint, sidebar putih, kad bulat berbayang lembut dan pelbagai tona emerald/sage/hijau muda. Hero mengekalkan identiti AQR. Perubahan CSS dashboard sahaja; fitur dan data asal dikekalkan.
- [x] Semakan 320/390/768/1024/1440px tanpa limpahan, dengan carian dan carta kelihatan; kad bertindan pada tablet. Menu telefon/Escape memulangkan fokus dengan betul.
- [x] Typecheck/lint/Prettier dan binaan Pages/Next.js lulus; Pages 68/68, E2E Next.js 8/8. Bukti rekaan terkini: `docs/evidence/dashboard-emerald-desktop.png` dan `docs/evidence/dashboard-emerald-mobile.png` (setempat, diabaikan Git). Tiada perubahan data/cloud, migrasi atau deploy.

Tema futuristik awal — 13 Oktober 2026 (diganti oleh tema emerald cerah):

- [x] Lapisan CSS dashboard sahaja: zamrud gelap, aksen cyan/emas, panel berlapis, grid dan orbit hiasan. Kandungan, pengiraan, handler dan akses sedia ada dikekalkan; Parent Portal dan cetakan menggunakan paparan asal.
- [x] Typecheck, lint, Prettier UI, binaan Pages/Next.js lulus; Pages 68/68 dan E2E Next.js 8/8. Dashboard 320/390/768/1440px tanpa limpahan; semakan visual desktop/telefon/tutor dan navigasi ke halaman lain lulus tanpa ralat JavaScript.
- [x] Pratonton rekaan disimpan dalam `docs/evidence/dashboard-futuristic-desktop.png` dan `docs/evidence/dashboard-futuristic-mobile.png` (setempat, diabaikan Git). Tiada perubahan data/cloud, migrasi, push atau deploy. Amaran bundle/import Vite sedia ada kekal.

Kemasan paparan — 12 Oktober 2026:

- [x] UI hijau/emas lebih seragam: kad, angka ringkasan, tipografi, tab, butang dan log masuk; ringkasan perhatian pentadbir dalam tiga ruang pada desktop.
- [x] Carian telefon, menu dengan latar boleh ditutup/Escape, perangkap fokus dan `inert` semasa tertutup; sasaran sentuh butang utama sekurang-kurangnya 44px.
- [x] Betulkan limpahan ringkasan kewangan, keluarga laporan dan bar navigasi pada telefon 320px. Semakan 7 halaman pada 320/390/768/1440px tanpa limpahan mendatar.
- [x] Typecheck, lint, build Pages dan Next.js lulus; ujian Pages 56/56, E2E Next.js 8/8. Semakan visual menggunakan fixture rekaan; Parent Portal kekal baca sahaja. Tiada perubahan pangkalan data/cloud atau deploy dalam sesi kemasan ini. Amaran saiz chunk Vite sedia ada masih muncul.
- [x] Arahan susulan “push dan deploy”: commit UI `5ecb3b6` dipush ke `main`; AQR checks #38223466508 dan Pages #38223480585 berjaya. Laman sebenar HTTP 200, CSS baharu disahkan, log masuk desktop/telefon tanpa ralat, demo terbitan terkunci. Tiada ujian sesi berautentikasi, perubahan data atau migrasi. Catatan selepas deploy hanya mengubah dokumentasi.

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

## Log deploy terkini

- 17 Okt 2026: deploy b850a78 (laporan kotak skrol/carian, hanya sesi selesai, skrip reset janaan); skrip peribadi penilaian rawak tutor Ahmad Muzzammil disediakan (di luar repo).
- 17 Okt 2026: migrasi 42 `202610170042_supplementary_invoices.sql` — jana yuran sesi boleh diulang; sesi selepas invois dibayar masuk invois tambahan (`sessions:<bulan>:<penjaga>:2`), tiada sesi dibilkan dua kali. Diuji PGlite + Pages demo; dipasang pengguna di Supabase; deploy 2eb7c06.
- 17 Okt 2026: migrasi 43 `202610170043_reset_tutor_password.sql` — admin reset kata laluan tutor (kata laluan sementara ditaip admin; tutor wajib tukar). Diuji PGlite + Pages demo.
- 17 Okt 2026: migrasi 44 `202610170044_tutor_sees_upcoming.sql` — tutor nampak murid sebaik didaftar walaupun tarikh mula akan datang (RLS baca). Diuji PGlite.
