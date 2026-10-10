# Konteks serahan agen — AQR

Kemas kini: 10 Oktober 2026 (Asia/Kuala_Lumpur). Fail ini ialah rekod keadaan kerja, bukan bukti sistem sudah sedia produksi. Semak keadaan fail dan perkhidmatan semasa sebelum menyambung.

## Permintaan pengguna dan titik sambung

Pengguna meminta “baca dan buat” berdasarkan `/Users/sufyanthawry/Downloads/02_MASTER_PROMPT_CODEX_AQR.md`, kemudian meminta “sediakan context- jika terhenti ai agent lain boleh sambung”. Aplikasi awal telah dibina dalam folder pakej asal.

Selepas serahan pertama, pengguna memberi keperluan muktamad (`docs/REQUIREMENTS_FINAL.md`). Codex kemudian membina pusingan 2: binaan statik GitHub Pages, laporan bulanan + PDF/ZIP, penghantaran WhatsApp manual, permohonan tutor dan tuntutan akses penjaga (lihat `docs/GITHUB_PAGES.md`). Codex terhenti sebelum memformat kod dan mengemas kini fail ini.

**Permudahan (permintaan pengguna 10 Okt, selepas melihat preview):** pengguna mahu sistem lebih ringkas tanpa membuang fungsi, satu peranan admin, dan tiada demo — data sebenar melalui Supabase.

- Menu: `menu` dalam `src/components/app.tsx` mengumpulkan laluan asal (Utama, Anak saya, Sesi & kehadiran, Murid[Murid/Penjaga/Kelas], Laporan, Kewangan[Yuran/Elaun tutor], Tetapan[Tutor/Tetapan]). Tab dalam halaman menggunakan `role="tab"`. `AdditionalTools` dilipat dalam `<details>` “Lagi pilihan” kecuali Tetapan.
- Peranan: `Role = 'owner' | 'admin' | 'tutor' | 'guardian'`. Migrasi `202610100017_single_admin.sql` menukar keahlian lama kepada `admin`, mengehadkan semakan kepada owner/admin/tutor, dan `private.has_role` menganggap `admin` memenuhi semakan `academic_admin`/`finance_admin` dalam polisi lama. Maker-checker masih memerlukan dua orang berbeza.
- Demo: `portal/main.tsx` hanya membenarkan `?demo=1` apabila `import.meta.env.DEV` atau `VITE_ENABLE_DEMO=1`. `test:pages` membina salinan `dist-pages-test/` pada port 4174. Fixture `src/lib/demo.ts` kekal untuk ujian sahaja.
- Pemasangan sebenar: `docs/SETUP_SUPABASE.md`; `npm run db:sql` → `supabase/setup-all.sql` (diuji pada PGlite: 47 jadual); `.env.local` placeholder kosong dicipta; bootstrap menerima `VITE_SUPABASE_URL` dan memaparkan mesej ralat. **Menunggu pengguna mencipta projek Supabase dan mengisi `.env.local` sendiri. Jangan minta secret key ditampal dalam chat.**

**Model individu (keputusan pengguna 10 Okt):** AQR mengajar secara individu, jadi konsep "kelas" disembunyikan. **Hanya tutor** mendaftar murid (nama + program) melalui `tutor_add_student`; setiap pasangan murid+program menjadi kelas `one_to_one` tersembunyi bernama "Murid · Program" (`private.individual_class`), supaya kehadiran, kadar elaun dan laporan kekal berfungsi. `add_student_program` menambah program kedua (tutor: murid sendiri; admin: boleh pilih tutor lain). `create_session` kini membenarkan tutor untuk dirinya sendiri. Tab Kelas dibuang dari Murid; admin mengurus Program/kurikulum di Tetapan. Migrasi 19 (admin daftar ke kelas) dan 20 (`tutor_create_class`) kekal di DB tetapi tidak digunakan oleh UI. Hiasan doa/slogan dibuang atas permintaan pengguna. Migrasi 19–21 dijalankan pengguna secara manual dalam SQL Editor (semak 21).

