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
  pelanggan_id uuid references pelanggan(id) on delete set null,
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
