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
  dihitung otomatis dari data proyek di database.
- **Pelanggan** — tambah, cari, filter status, dan hapus pelanggan.
- **Proyek** — tambah proyek, ubah status langsung (Berjalan/Tertunda/
  Selesai/Dibatalkan), progres, dan hapus proyek.
- **Analitik** — corong penjualan berdasarkan nilai & jumlah proyek per tahap.
- **Aktivitas** — log otomatis setiap ada perubahan status/proyek baru.
- **Tugas** — checklist tugas tim penjualan.

## Menjalankan secara lokal

Karena `fetch`/modul Supabase memerlukan HTTP (bukan `file://`), jalankan
lewat server lokal sederhana, misalnya:

```bash
npx serve .
# atau
python3 -m http.server 8080
```

Lalu buka `http://localhost:8080` (atau port yang muncul) di browser.