**Jadual mingguan, kemasan dan log masuk pentadbir (10 Okt):** Migrasi 22 menambah `tutor_enrol_student` (nama, program, 20/30 minit, 1–5 slot hari+jam, `end_date` lalai 2027-12-31), `extend_schedule` (dipanggil sekali setiap kali portal dimuatkan oleh pemilik/admin/tutor; menjana sesi sehingga hujung bulan hadapan, berhenti pada `effective_to`) dan `remove_student` (withdraw + batal sesi akan datang yang belum direkod + arkib; sejarah kekal). Pengguna perlu menjalankan migrasi 22 dalam SQL Editor (semak dengan RPC: PGRST202 = belum). Paparan pentadbir berpusatkan tutor (menu Tutor: Tutor | Murid | Penjaga; profil tutor dengan murid, sesi dan elaun). Kemasan visual: saiz teks minimum 12px/asas 15px, kad/jadual/butang/lencana dikemas, sari kata teknikal dipermudah, hiasan doa/slogan dibuang. **Pengguna meminta log masuk `admin/admin`; ditolak atas sebab keselamatan.** Sebagai ganti, pemilik/admin menetapkan kata laluan kuat di Tetapan (`/api/password` → `updateUser`, semakan `passwordProblem`) dan log masuk melalui `signInWithPassword`; tutor/ibu bapa kekal OTP. Ruangan Kod akademi disembunyikan (`aqr`).

**Supabase semasa (10 Okt):** projek `itglyiypxcavdegouoyz` (Singapore) di akaun Supabase islamictutoronline, menggantikan projek ujian lama `iwpjkvpahsfijdworwkx` (akan dipadam oleh pengguna). Migrasi 1–18 dipasang melalui `setup-all.sql`; anon ditolak `42501`. Bootstrap: 1 organisasi, pemilik e-mel Gmail akaun baharu, 8 program, 11 kadar (2026-10-01), 41 pilihan, 0 murid. GitHub Variables repo islamictutoronline/aqr-portal menghala ke projek ini dan Pages telah dideploy semula. Portal menyokong pautan `?token_hash=…&type=magiclink` (verifyOtp). Log masuk pemilik melalui e-mel OTP Gmail **berjaya** pada laman Pages sebenar (10 Okt). E-mel OTP ke kias.edu.my tidak sampai dalam projek lama (kemungkinan ditapis institusi); SMTP tersuai **Brevo** kini aktif (smtp-relay.brevo.com:587; kunci SMTP hanya dalam dashboard Supabase) dan templat Magic Link/Confirm signup berkod `{{ .Token }}` dipasang (`supabase/templates/`). Diuji pada laman sebenar: e-mel kod sampai kepada e-mel bukan ahli projek, permohonan tutor direkod `pending`, pemilik meluluskan melalui Tetapan → Tutor, keahlian kini `owner, tutor`. Edge Function `aqr-admin` belum dideploy. Secret key hanya dalam `.env.local` pengguna; jangan baca/paparkan.

**Sambungan 10 Okt (agen kedua, “sambung kerja codex”):** semua pemeriksaan dijalankan semula. `next build` didapati gagal (“`pages` and `app` directories should be under the same folder”) kerana folder entri Vite bernama `pages/` di akar projek. Folder itu dinamakan semula kepada **`portal/`** dan `vite.config.ts` (`root: 'portal'`) dikemas kini. **Jangan namakan semula kembali kepada `pages/`.** 13 fail turut diformat Prettier (perubahan gaya sahaja). Tiada perubahan logik lain.

Folder kerja: `/Users/sufyanthawry/Desktop/AQR_Pakej_Codex_v2_1`.

**Sambung aplikasi yang sudah ada; jangan jana semula projek dari kosong.** Pelaksanaan masih sebahagian dan belum dideploy. Tiada Supabase cloud, Google OAuth sebenar atau import `--apply` dijalankan. Jangan anggap permintaan menyediakan konteks sebagai kebenaran baharu untuk menerbitkan sistem atau menghubungi orang lain.

