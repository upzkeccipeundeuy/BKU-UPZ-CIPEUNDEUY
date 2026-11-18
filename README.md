# BKU UPZ Kecamatan Cipeundeuy — Kabupaten Subang

Aplikasi web statis untuk Buku Kas Umum Unit Pengumpul Zakat, menggunakan HTML, CSS, JavaScript, Supabase Auth, dan Supabase Database.

## Fitur dalam paket
- Login menggunakan Supabase Auth.
- Dashboard saldo, total penghimpunan, total pendistribusian, dan jumlah transaksi.
- Input penghimpunan (Zakat Fitrah, Zakat Mal, Infak, Sedekah, BIS Ramadhan, lainnya).
- Input pendistribusian dengan sumber **Zakat Mal** dan **BIS Ramadhan**.
- Buku Kas Umum dari view `v_bku`.
- Pemilahan saldo kas uang; beras/barang tidak dihitung sebagai kas rupiah.

## Konfigurasi
File `assets/config.js` sudah diisi dengan Project URL dan Publishable Key yang diberikan pemilik project.

Project URL yang digunakan:
`https://tzwehuerojphqjrygtss.supabase.co`

Catatan: gunakan URL dasar project, bukan URL REST lengkap `/rest/v1/`. Supabase JS akan mengakses endpoint REST secara otomatis.

## Persiapan Supabase
1. Pastikan tabel dan view dari SQL database sudah dibuat.
2. Pastikan RLS aktif.
3. Buat akun melalui **Authentication → Users → Add user**.
4. Tambahkan baris profil untuk user tersebut di `public.profiles`, dengan `id` sama persis dengan User UID dari Authentication.
5. Isi `nama`, `email`, `role` (ketua/bendahara/amil/viewer), dan `aktif = true`.
6. Login dari aplikasi.

Contoh membuat profil (ganti UUID dan data):
```sql
INSERT INTO public.profiles (id, nama, email, role, aktif)
VALUES ('UUID-AUTH-USER', 'Nama Pengguna', 'email@contoh.com', 'ketua', true);
```

## Jalankan lokal
Buka folder ini dengan server statis, misalnya VS Code Live Server. Hindari membuka `index.html` dengan `file://` jika browser membatasi pemuatan script.

## Hosting Netlify
1. Unggah folder project ke repository GitHub.
2. Di Netlify pilih **Add new site → Import an existing project**.
3. Hubungkan repository GitHub.
4. Build command: kosongkan.
5. Publish directory: `.` (titik).
6. Deploy.

Alternatif: drag-and-drop folder project ke Netlify Deploys.

## Keamanan penting
- Publishable key memang dirancang untuk digunakan pada aplikasi frontend, tetapi hanya aman jika RLS dan policy database benar.
- Jangan pernah memasukkan `service_role` key ke GitHub, HTML, atau JavaScript frontend.
- Semua halaman pada versi ini memerlukan login. Viewer harus diberi role `viewer`; policy database harus mengizinkan akses sesuai rancangan Anda.
- Policy SQL sebelumnya membatasi pembacaan ke role authenticated, sehingga dashboard tidak terbuka untuk pengunjung anonim.
- Versi awal ini belum menyediakan edit/hapus transaksi, ekspor PDF/Excel, kuitansi, atau modul laporan A2/B2/C2A/C2B.
- Sebelum digunakan untuk pencatatan resmi, lakukan pengujian dan validasi laporan dengan bendahara/pengurus UPZ.
