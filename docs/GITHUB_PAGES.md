# AQR pada GitHub Pages

Binaan utama menggunakan semula komponen, CSS, pengiraan, DTO eksport dan validasi mutasi aplikasi asal. Vite menyusun kod itu (entri dalam `portal/`) menjadi HTML/CSS/JavaScript di `dist-pages/`; tiada proses Node atau Next.js diperlukan pada GitHub Pages. Kod Next.js lama masih boleh dibina dan dijalankan, termasuk integrasi Google OAuth server yang belum dipindahkan ke Pages. Jangan namakan folder entri itu `pages/`: Next.js akan menganggapnya Pages Router dan `npm run build` gagal.

## Cuba secara setempat

```sh
npm ci
npm run build:pages
npm run preview:pages
```

Buka `http://127.0.0.1:4173/`. Tanpa konfigurasi, skrin log masuk terkunci dipaparkan. Data rekaan (`?demo=1`) hanya dibuka dalam `npm run dev:pages` atau binaan ujian dengan `VITE_ENABLE_DEMO=1`; binaan `dist-pages/` yang diterbitkan tidak mempunyai demo. Panduan pemasangan data sebenar untuk pemilik: [SETUP_SUPABASE.md](SETUP_SUPABASE.md). Navigasi menggunakan `#/parent`, `#/reports` dan sebagainya supaya muat semula pada subfolder repositori GitHub Pages tidak memerlukan rewrite server.

Untuk pembangunan interaktif gunakan `npm run dev:pages`. `npm run dev` masih menjalankan binaan Next.js legasi pada port 3000.

## Supabase

1. Sediakan projek staging peribadi. Terapkan semua fail dalam `supabase/migrations/` mengikut urutan (kini 17 migrasi; `npm run db:sql` menggabungkannya menjadi `supabase/setup-all.sql` untuk SQL Editor). Jangan reset pangkalan data atau memuatkan bahan sejarah/PDF contoh.
2. Bootstrap pemilik dengan skrip dipercayai mengikut README. Tiada pemilik, tutor atau kadar sebenar dijana daripada PDF. Pastikan pengguna Auth pemilik sudah diwujudkan mengikut keperluan skrip.
3. Konfigurasikan SMTP serta URL Auth: Site URL dan redirect allowlist mesti mengandungi URL tepat, contohnya `https://NAMA.github.io/REPO/`. Elakkan wildcard domain luas.
4. Benarkan pendaftaran Auth untuk pendaftaran tutor tanpa kata laluan. Pengesahan e-mel mesti diwajibkan. Jangan menggunakan metadata pengguna sebagai peranan. Akaun Auth baharu tidak mempunyai keahlian tutor sehingga permohonan diluluskan oleh owner/admin akademik. Had kadar Auth/SMTP perlu dikonfigurasi dalam Supabase.
5. Penjaga menggunakan akaun dijemput oleh owner. `claim_guardian_access()` hanya boleh memautkan rekod sedia ada berdasarkan e-mel Auth yang disahkan dan pautan anak berizin. Tutor tidak boleh menentukan pautan penjaga.
6. Set `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY` dalam `.env.local` di akar projek untuk binaan setempat. Bagi Actions, gunakan Repository Variables dengan nama sama. Dua nilai ini awam; keselamatan data bergantung pada Auth + RLS. **Jangan gunakan service-role key sebagai publishable key.**
7. Deploy `supabase/functions/aqr-admin` untuk jemputan, upload bukti oleh admin dan logo. Tetapkan `AQR_APP_URL` kepada URL Pages tepat. Supabase menyediakan `SUPABASE_URL`, `SUPABASE_ANON_KEY` dan `SUPABASE_SERVICE_ROLE_KEY` pada runtime fungsi. Service key kekal di Edge Function sahaja. Fungsi menyemak JWT pengguna, keahlian sebenar, origin, jenis/saiz/bait fail serta pemilikan rekod; ia tidak mempercayai org/peranan daripada browser.

```sh
supabase functions deploy aqr-admin
supabase secrets set AQR_APP_URL=https://NAMA.github.io/REPO/
```

Pilih kaedah JWT verification Edge Functions yang sepadan dengan kunci projek. Jika gateway Supabase memerlukan `--no-verify-jwt` untuk publishable key baharu, kekalkan semakan `db.auth.getUser()` dalam kod; jangan membuangnya. Uji dengan token tiada/palsu/tamat tempoh sebelum produksi.

## Sesi dan akses