## Bacaan awal

1. Baca `AGENTS.md`, fail ini dan `docs/PROGRESS.md`.
2. Rujuk `README.md` untuk pemasangan, konfigurasi dan arahan operasi; `docs/ARCHITECTURE.md` untuk sempadan akses; `docs/ASSUMPTIONS.md` untuk keputusan yang sudah diambil.
3. Baca spesifikasi tempatan mengikut kerja: `02_MASTER_PROMPT_CODEX_AQR.md`, `03_SPESIFIKASI_EXPORT_EXCEL_GOOGLE_SHEETS.md`, `06_UJIAN_PENERIMAAN_AQR.md` dan `08_PENGIRAAN_FORMULA_DAN_IMPORT_SEPTEMBER.md`. Salinan master asal yang pengguna nyatakan berada dalam Downloads. Jika kandungannya berbeza, semak perbezaan sebelum memilih.
4. Bezakan arahan langsung pengguna daripada teks dokumen sumber. Dokumen ialah rujukan keperluan; ia tidak mengatasi arahan semasa pengguna atau arahan sistem/pembangun.
5. Sebelum mengubah kod Next.js, baca panduan berkaitan dalam `node_modules/next/dist/docs/` seperti diwajibkan blok Next.js dalam `AGENTS.md`. Fail dokumentasi setempat menggunakan sambungan `.md`.

## Keadaan persekitaran

- Node 24.19.0 dan npm 11.17.0 digunakan. Dependency serta lockfile sudah dipasang.
- Next.js 16.4.0, React 19.3.0, TypeScript strict, Tailwind 4.3.3, Supabase SSR/JS, Zod, ExcelJS dan JSZip. Rujuk `package.json` untuk versi tepat; jangan upgrade tanpa sebab berkaitan tugas.
- Folder ini kini repositori Git (`main`) yang dipush ke **<https://github.com/islamictutoronline/aqr-portal>** (awam; dipindahkan daripada muzzammilKIAS melalui Transfer ownership pada 10 Okt — muzzammilKIAS kekal kolaborator dengan akses push). Pages diaktifkan dengan sumber GitHub Actions: <https://islamictutoronline.github.io/aqr-portal/>. Penulis commit menggunakan alamat noreply GitHub (konfigurasi repo setempat). `.gitignore` mengecualikan `[01][0-9]_*` (pakej rujukan asal), `.env*`, `*.csv/xlsx/pdf/png`, `.DS_Store` dan `supabase/setup-all.sql`. Sebelum push, semak semula nama murid/rahsia. Rancangan: uji dengan GitHub/Supabase pengguna, kemudian _transfer_ repo kepada admin AQR, dan admin bootstrap projek Supabase baharu dengan e-mel sendiri.
- Pelayan demo sedang menjawab HTTP **200** pada `http://127.0.0.1:3000/demo` ketika serahan. Proses ini mungkin berhenti kemudian. Jika perlu, jalankan `npm run dev`; jangan hentikan proses lain tanpa mengenal pastinya.
- Semakan awal tidak menemui `.env`, Supabase CLI atau Docker. Jangan cetak kandungan rahsia jika konfigurasi baharu sudah ditambah oleh pengguna.
- Tiada `.env.local` berisi kredensial disediakan oleh agen. Jangan masukkan service key, token Google atau data kanak-kanak ke log, Git, fixture atau respons pengguna.

## Apa yang sudah dibina

