# Keperluan muktamad AQR — 10 Oktober 2026

Arahan langsung pengguna ini mengatasi keperluan terdahulu yang bercanggah.

- **Parent Portal wajib kekal**, sebagai pilihan tambahan kepada laporan yang admin hantar melalui WhatsApp. Antara muka premium, mobile-first, tanpa kata laluan; sesi boleh dikekalkan pada peranti dipercayai.
- Penjaga hanya membaca rekod anak sendiri, termasuk beberapa anak: kehadiran, perkembangan individu, ulasan automatik Bahasa Melayu, laporan bulanan, PDF individu dan rekod bayaran yuran. Tiada mutasi akademik/kewangan, payment gateway atau checkout.
- Admin mempunyai dashboard terkunci, menyemak dan meluluskan laporan, menjana PDF individu/bulanan secara pukal, memuat turun ZIP, menyediakan mesej WhatsApp dan merekod status penghantaran secara manual. Penyediaan mesej tidak menghantar mesej secara automatik.
- Tutor boleh memohon pendaftaran sendiri; akses tutor diaktifkan hanya selepas kelulusan pentadbir. Tutor yang diluluskan boleh mendaftarkan murid dalam kelas yang ditugaskan, merekod kelas/kehadiran, menilai melalui tap, menjana ulasan Melayu dan laporan pengajaran bulanan.
- Hosting utama ialah **GitHub Pages**, menggunakan hasil binaan HTML/CSS/JavaScript statik. Supabase Auth/PostgreSQL/RLS mengawal akses; tiada service-role key dalam binaan awam.
- Skala sasaran sekurang-kurangnya 50 tutor/400 murid; query dipaginasi, laporan disediakan per bulan/murid, ZIP dijana berurutan untuk mengawal penggunaan memori.
- PDF lama ialah contoh ciri/susun atur sahaja. **Jangan import nama murid, sesi atau sejarah daripada PDF.** Tiada import sejarah automatik. Skrip CSV/XLSX lama kekal sebagai utiliti legasi sahaja, bukan langkah pemasangan atau permintaan untuk menjalankannya.
- Kekalkan kod/fungsi sedia ada dan gunakan semula komponen. Binaan Next.js lama kekal untuk keserasian; binaan Pages tidak boleh bergantung pada route `/api` setempat.

Kelulusan laporan bulanan merakam snapshot yang tidak boleh ditulis ganti. Kehadiran dan ulasan sesi kekal seperti fungsi sedia ada; laporan PDF bulanan untuk penjaga hanya muncul selepas kelulusan admin. Rekod penghantaran ialah per laporan dan penjaga, bukan bukti WhatsApp menghantar/membaca mesej.
