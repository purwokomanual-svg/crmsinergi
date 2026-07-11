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