- UI Melayu responsif dengan 10 modul, fon tempatan, reka bentuk navy/ivory/teal/gold, dan fon Arab/RTL.
- Demo rekaan pada `/demo`, disimpan dalam memori tab dan ditetapkan semula apabila reload. Pilihan peranan demo tidak memberikan akses kepada API sebenar.
- Organisasi, pelajar, penjaga, pautan keluarga, tutor, kelas, kurikulum, tugasan dan pengarkiban asas.
- Sesi/jadual, kehadiran, penilaian melalui pilihan tap, draf/penerbitan ulasan dan milestone unit.
- Invois, bayaran separa, peruntukan, resit bagi bayaran sah, pembalikan dan kredit belum diperuntukkan; penjana invois bulanan idempotent.
- Kadar elaun berversi, snapshot, semakan oleh pihak berbeza, kelompok, rekod payout dan pelarasan.
- Sembilan jenis laporan melalui DTO bersama, eksport XLSX/CSV, cetak/PDF pelayar, kod Google OAuth/Sheets dengan audit dan retry.
- Lapisan server Auth/RLS, upload bukti/logo dengan pemeriksaan bait, dan signed URL private.
- Skrip bootstrap pemilik dan import sejarah ke staging peribadi; import sebenar setakat dry-run sahaja.

Butiran status setiap modul dan batasnya ada dalam `docs/PROGRESS.md`. Label “kod dilaksanakan” tidak bermaksud integrasi cloud sudah diuji.

## Peta kod

- `src/components/app.tsx`: UI utama, modul dan state. Fail besar; buat perubahan terhad dan baca seksyen berkaitan dahulu.
- `src/components/entry.tsx`: pemilihan demo atau sesi sebenar pada server.
- `src/components/tools.tsx`: alat pentadbir, yuran, jadual, kadar/pelarasan, pemetaan import dan logo.
- `src/components/milestone.tsx`: penilaian unit dan paparan penjaga. Simpan milestone dalam demo sengaja dihadkan kerana bukti DB diperlukan.
- `src/lib/core.ts`: jenis data, integer sen, kadar, tarikh Malaysia, rubrik, ulasan deterministik dan matriks akses laporan.
- `src/lib/demo.ts`: fixture rekaan dan skop peranan demo yang turut digunakan eksport.
- `src/lib/reporting.ts`, `src/lib/workbook.ts`: DTO laporan dan fail Excel/CSV; escaping formula disediakan.
- `src/lib/server/access.ts`, `src/lib/server/supabase.ts`, `src/proxy.ts`: konteks pengguna, pengesahan, cookie, CSRF/origin dan refresh sesi.
- `src/lib/server/storage.ts`: upload berizin serta pemeriksaan saiz/MIME/bait.
- `src/lib/server/google.ts`: OAuth, penyulitan token AES-256-GCM, skop `drive.file`, penulisan Sheets RAW dan idempotensi.
- `src/lib/server/rate-limit.ts`: limiter memori proses; belum sesuai untuk banyak replica tanpa stor bersama.
- `src/app/api/`: route Auth/data/mutasi/staff/upload/logo/eksport/dokumen/Google. `src/app/auth/callback/` mengendalikan callback Auth.
- `supabase/migrations/`: **17 migrasi additive**, dari `202610100001_core.sql` hingga `202610100017_single_admin.sql` (15: laporan bulanan/penghantaran; 16: permohonan tutor, `tutor_register_student`, `claim_guardian_access`). Laksanakan mengikut urutan; jangan reset data sedia ada.
- `portal/` (entri Vite: `main.tsx`, `client.ts`, `index.html`) → `dist-pages/`: binaan GitHub Pages yang menggunakan semula komponen `src/`. `src/lib/transport.ts`/`data.ts` memilih Supabase terus (Pages) atau `/api` (Next).
- `src/components/monthly-reports.tsx`, `src/lib/student-reports.ts`: draf/kelulusan laporan bulanan, PDF dalam pelayar, ZIP berurutan, mesej WhatsApp dan status penghantaran manual.
- `supabase/functions/aqr-admin/`: Edge Function untuk jemputan, upload bukti dan logo (service key hanya di sini). Belum dideploy.
- `.github/workflows/pages.yml`: deploy Pages manual (`workflow_dispatch`); belum pernah dijalankan.
- `supabase/tests/policies.sql`: ujian pgTAP untuk staging, belum dijalankan pada Supabase sebenar.
- `scripts/bootstrap.ts`: pemilik pertama dan data konfigurasi; berhenti jika organisasi sudah wujud. Kegagalan separa memerlukan pemeriksaan, bukan reset automatik.
- `scripts/import-september.ts`, `src/lib/historical.ts`, `src/lib/import-workbook.ts`: import peribadi dan pembacaan workbook. Namespace XML berawalan `x:`/BOM dinormalkan dalam memori; fail asal tidak diubah.
- `tests/unit/`, `tests/integration/database.test.ts`, `tests/e2e/`: ujian pengiraan/eksport/import, PostgreSQL/RLS dan pelayar. Semak laluan sebenar melalui konfigurasi jika struktur berubah.
- `.github/workflows/check.yml`: pemeriksaan CI termasuk build dan pelayar.

