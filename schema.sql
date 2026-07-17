-- =========================================================
-- DEALSTACK CRM — SKEMA DATABASE SUPABASE
-- Cara pakai: buka project Supabase > SQL Editor > tempel
-- seluruh isi file ini > klik "Run".
-- =========================================================

-- Aktifkan ekstensi untuk generate UUID (biasanya sudah aktif di Supabase)
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- TABEL: pelanggan
-- ---------------------------------------------------------
create table if not exists pelanggan (
  id uuid primary key default gen_random_uuid(),
  kode text unique not null,
  nama text not null,
  industri text default 'Umum',
  status text not null default 'aktif' check (status in ('aktif','tertunda','nonaktif')),
  nilai bigint not null default 0,
  kontak_terakhir date default now(),
  dibuat_pada timestamptz default now()
);

-- ---------------------------------------------------------
-- TABEL: proyek
-- ---------------------------------------------------------
create table if not exists proyek (
  id uuid primary key default gen_random_uuid(),
  kode text unique not null,
  nama text not null,
  pelanggan_id uuid references pelanggan(id) on delete cascade,
  pelanggan_nama text not null,
  status text not null default 'berjalan' check (status in ('berjalan','tertunda','selesai','dibatalkan')),
  progres int not null default 0 check (progres between 0 and 100),
  nilai bigint not null default 0,
  tenggat date,
  dibuat_pada timestamptz default now()
);

-- ---------------------------------------------------------
-- TABEL: tugas
-- ---------------------------------------------------------
create table if not exists tugas (
  id uuid primary key default gen_random_uuid(),
  judul text not null,
  selesai boolean not null default false,
  tenggat text,
  dibuat_pada timestamptz default now()
);

-- ---------------------------------------------------------
-- TABEL: aktivitas (log riwayat)
-- ---------------------------------------------------------
create table if not exists aktivitas (
  id uuid primary key default gen_random_uuid(),
  tipe text not null default 'proyek' check (tipe in ('proyek','pelanggan','tugas')),
  teks text not null,
  dibuat_pada timestamptz default now()
);

-- ---------------------------------------------------------
-- ROW LEVEL SECURITY
-- Catatan keamanan: kebijakan di bawah ini mengizinkan akses
-- baca & tulis publik (lewat anon key) agar aplikasi bisa
-- langsung berjalan tanpa sistem login. Cocok untuk internal
-- tool / prototipe. Jika aplikasi akan dipakai banyak orang
-- dari luar tim, tambahkan Supabase Auth dan ganti kebijakan
-- "true" di bawah dengan pengecekan auth.uid().
-- ---------------------------------------------------------
alter table pelanggan enable row level security;
alter table proyek enable row level security;
alter table tugas enable row level security;
alter table aktivitas enable row level security;

create policy "publik dapat membaca pelanggan" on pelanggan for select using (true);
create policy "publik dapat menambah pelanggan" on pelanggan for insert with check (true);
create policy "publik dapat mengubah pelanggan" on pelanggan for update using (true);
create policy "publik dapat menghapus pelanggan" on pelanggan for delete using (true);

create policy "publik dapat membaca proyek" on proyek for select using (true);
create policy "publik dapat menambah proyek" on proyek for insert with check (true);
create policy "publik dapat mengubah proyek" on proyek for update using (true);
create policy "publik dapat menghapus proyek" on proyek for delete using (true);

create policy "publik dapat membaca tugas" on tugas for select using (true);
create policy "publik dapat menambah tugas" on tugas for insert with check (true);
create policy "publik dapat mengubah tugas" on tugas for update using (true);
create policy "publik dapat menghapus tugas" on tugas for delete using (true);

create policy "publik dapat membaca aktivitas" on aktivitas for select using (true);
create policy "publik dapat menambah aktivitas" on aktivitas for insert with check (true);

-- ---------------------------------------------------------
-- DATA AWAL (SEED) — sama seperti versi demo sebelumnya
-- ---------------------------------------------------------
insert into pelanggan (kode, nama, industri, status, nilai, kontak_terakhir) values
  ('CL-2049', 'Northshore Corp.', 'Energi', 'aktif', 340000, '2025-12-14'),
  ('CL-1882', 'Meridian Retailindo', 'Retail', 'aktif', 128000, '2025-12-10'),
  ('CL-1745', 'Cakrawala Logistik', 'Logistik', 'tertunda', 76000, '2025-11-29'),
  ('CL-1690', 'Bintang Manufaktur', 'Manufaktur', 'aktif', 214000, '2025-12-02'),
  ('CL-1522', 'Nusantara FinTech', 'Keuangan', 'nonaktif', 54000, '2025-10-18')
on conflict (kode) do nothing;

insert into proyek (kode, nama, pelanggan_nama, status, progres, nilai, tenggat) values
  ('PR-501', 'Migrasi Sistem ERP', 'Northshore Corp.', 'berjalan', 68, 340000, '2026-01-20'),
  ('PR-498', 'Implementasi POS Cabang', 'Meridian Retailindo', 'berjalan', 42, 128000, '2026-02-05'),
  ('PR-475', 'Optimasi Rute Armada', 'Cakrawala Logistik', 'tertunda', 15, 76000, '2026-01-10'),
  ('PR-460', 'Otomasi Lini Produksi', 'Bintang Manufaktur', 'selesai', 100, 214000, '2025-12-01'),
  ('PR-432', 'Audit Keamanan Data', 'Nusantara FinTech', 'dibatalkan', 20, 54000, '2025-11-15'),
  ('PR-509', 'Dashboard Analitik Penjualan', 'Northshore Corp.', 'berjalan', 25, 92000, '2026-03-01')
on conflict (kode) do nothing;

insert into tugas (judul, selesai, tenggat) values
  ('Kirim proposal revisi ke Northshore Corp.', false, '12 Jul'),
  ('Follow up pembayaran termin 2 - Meridian', false, '13 Jul'),
  ('Jadwalkan demo produk - Cakrawala Logistik', true, '9 Jul'),
  ('Update kontrak - Bintang Manufaktur', true, '8 Jul'),
  ('Siapkan laporan performa Q3', false, '15 Jul');

insert into aktivitas (tipe, teks) values
  ('proyek', 'Progres proyek <b>Migrasi Sistem ERP</b> diperbarui menjadi 68%'),
  ('pelanggan', 'Pelanggan baru <b>Bintang Manufaktur</b> ditambahkan ke sistem'),
  ('tugas', 'Tugas <b>Jadwalkan demo produk</b> ditandai selesai'),
  ('proyek', 'Proyek <b>Audit Keamanan Data</b> dibatalkan oleh klien'),
  ('pelanggan', 'Kontak dengan <b>Meridian Retailindo</b> diperbarui');

-- =========================================================
-- TAMBAHAN v2 — TABEL CATATAN TIM (dipakai oleh menu "Pesan")
-- Jika database Anda sudah pernah menjalankan skema di atas
-- sebelumnya, Anda cukup salin & jalankan HANYA blok di bawah
-- ini di SQL Editor. Aman dijalankan ulang di database lama,
-- tidak akan menghapus data yang sudah ada.
-- =========================================================
create table if not exists catatan_tim (
  id uuid primary key default gen_random_uuid(),
  isi text not null,
  dibuat_oleh text not null default 'Admin',
  dibuat_pada timestamptz default now()
);

alter table catatan_tim enable row level security;

create policy "publik dapat membaca catatan tim" on catatan_tim for select using (true);
create policy "publik dapat menambah catatan tim" on catatan_tim for insert with check (true);
create policy "publik dapat menghapus catatan tim" on catatan_tim for delete using (true);

insert into catatan_tim (isi, dibuat_oleh) values
  ('Selamat datang di Dealstack! Gunakan halaman ini untuk pengumuman dan catatan internal tim penjualan.', 'Sistem');

-- =========================================================
-- TAMBAHAN v3 — MULTI-USER (LOGIN, PERAN, PENUGASAN TUGAS)
-- Jalankan SELURUH blok ini SEKALI di SQL Editor Supabase.
-- SEBELUM menjalankan: buka Authentication > Providers di dashboard
-- Supabase Anda, pastikan "Email" aktif. Untuk tim internal kecil,
-- sebaiknya matikan "Confirm email" di Authentication > Settings
-- supaya anggota tim bisa langsung login setelah mendaftar tanpa
-- perlu mengecek kotak masuk email.
-- =========================================================

-- ---- Tabel profil (1 baris per pengguna yang login) ----
create table if not exists profil (
  id uuid primary key references auth.users(id) on delete cascade,
  nama text not null,
  email text not null,
  peran text not null default 'anggota' check (peran in ('admin','anggota')),
  dibuat_pada timestamptz default now()
);
alter table profil enable row level security;
create policy "pengguna login dapat membaca semua profil" on profil for select using (auth.uid() is not null);
create policy "pengguna dapat memperbarui profil sendiri" on profil for update using (auth.uid() = id);

-- ---- Trigger: otomatis buat baris profil saat ada pengguna baru mendaftar ----
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profil (id, nama, email, peran)
  values (new.id, coalesce(new.raw_user_meta_data->>'nama', split_part(new.email,'@',1)), new.email, 'anggota');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---- Jadikan diri Anda admin ----
-- Daftar dulu 1 akun lewat aplikasi (menu Daftar), lalu jalankan baris di
-- bawah ini SENDIRI (ganti email) untuk menjadikannya Admin pertama:
-- update profil set peran = 'admin' where email = 'email_anda@contoh.com';

-- ---- Perluas tabel tugas: penugasan, prioritas, status bertahap ----
alter table tugas add column if not exists ditugaskan_ke uuid references profil(id) on delete set null;
alter table tugas add column if not exists ditugaskan_oleh uuid references profil(id) on delete set null;
alter table tugas add column if not exists deskripsi text;
alter table tugas add column if not exists prioritas text not null default 'normal' check (prioritas in ('rendah','normal','tinggi'));
alter table tugas add column if not exists status_kerja text not null default 'belum' check (status_kerja in ('belum','dikerjakan','review','selesai'));
update tugas set status_kerja = 'selesai' where selesai = true and status_kerja = 'belum';

-- ---- Perketat RLS: wajib login, bukan lagi bebas publik ----
drop policy if exists "publik dapat membaca pelanggan" on pelanggan;
drop policy if exists "publik dapat menambah pelanggan" on pelanggan;
drop policy if exists "publik dapat mengubah pelanggan" on pelanggan;
drop policy if exists "publik dapat menghapus pelanggan" on pelanggan;
create policy "pengguna login dapat membaca pelanggan" on pelanggan for select using (auth.uid() is not null);
create policy "pengguna login dapat menambah pelanggan" on pelanggan for insert with check (auth.uid() is not null);
create policy "pengguna login dapat mengubah pelanggan" on pelanggan for update using (auth.uid() is not null);
create policy "hanya admin dapat menghapus pelanggan" on pelanggan for delete using (
  exists (select 1 from profil where id = auth.uid() and peran = 'admin'));

drop policy if exists "publik dapat membaca proyek" on proyek;
drop policy if exists "publik dapat menambah proyek" on proyek;
drop policy if exists "publik dapat mengubah proyek" on proyek;
drop policy if exists "publik dapat menghapus proyek" on proyek;
create policy "pengguna login dapat membaca proyek" on proyek for select using (auth.uid() is not null);
create policy "pengguna login dapat menambah proyek" on proyek for insert with check (auth.uid() is not null);
create policy "pengguna login dapat mengubah proyek" on proyek for update using (auth.uid() is not null);
create policy "hanya admin dapat menghapus proyek" on proyek for delete using (
  exists (select 1 from profil where id = auth.uid() and peran = 'admin'));

drop policy if exists "publik dapat membaca tugas" on tugas;
drop policy if exists "publik dapat menambah tugas" on tugas;
drop policy if exists "publik dapat mengubah tugas" on tugas;
drop policy if exists "publik dapat menghapus tugas" on tugas;
create policy "lihat tugas sendiri atau semua jika admin" on tugas for select using (
  auth.uid() is not null and (
    ditugaskan_ke = auth.uid() or ditugaskan_oleh = auth.uid() or ditugaskan_ke is null or
    exists (select 1 from profil where id = auth.uid() and peran = 'admin')
  ));
create policy "pengguna login dapat menambah tugas" on tugas for insert with check (auth.uid() is not null);
create policy "pemilik tugas atau admin dapat mengubah tugas" on tugas for update using (
  auth.uid() is not null and (
    ditugaskan_ke = auth.uid() or ditugaskan_oleh = auth.uid() or
    exists (select 1 from profil where id = auth.uid() and peran = 'admin')
  ));
create policy "hanya admin dapat menghapus tugas" on tugas for delete using (
  exists (select 1 from profil where id = auth.uid() and peran = 'admin'));

drop policy if exists "publik dapat membaca aktivitas" on aktivitas;
drop policy if exists "publik dapat menambah aktivitas" on aktivitas;
create policy "pengguna login dapat membaca aktivitas" on aktivitas for select using (auth.uid() is not null);
create policy "pengguna login dapat menambah aktivitas" on aktivitas for insert with check (auth.uid() is not null);

