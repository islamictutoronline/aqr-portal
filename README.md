# AQR Tutor & Learning Management System

Aplikasi Next.js untuk **Akademi Al-Quran Ar-Riyadh (AQR)**. Antaramuka Bahasa Melayu, MYR dalam integer sen, masa Asia/Kuala_Lumpur dan paparan Arab RTL. Kod aplikasi, migrasi, pengiraan, eksport dan ujian berada dalam folder ini. Bahan rujukan asal dikekalkan secara peribadi.

## Buka demo

```sh
npm ci
npm run dev
```

Buka **http://localhost:3000/demo**. Pilih peranan pada penjuru kanan untuk melihat ruang pemilik, akademik, kewangan, tutor atau keluarga. Demo menggunakan 12 murid dan 5 keluarga rekaan, 6 kelas, 3 tutor, sesi, draf/penerbitan dan transaksi contoh. Perubahan demo berada dalam memori tab; muat semula menetapkannya semula. Tiada e-mel atau bayaran dihantar melalui demo. Angka yuran demo ialah contoh pengiraan, bukan harga AQR.

Aliran boleh dicuba: Jadual & sesi → buka sesi yang belum disahkan → pilih murid → kehadiran → kemahiran → penguasaan → penglibatan → fokus → simpan draf atau terbit. Tiada penilaian dipilih awal dan tiada ulasan perlu ditaip. Portal ibu bapa menunjukkan ulasan diterbitkan sahaja.

## Sambung Supabase sebenar

1. Cipta projek **staging peribadi**. Jalankan semua fail SQL dalam `supabase/migrations/` mengikut susunan nombor, menggunakan Supabase CLI `supabase db push` atau SQL Editor. Migrasi pertama untuk pangkalan data baharu; tiada kod asal e-Tutor ditemui. Jangan jalankan tanpa menyemak nama jadual jika menggunakan pangkalan data sedia ada.
2. Salin `.env.example` kepada `.env.local`. Isi URL, publishable key, service role key server dan `APP_URL`. Tetapkan `DEMO_MODE=false`. Jangan kongsi atau commit fail env.
3. Di Supabase Auth: matikan pendaftaran awam, konfigurasikan SMTP serta Site URL dan redirect `APP_URL/auth/callback`. Gunakan templat e-mel pengesahan server dengan `token_hash` dan `type=email` atau `type=invite` apabila perlu. Kekalkan polisi tamat tempoh/refresh sesi yang sesuai.
4. Isi `BOOTSTRAP_ADMIN_EMAIL` dan jalankan `npm run bootstrap`. Skrip mencipta pemilik tanpa kata laluan lalai, subjek, program dan pilihan penilaian. Ia menolak organisasi yang sudah wujud dan tidak menimpa rekod. Jika gagal separa, semak rekod di Supabase dahulu.
5. CSV kadar sumber tiada tarikh efektif. `RATE_EFFECTIVE_FROM` hanya diisi selepas tarikh disahkan oleh admin. Jika kosong, kadar tidak dimuatkan oleh bootstrap; tetapkan versi melalui Elaun tutor. Tiada kadar yuran penjaga dibekalkan atau dihasilkan automatik.
6. Log masuk menggunakan OTP e-mel. Pemilik menjemput tutor dan admin melalui skrin Tutor. Cipta penjaga, pautkan anak, kemudian jemput OTP melalui skrin Penjaga. Sediakan **dua pegawai berlainan** untuk semakan dan kelulusan elaun/kelompok/pelarasan.
7. Cipta kelas, tugaskan tutor dengan tarikh, daftarkan murid, tetapkan jadual dan jana sesi. Pelan yuran bulanan perlu ditetapkan kepada pendaftaran dan tepat satu penjaga bil sebelum penjana invois digunakan.

Ujian PostgreSQL terbenam menguji RLS/transaksi sebenar, dengan skema Auth/Storage pengganti. Ia tidak membuktikan SMTP, Storage API atau Supabase cloud telah dikonfigurasi. Semak aliran tersebut di staging sebelum penggunaan sebenar.

## Google Sheets

