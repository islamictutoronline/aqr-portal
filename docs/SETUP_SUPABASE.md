# Pasang AQR dengan data sebenar (Supabase)

Panduan ringkas untuk pemilik AQR. Ia mengambil masa kira-kira 15 minit. Sistem bermula kosong, tanpa murid contoh.

## 1. Cipta projek Supabase

1. Daftar di [supabase.com](https://supabase.com) menggunakan **e-mel yang sama** dengan e-mel pemilik AQR.
2. Klik **New project**. Pilih rantau **Southeast Asia (Singapore)**, kemudian simpan kata laluan pangkalan data di tempat selamat. Anda tidak perlu memberikannya kepada sesiapa.

## 2. Pasang jadual

1. Di Terminal folder projek, jalankan `npm run db:sql`. Arahan ini menghasilkan fail `supabase/setup-all.sql`.
2. Dalam Supabase, buka **SQL Editor → New query**. Tampal **seluruh** kandungan fail itu, kemudian klik **Run**.
3. Jalankan fail ini **sekali sahaja** pada projek baharu. Jika ralat muncul, jangan cuba berulang kali; salin mesej ralat kepada pembangun.

## 3. Isi `.env.local`

Buka fail `.env.local` di akar projek dan isi nilai daripada **Project Settings → API Keys** (URL projek pula di **Data API**):

| Nama                            | Ambil daripada                                         |
| ------------------------------- | ------------------------------------------------------ |
| `VITE_SUPABASE_URL`             | Project URL                                            |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key (`sb_publishable_…`) atau anon key     |
| `SUPABASE_SERVICE_ROLE_KEY`     | Secret key (`sb_secret_…`) atau service_role — RAHSIA  |
| `BOOTSTRAP_ADMIN_EMAIL`         | E-mel pemilik AQR                                      |
| `RATE_EFFECTIVE_FROM`           | Pilihan: tarikh kadar elaun berkuat kuasa (YYYY-MM-DD) |

Jangan tampal secret key dalam chat, e-mel, WhatsApp atau GitHub.

## 4. Cipta akaun pemilik

Jalankan `npm run bootstrap`. Skrip mencipta organisasi AQR, akaun pemilik, subjek dan pilihan penilaian. **Tiada murid atau yuran contoh dimasukkan.** Skrip berhenti tanpa mengubah apa-apa jika AQR sudah wujud.

## 5. Tetapan Auth Supabase

Dalam **Authentication → URL Configuration**:

- **Site URL**: `http://127.0.0.1:4173/` untuk cubaan di komputer. Tukar kepada URL GitHub Pages sebenar apabila diterbitkan.
- **Redirect URLs**: tambah URL yang sama.

Dalam **Authentication → Sign In / Providers → Email**, pastikan **Confirm email** dihidupkan. **Allow new users to sign up** perlu dihidupkan jika tutor dibenarkan memohon sendiri.

> **Had e-mel:** Pelayan e-mel terbina Supabase hanya menghantar kepada ahli pasukan projek Supabase, dengan bilangan terhad sejam. Untuk cubaan pertama oleh pemilik, ini sudah mencukupi. Sebelum menjemput tutor dan ibu bapa, sediakan **Custom SMTP** di **Authentication → Emails → SMTP Settings**, contohnya Resend atau Brevo yang mempunyai pakej percuma.

## 6. Buka portal

```sh
npm run build:pages
npm run preview:pages
```

Buka `http://127.0.0.1:4173/`, masukkan e-mel pemilik, kemudian klik pautan atau masukkan kod yang dihantar ke e-mel. Selepas log masuk, sistem kosong sedia diisi: tambah kelas, murid dan penjaga.

## 7. Jemputan tutor, admin dan ibu bapa (Edge Function)

Jemputan dan upload bukti bayaran menggunakan fungsi `aqr-admin`. Dalam **Edge Functions → Deploy a new function → Via Editor**, namakan fungsi `aqr-admin` dan tampal kandungan `supabase/functions/aqr-admin/index.ts`. Kemudian di **Edge Functions → Secrets**, tambah `AQR_APP_URL` dengan URL portal yang tepat, contohnya `http://127.0.0.1:4173/`.

## Peranan

| Peranan          | Akses                                                              |
| ---------------- | ------------------------------------------------------------------ |
| Pemilik          | Semua, termasuk jemputan kakitangan dan tetapan                    |
| Admin            | Akademik dan kewangan (murid, sesi, laporan, yuran, elaun)         |
| Tutor            | Kelas yang ditugaskan sahaja: kehadiran, penilaian dan murid kelas |
| Ibu bapa/penjaga | Baca sahaja: rekod anak sendiri                                    |

Kelulusan elaun dan bayaran masih memerlukan **dua orang berbeza** (contohnya pemilik dan admin). Seorang tidak boleh menyemak dan meluluskan kerjanya sendiri.

## 8. E-mel: SMTP dan templat berkod

E-mel lalai Supabase hanya sampai kepada ahli projek. Sediakan **Custom SMTP** (contohnya Brevo: `smtp-relay.brevo.com`, port 587, _Username_ = Login SMTP Brevo, _Password_ = kunci SMTP) di **Authentication → Emails → SMTP Settings**.

Portal menggunakan aliran PKCE, jadi pautan e-mel hanya berfungsi dalam pelayar yang membuat permintaan. Oleh itu templat **Magic Link** dan **Confirm signup** mesti memaparkan kod `{{ .Token }}`. Salin kandungan `supabase/templates/magic-link.html` dan `confirm-signup.html` (tanpa baris komen pertama) ke **Authentication → Emails → Templates**. Subjek dicatat dalam komen pada baris pertama setiap fail.