Log masuk menggunakan pautan e-mel atau OTP yang diberi dalam e-mel Supabase. Kotak peranti dipercayai menggunakan localStorage untuk mengekalkan sesi dan refresh token; peranti berkongsi menggunakan sessionStorage. Log keluar memadam kedua-dua stor sesi. Aplikasi memeriksa pengguna/keahlian sebelum memuatkan data dan memeriksa semula apabila tab difokuskan. Jangan masukkan skrip pihak ketiga yang tidak dipercayai pada origin portal.

Penjaga boleh menukar anak, membaca kehadiran, ulasan Melayu, perkembangan, laporan bulanan diluluskan dan rekod bayaran. Tiada borang bayaran, upload atau checkout untuk penjaga. RLS dan RPC turut menghalang mutasi kewangan penjaga; ini bukan sekadar sekatan UI.

## Laporan dan WhatsApp

Admin akademik/owner membuka **Laporan → Sediakan draf bulanan**, menyemak setiap snapshot dan meluluskan laporan individu. Laporan diluluskan tidak boleh ditulis ganti. PDF draf mempunyai penanda draf; ZIP hanya mengandungi PDF diluluskan. PDF dijana dalam browser daripada snapshot yang dibaca melalui RLS, bukan daripada data yang diterima melalui URL awam.

Admin memuat turun PDF individu, menyalin mesej WhatsApp, melampirkan PDF secara manual dan menandakan status Disediakan/Dihantar/Diterima/Gagal. Butang menyediakan mesej tidak membuka chat atau menghantar apa-apa. Status disimpan berasingan bagi setiap laporan dan penjaga; ia bukan read receipt WhatsApp.

Nama fail ZIP/PDF menggunakan ID murid dan bulan untuk mengelakkan pertembungan nama. Fon PDF tempatan mempunyai lesen dalam `public/fonts/OFL.txt`. Fail laporan adalah sulit walaupun dijana pada peranti admin; jangan meletakkannya dalam folder yang akan diterbitkan oleh Pages.

## Terbit apabila persediaan selesai

Workflow `.github/workflows/pages.yml` dicetuskan secara manual melalui **workflow_dispatch**. Pilih GitHub Actions sebagai sumber Pages. Workflow menguji kod dan portal statik, kemudian hanya memuat naik `dist-pages/`; jangan memilih seluruh repo atau folder sumber sebagai artifact. Repo ujian: <https://github.com/muzzammilKIAS/aqr-portal> (awam, cabang `main`). URL Pages: <https://muzzammilkias.github.io/aqr-portal/>. Repo ini milik pembangun untuk fasa ujian; ia akan diserahkan kepada admin AQR melalui _Transfer ownership_, dan admin akan menggunakan projek Supabase baharu.

Workflow pemeriksaan biasa kekal dalam `.github/workflows/check.yml`. Binaan Pages boleh dimuat naik ke mana-mana static host yang menyajikan fail dengan MIME betul. Aset menggunakan laluan relatif supaya domain sendiri dan Pages subfolder disokong.

## Keserasian dan batas yang nyata

- Semua modul akademik/kewangan asas menggunakan komponen sedia ada; mutasi memakai validasi bersama dan RPC/RLS yang sama. XLSX/CSV dijana setempat daripada data berizin, tanpa `/api/export` pada Pages. Invois/resit boleh dimuat turun sebagai PDF setempat.
- Integrasi Google Sheets OAuth, token encryption dan retry legasi **masih kekal dalam binaan Next.js**, tetapi belum tersedia terus pada Pages. Gunakan XLSX pada Pages atau binaan server untuk integrasi Google. Tiada kejayaan sambungan palsu dipaparkan.
- Privileged upload/jemputan memerlukan Edge Function yang dideploy. Pendaftaran tutor, laporan bulanan dan penilaian menggunakan Supabase Auth/PostgREST/RPC terus.
- Query dipaginasi bagi mengatasi had 1,000 baris; indeks organisasi/bulan digunakan untuk laporan. ZIP menjana PDF berurutan. Ujian data besar eksport sedia ada merangkumi 10,000 baris, tetapi ujian beban serentak 50 tutor/400 murid pada Supabase sebenar belum dijalankan.
- Baki fungsi lama yang belum lengkap masih direkod dalam `docs/PROGRESS.md`. Ujian setempat tidak menggantikan pengesahan SMTP, OTP, refresh sesi, jemputan, Storage dan RLS melalui HTTP staging.

Rujukan teknikal: [GitHub Pages — static site hosting](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), [Supabase passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless), [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
