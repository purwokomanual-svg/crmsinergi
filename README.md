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

### 1e. Edit Profil, Foto Profil & Logo Perusahaan (v6)

Jalankan blok **`TAMBAHAN v6`** di akhir `schema.sql` untuk mengaktifkan
menu **Pengaturan** (ikon gear di topbar → "Edit Profil & Perusahaan",
atau menu **Pengaturan** di sidebar):

- **Profil Saya** *(semua pengguna)* — ganti foto profil, nama, jabatan,
  telepon, dan kata sandi. Email & peran ditampilkan (tidak bisa diubah
  sendiri).
- **Profil Perusahaan** *(khusus Admin)* — ganti logo dan nama perusahaan
  yang tampil di sidebar, layar masuk, dan laporan tercetak untuk seluruh
  pengguna.

Blok ini juga membuat dua **Storage bucket publik** di Supabase secara
otomatis: `avatars` (foto profil) dan `logo-perusahaan` (logo perusahaan).
Tidak perlu membuatnya manual lewat dashboard — cukup jalankan SQL-nya.
Jika Anda belum pernah mengaktifkan fitur Storage di project Supabase,
buka menu **Storage** di dashboard sekali saja agar layanan Storage aktif,
baru jalankan migrasi v6.

### 1f. Data kontak Pelanggan & Total Nilai Proyek otomatis (v7)

Jalankan blok **`TAMBAHAN v7`** di akhir `schema.sql` untuk mengaktifkan
susunan kolom baru pada menu **Pelanggan**:

`ID Pelanggan · Nama Pelanggan · Industri · Alamat · No Telepon ·
No WhatsApp · Nama PIC · Total Nilai Proyek · Aksi (Edit/Hapus)`

- **Alamat, No Telepon, No WhatsApp, Nama PIC** — kolom kontak baru,
  diisi lewat tombol **Edit** (ikon pensil) di setiap baris pelanggan.
- **Total Nilai Proyek** — dihitung **otomatis** dari total nilai semua
  proyek milik pelanggan tersebut (bukan lagi diisi manual). Gunakan
  dropdown di atas tabel untuk memilih cakupan: **Semua, Berjalan,
  Tertunda, Selesai,** atau **Dibatalkan** — angka di setiap baris akan
  menyesuaikan sesuai status proyek yang dipilih.
- Form **Tambah Proyek** kini memilih pelanggan lewat **dropdown**
  (bukan mengetik nama manual) agar setiap proyek selalu tertaut ke
  data pelanggan yang benar — ini yang membuat Total Nilai Proyek
  akurat dan tersinkron dengan database.
- Migrasi ini juga otomatis menautkan ulang proyek lama (yang dibuat
  sebelum v7) ke pelanggan yang cocok berdasarkan nama, sekali jalan,
  jadi Total Nilai Proyek tetap benar untuk data yang sudah ada.

### 1g. Proyek sebagai PO (Purchase Order) & Anggaran (v8)

Jalankan blok **`TAMBAHAN v8`** di akhir `schema.sql` untuk mengaktifkan
susunan kolom baru pada menu **Proyek**:

`No PO · Nama Pelanggan · Tanggal · Tenggat · Dibuat Oleh · Sub Total ·
Tax · Dana Lainnya · Grand Total · Total Budget · Budget Terpakai ·
% Budget · Aksi (Edit/Hapus)`

- **No PO** memakai kode proyek yang sudah ada (format baru `PO-xxxx`
  untuk proyek baru; proyek lama tetap memakai kode `PR-xxxx`-nya).
- **Nama Pelanggan** tetap dipilih lewat dropdown (tersinkron dengan
  menu Pelanggan) — bukan diketik manual, supaya Total Nilai Proyek
  di menu Pelanggan selalu akurat.
- **Dibuat Oleh** diisi otomatis dari akun yang membuat proyek, tidak
  bisa diubah lewat form.
- **Grand Total** = Sub Total + (Sub Total × Tax%) + Dana Lainnya,
  dihitung otomatis dan tampil langsung saat mengisi form.
- **% Budget** = Budget Terpakai ÷ Total Budget × 100, dihitung
  otomatis di tabel maupun form.
