# Dealstack CRM

Aplikasi CRM sederhana untuk monitoring pelanggan, proyek, tugas, dan penjualan.
Frontend murni HTML/CSS/JS (tanpa build tool), database memakai **Supabase**,
siap di-deploy lewat **GitHub + Vercel**.

## Struktur folder

```
├─ index.html          # Halaman utama aplikasi
├─ style.css            # Semua gaya tampilan
├─ script.js             # Logika aplikasi (render + query ke Supabase)
├─ config.example.js     # Contoh file konfigurasi Supabase
├─ config.js             # Konfigurasi Supabase yang aktif dipakai
├─ supabase/
│  └─ schema.sql         # Skema tabel database + data awal
└─ vercel.json           # Konfigurasi deploy Vercel
```

## 1. Siapkan database di Supabase

1. Buat akun/project baru di [supabase.com](https://supabase.com).
2. Di dashboard project, buka menu **SQL Editor** → **New query**.
3. Salin seluruh isi file `supabase/schema.sql`, tempel, lalu klik **Run**.
   Ini akan membuat 4 tabel (`pelanggan`, `proyek`, `tugas`, `aktivitas`),
   mengaktifkan Row Level Security, dan mengisi beberapa data contoh.
4. Buka menu **Project Settings → API**. Catat dua nilai berikut:
   - **Project URL**
   - **anon public key**

## 2. Hubungkan aplikasi ke Supabase

Buka file `config.js`, ganti dua baris berikut dengan nilai dari langkah di atas:

```js
const SUPABASE_URL = 'https://xxxxxxxxxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
```

> **Catatan keamanan:** `anon key` memang dirancang aman untuk dipakai di sisi
> klien (browser) — bukan rahasia seperti `service_role key`. Keamanan data
> sesungguhnya diatur lewat kebijakan **Row Level Security (RLS)** di
> `supabase/schema.sql`. Jangan pernah menaruh `service_role key` di file ini.

Coba buka `index.html` langsung di browser untuk memastikan data pelanggan,
proyek, tugas, dan aktivitas sudah tampil dari Supabase.

### 1b. Jika database Anda sudah pernah dibuat sebelumnya

Menu **Pesan** memakai tabel baru `catatan_tim`. Jika Anda sudah pernah
menjalankan `schema.sql` versi lama, buka **SQL Editor** lagi dan jalankan
HANYA bagian di bawah judul `TAMBAHAN v2` di akhir file `schema.sql` — aman
dijalankan di database yang sudah berisi data, tidak akan menghapus apa pun.
Jika ini instalasi baru, cukup jalankan seluruh `schema.sql` seperti biasa.

### 1c. Mengaktifkan login multi-pengguna (v3)

Versi ini sekarang punya login sungguhan, peran (Admin/Anggota Tim), dan
penugasan tugas ke anggota tertentu. Langkah setup:

1. Di dashboard Supabase, buka **Authentication → Providers**, pastikan
   **Email** aktif (biasanya sudah aktif secara default).
2. Untuk tim internal kecil, buka **Authentication → Settings** dan
   matikan **"Confirm email"** supaya anggota tim bisa langsung masuk
   setelah mendaftar tanpa perlu mengecek email.
3. Di **SQL Editor**, jalankan blok **`TAMBAHAN v3`** di akhir file
   `schema.sql` (jika ini instalasi baru, cukup jalankan seluruh file
   `schema.sql` sekali — v3 sudah termasuk di dalamnya).
4. Buka aplikasi, klik tab **Daftar**, buat akun pertama Anda.
5. Kembali ke SQL Editor, jalankan (ganti dengan email Anda):
   ```sql
   update profil set peran = 'admin' where email = 'email_anda@contoh.com';
   ```
   Keluar dan masuk lagi supaya peran Admin aktif.
6. Anggota tim lain cukup mendaftar sendiri lewat tab **Daftar** — mereka
   otomatis mendapat peran **Anggota Tim**.

**Yang berubah untuk Admin:** bisa melihat & menugaskan semua tugas ke
anggota manapun, melihat semua data, menghapus pelanggan/proyek/tugas,
dan membuka menu **Pengawasan Tim** untuk memantau beban kerja & progres
tiap anggota.

**Yang berubah untuk Anggota Tim:** hanya melihat tugas yang ditugaskan
kepadanya (atau yang ia buat sendiri), bisa mengubah status tugasnya
sendiri (Belum Dikerjakan/Dikerjakan/Review/Selesai), tapi tidak bisa
menghapus data dan tidak melihat menu Pengawasan Tim.

### 1d. Live update & Kelola Pengguna (v5)

Jalankan blok **`TAMBAHAN v5`** di akhir `schema.sql` untuk mengaktifkan:

- **Live update antar pengguna** — saat Admin menambah/mengubah tugas,
  atau ada catatan tim baru, semua pengguna yang sedang online melihat
  perubahan itu seketika tanpa perlu memuat ulang halaman (memakai
  Supabase Realtime).
- **Notifikasi Desktop** — klik ikon gear di topbar → "Aktifkan Notifikasi
  Desktop". Setelah diizinkan browser, Anda akan mendapat notifikasi
  desktop saat ditugaskan tugas baru atau ada catatan tim baru — bahkan
  saat tab Dealstack tidak sedang aktif dilihat.
- **Menu "Kelola Pengguna"** *(khusus Admin)* — mengubah peran anggota
  (Admin ⇄ Anggota Tim) langsung dari aplikasi, tidak perlu lagi membuka
  SQL Editor setelah pengaturan Admin pertama.

## 3. Unggah ke GitHub

```bash
git init
git add .
git commit -m "Inisialisasi Dealstack CRM"
git branch -M main
git remote add origin https://github.com/USERNAME/NAMA-REPO.git
git push -u origin main
```

Ganti `USERNAME/NAMA-REPO` dengan repository GitHub milik Anda.

## 4. Deploy ke Vercel

1. Buka [vercel.com](https://vercel.com) → **Add New... → Project**.
2. Pilih **Import Git Repository**, lalu pilih repo yang baru saja di-push.
3. Karena ini situs statis, Vercel akan otomatis mendeteksi **Other/Static**
   tanpa perlu Build Command atau Output Directory — biarkan kosong/default.
4. Klik **Deploy**. Setelah selesai, aplikasi bisa diakses lewat domain
   `nama-project.vercel.app`.

Setiap kali Anda `git push` ke branch `main`, Vercel otomatis men-deploy ulang.

## Fitur aplikasi

- **Ringkasan** — KPI (total nilai, rata-rata, tingkat menang, jumlah proyek)
  dihitung otomatis dari data proyek di database, header ringkas jumlah
  pelanggan aktif & proyek berjalan, aksi favorit/bagikan tautan/unduh CSV,
  dan grafik dengan rentang waktu, mode layar penuh, kisi, bandingkan
  periode, dan unduh sebagai PNG.
- **Pelanggan** — tambah, cari, filter status, dan hapus pelanggan.
- **Proyek** — tambah proyek, ubah status langsung (Berjalan/Tertunda/
  Selesai/Dibatalkan), progres, dan hapus proyek.
- **Pesan** — papan catatan/pengumuman internal tim (memerlukan migrasi
  tabel `catatan_tim`, lihat langkah 1b di bawah).
- **Kalender** — tenggat proyek & tugas otomatis ditampilkan per bulan,
  lengkap dengan agenda harian.
- **Analitik** — corong penjualan berdasarkan nilai & jumlah proyek per tahap.
- **Laporan** — ringkasan performa per industri & status, bisa diunduh
  sebagai CSV atau dicetak.
- **Aktivitas** — log otomatis setiap ada perubahan status/proyek baru.
- **Tugas** — tambah tugas, tugaskan ke anggota tertentu, atur prioritas
  & tenggat, ubah status bertahap (Belum Dikerjakan/Dikerjakan/Review/
  Selesai).
- **Pengawasan Tim** *(khusus Admin)* — beban kerja & progres tiap
  anggota tim, termasuk jumlah tugas terlambat.
- **Kelola Pengguna** *(khusus Admin)* — ubah peran anggota langsung dari
  aplikasi.
- **Integrasi** — status koneksi database Supabase (bisa diuji langsung),
  serta daftar integrasi pihak ketiga yang direncanakan (Slack, WhatsApp,
  Google Calendar).
- **Pusat Bantuan** — FAQ penggunaan aplikasi.
- **Login multi-pengguna** — Admin dan Anggota Tim, lihat langkah 1c di
  bawah untuk aktivasi.
- **Live update & Notifikasi Desktop** — perubahan tugas/catatan tim
  langsung tersinkron ke semua pengguna yang online, lihat langkah 1d.
- **Jejak audit** — menu Aktivitas kini mencatat siapa yang melakukan
  setiap perubahan (pelanggan, proyek, tugas, dan perubahan peran).
- **Notifikasi & Pencarian Global** — ikon lonceng menampilkan proyek/tugas
  yang jatuh tempo dalam 3 hari; kolom pencarian di topbar mencari lintas
  pelanggan, proyek, dan tugas sekaligus.

> **Catatan:** Fondasi multi-user (login, peran, penugasan tugas per
> anggota, dashboard pengawasan, live update, dan notifikasi desktop)
> sudah aktif di versi ini — lihat langkah 1c dan 1d. Notifikasi email
> (lewat SMTP/Resend dsb.) belum termasuk karena membutuhkan Supabase Edge
> Function terpisah di luar cakupan frontend statis ini.

## Menjalankan secara lokal

Karena `fetch`/modul Supabase memerlukan HTTP (bukan `file://`), jalankan
lewat server lokal sederhana, misalnya:

```bash
npx serve .
# atau
python3 -m http.server 8080
```

Lalu buka `http://localhost:8080` (atau port yang muncul) di browser.