drop policy if exists "publik dapat membaca catatan tim" on catatan_tim;
drop policy if exists "publik dapat menambah catatan tim" on catatan_tim;
drop policy if exists "publik dapat menghapus catatan tim" on catatan_tim;
create policy "pengguna login dapat membaca catatan tim" on catatan_tim for select using (auth.uid() is not null);
create policy "pengguna login dapat menambah catatan tim" on catatan_tim for insert with check (auth.uid() is not null);
create policy "pengguna login dapat menghapus catatan tim" on catatan_tim for delete using (auth.uid() is not null);

-- =========================================================
-- TAMBAHAN v4 — JEJAK AUDIT (siapa melakukan apa)
-- Jalankan blok ini di SQL Editor setelah v3 aktif.
-- =========================================================
alter table aktivitas add column if not exists pelaku_id uuid references profil(id) on delete set null;
alter table aktivitas add column if not exists pelaku_nama text;

-- =========================================================
-- TAMBAHAN v5 — REALTIME LIVE UPDATE & KELOLA PENGGUNA
-- Jalankan blok ini di SQL Editor setelah v3/v4 aktif.
-- =========================================================

-- Aktifkan replikasi realtime supaya perubahan tugas/aktivitas/catatan
-- langsung muncul di layar pengguna lain tanpa perlu memuat ulang halaman.
do $$
begin
  begin
    alter publication supabase_realtime add table tugas;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table aktivitas;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table catatan_tim;
  exception when duplicate_object then null;
  end;
end $$;

-- Izinkan Admin mengubah peran pengguna lain (menu "Kelola Pengguna")
drop policy if exists "pengguna dapat memperbarui profil sendiri" on profil;
create policy "pengguna memperbarui profil sendiri atau admin mengubah siapapun" on profil for update using (
  auth.uid() = id or exists (select 1 from profil p where p.id = auth.uid() and p.peran = 'admin')
);

-- Izinkan jenis aktivitas baru "pengguna" (dipakai saat mengubah peran anggota)
alter table aktivitas drop constraint if exists aktivitas_tipe_check;
alter table aktivitas add constraint aktivitas_tipe_check check (tipe in ('proyek','pelanggan','tugas','pengguna'));

-- =========================================================
-- TAMBAHAN v6 — EDIT PROFIL, FOTO PROFIL & IDENTITAS PERUSAHAAN
-- Jalankan blok ini di SQL Editor setelah v3/v5 aktif untuk
-- mengaktifkan menu Pengaturan > "Profil Saya" dan
-- "Profil Perusahaan" (logo + nama perusahaan) di aplikasi.
-- =========================================================

-- ---- Perluas tabel profil: foto, jabatan, telepon ----
alter table profil add column if not exists avatar_url text;
alter table profil add column if not exists jabatan text;
alter table profil add column if not exists telepon text;

-- ---- Tabel pengaturan_perusahaan (1 baris tunggal, id selalu 1) ----
create table if not exists pengaturan_perusahaan (
  id smallint primary key default 1 check (id = 1),
  nama_perusahaan text not null default 'Dealstack',
  logo_url text,
  diperbarui_pada timestamptz default now(),
  diperbarui_oleh uuid references profil(id) on delete set null
);
insert into pengaturan_perusahaan (id, nama_perusahaan)
  values (1, 'Dealstack') on conflict (id) do nothing;

alter table pengaturan_perusahaan enable row level security;
drop policy if exists "publik dapat membaca pengaturan perusahaan" on pengaturan_perusahaan;
create policy "publik dapat membaca pengaturan perusahaan" on pengaturan_perusahaan
  for select using (true); -- disengaja: logo & nama perusahaan tampil juga di layar masuk (belum login)
drop policy if exists "hanya admin dapat mengubah pengaturan perusahaan" on pengaturan_perusahaan;
create policy "hanya admin dapat mengubah pengaturan perusahaan" on pengaturan_perusahaan
  for update using (exists (select 1 from profil where id = auth.uid() and peran = 'admin'));
drop policy if exists "hanya admin dapat menambah pengaturan perusahaan" on pengaturan_perusahaan;
create policy "hanya admin dapat menambah pengaturan perusahaan" on pengaturan_perusahaan
  for insert with check (exists (select 1 from profil where id = auth.uid() and peran = 'admin'));

-- Ikutkan di Realtime supaya perubahan logo/nama perusahaan oleh Admin
-- langsung tersinkron ke semua pengguna yang online.
do $$
begin
  begin
    alter publication supabase_realtime add table pengaturan_perusahaan;
  exception when duplicate_object then null;
  end;
end $$;

-- ---- Storage bucket "avatars": foto profil tiap pengguna ----
-- Berkas WAJIB diunggah dengan path "<user_id>/namafile.ext" (aplikasi
-- Dealstack sudah melakukan ini secara otomatis) supaya kebijakan di
-- bawah bisa memastikan pengguna hanya bisa mengubah foto miliknya sendiri.
insert into storage.buckets (id, name, public)
  values ('avatars','avatars', true) on conflict (id) do nothing;

drop policy if exists "avatar dapat dibaca siapa saja" on storage.objects;
create policy "avatar dapat dibaca siapa saja" on storage.objects
  for select using (bucket_id = 'avatars');
