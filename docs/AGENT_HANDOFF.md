# Konteks serahan agen — AQR

Kemas kini: 15 Oktober 2026 (Asia/Kuala_Lumpur). Fail ini ialah rekod keadaan kerja, bukan bukti sistem sudah sedia produksi. Semak keadaan fail dan perkhidmatan semasa sebelum menyambung.

## Julat muka surat + import Oktober tutor Ahmad Muzzammil — 17 Oktober 2026

**Push dan deploy:** commit `8c16c64`; [AQR checks #39030187815](https://github.com/islamictutoronline/aqr-portal/actions/runs/39030187815) dan [AQR GitHub Pages #39030187868](https://github.com/islamictutoronline/aqr-portal/actions/runs/39030187868) **success**; laman sebenar HTTP 200, aset `index-C5tb3aCD.js` mengandungi medan julat muka surat.

Arahan pengguna: masukkan jadual kehadiran/bacaan Oktober tutor AHMAD MUZZAMMIL (12 murid; TRUE = hadir; bacaan Tahsin sebagai julat muka surat, contoh 531-535) dan "buatkan kolum mukasurat boleh diisi macam 100-102".

- **Julat muka surat:** `readingSchema.page_to`, `parsePages()` / `formatPages()` dalam `src/lib/quran.ts`; medan Muka surat kini teks (`100` atau `100-102`, ralat format dipaparkan); label/PDF/Rekod bacaan memaparkan "531–535". **Migrasi 41** `202610170041_page_range.sql`: `reading_label` mengesahkan `page_to` dan melabel julat.
- **Import data:** skrip `~/Desktop/AQR-data-peribadi/import-oktober-2026-ahmad-muzzammil.sql` (FAIL PERIBADI, di luar repo — mengandungi nama murid; jangan commit). Bahagian A semak padanan nama (mesti 1 setiap nama, terhad kepada murid tutor itu); Bahagian B bertindak sebagai tutor (`request.jwt.claim.sub`), guna sesi sedia ada pada tarikh itu atau `create_session` pada jam jadual, kemudian `record_assessment` (hadir, `not_assessed`, bacaan + kind ikut program). Keputusan pengguna: rekod sedia ada dikekalkan; bacaan yang ditulis pada baris sehari lewat dialih ke hari hadir (tiga murid); 'IQ: 25' = Iqra' 5 ms 25. Diuji pada PGlite dengan nama rekaan: 30 kehadiran, rekod sedia ada kekal, ulang tanpa pendua.
- Bukti: `npm test` 128/128, `test:pages` 72/72, Next build, E2E 8/8, `setup-all.sql` 41 migrasi. **Migrasi 41 dipasang pengguna** (17 Okt, "Success"). **Belum:** import data belum dijalankan.

## Bacaan al-Quran: surah + muka surat wajib — 15 Oktober 2026 (dideploy)

**Push dan deploy:** commit `279651c`; [AQR checks #38746066036](https://github.com/islamictutoronline/aqr-portal/actions/runs/38746066036) dan [AQR GitHub Pages #38746070030](https://github.com/islamictutoronline/aqr-portal/actions/runs/38746070030) **success**; laman sebenar HTTP 200, aset `index-CZY6z6sk.js` mengandungi semakan surah/muka surat dan Juzuk auto.

Arahan pengguna: "ayat, juzu optional sahaja; yang penting muka surat dan surah". Bagi program bacaan al-Quran (`kind === 'quran'`), editor sesi kini mewajibkan **Surah** dan **Muka surat** (tanda `*`; `readingRequired` → "Isi surah dan muka surat dahulu", butang Simpan tidak aktif) apabila murid hadir; **Ayat dari/hingga** dan **Juzuk** bertanda "pilihan". Juzuk kini boleh diisi (`readingSchema.juz` 1–30, disimpan dalam `attendance.reading`); jika kosong, placeholder dan jadual Rekod bacaan menggunakan `juzOf(page)`. Iqra' tidak berubah. Tiada migrasi (pangkalan data menerima kunci `juz` tambahan; `reading_label` tidak berubah). Ujian Pages bacaan dikemas kini; 72/72, `npm test` 124/124, Next build, E2E 8/8.

## Pembetulan rekod kelas + rekod bacaan gaya Tahfiz — 15 Oktober 2026 (dideploy)

**Push dan deploy (15 Okt):** commit `7be11e8` dipush ke `main`; [AQR checks #38741932570](https://github.com/islamictutoronline/aqr-portal/actions/runs/38741932570) dan [AQR GitHub Pages #38741943641](https://github.com/islamictutoronline/aqr-portal/actions/runs/38741943641) **success**. Laman sebenar HTTP 200; aset `index-BakUtwBZ.js` mengandungi "Tajuk / topik pembelajaran", "Sedang dibuka di atas", "Rekod bacaan" dan nota tarikh/jam; demo terbitan kekal terkunci. Belum diuji dengan log masuk tutor sebenar.

Aduan pengguna: (1) butang **Edit** bagi kelas yang telah direkod "tidak berfungsi"; (2) kelas yang direkod selepas waktu kelas / pada hari lain tidak boleh disimpan; (3) integrasikan contoh rekod Tahfiz SMAP (Perkara JUZUK / MUKA SURAT / SURAH, Tarikh, Catatan, Guru, Edit); (4) program teori (KAFA, Bahasa Arab, dll.) isi tajuk/topik sendiri menggantikan kemahiran.

Punca dan pembetulan:

- **Edit:** sesi memang dibuka, tetapi editor di atas halaman manakala senarai "Kelas telah dilaksanakan" di bawah, jadi tiada perubahan kelihatan. Kini `useEffect` pada `selectedSession` menatal ke `#session-editor`, dan baris sesi semasa ditanda "Sedang dibuka di atas".
- **Mesej ralat tidak kelihatan:** notis hanya di atas halaman; kini juga dipaparkan sebagai `.save-notice` di sebelah butang Simpan (`aria-live`, bukan `role=status` — ujian Pages bergantung pada satu `role=status`).
- **Tarikh/jam diubah tidak disimpan:** "Simpan kehadiran" kini memanggil `move_session` dahulu jika tarikh/jam diubah, atau merekod terus ke kelas aktif sedia ada pada tarikh/jam itu (`onOpen` ke sesi itu). `rescheduleSession` memulangkan boolean.
- **Migrasi 39** `202610150039_session_fixes.sql` (tambahan): `private.extend_backdated` dipanggil oleh `record_assessment` (kelas individu: tarikh mula tugasan/pendaftaran dilanjutkan ke tarikh sesi, maks 1 tahun); `create_session` menghidupkan semula sesi dibatalkan pada masa sama (sebelum ini memulangkan sesi dibatalkan → skrin rekod tidak terbuka); `private.free_voided_slot` dalam `move_session` mengundur kelas dibatalkan beberapa saat supaya slotnya boleh digunakan.
- **Rekod bacaan gaya SMAP:** `juzOf()` dalam `src/lib/quran.ts`; editor sesi ada medan Juzuk (dikira dari muka surat, mushaf 604); komponen `ReadingRecord` dalam `app.tsx` memaparkan 3 rekod terkini bagi setiap perkara (Perkara · Tarikh · Catatan · Guru · Edit). Medan **Status dibuang atas arahan pengguna** ("kalau dah rekod, selesai").
- **Tajuk/topik program teori (migrasi 40 `202610150040_session_topic.sql`):** program bukan bacaan al-Quran (`readingKind` null: Fardhu Ain KAFA/Dewasa, Bahasa Arab/KSSM/Madinah, Faraid, Tajwid TP, Tadabbur, Tarannum) memaparkan "2. Tajuk / topik pembelajaran" (teks bebas ≤120, wajib apabila hadir) menggantikan "Kemahiran dinilai". `assessmentSchema.topic`; `record_assessment` menggunakan topik sebagai label kemahiran (`assessment_responses.skill='topik'`), menulis `class_sessions.topic`, dan ulasan "Topik pembelajaran: … ." jika tanpa penilaian; `prepare_student_report` membawa `topic` dalam snapshot; PDF bulanan lajur TOPIK / BACAAN / TOPIK + "Topik terkini"; laporan kemajuan lajur "Kemahiran / topik". Demo: `?demo=1&role=tutor` membuka pratonton sebagai tutor (portal/main.tsx).

Bukti setempat: typecheck/lint/Prettier lulus; `npm test` **124/124** (termasuk `tests/integration/session-fixes.test.ts` 8 ujian: 4 untuk migrasi 39 — gagal tanpanya, disahkan — dan 4 untuk migrasi 40); `test:pages` **72/72** (ujian baharu: rekod kelas hari lain dengan sekali Simpan + rekod bacaan; topik KAFA); binaan Pages/Next.js lulus; E2E Next.js **8/8**; `setup-all.sql` = 40 migrasi. **Migrasi 39 dan 40 dipasang pengguna** di Supabase `itglyiypxcavdegouoyz` dan disahkan 15 Okt (query semakan `pg_proc`: "SEMUA OK"). **Belum:** tiada commit/push/deploy; data sebenar pengguna tidak diperiksa (punca berdasarkan kod + ujian PGlite).

## Push dan deploy tema semua tab — 13 Oktober 2026

Atas arahan pengguna “push dan deploy”, perubahan UI semua tab dipush ke `main` pada commit `80fd127` (`Apply emerald theme across all portal tabs`). Workflow [AQR checks #38396303210](https://github.com/islamictutoronline/aqr-portal/actions/runs/38396303210) dan [AQR GitHub Pages #38396313209](https://github.com/islamictutoronline/aqr-portal/actions/runs/38396313209) selesai **success**, termasuk job build dan deploy.

[Portal sebenar](https://islamictutoronline.github.io/aqr-portal/) memberi HTTP 200. CSS terbitan `index-6_jgIB9Q.css` mengandungi `.portal-theme` dan gaya subtab; JavaScript `index-Cl_7F_Vq.js` menggunakan `app portal-theme`. Halaman log masuk desktop/telefon disemak tanpa ralat JavaScript atau respons HTTP gagal, lebar 390px tanpa limpahan, dan `?demo=1` tidak membuka demo produksi. Ini mengesahkan penerbitan aset dan halaman awam; operasi berautentikasi serta integrasi Supabase sebenar tidak diuji semula. Tiada migrasi atau perubahan data dalam deploy ini.

Commit catatan selepas deploy hanya mengubah dokumentasi, menggunakan `[skip ci]`; aset aplikasi yang diterbitkan kekal daripada commit `80fd127`. Catatan “tiada deploy” di bawah merujuk fasa pembangunan sebelum arahan penerbitan ini.

## Tema emerald semua tab — 13 Oktober 2026

Arahan terbaru pengguna: “cantikkan pada semua bahagian tab — bukan dashboard sahaja”. Tema kini dikongsi oleh seluruh `App` menggunakan `className="app portal-theme"`. Fail `src/app/dashboard.css` telah dinamakan semula menjadi `src/app/portal-theme.css` dan import `globals.css` dikemas kini. Gaya emerald/mint/sage meliputi sidebar, subtab, kad, jadual, borang/dialog, profil murid/tutor, program, sesi/kehadiran, laporan, yuran/elaun, tetapan dan Parent Portal. Paparan log masuk tidak termasuk permintaan tab ini. Tiada perubahan pengiraan, handler, skema, data atau matriks akses; Parent Portal kekal baca sahaja. Semua gaya baharu dalam media skrin; cetakan kekal dengan sidebar tersembunyi dan kad putih.

QA setempat: typecheck, lint, Prettier UI, binaan Pages/Next.js lulus; Pages **68/68**, E2E Next.js **8/8**. Sebelas halaman × 320/390/768/1440px disemak (44 paparan) tanpa limpahan dokumen atau ralat JavaScript. Jadual lejar dalam “Lagi pilihan” elaun diperbetulkan supaya skrol mendatar di dalam pembalut; kad tidak lagi memotong jadual pada 320/390px. Borang daftar murid, profil tutor, editor sesi tutor dan Parent Portal penjaga turut disemak. Bukti rekaan setempat dalam `docs/evidence/portal-emerald-*.png`, termasuk tutor, laporan, kewangan, tetapan dan Parent Portal. Tiada push/deploy, perubahan cloud atau ujian Supabase sebenar; amaran bundle/import Vite sedia ada kekal.

Pratonton: `http://127.0.0.1:4173/?demo=1#/dashboard` (Vite pembangunan sahaja). Catatan tema dashboard di bawah ialah sejarah; had “dashboard sahaja” telah diganti oleh arahan semua tab.

## Dashboard emerald cerah berdasarkan rujukan — 13 Oktober 2026 (sejarah sebelum peluasan semua tab)

Arahan susulan pengguna: contoh UI dengan panel cerah/kad bulat, warna kekal green emerald dengan tambahan tona hijau lain. `src/app/dashboard.css` kini menggantikan tema gelap awal dengan latar mint, sidebar putih, ruang kandungan berbingkai bulat, hero gradient emerald/fern, kad metrik mint/sage/hijau muda dan panel putih berbayang lembut. Imej contoh digunakan sebagai rujukan visual sahaja; kandungan dan data imej tidak diimport. Perubahan kekal CSS dashboard sahaja; tiada perubahan pengiraan, handler, fitur, skema atau akses. Parent Portal dan cetakan kekal dengan gaya asal.

Semakan setempat: typecheck/lint/Prettier dan binaan Pages/Next.js lulus; Pages **68/68**, E2E Next.js **8/8**. Lima lebar 320/390/768/1024/1440px disemak tanpa limpahan, dengan carian dan bar carta kelihatan. Tablet menggunakan kad carta/rekod bertindan supaya kandungan kekal mudah dibaca. Menu telefon/Escape memulangkan fokus dengan betul; tiada ralat JavaScript dalam semakan pelayar. Pratonton fixture rekaan terkini: `docs/evidence/dashboard-emerald-desktop.png` dan `docs/evidence/dashboard-emerald-mobile.png` (setempat, diabaikan Git). Tiada perubahan data/cloud, migrasi, push/deploy atau ujian Supabase sebenar; amaran bundle/import Vite sedia ada kekal.

Server pembangunan masih tersedia di `http://127.0.0.1:4173/?demo=1#/dashboard` selagi proses Vite berjalan. Jalankan `npm run dev:pages -- --host 127.0.0.1 --port 4173` jika perlu. Binaan terbitan kekal mengunci demo.

## Tema futuristik awal — 13 Oktober 2026 (diganti oleh kemasan emerald cerah di atas)

Arahan terkini: ubah rupa dashboard supaya futuristik tanpa mengubah sistem atau fitur. Gaya baharu dalam `src/app/dashboard.css`, diimport oleh `globals.css`, menggunakan selector `.dashboard-theme` yang hanya dipasang apabila `section === 'dashboard'` dalam `src/components/app.tsx`. Palet zamrud gelap/cyan/emas, grid latar halus, orbit hiasan hero, panel berlapis dan carta gradient. Semua kandungan, pengiraan, handler, navigasi dan akses sedia ada dikekalkan. Parent Portal kekal baca sahaja dengan paparan asal. CSS baharu dibataskan kepada media skrin; cetakan menggunakan gaya asal. Tiada dependency baharu.

Bukti setempat: typecheck, lint, Prettier fail UI, binaan Pages dan Next.js lulus; ujian Pages **68/68**, E2E Next.js **8/8**. Dashboard diperiksa pada 320/390/768/1440px tanpa limpahan mendatar, termasuk pratonton tutor dan navigasi ke halaman lain yang membuang tema dashboard. Tiada ralat JavaScript dalam semakan pelayar. Tangkapan skrin fixture rekaan: `docs/evidence/dashboard-futuristic-desktop.png` dan `docs/evidence/dashboard-futuristic-mobile.png` (bukti setempat, folder diabaikan Git). Amaran bundle/import Vite sedia ada masih muncul. Tiada perubahan data, migrasi, push/deploy atau ujian Supabase sebenar dalam sesi ini.

Pratonton pembangunan: `http://127.0.0.1:4173/?demo=1#/dashboard`; jika server sudah berhenti, jalankan `npm run dev:pages -- --host 127.0.0.1 --port 4173`. Binaan terbitan masih mengunci demo.

## Kemasan paparan terkini — 12 Oktober 2026

Permintaan pengguna: “cantikkan paparan dan perkemaskan”. Perubahan setempat dalam `src/app/globals.css` dan `src/components/app.tsx`: identiti hijau/emas dikekalkan dengan latar lebih tenang, bayang ringan, kad dan tipografi seragam; menu AQR dengan penanda halaman aktif; penerangan ringkas halaman; carian kini tersedia pada telefon; ringkasan “Perlu perhatian” pentadbir dalam tiga ruang pada desktop; tab, butang penghantaran dan bayaran mempunyai sasaran sentuh sekurang-kurangnya 44px. Pautan demo pada log masuk diasingkan secara visual daripada pendaftaran tutor. Tiada perubahan skema atau pengiraan kewangan.

Menu telefon mempunyai latar yang boleh ditekan untuk menutup, sokongan Escape, perangkap fokus Tab/Shift+Tab dan pemulangan fokus; menu tertutup menggunakan `inert`, dan skrol latar dikunci sementara menu terbuka. Ujian regresi ditambah di `tests/pages/portal.spec.ts` untuk carian/menu dan paparan 320px. Parent Portal kekal baca sahaja dengan skop akses asal.

Bukti akhir setempat: `npm run typecheck`, `npm run lint`, `npm run build:pages`, `npm run build` lulus; `npm run test:pages` **56/56**, `npm run test:e2e` **8/8**. Semakan pelayar tambahan merangkumi 7 halaman × lebar 320/390/768/1440px tanpa limpahan mendatar; tangkapan skrin dashboard, direktori murid, laporan dan log masuk diperiksa secara visual, serta pratonton tutor/penjaga diperiksa. Binaan Vite masih memberi amaran saiz chunk yang sedia ada. Tiada deploy, perubahan data cloud, reset atau ujian integrasi Supabase sebenar dalam sesi ini. Server pratonton Vite pada `http://127.0.0.1:4173/` (jika sudah berhenti, jalankan `npm run dev:pages`; `?demo=1` menggunakan fixture rekaan dalam pembangunan sahaja).

Bahagian terdahulu di bawah ialah sejarah pelaksanaan; kenyataan cloud lama mesti dibaca bersama catatan bertarikh terkini.

**Push dan deploy atas arahan pengguna — 12 Oktober 2026:** perubahan UI dipush ke `main` pada commit `5ecb3b6`. Workflow [AQR GitHub Pages #38223480585](https://github.com/islamictutoronline/aqr-portal/actions/runs/38223480585) selesai `success`; workflow AQR checks #38223466508 juga `success`. [Portal sebenar](https://islamictutoronline.github.io/aqr-portal/) disemak tanpa log masuk: HTTP 200, CSS kemasan baharu dimuatkan, halaman log masuk desktop/telefon dipaparkan tanpa ralat pelayar atau respons HTTP gagal, tiada limpahan telefon 390px, dan `?demo=1` tidak membuka demo dalam binaan terbitan. Ini mengesahkan penerbitan dan halaman awam sahaja; sesi berautentikasi serta operasi Supabase tidak diuji semula. Tiada perubahan data atau migrasi dalam deploy ini. Commit catatan serahan selepas deploy hanya mengubah dokumentasi.

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

**Elaun automatik, tiada semakan manual (keputusan pengguna 10 Okt):** admin hanya _melihat_. `allowanceRows` (`src/lib/reporting.ts`) mengira elaun bagi setiap sesi `completed` = kadar program + tempoh pada tarikh sesi; **Hadir/Lewat/Ganti/Tidak hadir dibayar, Berizin tidak**. Digunakan oleh laporan Excel `tutor_allowance`, Kewangan → Elaun tutor (tab Semua tutor | setiap tutor), Sesi & kehadiran admin (ringkasan bulan + tab Hari ini | setiap tutor), senarai/profil tutor dan Utama. Kad "Semakan sesi" (lulus satu persatu) dan "Kelompok pembayaran" (maker-checker) dibuang dari UI; jadual/fungsi DB `tutor_allowance_entries`, `review_session`, `payout_batch` kekal tetapi tidak digunakan UI. Tutor: Sesi & kehadiran = senarai nama · program; tekan untuk rekod sesi dengan tarikh/jam boleh diubah (migrasi 23, `change_session` untuk tutor). Kad "Pencapaian unit kurikulum" dibuang. Permintaan seterusnya yang belum dibina: borang pentaksiran gaya Tahfiz (Perkara: Juzuk/Muka surat/Surah/Ayat + tarikh + status) dan butang Tambah pentaksiran/Ulasan/PDF di senarai murid — perlu sahkan nilai, pilihan status dan perkara setiap program dengan pengguna.

**Kehadiran tutor (10 Okt, lanjutan):** borang sesi memuatkan kehadiran/penilaian sedia ada (boleh dibetulkan); satu butang "Simpan kehadiran/perubahan" (terus diterbitkan). `bestSession` mengutamakan sesi belum direkod (hari ini, kemudian sesi lepas terkini). Di bawah borang: kad "Belum direkod" (Rekod) dan "Kelas telah dilaksanakan" (Edit/Padam), ringkasan selesai/berbaki bulan, dan "Rekod kelas sekarang". Migrasi 24 `void_session` (batal + tarik ulasan + audit) telah dijalankan pengguna. Utama admin tidak lagi memaparkan senarai "Sesi pembelajaran". Migrasi 25 (`create_session` melanjutkan tarikh mula kelas individu ke belakang, maks 1 tahun) dan 26 (`move_session`: alih sesi di tempatnya termasuk yang sudah direkod; slot jadual asal ditanda pengecualian) telah dijalankan. UI: tarikh/jam sesi sentiasa boleh diubah (kecuali dikunci), butang Simpan aktif dengan kehadiran sahaja (penilaian pilihan, disimpan `not_assessed`). Migrasi 27 (tarikh mula jadual, lalai 1 haribulan; `fill_class_sessions` menjana dari `effective_from` maks 1 tahun ke belakang; `void_session` mengosongkan slot berjadual dan membatalkan sesi tambahan sahaja; pembetulan data: semua pendaftaran Oktober 2026 dimulakan 1/10) dan 28 (`move_session` membuang tanda pengecualian pada slot destinasi; pembetulan data memulihkan slot BAIHAQI 12/10 & 13/10 yang dialih semasa ujian) telah dijalankan. Disahkan 11 Okt: 12/12 pendaftaran aktif mempunyai slot Oktober penuh. Migrasi 1–28 kini dipasang pada projek `itglyiypxcavdegouoyz`.

**11 Okt — laporan & UI:** PDF laporan murid direka semula (`reportPdf` + `reportNarrative` dalam `src/lib/student-reports.ts`: jalur tajuk, kad murid, kotak ringkasan, ringkasan bertulis, jadual kehadiran berwarna, ulasan, pengaki sulit, penanda DRAF; fon tebal `public/fonts/report-latin-bold.woff`, Plus Jakarta Sans OFL). Excel (`src/lib/workbook.ts`) kini ada helaian pertama `LAPORAN` bertajuk sedia cetak + baris JUMLAH; helaian `MAKLUMAT_LAPORAN`/`DATA`/`RINGKASAN` dikekalkan. UI: log masuk dua panel dengan tab Kod e-mel | Kata laluan, `Table` menambah `data-label` dan jadual menjadi kad di ≤760px, skrin sesi telefon dikemas, kad salam ringkas, kadar elaun dipermudah. `financialPdf` (invois/resit) belum direka semula. Kemudian: Sesi & kehadiran admin menyemak **mengikut murid** (tab Hari ini | Semua murid | setiap tutor; satu baris setiap murid · program; butang Semak memaparkan semua kelas murid itu sebulan sekali gus). Excel menambah tab `SENARAI MURID` (berpautan) dan satu tab kemas bagi setiap murid (`formattedSheet`, `sheetName` disanitasi). Kemudian: kotak Tutor aktif di Utama admin; padam tutor (migrasi 29 `remove_tutor` + `staff_directory_v2` memulangkan ahli tidak aktif; pop up memerlukan nama ditaip); laporan bulanan admin dikumpulkan mengikut tutor dengan Luluskan semua draf/ZIP tutor; payslip tutor (`src/lib/payslip.ts`, migrasi 30 `tutor_payment_details` + `save_payment_details`, RLS tutor sendiri/admin). Migrasi 1–30 dipasang dan disahkan. Migrasi 31 (yuran ikut sesi dijalankan: `program_fee_rates` daripada Borang Pendaftaran AQR berkuat kuasa 2026-10-01, 5 program baharu tanpa kadar elaun tutor lagi, `generate_session_invoices` — Hadir/Lewat/Ganti/Tidak hadir dicaj, Berizin tidak; invois belum dibayar dijana semula) dipasang 11 Okt. Laporan tanpa lajur ID; nama fail melalui `fileName()`/`monthLabel()` dalam core; payslip hanya baris bersesi. Pada 11 Okt: 12 murid aktif tetapi 0 pautan penjaga bil — invois tidak akan dijana sehingga admin memautkan penjaga.

**11 Okt — logo & identiti jenama:** palet ditukar daripada biru laut kepada hijau AQR (`#12433d`, emas `#ad9461`). Aset dalam `public/brand/` (dikecualikan daripada `*.png` dalam `.gitignore`): `aqr-mark.png` (lambang emas + teks putih, untuk latar hijau), `aqr-emblem.png` (lambang sahaja), `aqr-logo.png` (asal, jubin hijau), `ito-logo.png` (Islamic Tutor Online, latar telus), `icon.png` (favicon 192px). `src/lib/brand.ts` `loadBrandBytes()` memuatkan logo untuk PDF/Excel di pelayar; `assetUrl()` dalam `transport.ts` menyelesaikan laluan Pages vs Next. Logo dipasang pada: PDF laporan murid, payslip, invois & resit (`financialPdf` direka semula: jalur hijau, lencana status, kotak maklumat, jadual BUTIRAN/SESI/HARGA/JUMLAH, kotak BAKI PERLU DIBAYAR, pengaki logo ITO), Excel (`toXlsx(report, logo)` — logo di kiri jalur tajuk setiap tab; laluan API membaca `public/brand/aqr-mark.png`), bar sisi, kad salam Utama (hero hijau + lambang + cip "Bersama Islamic Tutor Online"), log masuk (panel jenama + cip rakan kerjasama; lambang pada telefon). **CSV tidak boleh mengandungi imej** — kekal teks sahaja.

**11 Okt — kata laluan untuk tutor:** tutor (selain pemilik/admin) boleh menetapkan/menukar kata laluan sendiri (`passwordCard()` di Tetapan; `/api/password` dalam `portal/client.ts` membenarkan `tutor`, `updateUser({ password, data: { password_set: true } })`). Kod e-mel hanya diperlukan semasa daftar/log masuk pertama atau lupa kata laluan. Utama tutor memaparkan kad "Tetapkan kata laluan anda" sehingga `user_metadata.password_set` benar (`getContext` → prop `passwordSet`). Log masuk: tab **Kata laluan** (lalai) | **Kod e-mel**; pilihan diingati dalam `localStorage` `aqr.loginMethod`. Ibu bapa kekal dengan kod e-mel. Tiada migrasi DB.

**11 Okt — reset untuk ujian kali ke-2:** atas permintaan jelas pengguna, `supabase/reset-test-data.sql` (bukan migrasi) memadam semua data operasi, tutor (profil, keahlian, akaun Auth) dan pemohon; mengekalkan organisasi, program, kurikulum, pilihan, kadar elaun, kadar yuran dan akaun pemilik/admin. Diuji pada PGlite (ujian integrasi terakhir). Sebelum reset (11 Okt): 1 pemilik, 2 tutor (1 tidak aktif), 17 murid, 162 sesi, 596 audit. Pengguna menjalankan skrip sendiri dalam SQL Editor. **Jangan jalankan skrip ini tanpa permintaan pengguna.**

**11 Okt — keputusan kadar:** kadar yuran dalam sistem disahkan sama dengan senarai pengguna. Nama program "Bahasa Arab" dikekalkan (bukan "Bahasa Arab Kafa"). Elaun tutor bagi BA KSSM, BA Madinah, Tadabbur, Faraid dan Tarannum diputuskan pengguna: **yuran sesi − RM2** (RM15/18/18/23/18, 30 minit, mula 2026-10-01) — migrasi 34 `202610110034_new_program_allowance.sql`; Bahasa Arab Madinah dikekalkan. Tahsin al-Quran tiada dalam senarai yuran pengguna tetapi dibiarkan aktif (belum diputuskan).

**11 Okt — penjaga semasa daftar murid:** migrasi 32 (`202610110032_enrol_guardian.sql`): `tutor_enrol_student` menerima `guardian_name` (lalai "Ibu/Bapa <nama murid>") dan `guardian_phone` (wajib dalam UI; `private.normalize_phone` → E.164, cth. 012-345 6789 → +60123456789) dalam transaksi yang sama; `save_student_guardian` (admin atau tutor murid itu) untuk kemas kini. No. telefon sama = penjaga sama (adik-beradik satu invois). Penjaga ditanda `is_billing_contact` → `generate_session_invoices` boleh terus menjana invois. RLS baharu: tutor membaca penjaga/pautan murid yang diajarnya. UI: medan penjaga dalam Daftar murid, lajur Penjaga dalam senarai, kotak Penjaga (pautan wa.me) + Kemaskini penjaga dalam profil. No. WhatsApp ditaip bebas dan dibaiki automatik (`PhoneField` + `joinPhone`: sengkang/jarak/0 depan dibuang, 60…/+60…/+6 0… dikesan, semakan panjang nombor Malaysia) dengan pratonton "Akan disimpan: +60…" dan pautan Uji di WhatsApp; disimpan tanpa sengkang (E.164). Borang kini ada pilihan **Kod negara** (lalai Malaysia +60; `countryCodes`/`joinPhone`/`splitPhone` dalam core; nombor bermula '+' mengatasi pilihan) atas permintaan pengguna; ralat borang dipaparkan dalam tetingkap (`.dialog-error`). Migrasi 32 dipasang oleh pengguna dan disahkan (fungsi wujud); Pages dideploy 11 Okt. Reset data ujian juga telah dijalankan (0 murid) — ujian kali ke-2 bermula dari kosong.

**11 Okt — hantar laporan + invois sekeluarga melalui WhatsApp:** `src/lib/delivery.ts` (`familyBundles`: satu pakej setiap penjaga bil — semua anak/adik-beradik + invois bulan itu; tidak lengkap jika ada laporan belum diluluskan, invois belum dijana/draf, atau tiada no.; `familyMessage`; `whatsappUrl`; `invoiceDetails`) dan `src/components/guardian-delivery.tsx` (kad "Laporan + invois sekeluarga" di halaman Laporan admin, bawah semakan laporan). No. telefon bergaris (`.wa-link`) di kad, profil murid, senarai murid dan senarai Penjaga → wa.me dengan mesej siap ditulis. "Sediakan PDF (laporan + invois)" menghasilkan **satu PDF gabungan** setiap keluarga (`mergePdfs`: laporan semua anak + invois). Kemudian "Muat turun PDF (laporan + invois)" sentiasa ada; komputer: "Buka WhatsApp" (wa.me, mesej siap) + lampir manual + "Tandakan dihantar" (`report_delivery`); telefon/tablet (`pointer: coarse` + Web Share): "Kongsi ke WhatsApp" (status `sent` direkod automatik). Kongsi pelayar di Mac membuka halaman web WhatsApp tanpa lampiran, sebab itu dihadkan kepada telefon. WhatsApp tidak membenarkan lampiran melalui pautan; perkongsian fail bergantung pada pelayar telefon. Tiada migrasi.

**11 Okt — bacaan sesi, Cuti bermaklum, laporan tutor:** status `excused` kini dilabel **"Cuti bermaklum"** (nilai DB kekal `excused`; "berizin" bermaksud akses yang dibenarkan dikekalkan di tempat lain). Migrasi 33 (`202610110033_session_reading.sql`): `attendance.reading jsonb`, `private.surah_name/surah_ayahs/reading_label` (selari `src/lib/quran.ts`), `record_assessment` menerima `selected.reading` (hanya hadir/lewat/ganti; disahkan; "Bacaan: …" ditambah pada ulasan), `prepare_student_report` membawa bacaan dalam snapshot. Iqra' → jilid + muka surat; Tahsin/Kelancaran/Pra Tahfiz → surah + ayat dari–hingga + muka surat (`readingKind`). Rekod sesi memaparkan ruangan bacaan + "Sesi lepas: …". PDF menambah lajur BACAAN dan "Bacaan terkini" dalam ringkasan. Tutor: kad "Laporan kelas murid saya" (PDF/ZIP `reportPdf(…, 'tutor')`, tajuk "Laporan Kelas Bulanan", tanpa invois). Admin: butang "Jana laporan + invois" (`month_package`: draf laporan semua murid yang belum diluluskan + `generate_session_invoices`). Migrasi 33 dipasang pengguna dan disahkan (`attendance.reading` wujud); Pages dideploy 11 Okt.

**11 Okt — butang bayaran mudah:** migrasi 35 (`202610110035_simple_payments.sql`): `mark_invoice_paid` (admin; satu langkah: bayaran `verified` untuk baki penuh + peruntukan + resit + `refresh_invoice` + audit; rujukan pilihan) dan jadual `tutor_month_payments` + `mark_tutor_paid` / `void_tutor_payment` (rekod tidak dipadam; batal = `void` dengan sebab; RLS admin atau tutor sendiri). UI: Kewangan → invois "Yuran telah dibayar" (tarikh, kaedah, rujukan pilihan); jadual bayaran kini ada Tarikh/Rujukan ("Tiada rujukan"). Elaun → lajur Bayaran ("Elaun telah dibayar" / "Dibayar · tarikh" / "Bayar baki"), sejarah bayaran setiap tutor dengan Batal; tutor melihat status dan sejarah sendiri; payslip memakai tarikh bayaran sebenar. `reset-test-data.sql` turut mengosongkan `tutor_month_payments`. Migrasi 35 dipasang pengguna dan disahkan; Pages dideploy 11 Okt. Migrasi 34 dipasang dan disahkan 11 Okt (KSSM 15, Madinah 18, Tadabbur 18, Faraid 23, Tarannum 18; satu kadar setiap program). Migrasi 1–35 kini dipasang.

**11 Okt — adik-beradik semasa daftar murid:** borang Daftar murid memakai `GuardianField` (medan `type: 'guardian'`): pilih "Penjaga baharu" atau penjaga sedia ada (`guardianChoices`: penjaga yang mempunyai anak aktif, skop RLS tutor) → nama + no. diisi; jika no. yang ditaip sama dengan penjaga sedia ada, nota "Adik-beradik: … digabung" dipaparkan (`PhoneField.onPreview`). Profil murid (tutor) ada butang "Daftar adik-beradik" (`createStudent(guardianId)`). Pangkalan data tidak berubah: no. sama = penjaga sama (migrasi 32).

**11 Okt (petang) — reset kedua:** atas permintaan pengguna, `reset-test-data.sql` dijalankan semula dan disahkan: 0 murid/penjaga/sesi/laporan/invois/bayaran/elaun dibayar/audit; kekal 1 organisasi, 1 pemilik (akaun log masuk tunggal), 13 program, 16 kadar elaun, 16 kadar yuran. Ujian kali ke-3 bermula dari kosong.

**12 Okt — kemaskini murid & jadual:** migrasi 36 (`202610120036_update_schedule.sql`): `can_manage_class` (admin atau tutor semasa kelas), `update_schedule(org,cid,minutes,slots,effective_from,end_date)` — buang sesi berjadual lama yang belum direkod (bukan tambahan manual, tiada kehadiran/ulasan/elaun) mulai tarikh berkuat kuasa, tamatkan jadual lama sehari sebelumnya, cipta jadual baharu dan jana sesi; `update_student` (nama murid + nama kelas individu). UI profil murid: "Kemaskini murid" (nama) dan "Ubah jadual" pada setiap program aktif (WeeklySlots diisi nilai semasa, tarikh mulai lalai hari ini, tarikh tamat semasa). Diuji PGlite + Playwright. Migrasi 36 dipasang pengguna dan disahkan 12 Okt (migrasi 1–36 lengkap); Pages sudah dideploy. Profil murid disusun semula: tajuk (nama, status, bil. program, tarikh daftar, butang Kemaskini/Arkib), kad "Program & jadual kelas" (nama program, cip tutor, cip hari & jam, seminggu/tempoh/sehingga, bar kemajuan bulan, Ubah jadual) dan kad "Penjaga" berasingan.

**12 Okt — penghantaran keluarga disusun ikut tutor:** `GuardianDelivery` kini: kotak carian (nama murid/ibu bapa/no. telefon, `familyMatches`), tag penapis Semua/Sedia dihantar/Belum lengkap/Dihantar dengan bilangan, kumpulan `<details>` setiap tutor (`familiesByTutor`; tertutup secara lalai, terbuka automatik semasa mencari/menapis; keluarga dengan anak di bawah beberapa tutor muncul di setiap tutor) dan baris ringkas setiap keluarga dengan tag dokumen (laporan setiap anak, invois) + status + tindakan. Kotak amaran panjang dibuang (sebab ditunjuk pada tooltip butang).

**12 Okt — rumusan tutor:** migrasi 37 (`202610120037_tutor_remarks.sql`): jadual `monthly_tutor_remarks` (teks bebas ≤1500 aksara, satu setiap murid × bulan; RLS admin atau tutor murid itu), `save_tutor_remark` (teks kosong = padam; dikunci selepas laporan diluluskan), dan `prepare_student_report` kini memasukkan `tutor_remark` ke snapshot. UI: kad "Laporan kelas murid saya" (tutor) ada butang "Tulis/Ubah rumusan" (medan `type: 'textarea'`) dan tag "Ada rumusan"; PDF laporan menambah bahagian "Rumusan tutor"; pratonton admin memaparkannya. Rumusan yang ditulis selepas draf dijana memerlukan "Jana laporan + invois" semula (draf dikemas kini). `reset-test-data.sql` turut mengosongkan jadual ini. Migrasi 37 dipasang pengguna dan disahkan 12 Okt (migrasi 1–37 lengkap); Pages dideploy.

**13 Okt — 12 permintaan pengguna (dibina oleh 3 agen selari, digabung & disemak):**

- Migrasi 38 (`202610120038_admin_tools.sql`): `classes.flexible` (fill_class_sessions tidak menjana sesi; sesi dijana untuk tutor yang bertugas pada tarikh sesi), `tutor_enrol_student` 11 argumen (`tutor_id` wajib untuk admin, `flexible`), `update_schedule` 7 argumen (`flexible`), `transfer_class`, `class_rate_overrides` + `set_class_rates` (yuran/elaun khas murid × program, sejarah ikut tarikh), `tutor_rate_overrides` + `set_tutor_rate` (tambahan/potongan elaun setiap sesi untuk tutor), `generate_session_invoices` memakai yuran khas, `reopen_student_report`. Peraturan elaun: elaun khas kelas jika ada, jika tidak max(0, kadar standard + pelarasan tutor) — dikira dalam `reporting.ts` (`effectiveAllowance`), payslip turut ikut.
- UI: admin daftar murid bagi pihak tutor (pilih tutor) + pilihan "Jadual fleksibel"; kad program: Pindah tutor, Kadar khas, tag fleksibel; Elaun khas tutor; penghantaran keluarga: "Jana & sediakan PDF" (buka semula → sedia → lulus laporan anak + jana invois → PDF), setiap tutor "Jana semua" + "Muat turun semua PDF (ZIP)"; "Laporan kelas tutor (ZIP)" untuk admin; Kewangan yuran dua lajur Belum/Sudah bayar + carian (no. invois, ibu bapa, murid, tutor) dengan baris kad padat; elaun dua lajur; mesej Edge Function `aqr-admin` dibuang (kawalan berkaitan disembunyikan dalam binaan statik); Utama tutor tanpa kad "Sesi pembelajaran"; "Hari ini" hanya tutor yang ada sesi hari ini.
- `data.ts` membaca `classes.flexible` (wajib migrasi 38 sebelum deploy); jadual override dibaca secara pilihan. Migrasi 38 dipasang pengguna dan disahkan 13 Okt (migrasi 1–38 lengkap); Pages dideploy. `.claude/` diabaikan dalam lint/git (salinan kerja agen).

**13 Okt — tutor AHMAD NAJIB dipadam:** atas permintaan pengguna, `supabase/remove-tutor-data.sql` (skrip am dengan pagar keselamatan: nama tepat seorang tutor; tiada murid/kelas/penjaga dikongsi; diuji dalam `tests/integration/remove-tutor.test.ts`) dijalankan pengguna. Disahkan: tinggal Pemilik AQR + AHMAD MUZZAMMIL BIN MOHAMMAD NAJIB (12 kelas, 12 murid, 137 sesi, 11 penjaga utuh); 0 invois/bayaran/bayaran elaun; 2 akaun log masuk.

**Status akhir sesi 10 Okt (malam) — sambung di sini:**

- Pembaikan terakhir dideploy: sesi dibatalkan/dijadual semula dikunci dengan nota (sebelum ini kelihatan boleh diedit tetapi setiap simpanan ditolak — punca aduan "tak dapat simpan" pada sesi QALEESYA yang sudah dipadam), ralat P0001 dipaparkan terus, padam kelas semasa kembali ke senarai.
- Data ujian sebenar pengguna wujud (cth. murid QALEESYA, tutor AHMAD MUZZAMMIL); jangan ubah tanpa izin.
- Permintaan belum dibina, tunggu pengesahan pengguna: (1) reka bentuk diilhamkan daripada app.smap.my — hanya halaman log masuk boleh dilihat tanpa akaun (kad dua panel, latar biru lembut, fon Karla); jangan salin jenama/imej mereka; (2) borang pentaksiran gaya Tahfiz (Juzuk/Muka surat/Surah/Ayat + tarikh + status) dan butang Tambah pentaksiran/Ulasan/PDF dalam senarai murid — soalan reka bentuk (nilai, pilihan status, perkara setiap program, lokasi) belum dijawab.

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