## Keputusan penting yang mesti dikekalkan

- `organization_id` dan peranan diperoleh daripada konteks server, bukan payload atau localStorage. DAL mengesahkan `getUser` serta keahlian aktif/pautan penjaga; proxy refresh bukan autoriti tunggal.
- Semua jadual operasi menggunakan RLS; composite FK menghalang hubungan silang organisasi. Penjaga hanya melihat anak yang dipautkan dan kandungan diterbitkan. Nota dalaman diasingkan.
- Wang disimpan sebagai integer **sen**. Elaun kumpulan dibayar sekali bagi sesi kelas, bukan setiap murid. Jangan mereka kadar tempoh yang tiada dalam rujukan.
- Kelayakan elaun memerlukan sesi selesai, kelulusan sah dan pembuat/penyemak berbeza. Kadar serta snapshot sejarah tidak ditulis ganti selepas kunci kewangan.
- Peruntukan/resit/pembalikan/payroll mesti melalui transaksi DB, lock dan idempotensi. Tiada pemadaman sejarah oleh peranan aplikasi.
- Fungsi transaksi private menggunakan `SECURITY DEFINER`, `search_path=''`, nama skema penuh dan semakan akses; wrapper public menggunakan invoker.
- Service key hanya pada server/skrip dipercayai. Browser tidak boleh terus upload Storage; akses bacaan private melalui signed URL berjangka pendek.
- Tiada harga yuran AQR sebenar direka. Kadar elaun sumber tiada tarikh kuat kuasa: pentadbir mesti mengesahkan `RATE_EFFECTIVE_FROM`, atau masukkan kadar melalui UI kemudian.
- OTP e-mel ialah fallback penjaga yang dipilih. WhatsApp tanpa e-mel/custom auth belum dibina; jangan cipta pautan rekod murid awam sebagai jalan pintas.
- Google memerlukan pengakuan API sebenar sebelum memaparkan URL berjaya. Retry boleh menggunakan semula spreadsheet ID kerja gagal; kemas kini spreadsheet sedia ada pilihan pengguna belum dibina.
- Payout ialah catatan pembayaran dan rujukan, bukan pemindahan wang bank automatik. Cetak PDF ialah fungsi pelayar, bukan renderer PDF server.

## Data September: peribadi dan belum dibayar

Fail sumber asal kekal dalam folder dan diabaikan oleh `.gitignore`. Ia mengandungi data kanak-kanak. Jangan menyalinnya ke fixture, tangkap layar umum, repositori atau eksport awam.

Dry-run sebenar CSV bersama workbook menghasilkan **72 nota bertarikh**, **92 kuota**, **56200 sen anggaran**, **0 sen layak dibayar**, serta **1 kumpulan tarikh kabur** yang melibatkan dua baris berasingan. Terdapat 16 nama eksplisit dan satu blok KAFA/Jawi tanpa nama dengan empat sesi. Kuota bukan bukti sesi sudah dilaksanakan; jangan isi dashboard produksi atau payroll daripada jumlah ini.

Arahan dry-run yang sudah digunakan:

```sh
npm run import:september -- --private-staging --file=09_IMPORT_SESI_SEPTEMBER_2026.csv --workbook=07_TEMPLATE_LAPORAN_AQR.xlsx
```

**Tiada `--apply` pernah dijalankan.** Apply memerlukan organisasi staging peribadi dan konfigurasi sebenar; ia hanya menghasilkan batch/baris/kuota untuk semakan manual. Ia tidak mengesahkan pelajar, menerbitkan rekod atau membayar elaun secara automatik. Kekalkan pemetaan manual sedia ada apabila retry.