drop policy if exists "pengguna dapat mengunggah avatar sendiri" on storage.objects;
create policy "pengguna dapat mengunggah avatar sendiri" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pengguna dapat memperbarui avatar sendiri" on storage.objects;
create policy "pengguna dapat memperbarui avatar sendiri" on storage.objects
  for update using (
    bucket_id = 'avatars' and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pengguna dapat menghapus avatar sendiri" on storage.objects;
create policy "pengguna dapat menghapus avatar sendiri" on storage.objects
  for delete using (
    bucket_id = 'avatars' and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text);

-- ---- Storage bucket "logo-perusahaan": logo perusahaan (khusus Admin) ----
insert into storage.buckets (id, name, public)
  values ('logo-perusahaan','logo-perusahaan', true) on conflict (id) do nothing;

drop policy if exists "logo perusahaan dapat dibaca siapa saja" on storage.objects;
create policy "logo perusahaan dapat dibaca siapa saja" on storage.objects
  for select using (bucket_id = 'logo-perusahaan');
drop policy if exists "admin dapat mengunggah logo perusahaan" on storage.objects;
create policy "admin dapat mengunggah logo perusahaan" on storage.objects
  for insert with check (
    bucket_id = 'logo-perusahaan'
    and exists (select 1 from profil where id = auth.uid() and peran = 'admin'));
drop policy if exists "admin dapat memperbarui logo perusahaan" on storage.objects;
create policy "admin dapat memperbarui logo perusahaan" on storage.objects
  for update using (
    bucket_id = 'logo-perusahaan'
    and exists (select 1 from profil where id = auth.uid() and peran = 'admin'));
drop policy if exists "admin dapat menghapus logo perusahaan" on storage.objects;
create policy "admin dapat menghapus logo perusahaan" on storage.objects
  for delete using (
    bucket_id = 'logo-perusahaan'
    and exists (select 1 from profil where id = auth.uid() and peran = 'admin'));

-- =========================================================
-- TAMBAHAN v7 — DATA KONTAK PELANGGAN & TOTAL NILAI PROYEK
-- Jalankan blok ini di SQL Editor untuk mengaktifkan kolom
-- kontak (Alamat, No Telepon, No WhatsApp, Nama PIC) pada
-- menu Pelanggan, serta menyinkronkan pelanggan_id di tabel
-- proyek supaya "Total Nilai Proyek" per pelanggan bisa
-- dihitung otomatis dan akurat (bukan dicocokkan dari nama).
-- Aman dijalankan berulang kali / di database yang sudah
-- berisi data.
-- =========================================================

-- ---- Perluas tabel pelanggan: alamat & kontak PIC ----
alter table pelanggan add column if not exists alamat text;
alter table pelanggan add column if not exists no_telepon text;
alter table pelanggan add column if not exists no_whatsapp text;
alter table pelanggan add column if not exists nama_pic text;

-- ---- Sinkronkan proyek yang belum tertaut ke pelanggan_id ----
-- Sebelum v7, form Proyek hanya menyimpan nama pelanggan sebagai
-- teks bebas, sehingga pelanggan_id bisa kosong (null). Baris di
-- bawah ini mencocokkan proyek yang belum tertaut berdasarkan nama
-- pelanggan yang identik, sekali jalan, agar Total Nilai Proyek
-- pada data lama tetap terhitung benar.
update proyek pr
set pelanggan_id = pl.id
from pelanggan pl
where pr.pelanggan_id is null
  and pr.pelanggan_nama = pl.nama;

-- ---- Indeks bantu untuk agregasi Total Nilai Proyek ----
create index if not exists idx_proyek_pelanggan_id on proyek (pelanggan_id);

-- =========================================================
-- TAMBAHAN v8 — PROYEK SEBAGAI PO (PURCHASE ORDER) & BUDGET
-- Jalankan blok ini di SQL Editor untuk mengaktifkan susunan
-- kolom baru pada menu Proyek:
-- No PO, Nama Pelanggan, Tanggal, Tenggat, Dibuat Oleh,
-- Sub Total, Tax, Dana Lainnya, Grand Total, Total Budget,
-- Budget Terpakai, % Budget, Aksi (Edit/Hapus).
-- Aman dijalankan berulang / di database yang sudah berisi data.
-- =========================================================

alter table proyek add column if not exists tanggal date default current_date;
alter table proyek add column if not exists dibuat_oleh_id uuid references profil(id) on delete set null;
alter table proyek add column if not exists dibuat_oleh_nama text;
alter table proyek add column if not exists sub_total bigint not null default 0;
alter table proyek add column if not exists tax_persen numeric not null default 0;
alter table proyek add column if not exists dana_lainnya bigint not null default 0;
alter table proyek add column if not exists grand_total bigint not null default 0;
alter table proyek add column if not exists total_budget bigint not null default 0;
alter table proyek add column if not exists budget_terpakai bigint not null default 0;

-- ---- Data lama: isi tanggal & sub_total/grand_total dari kolom nilai ----
update proyek set tanggal = dibuat_pada::date where tanggal is null;
update proyek set sub_total = nilai, grand_total = nilai
  where sub_total = 0 and grand_total = 0 and nilai > 0;

-- =========================================================
-- TAMBAHAN v10 — STOCK & GUDANG (multi-gudang, kartu stok, riwayat)
-- Jalankan blok ini di SQL Editor untuk mengaktifkan menu
-- "Stock & Gudang" (kelompok Penjualan & Operasional):
-- SKU, Nama Produk, Variant, Kategori, Gudang, Stok Masuk,
-- Stok Keluar, Sisa Stok, Update Terakhir, Diupdate Oleh,
-- Status, Aksi (Edit/Tambah Stok/Hapus).
-- Aman dijalankan berulang / di database yang sudah berisi data.
--
-- Desain: satu SKU bisa punya baris stok terpisah di tiap gudang
-- (kombinasi gudang_id + sku unik), karena stok fisik memang
-- berbeda-beda per lokasi. Setiap pergerakan stok (masuk/keluar)
-- dicatat sebagai baris di riwayat_stok, sehingga Stok Masuk dan
-- Stok Keluar pada tabel utama selalu berupa akumulasi yang bisa
-- ditelusuri riwayatnya (audit trail), bukan angka yang ditimpa
-- begitu saja.
-- =========================================================

-- ---- Tabel gudang (lokasi/cabang penyimpanan) ----
create table if not exists gudang (
  id uuid primary key default gen_random_uuid(),
  nama text unique not null,
  lokasi text,
  dibuat_pada timestamptz default now()
);

-- ---- Tabel kartu stok: 1 baris = 1 SKU di 1 gudang ----
create table if not exists stok_item (
  id uuid primary key default gen_random_uuid(),
  gudang_id uuid not null references gudang(id) on delete cascade,
  sku text not null,
  nama_produk text not null,
  variant text,
  kategori text default 'Umum',
  stok_masuk bigint not null default 0,
  stok_keluar bigint not null default 0,
  stok_minimum bigint not null default 0,
  status text not null default 'aktif' check (status in ('aktif','nonaktif')),
  diupdate_oleh_id uuid references profil(id) on delete set null,
  diupdate_oleh_nama text,
  diupdate_pada timestamptz default now(),
  dibuat_pada timestamptz default now(),
  unique (gudang_id, sku)
);
create index if not exists idx_stok_item_gudang on stok_item (gudang_id);
create index if not exists idx_stok_item_sku on stok_item (sku);

-- ---- Tabel riwayat pergerakan stok (kartu stok / audit trail) ----
create table if not exists riwayat_stok (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references stok_item(id) on delete cascade,
  tipe text not null check (tipe in ('masuk','keluar')),
  jumlah bigint not null check (jumlah > 0),
  catatan text,
  dibuat_oleh_id uuid references profil(id) on delete set null,
  dibuat_oleh_nama text,
  dibuat_pada timestamptz default now()
);
create index if not exists idx_riwayat_stok_item on riwayat_stok (item_id);

alter table gudang enable row level security;
alter table stok_item enable row level security;
alter table riwayat_stok enable row level security;

create policy "pengguna login dapat membaca gudang" on gudang for select using (auth.uid() is not null);
create policy "pengguna login dapat menambah gudang" on gudang for insert with check (auth.uid() is not null);
create policy "pengguna login dapat mengubah gudang" on gudang for update using (auth.uid() is not null);
create policy "hanya admin dapat menghapus gudang" on gudang for delete using (
  exists (select 1 from profil where id = auth.uid() and peran = 'admin'));

create policy "pengguna login dapat membaca stok item" on stok_item for select using (auth.uid() is not null);
create policy "pengguna login dapat menambah stok item" on stok_item for insert with check (auth.uid() is not null);
create policy "pengguna login dapat mengubah stok item" on stok_item for update using (auth.uid() is not null);
create policy "hanya admin dapat menghapus stok item" on stok_item for delete using (
  exists (select 1 from profil where id = auth.uid() and peran = 'admin'));

create policy "pengguna login dapat membaca riwayat stok" on riwayat_stok for select using (auth.uid() is not null);
create policy "pengguna login dapat menambah riwayat stok" on riwayat_stok for insert with check (auth.uid() is not null);

-- ---- Izinkan tipe 'gudang' pada log Aktivitas (perubahan stok tercatat di sana) ----
alter table aktivitas drop constraint if exists aktivitas_tipe_check;
alter table aktivitas add constraint aktivitas_tipe_check check (tipe in ('proyek','pelanggan','tugas','pengguna','gudang'));

-- ---- Data contoh (aman dilewati jika sudah ada) ----
insert into gudang (nama, lokasi) values
  ('Gudang Pusat Surabaya', 'Rungkut Industri, Surabaya'),
  ('Gudang Cabang Jakarta', 'Cakung, Jakarta Timur')
on conflict (nama) do nothing;

insert into stok_item (gudang_id, sku, nama_produk, variant, kategori, stok_masuk, stok_keluar, stok_minimum, diupdate_oleh_nama)
select g.id, v.sku, v.nama_produk, v.variant, v.kategori, v.stok_masuk, v.stok_keluar, v.stok_minimum, 'Sistem'
from gudang g
join (values
  ('Gudang Pusat Surabaya', 'SKU-1001', 'Kabel LAN Cat6', '20 Meter', 'Elektronik', 200, 65, 30),
  ('Gudang Pusat Surabaya', 'SKU-1002', 'Router WiFi AX', 'Hitam', 'Elektronik', 80, 72, 15),
  ('Gudang Pusat Surabaya', 'SKU-1003', 'Kertas A4 80gr', '1 Rim', 'ATK', 500, 480, 50),
  ('Gudang Cabang Jakarta', 'SKU-1001', 'Kabel LAN Cat6', '20 Meter', 'Elektronik', 120, 118, 30),
  ('Gudang Cabang Jakarta', 'SKU-2001', 'Toner Printer', 'Hitam', 'ATK', 40, 40, 10)
) as v(gudang_nama, sku, nama_produk, variant, kategori, stok_masuk, stok_keluar, stok_minimum)
  on v.gudang_nama = g.nama
on conflict (gudang_id, sku) do nothing;

-- =========================================================
-- TAMBAHAN v11 — DETAIL STOK KELUAR (per transaksi keluar)
-- Jalankan blok ini di SQL Editor untuk mengaktifkan halaman
-- detail "Stok Keluar" yang terbuka saat mengklik angka Stok
-- Keluar pada sebuah item di menu Stock & Gudang:
-- Tanggal Keluar, No DO, Nama Pelanggan, No PO, Nama Proyek,
-- Qty, Satuan, Catatan, Aksi (Edit/Hapus).
-- Aman dijalankan berulang / di database yang sudah berisi data.
--
-- Desain: kolom-kolom detail transaksi (No DO, Pelanggan, No PO,
-- Proyek, Satuan) ditambahkan ke tabel riwayat_stok yang sudah
-- ada, bukan tabel baru — supaya satu baris riwayat tetap jadi
-- satu-satunya sumber kebenaran (single source of truth) untuk
-- angka Stok Keluar di stok_item. Kolom ini nullable karena hanya
-- relevan untuk tipe = 'keluar'; baris stok masuk tidak memakainya.
-- Pelanggan & Proyek tertaut ke data pelanggan/proyek yang sudah
-- terdaftar lewat dropdown di aplikasi (agar konsisten & mudah
-- ditelusuri), tapi tetap boleh diisi manual (pelanggan_id /
-- proyek_id kosong) untuk transaksi yang belum punya PO/proyek
-- resmi di sistem.
-- =========================================================

alter table riwayat_stok add column if not exists tanggal date not null default current_date;
alter table riwayat_stok add column if not exists no_do text;
alter table riwayat_stok add column if not exists pelanggan_id uuid references pelanggan(id) on delete set null;
alter table riwayat_stok add column if not exists pelanggan_nama text;
alter table riwayat_stok add column if not exists no_po text;
alter table riwayat_stok add column if not exists proyek_id uuid references proyek(id) on delete set null;
alter table riwayat_stok add column if not exists proyek_nama text;
alter table riwayat_stok add column if not exists satuan text;

create index if not exists idx_riwayat_stok_tipe on riwayat_stok (tipe);
create index if not exists idx_riwayat_stok_tanggal on riwayat_stok (tanggal);

-- ---- Satuan default per produk (prefill otomatis saat mencatat stok keluar) ----
alter table stok_item add column if not exists satuan text not null default 'Pcs';

-- ---- Lengkapi kebijakan RLS riwayat_stok — sebelumnya hanya ada select & insert,
--      padahal halaman detail Stok Keluar butuh Edit & Hapus per baris. ----
drop policy if exists "pengguna login dapat mengubah riwayat stok" on riwayat_stok;
create policy "pengguna login dapat mengubah riwayat stok" on riwayat_stok for update using (auth.uid() is not null);

drop policy if exists "hanya admin dapat menghapus riwayat stok" on riwayat_stok;
create policy "hanya admin dapat menghapus riwayat stok" on riwayat_stok for delete using (
  exists (select 1 from profil where id = auth.uid() and peran = 'admin'));

-- =========================================================
-- TAMBAHAN v12 — DETAIL STOK MASUK (per transaksi masuk)
-- Jalankan blok ini di SQL Editor untuk mengaktifkan halaman
-- detail "Stok Masuk" yang terbuka saat mengklik angka Stok
-- Masuk pada sebuah item di menu Stock & Gudang:
-- Tanggal Masuk, No DO, Nama Vendor, No PO, Qty, Satuan,
-- Status (Baru/Bekas/Rusak), Catatan, Aksi (Edit/Hapus).
-- Aman dijalankan berulang / di database yang sudah berisi data.
--
-- Desain: sama seperti v11 (Detail Stok Keluar), kolom-kolom
-- transaksi masuk ditambahkan ke tabel riwayat_stok yang sama
-- (bukan tabel baru) supaya satu baris riwayat tetap jadi
-- satu-satunya sumber kebenaran (single source of truth) untuk
-- angka Stok Masuk di stok_item. Kolom tanggal/no_do/no_po/satuan/
-- catatan dipakai bersama dengan riwayat stok keluar (sudah ada
-- sejak v11); yang benar-benar baru di sini hanya vendor_nama dan
-- kondisi_barang, karena keduanya spesifik untuk barang masuk.
--
-- Nama Vendor sengaja dibuat sebagai teks bebas (bukan tabel
-- vendor terpisah + dropdown) supaya pencatatan tetap cepat untuk
-- vendor baru/insidental — aplikasi tetap menyarankan nama vendor
-- yang pernah dipakai lewat autocomplete di sisi klien, jadi
-- konsistensi penulisan tetap terjaga tanpa menambah tabel master
-- baru. Kondisi Barang dibatasi ke 3 nilai baku (Baru/Bekas/Rusak)
-- lewat CHECK constraint supaya datanya konsisten dan bisa
-- difilter/dilaporkan.
-- =========================================================

alter table riwayat_stok add column if not exists vendor_nama text;
alter table riwayat_stok add column if not exists kondisi_barang text check (kondisi_barang in ('baru','bekas','rusak'));

create index if not exists idx_riwayat_stok_kondisi on riwayat_stok (kondisi_barang);

-- ---- Tandai riwayat stok masuk lama (sebelum v12) sebagai "Baru" secara default ----
update riwayat_stok set kondisi_barang = 'baru' where tipe = 'masuk' and kondisi_barang is null;

-- =========================================================
-- TAMBAHAN v13 — PERBAIKAN HASIL AUDIT (indeks & integritas data)
-- Aman dijalankan berulang / di database yang sudah berisi data.
-- Tidak menghapus data apa pun.
--
-- (A) INDEKS YANG HILANG
-- Kolom-kolom foreign key berikut dipakai untuk filter/JOIN di
-- aplikasi (mis. "tugas milik saya", "aktivitas oleh saya", riwayat
-- stok per pelanggan/proyek) tapi belum punya indeks — pada tabel
-- kecil tidak terasa, tapi begitu data bertambah query akan makin
-- lambat (full table scan). Aman & murah untuk ditambahkan sekarang.
-- =========================================================
create index if not exists idx_tugas_ditugaskan_ke on tugas (ditugaskan_ke);
create index if not exists idx_tugas_ditugaskan_oleh on tugas (ditugaskan_oleh);
create index if not exists idx_aktivitas_pelaku_id on aktivitas (pelaku_id);
create index if not exists idx_proyek_dibuat_oleh_id on proyek (dibuat_oleh_id);
create index if not exists idx_riwayat_stok_pelanggan_id on riwayat_stok (pelanggan_id);
create index if not exists idx_riwayat_stok_proyek_id on riwayat_stok (proyek_id);

-- =========================================================
-- (B) STOK NEGATIF HANYA DICEGAH DI JAVASCRIPT — BISA DILEWATI
-- Saat ini validasi "Sisa Stok tidak boleh negatif" hanya dilakukan
-- di script.js sebelum mengirim data. Ini TIDAK melindungi dari:
--   - panggilan langsung ke Supabase REST/API di luar aplikasi ini
--   - dua pengguna mencatat stok keluar pada saat bersamaan (race
--     condition): keduanya membaca sisa stok yang sama sebelum salah
--     satu selesai menyimpan, sehingga total bisa lolos jadi negatif
-- Trigger di bawah ini menjadi pengaman terakhir di level database:
-- setiap kali ada baris riwayat_stok baru bertipe 'keluar', hitung
-- ulang total keluar untuk item tsb dan tolak jika melebihi total
-- masuk. Ini TIDAK menggantikan validasi di JS (validasi JS tetap
-- penting untuk pesan error yang cepat & ramah pengguna) — ini
-- lapisan pertahanan kedua yang tidak bisa dilewati dari luar.
-- =========================================================
create or replace function public.cegah_stok_keluar_negatif()
returns trigger as $$
declare
  total_masuk bigint;
  total_keluar bigint;
begin
  if new.tipe <> 'keluar' then
    return new;
  end if;
  select coalesce(sum(jumlah) filter (where tipe = 'masuk'), 0),
         coalesce(sum(jumlah) filter (where tipe = 'keluar'), 0)
    into total_masuk, total_keluar
    from riwayat_stok
    where item_id = new.item_id and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if (total_keluar + new.jumlah) > total_masuk then
    raise exception 'Stok keluar melebihi stok tersedia untuk item ini (tersedia: %, diminta: %)',
      (total_masuk - total_keluar), new.jumlah;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_cegah_stok_keluar_negatif on riwayat_stok;
create trigger trg_cegah_stok_keluar_negatif
  before insert or update on riwayat_stok
  for each row execute procedure public.cegah_stok_keluar_negatif();

-- =========================================================
-- TAMBAHAN v14 — HILANGKAN RACE CONDITION PADA AKUMULASI STOK
-- Aman dijalankan berulang / di database yang sudah berisi data.
-- Tidak menghapus data apa pun.
--
-- MASALAH: script.js menghitung stok_item.stok_masuk / stok_keluar
-- di browser lalu menulisnya lewat request UPDATE terpisah dari
-- insert riwayat_stok. Ini dua langkah, bukan satu transaksi —
-- kalau dua pengguna mencatat stok untuk item yang sama nyaris
-- bersamaan, salah satu update bisa menimpa update yang lain
-- (lost update), sehingga angka Stok Masuk/Keluar di kartu stok
-- bisa "ngedrift" dari riwayat_stok yang sebenarnya (sumber
-- kebenaran yang asli).
--
-- SOLUSI: trigger di bawah ini berjalan otomatis di DATABASE setiap
-- kali riwayat_stok berubah (tambah/edit/hapus), dan menghitung ULANG
-- stok_masuk & stok_keluar langsung dari SUM(riwayat_stok) untuk item
-- terkait, lalu menulisnya ke stok_item — semuanya dalam satu
-- transaksi atom di server. Ini membuat kartu stok TIDAK MUNGKIN lagi
-- tidak sinkron dengan riwayatnya, apa pun yang dikirim dari klien.
-- Update stok_masuk/stok_keluar yang masih dikirim script.js jadi
-- tidak berbahaya (akan langsung ditimpa ulang dengan angka yang
-- benar oleh trigger ini) — tidak perlu mengubah script.js.
-- =========================================================
create or replace function public.sinkron_akumulasi_stok()
returns trigger as $$
declare
  target_item_id uuid;
begin
  target_item_id := coalesce(new.item_id, old.item_id);
  update stok_item set
    stok_masuk = coalesce((select sum(jumlah) from riwayat_stok where item_id = target_item_id and tipe = 'masuk'), 0),
    stok_keluar = coalesce((select sum(jumlah) from riwayat_stok where item_id = target_item_id and tipe = 'keluar'), 0)
  where id = target_item_id;
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_sinkron_akumulasi_stok on riwayat_stok;
create trigger trg_sinkron_akumulasi_stok
  after insert or update or delete on riwayat_stok
  for each row execute procedure public.sinkron_akumulasi_stok();

-- ---- Jalankan sekali untuk menyamakan data lama dengan riwayat_stok ----
update stok_item si set
  stok_masuk = coalesce((select sum(jumlah) from riwayat_stok where item_id = si.id and tipe = 'masuk'), 0),
  stok_keluar = coalesce((select sum(jumlah) from riwayat_stok where item_id = si.id and tipe = 'keluar'), 0);

-- =========================================================
-- TAMBAHAN v12 — KOLOM "UPDATE TERAKHIR" PADA PROYEK
-- Menambahkan kolom diupdate_pada pada tabel proyek supaya
-- halaman "Proyek Pelanggan Ini" bisa menampilkan kolom
-- "Update Terakhir" (kapan proyek/PO tersebut terakhir diubah),
-- konsisten dengan pola yang sudah dipakai pada stok_item.
-- Nilainya diisi otomatis oleh aplikasi (script.js) setiap kali
-- proyek dibuat atau diedit — bukan lewat trigger database.
-- =========================================================
alter table proyek add column if not exists diupdate_pada timestamptz default now();

-- ---- Samakan data lama: pakai dibuat_pada sebagai update terakhir awal ----
update proyek set diupdate_pada = dibuat_pada where diupdate_pada is null;

-- =========================================================
-- TAMBAHAN v16 — RINCIAN KONDISI BARANG PADA SATU TRANSAKSI
-- STOK MASUK (Stok Baru, Stok Bekas, Stok Rusak sekaligus)
-- Jalankan blok ini di SQL Editor setelah v12 aktif.
--
-- MASALAH SEBELUMNYA: satu baris riwayat_stok (tipe='masuk')
-- hanya bisa menyimpan SATU kondisi barang lewat kondisi_barang
-- ('baru' / 'bekas' / 'rusak') untuk seluruh Qty di baris itu.
-- Padahal satu penerimaan barang (satu No DO/No PO/tanggal/
-- vendor yang sama) sering berisi campuran kondisi sekaligus,
-- misalnya 40 unit baru + 5 unit bekas + 2 unit rusak dari
-- pengiriman yang sama.
--
-- PERUBAHAN: tambah 3 kolom kuantitas per kondisi supaya SATU
-- baris riwayat_stok bisa merepresentasikan satu transaksi
-- penerimaan barang secara utuh:
--   stok_baru, stok_bekas, stok_rusak (masing-masing bigint)
-- Kolom "jumlah" (sudah ada sejak v10) tetap dipakai sebagai
-- TOTAL (stok_baru + stok_bekas + stok_rusak) supaya trigger
-- akumulasi stok_item.stok_masuk (lihat v14, yang menjumlahkan
-- "jumlah" untuk tipe='masuk') tidak perlu diubah sama sekali —
-- single source of truth untuk total tetap kolom "jumlah".
--
-- Kolom kondisi_barang (v12) TIDAK dihapus, dibiarkan apa adanya
-- sebagai arsip data lama; aplikasi (script.js) per v16 tidak
-- membacanya lagi untuk transaksi stok masuk yang baru.
-- Aman dijalankan berulang / di database yang sudah berisi data.
-- =========================================================

alter table riwayat_stok add column if not exists stok_baru bigint not null default 0;
alter table riwayat_stok add column if not exists stok_bekas bigint not null default 0;
alter table riwayat_stok add column if not exists stok_rusak bigint not null default 0;

-- ---- Migrasi data lama (sebelum v16): pindahkan jumlah+kondisi_barang
-- (satu kondisi per baris) ke kolom kuantitas per kondisi yang baru,
-- supaya riwayat stok masuk lama tetap tampil benar di tabel baru ----
update riwayat_stok set stok_baru  = jumlah where tipe = 'masuk' and coalesce(kondisi_barang,'baru') = 'baru'  and stok_baru = 0 and stok_bekas = 0 and stok_rusak = 0;
update riwayat_stok set stok_bekas = jumlah where tipe = 'masuk' and kondisi_barang = 'bekas' and stok_baru = 0 and stok_bekas = 0 and stok_rusak = 0;
update riwayat_stok set stok_rusak = jumlah where tipe = 'masuk' and kondisi_barang = 'rusak' and stok_baru = 0 and stok_bekas = 0 and stok_rusak = 0;

-- =========================================================
-- TAMBAHAN v17 — MANAJEMEN PRODUK, KATEGORI & GUDANG
-- Jalankan blok ini di SQL Editor setelah v10 aktif. Mengaktifkan
-- halaman "Manajemen Produk, Kategori & Gudang" (dibuka lewat
-- tombol di menu Stock & Gudang), berisi 3 tab:
--   - Produk : daftar produk dikelompokkan per SKU (gabungan dari
--     semua baris stok_item lintas gudang), dengan aksi Edit
--     (ubah nama/kategori/variant/satuan sekaligus di SEMUA gudang
--     yang punya SKU itu) dan "+ Gudang Lain" (tambahkan SKU yang
--     sama ke gudang lain tanpa mengetik ulang datanya).
--   - Kategori : daftar kategori sebagai data master (bukan teks
--     bebas lagi), supaya tidak ada lagi kategori ganda karena
--     salah ketik ("Elektronik" vs "elektronik" vs "Electronic").
--   - Gudang : sama seperti "Kelola Gudang" sebelumnya, sekarang
--     dipindahkan ke sini supaya 3 data master (Produk, Kategori,
--     Gudang) yang saling berhubungan dikelola di satu halaman.
--
-- MASALAH SEBELUMNYA: kolom stok_item.kategori adalah teks bebas
-- tanpa tabel master, jadi (1) rawan typo/duplikat, (2) tidak ada
-- cara mengganti nama satu kategori sekaligus di semua produk yang
-- memakainya, (3) tidak ada tempat terpusat melihat & mengelola
-- daftar kategori yang benar-benar dipakai.
--
-- PERUBAHAN: tabel kategori_produk baru sebagai data master, dan
-- kolom stok_item.kategori_id sebagai penghubung (FK, ON DELETE
-- SET NULL supaya menghapus kategori tidak ikut menghapus produk).
-- Kolom stok_item.kategori (teks, sudah ada sejak v10) TETAP
-- dipakai sebagai sumber tampilan supaya tidak perlu JOIN di semua
-- query yang sudah ada — trigger di bawah membuatnya otomatis
-- ikut berubah setiap kali nama kategori diganti lewat tab
-- Kategori, sehingga keduanya selalu sinkron.
-- Aman dijalankan berulang / di database yang sudah berisi data.
-- =========================================================

create table if not exists kategori_produk (
  id uuid primary key default gen_random_uuid(),
  nama text unique not null,
  dibuat_pada timestamptz default now()
);

alter table stok_item add column if not exists kategori_id uuid references kategori_produk(id) on delete set null;

alter table kategori_produk enable row level security;

create policy "pengguna login dapat membaca kategori produk" on kategori_produk for select using (auth.uid() is not null);
create policy "pengguna login dapat menambah kategori produk" on kategori_produk for insert with check (auth.uid() is not null);
create policy "pengguna login dapat mengubah kategori produk" on kategori_produk for update using (auth.uid() is not null);
create policy "hanya admin dapat menghapus kategori produk" on kategori_produk for delete using (
  exists (select 1 from profil where id = auth.uid() and peran = 'admin'));

-- ---- Migrasi data lama: jadikan setiap nilai kategori (teks) yang sudah
-- terpakai di stok_item sebagai baris kategori_produk, lalu hubungkan balik
-- lewat kategori_id. "Umum" selalu disertakan sebagai kategori bawaan ----
insert into kategori_produk (nama) values ('Umum') on conflict (nama) do nothing;

insert into kategori_produk (nama)
select distinct coalesce(nullif(trim(kategori), ''), 'Umum') from stok_item
on conflict (nama) do nothing;

update stok_item si set kategori_id = kp.id
from kategori_produk kp
where kp.nama = coalesce(nullif(trim(si.kategori), ''), 'Umum') and si.kategori_id is null;

-- ---- Trigger: saat nama kategori diganti lewat tab Kategori, otomatis
-- perbarui juga kolom teks stok_item.kategori pada semua produk yang
-- memakai kategori tersebut, supaya keduanya tidak pernah "ngedrift" ----
create or replace function sinkron_nama_kategori_ke_stok_item() returns trigger as $$
begin
  if new.nama is distinct from old.nama then
    update stok_item set kategori = new.nama where kategori_id = new.id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_sinkron_nama_kategori on kategori_produk;
create trigger trg_sinkron_nama_kategori
  after update on kategori_produk
  for each row execute function sinkron_nama_kategori_ke_stok_item();

-- =========================================================
-- TAMBAHAN v18 — KATEGORI MEREK (BRAND)
-- Jalankan blok ini di SQL Editor setelah v17 aktif. Menambahkan
-- jenis kategori KEDUA di samping kategori_produk (v17): Kategori
-- Merek, untuk mengelompokkan & memfilter produk berdasarkan
-- merek/brand (mis. Samsung, Anker, Logitech) — terpisah dari
-- Kategori Produk yang mengelompokkan berdasarkan jenis produk
-- (mis. Kabel, Charger, Aksesoris). Satu produk hanya punya SATU
-- merek, tapi merek yang sama bisa muncul di banyak kategori
-- produk berbeda, jadi lebih tepat dipisah daripada digabung jadi
-- satu daftar datar.
--
-- Ditambahkan di halaman "Manajemen Produk, Kategori & Gudang"
-- sebagai tab baru "Kategori Merek" (di samping tab "Kategori
-- Produk" yang sudah ada), dan diikutkan sebagai kolom/filter baru
-- di menu Stock & Gudang serta tab Produk.
--
-- STRUKTUR: pola PERSIS SAMA seperti kategori_produk di v17—
-- tabel kategori_merek sebagai data master, kolom stok_item.merek
-- (teks, dipakai tampilan) + stok_item.merek_id (FK, ON DELETE SET
-- NULL) sebagai penghubung, dan trigger yang otomatis menyamakan
-- keduanya setiap kali nama merek diganti lewat tab Kategori Merek.
-- Aman dijalankan berulang / di database yang sudah berisi data.
-- =========================================================

create table if not exists kategori_merek (
  id uuid primary key default gen_random_uuid(),
  nama text unique not null,
  dibuat_pada timestamptz default now()
);

alter table stok_item add column if not exists merek text default 'Umum';
alter table stok_item add column if not exists merek_id uuid references kategori_merek(id) on delete set null;

alter table kategori_merek enable row level security;

create policy "pengguna login dapat membaca kategori merek" on kategori_merek for select using (auth.uid() is not null);
create policy "pengguna login dapat menambah kategori merek" on kategori_merek for insert with check (auth.uid() is not null);
create policy "pengguna login dapat mengubah kategori merek" on kategori_merek for update using (auth.uid() is not null);
create policy "hanya admin dapat menghapus kategori merek" on kategori_merek for delete using (
  exists (select 1 from profil where id = auth.uid() and peran = 'admin'));

-- ---- Migrasi data lama: jadikan setiap nilai merek (teks) yang sudah
-- terpakai di stok_item sebagai baris kategori_merek, lalu hubungkan balik
-- lewat merek_id. "Umum" selalu disertakan sebagai merek bawaan ----
insert into kategori_merek (nama) values ('Umum') on conflict (nama) do nothing;

update stok_item set merek = 'Umum' where merek is null or trim(merek) = '';

insert into kategori_merek (nama)
select distinct coalesce(nullif(trim(merek), ''), 'Umum') from stok_item
on conflict (nama) do nothing;

update stok_item si set merek_id = km.id
from kategori_merek km
where km.nama = coalesce(nullif(trim(si.merek), ''), 'Umum') and si.merek_id is null;

-- ---- Trigger: saat nama merek diganti lewat tab Kategori Merek, otomatis
-- perbarui juga kolom teks stok_item.merek pada semua produk yang
-- memakai merek tersebut, supaya keduanya tidak pernah "ngedrift" ----
create or replace function sinkron_nama_merek_ke_stok_item() returns trigger as $$
begin
  if new.nama is distinct from old.nama then
    update stok_item set merek = new.nama where merek_id = new.id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_sinkron_nama_merek on kategori_merek;
create trigger trg_sinkron_nama_merek
  after update on kategori_merek
  for each row execute function sinkron_nama_merek_ke_stok_item();

-- =========================================================
-- TAMBAHAN v19 — PERBAIKAN TAUTAN pelanggan_id PADA PROYEK LAMA
-- Jalankan blok ini di SQL Editor jika menu "Pelanggan" menampilkan
-- lebih sedikit proyek dibanding menu "Laporan"/"Ringkasan".
--
-- Penyebab: sebelum migrasi v7, form Proyek hanya menyimpan nama
-- pelanggan sebagai teks bebas (pelanggan_nama), sehingga kolom
-- pelanggan_id bisa kosong (null) untuk proyek-proyek lama. Proyek
-- dengan pelanggan_id kosong tidak akan ketemu saat menu Pelanggan
-- mencari proyek berdasarkan pelanggan_id, sehingga proyek itu tidak
-- ikut terhitung di kolom-kolom total (Sub Total, Grand Total, Profit,
-- dst) maupun tidak muncul di halaman "Proyek Pelanggan Ini" — padahal
-- proyek yang sama tetap dihitung di menu Laporan/Ringkasan karena
-- keduanya menjumlahkan SELURUH data proyek tanpa perlu tautan ke
-- pelanggan. Query di bawah ini menautkan ulang proyek-proyek yang
-- pelanggan_id-nya masih kosong ke pelanggan yang namanya identik.
-- Aman dijalankan berulang kali / kapan pun.
-- =========================================================

update proyek pr
set pelanggan_id = pl.id
from pelanggan pl
where pr.pelanggan_id is null
  and pr.pelanggan_nama = pl.nama;

-- ---- Cek apakah masih ada proyek yang belum tertaut setelah query di atas ----
-- Jika hasil query berikut TIDAK kosong, berarti proyek tersebut punya
-- pelanggan_nama yang tidak identik dengan nama pelanggan manapun di
-- tabel pelanggan (mis. typo, pelanggan sudah dihapus, atau proyek
-- ditambahkan sebelum nama pelanggan diubah). Proyek ini perlu ditautkan
-- manual lewat tombol "Edit" di menu Proyek Pelanggan Ini, atau
-- disesuaikan namanya agar sama persis dengan salah satu pelanggan.
-- select id, kode, nama, pelanggan_nama from proyek where pelanggan_id is null;

-- =========================================================
-- TAMBAHAN v20 — PROYEK IKUT TERHAPUS TOTAL SAAT PELANGGANNYA DIHAPUS
-- Jalankan blok ini SEKALI di SQL Editor Supabase.
--
-- SEBELUM ini: kolom proyek.pelanggan_id memakai "ON DELETE SET NULL",
-- artinya saat sebuah pelanggan dihapus, proyek-proyeknya TIDAK ikut
-- terhapus — hanya tautannya (pelanggan_id) yang dikosongkan, sehingga
-- proyek "yatim" itu tetap ada selamanya (lihat catatan di v19 & fungsi
-- hapusPelanggan() pada script.js).
--
-- SESUDAH ini: kolom proyek.pelanggan_id memakai "ON DELETE CASCADE",
-- artinya saat sebuah baris pelanggan dihapus, PostgreSQL/Supabase akan
-- OTOMATIS DAN PERMANEN menghapus seluruh baris proyek yang pelanggan_id-
-- nya menunjuk ke pelanggan tersebut — di level database, jadi berlaku
-- konsisten walau penghapusan dilakukan lewat aplikasi, SQL Editor,
-- maupun API lain. Ini sengaja dipasang di database (bukan hanya di
-- script.js) supaya aturan "proyek ikut hilang" tidak bisa "bocor"/
-- terlewat walau ada jalur hapus yang lain di masa depan.
--
-- CATATAN: relasi riwayat_stok.proyek_id & riwayat_stok.pelanggan_id
-- SENGAJA TETAP "ON DELETE SET NULL" (tidak ikut diubah di sini), karena
-- riwayat_stok adalah catatan mutasi stok (kartu stok/audit trail) yang
-- semestinya tetap tersimpan apa adanya untuk keperluan audit walau
-- proyek/pelanggan yang menjadi rujukannya sudah dihapus — hanya
-- tautannya yang dikosongkan, datanya sendiri tidak boleh ikut lenyap.
--
-- Aman dijalankan berulang kali / kapan pun.
-- =========================================================

alter table proyek drop constraint if exists proyek_pelanggan_id_fkey;
alter table proyek add constraint proyek_pelanggan_id_fkey
  foreign key (pelanggan_id) references pelanggan(id) on delete cascade;

-- =========================================================
-- TAMBAHAN v21 — RESET SEMUA DATA (menu Pengaturan > Admin)
-- Jalankan blok ini SEKALI di SQL Editor Supabase untuk mengaktifkan
-- tombol "Reset Semua Data" di menu Pengaturan (khusus Admin, dengan
-- konfirmasi kata sandi) di aplikasi.
--
-- APA YANG DIHAPUS: seluruh data OPERASIONAL —
--   pelanggan, proyek, tugas, aktivitas, catatan tim,
--   gudang, kartu stok (stok_item), riwayat stok,
--   kategori produk, kategori merek.
--
-- APA YANG TIDAK DIHAPUS (sengaja dipertahankan) —
--   - profil & akun login (tabel profil / auth.users): supaya Admin
--     dan seluruh anggota tim TIDAK ikut ter-logout / kehilangan akun.
--   - pengaturan_perusahaan (nama & logo perusahaan): ini pengaturan
--     tampilan, bukan "data" operasional, jadi tetap dipertahankan.
--
-- KENAPA PAKAI FUNGSI DATABASE (bukan sekadar tombol .delete() di JS):
--   1. TRUNCATE butuh hak akses lebih tinggi daripada yang dimiliki
--      role "authenticated" biasa, sehingga fungsi ini perlu berjalan
--      sebagai SECURITY DEFINER (meminjam hak pembuat fungsi).
--   2. Karena SECURITY DEFINER melewati RLS, fungsi ini WAJIB mengecek
--      sendiri bahwa pemanggilnya benar Admin — jadi walau tombolnya di
--      aplikasi hanya tampil utk Admin, keamanan sesungguhnya tetap
--      ditegakkan di database (bukan hanya "disembunyikan" di UI).
--   3. Satu pemanggilan RPC = satu transaksi atomik: kalau salah satu
--      langkah gagal, semuanya dibatalkan (tidak ada kondisi "separuh
--      terhapus").
--
-- Konfirmasi kata sandi Admin dilakukan di sisi aplikasi (re-login
-- singkat lewat Supabase Auth) SEBELUM RPC ini dipanggil — fungsi ini
-- sendiri tidak menerima/menyimpan kata sandi.
-- Aman dijalankan berulang kali / kapan pun.
-- =========================================================

create or replace function reset_semua_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  nama_admin text;
begin
  -- Jaga-jaga di level database: hanya Admin yang login yang boleh
  -- menjalankan fungsi ini, apa pun jalur pemanggilannya.
  select nama into nama_admin from profil where id = auth.uid() and peran = 'admin';
  if nama_admin is null then
    raise exception 'Hanya Admin yang dapat mereset seluruh data.';
  end if;

  -- CASCADE di sini menangani tabel-tabel turunan (mis. proyek ikut
  -- kosong lewat cascade dari pelanggan sejak v20; stok_item & riwayat_stok
  -- ikut kosong lewat cascade dari gudang) — profil & pengaturan_perusahaan
  -- SENGAJA tidak disebut di sini sehingga tidak ikut terhapus.
  truncate table
    riwayat_stok, stok_item, gudang,
    kategori_produk, kategori_merek,
    proyek, pelanggan,
    tugas, catatan_tim, aktivitas
  cascade;

  -- Baris log pertama setelah tabel aktivitas ikut dikosongkan, supaya
  -- tetap ada jejak audit siapa & kapan reset ini dilakukan.
  insert into aktivitas (tipe, teks, pelaku_id, pelaku_nama)
  values (
    'pengguna',
    'Seluruh data pelanggan, proyek, tugas, catatan tim, gudang & stok telah <b>DIRESET TOTAL</b> oleh Admin <b>' || nama_admin || '</b>',
    auth.uid(),
    nama_admin
  );
end;
$$;

revoke all on function reset_semua_data() from public;
grant execute on function reset_semua_data() to authenticated;

-- =========================================================
-- TAMBAHAN v22 — PERAN BARU: MARKETING & PURCHASING
-- Jalankan blok ini SEKALI di SQL Editor Supabase untuk mengaktifkan
-- dua peran baru yang bisa dipilih Admin di menu "Kelola Pengguna":
--
--   • Marketing   — hanya untuk menu Pelanggan: boleh menambah &
--                    mengubah data pelanggan, dan tetap bisa MELIHAT
--                    riwayat proyek/deal pelanggan tsb (perlu untuk
--                    menilai histori transaksi pelanggan). TIDAK bisa
--                    menghapus pelanggan (tetap khusus Admin), dan
--                    TIDAK bisa menambah/mengubah Proyek, Tugas,
--                    Stock & Gudang, Catatan Tim, atau menu lain.
--
--   • Purchasing  — hanya untuk menu Stock & Gudang: boleh mengelola
--                    gudang, kartu stok, kategori produk/merek, serta
--                    transaksi stok masuk & keluar — termasuk MENGHAPUS
--                    kartu stok/transaksi yang salah input. TIDAK bisa
--                    menghapus GUDANG, KATEGORI PRODUK, atau KATEGORI
--                    MEREK itu sendiri (tetap khusus Admin, karena itu
--                    keputusan struktural yang berdampak ke banyak
--                    transaksi sekaligus) dan TIDAK bisa mengakses
--                    Pelanggan, Proyek, Tugas, atau menu lain.
--
-- Admin & Anggota Tim TIDAK berubah sama sekali oleh migrasi ini.
--
-- DESAIN HAK AKSES (least privilege — hak akses minimum yang cukup):
--   - Baca (SELECT) pada tabel operasional TETAP terbuka untuk semua
--     pengguna yang login, seperti sebelumnya — supaya fitur lintas-
--     menu yang masih dibutuhkan tidak ikut rusak (mis. dropdown
--     pelanggan/proyek di form Stok Keluar, avatar & nama pengguna di
--     seluruh aplikasi). Yang benar-benar dibatasi per peran adalah
--     hak TULIS (INSERT/UPDATE/DELETE) — di situlah risiko sesungguhnya
--     (salah ubah/hapus data di luar tanggung jawab peran tsb).
--   - Menu yang tidak relevan bagi Marketing & Purchasing (Ringkasan,
--     Proyek, Tugas, Kalender, Aktivitas, Laporan, Pesan, dst.)
--     disembunyikan di tampilan lewat atribut data-roles di index.html
--     + terapkanPeran() di script.js — TAPI hak TULIS ke tabel di
--     baliknya tetap ditutup di level database lewat RLS di bawah ini,
--     supaya pembatasannya sungguhan (bukan sekadar disembunyikan di
--     UI) dan tetap berlaku walau ada yang memanggil API Supabase
--     langsung di luar aplikasi.
--
-- Aman dijalankan berulang kali / kapan pun.
-- =========================================================

-- ---- Izinkan nilai peran baru di tabel profil ----
alter table profil drop constraint if exists profil_peran_check;
alter table profil add constraint profil_peran_check check (peran in ('admin','anggota','marketing','purchasing'));

-- ---- PELANGGAN: + Marketing boleh tambah/ubah (Hapus tetap khusus Admin, tidak berubah) ----
drop policy if exists "pengguna login dapat menambah pelanggan" on pelanggan;
create policy "admin anggota marketing dapat menambah pelanggan" on pelanggan for insert with check (
  exists (select 1 from profil where id = auth.uid() and peran in ('admin','anggota','marketing')));

drop policy if exists "pengguna login dapat mengubah pelanggan" on pelanggan;
create policy "admin anggota marketing dapat mengubah pelanggan" on pelanggan for update using (
  exists (select 1 from profil where id = auth.uid() and peran in ('admin','anggota','marketing')));

-- ---- PROYEK: Marketing & Purchasing TIDAK boleh menambah/mengubah proyek ----
drop policy if exists "pengguna login dapat menambah proyek" on proyek;
create policy "admin anggota dapat menambah proyek" on proyek for insert with check (
  exists (select 1 from profil where id = auth.uid() and peran in ('admin','anggota')));

drop policy if exists "pengguna login dapat mengubah proyek" on proyek;
create policy "admin anggota dapat mengubah proyek" on proyek for update using (
  exists (select 1 from profil where id = auth.uid() and peran in ('admin','anggota')));

-- ---- TUGAS: Marketing & Purchasing TIDAK boleh menambah tugas baru ----
drop policy if exists "pengguna login dapat menambah tugas" on tugas;
create policy "admin anggota dapat menambah tugas" on tugas for insert with check (
  exists (select 1 from profil where id = auth.uid() and peran in ('admin','anggota')));

-- ---- CATATAN TIM (menu Pesan): Marketing & Purchasing tidak ikut menu ini ----
drop policy if exists "pengguna login dapat menambah catatan tim" on catatan_tim;
create policy "admin anggota dapat menambah catatan tim" on catatan_tim for insert with check (
  exists (select 1 from profil where id = auth.uid() and peran in ('admin','anggota')));

drop policy if exists "pengguna login dapat menghapus catatan tim" on catatan_tim;
create policy "admin anggota dapat menghapus catatan tim" on catatan_tim for delete using (
  exists (select 1 from profil where id = auth.uid() and peran in ('admin','anggota')));

-- ---- GUDANG: + Purchasing boleh tambah/ubah gudang (Hapus tetap khusus Admin) ----
drop policy if exists "pengguna login dapat menambah gudang" on gudang;
create policy "admin anggota purchasing dapat menambah gudang" on gudang for insert with check (
  exists (select 1 from profil where id = auth.uid() and peran in ('admin','anggota','purchasing')));

drop policy if exists "pengguna login dapat mengubah gudang" on gudang;
create policy "admin anggota purchasing dapat mengubah gudang" on gudang for update using (
  exists (select 1 from profil where id = auth.uid() and peran in ('admin','anggota','purchasing')));

-- ---- STOK ITEM (kartu stok): + Purchasing boleh tambah/ubah/HAPUS kartu stok ----
drop policy if exists "pengguna login dapat menambah stok item" on stok_item;
create policy "admin anggota purchasing dapat menambah stok item" on stok_item for insert with check (
  exists (select 1 from profil where id = auth.uid() and peran in ('admin','anggota','purchasing')));

drop policy if exists "pengguna login dapat mengubah stok item" on stok_item;
create policy "admin anggota purchasing dapat mengubah stok item" on stok_item for update using (
  exists (select 1 from profil where id = auth.uid() and peran in ('admin','anggota','purchasing')));

drop policy if exists "hanya admin dapat menghapus stok item" on stok_item;
create policy "admin purchasing dapat menghapus stok item" on stok_item for delete using (
  exists (select 1 from profil where id = auth.uid() and peran in ('admin','purchasing')));

-- ---- RIWAYAT STOK (transaksi stok masuk/keluar): + Purchasing boleh kelola penuh termasuk hapus ----
drop policy if exists "pengguna login dapat menambah riwayat stok" on riwayat_stok;
create policy "admin anggota purchasing dapat menambah riwayat stok" on riwayat_stok for insert with check (
  exists (select 1 from profil where id = auth.uid() and peran in ('admin','anggota','purchasing')));

drop policy if exists "pengguna login dapat mengubah riwayat stok" on riwayat_stok;
create policy "admin anggota purchasing dapat mengubah riwayat stok" on riwayat_stok for update using (
  exists (select 1 from profil where id = auth.uid() and peran in ('admin','anggota','purchasing')));

drop policy if exists "hanya admin dapat menghapus riwayat stok" on riwayat_stok;
create policy "admin purchasing dapat menghapus riwayat stok" on riwayat_stok for delete using (
  exists (select 1 from profil where id = auth.uid() and peran in ('admin','purchasing')));

-- ---- KATEGORI PRODUK: + Purchasing boleh tambah/ubah (Hapus tetap khusus Admin) ----
drop policy if exists "pengguna login dapat menambah kategori produk" on kategori_produk;
create policy "admin anggota purchasing dapat menambah kategori produk" on kategori_produk for insert with check (
  exists (select 1 from profil where id = auth.uid() and peran in ('admin','anggota','purchasing')));

drop policy if exists "pengguna login dapat mengubah kategori produk" on kategori_produk;
create policy "admin anggota purchasing dapat mengubah kategori produk" on kategori_produk for update using (
  exists (select 1 from profil where id = auth.uid() and peran in ('admin','anggota','purchasing')));

-- ---- KATEGORI MEREK: + Purchasing boleh tambah/ubah (Hapus tetap khusus Admin) ----
drop policy if exists "pengguna login dapat menambah kategori merek" on kategori_merek;
create policy "admin anggota purchasing dapat menambah kategori merek" on kategori_merek for insert with check (
  exists (select 1 from profil where id = auth.uid() and peran in ('admin','anggota','purchasing')));

drop policy if exists "pengguna login dapat mengubah kategori merek" on kategori_merek;
create policy "admin anggota purchasing dapat mengubah kategori merek" on kategori_merek for update using (
  exists (select 1 from profil where id = auth.uid() and peran in ('admin','anggota','purchasing')));

-- =========================================================
-- TAMBAHAN v23 — STATUS & KONDISI BARANG PADA STOK KELUAR
-- Jalankan blok ini di SQL Editor setelah v16 aktif. Menambahkan
-- ke form "Tambah Stok Keluar" (menu Stock & Gudang):
--   - Status  : 'terjual' atau 'dipinjam' — supaya pengeluaran
--     barang yang sifatnya DIPINJAM (bisa balik lagi) bisa
--     dibedakan dari yang benar-benar TERJUAL (habis terpakai).
--   - Jumlah per Kondisi Barang (Baru/Bekas/Rusak) — barang yang
--     keluar tidak selalu baru; kadang yang dikirim/dipinjamkan
--     adalah unit bekas atau bahkan rusak (retur ke vendor, dsb).
--
-- Kolom stok_baru/stok_bekas/stok_rusak SUDAH ADA sejak v16 tapi
-- sebelumnya hanya diisi untuk tipe='masuk' — mulai v23 kolom yang
-- sama ini juga dipakai untuk tipe='keluar', supaya tidak perlu
-- kolom kuantitas duplikat. Kolom "jumlah" (total) tetap dihitung
-- sebagai stok_baru + stok_bekas + stok_rusak untuk kedua tipe.
-- Aman dijalankan berulang / di database yang sudah berisi data.
-- =========================================================

alter table riwayat_stok add column if not exists status_keluar text check (status_keluar in ('terjual','dipinjam'));
create index if not exists idx_riwayat_stok_status_keluar on riwayat_stok (status_keluar);

-- ---- Data lama (sebelum v23): tandai semua riwayat keluar yang sudah ada
-- sebagai 'terjual' secara default, dan pindahkan qty lama ke stok_baru
-- (asumsi barang keluar sebelumnya semua dianggap kondisi baru) ----
update riwayat_stok set status_keluar = 'terjual' where tipe = 'keluar' and status_keluar is null;
update riwayat_stok set stok_baru = jumlah where tipe = 'keluar' and stok_baru = 0 and stok_bekas = 0 and stok_rusak = 0 and jumlah > 0;

-- =========================================================
-- TAMBAHAN v24 — PENDAFTARAN AKUN BARU WAJIB PERSETUJUAN ADMIN
-- Jalankan blok ini SEKALI di SQL Editor Supabase.
--
-- MASALAH SEBELUM v24: begitu seseorang mendaftar lewat form "Daftar",
-- trigger on_auth_user_created langsung membuat baris profil dengan
-- peran 'anggota' DAN baris itu langsung punya sesi auth.uid() yang
-- valid — artinya (selama "Confirm email" dimatikan, seperti disarankan
-- di v3) orang tsb langsung bisa masuk & melihat seluruh data
-- pelanggan/proyek/tugas/gudang tanpa ada yang menyaring siapa saja
-- yang boleh bergabung ke tim.
--
-- SOLUSI v24 — kolom `status_akun` pada profil dengan 3 nilai:
--   • 'menunggu' — BARU MENDAFTAR, belum disetujui Admin (default utk
--     pendaftar baru). Tidak bisa melihat/mengubah data apa pun selain
--     baris profilnya sendiri (untuk menampilkan layar "Menunggu
--     Persetujuan" di aplikasi).
--   • 'aktif'    — disetujui Admin, akses penuh sesuai perannya.
--   • 'ditolak'  — ditolak Admin. Sama seperti 'menunggu': tidak bisa
--     melihat/mengubah data apa pun.
--
-- PENTING — INI DIPERKUAT DI LEVEL DATABASE (RLS), BUKAN SEKADAR
-- disembunyikan di tampilan: seluruh kebijakan RLS "pengguna login
-- dapat membaca/menambah/mengubah ..." di tabel-tabel inti (pelanggan,
-- proyek, tugas, aktivitas, catatan_tim, gudang, stok_item,
-- riwayat_stok, kategori_produk, kategori_merek) diganti total di
-- bagian bawah supaya mensyaratkan STATUS 'aktif', bukan cuma "sudah
-- login". Jadi walau seseorang memanggil Supabase API langsung dari
-- luar aplikasi (lewat sesi auth yang sah tapi statusnya masih
-- 'menunggu'), dia tetap tidak akan mendapat satu baris data pun.
--
-- Aman dijalankan berulang kali / kapan pun, termasuk di database yang
-- sudah berisi banyak pengguna & data (akun yang SUDAH ADA sebelum
-- migrasi ini otomatis dianggap 'aktif' — lihat blok backfill di bawah
-- — supaya tidak ada admin/anggota yang tiba-tiba terkunci keluar).
-- =========================================================

-- ---- 1. Kolom status_akun pada profil ----
-- Ditambahkan TANPA default dulu, supaya bisa diisi 'aktif' untuk
-- seluruh baris yang SUDAH ADA sebelum default 'menunggu' berlaku
-- (default hanya dipakai untuk baris yang di-INSERT setelah ini).
alter table profil add column if not exists status_akun text;
update profil set status_akun = 'aktif' where status_akun is null;
alter table profil alter column status_akun set default 'menunggu';
alter table profil alter column status_akun set not null;
alter table profil drop constraint if exists profil_status_akun_check;
alter table profil add constraint profil_status_akun_check check (status_akun in ('menunggu','aktif','ditolak'));
create index if not exists idx_profil_status_akun on profil (status_akun);

-- ---- 2. Trigger pendaftaran: akun baru otomatis 'menunggu', BUKAN langsung aktif ----
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profil (id, nama, email, peran, status_akun)
  values (new.id, coalesce(new.raw_user_meta_data->>'nama', split_part(new.email,'@',1)), new.email, 'anggota', 'menunggu');
  return new;
end;
$$ language plpgsql security definer;
-- (trigger on_auth_user_created dari v3 tidak perlu dibuat ulang — cukup
-- fungsinya yang di-CREATE OR REPLACE di atas, triggernya tetap sama)

-- ---- Jadikan diri Anda admin pertama (DIPERBARUI dari v3) ----
-- Daftar dulu 1 akun lewat aplikasi (menu Daftar) — akun ini akan
-- berstatus 'menunggu' seperti pendaftar lain, jadi belum bisa masuk.
-- Jalankan baris di bawah ini SENDIRI (ganti email) untuk menjadikannya
-- Admin pertama SEKALIGUS langsung mengaktifkannya:
-- update profil set peran = 'admin', status_akun = 'aktif' where email = 'email_anda@contoh.com';

-- ---- 3. Fungsi bantu: peran pengguna saat ini, HANYA jika akunnya 'aktif' ----
-- SECURITY DEFINER & dipanggil di dalam kebijakan RLS di bawah supaya
-- TIDAK terjadi rekursi tak berujung (query di dalam fungsi ini
-- melewati RLS tabel profil, karena berjalan sebagai pemilik fungsi).
-- Mengembalikan NULL jika belum login ATAU akunnya belum/tidak aktif —
-- sehingga `peran_aktif_saya() in (...)` maupun `= 'admin'` otomatis
-- bernilai salah (bukan error) untuk akun 'menunggu'/'ditolak'.
create or replace function public.peran_aktif_saya()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select peran from profil where id = auth.uid() and status_akun = 'aktif' limit 1;
$$;
grant execute on function public.peran_aktif_saya() to authenticated, anon;

-- ---- 4. Cegah pengguna biasa mengubah peran/status_akun milik sendiri ----
-- Kebijakan UPDATE profil (lihat #6) mengizinkan seseorang mengubah
-- BARIS miliknya sendiri (supaya bisa ubah nama/foto/jabatan di menu
-- Pengaturan) — tapi RLS "using" hanya menyaring BARIS mana yang boleh
-- disentuh, bukan KOLOM apa yang boleh diubah. Tanpa trigger ini,
-- pengguna mana pun bisa memanggil `.update({peran:'admin'})` pada
-- baris dirinya sendiri lewat DevTools/API dan menaikkan hak aksesnya
-- sendiri — celah yang sudah ada sejak v5 dan ditutup di sini. Hanya
-- Admin yang berstatus aktif (atau proses tanpa sesi auth sama sekali,
-- mis. dijalankan lewat SQL Editor oleh pemilik project) yang boleh
-- mengubah kolom peran/status_akun; selain itu perubahan pada dua
-- kolom tsb otomatis dikembalikan diam-diam ke nilai semula.
create or replace function public.cegah_perubahan_peran_status_tanpa_izin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and (new.peran is distinct from old.peran or new.status_akun is distinct from old.status_akun)
     and coalesce(public.peran_aktif_saya(), '') <> 'admin' then
    new.peran := old.peran;
    new.status_akun := old.status_akun;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cegah_perubahan_peran_status on profil;
create trigger trg_cegah_perubahan_peran_status
  before update on profil
  for each row execute procedure public.cegah_perubahan_peran_status_tanpa_izin();

-- ---- 5. RPC: Admin menghapus PERMANEN akun yang sudah ditolak ----
-- Opsional — dipakai tombol "Hapus Permanen" di menu Kelola Pengguna
-- untuk akun berstatus 'ditolak' (supaya orang yang sama tidak bisa
-- mendaftar ulang dengan email yang sama tanpa akun lamanya dibersihkan
-- dulu). SECURITY DEFINER supaya bisa menghapus dari skema auth (yang
-- normalnya tertutup untuk role authenticated). Jika project Supabase
-- Anda membatasi hak fungsi ini menghapus dari auth.users, hapus akun
-- tsb manual lewat Dashboard > Authentication > Users sebagai gantinya.
create or replace function public.hapus_pengguna_ditolak(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if coalesce(public.peran_aktif_saya(), '') <> 'admin' then
    raise exception 'Hanya Admin aktif yang boleh menghapus akun pengguna.';
  end if;
  if not exists (select 1 from profil where id = target_id and status_akun = 'ditolak') then
    raise exception 'Hanya akun berstatus Ditolak yang boleh dihapus permanen lewat fungsi ini.';
  end if;
  delete from auth.users where id = target_id; -- baris profil ikut terhapus otomatis (on delete cascade)
end;
$$;
grant execute on function public.hapus_pengguna_ditolak(uuid) to authenticated;

-- ---- 6. PROFIL: perketat SELECT (akun sendiri selalu terlihat; profil
-- pengguna lain hanya terlihat untuk akun yang sudah 'aktif') & rapikan
-- UPDATE memakai peran_aktif_saya() ----
drop policy if exists "pengguna login dapat membaca semua profil" on profil;
create policy "profil sendiri selalu terlihat, aktif melihat semua" on profil for select using (
  auth.uid() = id or public.peran_aktif_saya() is not null
);

drop policy if exists "pengguna memperbarui profil sendiri atau admin mengubah siapapun" on profil;
create policy "pengguna memperbarui profil sendiri atau admin mengubah siapapun" on profil for update using (
  auth.uid() = id or public.peran_aktif_saya() = 'admin'
);

-- ---- 7. PELANGGAN: syaratkan status 'aktif', bukan cuma "sudah login" ----
drop policy if exists "pengguna login dapat membaca pelanggan" on pelanggan;
create policy "akun aktif dapat membaca pelanggan" on pelanggan for select using (
  public.peran_aktif_saya() is not null);

drop policy if exists "admin anggota marketing dapat menambah pelanggan" on pelanggan;
create policy "admin anggota marketing dapat menambah pelanggan" on pelanggan for insert with check (
  public.peran_aktif_saya() in ('admin','anggota','marketing'));

drop policy if exists "admin anggota marketing dapat mengubah pelanggan" on pelanggan;
create policy "admin anggota marketing dapat mengubah pelanggan" on pelanggan for update using (
  public.peran_aktif_saya() in ('admin','anggota','marketing'));

drop policy if exists "hanya admin dapat menghapus pelanggan" on pelanggan;
create policy "hanya admin dapat menghapus pelanggan" on pelanggan for delete using (
  public.peran_aktif_saya() = 'admin');

-- ---- 8. PROYEK ----
drop policy if exists "pengguna login dapat membaca proyek" on proyek;
create policy "akun aktif dapat membaca proyek" on proyek for select using (
  public.peran_aktif_saya() is not null);

drop policy if exists "admin anggota dapat menambah proyek" on proyek;
create policy "admin anggota dapat menambah proyek" on proyek for insert with check (
  public.peran_aktif_saya() in ('admin','anggota'));

drop policy if exists "admin anggota dapat mengubah proyek" on proyek;
create policy "admin anggota dapat mengubah proyek" on proyek for update using (
  public.peran_aktif_saya() in ('admin','anggota'));

drop policy if exists "hanya admin dapat menghapus proyek" on proyek;
create policy "hanya admin dapat menghapus proyek" on proyek for delete using (
  public.peran_aktif_saya() = 'admin');

-- ---- 9. TUGAS ----
drop policy if exists "lihat tugas sendiri atau semua jika admin" on tugas;
create policy "lihat tugas sendiri atau semua jika admin" on tugas for select using (
  public.peran_aktif_saya() is not null and (
    ditugaskan_ke = auth.uid() or ditugaskan_oleh = auth.uid() or ditugaskan_ke is null or
    public.peran_aktif_saya() = 'admin'
  ));

drop policy if exists "admin anggota dapat menambah tugas" on tugas;
create policy "admin anggota dapat menambah tugas" on tugas for insert with check (
  public.peran_aktif_saya() in ('admin','anggota'));

drop policy if exists "pemilik tugas atau admin dapat mengubah tugas" on tugas;
create policy "pemilik tugas atau admin dapat mengubah tugas" on tugas for update using (
  public.peran_aktif_saya() is not null and (
    ditugaskan_ke = auth.uid() or ditugaskan_oleh = auth.uid() or public.peran_aktif_saya() = 'admin'
  ));

drop policy if exists "hanya admin dapat menghapus tugas" on tugas;
create policy "hanya admin dapat menghapus tugas" on tugas for delete using (
  public.peran_aktif_saya() = 'admin');

-- ---- 10. AKTIVITAS ----
drop policy if exists "pengguna login dapat membaca aktivitas" on aktivitas;
create policy "akun aktif dapat membaca aktivitas" on aktivitas for select using (
  public.peran_aktif_saya() is not null);

drop policy if exists "pengguna login dapat menambah aktivitas" on aktivitas;
create policy "akun aktif dapat menambah aktivitas" on aktivitas for insert with check (
  public.peran_aktif_saya() is not null);

-- ---- 11. CATATAN TIM (menu Pesan) ----
drop policy if exists "pengguna login dapat membaca catatan tim" on catatan_tim;
create policy "akun aktif dapat membaca catatan tim" on catatan_tim for select using (
  public.peran_aktif_saya() is not null);

drop policy if exists "admin anggota dapat menambah catatan tim" on catatan_tim;
create policy "admin anggota dapat menambah catatan tim" on catatan_tim for insert with check (
  public.peran_aktif_saya() in ('admin','anggota'));

drop policy if exists "admin anggota dapat menghapus catatan tim" on catatan_tim;
create policy "admin anggota dapat menghapus catatan tim" on catatan_tim for delete using (
  public.peran_aktif_saya() in ('admin','anggota'));

-- ---- 12. PENGATURAN PERUSAHAAN (select tetap publik utk branding di layar masuk) ----
drop policy if exists "hanya admin dapat mengubah pengaturan perusahaan" on pengaturan_perusahaan;
create policy "hanya admin dapat mengubah pengaturan perusahaan" on pengaturan_perusahaan
  for update using (public.peran_aktif_saya() = 'admin');
drop policy if exists "hanya admin dapat menambah pengaturan perusahaan" on pengaturan_perusahaan;
create policy "hanya admin dapat menambah pengaturan perusahaan" on pengaturan_perusahaan
  for insert with check (public.peran_aktif_saya() = 'admin');

-- ---- 13. GUDANG ----
drop policy if exists "pengguna login dapat membaca gudang" on gudang;
create policy "akun aktif dapat membaca gudang" on gudang for select using (
  public.peran_aktif_saya() is not null);

drop policy if exists "admin anggota purchasing dapat menambah gudang" on gudang;
create policy "admin anggota purchasing dapat menambah gudang" on gudang for insert with check (
  public.peran_aktif_saya() in ('admin','anggota','purchasing'));

drop policy if exists "admin anggota purchasing dapat mengubah gudang" on gudang;
create policy "admin anggota purchasing dapat mengubah gudang" on gudang for update using (
  public.peran_aktif_saya() in ('admin','anggota','purchasing'));

drop policy if exists "hanya admin dapat menghapus gudang" on gudang;
create policy "hanya admin dapat menghapus gudang" on gudang for delete using (
  public.peran_aktif_saya() = 'admin');

-- ---- 14. STOK ITEM ----
drop policy if exists "pengguna login dapat membaca stok item" on stok_item;
create policy "akun aktif dapat membaca stok item" on stok_item for select using (
  public.peran_aktif_saya() is not null);

drop policy if exists "admin anggota purchasing dapat menambah stok item" on stok_item;
create policy "admin anggota purchasing dapat menambah stok item" on stok_item for insert with check (
  public.peran_aktif_saya() in ('admin','anggota','purchasing'));

drop policy if exists "admin anggota purchasing dapat mengubah stok item" on stok_item;
create policy "admin anggota purchasing dapat mengubah stok item" on stok_item for update using (
  public.peran_aktif_saya() in ('admin','anggota','purchasing'));

drop policy if exists "admin purchasing dapat menghapus stok item" on stok_item;
create policy "admin purchasing dapat menghapus stok item" on stok_item for delete using (
  public.peran_aktif_saya() in ('admin','purchasing'));

-- ---- 15. RIWAYAT STOK ----
drop policy if exists "pengguna login dapat membaca riwayat stok" on riwayat_stok;
create policy "akun aktif dapat membaca riwayat stok" on riwayat_stok for select using (
  public.peran_aktif_saya() is not null);

drop policy if exists "admin anggota purchasing dapat menambah riwayat stok" on riwayat_stok;
create policy "admin anggota purchasing dapat menambah riwayat stok" on riwayat_stok for insert with check (
  public.peran_aktif_saya() in ('admin','anggota','purchasing'));

drop policy if exists "admin anggota purchasing dapat mengubah riwayat stok" on riwayat_stok;
create policy "admin anggota purchasing dapat mengubah riwayat stok" on riwayat_stok for update using (
  public.peran_aktif_saya() in ('admin','anggota','purchasing'));

drop policy if exists "admin purchasing dapat menghapus riwayat stok" on riwayat_stok;
create policy "admin purchasing dapat menghapus riwayat stok" on riwayat_stok for delete using (
  public.peran_aktif_saya() in ('admin','purchasing'));

-- ---- 16. KATEGORI PRODUK & KATEGORI MEREK ----
drop policy if exists "pengguna login dapat membaca kategori produk" on kategori_produk;
create policy "akun aktif dapat membaca kategori produk" on kategori_produk for select using (
  public.peran_aktif_saya() is not null);

drop policy if exists "admin anggota purchasing dapat menambah kategori produk" on kategori_produk;
create policy "admin anggota purchasing dapat menambah kategori produk" on kategori_produk for insert with check (
  public.peran_aktif_saya() in ('admin','anggota','purchasing'));

drop policy if exists "admin anggota purchasing dapat mengubah kategori produk" on kategori_produk;
create policy "admin anggota purchasing dapat mengubah kategori produk" on kategori_produk for update using (
  public.peran_aktif_saya() in ('admin','anggota','purchasing'));

drop policy if exists "hanya admin dapat menghapus kategori produk" on kategori_produk;
create policy "hanya admin dapat menghapus kategori produk" on kategori_produk for delete using (
  public.peran_aktif_saya() = 'admin');

drop policy if exists "pengguna login dapat membaca kategori merek" on kategori_merek;
create policy "akun aktif dapat membaca kategori merek" on kategori_merek for select using (
  public.peran_aktif_saya() is not null);

drop policy if exists "admin anggota purchasing dapat menambah kategori merek" on kategori_merek;
create policy "admin anggota purchasing dapat menambah kategori merek" on kategori_merek for insert with check (
  public.peran_aktif_saya() in ('admin','anggota','purchasing'));

drop policy if exists "admin anggota purchasing dapat mengubah kategori merek" on kategori_merek;
create policy "admin anggota purchasing dapat mengubah kategori merek" on kategori_merek for update using (
  public.peran_aktif_saya() in ('admin','anggota','purchasing'));

drop policy if exists "hanya admin dapat menghapus kategori merek" on kategori_merek;
create policy "hanya admin dapat menghapus kategori merek" on kategori_merek for delete using (
  public.peran_aktif_saya() = 'admin');

-- ---- 17. Realtime utk tabel profil — supaya (a) layar "Menunggu
-- Persetujuan" pengguna otomatis berubah begitu Admin menyetujui, TANPA
-- perlu refresh manual, dan (b) badge "Menunggu Persetujuan" di menu
-- Kelola Pengguna Admin ikut ter-update live saat ada pendaftar baru ----
do $$
begin
  begin
    alter publication supabase_realtime add table profil;
  exception when duplicate_object then null;
  end;
end $$;

-- =========================================================
-- TAMBAHAN v25 — KOLOM "DIBUAT OLEH" & "UPDATE TERAKHIR" PADA PELANGGAN
-- Menambahkan kolom dibuat_oleh_id/nama dan diupdate_oleh_id/nama/
-- diupdate_pada pada tabel pelanggan, supaya menu "Pelanggan" bisa
-- menampilkan kolom "Dibuat Oleh" (siapa yang menambahkan data
-- pelanggan) dan "Update Terakhir" (kapan data pelanggan tersebut
-- terakhir diubah) — konsisten dengan pola yang sudah dipakai pada
-- tabel proyek (lihat v8 & v12) dan stok_item (lihat v10).
-- Nilainya diisi otomatis oleh aplikasi (script.js) setiap kali data
-- pelanggan ditambah atau diedit — bukan lewat trigger database.
-- Aman dijalankan berulang kali / di database yang sudah berisi data.
-- =========================================================
alter table pelanggan add column if not exists dibuat_oleh_id uuid references profil(id) on delete set null;
alter table pelanggan add column if not exists dibuat_oleh_nama text;
alter table pelanggan add column if not exists diupdate_oleh_id uuid references profil(id) on delete set null;
alter table pelanggan add column if not exists diupdate_oleh_nama text;
alter table pelanggan add column if not exists diupdate_pada timestamptz default now();

-- ---- Samakan data lama: pakai dibuat_pada sebagai "update terakhir" awal,
-- dan tandai "Sistem" sebagai pembuat data pelanggan yang sudah ada sebelum
-- migrasi ini, supaya kolom baru tidak tampil kosong untuk data lama ----
update pelanggan set diupdate_pada = dibuat_pada where diupdate_pada is null;
update pelanggan set dibuat_oleh_nama = 'Sistem' where dibuat_oleh_nama is null;

-- =========================================================
-- TAMBAHAN v26 — AKSES MENU "RINGKASAN" UNTUK PERAN MARKETING
-- (KPI PRIBADI) & PEMBATASAN MENU "PELANGGAN" HANYA UNTUK DATA
-- PELANGGAN MILIK MARKETING YBS
--
-- Sebelumnya peran Marketing sama sekali tidak bisa membuka menu
-- Ringkasan (lihat data-roles di index.html versi lama) dan bisa
-- melihat SEMUA baris pelanggan tanpa batas (kebijakan SELECT pada
-- migrasi v7 mengizinkan siapa pun yang statusnya aktif).
--
-- Perubahan pada migrasi ini:
--   1. Menu Ringkasan sekarang BOLEH dibuka oleh Marketing (lihat
--      perubahan data-roles di index.html) — tapi datanya (KPI, grafik,
--      tabel "Pelanggan Teratas" & "Proyek Bernilai Tertinggi") otomatis
--      hanya berisi pelanggan yang MEREKA SENDIRI tambahkan (kolom
--      dibuat_oleh_id, lihat migrasi v25), karena script.js memuat
--      seluruh data lewat SELECT * — jadi pembatasannya harus terjadi
--      di sini (RLS), bukan di JS.
--   2. Menu Pelanggan mengikuti pembatasan yang sama: Marketing hanya
--      melihat baris pelanggan yang dibuat_oleh_id = akun mereka sendiri.
--      Admin, Anggota, dan Purchasing TIDAK terpengaruh — tetap melihat
--      seluruh data seperti sebelumnya.
--   3. Tabel proyek ikut dibatasi utk peran Marketing supaya kartu
--      "Proyek Bernilai Tertinggi" & grafik di Ringkasan mereka juga
--      cuma menghitung proyek milik pelanggan yang mereka tangani
--      (dicocokkan lewat proyek.pelanggan_id -> pelanggan.dibuat_oleh_id).
--
-- CATATAN: jika sebuah baris pelanggan lama belum punya dibuat_oleh_id
-- (data seed / data sebelum migrasi v25 yang ditandai dibuat_oleh_nama
-- = 'Sistem'), baris tsb TIDAK AKAN muncul bagi peran Marketing manapun
-- (dibuat_oleh_id-nya NULL, tidak match auth.uid() siapapun). Ini
-- disengaja: data lama tanpa pemilik jelas sebaiknya di-assign ulang
-- oleh Admin (buka baris pelanggan tsb, simpan ulang) supaya kolom
-- dibuat_oleh_id terisi dan baru muncul di akun Marketing yg sesuai.
-- Aman dijalankan berulang kali.
-- =========================================================

-- ---- PELANGGAN: Marketing hanya lihat baris miliknya sendiri ----
drop policy if exists "akun aktif dapat membaca pelanggan" on pelanggan;
create policy "akun aktif dapat membaca pelanggan" on pelanggan for select using (
  public.peran_aktif_saya() is not null and (
    public.peran_aktif_saya() <> 'marketing' or dibuat_oleh_id = auth.uid()
  ));

-- ---- PROYEK: Marketing hanya lihat proyek milik pelanggan yg mereka tangani ----
drop policy if exists "akun aktif dapat membaca proyek" on proyek;
create policy "akun aktif dapat membaca proyek" on proyek for select using (
  public.peran_aktif_saya() is not null and (
    public.peran_aktif_saya() <> 'marketing' or exists (
      select 1 from pelanggan
      where pelanggan.id = proyek.pelanggan_id
        and pelanggan.dibuat_oleh_id = auth.uid()
    )
  ));

-- =========================================================
-- TAMBAHAN v27 — FILTER MARKETING DICOCOKKAN LEWAT NAMA (dibuat_oleh_nama)
-- SELAIN LEWAT AKUN (dibuat_oleh_id), TIDAK HANYA SALAH SATU SAJA
--
-- Pada v26, baris pelanggan HANYA dianggap "milik" seorang Marketing kalau
-- dibuat_oleh_id-nya persis sama dengan akun (auth.uid()) yang sedang login.
-- Ini menyebabkan data lama yang belum sempat memiliki dibuat_oleh_id (mis.
-- data sebelum migrasi v25, atau data yang di-assign manual oleh Admin lewat
-- nama saja) tidak pernah muncul, walau nama pembuatnya (dibuat_oleh_nama)
-- sebenarnya cocok dengan nama akun Marketing tsb (contoh: "Andhina",
-- "Purwoko").
--
-- Migrasi ini menambahkan fungsi helper public.nama_aktif_saya() (pola yang
-- sama seperti public.peran_aktif_saya()) yang mengembalikan kolom "nama"
-- dari tabel profil milik akun yang sedang login. Kebijakan SELECT pelanggan
-- & proyek untuk Marketing kemudian dicocokkan lewat DUA syarat sekaligus
-- (OR, bukan cuma salah satu):
--   a) dibuat_oleh_id = akun yang sedang login, ATAU
--   b) dibuat_oleh_nama = nama akun yang sedang login (perbandingan tidak
--      case-sensitive lewat lower(), supaya "Andhina" & "andhina" tetap
--      cocok)
--
-- Konsekuensi praktis: SELAIN otomatis ter-assign ke pembuatnya (dibuat_oleh
-- lewat aplikasi), Admin sekarang juga bisa "meng-assign" pelanggan lama ke
-- seorang Marketing cukup dengan mengisi/menyamakan kolom dibuat_oleh_nama
-- pelanggan tsb dengan kolom nama di profil Marketing ybs — TANPA harus
-- membuka & menyimpan ulang baris tsb dari akun Marketing yang bersangkutan.
--
-- CATATAN: karena pencocokan nama bersifat teks biasa (bukan ID unik), jika
-- ada dua akun Marketing dengan nama PERSIS SAMA, keduanya akan sama-sama
-- melihat baris pelanggan yang nama pembuatnya cocok itu. Kalau ini jadi
-- masalah di tim Anda, sebaiknya pastikan nama tiap akun Marketing unik, atau
-- gunakan cara pencocokan ID saja (v26) dengan meng-assign ulang lewat
-- aplikasi. Aman dijalankan berulang kali.
-- =========================================================

create or replace function public.nama_aktif_saya()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select nama from profil where id = auth.uid() and status_akun = 'aktif' limit 1;
$$;
grant execute on function public.nama_aktif_saya() to authenticated, anon;

-- ---- PELANGGAN: cocokkan lewat akun (id) ATAU nama ----
drop policy if exists "akun aktif dapat membaca pelanggan" on pelanggan;
create policy "akun aktif dapat membaca pelanggan" on pelanggan for select using (
  public.peran_aktif_saya() is not null and (
    public.peran_aktif_saya() <> 'marketing'
    or dibuat_oleh_id = auth.uid()
    or lower(coalesce(dibuat_oleh_nama,'')) = lower(coalesce(public.nama_aktif_saya(),'__tidak_ada__'))
  ));

-- ---- PROYEK: ikut cocokkan lewat pelanggan yg id ATAU namanya match ----
drop policy if exists "akun aktif dapat membaca proyek" on proyek;
create policy "akun aktif dapat membaca proyek" on proyek for select using (
  public.peran_aktif_saya() is not null and (
    public.peran_aktif_saya() <> 'marketing' or exists (
      select 1 from pelanggan
      where pelanggan.id = proyek.pelanggan_id
        and (
          pelanggan.dibuat_oleh_id = auth.uid()
          or lower(coalesce(pelanggan.dibuat_oleh_nama,'')) = lower(coalesce(public.nama_aktif_saya(),'__tidak_ada__'))
        )
    )
  ));

-- =========================================================
-- TAMBAHAN v28 — AKSES MENU "AKTIVITAS", "TUGAS", "KALENDER",
-- "LAPORAN" & "NOTIFIKASI" UNTUK PERAN MARKETING (HANYA DATA
-- MILIK NAMA/AKUN MEREKA SENDIRI)
--
-- Perubahan pada migrasi ini HANYA menyangkut tabel AKTIVITAS.
-- Tiga menu lainnya TIDAK perlu perubahan RLS karena datanya sudah
-- otomatis terfilter lewat mekanisme yang sudah ada:
--   - Menu Tugas & widget Kalender/Notifikasi terkait tugas: kebijakan
--     SELECT tabel "tugas" (lihat migrasi v9) SUDAH membatasi setiap
--     akun non-admin (termasuk Marketing) hanya melihat tugas yang
--     ditugaskan ke/oleh dirinya sendiri, atau tugas yang belum
--     ditugaskan ke siapa pun.
--   - Menu Laporan, Kalender (bagian proyek), & KPI terkait proyek:
--     memakai tabel "pelanggan" & "proyek" yang SUDAH dibatasi utk
--     Marketing lewat migrasi v26/v27 (hanya pelanggan/proyek yang
--     dibuat_oleh_id ATAU dibuat_oleh_nama cocok dengan akun ybs).
--
-- Tabel AKTIVITAS (log riwayat "X menambahkan Y", "Z memperbarui W",
-- dst.) sebelumnya bisa dibaca penuh oleh SIAPA SAJA yang statusnya
-- aktif (migrasi v10), tanpa peduli siapa pelakunya — supaya menu
-- Aktivitas & Notifikasi Marketing HANYA menampilkan log yang mereka
-- sendiri hasilkan (pelaku_id / pelaku_nama, lihat migrasi v4),
-- kebijakan SELECT-nya dipersempit khusus utk peran Marketing dengan
-- pola pencocokan yang SAMA seperti pelanggan/proyek (v27): lewat ID
-- akun ATAU lewat nama (tidak case-sensitive), supaya log lama yang
-- pelaku_id-nya belum terisi tapi pelaku_nama-nya sudah benar tetap
-- ikut muncul.
--
-- CATATAN: log aktivitas lama (sebelum migrasi v4, kolom pelaku_id/
-- pelaku_nama masih NULL) TIDAK AKAN muncul bagi peran Marketing
-- manapun — sama seperti catatan pada migrasi v26 untuk data pelanggan
-- lama. Admin/Anggota tetap melihat SELURUH log seperti biasa.
-- Aman dijalankan berulang kali.
-- =========================================================

drop policy if exists "akun aktif dapat membaca aktivitas" on aktivitas;
create policy "akun aktif dapat membaca aktivitas" on aktivitas for select using (
  public.peran_aktif_saya() is not null and (
    public.peran_aktif_saya() <> 'marketing'
    or pelaku_id = auth.uid()
    or lower(coalesce(pelaku_nama,'')) = lower(coalesce(public.nama_aktif_saya(),'__tidak_ada__'))
  ));

-- =========================================================
-- TAMBAHAN v29 — MARKETING BOLEH MENAMBAHKAN PROYEK BARU
--
-- Sebelumnya hanya Admin & Anggota yang boleh INSERT ke tabel proyek.
-- Tombol "Tambah Proyek" di halaman detail pelanggan (menu Pelanggan)
-- sebenarnya sudah tampil bagi Marketing sejak awal (tidak ada
-- data-roles yang menyembunyikannya di index.html) — hanya saja
-- permintaan INSERT-nya selalu ditolak RLS. Migrasi ini mengizinkan
-- Marketing menambah proyek, TAPI hanya untuk pelanggan yang memang
-- mereka tangani sendiri (dicocokkan lewat dibuat_oleh_id ATAU
-- dibuat_oleh_nama pada baris pelanggan tsb, pola yang sama dengan
-- migrasi v26/v27) — supaya mereka tidak bisa diam-diam menambahkan
-- proyek atas nama pelanggan milik marketing lain.
--
-- script.js (simpanProyek, mode tambah) SUDAH otomatis mengisi
-- dibuat_oleh_id/dibuat_oleh_nama proyek dengan akun yang sedang login
-- — jadi tidak perlu perubahan apa pun di script.js.
--
-- CATATAN: migrasi ini HANYA menambah hak INSERT. Hak UPDATE (edit)
-- dan DELETE (hapus) proyek TETAP terbatas Admin & Anggota seperti
-- sebelumnya (lihat kebijakan "admin anggota dapat mengubah proyek"
-- & "hanya admin dapat menghapus proyek" pada migrasi v8/v22) — kalau
-- Marketing juga perlu bisa mengedit/menghapus proyek yang mereka buat
-- sendiri, beri tahu supaya ditambahkan kebijakan terpisah untuk itu.
-- Aman dijalankan berulang kali.
-- =========================================================
drop policy if exists "admin anggota dapat menambah proyek" on proyek;
create policy "admin anggota marketing dapat menambah proyek" on proyek for insert with check (
  public.peran_aktif_saya() in ('admin','anggota')
  or (
    public.peran_aktif_saya() = 'marketing'
    and exists (
      select 1 from pelanggan
      where pelanggan.id = proyek.pelanggan_id
        and (
          pelanggan.dibuat_oleh_id = auth.uid()
          or lower(coalesce(pelanggan.dibuat_oleh_nama,'')) = lower(coalesce(public.nama_aktif_saya(),'__tidak_ada__'))
        )
    )
  ));