Aktifkan Google Sheets API dan OAuth Web Application. Isi `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, dan `TOKEN_ENCRYPTION_KEY` (32 bait raw, base64). URI redirect: `APP_URL/api/google/callback`. Tetapan → Hubungkan akaun Google → persetujuan pengguna.

Sistem meminta `drive.file`, menggunakan state + PKCE, cookie HttpOnly dan penyulitan AES-256-GCM untuk token server. Spreadsheet dicipta melalui API dan ditulis dengan `RAW`; tiada perkongsian awam dibuat. Fail/data yang sama menggunakan reservasi eksport agar retry tidak mencipta salinan baharu. URL kejayaan hanya direkod selepas pengakuan API. Kegagalan penulisan boleh dicuba semula pada ID spreadsheet yang telah dicipta. Tiada akaun/kredensial Google dibekalkan atau diuji secara langsung dalam sesi ini.

XLSX dan CSV berfungsi tanpa Google. Eksport menyediakan metadata, tab data dengan header/freeze/filter dan ringkasan MYR. Nilai teks yang bermula dengan formula di-escape. PDF menggunakan fungsi **Cetak / Simpan PDF** pelayar; penjana PDF berasingan belum tersedia.

## Import September secara peribadi

Pratonton tanpa menulis pangkalan data:

```sh
npm run import:september -- --private-staging --file=09_IMPORT_SESI_SEPTEMBER_2026.csv --workbook=07_TEMPLATE_LAPORAN_AQR.xlsx
```

Pratonton fail asal telah disemak: **72 catatan, 92 kuota, 56200 sen anggaran, 0 sen layak**, satu kumpulan tarikh kabur. 16 nama dikenal pasti dan blok 4 sesi tanpa nama dikekalkan dalam bahan sumber; import menyimpan blok tanpa mereka nama. Dua catatan tarikh sama tidak digabungkan. Workbook sumber menggunakan namespace XML berawalan; pengimport menormalkannya **dalam memori**, tanpa mengubah fail asal.

Untuk import sebenar, isi `PRIVATE_IMPORT_ORG_ID` bagi staging peribadi, sahkan sasaran sendiri, kemudian tambah `--apply`. Skrip menyimpan batch, kuota dan setiap catatan sebagai `needs_review` dengan checksum/baris sumber. Retry tidak menimpa pemetaan pengguna. Ia **tidak** mencipta murid sebenar, menerbitkan komen, mengesahkan sesi atau meluluskan elaun. Admin memetakan murid/tarikh kepada rekod sah pada skrin Laporan. Simpan fail sumber di lokasi peribadi; `.gitignore` mengecualikan bahan asal yang mungkin mengandungi nama kanak-kanak.

## Semakan

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm audit
```

`npm test` menjalankan ujian pengiraan/rubrik/Excel serta PostgreSQL PGlite tanpa Docker. `npm run test:e2e` menguji desktop dan telefon. Ujian pgTAP tambahan disediakan dalam `supabase/tests/policies.sql` untuk staging melalui `supabase test db`. Keputusan terkini, skop sebenar dan baki kerja: [docs/PROGRESS.md](docs/PROGRESS.md).

## Status ringkas

| Status                            | Skop                                                                                                                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dilaksanakan dan diuji setempat   | Aplikasi responsif, demo rekaan, pengiraan sen/kadar, rubrik tap, draf/penerbitan, RLS keluarga/tutor/organisasi, invois/bayaran/peruntukan/pembalikan, maker-checker elaun, XLSX/CSV dan import dry-run    |
| Dilaksanakan, perlu ujian staging | OTP/jemputan, sesi cookie, pengurusan rekod, penjana jadual/invois, bukti/ logo private Storage, Google OAuth/API, pembayaran/pelarasan dan pemetaan import                                                 |
| Sebahagian                        | Pengurusan rekod mengutamakan cipta/paut/arkib; suntingan umum, pengiraan invois per sesi/pakej, laporan umur tunggakan, trend bulanan dan pembetulan penilaian selepas kunci payroll masih perlu diperluas |
| Belum dilaksanakan                | Jemputan WhatsApp tanpa e-mel, pemansuhan sesi peranti lain melalui UI, polisi retention automatik, PDF server yang dimuat turun terus, update spreadsheet pilihan pengguna dan deployment produksi         |

WhatsApp tanpa e-mel sengaja menggunakan fallback OTP sahaja: tiada halaman murid awam atau sesi tersuai yang berpura-pura selamat. Jangan gunakan sebagai sistem produksi sebelum ujian staging dan penyelesaian baki keperluan berkaitan operasi pusat.

Rujukan rasmi pelaksanaan: [Next.js authentication](https://nextjs.org/docs/app/guides/authentication), [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/nextjs), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access](https://supabase.com/docs/guides/storage/security/access-control), [Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Sheets create](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/create), [RAW values](https://developers.google.com/workspace/sheets/api/reference/rest/v4/ValueInputOption).