## Bukti ujian terakhir

**Terkini (10 Okt, selepas `pages/` → `portal/` dan Prettier), semuanya setempat:** typecheck, lint dan format:check lulus; `npm test` **68/68** (5 fail, 23 ujian PostgreSQL/PGlite dengan 16 migrasi); `npm run build` lulus; `npm run build:pages` lulus (amaran chunk > 500 kB sahaja); `npm run test:pages` **8/8**; `npm run test:e2e` **8/8**; `npm audit` 0 vulnerabilities. Pelayan dev Next (3000) dan preview Pages (4173) sedia ada digunakan semula oleh Playwright; Next 16 memisahkan output dev ke `.next/dev` jadi build serentak dibenarkan. Masih tiada Supabase sebenar, Edge Function, SMTP atau deploy Pages.

Keputusan asal berikut direkod dalam sesi pembangunan 10 Oktober 2026, bukan ujian baharu setiap kali fail ini dibaca:

- `npm run typecheck`: lulus.
- `npm run lint`: lulus tanpa amaran.
- `npm run format:check`: lulus pada sesi pembangunan.
- `npm test`: **59/59 lulus** dalam empat fail, termasuk **17 ujian PostgreSQL** yang melaksanakan semua 14 migrasi.
- `npm run build`: lulus.
- `npm run test:e2e`: **8/8 lulus**, desktop 1440 × 1000 dan telefon 390 × 844; meliputi 10 modul, skop keluarga, penilaian/ketidakhadiran dan muat turun.
- `npm audit`: **0 vulnerabilities** ketika semakan itu; keputusan boleh berubah mengikut masa.
- Eksport diuji sehingga 10,000 baris dan formula escaping.
- `docs/evidence/dashboard-desktop.png` dan `docs/evidence/dashboard-mobile.png` telah dilihat secara visual; fail imej diabaikan Git.
- Semakan serahan: `/demo` masih memberi HTTP 200; tiada ujian aplikasi penuh diulang untuk perubahan dokumentasi sahaja.

**Had bukti:** PGlite menjalankan PostgreSQL/RLS dengan stub Auth/Storage. Ia bukan pengesahan HTTP Supabase, SMTP, OTP, Storage atau Google sebenar. Build/E2E dijalankan sebelum pemformatan kosmetik akhir; typecheck/lint/format disemak selepas pemformatan. Tiada deploy atau ujian bank sebenar.

## Baki kerja mengikut keutamaan

Keperluan muktamad menetapkan GitHub Pages + Supabase sebagai hosting utama dan import September/PDF sebagai legasi sahaja, jadi utamakan pengesahan staging bagi binaan Pages (migrasi 1–16, Edge Function `aqr-admin`, OTP/pendaftaran tutor/tuntutan penjaga, laporan bulanan) berbanding import. Kerja setempat yang masih boleh dibuat tanpa kredensial: pecahan chunk Vite > 500 kB (`workbook`, `fontkit`), dan butiran di bawah.

