# Seni bina dan sempadan kepercayaan

Next.js App Router menerima sesi Supabase pada server. `proxy.ts` melakukan refresh dengan `getClaims`; Data Access Layer mengesahkan pengguna melalui `getUser`, keahlian aktif atau penjaga dipautkan. `organization_id` diperoleh daripada konteks server, bukan payload atau localStorage. Semua mutasi dan muat turun memeriksa konteks ini; RLS menjadi sempadan kedua.

`src/lib/core.ts` mengandungi pengiraan integer sen, rubrik, penapis tarikh Malaysia dan matriks laporan. `reporting.ts` membentuk satu DTO kanonik untuk pratonton/CSV/XLSX/Sheets. Pangkalan data menentukan kelayakan kewangan; paparan mengagregat rekod berizin. Fail Excel sumber digunakan sebagai rujukan import, bukan sumber payroll langsung.

Murid, penjaga, hubungan keluarga, program, kelas, tugasan tutor, pendaftaran dan sesi berasingan. Nota dalaman berada pada jadual yang tidak boleh dibaca penjaga. Respons penilaian draf dan komen diterbitkan berasingan. Snapshot ulasan lama ditarik balik apabila revisi diterbitkan, bukannya ditulis ganti. Milestone hanya mengemas kini penguasaan apabila diterbitkan dan disokong bukti kehadiran/unit kelas.

Kewangan penjaga menggunakan invois, item, bayaran, peruntukan, bukti dan resit. Elaun tutor menggunakan kadar berinterval, entri snapshot, kelompok, payout dan pelarasan. Fungsi transaksi private menggunakan `SECURITY DEFINER`, `search_path=''`, nama skema penuh dan semakan akses; wrapper RPC public menggunakan invoker. Row/advisory locks dan kunci unik melindungi retry/peruntukan/kelompok. Bayaran pending/rejected/reversed tidak dikira sebagai bayaran sah. Lebihan belum diperuntukkan kekal kredit, bukan baki invois negatif.

Semua jadual operasi menggunakan RLS dan hubungan antara entiti membawa composite FK organisasi. Tiada DELETE untuk peranan aplikasi; sejarah bil/akademik dikekalkan. Audit menyimpan pelaku, operasi dan ID objek tanpa salinan nama kanak-kanak atau token.

Browser tidak boleh terus memuat naik ke Storage. Endpoint server mengesahkan pengguna/rekod, saiz dan tandatangan bait sebelum menggunakan capability Storage server. Selepas itu metadata ditulis menggunakan sesi pengguna dan RLS. Signed URL bacaan berjangka pendek memerlukan akses kepada metadata. Service key hanya digunakan di skrip bootstrap/import, jemputan yang disahkan pemilik dan upload yang telah diotorisasi. Peranan browser tidak mempunyai service key.

Mod demo berada pada `/demo` dengan fixture rekaan dan skop peranan yang dikongsi oleh UI/eksport. Peranan demo tidak pernah diterima oleh API sebenar sebagai bukti pengesahan. Tiada bahan peribadi September dimasukkan dalam fixture.

Sebelum banyak replica produksi, gantikan limiter memori dengan shared durable store, tetapkan HTTPS, polisi SMTP/Auth, backup dan retention, serta lakukan ujian Supabase sebenar. Ujian PGlite melaksanakan PostgreSQL tetapi tidak meniru keseluruhan HTTP Auth/Storage.