- Status proyek (Berjalan/Tertunda/Selesai/Dibatalkan) sekarang diatur
  lewat tombol **Edit**, bukan dropdown langsung di tabel, karena tabel
  sudah padat dengan kolom keuangan di atas.
- Migrasi ini mengisi `tanggal` dan `sub_total`/`grand_total` proyek
  lama dari data yang sudah ada, jadi data lama tidak hilang.

### 1h. ID Pelanggan & No PO input manual (v9)

Tidak perlu migrasi SQL tambahan untuk bagian ini (kolom `kode` yang
dipakai sudah ada sejak awal). Perubahannya ada di formulir:

- **ID Pelanggan** (menu Pelanggan) dan **No PO** (menu Proyek) kini
  jadi kolom input terpisah yang **bisa diisi manual**, misalnya sesuai
  format penomoran internal perusahaan Anda (contoh: `CL-2049`,
  `PO-2026-0001`).
- Saat klik **Tambah**, sistem tetap menyarankan ID/No PO otomatis
  supaya Anda tidak mulai dari kosong, tapi nilainya bebas diubah
  sebelum disimpan.
- Nilai ini juga bisa diedit lagi lewat tombol **Edit**.
- ID Pelanggan dan No PO harus **unik** — jika sudah dipakai baris
  lain, aplikasi akan menampilkan pesan agar Anda memakai nilai lain.

## 1i. Monitoring Proyek dipindah ke halaman Detail Pelanggan

Tidak perlu migrasi SQL untuk perubahan ini. Menu **Proyek** yang berdiri
sendiri di sidebar sudah **dihapus**. Sebagai gantinya:

- Di menu **Pelanggan**, klik **nama pelanggan** mana pun untuk membuka
  halaman **Detail Pelanggan** — berisi info kontak pelanggan tersebut
  beserta **seluruh PO/proyek miliknya** dalam satu tabel (No PO, tanggal,
  tenggat, dibuat oleh, Sub Total, Tax, Dana Lainnya, Grand Total, Total
  Budget, Budget Terpakai, % Budget).
- Tombol **Tambah Proyek** di halaman ini otomatis menautkan proyek baru
  ke pelanggan yang sedang dibuka (kolom Nama Pelanggan terkunci).
- Edit/hapus proyek, pencarian, dan filter status tetap tersedia — hanya
  lingkupnya kini per pelanggan, bukan tabel global.
- Hasil pencarian global untuk proyek dan tombol **Edit** di kolom Aksi
  akan langsung membuka halaman Detail Pelanggan yang bersangkutan.
- Perubahan ini murni pada `index.html`, `style.css`, dan `script.js` —
  tidak menghapus data proyek apa pun, hanya mengubah cara menampilkannya
  agar monitoring pelanggan ⇄ proyek lebih efisien dalam satu tempat.

## 1j. Stock & Gudang — pengelolaan stok multi-gudang (v10)

Jalankan blok **`TAMBAHAN v10`** di akhir `schema.sql` untuk mengaktifkan
menu **Stock & Gudang** (kelompok sidebar **Penjualan & Operasional**):

`SKU · Nama Produk · Variant · Kategori · Gudang · Stok Masuk ·
Stok Keluar · Sisa Stok · Update Terakhir · Diupdate Oleh · Status ·
Aksi (Tambah Stok/Edit/Hapus)`

- **Desain multi-gudang** — satu SKU boleh punya baris stok terpisah di
  tiap gudang (mis. "Kabel LAN Cat6" bisa berbeda jumlah stoknya di
  Gudang Surabaya vs Gudang Jakarta). Gunakan tombol **Kelola Gudang**
  untuk menambah/menghapus lokasi gudang.
- **Stok Masuk & Stok Keluar bersifat akumulatif dan tidak diedit
  langsung** — Stok Masuk dicatat lewat halaman **Detail Stok Masuk**
  (klik angkanya, lihat langkah 1l); Stok Keluar dicatat lewat halaman
  **Detail Stok Keluar** (klik angkanya, lihat langkah 1k). Ini menjaga
  angka Sisa Stok selalu konsisten dan setiap pergerakan tercatat
  sebagai riwayat (tabel `riwayat_stok`), bukan angka yang bisa ditimpa
  sembarangan.