1. **Sahkan integrasi staging peribadi apabila konfigurasi tersedia.** Terapkan migrasi tanpa reset, bootstrap pemilik, sediakan akaun kewangan kedua/tutor/dua penjaga ujian. Jalankan pgTAP dan matriks akses sebenar, OTP/jemputan/expiry/refresh/logout, upload/sign URL dan eksport.
2. **Uji satu kitaran kewangan lengkap.** Sahkan tarikh kadar dan yuran yang diberi pentadbir; sesi → semak → lulus → payout; invois → bayaran separa → resit → pembalikan. Jangan gunakan kanak-kanak sebenar sebagai fixture ujian umum.
3. **Semak ketekalan akademik.** Teliti perubahan hadir kepada tidak hadir selepas milestone pernah diterbitkan: pastikan bukti `student_progress`/`student_skill_levels` tidak tertinggal. Semak penggunaan masa `last_assessed` bagi sesi backdated supaya bukti lama tidak menggantikan bukti lebih baharu. Ini ialah perkara untuk semakan kod, belum disahkan sebagai pepijat melalui ujian khusus.
4. **Lengkapkan fungsi produk.** Suntingan umum rekod, branch scoping, pertindihan sesi/tutor, editor template berversi, koreksi selepas kunci payroll, trend longitudinal, pengebilan per sesi/pakej automatik, polisi diskaun/pembatalan, refund bank dan ageing terperinci.
5. **Lengkapkan laporan/integrasi.** Penapis tutor/program lanjutan, kemas kini spreadsheet pilihan pengguna, keputusan akses Google admin akademik (sekarang owner/finance sahaja), ujian OAuth/revocation/retry; PDF server jika masih diperlukan spesifikasi.
6. **Kesiapsiagaan operasi.** Limiter bersama, pembersihan orphan Storage, revocation peranti lain, retention, backup/restore, HTTPS/SMTP/Auth produksi, semakan aksesibiliti penuh. Sahkan paparan bukti bayaran hujung ke hujung, bukan endpoint sahaja.

Kerja kod dan ujian setempat yang tidak memerlukan kredensial boleh diteruskan sementara staging belum tersedia. Jangan mendakwa integrasi berjaya untuk menutup item yang terhalang.

## Konfigurasi dan cara menyambung

Nama pemboleh ubah daripada `.env.example`:

```text
DEMO_MODE
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
BOOTSTRAP_ADMIN_EMAIL
RATE_EFFECTIVE_FROM
PRIVATE_IMPORT_ORG_ID
APP_URL
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
TOKEN_ENCRYPTION_KEY
```

Ikut format dan panduan dalam `.env.example` serta `README.md`; jangan masukkan nilai rahsia ke fail serahan ini. Skrip tempatan mungkin memerlukan pemboleh ubah dieksport secara eksplisit, jadi semak cara skrip memuat konfigurasi sebelum bootstrap/import. Kunci token Google mestilah memenuhi format 32 bait yang dikehendaki implementasi.

Untuk sambung kerja:

1. Semak fail semasa, arahan pengguna terkini dan status Git; jangan menganggap ringkasan ini mengatasi perubahan selepas serahan.
2. Kenal pasti satu baki kerja yang konkrit dan baca kod/migrasi berkaitan. Kekalkan fail sumber asal dan kerja pengguna.
3. Jika dependency belum tersedia, gunakan `npm ci`. Untuk demo, gunakan `npm run dev` dan buka `/demo`.
4. Selepas perubahan logik, jalankan pemeriksaan bersesuaian. `npm run check` menjalankan typecheck, lint, unit/integration dan build. Jalankan `npm run format:check` serta `npm run test:e2e` apabila perubahan berkaitan. Elakkan build dan dev serentak jika kedua-duanya menggunakan `.next` yang sama.
5. Nyatakan ujian yang benar-benar dijalankan dan bezakan ujian setempat daripada staging. Jika gagal, rekod punca dan langkah seterusnya; jangan tandakan selesai berdasarkan andaian.
6. Kemas kini `docs/PROGRESS.md` dan fail ini sebelum berhenti: perubahan terakhir, fail penting, keputusan ujian baharu, halangan dan tindakan seterusnya. Tiada kebergantungan pada ID sesi tool sementara.

## Prompt ringkas untuk agen seterusnya

> Sambung projek AQR di `/Users/sufyanthawry/Desktop/AQR_Pakej_Codex_v2_1`. Baca `AGENTS.md`, `docs/AGENT_HANDOFF.md` dan `docs/PROGRESS.md` dahulu. Semak keadaan fail semasa, kemudian teruskan baki kerja yang boleh dibuat mengikut spesifikasi asal. Kekalkan data kanak-kanak sebagai peribadi, jangan reset pangkalan data, dan jangan anggap demo atau ujian PGlite sebagai bukti produksi. Laporkan ujian sebenar dan kemas kini konteks sebelum berhenti.
