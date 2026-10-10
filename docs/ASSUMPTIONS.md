# Andaian dan keputusan

- Pusat tunggal pada keluaran awal; semua rekod operasi mempunyai `organization_id`.
- Mod demo berasingan, fiksyen dan hanya dalam memori tab. Muat semula menetapkan semula perubahan. Tiada autentikasi produksi melalui peranan demo.
- Pemilik pertama diwujudkan melalui skrip pentadbir; pengguna seterusnya melalui jemputan pemilik dan OTP.
- Penjaga menggunakan OTP e-mel. Jemputan WhatsApp tanpa e-mel ditangguhkan sehingga aliran sesi tersuai diaudit; tiada pautan awam kepada rekod murid.
- Tiada kadar yuran ibu bapa ditetapkan. Sebarang angka yuran demo dilabel contoh, bukan harga AQR.
- Elaun kumpulan dibayar sekali bagi sesi kelas, bukan setiap murid. Tiada kadar untuk tempoh tidak dinyatakan.
- Rekod September hanya diimport dengan arahan opt-in ke pangkalan data peribadi. Kuota bukan bukti sesi dilaksana dan tiada import terus dibayar.
- Google OAuth memerlukan kredensial, URI redirect dan kunci penyulitan sebenar. XLSX tidak bergantung padanya.
- Fail sumber asal yang mengandungi nama kanak-kanak tidak dipadam tetapi diabaikan oleh Git.