- **Status otomatis** — dihitung sistem dari Sisa Stok dibanding "Stok
  Minimum" yang diisi saat menambah/edit item: **Tersedia**, **Stok
  Menipis**, atau **Stok Habis**. Admin juga bisa menandai item
  **Nonaktif** (produk dihentikan) lewat form Edit.
- **Satuan** — setiap item punya satuan default (mis. Pcs/Meter/Box),
  diisi lewat form Tambah/Edit Item, dipakai sebagai isian awal saat
  mencatat stok keluar.
- **Notifikasi otomatis** — item yang stoknya menipis/habis muncul di
  ikon lonceng topbar dan badge merah di menu sidebar, serta memicu
  Notifikasi Desktop (jika diaktifkan) saat stok baru saja habis.
- Kartu ringkasan di atas tabel menampilkan total item, jumlah gudang,
  serta jumlah item menipis/habis. Toolbar mendukung pencarian,
  filter per gudang/kategori/status, dan unduh CSV.
- Menghapus item atau gudang memakai tombol **Hapus** (khusus Admin
  sesuai kebijakan RLS) — gudang yang masih memiliki item stok tidak
  bisa dihapus sampai item di dalamnya dipindahkan/dihapus dulu.

## 1k. Detail Stok Keluar per produk (v11)

Jalankan blok **`TAMBAHAN v11`** di akhir `schema.sql` untuk mengaktifkan
halaman detail yang terbuka saat mengklik angka **Stok Keluar** pada
sebuah baris di menu **Stock & Gudang**:

`Tanggal Keluar · No DO · Nama Pelanggan · No PO · Nama Proyek · Qty ·
Satuan · Catatan · Aksi (Edit/Hapus)`

- **Satu sumber kebenaran** — detail ini disimpan di tabel `riwayat_stok`
  yang sama dipakai untuk menghitung akumulasi Stok Keluar, jadi
  angka di tabel utama Stock & Gudang selalu sinkron dengan riwayat
  di halaman detail (tambah/edit/hapus di sini otomatis menyesuaikan
  Stok Keluar & Sisa Stok pada kartu produk).
- **Nama Pelanggan & Nama Proyek** dipilih lewat dropdown (tersinkron
  dengan menu Pelanggan & Proyek) — memilih proyek otomatis mengisi
  **No PO** dari kode proyek tersebut. Jika transaksi belum punya
  pelanggan/proyek terdaftar di sistem, pilih opsi "Ketik nama lain..."
  untuk mengisi manual.
- **Validasi otomatis** — sistem menolak penyimpanan jika Qty yang
  diisi membuat Sisa Stok menjadi negatif.
- Tombol **Tambah Stok Keluar** di halaman ini, kolom pencarian
  (No DO/Pelanggan/No PO/Proyek), dan unduh CSV khusus riwayat produk
  tersebut tersedia di toolbar.
- Menghapus baris riwayat khusus Admin (sesuai kebijakan RLS), Edit
  dapat dilakukan oleh siapa pun yang login.
- Modal **Tambah Stok** cepat di tabel utama sekarang khusus untuk
  **Stok Masuk** — mencatat pengiriman keluar selalu lewat halaman
  detail ini supaya No DO/Pelanggan/No PO/Proyek selalu terisi.

## 1l. Detail Stok Masuk per produk (v12)

Jalankan blok **`TAMBAHAN v12`** di akhir `schema.sql` untuk mengaktifkan
halaman detail yang terbuka saat mengklik angka **Stok Masuk** pada
sebuah baris di menu **Stock & Gudang**:

`Tanggal Masuk · No DO · Nama Vendor · No PO · Qty · Satuan ·
Status (Baru, Bekas, Rusak) · Catatan · Aksi (Edit/Hapus)`

- **Satu sumber kebenaran** — sama seperti Detail Stok Keluar (v11),
  detail ini disimpan di tabel `riwayat_stok` yang sama dipakai untuk
  menghitung akumulasi Stok Masuk, jadi angka di tabel utama
  Stock & Gudang selalu sinkron dengan riwayat di halaman detail
  (tambah/edit/hapus di sini otomatis menyesuaikan Stok Masuk & Sisa
  Stok pada kartu produk).
- **Nama Vendor** diisi bebas (teks), tapi form menyarankan nama
  vendor yang sudah pernah dipakai lewat autocomplete — jadi
  penulisan tetap konsisten tanpa perlu mengelola daftar vendor
  terpisah.
- **Status kondisi barang** — setiap penerimaan wajib ditandai
  **Baru**, **Bekas**, atau **Rusak** (default Baru), berguna untuk
  melacak retur/barang bekas pakai dan barang cacat saat diterima.
- **Validasi otomatis** — sistem menolak edit/hapus riwayat stok
  masuk jika perubahan tersebut membuat Sisa Stok menjadi negatif
  (karena stok keluar yang sudah tercatat lebih besar dari stok
  masuk yang tersisa).
- Tombol **Tambah Stok Masuk** di halaman ini menggantikan modal
  cepat sebelumnya (yang hanya mencatat jumlah) — sekarang setiap
  penerimaan barang selalu lengkap dengan No DO/Vendor/No PO/Status.
  Kolom pencarian (No DO/Vendor/No PO/Catatan), filter Status, dan
  unduh CSV khusus riwayat produk tersebut tersedia di toolbar.
- Menghapus baris riwayat khusus Admin (sesuai kebijakan RLS), Edit
  dapat dilakukan oleh siapa pun yang login — sama seperti Detail
  Stok Keluar.

## Perbaikan Tata Letak (Audit UI/UX)

Tidak perlu migrasi database untuk perubahan ini — murni perbaikan
`index.html`, `style.css`, dan `script.js`:

- **Modal Proyek (dan modal panjang lainnya)** — tombol **Simpan**
  sekarang selalu terlihat dan tidak ikut ter-scroll. Hanya area
  kolom input yang bisa di-scroll di dalam modal; judul dan tombol
  Simpan/Batal tetap pada tempatnya.
- **Dropdown/filter (mis. filter status, filter urutan)** — opsi
  pilihan sekarang dipaksa memakai warna latar gelap sesuai tema
  aplikasi, supaya tulisan opsi tidak lagi putih-di-atas-putih atau
  tidak terbaca saat dropdown dibuka.
- **Tampilan mobile** — sebelumnya menu sidebar benar-benar
  hilang tanpa cara membukanya di layar sempit. Sekarang ada tombol
  ikon garis tiga (☰) di pojok kiri atas yang membuka sidebar sebagai
  panel geser (drawer) dengan latar gelap di belakangnya; sidebar
  otomatis tertutup lagi setelah memilih menu.

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
- **Pelanggan** — tambah, edit, cari, dan hapus pelanggan, lengkap
  dengan data kontak (alamat, no. telepon, no. WhatsApp, nama PIC) dan
  Total Nilai Proyek otomatis yang bisa disaring per status proyek,
  lihat langkah 1f. Klik nama pelanggan untuk membuka **Detail
  Pelanggan** berisi seluruh proyek (PO) miliknya, lihat langkah 1i.
- **Proyek (di halaman Detail Pelanggan)** — dikelola sebagai PO
  (Purchase Order): No PO, tanggal, tenggat, dibuat oleh, rincian Sub
  Total/Tax/Dana Lainnya/Grand Total, serta Total Budget, Budget
  Terpakai, dan % Budget — semua dihitung otomatis. Tambah, edit, dan
  hapus PO langsung dari halaman pelanggan terkait, lihat langkah 1g
  dan 1i.
- **Pesan** — papan catatan/pengumuman internal tim (memerlukan migrasi
  tabel `catatan_tim`, lihat langkah 1b di bawah).
- **Stock & Gudang** — kartu stok per SKU di setiap gudang (Sisa Stok,
  status Tersedia/Menipis/Habis otomatis, riwayat pergerakan stok
  masuk/keluar), lihat langkah 1j. Klik angka **Stok Masuk** untuk
  membuka detail penerimaan barang per transaksi (No DO, Vendor, No PO,
  Status Baru/Bekas/Rusak), lihat langkah 1l. Klik angka **Stok Keluar**
  untuk membuka detail pengiriman per transaksi (No DO, Pelanggan, No PO,
  Proyek), lihat langkah 1k.
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
- **Pengaturan: Profil Saya & Profil Perusahaan** — setiap pengguna dapat
  mengganti foto profil, nama, jabatan, telepon, dan kata sandi sendiri;
  Admin juga dapat mengganti logo dan nama perusahaan yang tampil di
  sidebar, layar masuk, dan laporan tercetak, lihat langkah 1e.

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
