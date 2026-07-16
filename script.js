/* =========================================================
   DEALSTACK CRM — LOGIKA APLIKASI (script.js)
   Versi ini terhubung ke database Supabase (PostgreSQL).
   Semua data (pelanggan, proyek, tugas, aktivitas) dibaca
   dan ditulis langsung ke tabel Supabase lewat supabaseClient
   yang didefinisikan di config.js.
   ========================================================= */

/* Cache data di memori, diisi dari Supabase saat halaman dimuat
   dan diperbarui lagi setiap ada perubahan (tambah/hapus/ubah) */
let DATA = { pelanggan: [], proyek: [], tugas: [], aktivitas: [], catatan: [], profil: [], gudang: [], stokItem: [], riwayatStok: [], kategoriProduk: [], kategoriMerek: [], perusahaan: { nama_perusahaan: 'Dealstack', logo_url: null } };

/* BUGFIX (audit): escape teks sebelum disisipkan lewat innerHTML.
   Sebelumnya banyak field isian pengguna (nama pelanggan, catatan tim,
   deskripsi tugas, dll) ditulis langsung ke innerHTML tanpa disaring,
   sehingga teks seperti <img src=x onerror=...> akan DIEKSEKUSI sebagai
   HTML/JS sungguhan di browser pengguna lain (stored XSS). Semua tempat
   yang menampilkan teks bebas dari pengguna WAJIB dibungkus esc(...). */
function esc(nilai){
  if(nilai === null || nilai === undefined) return '';
  return String(nilai)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
/* BUGFIX (audit): log Aktivitas menyimpan teks dengan tag <b>...</b> bawaan
   (mis. "Pelanggan <b>Acme</b> dihapus") supaya nama tampil tebal. esc()
   biasa akan membuat tag ini tampil sebagai teks "<b>" mentah. escB()
   meng-escape semuanya seperti esc(), lalu HANYA mengembalikan tag <b> dan
   </b> polos (tanpa atribut) ke bentuk aslinya — variasi apa pun dengan
   atribut (mis. <b onmouseover=...>) tetap ter-escape sebagai teks biasa,
   jadi ini tidak membuka kembali celah XSS. */
function escB(nilai){
  return esc(nilai).replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>');
}

/* Pengguna yang sedang login (diisi setelah autentikasi berhasil) */
let CURRENT_USER = null; // { id, nama, email, peran }
let APLIKASI_SUDAH_DIMUAT = false;
/* Channel Realtime yang dipakai langgananStatusAkunSendiri() untuk memantau
   status_akun milik diri sendiri selagi menunggu persetujuan Admin — dibuat
   modul-level (bukan lokal di dalam fungsi) supaya tidak berlangganan
   dobel kalau masukKeAplikasi() terpanggil ulang (mis. saat Supabase
   memicu event TOKEN_REFRESHED), dan supaya bisa dibersihkan saat logout. */
let _channelStatusAkunSendiri = null;

/* Pengaturan tampilan yang dipilih pengguna, disimpan di localStorage
   (browser lokal saja, bukan di database) supaya tetap tersimpan
   antar kunjungan tanpa perlu login. */
let PENGATURAN = { rupiahRingkas: true, notifAktif: true, ringkasanFavorit: false };
function muatPengaturan(){
  try{
    const raw = localStorage.getItem('dealstack_pengaturan');
    if(raw) PENGATURAN = Object.assign(PENGATURAN, JSON.parse(raw));
  }catch(e){ console.error(e); }
  document.getElementById('setting-rupiah-ringkas').checked = PENGATURAN.rupiahRingkas;
  document.getElementById('setting-notif-aktif').checked = PENGATURAN.notifAktif;
  const btnFavorit = document.getElementById('btn-favorit-ringkasan');
  if(btnFavorit) btnFavorit.style.color = PENGATURAN.ringkasanFavorit ? 'var(--accent-bright)' : '';
}
function simpanPengaturan(){
  PENGATURAN.rupiahRingkas = document.getElementById('setting-rupiah-ringkas').checked;
  PENGATURAN.notifAktif = document.getElementById('setting-notif-aktif').checked;
  localStorage.setItem('dealstack_pengaturan', JSON.stringify(PENGATURAN));
  renderKPI(); renderPelanggan(); segarkanDetailPelangganJikaAktif(); renderLaporan();
  renderRingkasanTabelPelanggan(); renderRingkasanTabelProyek();
  renderNotifikasi();
  tampilkanToast('Pengaturan disimpan');
}

/* ---------------------------------------------------------
   0z. TEMA TAMPILAN (mode gelap / mode terang)
   Disimpan di localStorage supaya konsisten di seluruh aplikasi
   (termasuk sidebar, topbar, dropdown, dan modal), dan sudah
   diterapkan lebih awal lewat script kecil di <head> index.html
   supaya tidak ada kedipan (flash) saat halaman dimuat ulang.
--------------------------------------------------------- */
const TEMA_KEY = 'dealstack_tema';

/* Path ikon bulan (gelap aktif) dan matahari (terang aktif) untuk
   dipakai di knob sakelar (ikon di dalam bola geser) */
const IKON_BULAN = '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>';
const IKON_MATAHARI = '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8L6 18M18 6l1.8-1.8"/>';

function temaAktif(){
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

/* Menyamakan tampilan semua kontrol tema (sakelar di dropdown +
   label teks) dengan atribut data-theme yang sedang aktif di <html>.
   Dipanggil setiap kali halaman dimuat & setiap kali tema berganti. */
function sinkronkanUITema(){
  const terang = temaAktif() === 'light';
  const sakelar = document.getElementById('theme-switch');
  const label = document.getElementById('label-tema-aktif');
  const ikonKnob = document.getElementById('icon-knob-tema');
  if(sakelar){
    sakelar.dataset.on = terang ? 'true' : 'false';
    sakelar.setAttribute('aria-checked', terang ? 'true' : 'false');
  }
  if(label) label.textContent = terang ? 'Terang' : 'Gelap';
  if(ikonKnob) ikonKnob.innerHTML = terang ? IKON_MATAHARI : IKON_BULAN;
}

/* Berpindah antara mode gelap <-> terang. Dipanggil dari tombol cepat
   di topbar maupun sakelar di dropdown "Pengaturan Tampilan". */
function toggleTema(){
  const temaBaru = temaAktif() === 'light' ? 'dark' : 'light';
  if(temaBaru === 'light'){
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  try{ localStorage.setItem(TEMA_KEY, temaBaru); }catch(e){}
  sinkronkanUITema();
}

/* ---------------------------------------------------------
   0a. IDENTITAS PERUSAHAAN (logo & nama, tampil di sidebar +
   layar masuk untuk semua orang — bisa dibaca tanpa login)
--------------------------------------------------------- */
async function muatBrandingPerusahaan(){
  try{
    const { data, error } = await supabaseClient.from('pengaturan_perusahaan').select('*').eq('id', 1).single();
    if(error || !data){
      console.warn('Tabel pengaturan_perusahaan belum tersedia. Jalankan migrasi v6 di schema.sql.', error);
      return;
    }
    DATA.perusahaan = data;
    terapkanBrandingPerusahaan();
  }catch(e){ console.warn('Gagal memuat identitas perusahaan', e); }
}
function terapkanBrandingPerusahaan(){
  const nama = (DATA.perusahaan && DATA.perusahaan.nama_perusahaan) || 'Dealstack';
  const logo = DATA.perusahaan && DATA.perusahaan.logo_url;
  document.querySelectorAll('.brand-name').forEach(el => el.textContent = nama);
  document.title = nama + ' — CRM Monitoring Proyek & Penjualan';
  ['brand-mark-sidebar','brand-mark-auth'].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    el.innerHTML = logo
      ? `<img src="${logo}" alt="${nama}" style="width:100%;height:100%;object-fit:contain;border-radius:9px;">`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M12 3v7M12 14v7M5 12h4M15 12h4"/></svg>`;
  });
}

/* ---------------------------------------------------------
   0. AUTENTIKASI (Supabase Auth: masuk, daftar, keluar, peran)
--------------------------------------------------------- */
function gantiTabAuth(tab){
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-daftar').classList.toggle('active', tab === 'daftar');
  document.getElementById('form-login').classList.toggle('hidden', tab !== 'login');
  document.getElementById('form-daftar').classList.toggle('hidden', tab !== 'daftar');
}

function tampilkanPesanAuth(id, pesan, error){
  const el = document.getElementById(id);
  el.textContent = pesan;
  el.className = 'auth-msg ' + (error ? 'error' : 'ok');
}

async function tanganiLogin(e){
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  tampilkanPesanAuth('login-msg', 'Memproses...', false);
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if(error){
    tampilkanPesanAuth('login-msg', error.message.includes('Invalid') ? 'Email atau kata sandi salah.' : error.message, true);
    return;
  }
  tampilkanPesanAuth('login-msg', 'Berhasil masuk...', false);
  // onAuthStateChange akan menangani transisi ke aplikasi
}

async function tanganiDaftar(e){
  e.preventDefault();
  const nama = document.getElementById('daftar-nama').value.trim();
  const email = document.getElementById('daftar-email').value.trim();
  const password = document.getElementById('daftar-password').value;
  tampilkanPesanAuth('daftar-msg', 'Memproses...', false);
  const { data, error } = await supabaseClient.auth.signUp({
    email, password, options: { data: { nama } }
  });
  if(error){
    tampilkanPesanAuth('daftar-msg', error.message, true);
    return;
  }
  if(data.session){
    tampilkanPesanAuth('daftar-msg', 'Akun dibuat! Menunggu persetujuan Admin sebelum bisa mengakses aplikasi...', false);
  } else {
    tampilkanPesanAuth('daftar-msg', 'Akun dibuat! Jika verifikasi email diaktifkan di project Anda, cek kotak masuk dulu — akun tetap perlu disetujui Admin sebelum bisa mengakses aplikasi.', false);
  }
}

function konfirmasiKeluar(){
  tutupSemuaDropdown();
  bukaModal('modal-keluar');
}
async function prosesKeluar(){
  await supabaseClient.auth.signOut();
  localStorage.removeItem('dealstack_pengaturan');
  window.location.reload();
}

/* Label tampilan untuk setiap peran — satu sumber kebenaran dipakai di
   seluruh aplikasi (panel akun, Pengawasan Tim, Kelola Pengguna, dst.)
   supaya labelnya selalu konsisten begitu ada peran baru ditambahkan. */
/* True jika peran pengguna saat ini boleh menghapus KARTU STOK (stok_item)
   & RIWAYAT STOK (riwayat_stok) — Admin dan Purchasing, sesuai kebijakan
   RLS migrasi v22 di schema.sql. SENGAJA TIDAK dipakai untuk Gudang/
   Kategori/Merek — penghapusan struktur data tsb tetap khusus Admin
   (lihat variabel `isAdmin` yang masih dipakai apa adanya di
   hapusGudang/hapusKategori/hapusMerek). */
function bolehKelolaStok(){
  return !!(CURRENT_USER && (CURRENT_USER.peran === 'admin' || CURRENT_USER.peran === 'purchasing'));
}

function labelPeran(peran){
  switch(peran){
    case 'admin': return 'Administrator';
    case 'marketing': return 'Marketing';
    case 'purchasing': return 'Purchasing';
    default: return 'Anggota Tim';
  }
}

/* Label & kelas badge untuk status_akun (SEJAK v24) — satu sumber
   kebenaran dipakai di menu Kelola Pengguna supaya konsisten. Baris
   profil dari SEBELUM migrasi v24 tidak punya status_akun sama sekali
   (undefined) — dianggap 'aktif' supaya tidak ada yang tiba-tiba
   terkunci keluar begitu migrasi dijalankan. */
function labelStatusAkun(status){
  switch(status){
    case 'menunggu': return 'Menunggu Persetujuan';
    case 'ditolak': return 'Ditolak';
    default: return 'Aktif';
  }
}
function kelasBadgeStatusAkun(status){
  switch(status){
    case 'menunggu': return 'tertunda';
    case 'ditolak': return 'dibatalkan';
    default: return 'aktif';
  }
}
/* Hanya akun berstatus 'aktif' (disetujui Admin) yang boleh muncul
   sebagai anggota tim yang bisa ditugaskan/ditampilkan beban kerjanya —
   dipakai di dropdown assignee Tugas, baris "Anggota Tim" di Ringkasan,
   & "Pengawasan Tim". Menu Kelola Pengguna SENGAJA TIDAK memakai fungsi
   ini karena Admin justru perlu melihat & memproses akun 'menunggu'/
   'ditolak' di sana (lihat renderPenggunaAdmin). */
function profilAktif(){
  return DATA.profil.filter(p => (p.status_akun || 'aktif') === 'aktif');
}

function terapkanPeran(){
  const peran = CURRENT_USER ? CURRENT_USER.peran : null;
  const isAdmin = peran === 'admin';
  // Sembunyikan/tampilkan menu & kartu Pengaturan berdasarkan atribut
  // data-roles="admin,anggota,..." (daftar peran yang boleh melihat
  // elemen tsb, dipisah koma). Elemen TANPA atribut ini selalu tampil
  // untuk siapa pun yang sudah login (mis. menu Pengaturan, Pusat
  // Bantuan, tombol Keluar) — lihat migrasi v22 di schema.sql untuk
  // pembatasan hak TULIS yang sesungguhnya di level database.
  document.querySelectorAll('[data-roles]').forEach(el => {
    const rolesDiizinkan = el.dataset.roles.split(',').map(r => r.trim());
    el.style.display = (peran && rolesDiizinkan.includes(peran)) ? '' : 'none';
  });
  document.getElementById('user-name').textContent = CURRENT_USER ? CURRENT_USER.nama : '—';
  document.getElementById('user-avatar').outerHTML = CURRENT_USER
    ? markupAvatar(CURRENT_USER).replace('class="user-avatar"', 'class="user-avatar" id="user-avatar"')
    : '<div class="user-avatar" id="user-avatar">?</div>';
  document.getElementById('panel-akun-nama').textContent = CURRENT_USER ? CURRENT_USER.nama : '—';
  document.getElementById('panel-akun-peran').textContent = labelPeran(peran);
}

/* Dipanggil sekali saat login berhasil: muat profil pengguna & seluruh data aplikasi.
   SEJAK v24: sebelum memuat APA PUN, dicek dulu profil.status_akun pengguna —
   akun yang belum disetujui ('menunggu') atau ditolak ('ditolak') Admin TIDAK
   diberi akses ke #app-shell sama sekali (bukan cuma disembunyikan via CSS,
   tapi memang tidak ada satu pun query data bisnis yang dijalankan), dan
   ditampilkan layar #layar-status-akun sebagai gantinya. Ini konsisten dengan
   RLS di database (lihat migrasi v24 di schema.sql) yang juga menolak akun
   tsb membaca data apa pun — jadi pembatasannya sungguhan di dua lapis. */
async function masukKeAplikasi(session){
  const { data: profil, error } = await supabaseClient.from('profil').select('*').eq('id', session.user.id).single();
  let profilPengguna;
  if(error || !profil){
    console.warn('Profil belum ditemukan (migrasi v3 mungkin belum dijalankan). Menggunakan data dasar dari akun.', error);
    // BUGFIX (audit): sebelumnya jika profil GAGAL dimuat (migrasi belum
    // jalan, koneksi terputus, dll), pengguna otomatis diperlakukan sebagai
    // 'admin' di sisi klien — menampilkan menu/tombol khusus Admin
    // (Kelola Pengguna, Hapus, Pengawasan Tim) ke pengguna biasa. Default
    // yang aman untuk kondisi gagal/tidak diketahui adalah hak paling
    // rendah ('anggota'), bukan hak tertinggi. status_akun juga diasumsikan
    // 'aktif' di kondisi gagal ini SUPAYA project yang belum menjalankan
    // migrasi v24 (kolom status_akun belum ada) tidak mendadak terkunci.
    profilPengguna = { id: session.user.id, nama: session.user.email.split('@')[0], email: session.user.email, peran: 'anggota', status_akun: 'aktif' };
  } else {
    profilPengguna = profil;
  }

  // Kolom status_akun baru ada sejak migrasi v24 — kalau project belum
  // menjalankan migrasi tsb, field ini akan undefined pada baris profil
  // lama; anggap 'aktif' supaya tidak ada yang tiba-tiba terkunci keluar
  // sebelum Admin sempat menjalankan migrasi v24 di schema.sql.
  const statusAkun = profilPengguna.status_akun || 'aktif';

  if(statusAkun !== 'aktif'){
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.add('hidden');
    tampilkanLayarStatusAkun(statusAkun, profilPengguna.email);
    langgananStatusAkunSendiri(session.user.id);
    return; // STOP — jangan muat data bisnis apa pun sebelum disetujui Admin
  }

  document.getElementById('layar-status-akun').classList.add('hidden');
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  if(APLIKASI_SUDAH_DIMUAT) return;
  APLIKASI_SUDAH_DIMUAT = true;

  CURRENT_USER = profilPengguna;
  muatPengaturan();
  terapkanPeran();
  initNavigasi();
  initEventListener();
  await muatSemuaData();
  await muatBrandingPerusahaan();
  renderRingkasan(); // BUGFIX: dulu daftar manual (KPI, donut, tim, tabel, tag) — sekarang satu fungsi refresh total, sama seperti dipakai di tempat lain
  renderPelanggan();
  isiDropdownPelangganProyek();
  renderFunnel();
  renderAktivitas();
  renderTugas();
  renderPesan();
  renderNotifikasi();
  renderStatGudang();
  if(CURRENT_USER.peran === 'admin'){ renderPengawasanTim(); renderPenggunaAdmin(); }
  initRealtime();

  // Menu "Ringkasan" (dashboard umum) disembunyikan untuk peran Marketing
  // (lihat data-roles di index.html) — jadi begitu masuk, langsung arahkan
  // ke satu-satunya menu yang relevan bagi peran tsb, bukan menampilkan
  // halaman Ringkasan yang toh tidak bisa mereka lihat. Purchasing SEKARANG
  // juga bisa membuka Ringkasan (versi terbatas: hanya kartu Statistik
  // Proyek & Peringatan Stok Gudang yang tampil, lihat data-roles di
  // index.html), tapi tetap diarahkan ke Stock & Gudang lebih dulu karena
  // itu menu utama pekerjaan sehari-hari peran ini.
  if(CURRENT_USER.peran === 'marketing') pindahTampilan('pelanggan');
  else if(CURRENT_USER.peran === 'purchasing') pindahTampilan('gudang');
}

/* Menampilkan #layar-status-akun dengan konten sesuai status akun —
   'menunggu' (default) menampilkan blok #status-akun-menunggu, 'ditolak'
   menampilkan blok #status-akun-ditolak. Dipanggil pertama kali dari
   masukKeAplikasi() begitu status akun diketahui BUKAN 'aktif', dan
   dipanggil ULANG oleh langgananStatusAkunSendiri() di bawah jika Admin
   mengubah status akun ini ke 'ditolak' selagi pengguna masih menunggu
   di layar ini (transisi ke 'aktif' TIDAK lewat sini — lihat catatan di
   langgananStatusAkunSendiri, itu langsung masuk ke aplikasi). */
function tampilkanLayarStatusAkun(status, email){
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('layar-status-akun').classList.remove('hidden');
  const blokMenunggu = document.getElementById('status-akun-menunggu');
  const blokDitolak = document.getElementById('status-akun-ditolak');
  if(status === 'ditolak'){
    blokMenunggu.classList.add('hidden');
    blokDitolak.classList.remove('hidden');
    document.getElementById('status-akun-email-ditolak').textContent = email || '—';
  } else {
    blokDitolak.classList.add('hidden');
    blokMenunggu.classList.remove('hidden');
    document.getElementById('status-akun-email').textContent = email || '—';
  }
}

/* Tombol "Keluar" di layar status akun — logout penuh & reload, sama
   seperti prosesKeluar() (lihat fungsi itu), supaya channel Realtime
   langgananStatusAkunSendiri() ikut bersih tanpa perlu dilepas manual. */
async function keluarDariLayarStatusAkun(){
  await supabaseClient.auth.signOut();
  window.location.reload();
}

/* Dipanggil dari masukKeAplikasi() SETIAP KALI status akun pengguna
   BUKAN 'aktif' (baru mendaftar / ditolak) — berlangganan perubahan
   pada baris profil miliknya sendiri, supaya begitu Admin menyetujui
   atau menolak pendaftarannya, layar #layar-status-akun langsung
   bereaksi TANPA perlu memuat ulang halaman secara manual:
     • status_akun -> 'aktif'   : sesi yang sama dipakai memanggil ulang
       masukKeAplikasi(), yang kali ini akan lolos dari gerbang status
       akun & langsung memuat seluruh aplikasi seperti login normal.
     • status_akun -> 'ditolak' : layar diperbarui di tempat menjadi
       tampilan "Pendaftaran Ditolak", tanpa reload.
   Dijaga dengan _channelStatusAkunSendiri supaya TIDAK berlangganan
   dobel jika fungsi ini terpanggil lagi (mis. event TOKEN_REFRESHED
   dari Supabase memicu masukKeAplikasi() ulang selagi masih menunggu). */
function langgananStatusAkunSendiri(userId){
  if(typeof supabaseClient.channel !== 'function') return; // versi supabase-js lama tanpa Realtime v2
  if(_channelStatusAkunSendiri) return; // sudah berlangganan, jangan buat channel baru
  _channelStatusAkunSendiri = supabaseClient.channel('status-akun-' + userId)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profil', filter: `id=eq.${userId}` }, (payload) => {
      const statusBaru = payload.new.status_akun;
      if(statusBaru === 'aktif'){
        supabaseClient.removeChannel(_channelStatusAkunSendiri);
        _channelStatusAkunSendiri = null;
        supabaseClient.auth.getSession().then(({ data }) => { if(data.session) masukKeAplikasi(data.session); });
      } else {
        tampilkanLayarStatusAkun(statusBaru, payload.new.email);
      }
    })
    .subscribe();
}

function initAuthUI(){
  document.getElementById('form-login').addEventListener('submit', tanganiLogin);
  document.getElementById('form-daftar').addEventListener('submit', tanganiDaftar);

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if(session){
      masukKeAplikasi(session);
    } else if(event === 'SIGNED_OUT'){
      APLIKASI_SUDAH_DIMUAT = false;
      CURRENT_USER = null;
      _channelStatusAkunSendiri = null; // channel-nya sudah otomatis diputus Supabase saat sign-out
      document.getElementById('app-shell').classList.add('hidden');
      document.getElementById('layar-status-akun').classList.add('hidden');
      document.getElementById('auth-screen').classList.remove('hidden');
    }
  });

  supabaseClient.auth.getSession().then(({ data }) => {
    if(data.session) masukKeAplikasi(data.session);
  });
}

/* ---------------------------------------------------------
   1. UTIL
--------------------------------------------------------- */
function formatRupiah(v){
  v = Number(v) || 0;
  if(!PENGATURAN.rupiahRingkas) return 'Rp' + v.toLocaleString('id-ID');
  if(v >= 1000000) return 'Rp' + (v/1000000).toFixed(1).replace('.0','') + 'Jt';
  if(v >= 1000) return 'Rp' + (v/1000).toFixed(0) + 'rb';
  return 'Rp' + v;
}
function formatTanggal(iso){
  if(!iso) return '—';
  const bln = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const d = new Date(iso);
  return d.getDate() + ' ' + bln[d.getMonth()] + ' ' + d.getFullYear();
}

/* ---------------------------------------------------------
   1a. FILTER "PERIODE DATA" — dipakai di berbagai halaman
   (Pelanggan, Proyek Pelanggan, Aktivitas, Laporan, dst).
   Setiap halaman memasang:
     <select id="filter-periode-{prefix}">  → semua|harian|bulanan|semester|tahunan|custom
     <div id="wrap-periode-custom-{prefix}"> → 2 input tanggal, hanya tampil saat mode custom
       <input id="periode-dari-{prefix}"> <input id="periode-sampai-{prefix}">
   Lalu di fungsi render halaman tsb panggil dapatkanRentangPeriode('{prefix}')
   dan saring data dengan tanggalDalamRentang(field_tanggal, awal, akhir).
--------------------------------------------------------- */
function hitungRentangPeriode(mode, customDari, customSampai){
  const now = new Date();
  const awalHariIni = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch(mode){
    case 'harian':
      return { awal: awalHariIni, akhir: new Date(awalHariIni.getTime() + 86400000 - 1) };
    case 'bulanan':
      return {
        awal: new Date(now.getFullYear(), now.getMonth(), 1),
        akhir: new Date(new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime() - 1)
      };
    case 'semester': {
      const semesterKe = now.getMonth() < 6 ? 0 : 1; // 0 = Jan-Jun, 1 = Jul-Des
      return {
        awal: new Date(now.getFullYear(), semesterKe * 6, 1),
        akhir: new Date(new Date(now.getFullYear(), semesterKe * 6 + 6, 1).getTime() - 1)
      };
    }
    case 'tahunan':
      return {
        awal: new Date(now.getFullYear(), 0, 1),
        akhir: new Date(new Date(now.getFullYear() + 1, 0, 1).getTime() - 1)
      };
    case 'custom':
      return {
        awal: customDari ? new Date(customDari + 'T00:00:00') : null,
        akhir: customSampai ? new Date(customSampai + 'T23:59:59') : null
      };
    default: // 'semua' → tanpa batas
      return { awal: null, akhir: null };
  }
}

/* Membaca nilai select + input custom sebuah halaman (via id prefix)
   dan mengembalikan { awal, akhir } siap pakai untuk penyaringan. */
function dapatkanRentangPeriode(prefix){
  const select = document.getElementById(`filter-periode-${prefix}`);
  const mode = select ? select.value : 'semua';
  const dari = document.getElementById(`periode-dari-${prefix}`)?.value || '';
  const sampai = document.getElementById(`periode-sampai-${prefix}`)?.value || '';
  return hitungRentangPeriode(mode, dari, sampai);
}

/* Tampil/sembunyikan sepasang input tanggal custom saat dropdown diganti ke "custom" */
function toggleInputPeriodeCustom(prefix){
  const mode = document.getElementById(`filter-periode-${prefix}`)?.value;
  const wrap = document.getElementById(`wrap-periode-custom-${prefix}`);
  if(wrap) wrap.classList.toggle('hidden', mode !== 'custom');
}

/* Cek apakah sebuah tanggal (string/ISO) berada dalam rentang { awal, akhir }.
   awal & akhir bernilai null berarti tanpa batas (mis. mode "Semua Waktu"). */
function tanggalDalamRentang(tanggalStr, awal, akhir){
  if(!awal && !akhir) return true;
  if(!tanggalStr) return false;
  const t = new Date(tanggalStr);
  if(isNaN(t.getTime())) return false;
  if(awal && t < awal) return false;
  if(akhir && t > akhir) return false;
  return true;
}

function labelStatusProyek(s){
  return { berjalan:'Berjalan', selesai:'Selesai', tertunda:'Tertunda', dibatalkan:'Dibatalkan' }[s] || s;
}
function labelStatusPelanggan(s){
  return { aktif:'Aktif', tertunda:'Tertunda', nonaktif:'Nonaktif' }[s] || s;
}
function tampilkanToast(pesan, error){
  const toast = document.getElementById('toast');
  toast.querySelector('span:last-child').textContent = pesan;
  toast.querySelector('.dot').style.background = error ? 'var(--red)' : 'var(--green)';
  toast.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}
function kodeAcak(prefix){
  return prefix + '-' + Math.floor(Math.random()*9000+1000);
}
/* Markup avatar bulat: pakai foto profil jika ada, jika tidak fallback ke inisial nama */
function markupAvatar(profil){
  if(!profil) return `<div class="user-avatar">?</div>`;
  if(profil.avatar_url) return `<div class="user-avatar"><img src="${esc(profil.avatar_url)}" alt="${esc(profil.nama) || ''}"></div>`;
  return `<div class="user-avatar">${(profil.nama || '?').charAt(0).toUpperCase()}</div>`;
}

/* ---------------------------------------------------------
   1b. DROPDOWN (notifikasi / pengaturan / akun / pencarian / lainnya)
--------------------------------------------------------- */
function tutupSemuaDropdown(kecuali){
  document.querySelectorAll('.dropdown-panel').forEach(p => {
    if(p.id !== kecuali) p.classList.add('hidden');
  });
}
function toggleDropdown(id){
  const panel = document.getElementById(id);
  const sedangTerbuka = !panel.classList.contains('hidden');
  tutupSemuaDropdown();
  panel.classList.toggle('hidden', sedangTerbuka);
}
document.addEventListener('click', (e) => {
  if(!e.target.closest('.dropdown-wrap')) tutupSemuaDropdown();
});

/* ---------------------------------------------------------
   1c. PENCARIAN GLOBAL (topbar)
--------------------------------------------------------- */
function cariGlobal(q){
  const panel = document.getElementById('search-dropdown');
  q = (q || '').trim().toLowerCase();
  if(!q){ panel.classList.add('hidden'); return; }

  const pelanggan = DATA.pelanggan.filter(p => p.nama.toLowerCase().includes(q) || (p.industri||'').toLowerCase().includes(q)).slice(0,4);
  const proyek = DATA.proyek.filter(p => p.nama.toLowerCase().includes(q) || p.pelanggan_nama.toLowerCase().includes(q)).slice(0,4);
  const tugas = DATA.tugas.filter(t => t.judul.toLowerCase().includes(q)).slice(0,4);
  const stok = DATA.stokItem.filter(i => i.sku.toLowerCase().includes(q) || i.nama_produk.toLowerCase().includes(q) || (i.variant||'').toLowerCase().includes(q)).slice(0,4);

  if(!pelanggan.length && !proyek.length && !tugas.length && !stok.length){
    panel.innerHTML = `<div class="search-empty">Tidak ada hasil untuk "${q}"</div>`;
    panel.classList.remove('hidden');
    return;
  }

  let html = '';
  if(pelanggan.length){
    html += `<div class="search-result-group">Pelanggan</div>`;
    html += pelanggan.map(p => `<div class="search-result-item" onclick="bukaHasilPencarian('pelanggan','${p.id}')"><b>${esc(p.nama)}</b><span>${esc(p.industri) || 'Umum'} · ${labelStatusPelanggan(p.status)}</span></div>`).join('');
  }
  if(proyek.length){
    html += `<div class="search-result-group">Proyek</div>`;
    html += proyek.map(p => `<div class="search-result-item" onclick="bukaHasilPencarian('proyek','${p.id}')"><b>${esc(p.nama)}</b><span>${labelPelangganProyek(p)} · ${labelStatusProyek(p.status)}</span></div>`).join('');
  }
  if(tugas.length){
    html += `<div class="search-result-group">Tugas</div>`;
    html += tugas.map(t => `<div class="search-result-item" onclick="bukaHasilPencarian('tugas','${t.id}')"><b>${esc(t.judul)}</b><span>${labelStatusKerja(statusKerjaTugas(t))}</span></div>`).join('');
  }
  if(stok.length){
    html += `<div class="search-result-group">Stock &amp; Gudang</div>`;
    html += stok.map(i => `<div class="search-result-item" onclick="bukaHasilPencarian('stok','${i.id}')"><b>${esc(i.nama_produk)} (${esc(i.sku)})</b><span>${namaGudang(i.gudang_id)} · ${labelStatusStok(hitungStatusStok(i))}</span></div>`).join('');
  }
  panel.innerHTML = html;
  panel.classList.remove('hidden');
}
function bukaHasilPencarian(jenis, id){
  document.getElementById('search-dropdown').classList.add('hidden');
  document.getElementById('global-search').value = '';
  if(jenis === 'pelanggan'){
    pindahTampilan('pelanggan');
    document.getElementById('cari-pelanggan').value = DATA.pelanggan.find(p=>p.id===id)?.nama || '';
    renderPelanggan();
  } else if(jenis === 'proyek'){
    const proyek = DATA.proyek.find(p=>p.id===id);
    if(proyek){
      const idPelanggan = proyek.pelanggan_id || DATA.pelanggan.find(x => x.nama === proyek.pelanggan_nama)?.id;
      bukaDetailPelanggan(idPelanggan);
      document.getElementById('cari-proyek-detail').value = proyek.nama;
      renderProyekDetail();
    }
  } else if(jenis === 'tugas'){
    pindahTampilan('tugas');
  } else if(jenis === 'stok'){
    pindahTampilan('gudang');
    const item = DATA.stokItem.find(i=>i.id===id);
    document.getElementById('cari-gudang').value = item ? item.sku : '';
    renderGudang();
  }
}

/* ---------------------------------------------------------
   1d. NOTIFIKASI (jatuh tempo proyek/tugas + aktivitas terbaru)
--------------------------------------------------------- */
function hariMenujuTenggat(iso){
  if(!iso) return null;
  const sekarang = new Date(); sekarang.setHours(0,0,0,0);
  const t = new Date(iso); t.setHours(0,0,0,0);
  return Math.round((t - sekarang) / 86400000);
}
function hitungNotifikasi(){
  const hasil = [];
  // Purchasing hanya menerima notifikasi proyek/tugas yang terkait dengan
  // dirinya sendiri (bukan seluruh proyek/tugas perusahaan). Notifikasi
  // Stock & Gudang tetap ditampilkan apa adanya karena itu memang inti
  // tanggung jawab peran Purchasing.
  const isPurchasing = CURRENT_USER && CURRENT_USER.peran === 'purchasing';
  DATA.proyek.forEach(p => {
    if(p.status === 'selesai' || p.status === 'dibatalkan') return;
    if(isPurchasing && p.dibuat_oleh_id !== CURRENT_USER.id) return;
    const sisa = hariMenujuTenggat(p.tenggat);
    if(sisa !== null && sisa <= 3){
      hasil.push({
        judul: sisa < 0 ? `Proyek "${esc(p.nama)}" telah lewat tenggat` : `Proyek "${esc(p.nama)}" jatuh tempo ${sisa === 0 ? 'hari ini' : 'dalam ' + sisa + ' hari'}`,
        meta: p.pelanggan_nama, urgent: sisa <= 0, urutan: sisa
      });
    }
  });
  DATA.tugas.filter(t => statusKerjaTugas(t) !== 'selesai').filter(t => !isPurchasing || t.ditugaskan_ke === CURRENT_USER.id || t.ditugaskan_oleh === CURRENT_USER.id).forEach(t => {
    const d = tenggatKeTanggal(t.tenggat);
    if(d){
      const sisa = hariMenujuTenggat(d.toISOString().slice(0,10));
      if(sisa !== null && sisa <= 3){
        hasil.push({ judul: `Tugas "${esc(t.judul)}" ${sisa < 0 ? 'terlambat' : (sisa===0?'jatuh tempo hari ini':'jatuh tempo dalam '+sisa+' hari')}`, meta: 'Tugas', urgent: sisa <= 0, urutan: sisa });
      }
    }
  });
  DATA.stokItem.filter(i => i.status !== 'nonaktif').forEach(i => {
    const status = hitungStatusStok(i);
    if(status === 'habis'){
      hasil.push({ judul: `Stok "${esc(i.nama_produk)}" (${esc(i.sku)}) di ${namaGudang(i.gudang_id)} habis`, meta: 'Stock & Gudang', urgent: true, urutan: -1 });
    } else if(status === 'menipis'){
      hasil.push({ judul: `Stok "${esc(i.nama_produk)}" (${esc(i.sku)}) di ${namaGudang(i.gudang_id)} menipis (sisa ${sisaStok(i)})`, meta: 'Stock & Gudang', urgent: false, urutan: 2 });
    }
  });
  hasil.sort((a,b) => a.urutan - b.urutan);
  return hasil;
}
function renderNotifikasi(){
  const daftar = document.getElementById('list-notifikasi');
  const badge = document.getElementById('badge-notifikasi');
  if(!PENGATURAN.notifAktif){
    daftar.innerHTML = `<div class="search-empty">Notifikasi dinonaktifkan di Pengaturan.</div>`;
    badge.classList.add('hidden');
    return;
  }
  const notif = hitungNotifikasi();
  if(!notif.length){
    daftar.innerHTML = `<div class="search-empty">Tidak ada tenggat mendesak. 👍</div>`;
    badge.classList.add('hidden');
  } else {
    daftar.innerHTML = notif.map(n => `
      <div class="notif-item">
        <div class="notif-dot ${n.urgent ? 'red' : ''}"></div>
        <div><div class="notif-title">${n.judul}</div><div class="notif-meta">${esc(n.meta)}</div></div>
      </div>`).join('');
    badge.textContent = notif.length;
    badge.classList.remove('hidden');
  }
}

/* ---------------------------------------------------------
   2. LAPISAN DATA — SUPABASE
   Semua fungsi di bawah ini melakukan query ke database.
--------------------------------------------------------- */
async function muatSemuaData(){
  const [pelanggan, proyek, tugas, aktivitas, catatan, profil, gudang, stokItem, riwayatStok, kategoriProduk, kategoriMerek] = await Promise.all([
    supabaseClient.from('pelanggan').select('*').order('dibuat_pada', { ascending: false }),
    supabaseClient.from('proyek').select('*').order('dibuat_pada', { ascending: false }),
    supabaseClient.from('tugas').select('*').order('dibuat_pada', { ascending: false }),
    supabaseClient.from('aktivitas').select('*').order('dibuat_pada', { ascending: false }).limit(80),
    supabaseClient.from('catatan_tim').select('*').order('dibuat_pada', { ascending: false }),
    supabaseClient.from('profil').select('*').order('nama', { ascending: true }),
    supabaseClient.from('gudang').select('*').order('nama', { ascending: true }),
    supabaseClient.from('stok_item').select('*').order('nama_produk', { ascending: true }),
    supabaseClient.from('riwayat_stok').select('*').order('dibuat_pada', { ascending: false }),
    supabaseClient.from('kategori_produk').select('*').order('nama', { ascending: true }),
    supabaseClient.from('kategori_merek').select('*').order('nama', { ascending: true }),
  ]);

  if(pelanggan.error || proyek.error || tugas.error || aktivitas.error){
    console.error(pelanggan.error || proyek.error || tugas.error || aktivitas.error);
    tampilkanToast('Gagal memuat data dari Supabase. Cek config.js & koneksi.', true);
    return;
  }

  DATA.pelanggan = pelanggan.data || [];
  DATA.proyek = proyek.data || [];
  DATA.tugas = tugas.data || [];
  DATA.aktivitas = aktivitas.data || [];
  // Tabel catatan_tim / profil mungkin belum ada jika migrasi v2/v3 belum dijalankan —
  // jangan gagalkan seluruh aplikasi kalau tabel ini belum ada.
  DATA.catatan = catatan.error ? (console.warn('Tabel catatan_tim belum tersedia.', catatan.error), []) : (catatan.data || []);
  DATA.profil = profil.error ? (console.warn('Tabel profil belum tersedia. Jalankan migrasi v3 di schema.sql.', profil.error), []) : (profil.data || []);
  // Tabel gudang / stok_item mungkin belum ada jika migrasi v10 belum dijalankan.
  DATA.gudang = gudang.error ? (console.warn('Tabel gudang belum tersedia. Jalankan migrasi v10 di schema.sql.', gudang.error), []) : (gudang.data || []);
  DATA.stokItem = stokItem.error ? (console.warn('Tabel stok_item belum tersedia. Jalankan migrasi v10 di schema.sql.', stokItem.error), []) : (stokItem.data || []);
  // Kolom detail (No DO/Pelanggan/No PO/Proyek/Satuan) mungkin belum ada jika migrasi v11 belum dijalankan.
  DATA.riwayatStok = riwayatStok.error ? (console.warn('Tabel riwayat_stok belum lengkap. Jalankan migrasi v11 di schema.sql.', riwayatStok.error), []) : (riwayatStok.data || []);
  // Tabel kategori_produk mungkin belum ada jika migrasi v17 belum dijalankan.
  DATA.kategoriProduk = kategoriProduk.error ? (console.warn('Tabel kategori_produk belum tersedia. Jalankan migrasi v17 di schema.sql.', kategoriProduk.error), []) : (kategoriProduk.data || []);
  // Tabel kategori_merek mungkin belum ada jika migrasi v18 belum dijalankan.
  DATA.kategoriMerek = kategoriMerek.error ? (console.warn('Tabel kategori_merek belum tersedia. Jalankan migrasi v18 di schema.sql.', kategoriMerek.error), []) : (kategoriMerek.data || []);
}

async function catatAktivitas(tipe, teks){
  const baris = { tipe, teks, pelaku_id: CURRENT_USER ? CURRENT_USER.id : null, pelaku_nama: CURRENT_USER ? CURRENT_USER.nama : null };
  const { data, error } = await supabaseClient.from('aktivitas').insert(baris).select().single();
  if(error){
    console.error(error);
    // Kolom pelaku_id/pelaku_nama mungkin belum ada jika migrasi v4 belum dijalankan — coba lagi tanpa kolom itu.
    const fallback = await supabaseClient.from('aktivitas').insert({ tipe, teks }).select().single();
    if(fallback.error){ console.error(fallback.error); return; }
    DATA.aktivitas.unshift(fallback.data);
    renderAktivitas();
    return;
  }
  DATA.aktivitas.unshift(data);
  renderAktivitas();
}

/* ---------------------------------------------------------
   3. NAVIGASI ANTAR TAMPILAN (SPA sederhana)
--------------------------------------------------------- */
function pindahTampilan(namaView){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + namaView).classList.add('active');
  // Halaman detail pelanggan & detail stok keluar adalah sub-halaman dari menu
  // "Pelanggan" / "Stock & Gudang" di sidebar — jadi nav item induknya tetap
  // ditandai aktif saat berada di sana.
  const namaViewNav = namaView === 'pelanggan-detail' ? 'pelanggan'
    : (namaView === 'stok-detail' || namaView === 'manajemen-produk') ? 'gudang'
    : namaView;
  document.querySelectorAll('.nav-item[data-view]').forEach(el => {
    el.classList.toggle('active', el.dataset.view === namaViewNav);
  });
  tutupSidebarMobile();
  // BUGFIX (sinkronisasi dashboard): sebelumnya hanya renderChart() &
  // renderTagRingkasan() yang dipanggil di sini, sehingga kartu KPI, donut
  // status proyek, baris tim, dan tabel Top Pelanggan/Proyek TIDAK ikut
  // di-refresh saat berpindah ke halaman Ringkasan — nilainya baru berubah
  // kalau fungsi yang menghapus/mengubah data kebetulan memanggil render
  // yang tepat. Sekarang dipanggil satu fungsi refresh total agar dashboard
  // selalu menampilkan data terbaru dari DATA, apa pun yang terjadi sebelumnya.
  if(namaView === 'ringkasan'){ renderRingkasan(); }
  if(namaView === 'pelanggan-detail') renderDetailPelanggan();
  if(namaView === 'kalender') renderKalender();
  if(namaView === 'gudang') renderGudang();
  if(namaView === 'stok-detail') renderDetailStok();
  if(namaView === 'manajemen-produk') pindahTabManajemenProduk(MP_TAB_AKTIF);
  if(namaView === 'laporan') renderLaporan();
  if(namaView === 'pesan') renderPesan();
  if(namaView === 'integrasi') tesKoneksiSupabase();
  if(namaView === 'bantuan') renderFAQ();
  if(namaView === 'pengawasan') renderPengawasanTim();
  if(namaView === 'pengguna') renderPenggunaAdmin();
  if(namaView === 'pengaturan') renderPengaturanAkun();
}

/* ---------------------------------------------------------
   4. RENDER: KPI RINGKASAN (dihitung dari data proyek)
--------------------------------------------------------- */
/* Label singkat yang ditampilkan di badge kanan-atas tiap kartu KPI
   (mis. "Bulan Ini"), mengikuti mode filter "Periode Data" yang sedang
   dipilih di dropdown Ringkasan — supaya badge selalu jujur menunjukkan
   periode data yang benar-benar sedang ditampilkan, bukan teks statis. */
function labelPeriodeRingkasSingkat(mode){
  return { semua:'Semua Waktu', harian:'Hari Ini', bulanan:'Bulan Ini', semester:'Semester Ini', tahunan:'Tahun Ini', custom:'Periode Custom' }[mode] || 'Bulan Ini';
}
function renderKPI(){
  // Disamakan dengan aturan Grand Total di menu Pelanggan & Laporan: proyek
  // tertunda/dibatalkan dikecualikan dari nilai, dan pakai grand_total
  // (fallback ke field lama "nilai") supaya angka di Dashboard, Laporan,
  // dan menu Pelanggan selalu sinkron satu sama lain.
  // Seluruh perhitungan di bawah ini disaring dulu berdasarkan filter
  // "Periode Data" yang dipilih di menu Ringkasan (lihat toolbar periode),
  // supaya KPI selalu mencerminkan periode yang sedang dipilih pengguna.
  const { awal, akhir } = dapatkanRentangPeriode('ringkasan');
  const modePeriode = document.getElementById('filter-periode-ringkasan')?.value || 'bulanan';
  const proyekPeriode = DATA.proyek.filter(p => tanggalDalamRentang(p.tanggal, awal, akhir));

  const proyekAktif = proyekPeriode.filter(p => !['tertunda','dibatalkan'].includes(p.status));
  const totalNilai = proyekAktif.reduce((s,p) => s + (p.grand_total || p.nilai || 0), 0);
  const rataRata = proyekAktif.length ? totalNilai / proyekAktif.length : 0;
  const selesai = proyekPeriode.filter(p => p.status === 'selesai').length;
  const dibatalkan = proyekPeriode.filter(p => p.status === 'dibatalkan').length;
  const totalDitutup = selesai + dibatalkan;
  const winRate = totalDitutup ? Math.round((selesai/totalDitutup)*100) : 0;
  const jumlahProyek = proyekPeriode.length;

  document.getElementById('kpi-total-nilai').textContent = formatRupiah(totalNilai);
  document.getElementById('kpi-rata-rata').textContent = formatRupiah(Math.round(rataRata));
  document.getElementById('kpi-win-rate').textContent = winRate + '%';
  document.getElementById('kpi-jumlah-proyek').textContent = jumlahProyek;

  const labelSingkat = labelPeriodeRingkasSingkat(modePeriode);
  ['kpi-range-total-nilai','kpi-range-rata-rata','kpi-range-win-rate','kpi-range-jumlah-proyek'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.textContent = labelSingkat;
  });
}

/* BUGFIX (sinkronisasi dashboard): sebelumnya setiap fungsi yang mengubah
   data (hapus/tambah/edit proyek, pelanggan, stok, dst.) harus SECARA MANUAL
   memanggil satu-satu fungsi render dashboard yang relevan (renderKPI,
   renderRingkasanDonut, renderDashTeamRow, renderRingkasanTabelPelanggan,
   renderRingkasanTabelProyek, renderTagRingkasan). Kalau satu saja lupa
   dipanggil, atau perubahan data terjadi dari sumber lain (realtime dari
   tab/perangkat lain, atau perubahan langsung di Supabase), Ringkasan/
   Dashboard akan menampilkan angka yang basi walau data pelanggan/proyek/
   stok yang mendasarinya sudah berubah.

   renderRingkasan() di bawah ini adalah satu fungsi "refresh total" untuk
   seluruh kartu & tabel di halaman Ringkasan, dipanggil setiap kali halaman
   ini dibuka (lihat pindahTampilan) dan setiap kali ada perubahan data yang
   relevan (lewat Realtime), sehingga dashboard dijamin selalu sinkron dengan
   DATA terbaru tanpa bergantung pada setiap fungsi mengingat semua render
   yang harus dipanggil. */
function renderRingkasan(){
  renderChart();
  renderTagRingkasan();
  renderKPI();
  renderRingkasanDonut();
  renderRingkasanStokGudang();
  renderDashTeamRow();
  renderRingkasanTabelPelanggan();
  renderRingkasanTabelProyek();
}

function renderTagRingkasan(){
  const aktif = DATA.pelanggan.filter(p => p.status === 'aktif').length;
  const berjalan = DATA.proyek.filter(p => p.status === 'berjalan').length;
  document.getElementById('tag-pelanggan-aktif').textContent = aktif + ' Pelanggan Aktif';
  document.getElementById('tag-proyek-berjalan').textContent = berjalan + ' Proyek Berjalan';
  const hariIni = new Date();
  const bln = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  document.getElementById('tag-tanggal-ringkasan').textContent = hariIni.getDate() + ' ' + bln[hariIni.getMonth()] + ' ' + hariIni.getFullYear();
}

/* ---------------------------------------------------------
   4b. RENDER: KARTU BARU DASHBOARD RINGKASAN
       (donut status proyek, baris anggota tim, tabel top pelanggan/proyek)
--------------------------------------------------------- */
function renderRingkasanDonut(){
  const svg = document.getElementById('donut-svg');
  const legend = document.getElementById('donut-legend');
  const centerValue = document.getElementById('donut-center-value');
  if(!svg || !legend) return;

  const { awal, akhir } = dapatkanRentangPeriode('ringkasan');
  const proyekPeriode = DATA.proyek.filter(p => tanggalDalamRentang(p.tanggal, awal, akhir));

  const statuses = [
    { key:'berjalan',   label:'Berjalan',   color:'var(--blue)' },
    { key:'selesai',    label:'Selesai',    color:'var(--accent-bright)' },
    { key:'tertunda',   label:'Tertunda',   color:'var(--yellow)' },
    { key:'dibatalkan', label:'Dibatalkan', color:'var(--red)' },
  ];
  const total = proyekPeriode.length;
  const counts = statuses.map(s => proyekPeriode.filter(p => p.status === s.key).length);
  if(centerValue) centerValue.textContent = total;

  const r = 80, cx = 100, cy = 100, strokeWidth = 22, circumference = 2 * Math.PI * r;
  let markup = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" style="stroke:rgba(255,255,255,.06)" stroke-width="${strokeWidth}"></circle>`;
  let akumulasi = 0;
  if(total > 0){
    statuses.forEach((s, i) => {
      const jumlah = counts[i];
      if(!jumlah) return;
      const frac = jumlah / total;
      const dash = frac * circumference;
      const gap = circumference - dash;
      const rotasi = (akumulasi / total) * 360 - 90;
      akumulasi += jumlah;
      markup += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" style="stroke:${s.color}" stroke-width="${strokeWidth}" stroke-dasharray="${dash} ${gap}" stroke-linecap="butt" transform="rotate(${rotasi} ${cx} ${cy})"></circle>`;
    });
  }
  svg.innerHTML = markup;

  legend.innerHTML = total === 0
    ? `<div class="cell-muted">Belum ada data proyek.</div>`
    : statuses.map((s, i) => {
        const jumlah = counts[i];
        const pct = total ? Math.round((jumlah / total) * 100) : 0;
        return `<div class="donut-legend-row">
          <span class="donut-legend-dot" style="background:${s.color}"></span>
          <span class="donut-legend-name">${s.label}</span>
          <span class="donut-legend-count">${jumlah}</span>
          <span class="donut-legend-pct">${pct}%</span>
        </div>`;
      }).join('');
}

/* ---------------------------------------------------------
   4c. RINGKASAN — PERINGATAN STOK GUDANG (Surabaya & Jakarta)
   Menampilkan item berstatus "Stok Habis" & "Stok Menipis" untuk dua
   gudang spesifik langsung di dashboard, tanpa perlu buka menu Stock &
   Gudang. Dicocokkan berdasarkan NAMA gudang (bukan ID tetap), supaya
   tetap berfungsi normal walau gudang tsb diedit/dibuat ulang lewat
   tab Gudang pada "Manajemen Produk & Kategori" — dan menampilkan pesan yang jelas jika gudang dengan
   nama tsb belum terdaftar sama sekali.
--------------------------------------------------------- */
const IKON_GUDANG_DASH = '<path d="M21 8L12 3 3 8v9a1 1 0 001 1h4v-6h8v6h4a1 1 0 001-1V8z"/><path d="M3 8l9 5 9-5"/>';
const IKON_CENTANG_DASH = '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.3 2.3L16 9.5"/>';

function cariGudangBerdasarkanNama(potongan){
  const p = potongan.toLowerCase();
  return DATA.gudang.find(g => (g.nama || '').toLowerCase().includes(p)) || null;
}

/* Render satu kartu ("Gudang Surabaya" / "Gudang Jakarta"). Mengembalikan
   markup HTML string agar renderRingkasanStokGudang() tinggal menggabung
   dua kartu ke dalam satu baris (.dash-row-stok). */
function markupKartuStokGudang(potonganNama, labelKota){
  const g = cariGudangBerdasarkanNama(potonganNama);

  if(!g){
    return `
    <div class="stock-alert-card">
      <div class="stock-alert-head">
        <div class="stock-alert-title">
          <div class="stock-alert-title-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${IKON_GUDANG_DASH}</svg></div>
          <div><h4>Gudang ${esc(labelKota)}</h4><span>Belum terdaftar</span></div>
        </div>
      </div>
      <div class="stock-alert-empty stock-alert-missing">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
        <span>Gudang <b>${esc(labelKota)}</b> belum terdaftar.<br>Tambahkan lewat Stock &amp; Gudang → Manajemen Produk &amp; Kategori.</span>
      </div>
    </div>`;
  }

  const items = DATA.stokItem.filter(i => i.gudang_id === g.id);
  const bermasalah = items
    .map(i => ({ item:i, status:hitungStatusStok(i) }))
    .filter(x => x.status === 'habis' || x.status === 'menipis')
    // Habis ditampilkan lebih dulu, lalu urut dari sisa stok paling sedikit
    .sort((a,b) => {
      if(a.status !== b.status) return a.status === 'habis' ? -1 : 1;
      return sisaStok(a.item) - sisaStok(b.item);
    });

  const jumlahHabis = bermasalah.filter(x => x.status === 'habis').length;
  const jumlahMenipis = bermasalah.filter(x => x.status === 'menipis').length;

  const daftarHtml = !bermasalah.length
    ? `<div class="stock-alert-empty">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${IKON_CENTANG_DASH}</svg>
         <span>Semua stok di <b>${esc(g.nama)}</b> aman, tidak ada yang menipis atau habis.</span>
       </div>`
    : bermasalah.map(({item, status}) => `
      <div class="stock-alert-row" title="Klik untuk membuka detail di Stock & Gudang" onclick="bukaAlertStokGudang('${g.id}','${status}')">
        <div class="stock-alert-row-main">
          <span class="stock-alert-dot ${status}"></span>
          <div>
            <div class="stock-alert-row-name">${esc(item.nama_produk)}</div>
            <div class="stock-alert-row-sub">${esc(item.sku)}${item.variant ? ' · ' + esc(item.variant) : ''}</div>
          </div>
        </div>
        <div class="stock-alert-row-right">
          <span class="stock-alert-row-qty"><b>${sisaStok(item).toLocaleString('id-ID')}</b> ${esc(item.satuan || 'Pcs')}</span>
          <span class="stok-status stok-status--${status}">${labelStatusStok(status)}</span>
        </div>
      </div>`).join('');

  return `
  <div class="stock-alert-card">
    <div class="stock-alert-head">
      <div class="stock-alert-title">
        <div class="stock-alert-title-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${IKON_GUDANG_DASH}</svg></div>
        <div><h4>${esc(g.nama)}</h4><span>${items.length} SKU terdaftar</span></div>
      </div>
      <div class="stock-alert-counts">
        ${jumlahHabis ? `<span class="stok-status stok-status--habis">${jumlahHabis} Habis</span>` : ''}
        ${jumlahMenipis ? `<span class="stok-status stok-status--menipis">${jumlahMenipis} Menipis</span>` : ''}
        ${!jumlahHabis && !jumlahMenipis ? `<span class="stok-status stok-status--tersedia">Aman</span>` : ''}
      </div>
    </div>
    <div class="stock-alert-list">${daftarHtml}</div>
  </div>`;
}

/* Membuka menu Stock & Gudang, langsung difilter ke gudang + status yang
   diklik dari dashboard Ringkasan (mis. klik item "Stok Habis" di kartu
   Gudang Jakarta -> otomatis menampilkan hanya item habis di gudang itu). */
function bukaAlertStokGudang(gudangId, status){
  pindahTampilan('gudang');
  const selGudang = document.getElementById('filter-lokasi-gudang');
  const selStatus = document.getElementById('filter-status-gudang');
  if(selGudang) selGudang.value = gudangId;
  if(selStatus) selStatus.value = status;
  renderGudang();
}

function renderRingkasanStokGudang(){
  const wrap = document.getElementById('dash-row-stok-gudang');
  if(!wrap) return;
  wrap.innerHTML = markupKartuStokGudang('surabaya', 'Surabaya') + markupKartuStokGudang('jakarta', 'Jakarta');
}

function renderDashTeamRow(){
  const wrap = document.getElementById('dash-team-row');
  if(!wrap) return;
  const anggota = profilAktif();
  if(!anggota.length){
    wrap.innerHTML = `<div class="empty-state"><p>Belum ada anggota tim terdaftar.</p></div>`;
    return;
  }
  wrap.innerHTML = anggota.map(p => {
    const totalTugas = DATA.tugas.filter(t => t.ditugaskan_ke === p.id).length;
    const peranLabel = p.jabatan ? esc(p.jabatan) : labelPeran(p.peran);
    return `
      <div class="dash-team-mini">
        ${markupAvatar(p)}
        <div style="min-width:0;">
          <div class="dash-team-mini-name">${esc(p.nama)}</div>
          <div class="dash-team-mini-role">${peranLabel}</div>
          <div class="dash-team-mini-link" onclick="pindahTampilan('tugas')">${totalTugas}+ Tugas &rarr;</div>
        </div>
      </div>`;
  }).join('');
}

function renderRingkasanTabelPelanggan(){
  const tbody = document.getElementById('tbody-ringkasan-pelanggan');
  if(!tbody) return;
  if(!DATA.pelanggan.length){
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><p>Belum ada data pelanggan.</p></div></td></tr>`;
    return;
  }
  const { awal, akhir } = dapatkanRentangPeriode('ringkasan');
  const data = DATA.pelanggan
    .map(p => ({
      p,
      totalNilai: hitungAgregatProyekPelanggan(p.id, awal, akhir).grandTotal,
      jumlahProyek: DATA.proyek.filter(pr => proyekMilikPelanggan(pr, p.id) && tanggalDalamRentang(pr.tanggal, awal, akhir)).length
    }))
    .filter(({ jumlahProyek }) => jumlahProyek > 0)
    .sort((a, b) => b.totalNilai - a.totalNilai)
    .slice(0, 5);
  if(!data.length){
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><p>Tidak ada proyek pelanggan pada periode ini.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(({ p, totalNilai, jumlahProyek }) => `
    <tr>
      <td class="cell-name">${esc(p.nama)}</td>
      <td>${esc(p.industri) || '—'}</td>
      <td>${jumlahProyek}</td>
      <td><span class="badge badge-${esc(p.status)}"><span class="dot"></span>${labelStatusPelanggan(p.status)}</span></td>
      <td><b>${formatRupiah(totalNilai)}</b></td>
    </tr>`).join('');
}

/* Cek apakah pelanggan dari sebuah proyek MASIH ADA di data pelanggan saat
   ini. pelanggan_nama pada baris proyek adalah TEKS yang disalin saat
   proyek dibuat — tidak otomatis ikut terhapus atau berubah saat data
   pelanggan aslinya dihapus (pelanggan_id proyek itu akan menjadi NULL,
   tapi pelanggan_nama tetap tersimpan sebagai riwayat). Tanpa pengecekan
   ini, proyek lama akan terus tampil seolah pelanggannya masih ada. */
function pelangganProyekMasihAda(pr){
  if(pr.pelanggan_id) return DATA.pelanggan.some(x => x.id === pr.pelanggan_id);
  return DATA.pelanggan.some(x => x.nama === pr.pelanggan_nama);
}
/* Nama pelanggan untuk ditampilkan di tabel/pencarian — diberi tanda
   "(Pelanggan Dihapus)" kalau pelanggannya sudah tidak ada lagi di menu
   Pelanggan, supaya tidak disangka pelanggan tersebut masih aktif. */
function labelPelangganProyek(pr){
  const nama = esc(pr.pelanggan_nama) || '—';
  return pelangganProyekMasihAda(pr) ? nama
    : `${nama} <span class="cell-muted" title="Pelanggan ini sudah dihapus dari menu Pelanggan">(Pelanggan Dihapus)</span>`;
}

function renderRingkasanTabelProyek(){
  const tbody = document.getElementById('tbody-ringkasan-proyek');
  if(!tbody) return;
  if(!DATA.proyek.length){
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><p>Belum ada data proyek.</p></div></td></tr>`;
    return;
  }
  const { awal, akhir } = dapatkanRentangPeriode('ringkasan');
  const data = DATA.proyek
    .filter(p => tanggalDalamRentang(p.tanggal, awal, akhir))
    .sort((a, b) => (b.grand_total || b.nilai || 0) - (a.grand_total || a.nilai || 0))
    .slice(0, 5);
  if(!data.length){
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><p>Tidak ada proyek pada periode ini.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(p => `
    <tr>
      <td class="cell-name">${esc(p.kode)}</td>
      <td>${labelPelangganProyek(p)}</td>
      <td><span class="badge badge-${esc(p.status)}"><span class="dot"></span>${labelStatusProyek(p.status)}</span></td>
      <td><b>${formatRupiah(p.grand_total || p.nilai || 0)}</b></td>
    </tr>`).join('');
}

function toggleFavoritRingkasan(){
  PENGATURAN.ringkasanFavorit = !PENGATURAN.ringkasanFavorit;
  localStorage.setItem('dealstack_pengaturan', JSON.stringify(PENGATURAN));
  const btn = document.getElementById('btn-favorit-ringkasan');
  btn.style.color = PENGATURAN.ringkasanFavorit ? 'var(--accent-bright)' : '';
  tampilkanToast(PENGATURAN.ringkasanFavorit ? 'Ditandai sebagai favorit' : 'Favorit dihapus');
}

function bagikanTautanRingkasan(){
  const url = window.location.href.split('#')[0];
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(() => tampilkanToast('Tautan disalin ke clipboard'))
      .catch(() => tampilkanToast('Gagal menyalin tautan', true));
  } else {
    tampilkanToast('Tautan: ' + url);
  }
}

/* Ekspor CSV generik — dipakai oleh menu "Lainnya" di Ringkasan dan halaman Laporan */
function unduhCSV(namaFile, header, baris){
  const escapeCSV = (v) => `"${String(v ?? '').replace(/"/g,'""')}"`;
  let csv = header.map(escapeCSV).join(',') + '\n';
  csv += baris.map(row => row.map(escapeCSV).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = namaFile;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
function unduhRingkasanCSV(){
  unduhCSV('ringkasan-dealstack.csv',
    ['Metrik','Nilai'],
    [
      ['Total Pelanggan', DATA.pelanggan.length],
      ['Pelanggan Aktif', DATA.pelanggan.filter(p=>p.status==='aktif').length],
      ['Total Proyek', DATA.proyek.length],
      ['Proyek Berjalan', DATA.proyek.filter(p=>p.status==='berjalan').length],
      ['Proyek Selesai', DATA.proyek.filter(p=>p.status==='selesai').length],
      ['Total Nilai Proyek Aktif', DATA.proyek.filter(p => !['tertunda','dibatalkan'].includes(p.status)).reduce((s,p)=>s + (p.grand_total || p.nilai || 0), 0)],
    ]);
  tampilkanToast('Ringkasan diunduh');
}
function unduhLaporanCSV(){
  const { awal, akhir } = dapatkanRentangPeriode('laporan');
  const data = DATA.proyek.filter(p => tanggalDalamRentang(p.tanggal, awal, akhir));
  unduhCSV('laporan-proyek-dealstack.csv',
    ['Kode','Nama Proyek','Pelanggan','Status','Progres (%)','Nilai (Rp)','Tenggat'],
    data.map(p => [p.kode, p.nama, p.pelanggan_nama, labelStatusProyek(p.status), p.progres, p.nilai, p.tenggat || '']));
  tampilkanToast('Laporan diunduh');
}

/* ---------------------------------------------------------
   5. RENDER: TABEL PELANGGAN
--------------------------------------------------------- */
/* PENTING: sebelum migrasi v7 dijalankan di database, form Proyek hanya
   menyimpan pelanggan_nama (teks bebas) — pelanggan_id bisa kosong (null).
   Proyek dengan pelanggan_id kosong TIDAK akan ketemu oleh perbandingan
   `pr.pelanggan_id === pelangganId`, sehingga proyek itu "hilang" dari
   semua penghitungan di menu Pelanggan (Total Nilai, Sub Total, Grand
   Total, dst) walaupun proyeknya tetap muncul di Laporan/Dashboard (yang
   menjumlahkan dari SELURUH DATA.proyek tanpa perlu tertaut ke pelanggan).
   Inilah sumber selisih jumlah proyek antara menu Pelanggan dan Laporan.
   Fungsi ini mencocokkan proyek ke pelanggan lewat pelanggan_id (utama),
   dan—kalau proyek belum tertaut—jatuh ke pencocokan nama pelanggan yang
   identik sebagai fallback, supaya proyek lama tetap terhitung di menu
   Pelanggan sampai migrasi SQL v7 (backfill pelanggan_id) dijalankan. */
function proyekMilikPelanggan(pr, pelangganId){
  if(!pelangganId) return false;
  if(pr.pelanggan_id) return pr.pelanggan_id === pelangganId;
  const pel = DATA.pelanggan.find(x => x.id === pelangganId);
  return !!pel && pr.pelanggan_nama === pel.nama;
}

/* filterStatus='semua': mengikuti aturan yang sama dengan Grand Total di
   menu Pelanggan — proyek tertunda/dibatalkan dikecualikan karena belum/tidak
   jadi nilai riil. filterStatus spesifik (mis. 'selesai') tetap menghitung
   proyek dengan status tersebut saja, apa pun statusnya. */
function hitungTotalNilaiProyek(pelangganId, filterStatus){
  const STATUS_DIKECUALIKAN = ['tertunda', 'dibatalkan'];
  return DATA.proyek
    .filter(pr => proyekMilikPelanggan(pr, pelangganId))
    .filter(pr => filterStatus === 'semua' ? !STATUS_DIKECUALIKAN.includes(pr.status) : pr.status === filterStatus)
    .reduce((total, pr) => total + (pr.grand_total || pr.nilai || 0), 0);
}

/* Rekap 8 metrik proyek per pelanggan untuk kolom-kolom di tabel Pelanggan.
   Disengaja dihitung dari field yang SAMA dengan yang dipakai di tabel
   "Proyek Pelanggan Ini" (sub_total, grand_total, tax_persen, dana_lainnya)
   supaya kedua halaman selalu sinkron — cukup ubah satu proyek dan kedua
   tabel otomatis ikut berubah karena sama-sama membaca dari DATA.proyek.
   awal/akhir (opsional) menyaring proyek berdasarkan Tanggal PO sesuai
   filter "Periode Data" yang dipilih di halaman ini.
   Proyek berstatus "tertunda" atau "dibatalkan" TIDAK dihitung ke kolom
   total (Total Sub Total, Total Tax, Total Dana Lainnya, Grand Total,
   Profit, Margin) karena belum/tidak jadi pendapatan riil — kolom
   per-status (berjalan/tertunda/selesai/dibatalkan) tetap menampilkan
   nilai masing-masing proyek apa adanya. */
function hitungAgregatProyekPelanggan(pelangganId, awal, akhir){
  const agregat = { berjalan:0, tertunda:0, selesai:0, dibatalkan:0, totalSubTotal:0, totalTax:0, totalDanaLainnya:0, grandTotal:0, totalBudgetTerpakai:0 };
  const STATUS_DIKECUALIKAN = ['tertunda', 'dibatalkan'];
  DATA.proyek
    .filter(pr => proyekMilikPelanggan(pr, pelangganId) && tanggalDalamRentang(pr.tanggal, awal, akhir))
    .forEach(pr => {
      const nilaiProyek = pr.grand_total || pr.nilai || 0;
      if(agregat[pr.status] !== undefined) agregat[pr.status] += nilaiProyek;
      if(STATUS_DIKECUALIKAN.includes(pr.status)) return; // lewati kolom total
      agregat.totalSubTotal += (pr.sub_total || 0);
      agregat.totalTax += hitungPajakNominal(pr.sub_total, pr.tax_persen);
      agregat.totalDanaLainnya += (pr.dana_lainnya || 0);
      agregat.grandTotal += nilaiProyek;
      agregat.totalBudgetTerpakai += (pr.budget_terpakai || 0);
    });
  // Profit & Margin dihitung dari Total Sub Total dikurangi Total Budget Terpakai
  // seluruh proyek pelanggan ini (mengikuti periode yang sama dengan kolom lain,
  // dan sudah tidak menyertakan proyek tertunda/dibatalkan).
  agregat.profit = hitungProfit(agregat.totalSubTotal, agregat.totalBudgetTerpakai);
  agregat.margin = hitungMarginPersen(agregat.totalSubTotal, agregat.totalBudgetTerpakai);
  return agregat;
}

/* 8 kartu ringkasan di atas tabel menu Pelanggan — menjumlahkan metrik yang
   SAMA dengan kolom-kolom tabel (hitungAgregatProyekPelanggan) untuk seluruh
   pelanggan yang sedang tampil (mengikuti pencarian & filter periode aktif),
   supaya kartu selalu sinkron dengan isi tabel di bawahnya. Margin dihitung
   ulang dari total Profit dibagi total Sub Total (bukan rata-rata persen
   antar pelanggan) agar hasilnya akurat secara proporsional. */
function renderStatPelanggan(daftarPelanggan, awal, akhir){
  const wrap = document.getElementById('stat-pelanggan');
  if(!wrap) return;

  const total = { berjalan:0, tertunda:0, selesai:0, totalSubTotal:0, totalTax:0, grandTotal:0, profit:0 };
  daftarPelanggan.forEach(p => {
    const a = hitungAgregatProyekPelanggan(p.id, awal, akhir);
    total.berjalan += a.berjalan;
    total.tertunda += a.tertunda;
    total.selesai += a.selesai;
    total.totalSubTotal += a.totalSubTotal;
    total.totalTax += a.totalTax;
    total.grandTotal += a.grandTotal;
    total.profit += a.profit;
  });
  const margin = hitungMarginPersen(total.totalSubTotal, total.totalSubTotal - total.profit);

  // Kartu memakai struktur & ukuran kartu KPI yang sama dengan menu Ringkasan
  // (kpi-card cmd-stat-card, lihat juga renderLaporan/laporan-kpi) supaya
  // bahasa desain "Command Center" konsisten di seluruh dashboard. Warna
  // gradien mengikuti palet kpi-card, sedangkan Profit & Margin memakai
  // gradien hijau (positif/ok) atau merah-muda (negatif/danger) menggantikan
  // modifier .ok/.danger yang dulu dipakai pada kartu stat-mini polos.
  const kartu = [
    ['Total Nilai Proyek Berjalan', formatRupiah(total.berjalan), 'cmd-grad-blue'],
    ['Total Nilai Proyek Tertunda', formatRupiah(total.tertunda), 'cmd-grad-purple'],
    ['Total Nilai Proyek Selesai', formatRupiah(total.selesai), 'cmd-grad-green'],
    ['Sub Total', formatRupiah(total.totalSubTotal), 'cmd-grad-cyan'],
    ['Total Tax', formatRupiah(total.totalTax), 'cmd-grad-blue'],
    ['Grand Total', formatRupiah(total.grandTotal), 'cmd-grad-purple'],
    ['Profit', formatRupiah(total.profit), total.profit < 0 ? 'cmd-grad-purple' : 'cmd-grad-green'],
    ['Margin', margin + '%', margin < 0 ? 'cmd-grad-purple' : 'cmd-grad-green'],
  ];
  wrap.innerHTML = kartu.map(([label, val, grad]) => `
    <div class="kpi-card cmd-stat-card ${grad}">
      <div class="kpi-top"><span class="kpi-label">${label}</span></div>
      <div class="kpi-bottom"><div class="kpi-value">${val}</div></div>
    </div>`).join('');
}

function renderPelanggan(){
  const tbody = document.getElementById('tbody-pelanggan');
  const q = (document.getElementById('cari-pelanggan').value || '').toLowerCase();
  const { awal, akhir } = dapatkanRentangPeriode('pelanggan');

  const data = DATA.pelanggan.filter(p => {
    return p.nama.toLowerCase().includes(q) || (p.industri || '').toLowerCase().includes(q);
  });

  renderStatPelanggan(data, awal, akhir);

  if(!data.length){
    tbody.innerHTML = `<tr><td colspan="18"><div class="empty-state">
      <p>Tidak ada pelanggan yang cocok dengan pencarian.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(p => {
    const a = hitungAgregatProyekPelanggan(p.id, awal, akhir);
    return `
    <tr>
      <td class="cell-muted">${esc(p.kode)}</td>
      <td class="cell-name"><span class="cell-link" title="Lihat proyek pelanggan ini" onclick="bukaDetailPelanggan('${p.id}')">${esc(p.nama)}</span></td>
      <td>${esc(p.industri) || '—'}</td>
      <td>${esc(p.alamat) || '—'}</td>
      <td>${esc(p.no_telepon) || '—'}</td>
      <td>${esc(p.no_whatsapp) || '—'}</td>
      <td>${esc(p.nama_pic) || '—'}</td>
      <td>${formatRupiah(a.berjalan)}</td>
      <td>${formatRupiah(a.tertunda)}</td>
      <td>${formatRupiah(a.selesai)}</td>
      <td>${formatRupiah(a.dibatalkan)}</td>
      <td>${formatRupiah(a.totalSubTotal)}</td>
      <td>${formatRupiah(a.totalTax)}</td>
      <td>${formatRupiah(a.totalDanaLainnya)}</td>
      <td><b>${formatRupiah(a.grandTotal)}</b></td>
      <td class="${a.profit < 0 ? 'profit-negative' : 'profit-positive'}"><b>${formatRupiah(a.profit)}</b></td>
      <td class="${a.margin < 0 ? 'profit-negative' : 'profit-positive'}">${a.margin}%</td>
      <td class="cell-actions">
        <div class="icon-btn" title="Tambah Proyek untuk Pelanggan Ini" onclick="bukaModalTambahProyekUntukPelanggan('${p.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
        </div>
        <div class="icon-btn" title="Edit" onclick="editPelanggan('${p.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </div>
        <div class="icon-btn" title="Hapus" onclick="hapusPelanggan('${p.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>
        </div>
      </td>
    </tr>
  `;
  }).join('');
}

async function hapusPelanggan(id){
  const p = DATA.pelanggan.find(x => x.id === id);
  if(!p) return;

  // Sejak migrasi v20 (schema.sql), kolom proyek.pelanggan_id memakai
  // "ON DELETE CASCADE" — artinya begitu baris pelanggan ini dihapus,
  // SELURUH proyek yang benar-benar tertaut (pelanggan_id terisi) ke
  // pelanggan ini akan IKUT TERHAPUS PERMANEN oleh database, bukan cuma
  // dilepas tautannya. Hitung dulu jumlah & nama proyeknya supaya
  // pengguna diberi peringatan yang jelas & akurat sebelum menghapus.
  const proyekTerkait = DATA.proyek.filter(pr => pr.pelanggan_id === id);
  if(proyekTerkait.length > 0){
    const daftarNama = proyekTerkait.slice(0, 5).map(pr => `• ${pr.nama}`).join('\n');
    const sisa = proyekTerkait.length > 5 ? `\n… dan ${proyekTerkait.length - 5} proyek lainnya` : '';
    const lanjut = confirm(
      `Pelanggan "${p.nama}" masih memiliki ${proyekTerkait.length} proyek:\n\n${daftarNama}${sisa}\n\n` +
      `PERINGATAN: seluruh proyek di atas akan IKUT TERHAPUS PERMANEN bersama pelanggannya. ` +
      `Tindakan ini TIDAK BISA DIBATALKAN.\n\n` +
      `Lanjutkan hapus pelanggan ini beserta semua proyeknya?`
    );
    if(!lanjut) return;
  }

  const { error } = await supabaseClient.from('pelanggan').delete().eq('id', id);
  if(error){ console.error(error); tampilkanToast('Gagal menghapus pelanggan', true); return; }
  DATA.pelanggan = DATA.pelanggan.filter(x => x.id !== id);
  // Buang juga dari cache lokal proyek yang baru saja ikut terhapus lewat
  // CASCADE di database, supaya tabel/kartu proyek di UI langsung sinkron
  // tanpa perlu reload manual.
  DATA.proyek = DATA.proyek.filter(pr => pr.pelanggan_id !== id);

  segarkanDetailPelangganJikaAktif();
  renderFunnel();
  renderPelanggan();
  isiDropdownPelangganProyek();
  renderRingkasan(); // BUGFIX: dulu hanya renderRingkasanTabelPelanggan() yang dipanggil, tag "X Pelanggan Aktif" & tabel lain di dashboard tidak ikut ter-refresh
  await catatAktivitas('pelanggan', `Pelanggan <b>${esc(p.nama)}</b> dihapus${proyekTerkait.length > 0 ? ` beserta ${proyekTerkait.length} proyek terkait` : ''}`);
  tampilkanToast('Pelanggan dihapus');
}

function bukaModalTambahPelanggan(){
  document.getElementById('form-pelanggan').reset();
  document.getElementById('input-id-pelanggan').value = '';
  document.getElementById('input-kode-pelanggan').value = kodeAcak('CL');
  document.getElementById('judul-modal-pelanggan').textContent = 'Tambah Pelanggan Baru';
  document.getElementById('btn-simpan-pelanggan').textContent = 'Simpan Pelanggan';
  bukaModal('modal-pelanggan');
}

function editPelanggan(id){
  const p = DATA.pelanggan.find(x => x.id === id);
  if(!p) return;
  document.getElementById('input-id-pelanggan').value = p.id;
  document.getElementById('input-kode-pelanggan').value = p.kode || '';
  document.getElementById('input-nama-pelanggan').value = p.nama || '';
  document.getElementById('input-industri-pelanggan').value = p.industri || '';
  document.getElementById('input-alamat-pelanggan').value = p.alamat || '';
  document.getElementById('input-telepon-pelanggan').value = p.no_telepon || '';
  document.getElementById('input-whatsapp-pelanggan').value = p.no_whatsapp || '';
  document.getElementById('input-pic-pelanggan').value = p.nama_pic || '';
  document.getElementById('judul-modal-pelanggan').textContent = 'Edit Pelanggan';
  document.getElementById('btn-simpan-pelanggan').textContent = 'Simpan Perubahan';
  bukaModal('modal-pelanggan');
}

function pesanErrorKode(error, label){
  if(error && error.code === '23505') return `${label ? label + ' sudah dipakai. Gunakan ' + label.toLowerCase() + ' yang berbeda.' : 'Data ini sudah dipakai. Gunakan nilai yang berbeda.'}`;
  return null;
}

async function simpanPelanggan(e){
  e.preventDefault();
  const id = document.getElementById('input-id-pelanggan').value;
  const kode = document.getElementById('input-kode-pelanggan').value.trim();
  const nama = document.getElementById('input-nama-pelanggan').value.trim();
  const industri = document.getElementById('input-industri-pelanggan').value.trim() || 'Umum';
  const alamat = document.getElementById('input-alamat-pelanggan').value.trim() || null;
  const no_telepon = document.getElementById('input-telepon-pelanggan').value.trim() || null;
  const no_whatsapp = document.getElementById('input-whatsapp-pelanggan').value.trim() || null;
  const nama_pic = document.getElementById('input-pic-pelanggan').value.trim() || null;
  if(!nama || !kode) return;

  if(id){
    // --- mode edit ---
    const baris = { kode, nama, industri, alamat, no_telepon, no_whatsapp, nama_pic };
    const { data, error } = await supabaseClient.from('pelanggan').update(baris).eq('id', id).select().single();
    if(error){ console.error(error); tampilkanToast(pesanErrorKode(error, 'ID Pelanggan') || 'Gagal menyimpan perubahan pelanggan', true); return; }

    const idx = DATA.pelanggan.findIndex(x => x.id === id);
    if(idx > -1) DATA.pelanggan[idx] = data;
    renderPelanggan();
    isiDropdownPelangganProyek();
    renderRingkasanTabelPelanggan();
    await catatAktivitas('pelanggan', `Data pelanggan <b>${nama}</b> diperbarui`);
    tutupModal('modal-pelanggan');
    tampilkanToast('Perubahan pelanggan disimpan');
  } else {
    // --- mode tambah ---
    const baris = {
      kode, nama, industri, status: 'aktif',
      alamat, no_telepon, no_whatsapp, nama_pic,
      kontak_terakhir: new Date().toISOString().slice(0,10)
    };
    const { data, error } = await supabaseClient.from('pelanggan').insert(baris).select().single();
    if(error){ console.error(error); tampilkanToast(pesanErrorKode(error, 'ID Pelanggan') || 'Gagal menambah pelanggan', true); return; }

    DATA.pelanggan.unshift(data);
    renderPelanggan();
    isiDropdownPelangganProyek();
    renderRingkasanTabelPelanggan();
    await catatAktivitas('pelanggan', `Pelanggan baru <b>${nama}</b> ditambahkan ke sistem`);
    tutupModal('modal-pelanggan');
    tampilkanToast('Pelanggan baru ditambahkan');
  }
  e.target.reset();
  document.getElementById('input-id-pelanggan').value = '';
}

/* ---------------------------------------------------------
   6. RENDER: TABEL PROYEK
--------------------------------------------------------- */
function hitungPajakNominal(subTotal, taxPersen){
  return Math.round((subTotal || 0) * (taxPersen || 0) / 100);
}
function hitungGrandTotal(subTotal, taxPersen, danaLainnya){
  return (subTotal || 0) + hitungPajakNominal(subTotal, taxPersen) + (danaLainnya || 0);
}
function hitungPersenBudget(budgetTerpakai, totalBudget){
  if(!totalBudget) return 0;
  return Math.round(((budgetTerpakai || 0) / totalBudget) * 1000) / 10; // 1 desimal
}
/* Profit = Sub Total - Budget Terpakai.
   Margin = Profit dibagi Sub Total (dalam %) — menunjukkan seberapa besar
   porsi Sub Total yang menjadi keuntungan setelah dikurangi budget terpakai. */
function hitungProfit(subTotal, budgetTerpakai){
  return (subTotal || 0) - (budgetTerpakai || 0);
}
function hitungMarginPersen(subTotal, budgetTerpakai){
  if(!subTotal) return 0;
  return Math.round((hitungProfit(subTotal, budgetTerpakai) / subTotal) * 1000) / 10; // 1 desimal
}

/* ---------------------------------------------------------
   6a. NAVIGASI & RENDER: DETAIL PELANGGAN (proyek per pelanggan)
   Menggantikan menu Proyek terpisah — proyek kini dipantau
   langsung dari halaman detail pelanggan terkait (lebih efisien,
   satu menu untuk data pelanggan + seluruh PO miliknya).
--------------------------------------------------------- */
let PELANGGAN_AKTIF_ID = null; // id pelanggan yang sedang dibuka di halaman detail

function bukaDetailPelanggan(id){
  PELANGGAN_AKTIF_ID = id;
  const cari = document.getElementById('cari-proyek-detail');
  const filter = document.getElementById('filter-status-proyek-detail');
  const filterPeriode = document.getElementById('filter-periode-proyek-detail');
  if(cari) cari.value = '';
  if(filter) filter.value = 'semua';
  if(filterPeriode) filterPeriode.value = 'semua';
  toggleInputPeriodeCustom('proyek-detail');
  pindahTampilan('pelanggan-detail');
}

function editPelangganDariDetail(){
  if(PELANGGAN_AKTIF_ID) editPelanggan(PELANGGAN_AKTIF_ID);
}

function renderDetailPelanggan(){
  const p = DATA.pelanggan.find(x => x.id === PELANGGAN_AKTIF_ID);
  if(!p){
    // Pelanggan sudah dihapus/tidak ditemukan — kembali ke daftar pelanggan
    pindahTampilan('pelanggan');
    return;
  }
  document.getElementById('detail-pelanggan-nama').textContent = p.nama;
  document.getElementById('detail-pelanggan-industri').textContent = p.industri || 'Umum';
  document.getElementById('detail-pelanggan-pic').textContent = 'PIC: ' + (p.nama_pic || '—');
  document.getElementById('detail-pelanggan-telepon').textContent = 'Telp: ' + (p.no_telepon || '—');
  document.getElementById('detail-pelanggan-whatsapp').textContent = 'WA: ' + (p.no_whatsapp || '—');

  const proyekPelanggan = DATA.proyek.filter(pr => proyekMilikPelanggan(pr, PELANGGAN_AKTIF_ID));
  document.getElementById('detail-pelanggan-jumlah-proyek').textContent = proyekPelanggan.length + ' Proyek';
  document.getElementById('detail-pelanggan-total-nilai').textContent = 'Total Nilai: ' + formatRupiah(hitungTotalNilaiProyek(PELANGGAN_AKTIF_ID, 'semua'));

  renderProyekDetail();
}

/* Panggil setelah data proyek berubah (tambah/edit/hapus) supaya header
   & tabel di halaman detail ikut ter-update, hanya jika sedang dibuka */
function segarkanDetailPelangganJikaAktif(){
  if(PELANGGAN_AKTIF_ID) renderDetailPelanggan();
}

/* 8 kartu ringkasan di atas tabel "Proyek Pelanggan Ini" — menjumlahkan
   metrik dari daftar proyek yang SEDANG TAMPIL (mengikuti pencarian, filter
   status, dan filter periode aktif di halaman ini), supaya kartu selalu
   sinkron dengan isi tabel di bawahnya. % Budget & Margin dihitung ulang
   dari total nominal (bukan rata-rata persen antar proyek) agar hasilnya
   akurat secara proporsional. */
function renderStatProyekDetail(daftarProyek){
  const wrap = document.getElementById('stat-proyek-detail');
  if(!wrap) return;

  const total = { subTotal:0, tax:0, danaLainnya:0, grandTotal:0, totalBudget:0, budgetTerpakai:0 };
  daftarProyek.forEach(p => {
    total.subTotal += (p.sub_total || 0);
    total.tax += hitungPajakNominal(p.sub_total, p.tax_persen);
    total.danaLainnya += (p.dana_lainnya || 0);
    total.grandTotal += (p.grand_total || 0);
    total.totalBudget += (p.total_budget || 0);
    total.budgetTerpakai += (p.budget_terpakai || 0);
  });
  const persenBudget = hitungPersenBudget(total.budgetTerpakai, total.totalBudget);
  const profit = hitungProfit(total.subTotal, total.budgetTerpakai);
  const margin = hitungMarginPersen(total.subTotal, total.budgetTerpakai);

  wrap.innerHTML = `
    <div class="stat-mini-card">
      <span class="stat-mini-label">Sub Total</span>
      <span class="stat-mini-value">${formatRupiah(total.subTotal)}</span>
    </div>
    <div class="stat-mini-card">
      <span class="stat-mini-label">Tax</span>
      <span class="stat-mini-value">${formatRupiah(total.tax)}</span>
    </div>
    <div class="stat-mini-card">
      <span class="stat-mini-label">Dana Lainnya</span>
      <span class="stat-mini-value">${formatRupiah(total.danaLainnya)}</span>
    </div>
    <div class="stat-mini-card">
      <span class="stat-mini-label">Grand Total</span>
      <span class="stat-mini-value">${formatRupiah(total.grandTotal)}</span>
    </div>
    <div class="stat-mini-card ${persenBudget > 100 ? 'danger' : (persenBudget >= 80 ? 'warn' : 'ok')}">
      <span class="stat-mini-label">% Budget</span>
      <span class="stat-mini-value">${persenBudget}%</span>
    </div>
    <div class="stat-mini-card ${profit < 0 ? 'danger' : 'ok'}">
      <span class="stat-mini-label">Profit</span>
      <span class="stat-mini-value">${formatRupiah(profit)}</span>
    </div>
    <div class="stat-mini-card ${margin < 0 ? 'danger' : 'ok'}">
      <span class="stat-mini-label">Margin</span>
      <span class="stat-mini-value">${margin}%</span>
    </div>
    <div class="stat-mini-card">
      <span class="stat-mini-label">Jumlah Proyek</span>
      <span class="stat-mini-value">${daftarProyek.length}</span>
    </div>
  `;
}

function renderProyekDetail(){
  const tbody = document.getElementById('tbody-proyek-detail');
  if(!tbody || !PELANGGAN_AKTIF_ID) return;
  const q = (document.getElementById('cari-proyek-detail').value || '').toLowerCase();
  const filterStatus = document.getElementById('filter-status-proyek-detail').value;
  const { awal, akhir } = dapatkanRentangPeriode('proyek-detail');

  const data = DATA.proyek.filter(p => {
    if(!proyekMilikPelanggan(p, PELANGGAN_AKTIF_ID)) return false;
    const cocokCari = p.nama.toLowerCase().includes(q) || (p.kode||'').toLowerCase().includes(q);
    const cocokStatus = filterStatus === 'semua' || p.status === filterStatus;
    const cocokPeriode = tanggalDalamRentang(p.tanggal, awal, akhir);
    return cocokCari && cocokStatus && cocokPeriode;
  });

  renderStatProyekDetail(data);

  if(!data.length){
    tbody.innerHTML = `<tr><td colspan="17"><div class="empty-state">
      <p>Belum ada proyek untuk pelanggan ini.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(p => {
    const persenBudget = hitungPersenBudget(p.budget_terpakai, p.total_budget);
    const profit = hitungProfit(p.sub_total, p.budget_terpakai);
    const margin = hitungMarginPersen(p.sub_total, p.budget_terpakai);
    return `
    <tr>
      <td class="cell-name">${esc(p.kode)}</td>
      <td class="cell-muted">${esc(p.nama)}</td>
      <td><span class="badge badge-${esc(p.status)}"><span class="dot"></span>${labelStatusProyek(p.status)}</span></td>
      <td class="cell-muted">${formatTanggal(p.tanggal)}</td>
      <td class="cell-muted">${formatTanggal(p.tenggat)}</td>
      <td class="cell-muted">${p.diupdate_pada ? waktuRelatif(p.diupdate_pada) : '—'}</td>
      <td class="cell-muted">${esc(p.dibuat_oleh_nama) || '—'}</td>
      <td>${formatRupiah(p.sub_total)}</td>
      <td>${formatRupiah(hitungPajakNominal(p.sub_total, p.tax_persen))}<div class="cell-muted">${p.tax_persen || 0}%</div></td>
      <td>${formatRupiah(p.dana_lainnya)}</td>
      <td><b>${formatRupiah(p.grand_total)}</b></td>
      <td>${formatRupiah(p.total_budget)}</td>
      <td>${formatRupiah(p.budget_terpakai)}</td>
      <td>
        <div class="progress-mini"><div class="progress-mini-fill" style="width:${Math.min(persenBudget,100)}%"></div></div>
        <div class="progress-mini-label">${persenBudget}%</div>
      </td>
      <td class="${profit < 0 ? 'profit-negative' : 'profit-positive'}"><b>${formatRupiah(profit)}</b></td>
      <td class="${margin < 0 ? 'profit-negative' : 'profit-positive'}">${margin}%</td>
      <td class="cell-actions">
        <div class="icon-btn" title="Edit" onclick="editProyek('${p.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </div>
        <div class="icon-btn" title="Hapus" onclick="hapusProyek('${p.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>
        </div>
      </td>
    </tr>
  `;
  }).join('');
}

async function hapusProyek(id){
  const p = DATA.proyek.find(x => x.id === id);
  const { error } = await supabaseClient.from('proyek').delete().eq('id', id);
  if(error){ console.error(error); tampilkanToast('Gagal menghapus proyek', true); return; }
  DATA.proyek = DATA.proyek.filter(x => x.id !== id);
  segarkanDetailPelangganJikaAktif();
  renderFunnel();
  renderPelanggan();
  renderRingkasan(); // BUGFIX: dulu hanya sebagian kartu dashboard yang di-refresh (mis. tag "X Proyek Berjalan" tidak ikut) — sekarang satu panggilan me-refresh semuanya
  if(p) await catatAktivitas('proyek', `Proyek <b>${esc(p.nama)}</b> dihapus`);
  tampilkanToast('Proyek dihapus');
}

function isiDropdownPelangganProyek(){
  const select = document.getElementById('input-pelanggan-proyek');
  if(!select) return;
  const nilaiSebelumnya = select.value;
  select.disabled = false;
  select.innerHTML = `<option value="" disabled ${!nilaiSebelumnya ? 'selected' : ''}>Pilih pelanggan...</option>` +
    DATA.pelanggan.map(p => `<option value="${p.id}">${esc(p.nama)}</option>`).join('');
  if(DATA.pelanggan.some(p => p.id === nilaiSebelumnya)) select.value = nilaiSebelumnya;
}

function perbaruiKalkulasiFormProyek(){
  const subTotal = parseInt(document.getElementById('input-subtotal-proyek').value || '0', 10);
  const taxPersen = parseFloat(document.getElementById('input-tax-proyek').value || '0');
  const danaLain = parseInt(document.getElementById('input-dana-lain-proyek').value || '0', 10);
  const totalBudget = parseInt(document.getElementById('input-total-budget-proyek').value || '0', 10);
  const budgetTerpakai = parseInt(document.getElementById('input-budget-terpakai-proyek').value || '0', 10);

  document.getElementById('tampil-grand-total-proyek').value = formatRupiah(hitungGrandTotal(subTotal, taxPersen, danaLain));
  document.getElementById('tampil-persen-budget-proyek').value = hitungPersenBudget(budgetTerpakai, totalBudget) + '%';
}

function bukaModalTambahProyek(){
  document.getElementById('form-proyek').reset();
  document.getElementById('input-id-proyek').value = '';
  document.getElementById('input-kode-proyek').value = kodeAcak('PO');
  document.getElementById('input-tanggal-proyek').value = new Date().toISOString().slice(0,10);
  document.getElementById('judul-modal-proyek').textContent = 'Tambah Proyek Baru';
  document.getElementById('btn-simpan-proyek').textContent = 'Simpan Proyek';
  isiDropdownPelangganProyek();
  perbaruiKalkulasiFormProyek();
  bukaModal('modal-proyek');
}

/* Membuka modal Tambah Proyek dengan field Nama Pelanggan otomatis
   diisi & dikunci ke pelanggan tertentu. Dipakai dari 2 tempat:
   1) tombol "Tambah Proyek" di halaman detail pelanggan (lewat wrapper di bawah)
   2) tombol proyek pada baris tabel menu Pelanggan (langsung pakai id baris) */
function bukaModalTambahProyekUntukPelanggan(pelangganId){
  if(!pelangganId) return;
  bukaModalTambahProyek();
  const select = document.getElementById('input-pelanggan-proyek');
  select.value = pelangganId;
  select.disabled = true;
}

/* Dipanggil dari tombol "Tambah Proyek" di halaman detail pelanggan —
   sama seperti bukaModalTambahProyek(), tapi field Nama Pelanggan
   otomatis diisi & dikunci ke pelanggan yang sedang dibuka. */
function bukaModalTambahProyekUntukPelangganAktif(){
  bukaModalTambahProyekUntukPelanggan(PELANGGAN_AKTIF_ID);
}

function editProyek(id){
  const p = DATA.proyek.find(x => x.id === id);
  if(!p) return;
  isiDropdownPelangganProyek();
  document.getElementById('input-id-proyek').value = p.id;
  document.getElementById('input-kode-proyek').value = p.kode || '';
  document.getElementById('input-nama-proyek').value = p.nama || '';
  document.getElementById('input-pelanggan-proyek').value = p.pelanggan_id || '';
  document.getElementById('input-tanggal-proyek').value = p.tanggal || '';
  document.getElementById('input-tenggat-proyek').value = p.tenggat || '';
  document.getElementById('input-status-proyek').value = p.status || 'berjalan';
  document.getElementById('input-subtotal-proyek').value = p.sub_total || 0;
  document.getElementById('input-tax-proyek').value = p.tax_persen || 0;
  document.getElementById('input-dana-lain-proyek').value = p.dana_lainnya || 0;
  document.getElementById('input-total-budget-proyek').value = p.total_budget || 0;
  document.getElementById('input-budget-terpakai-proyek').value = p.budget_terpakai || 0;
  perbaruiKalkulasiFormProyek();
  document.getElementById('judul-modal-proyek').textContent = 'Edit Proyek';
  document.getElementById('btn-simpan-proyek').textContent = 'Simpan Perubahan';
  bukaModal('modal-proyek');
}

async function simpanProyek(e){
  e.preventDefault();
  const id = document.getElementById('input-id-proyek').value;
  const kode = document.getElementById('input-kode-proyek').value.trim();
  const nama = document.getElementById('input-nama-proyek').value.trim();
  const pelanggan_id = document.getElementById('input-pelanggan-proyek').value;
  const pelanggan = DATA.pelanggan.find(p => p.id === pelanggan_id);
  const tanggal = document.getElementById('input-tanggal-proyek').value || null;
  const tenggat = document.getElementById('input-tenggat-proyek').value || null;
  const status = document.getElementById('input-status-proyek').value;
  const sub_total = parseInt(document.getElementById('input-subtotal-proyek').value || '0', 10);
  const tax_persen = parseFloat(document.getElementById('input-tax-proyek').value || '0');
  const dana_lainnya = parseInt(document.getElementById('input-dana-lain-proyek').value || '0', 10);
  const total_budget = parseInt(document.getElementById('input-total-budget-proyek').value || '0', 10);
  const budget_terpakai = parseInt(document.getElementById('input-budget-terpakai-proyek').value || '0', 10);
  const grand_total = hitungGrandTotal(sub_total, tax_persen, dana_lainnya);
  const progres = status === 'selesai' ? 100 : 0;
  if(!nama || !kode || !pelanggan) return;

  if(id){
    // --- mode edit ---
    const baris = {
      kode, nama, pelanggan_id: pelanggan.id, pelanggan_nama: pelanggan.nama,
      tanggal, tenggat, status, progres, sub_total, tax_persen, dana_lainnya, grand_total,
      total_budget, budget_terpakai, nilai: grand_total, diupdate_pada: new Date().toISOString()
    };
    const { data, error } = await supabaseClient.from('proyek').update(baris).eq('id', id).select().single();
    if(error){ console.error(error); tampilkanToast(pesanErrorKode(error, 'No PO') || 'Gagal menyimpan perubahan proyek', true); return; }

    const idx = DATA.proyek.findIndex(x => x.id === id);
    if(idx > -1) DATA.proyek[idx] = data;
    segarkanDetailPelangganJikaAktif(); renderFunnel(); renderPelanggan();
    renderRingkasan(); // BUGFIX: satu panggilan refresh total dashboard, konsisten dengan hapusProyek()
    await catatAktivitas('proyek', `Proyek <b>${nama}</b> (${esc(data.kode)}) diperbarui`);
    tutupModal('modal-proyek');
    tampilkanToast('Perubahan proyek disimpan');
  } else {
    // --- mode tambah ---
    const baris = {
      kode, nama, pelanggan_id: pelanggan.id, pelanggan_nama: pelanggan.nama,
      tanggal, tenggat, status: status || 'berjalan', progres,
      dibuat_oleh_id: CURRENT_USER ? CURRENT_USER.id : null,
      dibuat_oleh_nama: CURRENT_USER ? CURRENT_USER.nama : null,
      sub_total, tax_persen, dana_lainnya, grand_total,
      total_budget, budget_terpakai, nilai: grand_total, diupdate_pada: new Date().toISOString()
    };
    const { data, error } = await supabaseClient.from('proyek').insert(baris).select().single();
    if(error){ console.error(error); tampilkanToast(pesanErrorKode(error, 'No PO') || 'Gagal menambah proyek', true); return; }

    DATA.proyek.unshift(data);
    segarkanDetailPelangganJikaAktif(); renderFunnel(); renderPelanggan();
    renderRingkasan(); // BUGFIX: satu panggilan refresh total dashboard, konsisten dengan hapusProyek()
    await catatAktivitas('proyek', `Proyek baru <b>${nama}</b> (${esc(data.kode)}) dibuat untuk ${esc(pelanggan.nama)}`);
    tutupModal('modal-proyek');
    tampilkanToast('Proyek baru ditambahkan');
  }
  e.target.reset();
  document.getElementById('input-id-proyek').value = '';
}

/* ---------------------------------------------------------
   7. RENDER: FUNNEL / MONITORING PENJUALAN (Analitik)
--------------------------------------------------------- */
function renderFunnel(){
  const tahapan = [
    { key:'tertunda', nama:'Prospek' },
    { key:'berjalan', nama:'Berjalan' },
    { key:'selesai', nama:'Menang' },
    { key:'dibatalkan', nama:'Kalah' },
  ];
  const totalNilaiSemua = DATA.proyek.reduce((s,p) => s + (p.grand_total || p.nilai || 0), 0) || 1;

  const wrap = document.getElementById('funnel-wrap');
  wrap.innerHTML = tahapan.map(t => {
    const proyekTahap = DATA.proyek.filter(p => p.status === t.key);
    const nilai = proyekTahap.reduce((s,p) => s + (p.grand_total || p.nilai || 0), 0);
    const pct = Math.max(6, Math.round((nilai/totalNilaiSemua)*100));
    return `
      <div class="funnel-row">
        <div class="funnel-name">${esc(t.nama)}</div>
        <div class="funnel-track">
          <div class="funnel-fill" style="width:${pct}%"><span>${proyekTahap.length} proyek</span></div>
        </div>
        <div class="funnel-value">${formatRupiah(nilai)}</div>
      </div>`;
  }).join('');
}

/* ---------------------------------------------------------
   8. RENDER: AKTIVITAS & TUGAS
--------------------------------------------------------- */
const ikonAktivitas = {
  proyek: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/></svg>',
  pelanggan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0113 0"/></svg>',
  tugas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l2.5 2.5L16 9"/></svg>',
  pengguna: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="3.2"/><path d="M5 20a7 7 0 0114 0"/></svg>',
  gudang: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8L12 3 3 8v9a1 1 0 001 1h4v-6h8v6h4a1 1 0 001-1V8z"/><path d="M3 8l9 5 9-5"/></svg>',
};
function waktuRelatif(iso){
  const detik = Math.floor((Date.now() - new Date(iso).getTime())/1000);
  if(detik < 60) return 'Baru saja';
  if(detik < 3600) return Math.floor(detik/60) + ' menit lalu';
  if(detik < 86400) return Math.floor(detik/3600) + ' jam lalu';
  return Math.floor(detik/86400) + ' hari lalu';
}
function renderAktivitas(){
  const wrap = document.getElementById('timeline-wrap');
  const q = (document.getElementById('cari-aktivitas')?.value || '').toLowerCase();
  const filterTipe = document.getElementById('filter-tipe-aktivitas')?.value || 'semua';
  const { awal, akhir } = dapatkanRentangPeriode('aktivitas');

  const data = DATA.aktivitas.filter(a => {
    const cocokTipe = filterTipe === 'semua' || a.tipe === filterTipe;
    const cocokCari = !q || a.teks.toLowerCase().includes(q) || (a.pelaku_nama || '').toLowerCase().includes(q);
    const cocokPeriode = tanggalDalamRentang(a.dibuat_pada, awal, akhir);
    return cocokTipe && cocokCari && cocokPeriode;
  });

  if(!data.length){
    wrap.innerHTML = `<div class="empty-state"><p>Tidak ada aktivitas yang cocok.</p></div>`;
    return;
  }
  wrap.innerHTML = data.map(a => `
    <div class="timeline-item">
      <div class="timeline-dot">${ikonAktivitas[a.tipe] || ikonAktivitas.proyek}</div>
      <div class="timeline-body">
        <div class="timeline-title">${escB(a.teks)}</div>
        <div class="timeline-meta">${esc(waktuRelatif(a.dibuat_pada))}${a.pelaku_nama ? ' · oleh ' + esc(a.pelaku_nama) : ''}</div>
      </div>
    </div>
  `).join('');
}

/* Tanggal tugas bisa berupa ISO ("2026-07-15", dari input type=date) atau
   format lama Indonesia singkat ("12 Jul", dari data contoh) — fungsi ini
   menangani keduanya secara seragam. */
function tenggatKeTanggal(str){
  if(!str) return null;
  if(/^\d{4}-\d{2}-\d{2}/.test(str)) return new Date(str);
  const tgl = parseTanggalIndo(str);
  if(!tgl) return null;
  return new Date(new Date().getFullYear(), tgl.bulan, tgl.hari);
}
function formatTenggatUniversal(str){
  const d = tenggatKeTanggal(str);
  if(!d) return '—';
  return d.getDate() + ' ' + BULAN_SINGKAT_INDO[d.getMonth()];
}
function labelStatusKerja(s){
  return { belum:'Belum Dikerjakan', dikerjakan:'Dikerjakan', review:'Review', selesai:'Selesai' }[s] || 'Belum Dikerjakan';
}
function statusKerjaTugas(t){
  return t.status_kerja || (t.selesai ? 'selesai' : 'belum');
}

function renderTugas(){
  const tbody = document.getElementById('tbody-tugas');
  const filterAssignee = document.getElementById('filter-assignee-tugas');
  const filterStatus = document.getElementById('filter-status-tugas').value;
  const isAdmin = CURRENT_USER && CURRENT_USER.peran === 'admin';

  // Isi ulang opsi filter anggota berdasarkan profil yang tersedia — hanya
  // akun berstatus 'aktif' (akun 'menunggu'/'ditolak' belum/tidak bisa
  // mengerjakan tugas apa pun, jadi tidak relevan sebagai pilihan assignee).
  const opsiSaatIni = filterAssignee.value;
  filterAssignee.innerHTML = '<option value="semua">Semua Anggota</option>' +
    profilAktif().map(p => `<option value="${p.id}">${esc(p.nama)}</option>`).join('') +
    '<option value="kosong">Belum Ditugaskan</option>';
  filterAssignee.value = opsiSaatIni || 'semua';

  const data = DATA.tugas.filter(t => {
    const cocokStatus = filterStatus === 'semua' || statusKerjaTugas(t) === filterStatus;
    const cocokAssignee = filterAssignee.value === 'semua'
      || (filterAssignee.value === 'kosong' && !t.ditugaskan_ke)
      || t.ditugaskan_ke === filterAssignee.value;
    // Anggota (non-admin) hanya melihat tugas miliknya sendiri atau yang ia buat
    const bolehLihat = isAdmin || !CURRENT_USER || t.ditugaskan_ke === CURRENT_USER.id || t.ditugaskan_oleh === CURRENT_USER.id || !t.ditugaskan_ke;
    return cocokStatus && cocokAssignee && bolehLihat;
  });

  if(!data.length){
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><p>Tidak ada tugas yang cocok.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(t => {
    const assignee = DATA.profil.find(p => p.id === t.ditugaskan_ke);
    const status = statusKerjaTugas(t);
    const bolehUbah = isAdmin || !CURRENT_USER || t.ditugaskan_ke === CURRENT_USER.id;
    return `
    <tr>
      <td class="cell-name">${esc(t.judul)}${t.deskripsi ? `<div class="cell-muted">${esc(t.deskripsi)}</div>` : ''}</td>
      <td>
        <div class="assignee-cell">
          ${isAdmin ? `
          <select class="filter-select" style="font-size:12px;padding:5px 8px;" onchange="ubahAssigneeTugas('${t.id}', this.value)">
            <option value="">Belum ditugaskan</option>
            ${profilAktif().map(p => `<option value="${p.id}" ${p.id===t.ditugaskan_ke?'selected':''}>${esc(p.nama)}</option>`).join('')}
          </select>` : (assignee ? `${markupAvatar(assignee)}<span>${esc(assignee.nama)}</span>` : `<span class="cell-muted">Belum ditugaskan</span>`)}
        </div>
      </td>
      <td><span class="badge-prioritas ${t.prioritas || 'normal'}">${(t.prioritas || 'normal').charAt(0).toUpperCase() + (t.prioritas || 'normal').slice(1)}</span></td>
      <td>
        ${bolehUbah ? `
        <select class="filter-select status-kerja-select" onchange="ubahStatusTugas('${t.id}', this.value)">
          ${['belum','dikerjakan','review','selesai'].map(s => `<option value="${s}" ${s===status?'selected':''}>${labelStatusKerja(s)}</option>`).join('')}
        </select>` : `<span class="badge badge-${ {belum:'belum', dikerjakan:'berjalan', review:'tertunda', selesai:'selesai'}[status] }"><span class="dot"></span>${labelStatusKerja(status)}</span>`}
      </td>
      <td class="cell-muted">${formatTenggatUniversal(t.tenggat)}</td>
      <td class="cell-actions">
        ${isAdmin ? `<div class="icon-btn" title="Hapus" onclick="hapusTugas('${t.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>
        </div>` : ''}
      </td>
    </tr>`;
  }).join('');
}

function bukaModalTugas(){
  const select = document.getElementById('input-assignee-tugas');
  select.innerHTML = '<option value="">Belum ditugaskan</option>' +
    profilAktif().map(p => `<option value="${p.id}">${esc(p.nama)}</option>`).join('');
  bukaModal('modal-tugas');
}

async function tambahTugas(e){
  e.preventDefault();
  const judul = document.getElementById('input-judul-tugas').value.trim();
  const deskripsi = document.getElementById('input-deskripsi-tugas').value.trim() || null;
  const ditugaskan_ke = document.getElementById('input-assignee-tugas').value || null;
  const prioritas = document.getElementById('input-prioritas-tugas').value;
  const tenggat = document.getElementById('input-tenggat-tugas').value || null;
  if(!judul) return;

  const baris = {
    judul, deskripsi, ditugaskan_ke, prioritas, tenggat,
    ditugaskan_oleh: CURRENT_USER ? CURRENT_USER.id : null,
    status_kerja: 'belum', selesai: false,
  };
  const { data, error } = await supabaseClient.from('tugas').insert(baris).select().single();
  if(error){ console.error(error); tampilkanToast('Gagal menambah tugas. Sudahkah migrasi v3 dijalankan?', true); return; }

  DATA.tugas.unshift(data);
  renderTugas();
  renderDashTeamRow();
  if(CURRENT_USER && CURRENT_USER.peran === 'admin') renderPengawasanTim();
  const namaAssignee = DATA.profil.find(p => p.id === ditugaskan_ke)?.nama;
  await catatAktivitas('tugas', `Tugas baru <b>${judul}</b> dibuat${namaAssignee ? ' untuk ' + namaAssignee : ''}`);
  tutupModal('modal-tugas');
  e.target.reset();
  tampilkanToast('Tugas baru ditambahkan');
}

async function ubahStatusTugas(id, statusBaru){
  const t = DATA.tugas.find(x => x.id === id);
  if(!t) return;
  const { error } = await supabaseClient.from('tugas').update({ status_kerja: statusBaru, selesai: statusBaru === 'selesai' }).eq('id', id);
  if(error){ console.error(error); tampilkanToast('Gagal memperbarui tugas', true); return; }
  t.status_kerja = statusBaru;
  t.selesai = statusBaru === 'selesai';
  renderTugas();
  renderDashTeamRow();
  renderNotifikasi();
  if(CURRENT_USER && CURRENT_USER.peran === 'admin') renderPengawasanTim();
  await catatAktivitas('tugas', `Status tugas <b>${esc(t.judul)}</b> diubah menjadi ${labelStatusKerja(statusBaru)}`);
  tampilkanToast('Status tugas diperbarui');
}

/* Admin menugaskan ulang tugas ke anggota lain */
async function ubahAssigneeTugas(id, assigneeBaru){
  const t = DATA.tugas.find(x => x.id === id);
  if(!t) return;
  const { error } = await supabaseClient.from('tugas').update({ ditugaskan_ke: assigneeBaru || null }).eq('id', id);
  if(error){ console.error(error); tampilkanToast('Gagal menugaskan ulang', true); return; }
  t.ditugaskan_ke = assigneeBaru || null;
  renderTugas();
  renderDashTeamRow();
  if(CURRENT_USER && CURRENT_USER.peran === 'admin') renderPengawasanTim();
  const namaBaru = DATA.profil.find(p => p.id === assigneeBaru)?.nama;
  await catatAktivitas('tugas', `Tugas <b>${esc(t.judul)}</b> ditugaskan ulang ke ${namaBaru || 'tidak ada (dilepas)'}`);
  tampilkanToast('Tugas ditugaskan ulang');
}

async function hapusTugas(id){
  const t = DATA.tugas.find(x => x.id === id);
  const { error } = await supabaseClient.from('tugas').delete().eq('id', id);
  if(error){ console.error(error); tampilkanToast('Gagal menghapus tugas', true); return; }
  DATA.tugas = DATA.tugas.filter(x => x.id !== id);
  renderTugas();
  renderDashTeamRow();
  if(CURRENT_USER && CURRENT_USER.peran === 'admin') renderPengawasanTim();
  if(t) await catatAktivitas('tugas', `Tugas <b>${esc(t.judul)}</b> dihapus`);
  tampilkanToast('Tugas dihapus');
}

/* ---------------------------------------------------------
   17b. STOCK & GUDANG (multi-gudang, kartu stok, riwayat)
--------------------------------------------------------- */
function sisaStok(item){ return (item.stok_masuk || 0) - (item.stok_keluar || 0); }

/* Status ditentukan otomatis dari sisa stok vs Stok Minimum, kecuali
   item ditandai "nonaktif" secara manual (produk dihentikan). */
function hitungStatusStok(item){
  if(item.status === 'nonaktif') return 'nonaktif';
  const sisa = sisaStok(item);
  if(sisa <= 0) return 'habis';
  if((item.stok_minimum || 0) > 0 && sisa <= item.stok_minimum) return 'menipis';
  return 'tersedia';
}
function labelStatusStok(s){
  return { tersedia:'Tersedia', menipis:'Stok Menipis', habis:'Stok Habis', nonaktif:'Nonaktif' }[s] || s;
}
function namaGudang(id){
  const g = DATA.gudang.find(x => x.id === id);
  return g ? g.nama : '—';
}

function isiDropdownGudang(excludeIds){
  excludeIds = excludeIds || [];
  // Dropdown gudang di form Tambah/Edit Item (excludeIds dipakai saat mode
  // "+ Gudang Lain" supaya gudang yang sudah punya SKU ini tidak ditawarkan lagi)
  const selForm = document.getElementById('input-gudang-item-stok');
  if(selForm){
    const nilaiSaatIni = selForm.value;
    const daftar = DATA.gudang.filter(g => !excludeIds.includes(g.id));
    selForm.innerHTML = '<option value="" disabled>Pilih gudang...</option>' +
      daftar.map(g => `<option value="${g.id}">${esc(g.nama)}</option>`).join('');
    if(nilaiSaatIni && !excludeIds.includes(nilaiSaatIni)) selForm.value = nilaiSaatIni;
  }
  // Filter gudang di toolbar menu Stock & Gudang
  const selFilter = document.getElementById('filter-lokasi-gudang');
  if(selFilter){
    const nilaiSaatIni = selFilter.value || 'semua';
    selFilter.innerHTML = '<option value="semua">Semua Gudang</option>' +
      DATA.gudang.map(g => `<option value="${g.id}">${esc(g.nama)}</option>`).join('');
    selFilter.value = nilaiSaatIni;
  }
}
/* Sumber kategori sekarang tabel master kategori_produk (bukan lagi teks bebas
   hasil scan stok_item), supaya daftar kategori tetap konsisten di mana pun
   dropdown/filter kategori dipakai. */
function daftarNamaKategori(){
  return DATA.kategoriProduk.length ? DATA.kategoriProduk.map(k => k.nama) : ['Umum'];
}
function isiDropdownKategoriGudang(){
  const sel = document.getElementById('filter-kategori-gudang');
  if(!sel) return;
  const nilaiSaatIni = sel.value || 'semua';
  sel.innerHTML = '<option value="semua">Semua Kategori</option>' +
    daftarNamaKategori().map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
  sel.value = nilaiSaatIni;
}
/* Isi dropdown kategori pada form Tambah/Edit Item Stok & Edit Produk Master —
   dipisah dari filter kategori di atas karena elemennya select biasa (bukan
   filter "semua"), jadi selalu diisi ulang dari kategoriProduk terbaru. */
function isiDropdownKategoriForm(idSelect){
  const sel = document.getElementById(idSelect);
  if(!sel) return;
  const nilaiSaatIni = sel.value;
  sel.innerHTML = daftarNamaKategori().map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
  if(nilaiSaatIni && daftarNamaKategori().includes(nilaiSaatIni)) sel.value = nilaiSaatIni;
}
/* Sumber merek dari tabel master kategori_merek — pola persis sama dengan
   kategori_produk di atas, supaya daftar Merek juga selalu konsisten
   (tidak ada lagi "Samsung" vs "samsung" vs "SAMSUNG" karena salah ketik). */
function daftarNamaMerek(){
  return DATA.kategoriMerek.length ? DATA.kategoriMerek.map(m => m.nama) : ['Umum'];
}
function isiDropdownMerekGudang(){
  const sel = document.getElementById('filter-merek-gudang');
  if(!sel) return;
  const nilaiSaatIni = sel.value || 'semua';
  sel.innerHTML = '<option value="semua">Semua Merek</option>' +
    daftarNamaMerek().map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
  sel.value = nilaiSaatIni;
}
/* Isi dropdown merek pada form Tambah/Edit Item Stok & Edit Produk Master —
   sama seperti isiDropdownKategoriForm, dipakai di elemen select biasa. */
function isiDropdownMerekForm(idSelect){
  const sel = document.getElementById(idSelect);
  if(!sel) return;
  const nilaiSaatIni = sel.value;
  sel.innerHTML = daftarNamaMerek().map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
  if(nilaiSaatIni && daftarNamaMerek().includes(nilaiSaatIni)) sel.value = nilaiSaatIni;
}

function renderStatGudang(){
  const wrap = document.getElementById('stat-gudang');
  const items = DATA.stokItem;
  const jumlahMenipis = items.filter(i => hitungStatusStok(i) === 'menipis').length;
  const jumlahHabis = items.filter(i => hitungStatusStok(i) === 'habis').length;

  const badge = document.getElementById('badge-gudang');
  if(badge){
    const totalPeringatan = jumlahMenipis + jumlahHabis;
    if(totalPeringatan > 0){ badge.textContent = totalPeringatan; badge.style.display = ''; }
    else { badge.style.display = 'none'; }
  }
  if(!wrap) return;
  const kartu = [
    ['Total Item (SKU x Gudang)', items.length, 'cmd-grad-blue'],
    ['Jumlah Gudang', DATA.gudang.length, 'cmd-grad-cyan'],
    ['Stok Menipis', jumlahMenipis, jumlahMenipis ? 'cmd-grad-yellow' : 'cmd-grad-green'],
    ['Stok Habis', jumlahHabis, jumlahHabis ? 'cmd-grad-purple' : 'cmd-grad-green'],
  ];
  wrap.innerHTML = kartu.map(([label, val, grad]) => `
    <div class="kpi-card cmd-stat-card ${grad}">
      <div class="kpi-top"><span class="kpi-label">${label}</span></div>
      <div class="kpi-bottom"><div class="kpi-value">${val}</div></div>
    </div>`).join('');
}

function renderGudang(){
  isiDropdownGudang();
  isiDropdownMerekGudang();
  isiDropdownKategoriGudang();
  renderStatGudang();
  const tbody = document.getElementById('tbody-gudang');
  if(!tbody) return;
  const isAdmin = CURRENT_USER && CURRENT_USER.peran === 'admin';
  const q = (document.getElementById('cari-gudang').value || '').toLowerCase();
  const filterGudang = document.getElementById('filter-lokasi-gudang').value;
  const filterMerek = document.getElementById('filter-merek-gudang').value;
  const filterKategori = document.getElementById('filter-kategori-gudang').value;
  const filterStatus = document.getElementById('filter-status-gudang').value;

  const data = DATA.stokItem.filter(i => {
    const cocokCari = i.sku.toLowerCase().includes(q) || i.nama_produk.toLowerCase().includes(q) || (i.variant || '').toLowerCase().includes(q);
    const cocokGudang = filterGudang === 'semua' || i.gudang_id === filterGudang;
    const cocokMerek = filterMerek === 'semua' || (i.merek || 'Umum') === filterMerek;
    const cocokKategori = filterKategori === 'semua' || (i.kategori || 'Umum') === filterKategori;
    const cocokStatus = filterStatus === 'semua' || hitungStatusStok(i) === filterStatus;
    return cocokCari && cocokGudang && cocokMerek && cocokKategori && cocokStatus;
  });

  if(!data.length){
    tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state"><p>Tidak ada item stok yang cocok.</p></div></td></tr>`;
    return;
  }

  // Kelompokkan baris yang tampil per SKU — 1 SKU = 1 baris rapi, dengan
  // data tiap gudang ditampilkan sebagai badge terpisah di kolom Gudang
  // (klik badge untuk buka detail Masuk/Keluar gudang itu), bukan lewat
  // rowspan yang bikin banyak baris. Kolom Total Stok, Update Terakhir,
  // dan Status merangkum seluruh gudang pada SKU tersebut.
  const grup = new Map();
  data.forEach(i => {
    if(!grup.has(i.sku)){
      grup.set(i.sku, { sku: i.sku, nama_produk: i.nama_produk, variant: i.variant, merek: i.merek, kategori: i.kategori, entri: [] });
    }
    grup.get(i.sku).entri.push(i);
  });

  const urutanStatus = { habis: 0, menipis: 1, tersedia: 2, nonaktif: 3 };

  tbody.innerHTML = [...grup.values()].map(p => {
    const totalSisa = p.entri.reduce((jml, i) => jml + sisaStok(i), 0);
    const statusGabungan = p.entri.map(hitungStatusStok).sort((a, b) => urutanStatus[a] - urutanStatus[b])[0];
    const terbaru = p.entri.reduce((t, i) => (!t || (i.diupdate_pada || '') > (t.diupdate_pada || '')) ? i : t, null);
    const gudangBadges = p.entri.map(i => {
      const s = hitungStatusStok(i);
      return `<span class="gudang-badge gudang-badge-clickable gudang-badge--${s}" title="Klik untuk lihat detail Masuk/Keluar · ${labelStatusStok(s)}" onclick="bukaDetailStok('${i.id}')">
        ${namaGudang(i.gudang_id)} · <b>${sisaStok(i).toLocaleString('id-ID')}</b>
        <span class="gudang-badge-edit" title="Edit Item Gudang Ini" onclick="event.stopPropagation(); editItemStok('${i.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </span>
      </span>`;
    }).join('');

    return `
    <tr>
      <td class="cell-muted">${esc(p.sku)}</td>
      <td class="cell-name">${esc(p.nama_produk)}</td>
      <td>${esc(p.variant) || '—'}</td>
      <td>${esc(p.merek) || 'Umum'}</td>
      <td>${esc(p.kategori) || 'Umum'}</td>
      <td><div class="gudang-badge-list">${gudangBadges}</div></td>
      <td><b>${totalSisa.toLocaleString('id-ID')}</b></td>
      <td class="cell-muted">${terbaru && terbaru.diupdate_pada ? waktuRelatif(terbaru.diupdate_pada) : '—'}</td>
      <td class="cell-muted">${(terbaru && esc(terbaru.diupdate_oleh_nama)) || '—'}</td>
      <td><span class="stok-status stok-status--${statusGabungan}">${labelStatusStok(statusGabungan)}</span></td>
      <td class="cell-actions">
        <div class="icon-btn" title="Tambahkan ke Gudang Lain" onclick="bukaModalTambahKeGudangLain('${esc(p.sku)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 8L12 3 3 8v9a1 1 0 001 1h4v-6h8v6h4a1 1 0 001-1V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 12v5m-2.5-2.5h5"/></svg>
        </div>
        <div class="icon-btn" title="Edit Produk (semua gudang)" onclick="bukaModalEditProdukMaster('${esc(p.sku)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </div>
        ${bolehKelolaStok() ? `<div class="icon-btn" title="Hapus dari semua gudang" onclick="hapusProdukMaster('${esc(p.sku)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>
        </div>` : ''}
      </td>
    </tr>`;
  }).join('');
}

function bukaModalTambahItemStok(){
  if(!DATA.gudang.length){
    tampilkanToast('Tambah gudang terlebih dahulu lewat "Manajemen Produk & Kategori"', true);
    return;
  }
  document.getElementById('form-item-stok').reset();
  document.getElementById('input-id-item-stok').value = '';
  document.getElementById('input-status-item-stok').value = 'aktif';
  document.getElementById('input-satuan-item-stok').value = 'Pcs';
  document.getElementById('wrap-stok-awal-item-stok').style.display = '';
  document.getElementById('input-stok-awal-item-stok').disabled = false;
  document.getElementById('catatan-modal-item-stok').innerHTML = 'Stok Minimum dipakai sistem untuk otomatis menandai status "Stok Menipis". Setelah item dibuat, klik angka <b>Stok Masuk</b> atau <b>Stok Keluar</b> pada tabel untuk mencatat pergerakan stok baru agar riwayatnya tetap tercatat.';
  document.getElementById('judul-modal-item-stok').textContent = 'Tambah Item Stok';
  document.getElementById('btn-simpan-item-stok').textContent = 'Simpan Item';
  ['input-sku-item-stok','input-kategori-item-stok','input-merek-item-stok','input-nama-item-stok','input-variant-item-stok','input-satuan-item-stok'].forEach(id => document.getElementById(id).disabled = false);
  isiDropdownKategoriForm('input-kategori-item-stok');
  isiDropdownMerekForm('input-merek-item-stok');
  isiDropdownGudang();
  bukaModal('modal-item-stok');
}

/* Saat mode Tambah Item (bukan edit, bukan "+ Gudang Lain" yang sudah
   mengunci SKU duluan), cek tiap kali SKU diketik: kalau SKU itu ternyata
   sudah dipakai produk lain di gudang lain, otomatis isi & kunci Kategori/
   Nama/Variant/Satuan dari produk yang sudah ada + saring dropdown Gudang
   supaya gudang yang sudah punya SKU ini tidak muncul lagi. Ini menutup
   celah utama penyebab data produk "ngedrift" antar gudang: menambah SKU
   yang sama dari tabel utama tanpa sadar SKU itu sudah terdaftar. */
function cekSkuSudahAda(){
  const skuField = document.getElementById('input-sku-item-stok');
  if(document.getElementById('input-id-item-stok').value || skuField.disabled) return; // mode edit / mode "+ Gudang Lain"
  const skuDiketik = skuField.value.trim().toLowerCase();
  const existing = skuDiketik ? DATA.stokItem.find(x => (x.sku || '').toLowerCase() === skuDiketik) : null;
  const fieldsTerkunci = ['input-kategori-item-stok','input-merek-item-stok','input-nama-item-stok','input-variant-item-stok','input-satuan-item-stok'];
  if(existing){
    isiDropdownKategoriForm('input-kategori-item-stok');
    document.getElementById('input-kategori-item-stok').value = existing.kategori || 'Umum';
    isiDropdownMerekForm('input-merek-item-stok');
    document.getElementById('input-merek-item-stok').value = existing.merek || 'Umum';
    document.getElementById('input-nama-item-stok').value = existing.nama_produk;
    document.getElementById('input-variant-item-stok').value = existing.variant || '';
    document.getElementById('input-satuan-item-stok').value = existing.satuan || 'Pcs';
    document.getElementById('input-stok-minimum-item-stok').value = existing.stok_minimum || 0;
    fieldsTerkunci.forEach(id => document.getElementById(id).disabled = true);
    const gudangTerpakai = DATA.stokItem.filter(x => (x.sku || '').toLowerCase() === skuDiketik).map(x => x.gudang_id);
    isiDropdownGudang(gudangTerpakai);
    if(gudangTerpakai.length >= DATA.gudang.length){
      document.getElementById('catatan-modal-item-stok').innerHTML = `SKU ini (<b>${esc(existing.nama_produk)}</b>) sudah tercatat di <b>semua gudang</b> yang ada — tidak ada gudang tersisa untuk ditambahkan.`;
    } else {
      document.getElementById('catatan-modal-item-stok').innerHTML = `SKU ini sudah terdaftar sebagai <b>${esc(existing.nama_produk)}</b> — Merek/Kategori/Nama/Variant/Satuan dikunci otomatis agar konsisten. Pilih gudang tujuan &amp; isi Stok Awal.`;
    }
  } else {
    fieldsTerkunci.forEach(id => document.getElementById(id).disabled = false);
    isiDropdownGudang();
    document.getElementById('catatan-modal-item-stok').innerHTML = 'Stok Minimum dipakai sistem untuk otomatis menandai status "Stok Menipis". Setelah item dibuat, klik angka <b>Stok Masuk</b> atau <b>Stok Keluar</b> pada tabel untuk mencatat pergerakan stok baru agar riwayatnya tetap tercatat.';
  }
}

function editItemStok(id){
  const i = DATA.stokItem.find(x => x.id === id);
  if(!i) return;
  isiDropdownGudang();
  isiDropdownKategoriForm('input-kategori-item-stok');
  isiDropdownMerekForm('input-merek-item-stok');
  document.getElementById('input-id-item-stok').value = i.id;
  document.getElementById('input-gudang-item-stok').value = i.gudang_id;
  document.getElementById('input-sku-item-stok').value = i.sku || '';
  document.getElementById('input-kategori-item-stok').value = i.kategori || 'Umum';
  document.getElementById('input-merek-item-stok').value = i.merek || 'Umum';
  document.getElementById('input-nama-item-stok').value = i.nama_produk || '';
  document.getElementById('input-variant-item-stok').value = i.variant || '';
  document.getElementById('input-stok-minimum-item-stok').value = i.stok_minimum || 0;
  document.getElementById('input-satuan-item-stok').value = i.satuan || 'Pcs';
  document.getElementById('input-status-item-stok').value = i.status || 'aktif';
  // Identitas produk (SKU/Merek/Kategori/Nama/Variant/Satuan) DIKUNCI di sini — supaya
  // tidak bisa lagi "ngedrift" beda-beda antar gudang seperti sebelumnya. Untuk
  // mengubahnya, arahkan ke tab Produk (Manajemen Produk & Kategori) yang otomatis
  // menyamakan perubahan ke semua gudang sekaligus.
  ['input-sku-item-stok','input-kategori-item-stok','input-merek-item-stok','input-nama-item-stok','input-variant-item-stok','input-satuan-item-stok'].forEach(idEl => document.getElementById(idEl).disabled = true);
  // Stok Masuk/Keluar hanya bisa diubah lewat "Tambah Stok" (menjaga riwayat tetap akurat)
  document.getElementById('wrap-stok-awal-item-stok').style.display = 'none';
  document.getElementById('catatan-modal-item-stok').innerHTML = `Sisa stok saat ini: <b>${sisaStok(i).toLocaleString('id-ID')}</b>. SKU/Merek/Kategori/Nama/Variant/Satuan dikunci di sini — ubah lewat <b>Manajemen Produk &amp; Kategori &gt; tab Produk</b> agar konsisten di semua gudang. Klik angka <b>Stok Masuk</b> atau <b>Stok Keluar</b> pada tabel untuk mencatat pergerakan stok baru.`;
  document.getElementById('judul-modal-item-stok').textContent = 'Edit Item Stok';
  document.getElementById('btn-simpan-item-stok').textContent = 'Simpan Perubahan';
  bukaModal('modal-item-stok');
}

async function simpanItemStok(e){
  e.preventDefault();
  const id = document.getElementById('input-id-item-stok').value;
  const gudang_id = document.getElementById('input-gudang-item-stok').value;
  const sku = document.getElementById('input-sku-item-stok').value.trim();
  const nama_produk = document.getElementById('input-nama-item-stok').value.trim();
  const variant = document.getElementById('input-variant-item-stok').value.trim() || null;
  const kategori = document.getElementById('input-kategori-item-stok').value.trim() || 'Umum';
  const kategoriObj = DATA.kategoriProduk.find(k => k.nama === kategori);
  const kategori_id = kategoriObj ? kategoriObj.id : null;
  const merek = document.getElementById('input-merek-item-stok').value.trim() || 'Umum';
  const merekObj = DATA.kategoriMerek.find(m => m.nama === merek);
  const merek_id = merekObj ? merekObj.id : null;
  const stok_minimum = Number(document.getElementById('input-stok-minimum-item-stok').value) || 0;
  const satuan = document.getElementById('input-satuan-item-stok').value.trim() || 'Pcs';
  const status = document.getElementById('input-status-item-stok').value;
  if(!gudang_id || !sku || !nama_produk) return;

  const diupdate_oleh_id = CURRENT_USER ? CURRENT_USER.id : null;
  const diupdate_oleh_nama = CURRENT_USER ? CURRENT_USER.nama : null;

  if(id){
    // --- mode edit: hanya metadata, jumlah stok tidak diubah dari sini ---
    const baris = { gudang_id, sku, nama_produk, variant, kategori, kategori_id, merek, merek_id, stok_minimum, satuan, status, diupdate_oleh_id, diupdate_oleh_nama, diupdate_pada: new Date().toISOString() };
    const { data, error } = await supabaseClient.from('stok_item').update(baris).eq('id', id).select().single();
    if(error){ console.error(error); tampilkanToast(pesanErrorKode(error, 'SKU pada gudang ini') || 'Gagal menyimpan perubahan item', true); return; }
    const idx = DATA.stokItem.findIndex(x => x.id === id);
    if(idx > -1) DATA.stokItem[idx] = data;
    renderGudang();
    renderProdukMaster();
    await catatAktivitas('gudang', `Item stok <b>${nama_produk}</b> (${sku}) diperbarui`);
    tutupModal('modal-item-stok');
    tampilkanToast('Perubahan item stok disimpan');
  } else {
    // --- mode tambah (juga dipakai oleh "+ Gudang Lain" dari tab Produk) ---
    const stokAwal = Number(document.getElementById('input-stok-awal-item-stok').value) || 0;
    const baris = { gudang_id, sku, nama_produk, variant, kategori, kategori_id, merek, merek_id, stok_minimum, satuan, status, stok_masuk: stokAwal, stok_keluar: 0, diupdate_oleh_id, diupdate_oleh_nama };
    const { data, error } = await supabaseClient.from('stok_item').insert(baris).select().single();
    if(error){ console.error(error); tampilkanToast(pesanErrorKode(error, 'SKU pada gudang ini') || 'Gagal menambah item stok', true); return; }
    DATA.stokItem.unshift(data);
    if(stokAwal > 0){
      await supabaseClient.from('riwayat_stok').insert({ item_id: data.id, tipe: 'masuk', stok_baru: stokAwal, jumlah: stokAwal, catatan: 'Stok awal saat item dibuat', dibuat_oleh_id: diupdate_oleh_id, dibuat_oleh_nama: diupdate_oleh_nama });
    }
    renderGudang();
    renderProdukMaster();
    await catatAktivitas('gudang', `Item stok baru <b>${nama_produk}</b> (${sku}) ditambahkan di ${namaGudang(gudang_id)}`);
    tutupModal('modal-item-stok');
    tampilkanToast('Item stok baru ditambahkan');
  }
  e.target.reset();
  document.getElementById('input-id-item-stok').value = '';
}

async function hapusItemStok(id){
  const i = DATA.stokItem.find(x => x.id === id);
  const { error } = await supabaseClient.from('stok_item').delete().eq('id', id);
  if(error){ console.error(error); tampilkanToast('Gagal menghapus item stok', true); return; }
  DATA.stokItem = DATA.stokItem.filter(x => x.id !== id);
  renderGudang();
  renderProdukMaster();
  if(i) await catatAktivitas('gudang', `Item stok <b>${esc(i.nama_produk)}</b> (${esc(i.sku)}) dihapus`);
  tampilkanToast('Item stok dihapus');
}

/* ---------------------------------------------------------
   17c. DETAIL STOK MASUK (per item, dibuka dari klik angka
   Stok Masuk pada tabel Stock & Gudang). Setiap baris riwayat
   di sini adalah satu penerimaan barang (satu No DO/No PO/
   tanggal/vendor), lengkap dengan rincian kuantitas per kondisi
   barang sekaligus: Stok Baru, Stok Bekas, Stok Rusak — Total
   Stok dihitung otomatis (jumlah ketiganya) dan disimpan di
   kolom "jumlah" untuk akumulasi Stok Masuk pada kartu stok.
--------------------------------------------------------- */
let STOK_ITEM_AKTIF_ID = null; // id item stok yang sedang dibuka di halaman detail (masuk maupun keluar)

let STOK_DETAIL_TAB_AKTIF = 'masuk'; // tab aktif di halaman Detail Stok gabungan ('masuk' atau 'keluar')

function bukaDetailStok(itemId, tabAwal){
  STOK_ITEM_AKTIF_ID = itemId;
  const cariMasuk = document.getElementById('cari-stok-masuk-detail');
  if(cariMasuk) cariMasuk.value = '';
  const filterMasuk = document.getElementById('filter-kondisi-stok-masuk-detail');
  if(filterMasuk) filterMasuk.value = 'semua';
  const cariKeluar = document.getElementById('cari-stok-keluar-detail');
  if(cariKeluar) cariKeluar.value = '';
  const filterStatusKeluar = document.getElementById('filter-status-keluar-stok-keluar-detail');
  if(filterStatusKeluar) filterStatusKeluar.value = 'semua';
  pindahTampilan('stok-detail');
  pindahTabStokDetail(tabAwal || 'masuk');
}
// Dipertahankan sebagai alias supaya kompatibel jika ada bagian lain kode yang
// masih memanggil nama fungsi lama secara langsung.
function bukaDetailStokMasuk(itemId){ bukaDetailStok(itemId, 'masuk'); }
function bukaDetailStokKeluar(itemId){ bukaDetailStok(itemId, 'keluar'); }

/* Beralih tab Stok Masuk <-> Stok Keluar di dalam satu halaman Detail Stok,
   tanpa perlu berpindah halaman/menu — supaya riwayat masuk & keluar untuk
   produk yang sama bisa dicek berdampingan dari satu tempat. */
function pindahTabStokDetail(tab){
  STOK_DETAIL_TAB_AKTIF = tab;
  document.querySelectorAll('#view-stok-detail .mp-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.stokTab === tab));
  document.querySelectorAll('#view-stok-detail .mp-tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('stok-tab-' + tab).classList.add('active');
  renderDetailStok();
}

function renderDetailStok(){
  const i = DATA.stokItem.find(x => x.id === STOK_ITEM_AKTIF_ID);
  if(!i){
    // Item sudah dihapus/tidak ditemukan — kembali ke daftar Stock & Gudang
    pindahTampilan('gudang');
    return;
  }
  const status = hitungStatusStok(i);
  document.getElementById('detail-stok-nama-produk').textContent = i.nama_produk;
  document.getElementById('detail-stok-sku').textContent = 'SKU: ' + i.sku;
  document.getElementById('detail-stok-variant').textContent = i.variant || 'Tanpa Variant';
  document.getElementById('detail-stok-gudang').textContent = 'Gudang: ' + namaGudang(i.gudang_id);
  document.getElementById('detail-stok-sisa').textContent = 'Sisa Stok: ' + sisaStok(i).toLocaleString('id-ID') + ' ' + (i.satuan || 'Pcs');
  document.getElementById('detail-stok-status').innerHTML = `<span class="stok-status stok-status--${status}">${labelStatusStok(status)}</span>`;

  if(STOK_DETAIL_TAB_AKTIF === 'keluar') renderTabelStokKeluarDetail();
  else renderTabelStokMasukDetail();
}

function renderTabelStokMasukDetail(){
  const tbody = document.getElementById('tbody-stok-masuk-detail');
  if(!tbody || !STOK_ITEM_AKTIF_ID) return;
  const isAdmin = CURRENT_USER && CURRENT_USER.peran === 'admin';
  const q = (document.getElementById('cari-stok-masuk-detail').value || '').toLowerCase();
  const filterKondisi = document.getElementById('filter-kondisi-stok-masuk-detail').value;

  const data = DATA.riwayatStok.filter(r => {
    if(r.item_id !== STOK_ITEM_AKTIF_ID || r.tipe !== 'masuk') return false;
    if(filterKondisi !== 'semua' && Number(r[`stok_${filterKondisi}`] || 0) <= 0) return false;
    if(!q) return true;
    const gabungan = [r.no_do, r.vendor_nama, r.no_po, r.catatan].filter(Boolean).join(' ').toLowerCase();
    return gabungan.includes(q);
  }).sort((a,b) => (b.tanggal || '').localeCompare(a.tanggal || '') || (b.dibuat_pada || '').localeCompare(a.dibuat_pada || ''));

  if(!data.length){
    tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state">
      <p>Belum ada riwayat stok masuk untuk produk ini.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(r => {
    const stokBaru = Number(r.stok_baru || 0);
    const stokBekas = Number(r.stok_bekas || 0);
    const stokRusak = Number(r.stok_rusak || 0);
    const total = Number(r.jumlah || (stokBaru + stokBekas + stokRusak));
    return `
    <tr>
      <td class="cell-muted">${formatTanggal(r.tanggal)}</td>
      <td>${esc(r.vendor_nama) || '—'}</td>
      <td>${esc(r.no_do) || '—'}</td>
      <td>${esc(r.no_po) || '—'}</td>
      <td>${stokBaru ? stokBaru.toLocaleString('id-ID') : '—'}</td>
      <td>${stokBekas ? stokBekas.toLocaleString('id-ID') : '—'}</td>
      <td>${stokRusak ? stokRusak.toLocaleString('id-ID') : '—'}</td>
      <td><b>${total.toLocaleString('id-ID')}</b></td>
      <td>${esc(r.satuan) || '—'}</td>
      <td class="cell-muted">${esc(r.catatan) || '—'}</td>
      <td class="cell-actions">
        <div class="icon-btn" title="Edit" onclick="editStokMasuk('${r.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </div>
        ${bolehKelolaStok() ? `<div class="icon-btn" title="Hapus" onclick="hapusStokMasuk('${r.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>
        </div>` : ''}
      </td>
    </tr>`;
  }).join('');
}

/* Isi datalist Nama Vendor dengan nama-nama vendor yang sudah pernah dipakai,
   supaya pengetikan vendor tetap konsisten tanpa perlu tabel master baru. */
function isiDatalistVendorStokMasuk(){
  const dl = document.getElementById('list-vendor-stok-masuk');
  if(!dl) return;
  const vendorUnik = [...new Set(DATA.riwayatStok.filter(r => r.tipe === 'masuk' && r.vendor_nama).map(r => r.vendor_nama))].sort();
  dl.innerHTML = vendorUnik.map(v => `<option value="${v.replace(/"/g,'&quot;')}"></option>`).join('');
}

function bukaModalTambahStokMasuk(){
  const i = DATA.stokItem.find(x => x.id === STOK_ITEM_AKTIF_ID);
  if(!i) return;
  isiDatalistVendorStokMasuk();
  document.getElementById('form-stok-masuk').reset();
  document.getElementById('input-id-riwayat-stok-masuk').value = '';
  document.getElementById('input-tanggal-stok-masuk').value = new Date().toISOString().slice(0,10);
  document.getElementById('input-satuan-stok-masuk').value = i.satuan || 'Pcs';
  document.getElementById('input-stok-baru-masuk').value = '';
  document.getElementById('input-stok-bekas-masuk').value = '';
  document.getElementById('input-stok-rusak-masuk').value = '';
  document.getElementById('info-item-stok-masuk').innerHTML = `<b>${esc(i.nama_produk)}</b> (${esc(i.sku)}) · ${namaGudang(i.gudang_id)} — Sisa stok saat ini: <b>${sisaStok(i).toLocaleString('id-ID')} ${esc(i.satuan) || 'Pcs'}</b>`;
  document.getElementById('judul-modal-stok-masuk').textContent = 'Tambah Stok Masuk';
  document.getElementById('btn-simpan-stok-masuk').textContent = 'Simpan Stok Masuk';
  hitungTotalStokMasukForm();
  bukaModal('modal-stok-masuk');
}

/* Menghitung & menampilkan Total Stok secara langsung di form Tambah/Edit
   Stok Masuk saat pengguna mengisi Stok Baru/Bekas/Rusak, supaya totalnya
   terlihat sebelum disimpan (Total Stok = Stok Baru + Stok Bekas + Stok Rusak). */
function hitungTotalStokMasukForm(){
  const baru = Number(document.getElementById('input-stok-baru-masuk').value) || 0;
  const bekas = Number(document.getElementById('input-stok-bekas-masuk').value) || 0;
  const rusak = Number(document.getElementById('input-stok-rusak-masuk').value) || 0;
  document.getElementById('total-stok-masuk-form').textContent = 'Total Stok: ' + (baru + bekas + rusak).toLocaleString('id-ID');
}

function editStokMasuk(riwayatId){
  const r = DATA.riwayatStok.find(x => x.id === riwayatId);
  const i = DATA.stokItem.find(x => x.id === STOK_ITEM_AKTIF_ID);
  if(!r || !i) return;
  isiDatalistVendorStokMasuk();
  document.getElementById('form-stok-masuk').reset();
  document.getElementById('input-id-riwayat-stok-masuk').value = r.id;
  document.getElementById('input-tanggal-stok-masuk').value = r.tanggal || new Date().toISOString().slice(0,10);
  document.getElementById('input-no-do-stok-masuk').value = r.no_do || '';
  document.getElementById('input-vendor-stok-masuk').value = r.vendor_nama || '';
  document.getElementById('input-no-po-stok-masuk').value = r.no_po || '';
  document.getElementById('input-satuan-stok-masuk').value = r.satuan || i.satuan || 'Pcs';
  document.getElementById('input-stok-baru-masuk').value = r.stok_baru || '';
  document.getElementById('input-stok-bekas-masuk').value = r.stok_bekas || '';
  document.getElementById('input-stok-rusak-masuk').value = r.stok_rusak || '';
  document.getElementById('input-catatan-stok-masuk').value = r.catatan || '';
  document.getElementById('info-item-stok-masuk').innerHTML = `<b>${esc(i.nama_produk)}</b> (${esc(i.sku)}) · ${namaGudang(i.gudang_id)} — Sisa stok saat ini: <b>${sisaStok(i).toLocaleString('id-ID')} ${esc(i.satuan) || 'Pcs'}</b>`;
  document.getElementById('judul-modal-stok-masuk').textContent = 'Edit Stok Masuk';
  document.getElementById('btn-simpan-stok-masuk').textContent = 'Simpan Perubahan';
  hitungTotalStokMasukForm();
  bukaModal('modal-stok-masuk');
}

async function simpanStokMasuk(e){
  e.preventDefault();
  const i = DATA.stokItem.find(x => x.id === STOK_ITEM_AKTIF_ID);
  if(!i) return;
  const idRiwayat = document.getElementById('input-id-riwayat-stok-masuk').value;
  const tanggal = document.getElementById('input-tanggal-stok-masuk').value || new Date().toISOString().slice(0,10);
  const no_do = document.getElementById('input-no-do-stok-masuk').value.trim() || null;
  const vendor_nama = document.getElementById('input-vendor-stok-masuk').value.trim() || null;
  const no_po = document.getElementById('input-no-po-stok-masuk').value.trim() || null;
  const stok_baru = Math.max(0, Number(document.getElementById('input-stok-baru-masuk').value) || 0);
  const stok_bekas = Math.max(0, Number(document.getElementById('input-stok-bekas-masuk').value) || 0);
  const stok_rusak = Math.max(0, Number(document.getElementById('input-stok-rusak-masuk').value) || 0);
  const satuan = document.getElementById('input-satuan-stok-masuk').value.trim() || i.satuan || 'Pcs';
  const catatan = document.getElementById('input-catatan-stok-masuk').value.trim() || null;
  const qty = stok_baru + stok_bekas + stok_rusak;

  if(qty <= 0){
    tampilkanToast('Isi minimal salah satu dari Stok Baru, Stok Bekas, atau Stok Rusak', true);
    return;
  }

  const pelaku_id = CURRENT_USER ? CURRENT_USER.id : null;
  const pelaku_nama = CURRENT_USER ? CURRENT_USER.nama : null;

  // --- Validasi sisa stok: mengurangi Qty stok masuk (lewat edit) tidak boleh membuat Sisa Stok jadi negatif ---
  const entriLama = idRiwayat ? DATA.riwayatStok.find(x => x.id === idRiwayat) : null;
  const qtyLama = entriLama ? Number(entriLama.jumlah || 0) : 0;
  const totalMasukBaru = (i.stok_masuk || 0) - qtyLama + qty;
  const sisaBaru = totalMasukBaru - (i.stok_keluar || 0);
  if(sisaBaru < 0){
    tampilkanToast('Qty terlalu kecil — Sisa Stok akan menjadi negatif karena stok keluar yang sudah tercatat', true);
    return;
  }

  const barisRiwayat = { tanggal, no_do, vendor_nama, no_po, jumlah: qty, satuan, stok_baru, stok_bekas, stok_rusak, catatan };

  if(idRiwayat){
    // --- mode edit ---
    const { data, error } = await supabaseClient.from('riwayat_stok').update(barisRiwayat).eq('id', idRiwayat).select().single();
    if(error){ console.error(error); tampilkanToast(pesanErrorKode(error) || 'Gagal menyimpan perubahan stok masuk. Pastikan migrasi v12 di schema.sql sudah dijalankan.', true); return; }
    const idx = DATA.riwayatStok.findIndex(x => x.id === idRiwayat);
    if(idx > -1) DATA.riwayatStok[idx] = data;
  } else {
    // --- mode tambah ---
    const { data, error } = await supabaseClient.from('riwayat_stok')
      .insert({ item_id: i.id, tipe: 'masuk', dibuat_oleh_id: pelaku_id, dibuat_oleh_nama: pelaku_nama, ...barisRiwayat })
      .select().single();
    if(error){ console.error(error); tampilkanToast(pesanErrorKode(error) || 'Gagal menambah stok masuk. Pastikan migrasi v12 di schema.sql sudah dijalankan.', true); return; }
    DATA.riwayatStok.unshift(data);
  }

  // --- Perbarui akumulasi Stok Masuk & Update Terakhir pada kartu stok ---
  const barisItem = { stok_masuk: totalMasukBaru, diupdate_oleh_id: pelaku_id, diupdate_oleh_nama: pelaku_nama, diupdate_pada: new Date().toISOString() };
  const { data: itemBaru, error: errItem } = await supabaseClient.from('stok_item').update(barisItem).eq('id', i.id).select().single();
  if(errItem){ console.error(errItem); tampilkanToast('Stok masuk tersimpan, tapi gagal memperbarui akumulasi Stok Masuk pada kartu stok', true); }
  else {
    const idxItem = DATA.stokItem.findIndex(x => x.id === i.id);
    if(idxItem > -1) DATA.stokItem[idxItem] = itemBaru;
  }

  renderDetailStok();
  renderGudang();
  renderProdukMaster();

  await catatAktivitas('gudang', `Stok masuk <b>${qty.toLocaleString('id-ID')} ${satuan}</b> ${idRiwayat ? 'diperbarui' : 'dicatat'} untuk <b>${esc(i.nama_produk)}</b> (${esc(i.sku)}) · ${namaGudang(i.gudang_id)}${vendor_nama ? ' dari ' + vendor_nama : ''}`);
  tutupModal('modal-stok-masuk');
  tampilkanToast(idRiwayat ? 'Perubahan stok masuk disimpan' : 'Stok masuk dicatat');
  e.target.reset();
}

async function hapusStokMasuk(riwayatId){
  const r = DATA.riwayatStok.find(x => x.id === riwayatId);
  const i = DATA.stokItem.find(x => x.id === STOK_ITEM_AKTIF_ID);
  if(!r || !i) return;

  // --- Tolak hapus jika akan membuat Sisa Stok negatif (stok keluar sudah lebih besar) ---
  const totalMasukBaru = Math.max(0, (i.stok_masuk || 0) - Number(r.jumlah || 0));
  if(totalMasukBaru - (i.stok_keluar || 0) < 0){
    tampilkanToast('Tidak bisa menghapus — Sisa Stok akan menjadi negatif karena stok keluar yang sudah tercatat', true);
    return;
  }

  const { error } = await supabaseClient.from('riwayat_stok').delete().eq('id', riwayatId);
  if(error){ console.error(error); tampilkanToast('Gagal menghapus riwayat stok masuk', true); return; }
  DATA.riwayatStok = DATA.riwayatStok.filter(x => x.id !== riwayatId);

  const pelaku_id = CURRENT_USER ? CURRENT_USER.id : null;
  const pelaku_nama = CURRENT_USER ? CURRENT_USER.nama : null;
  const { data: itemBaru, error: errItem } = await supabaseClient.from('stok_item')
    .update({ stok_masuk: totalMasukBaru, diupdate_oleh_id: pelaku_id, diupdate_oleh_nama: pelaku_nama, diupdate_pada: new Date().toISOString() })
    .eq('id', i.id).select().single();
  if(!errItem && itemBaru){
    const idxItem = DATA.stokItem.findIndex(x => x.id === i.id);
    if(idxItem > -1) DATA.stokItem[idxItem] = itemBaru;
  }

  renderDetailStok();
  renderGudang();
  await catatAktivitas('gudang', `Riwayat stok masuk <b>${Number(r.jumlah||0).toLocaleString('id-ID')}</b> untuk <b>${esc(i.nama_produk)}</b> (${esc(i.sku)}) dihapus`);
  tampilkanToast('Riwayat stok masuk dihapus');
}

function unduhStokMasukDetailCSV(){
  if(!STOK_ITEM_AKTIF_ID) return;
  const i = DATA.stokItem.find(x => x.id === STOK_ITEM_AKTIF_ID);
  const data = DATA.riwayatStok.filter(r => r.item_id === STOK_ITEM_AKTIF_ID && r.tipe === 'masuk');
  unduhCSV(`stok-masuk-${i ? i.sku : 'item'}.csv`,
    ['Tanggal Masuk','Nama Vendor','No DO','No PO','Stok Baru','Stok Bekas','Stok Rusak','Total Stok','Satuan','Catatan'],
    data.map(r => [formatTanggal(r.tanggal), r.vendor_nama || '', r.no_do || '', r.no_po || '', r.stok_baru || 0, r.stok_bekas || 0, r.stok_rusak || 0, r.jumlah || 0, r.satuan || '', r.catatan || '']));
  tampilkanToast('Riwayat stok masuk diunduh');
}

/* ---------------------------------------------------------
   17d. DETAIL STOK KELUAR (per item, dibuka dari klik angka
   Stok Keluar pada tabel Stock & Gudang). Setiap baris riwayat
   di sini adalah satu pengiriman keluar, lengkap dengan No DO,
   Pelanggan, No PO, Proyek, Qty, Satuan, dan Catatan.
--------------------------------------------------------- */



function renderTabelStokKeluarDetail(){
  const tbody = document.getElementById('tbody-stok-keluar-detail');
  if(!tbody || !STOK_ITEM_AKTIF_ID) return;
  const isAdmin = CURRENT_USER && CURRENT_USER.peran === 'admin';
  const q = (document.getElementById('cari-stok-keluar-detail').value || '').toLowerCase();
  const filterStatusKeluar = document.getElementById('filter-status-keluar-stok-keluar-detail').value;

  const data = DATA.riwayatStok.filter(r => {
    if(r.item_id !== STOK_ITEM_AKTIF_ID || r.tipe !== 'keluar') return false;
    if(filterStatusKeluar !== 'semua' && (r.status_keluar || 'terjual') !== filterStatusKeluar) return false;
    if(!q) return true;
    const gabungan = [r.no_do, r.pelanggan_nama, r.no_po, r.proyek_nama, r.catatan].filter(Boolean).join(' ').toLowerCase();
    return gabungan.includes(q);
  }).sort((a,b) => (b.tanggal || '').localeCompare(a.tanggal || '') || (b.dibuat_pada || '').localeCompare(a.dibuat_pada || ''));

  if(!data.length){
    tbody.innerHTML = `<tr><td colspan="13"><div class="empty-state">
      <p>Belum ada riwayat stok keluar untuk produk ini.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(r => {
    const stokBaru = Number(r.stok_baru || 0);
    const stokBekas = Number(r.stok_bekas || 0);
    const stokRusak = Number(r.stok_rusak || 0);
    const total = Number(r.jumlah || (stokBaru + stokBekas + stokRusak));
    const statusKeluar = r.status_keluar || 'terjual';
    return `
    <tr>
      <td class="cell-muted">${formatTanggal(r.tanggal)}</td>
      <td>${esc(r.no_do) || '—'}</td>
      <td>${esc(r.pelanggan_nama) || '—'}</td>
      <td>${esc(r.no_po) || '—'}</td>
      <td>${r.proyek_nama || '—'}</td>
      <td><span class="status-keluar-badge status-keluar-badge--${statusKeluar}">${statusKeluar === 'dipinjam' ? 'Dipinjam' : 'Terjual'}</span></td>
      <td>${stokBaru ? stokBaru.toLocaleString('id-ID') : '—'}</td>
      <td>${stokBekas ? stokBekas.toLocaleString('id-ID') : '—'}</td>
      <td>${stokRusak ? stokRusak.toLocaleString('id-ID') : '—'}</td>
      <td><b>${total.toLocaleString('id-ID')}</b></td>
      <td>${esc(r.satuan) || '—'}</td>
      <td class="cell-muted">${esc(r.catatan) || '—'}</td>
      <td class="cell-actions">
        <div class="icon-btn" title="Edit" onclick="editStokKeluar('${r.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </div>
        ${bolehKelolaStok() ? `<div class="icon-btn" title="Hapus" onclick="hapusStokKeluar('${r.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>
        </div>` : ''}
      </td>
    </tr>
  `;
  }).join('');
}

/* Isi dropdown Nama Pelanggan di form Tambah/Edit Stok Keluar */
function isiDropdownPelangganStokKeluar(pelangganIdTerpilih){
  const select = document.getElementById('input-pelanggan-stok-keluar');
  if(!select) return;
  select.innerHTML = `<option value="">— Tanpa pelanggan terdaftar —</option>` +
    DATA.pelanggan.map(p => `<option value="${p.id}">${esc(p.nama)}</option>`).join('') +
    `<option value="__manual__">✏️ Ketik nama pelanggan lain...</option>`;
  select.value = pelangganIdTerpilih || '';
}

/* Isi dropdown Nama Proyek, difilter per pelanggan yang sedang dipilih (jika ada) */
function isiDropdownProyekStokKeluar(pelangganId, proyekIdTerpilih){
  const select = document.getElementById('input-proyek-stok-keluar');
  if(!select) return;
  const daftar = pelangganId ? DATA.proyek.filter(p => p.pelanggan_id === pelangganId) : DATA.proyek;
  select.innerHTML = `<option value="">— Tanpa proyek/PO —</option>` +
    daftar.map(p => `<option value="${p.id}">${esc(p.nama)} (${esc(p.kode)})</option>`).join('') +
    `<option value="__manual__">✏️ Ketik proyek lain...</option>`;
  select.value = daftar.some(p => p.id === proyekIdTerpilih) ? proyekIdTerpilih : '';
}

/* Saat Nama Pelanggan diganti: filter ulang dropdown Proyek & tampilkan/sembunyikan input manual */
function saatPelangganStokKeluarBerubah(){
  const val = document.getElementById('input-pelanggan-stok-keluar').value;
  document.getElementById('wrap-pelanggan-manual-stok-keluar').classList.toggle('hidden', val !== '__manual__');
  isiDropdownProyekStokKeluar(val && val !== '__manual__' ? val : null);
  saatProyekStokKeluarBerubah();
}

/* Saat Nama Proyek diganti: auto-isi No PO (readonly) jika proyek terdaftar dipilih */
function saatProyekStokKeluarBerubah(){
  const val = document.getElementById('input-proyek-stok-keluar').value;
  document.getElementById('wrap-proyek-manual-stok-keluar').classList.toggle('hidden', val !== '__manual__');
  const inputNoPo = document.getElementById('input-no-po-stok-keluar');
  const proyek = DATA.proyek.find(p => p.id === val);
  if(proyek){
    inputNoPo.value = proyek.kode;
    inputNoPo.readOnly = true;
  } else {
    inputNoPo.readOnly = false;
  }
}

function bukaModalTambahStokKeluar(){
  const i = DATA.stokItem.find(x => x.id === STOK_ITEM_AKTIF_ID);
  if(!i) return;
  document.getElementById('form-stok-keluar').reset();
  document.getElementById('input-id-riwayat-stok-keluar').value = '';
  document.getElementById('input-tanggal-stok-keluar').value = new Date().toISOString().slice(0,10);
  document.getElementById('input-satuan-stok-keluar').value = i.satuan || 'Pcs';
  document.getElementById('input-status-keluar-stok-keluar').value = 'terjual';
  document.getElementById('input-stok-baru-keluar').value = '';
  document.getElementById('input-stok-bekas-keluar').value = '';
  document.getElementById('input-stok-rusak-keluar').value = '';
  document.getElementById('input-no-po-stok-keluar').readOnly = false;
  document.getElementById('wrap-pelanggan-manual-stok-keluar').classList.add('hidden');
  document.getElementById('wrap-proyek-manual-stok-keluar').classList.add('hidden');
  isiDropdownPelangganStokKeluar('');
  isiDropdownProyekStokKeluar(null);
  document.getElementById('info-item-stok-keluar').innerHTML = `<b>${esc(i.nama_produk)}</b> (${esc(i.sku)}) · ${namaGudang(i.gudang_id)} — Sisa stok saat ini: <b>${sisaStok(i).toLocaleString('id-ID')} ${esc(i.satuan) || 'Pcs'}</b>`;
  document.getElementById('judul-modal-stok-keluar').textContent = 'Tambah Stok Keluar';
  document.getElementById('btn-simpan-stok-keluar').textContent = 'Simpan Stok Keluar';
  hitungTotalStokKeluarForm();
  bukaModal('modal-stok-keluar');
}

/* Menghitung & menampilkan Total Stok secara langsung di form Tambah/Edit
   Stok Keluar saat pengguna mengisi Stok Baru/Bekas/Rusak, supaya totalnya
   terlihat sebelum disimpan (Total Stok = Stok Baru + Stok Bekas + Stok Rusak). */
function hitungTotalStokKeluarForm(){
  const baru = Number(document.getElementById('input-stok-baru-keluar').value) || 0;
  const bekas = Number(document.getElementById('input-stok-bekas-keluar').value) || 0;
  const rusak = Number(document.getElementById('input-stok-rusak-keluar').value) || 0;
  document.getElementById('total-stok-keluar-form').textContent = 'Total Stok: ' + (baru + bekas + rusak).toLocaleString('id-ID');
}

function editStokKeluar(riwayatId){
  const r = DATA.riwayatStok.find(x => x.id === riwayatId);
  const i = DATA.stokItem.find(x => x.id === STOK_ITEM_AKTIF_ID);
  if(!r || !i) return;
  document.getElementById('form-stok-keluar').reset();
  document.getElementById('input-id-riwayat-stok-keluar').value = r.id;
  document.getElementById('input-tanggal-stok-keluar').value = r.tanggal || new Date().toISOString().slice(0,10);
  document.getElementById('input-no-do-stok-keluar').value = r.no_do || '';
  document.getElementById('input-status-keluar-stok-keluar').value = r.status_keluar || 'terjual';
  document.getElementById('input-stok-baru-keluar').value = r.stok_baru || '';
  document.getElementById('input-stok-bekas-keluar').value = r.stok_bekas || '';
  document.getElementById('input-stok-rusak-keluar').value = r.stok_rusak || '';
  document.getElementById('input-satuan-stok-keluar').value = r.satuan || i.satuan || 'Pcs';
  document.getElementById('input-catatan-stok-keluar').value = r.catatan || '';

  // Pelanggan: jika tertaut ke data terdaftar pakai dropdown, kalau tidak tapi ada nama -> mode manual
  const pakaiPelangganManual = !r.pelanggan_id && !!r.pelanggan_nama;
  isiDropdownPelangganStokKeluar(pakaiPelangganManual ? '__manual__' : (r.pelanggan_id || ''));
  document.getElementById('wrap-pelanggan-manual-stok-keluar').classList.toggle('hidden', !pakaiPelangganManual);
  document.getElementById('input-pelanggan-manual-stok-keluar').value = pakaiPelangganManual ? r.pelanggan_nama : '';

  // Proyek: sama polanya seperti pelanggan
  const pakaiProyekManual = !r.proyek_id && !!r.proyek_nama;
  isiDropdownProyekStokKeluar(r.pelanggan_id || null, pakaiProyekManual ? '__manual__' : (r.proyek_id || ''));
  document.getElementById('wrap-proyek-manual-stok-keluar').classList.toggle('hidden', !pakaiProyekManual);
  document.getElementById('input-proyek-manual-stok-keluar').value = pakaiProyekManual ? r.proyek_nama : '';

  document.getElementById('input-no-po-stok-keluar').value = r.no_po || '';
  document.getElementById('input-no-po-stok-keluar').readOnly = !!r.proyek_id;

  document.getElementById('info-item-stok-keluar').innerHTML = `<b>${esc(i.nama_produk)}</b> (${esc(i.sku)}) · ${namaGudang(i.gudang_id)} — Sisa stok saat ini: <b>${sisaStok(i).toLocaleString('id-ID')} ${esc(i.satuan) || 'Pcs'}</b>`;
  document.getElementById('judul-modal-stok-keluar').textContent = 'Edit Stok Keluar';
  document.getElementById('btn-simpan-stok-keluar').textContent = 'Simpan Perubahan';
  hitungTotalStokKeluarForm();
  bukaModal('modal-stok-keluar');
}

async function simpanStokKeluar(e){
  e.preventDefault();
  const i = DATA.stokItem.find(x => x.id === STOK_ITEM_AKTIF_ID);
  if(!i) return;
  const idRiwayat = document.getElementById('input-id-riwayat-stok-keluar').value;
  const tanggal = document.getElementById('input-tanggal-stok-keluar').value || new Date().toISOString().slice(0,10);
  const no_do = document.getElementById('input-no-do-stok-keluar').value.trim() || null;
  const status_keluar = document.getElementById('input-status-keluar-stok-keluar').value || 'terjual';
  const stok_baru = Math.max(0, Number(document.getElementById('input-stok-baru-keluar').value) || 0);
  const stok_bekas = Math.max(0, Number(document.getElementById('input-stok-bekas-keluar').value) || 0);
  const stok_rusak = Math.max(0, Number(document.getElementById('input-stok-rusak-keluar').value) || 0);
  const qty = stok_baru + stok_bekas + stok_rusak;
  const satuan = document.getElementById('input-satuan-stok-keluar').value.trim() || i.satuan || 'Pcs';
  const catatan = document.getElementById('input-catatan-stok-keluar').value.trim() || null;
  if(!qty || qty <= 0){
    tampilkanToast('Isi minimal salah satu dari Stok Baru, Stok Bekas, atau Stok Rusak', true);
    return;
  }

  // --- Nama Pelanggan: dropdown pelanggan terdaftar ATAU ketik manual ---
  const pelangganVal = document.getElementById('input-pelanggan-stok-keluar').value;
  let pelanggan_id = null, pelanggan_nama = null;
  if(pelangganVal === '__manual__'){
    pelanggan_nama = document.getElementById('input-pelanggan-manual-stok-keluar').value.trim() || null;
  } else if(pelangganVal){
    const p = DATA.pelanggan.find(x => x.id === pelangganVal);
    if(p){ pelanggan_id = p.id; pelanggan_nama = p.nama; }
  }

  // --- Nama Proyek: dropdown proyek terdaftar (auto isi No PO) ATAU ketik manual ---
  const proyekVal = document.getElementById('input-proyek-stok-keluar').value;
  let proyek_id = null, proyek_nama = null, no_po = document.getElementById('input-no-po-stok-keluar').value.trim() || null;
  if(proyekVal === '__manual__'){
    proyek_nama = document.getElementById('input-proyek-manual-stok-keluar').value.trim() || null;
  } else if(proyekVal){
    const p = DATA.proyek.find(x => x.id === proyekVal);
    if(p){ proyek_id = p.id; proyek_nama = p.nama; no_po = p.kode; }
  }

  // --- Validasi sisa stok: hitung ulang total stok keluar seandainya perubahan ini disimpan ---
  const entriLama = idRiwayat ? DATA.riwayatStok.find(x => x.id === idRiwayat) : null;
  const qtyLama = entriLama ? Number(entriLama.jumlah || 0) : 0;
  const totalKeluarBaru = (i.stok_keluar || 0) - qtyLama + qty;
  const sisaBaru = (i.stok_masuk || 0) - totalKeluarBaru;
  if(sisaBaru < 0){
    tampilkanToast('Qty melebihi sisa stok yang tersedia', true);
    return;
  }

  const pelaku_id = CURRENT_USER ? CURRENT_USER.id : null;
  const pelaku_nama = CURRENT_USER ? CURRENT_USER.nama : null;
  const barisRiwayat = { tanggal, no_do, pelanggan_id, pelanggan_nama, no_po, proyek_id, proyek_nama, jumlah: qty, satuan, stok_baru, stok_bekas, stok_rusak, status_keluar, catatan };

  if(idRiwayat){
    // --- mode edit ---
    const { data, error } = await supabaseClient.from('riwayat_stok').update(barisRiwayat).eq('id', idRiwayat).select().single();
    if(error){ console.error(error); tampilkanToast(pesanErrorKode(error) || 'Gagal menyimpan perubahan stok keluar. Pastikan migrasi v11 dan v23 di schema.sql sudah dijalankan.', true); return; }
    const idx = DATA.riwayatStok.findIndex(x => x.id === idRiwayat);
    if(idx > -1) DATA.riwayatStok[idx] = data;
  } else {
    // --- mode tambah ---
    const { data, error } = await supabaseClient.from('riwayat_stok')
      .insert({ item_id: i.id, tipe: 'keluar', dibuat_oleh_id: pelaku_id, dibuat_oleh_nama: pelaku_nama, ...barisRiwayat })
      .select().single();
    if(error){ console.error(error); tampilkanToast(pesanErrorKode(error) || 'Gagal menambah stok keluar. Pastikan migrasi v11 dan v23 di schema.sql sudah dijalankan.', true); return; }
    DATA.riwayatStok.unshift(data);
  }

  // --- Perbarui akumulasi Stok Keluar & Update Terakhir pada kartu stok ---
  const barisItem = { stok_keluar: totalKeluarBaru, diupdate_oleh_id: pelaku_id, diupdate_oleh_nama: pelaku_nama, diupdate_pada: new Date().toISOString() };
  const { data: itemBaru, error: errItem } = await supabaseClient.from('stok_item').update(barisItem).eq('id', i.id).select().single();
  if(errItem){ console.error(errItem); tampilkanToast('Stok keluar tersimpan, tapi gagal memperbarui akumulasi Stok Keluar pada kartu stok', true); }
  else {
    const idxItem = DATA.stokItem.findIndex(x => x.id === i.id);
    if(idxItem > -1) DATA.stokItem[idxItem] = itemBaru;
  }

  renderDetailStok();
  renderGudang();
  await catatAktivitas('gudang', `Stok keluar <b>${qty.toLocaleString('id-ID')} ${satuan}</b> ${idRiwayat ? 'diperbarui' : 'dicatat'} untuk <b>${esc(i.nama_produk)}</b> (${esc(i.sku)})${pelanggan_nama ? ' ke ' + pelanggan_nama : ''}`);
  tutupModal('modal-stok-keluar');
  tampilkanToast(idRiwayat ? 'Perubahan stok keluar disimpan' : 'Stok keluar dicatat');
  e.target.reset();
}

async function hapusStokKeluar(riwayatId){
  const r = DATA.riwayatStok.find(x => x.id === riwayatId);
  const i = DATA.stokItem.find(x => x.id === STOK_ITEM_AKTIF_ID);
  if(!r || !i) return;

  const { error } = await supabaseClient.from('riwayat_stok').delete().eq('id', riwayatId);
  if(error){ console.error(error); tampilkanToast('Gagal menghapus riwayat stok keluar', true); return; }
  DATA.riwayatStok = DATA.riwayatStok.filter(x => x.id !== riwayatId);

  // --- Kurangi akumulasi Stok Keluar pada kartu stok sesuai qty yang dihapus ---
  const totalKeluarBaru = Math.max(0, (i.stok_keluar || 0) - Number(r.jumlah || 0));
  const pelaku_id = CURRENT_USER ? CURRENT_USER.id : null;
  const pelaku_nama = CURRENT_USER ? CURRENT_USER.nama : null;
  const { data: itemBaru, error: errItem } = await supabaseClient.from('stok_item')
    .update({ stok_keluar: totalKeluarBaru, diupdate_oleh_id: pelaku_id, diupdate_oleh_nama: pelaku_nama, diupdate_pada: new Date().toISOString() })
    .eq('id', i.id).select().single();
  if(!errItem && itemBaru){
    const idxItem = DATA.stokItem.findIndex(x => x.id === i.id);
    if(idxItem > -1) DATA.stokItem[idxItem] = itemBaru;
  }

  renderDetailStok();
  renderGudang();
  await catatAktivitas('gudang', `Riwayat stok keluar <b>${Number(r.jumlah||0).toLocaleString('id-ID')}</b> untuk <b>${esc(i.nama_produk)}</b> (${esc(i.sku)}) dihapus`);
  tampilkanToast('Riwayat stok keluar dihapus');
}

/* ---- Kelola Gudang (daftar lokasi/cabang) ---- */
/* ---------------------------------------------------------
   17e. MANAJEMEN PRODUK, KATEGORI & GUDANG (dibuka dari tombol
   di menu Stock & Gudang). Tiga tab dalam satu halaman:
   - Produk   : stok_item dikelompokkan per SKU lintas gudang.
   - Kategori : data master kategori_produk (bukan teks bebas).
   - Gudang   : sama seperti "Kelola Gudang" sebelumnya.
   Ketiganya saling terhubung: mengubah Kategori/Produk/Gudang
   di sini langsung berlaku ke semua baris stok_item terkait.
--------------------------------------------------------- */
let MP_TAB_AKTIF = 'produk';

function bukaManajemenProduk(tab){
  pindahTampilan('manajemen-produk');
  pindahTabManajemenProduk(tab || 'produk');
}

function pindahTabManajemenProduk(tab){
  MP_TAB_AKTIF = tab;
  document.querySelectorAll('.mp-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.mpTab === tab));
  document.querySelectorAll('.mp-tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('mp-tab-' + tab).classList.add('active');
  renderStatManajemenProduk();
  if(tab === 'produk') renderProdukMaster();
  if(tab === 'merek') renderMerekMaster();
  if(tab === 'kategori') renderKategoriMaster();
  if(tab === 'gudang') renderListGudangKelola();
}

function renderStatManajemenProduk(){
  const wrap = document.getElementById('stat-manajemen-produk');
  if(!wrap) return;
  const skuUnik = new Set(DATA.stokItem.map(i => i.sku)).size;
  wrap.innerHTML = `
    <div class="stat-mini-card">
      <span class="stat-mini-label">Total Produk (SKU unik)</span>
      <span class="stat-mini-value">${skuUnik}</span>
    </div>
    <div class="stat-mini-card">
      <span class="stat-mini-label">Total Kategori Merek</span>
      <span class="stat-mini-value">${DATA.kategoriMerek.length}</span>
    </div>
    <div class="stat-mini-card">
      <span class="stat-mini-label">Total Kategori Produk</span>
      <span class="stat-mini-value">${DATA.kategoriProduk.length}</span>
    </div>
    <div class="stat-mini-card">
      <span class="stat-mini-label">Total Gudang</span>
      <span class="stat-mini-value">${DATA.gudang.length}</span>
    </div>`;
}

/* Kelompokkan stok_item per SKU supaya satu produk yang tersebar di
   beberapa gudang tampil sebagai satu baris ringkas — inti dari
   efisiensi menu ini (tidak perlu buka satu-satu per gudang). */
function groupProdukMaster(){
  const map = new Map();
  DATA.stokItem.forEach(i => {
    if(!map.has(i.sku)){
      map.set(i.sku, { sku: i.sku, nama_produk: i.nama_produk, kategori: i.kategori || 'Umum', merek: i.merek || 'Umum', variant: i.variant, satuan: i.satuan, gudangList: [], totalSisa: 0 });
    }
    const grup = map.get(i.sku);
    grup.gudangList.push({ gudang_id: i.gudang_id, nama: namaGudang(i.gudang_id), sisa: sisaStok(i) });
    grup.totalSisa += sisaStok(i);
  });
  return [...map.values()].sort((a,b) => a.nama_produk.localeCompare(b.nama_produk));
}

function renderProdukMaster(){
  isiDropdownMerekProdukMasterFilter();
  isiDropdownKategoriProdukMasterFilter();
  const tbody = document.getElementById('tbody-produk-master');
  if(!tbody) return;
  const isAdmin = CURRENT_USER && CURRENT_USER.peran === 'admin';
  const q = (document.getElementById('cari-produk-master').value || '').toLowerCase();
  const filterMerek = document.getElementById('filter-merek-produk-master').value;
  const filterKategori = document.getElementById('filter-kategori-produk-master').value;

  const data = groupProdukMaster().filter(p => {
    const cocokCari = p.sku.toLowerCase().includes(q) || p.nama_produk.toLowerCase().includes(q);
    const cocokMerek = filterMerek === 'semua' || p.merek === filterMerek;
    const cocokKategori = filterKategori === 'semua' || p.kategori === filterKategori;
    return cocokCari && cocokMerek && cocokKategori;
  });

  if(!data.length){
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><p>Belum ada produk yang cocok. Tambahkan lewat tombol "Tambah Produk".</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(p => `
    <tr>
      <td class="cell-muted">${esc(p.sku)}</td>
      <td class="cell-name">${esc(p.nama_produk)}</td>
      <td>${esc(p.merek)}</td>
      <td>${esc(p.kategori)}</td>
      <td>${esc(p.variant) || '—'}</td>
      <td>${esc(p.satuan) || '—'}</td>
      <td><div class="gudang-badge-list">${p.gudangList.map(g => `<span class="gudang-badge">${esc(g.nama)} · <b>${g.sisa.toLocaleString('id-ID')}</b></span>`).join('')}</div></td>
      <td><b>${p.totalSisa.toLocaleString('id-ID')}</b></td>
      <td class="cell-actions">
        <div class="icon-btn" title="Edit Produk (semua gudang)" onclick="bukaModalEditProdukMaster('${esc(p.sku)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </div>
        <div class="icon-btn" title="Tambahkan ke Gudang Lain" onclick="bukaModalTambahKeGudangLain('${esc(p.sku)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 8L12 3 3 8v9a1 1 0 001 1h4v-6h8v6h4a1 1 0 001-1V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 12v5m-2.5-2.5h5"/></svg>
        </div>
        ${bolehKelolaStok() ? `<div class="icon-btn" title="Hapus dari semua gudang" onclick="hapusProdukMaster('${esc(p.sku)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>
        </div>` : ''}
      </td>
    </tr>`).join('');
}

function isiDropdownMerekProdukMasterFilter(){
  const sel = document.getElementById('filter-merek-produk-master');
  if(!sel) return;
  const nilaiSaatIni = sel.value || 'semua';
  sel.innerHTML = '<option value="semua">Semua Merek</option>' +
    daftarNamaMerek().map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
  sel.value = nilaiSaatIni;
}

function isiDropdownKategoriProdukMasterFilter(){
  const sel = document.getElementById('filter-kategori-produk-master');
  if(!sel) return;
  const nilaiSaatIni = sel.value || 'semua';
  sel.innerHTML = '<option value="semua">Semua Kategori</option>' +
    daftarNamaKategori().map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
  sel.value = nilaiSaatIni;
}

function bukaModalEditProdukMaster(sku){
  const contoh = DATA.stokItem.find(x => x.sku === sku);
  if(!contoh) return;
  const jumlahGudang = DATA.stokItem.filter(x => x.sku === sku).length;
  isiDropdownKategoriForm('input-kategori-produk-master');
  isiDropdownMerekForm('input-merek-produk-master');
  document.getElementById('input-sku-produk-master').value = sku;
  document.getElementById('input-sku-tampil-produk-master').value = sku;
  document.getElementById('input-kategori-produk-master').value = contoh.kategori || 'Umum';
  document.getElementById('input-merek-produk-master').value = contoh.merek || 'Umum';
  document.getElementById('input-nama-produk-master').value = contoh.nama_produk || '';
  document.getElementById('input-variant-produk-master').value = contoh.variant || '';
  document.getElementById('input-satuan-produk-master').value = contoh.satuan || 'Pcs';
  document.getElementById('info-produk-master').innerHTML = `Produk ini tercatat di <b>${jumlahGudang}</b> gudang.`;
  bukaModal('modal-produk-master');
}

async function simpanProdukMaster(e){
  e.preventDefault();
  const sku = document.getElementById('input-sku-produk-master').value;
  const nama_produk = document.getElementById('input-nama-produk-master').value.trim();
  const variant = document.getElementById('input-variant-produk-master').value.trim() || null;
  const satuan = document.getElementById('input-satuan-produk-master').value.trim() || 'Pcs';
  const kategori = document.getElementById('input-kategori-produk-master').value.trim() || 'Umum';
  const kategoriObj = DATA.kategoriProduk.find(k => k.nama === kategori);
  const kategori_id = kategoriObj ? kategoriObj.id : null;
  const merek = document.getElementById('input-merek-produk-master').value.trim() || 'Umum';
  const merekObj = DATA.kategoriMerek.find(m => m.nama === merek);
  const merek_id = merekObj ? merekObj.id : null;
  if(!sku || !nama_produk) return;

  const diupdate_oleh_id = CURRENT_USER ? CURRENT_USER.id : null;
  const diupdate_oleh_nama = CURRENT_USER ? CURRENT_USER.nama : null;
  const baris = { nama_produk, variant, satuan, kategori, kategori_id, merek, merek_id, diupdate_oleh_id, diupdate_oleh_nama, diupdate_pada: new Date().toISOString() };

  // --- Update SEKALIGUS ke semua baris stok_item yang punya SKU ini, di semua gudang ---
  const { data, error } = await supabaseClient.from('stok_item').update(baris).eq('sku', sku).select();
  if(error){ console.error(error); tampilkanToast('Gagal menyimpan perubahan produk', true); return; }
  (data || []).forEach(baruItem => {
    const idx = DATA.stokItem.findIndex(x => x.id === baruItem.id);
    if(idx > -1) DATA.stokItem[idx] = baruItem;
  });

  renderGudang();
  renderProdukMaster();
  await catatAktivitas('gudang', `Data produk <b>${esc(nama_produk)}</b> (${esc(sku)}) diperbarui di ${(data || []).length} gudang`);
  tutupModal('modal-produk-master');
  tampilkanToast('Perubahan produk disimpan ke semua gudang');
}

async function hapusProdukMaster(sku){
  const baris = DATA.stokItem.filter(x => x.sku === sku);
  if(!baris.length) return;
  const { error } = await supabaseClient.from('stok_item').delete().eq('sku', sku);
  if(error){ console.error(error); tampilkanToast('Gagal menghapus produk', true); return; }
  DATA.stokItem = DATA.stokItem.filter(x => x.sku !== sku);
  renderGudang();
  renderProdukMaster();
  await catatAktivitas('gudang', `Produk <b>${esc(baris[0].nama_produk)}</b> (${esc(sku)}) dihapus dari ${baris.length} gudang`);
  tampilkanToast('Produk dihapus dari semua gudang');
}

/* "+ Gudang Lain": buka modal Tambah Item Stok yang sama, tapi data
   produk (SKU/Nama/Kategori/Merek/Variant/Satuan) sudah terisi otomatis dan
   dikunci, serta dropdown Gudang hanya menampilkan gudang yang BELUM
   punya SKU ini — jadi tinggal pilih gudang & isi Stok Awal. */
function bukaModalTambahKeGudangLain(sku){
  const contoh = DATA.stokItem.find(x => x.sku === sku);
  if(!contoh) return;
  const gudangTerpakai = DATA.stokItem.filter(x => x.sku === sku).map(x => x.gudang_id);
  if(gudangTerpakai.length >= DATA.gudang.length){
    tampilkanToast('Produk ini sudah tercatat di semua gudang yang ada', true);
    return;
  }
  document.getElementById('form-item-stok').reset();
  document.getElementById('input-id-item-stok').value = '';
  isiDropdownKategoriForm('input-kategori-item-stok');
  isiDropdownMerekForm('input-merek-item-stok');
  isiDropdownGudang(gudangTerpakai);
  document.getElementById('input-sku-item-stok').value = contoh.sku;
  document.getElementById('input-kategori-item-stok').value = contoh.kategori || 'Umum';
  document.getElementById('input-merek-item-stok').value = contoh.merek || 'Umum';
  document.getElementById('input-nama-item-stok').value = contoh.nama_produk;
  document.getElementById('input-variant-item-stok').value = contoh.variant || '';
  document.getElementById('input-satuan-item-stok').value = contoh.satuan || 'Pcs';
  document.getElementById('input-stok-minimum-item-stok').value = contoh.stok_minimum || 0;
  document.getElementById('input-status-item-stok').value = 'aktif';
  ['input-sku-item-stok','input-kategori-item-stok','input-merek-item-stok','input-nama-item-stok','input-variant-item-stok','input-satuan-item-stok'].forEach(id => document.getElementById(id).disabled = true);
  document.getElementById('wrap-stok-awal-item-stok').style.display = '';
  document.getElementById('input-stok-awal-item-stok').disabled = false;
  document.getElementById('input-stok-awal-item-stok').value = 0;
  document.getElementById('catatan-modal-item-stok').innerHTML = `Data produk dikunci supaya tetap konsisten dengan gudang lain — ganti dari tab <b>Produk</b> jika perlu. Pilih gudang tujuan & isi Stok Awal di sini.`;
  document.getElementById('judul-modal-item-stok').textContent = `Tambahkan "${esc(contoh.nama_produk)}" ke Gudang Lain`;
  document.getElementById('btn-simpan-item-stok').textContent = 'Simpan';
  bukaModal('modal-item-stok');
}

/* ---------------------------------------------------------
   17f. KATEGORI PRODUK (tab Kategori) — data master, dipakai
   sebagai sumber dropdown Kategori di form Item Stok & Produk,
   serta filter Kategori pada tabel Stock & Gudang / Produk.
--------------------------------------------------------- */
function renderKategoriMaster(){
  const tbody = document.getElementById('tbody-kategori-master');
  if(!tbody) return;
  const isAdmin = CURRENT_USER && CURRENT_USER.peran === 'admin';
  if(!DATA.kategoriProduk.length){
    tbody.innerHTML = `<tr><td colspan="3"><div class="empty-state"><p>Belum ada kategori. Tambahkan lewat tombol "Tambah Kategori".</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = DATA.kategoriProduk.map(k => {
    const jumlahProduk = DATA.stokItem.filter(i => (i.kategori || 'Umum') === k.nama).length;
    return `
    <tr>
      <td class="cell-name">${esc(k.nama)}</td>
      <td>${jumlahProduk}</td>
      <td class="cell-actions">
        <div class="icon-btn" title="Edit" onclick="editKategori('${k.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </div>
        ${isAdmin ? `<div class="icon-btn" title="Hapus" onclick="hapusKategori('${k.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>
        </div>` : ''}
      </td>
    </tr>`;
  }).join('');
}

function bukaModalTambahKategori(){
  document.getElementById('form-kategori').reset();
  document.getElementById('input-id-kategori').value = '';
  document.getElementById('judul-modal-kategori').textContent = 'Tambah Kategori';
  document.getElementById('btn-simpan-kategori').textContent = 'Simpan Kategori';
  bukaModal('modal-kategori');
}

function editKategori(id){
  const k = DATA.kategoriProduk.find(x => x.id === id);
  if(!k) return;
  document.getElementById('input-id-kategori').value = k.id;
  document.getElementById('input-nama-kategori').value = k.nama;
  document.getElementById('judul-modal-kategori').textContent = 'Edit Kategori';
  document.getElementById('btn-simpan-kategori').textContent = 'Simpan Perubahan';
  bukaModal('modal-kategori');
}

async function simpanKategori(e){
  e.preventDefault();
  const id = document.getElementById('input-id-kategori').value;
  const nama = document.getElementById('input-nama-kategori').value.trim();
  if(!nama) return;

  if(id){
    // --- mode edit: trigger di database otomatis menyinkronkan stok_item.kategori ---
    const { data, error } = await supabaseClient.from('kategori_produk').update({ nama }).eq('id', id).select().single();
    if(error){ console.error(error); tampilkanToast(pesanErrorKode(error, 'Nama kategori') || 'Gagal menyimpan perubahan kategori. Pastikan migrasi v17 di schema.sql sudah dijalankan.', true); return; }
    const namaLama = (DATA.kategoriProduk.find(x => x.id === id) || {}).nama;
    const idx = DATA.kategoriProduk.findIndex(x => x.id === id);
    if(idx > -1) DATA.kategoriProduk[idx] = data;
    // --- ikut perbarui salinan lokal stok_item.kategori supaya tabel langsung sinkron tanpa reload ---
    DATA.stokItem.forEach(i => { if(i.kategori === namaLama) i.kategori = nama; });
    renderGudang();
    renderProdukMaster();
    await catatAktivitas('gudang', `Kategori <b>${esc(namaLama)}</b> diganti nama jadi <b>${esc(nama)}</b>`);
    tampilkanToast('Perubahan kategori disimpan');
  } else {
    const { data, error } = await supabaseClient.from('kategori_produk').insert({ nama }).select().single();
    if(error){ console.error(error); tampilkanToast(pesanErrorKode(error, 'Nama kategori') || 'Gagal menambah kategori. Pastikan migrasi v17 di schema.sql sudah dijalankan.', true); return; }
    DATA.kategoriProduk.push(data);
    DATA.kategoriProduk.sort((a,b) => a.nama.localeCompare(b.nama));
    await catatAktivitas('gudang', `Kategori baru <b>${esc(nama)}</b> ditambahkan`);
    tampilkanToast('Kategori baru ditambahkan');
  }
  renderKategoriMaster();
  renderStatManajemenProduk();
  tutupModal('modal-kategori');
  e.target.reset();
  document.getElementById('input-id-kategori').value = '';
}

async function hapusKategori(id){
  const k = DATA.kategoriProduk.find(x => x.id === id);
  if(!k) return;
  if(k.nama === 'Umum'){
    tampilkanToast('Kategori "Umum" adalah kategori bawaan dan tidak bisa dihapus', true);
    return;
  }
  if(DATA.stokItem.some(i => (i.kategori || 'Umum') === k.nama)){
    tampilkanToast('Kategori ini masih dipakai oleh produk. Pindahkan produknya ke kategori lain terlebih dahulu.', true);
    return;
  }
  const { error } = await supabaseClient.from('kategori_produk').delete().eq('id', id);
  if(error){ console.error(error); tampilkanToast('Gagal menghapus kategori', true); return; }
  DATA.kategoriProduk = DATA.kategoriProduk.filter(x => x.id !== id);
  renderKategoriMaster();
  renderStatManajemenProduk();
  await catatAktivitas('gudang', `Kategori <b>${esc(k.nama)}</b> dihapus`);
  tampilkanToast('Kategori dihapus');
}

/* ---------------------------------------------------------
   17f-bis. KATEGORI MEREK (tab Kategori Merek) — data master
   untuk Merek/Brand produk, pola & struktur PERSIS SAMA dengan
   Kategori Produk di atas (tabel master terpisah kategori_merek,
   kolom stok_item.merek + merek_id, trigger sinkron nama di DB).
   Dipisah dari Kategori Produk karena keduanya menjawab pertanyaan
   berbeda saat memfilter produk: "merek apa" (mis. Samsung, Anker)
   vs "jenis produk apa" (mis. Kabel, Charger, Aksesoris) — satu
   produk hanya punya 1 merek tapi bisa dikelompokkan lintas kategori,
   jadi lebih tepat dipisah daripada digabung jadi satu daftar datar.
--------------------------------------------------------- */
function renderMerekMaster(){
  const tbody = document.getElementById('tbody-merek-master');
  if(!tbody) return;
  const isAdmin = CURRENT_USER && CURRENT_USER.peran === 'admin';
  if(!DATA.kategoriMerek.length){
    tbody.innerHTML = `<tr><td colspan="3"><div class="empty-state"><p>Belum ada merek. Tambahkan lewat tombol "Tambah Merek".</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = DATA.kategoriMerek.map(m => {
    const jumlahProduk = DATA.stokItem.filter(i => (i.merek || 'Umum') === m.nama).length;
    return `
    <tr>
      <td class="cell-name">${esc(m.nama)}</td>
      <td>${jumlahProduk}</td>
      <td class="cell-actions">
        <div class="icon-btn" title="Edit" onclick="editMerek('${m.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </div>
        ${isAdmin ? `<div class="icon-btn" title="Hapus" onclick="hapusMerek('${m.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>
        </div>` : ''}
      </td>
    </tr>`;
  }).join('');
}

function bukaModalTambahMerek(){
  document.getElementById('form-merek').reset();
  document.getElementById('input-id-merek').value = '';
  document.getElementById('judul-modal-merek').textContent = 'Tambah Merek';
  document.getElementById('btn-simpan-merek').textContent = 'Simpan Merek';
  bukaModal('modal-merek');
}

function editMerek(id){
  const m = DATA.kategoriMerek.find(x => x.id === id);
  if(!m) return;
  document.getElementById('input-id-merek').value = m.id;
  document.getElementById('input-nama-merek').value = m.nama;
  document.getElementById('judul-modal-merek').textContent = 'Edit Merek';
  document.getElementById('btn-simpan-merek').textContent = 'Simpan Perubahan';
  bukaModal('modal-merek');
}

async function simpanMerek(e){
  e.preventDefault();
  const id = document.getElementById('input-id-merek').value;
  const nama = document.getElementById('input-nama-merek').value.trim();
  if(!nama) return;

  if(id){
    // --- mode edit: trigger di database otomatis menyinkronkan stok_item.merek ---
    const { data, error } = await supabaseClient.from('kategori_merek').update({ nama }).eq('id', id).select().single();
    if(error){ console.error(error); tampilkanToast(pesanErrorKode(error, 'Nama merek') || 'Gagal menyimpan perubahan merek. Pastikan migrasi v18 di schema.sql sudah dijalankan.', true); return; }
    const namaLama = (DATA.kategoriMerek.find(x => x.id === id) || {}).nama;
    const idx = DATA.kategoriMerek.findIndex(x => x.id === id);
    if(idx > -1) DATA.kategoriMerek[idx] = data;
    // --- ikut perbarui salinan lokal stok_item.merek supaya tabel langsung sinkron tanpa reload ---
    DATA.stokItem.forEach(i => { if(i.merek === namaLama) i.merek = nama; });
    renderGudang();
    renderProdukMaster();
    await catatAktivitas('gudang', `Merek <b>${esc(namaLama)}</b> diganti nama jadi <b>${esc(nama)}</b>`);
    tampilkanToast('Perubahan merek disimpan');
  } else {
    const { data, error } = await supabaseClient.from('kategori_merek').insert({ nama }).select().single();
    if(error){ console.error(error); tampilkanToast(pesanErrorKode(error, 'Nama merek') || 'Gagal menambah merek. Pastikan migrasi v18 di schema.sql sudah dijalankan.', true); return; }
    DATA.kategoriMerek.push(data);
    DATA.kategoriMerek.sort((a,b) => a.nama.localeCompare(b.nama));
    await catatAktivitas('gudang', `Merek baru <b>${esc(nama)}</b> ditambahkan`);
    tampilkanToast('Merek baru ditambahkan');
  }
  renderMerekMaster();
  renderStatManajemenProduk();
  tutupModal('modal-merek');
  e.target.reset();
  document.getElementById('input-id-merek').value = '';
}

async function hapusMerek(id){
  const m = DATA.kategoriMerek.find(x => x.id === id);
  if(!m) return;
  if(m.nama === 'Umum'){
    tampilkanToast('Merek "Umum" adalah merek bawaan dan tidak bisa dihapus', true);
    return;
  }
  if(DATA.stokItem.some(i => (i.merek || 'Umum') === m.nama)){
    tampilkanToast('Merek ini masih dipakai oleh produk. Pindahkan produknya ke merek lain terlebih dahulu.', true);
    return;
  }
  const { error } = await supabaseClient.from('kategori_merek').delete().eq('id', id);
  if(error){ console.error(error); tampilkanToast('Gagal menghapus merek', true); return; }
  DATA.kategoriMerek = DATA.kategoriMerek.filter(x => x.id !== id);
  renderMerekMaster();
  renderStatManajemenProduk();
  await catatAktivitas('gudang', `Merek <b>${esc(m.nama)}</b> dihapus`);
  tampilkanToast('Merek dihapus');
}

/* ---------------------------------------------------------
   17g. GUDANG (tab Gudang) — lokasi/cabang penyimpanan fisik.
   Sebelumnya lewat modal "Kelola Gudang" tersendiri; sekarang
   jadi salah satu tab di halaman Manajemen Produk & Kategori.
--------------------------------------------------------- */
function renderListGudangKelola(){
  const wrap = document.getElementById('list-gudang-kelola');
  if(!wrap) return;
  const isAdmin = CURRENT_USER && CURRENT_USER.peran === 'admin';
  if(!DATA.gudang.length){
    wrap.innerHTML = `<div class="empty-state"><p>Belum ada gudang. Tambahkan lewat form di bawah.</p></div>`;
    return;
  }
  wrap.innerHTML = DATA.gudang.map(g => {
    const jumlahItem = DATA.stokItem.filter(i => i.gudang_id === g.id).length;
    return `
    <div class="gudang-row">
      <div>
        <div class="gudang-row-name">${esc(g.nama)}</div>
        <div class="gudang-row-loc">${esc(g.lokasi) || 'Lokasi belum diisi'} · ${jumlahItem} item stok</div>
      </div>
      ${isAdmin ? `<div class="icon-btn" title="Hapus Gudang" onclick="hapusGudang('${g.id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>
      </div>` : ''}
    </div>`;
  }).join('');
}
async function tambahGudang(e){
  e.preventDefault();
  const nama = document.getElementById('input-nama-gudang').value.trim();
  const lokasi = document.getElementById('input-lokasi-gudang').value.trim() || null;
  if(!nama) return;
  const { data, error } = await supabaseClient.from('gudang').insert({ nama, lokasi }).select().single();
  if(error){ console.error(error); tampilkanToast(pesanErrorKode(error, 'Nama gudang') || 'Gagal menambah gudang', true); return; }
  DATA.gudang.push(data);
  renderListGudangKelola();
  renderStatManajemenProduk();
  isiDropdownGudang();
  renderGudang();
  await catatAktivitas('gudang', `Gudang baru <b>${nama}</b> ditambahkan`);
  tampilkanToast('Gudang baru ditambahkan');
  e.target.reset();
}
async function hapusGudang(id){
  const g = DATA.gudang.find(x => x.id === id);
  if(DATA.stokItem.some(i => i.gudang_id === id)){
    tampilkanToast('Gudang ini masih memiliki item stok. Hapus atau pindahkan item terlebih dahulu.', true);
    return;
  }
  const { error } = await supabaseClient.from('gudang').delete().eq('id', id);
  if(error){ console.error(error); tampilkanToast('Gagal menghapus gudang', true); return; }
  DATA.gudang = DATA.gudang.filter(x => x.id !== id);
  renderListGudangKelola();
  renderStatManajemenProduk();
  isiDropdownGudang();
  renderGudang();
  if(g) await catatAktivitas('gudang', `Gudang <b>${esc(g.nama)}</b> dihapus`);
  tampilkanToast('Gudang dihapus');
}


function unduhStokCSV(){
  unduhCSV('stock-gudang-dealstack.csv',
    ['SKU','Nama Produk','Variant','Merek','Kategori','Gudang','Satuan','Stok Masuk','Stok Keluar','Sisa Stok','Update Terakhir','Diupdate Oleh','Status'],
    DATA.stokItem.map(i => [i.sku, i.nama_produk, i.variant || '', i.merek || 'Umum', i.kategori || 'Umum', namaGudang(i.gudang_id), i.satuan || 'Pcs', i.stok_masuk || 0, i.stok_keluar || 0, sisaStok(i), i.diupdate_pada || '', i.diupdate_oleh_nama || '', labelStatusStok(hitungStatusStok(i))]));
  tampilkanToast('Data stok diunduh');
}

function unduhStokKeluarDetailCSV(){
  if(!STOK_ITEM_AKTIF_ID) return;
  const i = DATA.stokItem.find(x => x.id === STOK_ITEM_AKTIF_ID);
  const data = DATA.riwayatStok.filter(r => r.item_id === STOK_ITEM_AKTIF_ID && r.tipe === 'keluar');
  unduhCSV(`stok-keluar-${i ? i.sku : 'item'}.csv`,
    ['Tanggal Keluar','No DO','Nama Pelanggan','No PO','Nama Proyek','Status','Stok Baru','Stok Bekas','Stok Rusak','Total Qty','Satuan','Catatan'],
    data.map(r => [formatTanggal(r.tanggal), r.no_do || '', r.pelanggan_nama || '', r.no_po || '', r.proyek_nama || '', (r.status_keluar === 'dipinjam' ? 'Dipinjam' : 'Terjual'), r.stok_baru || 0, r.stok_bekas || 0, r.stok_rusak || 0, r.jumlah || 0, r.satuan || '', r.catatan || '']));
  tampilkanToast('Riwayat stok keluar diunduh');
}

/* ---------------------------------------------------------
   18. PENGAWASAN TIM (khusus Admin)
--------------------------------------------------------- */
function renderPengawasanTim(){
  const wrap = document.getElementById('team-grid');
  if(!wrap) return;
  const anggota = profilAktif();
  if(!anggota.length){
    wrap.innerHTML = `<div class="empty-state"><p>Belum ada anggota tim terdaftar. Minta anggota mendaftar lewat layar Masuk/Daftar.</p></div>`;
    return;
  }
  wrap.innerHTML = anggota.map(p => {
    const tugasnya = DATA.tugas.filter(t => t.ditugaskan_ke === p.id);
    const total = tugasnya.length;
    const selesai = tugasnya.filter(t => statusKerjaTugas(t) === 'selesai').length;
    const dikerjakan = tugasnya.filter(t => statusKerjaTugas(t) === 'dikerjakan').length;
    const review = tugasnya.filter(t => statusKerjaTugas(t) === 'review').length;
    const overdue = tugasnya.filter(t => {
      if(statusKerjaTugas(t) === 'selesai') return false;
      const sisa = t.tenggat ? hariMenujuTenggat(tenggatKeTanggal(t.tenggat)?.toISOString().slice(0,10)) : null;
      return sisa !== null && sisa < 0;
    }).length;
    const persen = total ? Math.round((selesai/total)*100) : 0;
    return `
      <div class="team-card">
        <div class="team-card-head">
          ${markupAvatar(p)}
          <div><div class="team-card-name">${esc(p.nama)}</div><div class="team-card-role">${labelPeran(p.peran)}</div></div>
        </div>
        <div class="team-stat-row"><span>Total Tugas</span><b>${total}</b></div>
        <div class="team-stat-row"><span>Sedang Dikerjakan</span><b>${dikerjakan}</b></div>
        <div class="team-stat-row"><span>Review</span><b>${review}</b></div>
        <div class="team-stat-row"><span>Selesai</span><b>${selesai}</b></div>
        <div class="team-stat-row overdue"><span>Terlambat</span><b>${overdue}</b></div>
        <div class="team-progress"><div class="team-progress-fill" style="width:${persen}%"></div></div>
        <div class="cell-muted">${persen}% tugas selesai</div>
      </div>`;
  }).join('');
}

/* ---------------------------------------------------------
   19. KELOLA PENGGUNA (khusus Admin)
--------------------------------------------------------- */
/* SEJAK v24: menu Kelola Pengguna punya DUA tabel —
   1) "Menunggu Persetujuan" (id tbody-pengguna-menunggu) — akun baru
      mendaftar (status_akun='menunggu'), Admin memilih peran lalu
      menekan Setujui/Tolak. Tabel & badge-nya disembunyikan total kalau
      tidak ada yang menunggu, supaya menu ini tidak terasa ramai/riuh
      saat memang tidak ada pendaftar baru.
   2) "Semua Pengguna" (id tbody-pengguna) — akun yang sudah 'aktif' atau
      pernah 'ditolak', lengkap dengan kolom Status & aksi "Hapus
      Permanen" khusus akun yang ditolak (lihat hapusPenggunaDitolak). */
function renderPenggunaAdmin(){
  const tbody = document.getElementById('tbody-pengguna');
  if(!tbody) return;

  const menunggu = DATA.profil.filter(p => (p.status_akun || 'aktif') === 'menunggu');
  const lainnya = DATA.profil.filter(p => (p.status_akun || 'aktif') !== 'menunggu');

  // ---- 1) Tabel & badge "Menunggu Persetujuan" ----
  const headMenunggu = document.getElementById('head-pengguna-menunggu');
  const cardMenunggu = document.getElementById('card-pengguna-menunggu');
  const tbodyMenunggu = document.getElementById('tbody-pengguna-menunggu');
  const badgeInline = document.getElementById('badge-pengguna-inline');
  const badgeNav = document.getElementById('badge-pengguna');
  if(headMenunggu && cardMenunggu && tbodyMenunggu){
    if(menunggu.length){
      headMenunggu.style.display = '';
      cardMenunggu.style.display = '';
      if(badgeInline){ badgeInline.textContent = menunggu.length; badgeInline.style.display = ''; }
      tbodyMenunggu.innerHTML = menunggu.map(p => `
        <tr>
          <td class="assignee-cell cell-name">${markupAvatar(p)}${esc(p.nama)}</td>
          <td class="cell-muted">${esc(p.email)}</td>
          <td class="cell-muted">${waktuRelatif(p.dibuat_pada)}</td>
          <td>
            <select class="filter-select" id="peran-menunggu-${p.id}" title="Peran yang akan diberikan begitu disetujui">
              <option value="anggota" selected>Anggota Tim</option>
              <option value="marketing">Marketing</option>
              <option value="purchasing">Purchasing</option>
              <option value="admin">Admin</option>
            </select>
          </td>
          <td class="cell-actions">
            <button type="button" class="btn btn-primary btn-sm" onclick="setujuiPengguna('${p.id}')">Setujui</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="tolakPengguna('${p.id}')">Tolak</button>
          </td>
        </tr>`).join('');
    } else {
      headMenunggu.style.display = 'none';
      cardMenunggu.style.display = 'none';
      if(badgeInline) badgeInline.style.display = 'none';
    }
  }
  // Badge di sidebar (nav "Kelola Pengguna") — sama seperti pola badge-pesan/badge-gudang.
  if(badgeNav){
    if(menunggu.length){ badgeNav.textContent = menunggu.length; badgeNav.style.display = ''; }
    else badgeNav.style.display = 'none';
  }

  // ---- 2) Tabel "Semua Pengguna" (aktif & ditolak) ----
  if(!lainnya.length){
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><p>Belum ada pengguna yang disetujui.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = lainnya.map(p => {
    const status = p.status_akun || 'aktif';
    const bolehUbahPeran = status === 'aktif' && p.id !== CURRENT_USER.id;
    return `
    <tr>
      <td class="assignee-cell cell-name">${markupAvatar(p)}${esc(p.nama)}</td>
      <td class="cell-muted">${esc(p.email)}</td>
      <td>
        <select class="filter-select" onchange="ubahPeranPengguna('${p.id}', this.value)" ${bolehUbahPeran ? '' : 'disabled'} title="${p.id === CURRENT_USER.id ? 'Tidak bisa mengubah peran sendiri' : (status !== 'aktif' ? 'Hanya akun aktif yang perannya bisa diubah' : '')}">
          <option value="anggota" ${p.peran==='anggota'?'selected':''}>Anggota Tim</option>
          <option value="marketing" ${p.peran==='marketing'?'selected':''}>Marketing</option>
          <option value="purchasing" ${p.peran==='purchasing'?'selected':''}>Purchasing</option>
          <option value="admin" ${p.peran==='admin'?'selected':''}>Admin</option>
        </select>
      </td>
      <td><span class="badge badge-${kelasBadgeStatusAkun(status)}"><span class="dot"></span>${labelStatusAkun(status)}</span></td>
      <td class="cell-muted">${waktuRelatif(p.dibuat_pada)}</td>
      <td class="cell-actions">
        ${status === 'ditolak' ? `<div class="icon-btn" title="Hapus Permanen" onclick="hapusPenggunaDitolak('${p.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>
        </div>` : ''}
      </td>
    </tr>`;
  }).join('');
}

async function ubahPeranPengguna(id, peranBaru){
  const p = DATA.profil.find(x => x.id === id);
  if(!p) return;
  const { error } = await supabaseClient.from('profil').update({ peran: peranBaru }).eq('id', id);
  if(error){ console.error(error); tampilkanToast('Gagal mengubah peran. Sudahkah migrasi v5 dijalankan?', true); renderPenggunaAdmin(); return; }
  p.peran = peranBaru;
  renderPenggunaAdmin();
  renderPengawasanTim();
  await catatAktivitas('pengguna', `Peran <b>${esc(p.nama)}</b> diubah menjadi ${labelPeran(peranBaru)}`);
  tampilkanToast('Peran pengguna diperbarui');
}

/* Admin menyetujui pendaftar baru: status_akun -> 'aktif' SEKALIGUS
   menetapkan peran yang dipilih Admin di dropdown baris tsb (default
   "Anggota Tim" kalau tidak diubah). Begitu baris ini ter-update,
   channel realtime langgananStatusAkunSendiri() milik pengguna yang
   bersangkutan otomatis memindahkannya dari layar "Menunggu
   Persetujuan" langsung masuk ke aplikasi — tanpa perlu memuat ulang. */
async function setujuiPengguna(id){
  const p = DATA.profil.find(x => x.id === id);
  if(!p) return;
  const selectPeran = document.getElementById('peran-menunggu-' + id);
  const peran = selectPeran ? selectPeran.value : 'anggota';
  const { error } = await supabaseClient.from('profil').update({ status_akun: 'aktif', peran }).eq('id', id);
  if(error){ console.error(error); tampilkanToast('Gagal menyetujui pengguna. Sudahkah migrasi v24 dijalankan?', true); return; }
  p.status_akun = 'aktif';
  p.peran = peran;
  renderPenggunaAdmin();
  renderPengawasanTim();
  renderDashTeamRow();
  await catatAktivitas('pengguna', `Pendaftaran <b>${esc(p.nama)}</b> disetujui sebagai ${labelPeran(peran)}`);
  tampilkanToast(`${p.nama} disetujui & bisa mulai mengakses aplikasi`);
}

/* Admin menolak pendaftar baru: status_akun -> 'ditolak'. Akun tetap ada
   di database (supaya tercatat & bisa dihapus permanen lewat
   hapusPenggunaDitolak di bawah jika perlu), tapi tidak bisa mengakses
   data apa pun (diperkuat lewat RLS peran_aktif_saya() di schema.sql). */
async function tolakPengguna(id){
  const p = DATA.profil.find(x => x.id === id);
  if(!p) return;
  if(!confirm(`Tolak pendaftaran "${p.nama}" (${p.email})? Akun ini tidak akan bisa mengakses Dealstack.`)) return;
  const { error } = await supabaseClient.from('profil').update({ status_akun: 'ditolak' }).eq('id', id);
  if(error){ console.error(error); tampilkanToast('Gagal menolak pengguna. Sudahkah migrasi v24 dijalankan?', true); return; }
  p.status_akun = 'ditolak';
  renderPenggunaAdmin();
  await catatAktivitas('pengguna', `Pendaftaran <b>${esc(p.nama)}</b> ditolak`);
  tampilkanToast('Pendaftaran ditolak', true);
}

/* Admin menghapus PERMANEN akun berstatus 'ditolak' lewat RPC
   hapus_pengguna_ditolak (lihat migrasi v24 di schema.sql) — supaya
   orang yang sama bisa mendaftar ulang dengan email tsb jika memang
   penolakannya keliru/sudah tidak berlaku. */
async function hapusPenggunaDitolak(id){
  const p = DATA.profil.find(x => x.id === id);
  if(!p) return;
  if(!confirm(`Hapus PERMANEN akun "${p.nama}" (${p.email})? Tindakan ini tidak bisa dibatalkan.`)) return;
  const { error } = await supabaseClient.rpc('hapus_pengguna_ditolak', { target_id: id });
  if(error){ console.error(error); tampilkanToast('Gagal menghapus pengguna. Sudahkah migrasi v24 dijalankan?', true); return; }
  DATA.profil = DATA.profil.filter(x => x.id !== id);
  renderPenggunaAdmin();
  await catatAktivitas('pengguna', `Akun ditolak <b>${esc(p.nama)}</b> dihapus permanen`);
  tampilkanToast('Pengguna dihapus permanen');
}

/* ---------------------------------------------------------
   19b. PENGATURAN: PROFIL SAYA, KATA SANDI & PROFIL PERUSAHAAN
--------------------------------------------------------- */
let _fileAvatarTerpilih = null;
let _fileLogoTerpilih = null;

/* Tampilkan pratinjau gambar begitu file dipilih; simpan file-nya untuk diunggah saat "Simpan" */
function pratinjauFoto(inputEl, idPreview){
  const file = inputEl.files && inputEl.files[0];
  if(!file) return;
  if(file.size > 2 * 1024 * 1024){
    tampilkanToast('Ukuran berkas maksimal 2MB', true);
    inputEl.value = '';
    return;
  }
  if(idPreview === 'avatar-preview') _fileAvatarTerpilih = file; else _fileLogoTerpilih = file;
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById(idPreview).innerHTML = `<img src="${reader.result}" alt="">`;
  };
  reader.readAsDataURL(file);
}

/* Unggah berkas ke Supabase Storage lalu kembalikan URL publiknya */
async function unggahKeStorage(bucket, path, file){
  const { error } = await supabaseClient.storage.from(bucket).upload(path, file, { upsert: true, cacheControl: '3600' });
  if(error) throw error;
  const { data } = supabaseClient.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

function renderPengaturanAkun(){
  if(!CURRENT_USER) return;
  document.getElementById('profil-nama').value = CURRENT_USER.nama || '';
  document.getElementById('profil-jabatan').value = CURRENT_USER.jabatan || '';
  document.getElementById('profil-telepon').value = CURRENT_USER.telepon || '';
  document.getElementById('profil-email').textContent = CURRENT_USER.email || '—';
  const pill = document.getElementById('profil-peran-pill');
  pill.textContent = labelPeran(CURRENT_USER.peran);
  const preview = document.getElementById('avatar-preview');
  preview.innerHTML = CURRENT_USER.avatar_url
    ? `<img src="${esc(CURRENT_USER.avatar_url)}" alt="">`
    : (CURRENT_USER.nama || '?').charAt(0).toUpperCase();
  _fileAvatarTerpilih = null;

  if(CURRENT_USER.peran === 'admin') renderPengaturanPerusahaan();
}

function renderPengaturanPerusahaan(){
  const inputNama = document.getElementById('perusahaan-nama');
  if(!inputNama) return;
  inputNama.value = (DATA.perusahaan && DATA.perusahaan.nama_perusahaan) || 'Dealstack';
  const preview = document.getElementById('logo-preview');
  preview.innerHTML = (DATA.perusahaan && DATA.perusahaan.logo_url)
    ? `<img src="${DATA.perusahaan.logo_url}" alt="">`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="M12 3v7M12 14v7M5 12h4M15 12h4"/></svg>`;
  _fileLogoTerpilih = null;
}

async function simpanProfilSaya(e){
  e.preventDefault();
  const nama = document.getElementById('profil-nama').value.trim();
  const jabatan = document.getElementById('profil-jabatan').value.trim() || null;
  const telepon = document.getElementById('profil-telepon').value.trim() || null;
  if(!nama){ tampilkanToast('Nama tidak boleh kosong', true); return; }

  const perubahan = { nama, jabatan, telepon };

  try{
    if(_fileAvatarTerpilih){
      const ekstensi = (_fileAvatarTerpilih.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${CURRENT_USER.id}/avatar-${Date.now()}.${ekstensi}`;
      perubahan.avatar_url = await unggahKeStorage('avatars', path, _fileAvatarTerpilih);
    }
  }catch(err){
    console.error(err);
    tampilkanToast('Gagal mengunggah foto. Sudahkah migrasi v6 & bucket "avatars" dibuat?', true);
    return;
  }

  const { error } = await supabaseClient.from('profil').update(perubahan).eq('id', CURRENT_USER.id);
  if(error){ console.error(error); tampilkanToast('Gagal menyimpan profil. Sudahkah migrasi v6 dijalankan?', true); return; }

  Object.assign(CURRENT_USER, perubahan);
  const idxProfil = DATA.profil.findIndex(p => p.id === CURRENT_USER.id);
  if(idxProfil > -1) Object.assign(DATA.profil[idxProfil], perubahan);
  _fileAvatarTerpilih = null;

  terapkanPeran();
  renderTugas();
  renderDashTeamRow();
  if(CURRENT_USER.peran === 'admin'){ renderPengawasanTim(); renderPenggunaAdmin(); }
  tampilkanToast('Profil berhasil disimpan');
}

async function simpanUbahSandi(e){
  e.preventDefault();
  const baru = document.getElementById('sandi-baru').value;
  const ulang = document.getElementById('sandi-ulang').value;
  if(baru.length < 6){ tampilkanToast('Kata sandi minimal 6 karakter', true); return; }
  if(baru !== ulang){ tampilkanToast('Kata sandi baru tidak cocok', true); return; }

  const { error } = await supabaseClient.auth.updateUser({ password: baru });
  if(error){ console.error(error); tampilkanToast('Gagal mengubah kata sandi: ' + error.message, true); return; }

  e.target.reset();
  tampilkanToast('Kata sandi berhasil diperbarui');
}

async function simpanPerusahaan(e){
  e.preventDefault();
  if(!CURRENT_USER || CURRENT_USER.peran !== 'admin') return;
  const nama_perusahaan = document.getElementById('perusahaan-nama').value.trim();
  if(!nama_perusahaan){ tampilkanToast('Nama perusahaan tidak boleh kosong', true); return; }

  const perubahan = { nama_perusahaan, diperbarui_oleh: CURRENT_USER.id, diperbarui_pada: new Date().toISOString() };

  try{
    if(_fileLogoTerpilih){
      const ekstensi = (_fileLogoTerpilih.name.split('.').pop() || 'png').toLowerCase();
      const path = `logo-${Date.now()}.${ekstensi}`;
      perubahan.logo_url = await unggahKeStorage('logo-perusahaan', path, _fileLogoTerpilih);
    }
  }catch(err){
    console.error(err);
    tampilkanToast('Gagal mengunggah logo. Sudahkah migrasi v6 & bucket "logo-perusahaan" dibuat?', true);
    return;
  }

  const { error } = await supabaseClient.from('pengaturan_perusahaan').upsert({ id: 1, ...perubahan }).eq('id', 1);
  if(error){ console.error(error); tampilkanToast('Gagal menyimpan profil perusahaan. Sudahkah migrasi v6 dijalankan?', true); return; }

  DATA.perusahaan = Object.assign({}, DATA.perusahaan, perubahan);
  _fileLogoTerpilih = null;
  terapkanBrandingPerusahaan();
  await catatAktivitas('pengguna', `Profil perusahaan diperbarui oleh <b>${esc(CURRENT_USER.nama)}</b>`);
  tampilkanToast('Profil perusahaan berhasil disimpan');
}

/* ---------------------------------------------------------
   20. NOTIFIKASI DESKTOP (Web Notification API)
--------------------------------------------------------- */
function mintaIzinNotifikasi(){
  if(!('Notification' in window)){
    tampilkanToast('Browser ini tidak mendukung notifikasi desktop', true);
    return;
  }
  if(Notification.permission === 'granted'){
    tampilkanToast('Notifikasi desktop sudah aktif');
    return;
  }
  if(Notification.permission === 'denied'){
    tampilkanToast('Notifikasi diblokir di pengaturan browser Anda', true);
    return;
  }
  Notification.requestPermission().then(izin => {
    tampilkanToast(izin === 'granted' ? 'Notifikasi desktop diaktifkan' : 'Izin notifikasi ditolak', izin !== 'granted');
  });
}
function kirimNotifikasiBrowser(judul, isi){
  if(!PENGATURAN.notifAktif) return;
  if('Notification' in window && Notification.permission === 'granted'){
    try{ new Notification(judul, { body: isi }); }catch(e){ console.warn('Gagal menampilkan notifikasi', e); }
  }
}

/* ---------------------------------------------------------
   21. REALTIME — LIVE UPDATE ANTAR PENGGUNA (Supabase Realtime)
--------------------------------------------------------- */
function upsertKeArray(arr, item){
  const idx = arr.findIndex(x => x.id === item.id);
  if(idx === -1) arr.unshift(item); else arr[idx] = item;
}
function initRealtime(){
  if(typeof supabaseClient.channel !== 'function') return; // versi supabase-js lama tanpa Realtime v2

  // Khusus Admin: pantau tabel profil supaya begitu ada yang mendaftar
  // (status_akun='menunggu'), Admin langsung diberi tahu (toast +
  // notifikasi browser) dan tabel "Menunggu Persetujuan" di menu Kelola
  // Pengguna otomatis terisi TANPA perlu memuat ulang halaman. Channel
  // ini juga menjaga tabel tsb tetap sinkron kalau Admin lain (di
  // tab/perangkat lain) yang memproses Setujui/Tolak/Hapus duluan.
  if(CURRENT_USER && CURRENT_USER.peran === 'admin'){
    supabaseClient.channel('dealstack-profil-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profil' }, (payload) => {
        if(payload.eventType === 'DELETE'){
          DATA.profil = DATA.profil.filter(p => p.id !== payload.old.id);
        } else {
          const pendaftarBaru = payload.eventType === 'INSERT' && payload.new.status_akun === 'menunggu';
          if(pendaftarBaru){
            kirimNotifikasiBrowser('Pendaftar baru menunggu persetujuan', `${payload.new.nama} (${payload.new.email})`);
            tampilkanToast(`Pendaftar baru: ${payload.new.nama} — menunggu persetujuan Anda`);
          }
          upsertKeArray(DATA.profil, payload.new);
        }
        renderPenggunaAdmin();
        renderPengawasanTim();
        renderDashTeamRow();
      })
      .subscribe();
  }

  supabaseClient.channel('dealstack-tugas')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tugas' }, (payload) => {
      if(payload.eventType === 'DELETE'){
        DATA.tugas = DATA.tugas.filter(t => t.id !== payload.old.id);
      } else {
        const barisSebelumnya = DATA.tugas.find(t => t.id === payload.new.id);
        const inilahPenugasanBaru = payload.eventType === 'INSERT' && payload.new.ditugaskan_ke === (CURRENT_USER && CURRENT_USER.id) ||
          (payload.eventType === 'UPDATE' && barisSebelumnya && barisSebelumnya.ditugaskan_ke !== payload.new.ditugaskan_ke && payload.new.ditugaskan_ke === (CURRENT_USER && CURRENT_USER.id));
        if(inilahPenugasanBaru){
          kirimNotifikasiBrowser('Tugas baru untuk Anda', payload.new.judul);
        }
        upsertKeArray(DATA.tugas, payload.new);
      }
      renderTugas();
      renderDashTeamRow();
      renderNotifikasi();
      if(CURRENT_USER && CURRENT_USER.peran === 'admin') renderPengawasanTim();
    })
    .subscribe();

  supabaseClient.channel('dealstack-aktivitas')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'aktivitas' }, (payload) => {
      if(!DATA.aktivitas.some(a => a.id === payload.new.id)) DATA.aktivitas.unshift(payload.new);
      renderAktivitas();
    })
    .subscribe();

  supabaseClient.channel('dealstack-catatan')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'catatan_tim' }, (payload) => {
      if(payload.eventType === 'DELETE'){
        DATA.catatan = DATA.catatan.filter(c => c.id !== payload.old.id);
      } else {
        const sudahAda = DATA.catatan.some(c => c.id === payload.new.id);
        if(!sudahAda && CURRENT_USER && payload.new.dibuat_oleh !== CURRENT_USER.nama){
          kirimNotifikasiBrowser('Catatan tim baru', payload.new.dibuat_oleh + ': ' + payload.new.isi);
        }
        upsertKeArray(DATA.catatan, payload.new);
      }
      renderPesan();
    })
    .subscribe();

  supabaseClient.channel('dealstack-perusahaan')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pengaturan_perusahaan' }, (payload) => {
      DATA.perusahaan = payload.new;
      terapkanBrandingPerusahaan();
    })
    .subscribe();

  // BUGFIX (sinkronisasi dashboard): tabel 'proyek' dan 'pelanggan' sebelumnya
  // TIDAK punya channel Realtime sama sekali (berbeda dari tugas/stok_item/
  // riwayat_stok yang sudah ada di bawah). Akibatnya, jika data proyek atau
  // pelanggan berubah/dihapus dari luar tab ini — tab lain, pengguna lain,
  // atau langsung lewat Table Editor Supabase saat pengujian — DATA di
  // memori tab yang sedang terbuka tidak pernah diberi tahu, sehingga kartu
  // KPI, donut, dan tabel di halaman Ringkasan/Dashboard tetap menampilkan
  // angka lama sampai halaman di-refresh manual. Dua channel di bawah ini
  // menutup celah tersebut.
  supabaseClient.channel('dealstack-proyek')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'proyek' }, (payload) => {
      if(payload.eventType === 'DELETE'){
        DATA.proyek = DATA.proyek.filter(p => p.id !== payload.old.id);
      } else {
        upsertKeArray(DATA.proyek, payload.new);
      }
      segarkanDetailPelangganJikaAktif();
      renderFunnel();
      renderPelanggan();
      renderRingkasan();
      if(document.getElementById('view-laporan') && document.getElementById('view-laporan').classList.contains('active')) renderLaporan();
    })
    .subscribe();

  supabaseClient.channel('dealstack-pelanggan')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pelanggan' }, (payload) => {
      if(payload.eventType === 'DELETE'){
        DATA.pelanggan = DATA.pelanggan.filter(p => p.id !== payload.old.id);
      } else {
        upsertKeArray(DATA.pelanggan, payload.new);
      }
      renderPelanggan();
      isiDropdownPelangganProyek();
      segarkanDetailPelangganJikaAktif();
      renderRingkasan();
    })
    .subscribe();

  supabaseClient.channel('dealstack-stok-item')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stok_item' }, (payload) => {
      if(payload.eventType === 'DELETE'){
        DATA.stokItem = DATA.stokItem.filter(i => i.id !== payload.old.id);
      } else {
        upsertKeArray(DATA.stokItem, payload.new);
        if(hitungStatusStok(payload.new) === 'habis'){
          kirimNotifikasiBrowser('Stok habis', `${payload.new.nama_produk} (${payload.new.sku}) di ${namaGudang(payload.new.gudang_id)}`);
        }
      }
      renderGudang();
      renderRingkasanStokGudang(); // BUGFIX: dulu kartu Peringatan Stok Gudang di halaman Ringkasan tidak ikut ter-refresh saat ada perubahan stok realtime dari perangkat lain
      renderNotifikasi();
    })
    .subscribe();

  supabaseClient.channel('dealstack-riwayat-stok')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'riwayat_stok' }, (payload) => {
      if(payload.eventType === 'DELETE'){
        DATA.riwayatStok = DATA.riwayatStok.filter(r => r.id !== payload.old.id);
      } else {
        upsertKeArray(DATA.riwayatStok, payload.new);
      }
      if(STOK_ITEM_AKTIF_ID){
        renderTabelStokKeluarDetail();
        renderTabelStokMasukDetail();
      }
    })
    .subscribe();

  // Sinkron real-time untuk tab Kategori (Manajemen Produk & Kategori) — supaya
  // penggantian nama/penambahan/penghapusan kategori oleh pengguna lain langsung
  // terlihat tanpa perlu reload, konsisten dengan channel stok_item di atas.
  supabaseClient.channel('dealstack-kategori-produk')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kategori_produk' }, (payload) => {
      if(payload.eventType === 'DELETE'){
        DATA.kategoriProduk = DATA.kategoriProduk.filter(k => k.id !== payload.old.id);
      } else {
        upsertKeArray(DATA.kategoriProduk, payload.new);
        DATA.kategoriProduk.sort((a,b) => a.nama.localeCompare(b.nama));
      }
      renderKategoriMaster();
      renderProdukMaster();
      renderStatManajemenProduk();
    })
    .subscribe();

  // Sinkron real-time untuk tab Kategori Merek (Manajemen Produk & Kategori) —
  // pola persis sama dengan channel kategori_produk di atas.
  supabaseClient.channel('dealstack-kategori-merek')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kategori_merek' }, (payload) => {
      if(payload.eventType === 'DELETE'){
        DATA.kategoriMerek = DATA.kategoriMerek.filter(m => m.id !== payload.old.id);
      } else {
        upsertKeArray(DATA.kategoriMerek, payload.new);
        DATA.kategoriMerek.sort((a,b) => a.nama.localeCompare(b.nama));
      }
      renderMerekMaster();
      renderProdukMaster();
      renderStatManajemenProduk();
    })
    .subscribe();
}

/* ---------------------------------------------------------
   9. MODAL HELPERS
--------------------------------------------------------- */
function bukaModal(id){ document.getElementById(id).classList.remove('hidden'); }
function tutupModal(id){ document.getElementById(id).classList.add('hidden'); }

/* ---------------------------------------------------------
   RESET SEMUA DATA (khusus Admin) — menu Pengaturan
   Alur: ketik frasa konfirmasi -> verifikasi kata sandi lewat
   re-login diam-diam (signInWithPassword) -> panggil fungsi
   database reset_semua_data() (RPC, security definer, dengan
   pengecekan peran admin di sisi database — lihat migrasi v21
   di schema.sql) -> muat ulang aplikasi dari awal.
--------------------------------------------------------- */
function bukaModalResetData(){
  tutupSemuaDropdown();
  document.getElementById('form-reset-data').reset();
  const msg = document.getElementById('reset-data-msg');
  msg.style.display = 'none';
  msg.textContent = '';
  const tombol = document.getElementById('btn-konfirmasi-reset-data');
  tombol.disabled = false;
  tombol.textContent = 'Ya, Hapus Semua Data';
  bukaModal('modal-reset-data');
}

function tutupModalResetData(){
  document.getElementById('form-reset-data').reset();
  tutupModal('modal-reset-data');
}

async function prosesResetData(e){
  e.preventDefault();
  // Jaga-jaga di sisi klien (tombolnya memang sudah disembunyikan lewat
  // data-role="admin" utk non-admin) — keamanan sesungguhnya tetap
  // ditegakkan di database lewat pengecekan peran di dalam fungsi
  // reset_semua_data() itu sendiri.
  if(!CURRENT_USER || CURRENT_USER.peran !== 'admin') return;

  const frasa = document.getElementById('reset-data-frasa').value.trim();
  const password = document.getElementById('reset-data-password').value;
  const msg = document.getElementById('reset-data-msg');
  const tombol = document.getElementById('btn-konfirmasi-reset-data');
  const tampilkanError = (teks) => { msg.textContent = teks; msg.style.display = 'block'; };

  if(frasa !== 'HAPUS SEMUA DATA'){
    tampilkanError('Ketik persis "HAPUS SEMUA DATA" (huruf besar semua) untuk melanjutkan.');
    return;
  }
  if(!password){
    tampilkanError('Masukkan kata sandi Anda untuk konfirmasi.');
    return;
  }

  msg.style.display = 'none';
  tombol.disabled = true;
  tombol.textContent = 'Memverifikasi kata sandi...';

  // Konfirmasi identitas: coba masuk ulang dengan email akun yang sedang
  // aktif + kata sandi yang baru dimasukkan. Kalau salah, permintaan ini
  // gagal dan sesi yang sedang berjalan tidak terpengaruh sama sekali.
  const { error: errAuth } = await supabaseClient.auth.signInWithPassword({
    email: CURRENT_USER.email,
    password
  });
  if(errAuth){
    tampilkanError('Kata sandi salah. Reset dibatalkan.');
    tombol.disabled = false;
    tombol.textContent = 'Ya, Hapus Semua Data';
    return;
  }

  tombol.textContent = 'Menghapus seluruh data...';
  const { error: errReset } = await supabaseClient.rpc('reset_semua_data');
  if(errReset){
    console.error(errReset);
    tampilkanError('Gagal mereset data: ' + errReset.message + '. Sudahkah migrasi v21 (schema.sql) dijalankan di SQL Editor?');
    tombol.disabled = false;
    tombol.textContent = 'Ya, Hapus Semua Data';
    return;
  }

  tutupModal('modal-reset-data');
  tampilkanToast('Semua data berhasil direset');
  // Seluruh state DATA.* & tampilan berubah total setelah ini — memuat
  // ulang aplikasi dari awal adalah cara paling aman & konsisten (pola
  // yang sama dipakai di prosesKeluar()), daripada menyinkronkan puluhan
  // array & render function satu per satu secara manual.
  setTimeout(() => window.location.reload(), 700);
}

function toggleSidebarMobile(){
  document.querySelector('.sidebar').classList.toggle('sidebar-open');
  document.getElementById('sidebar-backdrop').classList.toggle('sidebar-open');
}
function tutupSidebarMobile(){
  document.querySelector('.sidebar').classList.remove('sidebar-open');
  document.getElementById('sidebar-backdrop').classList.remove('sidebar-open');
}

/* ---------------------------------------------------------
   10. CHART PENDAPATAN (tampilan Ringkasan)
   Chart ini tetap memakai data simulasi acak (bukan dari
   database) karena hanya berfungsi sebagai ilustrasi tren.
--------------------------------------------------------- */
function seededRandom(seed){
  let s = seed;
  return function(){ s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}
function buildSeries(n, seed){
  const rnd = seededRandom(seed);
  const points = [];
  let v = 18;
  for(let i=0;i<n;i++){
    const t = i / (n - 1);
    const hump = Math.sin(t * Math.PI) * 55;
    const noise = (rnd() - 0.5) * 8;
    v = Math.max(6, hump + 22 + noise + Math.sin(i * 0.7) * 4);
    points.push(v);
  }
  return points;
}
function toPath(points, w, h, maxV){
  const step = w / (points.length - 1);
  let d = '';
  points.forEach((p, i) => {
    const x = i * step;
    const y = h - (p / maxV) * h;
    d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
  });
  return d.trim();
}

let chartSudahDigambar = false;
let chartRentangAktif = '1H';
const RENTANG_CHART = {
  '1J': { n: 60,  xLabels: ['-60m','-50m','-40m','-30m','-20m','-10m','Now'] },
  '1H': { n: 140, xLabels: ['00.00','03.00','06.00','09.00','12.00','15.00','18.00','21.00'] },
  '1M': { n: 90,  xLabels: ['Sen','Sel','Rab','Kam','Jum','Sab','Ming'] },
  '1B': { n: 120, xLabels: ['Mgg1','Mgg2','Mgg3','Mgg4'] },
  '1T': { n: 150, xLabels: ['Jan','Mar','Mei','Jul','Sep','Nov'] },
  'Semua': { n: 200, xLabels: ['2023','2024','2025','2026'] },
};
function ubahRentangChart(rentang){
  chartRentangAktif = rentang;
  chartSudahDigambar = false;
  document.querySelectorAll('.range-tab').forEach(t => t.classList.toggle('active', t.dataset.range === rentang));
  renderChart();
}
function renderChart(){
  if(chartSudahDigambar) return;
  chartSudahDigambar = true;

  const cfg = RENTANG_CHART[chartRentangAktif] || RENTANG_CHART['1H'];
  const N = cfg.n;
  const seed = 42 + chartRentangAktif.length;
  const mainSeries = buildSeries(N, seed);
  const ghostSeries = buildSeries(N, seed + 49).map(v => v * 0.62 + 6);
  const maxV = Math.max(...mainSeries, ...ghostSeries) * 1.08;

  const W = 1200, H = 360;
  const linePath = toPath(mainSeries, W, H, maxV);
  const areaPath = linePath + ` L${W},${H} L0,${H} Z`;
  const ghostPath = toPath(ghostSeries, W, H, maxV);

  const compareHidden = document.getElementById('main-chart').dataset.compareHidden === '1';
  const svg = document.getElementById('main-chart');
  svg.innerHTML = `
    <defs>
      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ff2440" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#ff2440" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <line x1="0" y1="0" x2="${W}" y2="0" stroke="rgba(255,255,255,.08)" stroke-dasharray="3 5"/>
    <path id="chart-ghost-path" d="${ghostPath}" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="1.5" style="${compareHidden ? 'display:none' : ''}"/>
    <path d="${areaPath}" fill="url(#areaGrad)"/>
    <path id="chart-main-path" d="${linePath}" fill="none" stroke="#ff2e46" stroke-width="2"/>
  `;

  const crossIdx = Math.round(N * 0.42);
  const crossX = (crossIdx / (N - 1)) * W;
  const crossY = H - (mainSeries[crossIdx] / maxV) * H;
  svg.innerHTML += `
    <line x1="${crossX}" y1="0" x2="${crossX}" y2="${H}" stroke="rgba(255,255,255,.35)" stroke-dasharray="4 4"/>
    <circle cx="${crossX}" cy="${crossY}" r="4.5" fill="#140407" stroke="#fff" stroke-width="2"/>
  `;

  const wrap = document.getElementById('chart-wrap');
  const tooltip = document.getElementById('tooltip-box');
  function positionTooltip(){
    const pct = crossX / W;
    tooltip.style.left = (pct * wrap.clientWidth) + 'px';
    tooltip.style.top = (crossY / H * (wrap.clientHeight - 34)) + 'px';
  }
  window.addEventListener('resize', positionTooltip);
  positionTooltip();

  const yAxis = document.getElementById('y-axis');
  const yLabels = ['Rp80rb','Rp70rb','Rp60rb','Rp50rb','Rp40rb','Rp30rb','Rp20rb','Rp10rb'];
  yAxis.innerHTML = yLabels.map(l => `<span>${l}</span>`).join('');

  const xAxis = document.getElementById('x-axis');
  xAxis.innerHTML = cfg.xLabels.map(l => `<span>${l}</span>`).join('');

  const brushSvg = document.getElementById('brush-chart');
  const brushSeries = buildSeries(N, 55);
  const bMax = Math.max(...brushSeries) * 1.15;
  const brushLine = toPath(brushSeries, W, 52, bMax);
  brushSvg.innerHTML = `<path d="${brushLine}" fill="none" stroke="rgba(255,46,70,.55)" stroke-width="1.5"/>`;

  const brushWindow = document.getElementById('brush-window');
  brushWindow.style.left = '74%';
  brushWindow.style.width = '18%';
}

/* ---------------------------------------------------------
   10b. AKSI TOOLBAR GRAFIK
--------------------------------------------------------- */
function toggleFullscreenChart(){
  document.querySelector('.chart-card').classList.toggle('is-fullscreen');
}
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape') document.querySelector('.chart-card')?.classList.remove('is-fullscreen');
});
function resetZoomChart(){
  document.getElementById('brush-window').style.left = '74%';
  document.getElementById('brush-window').style.width = '18%';
  tampilkanToast('Tampilan grafik direset');
}
function toggleGridChart(){
  document.querySelector('.chart-card').classList.toggle('show-grid');
}
function toggleCompareChart(){
  const svg = document.getElementById('main-chart');
  const sedangTersembunyi = svg.dataset.compareHidden === '1';
  svg.dataset.compareHidden = sedangTersembunyi ? '0' : '1';
  const ghost = document.getElementById('chart-ghost-path');
  if(ghost) ghost.style.display = sedangTersembunyi ? '' : 'none';
  tampilkanToast(sedangTersembunyi ? 'Membandingkan dengan periode sebelumnya' : 'Perbandingan disembunyikan');
}
function unduhGrafik(){
  const svgEl = document.getElementById('main-chart');
  const serializer = new XMLSerializer();
  let svgStr = serializer.serializeToString(svgEl);
  const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = function(){
    const canvas = document.createElement('canvas');
    canvas.width = 1200; canvas.height = 360;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a0509';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'grafik-pendapatan-dealstack.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      tampilkanToast('Grafik diunduh');
    });
  };
  img.onerror = function(){ tampilkanToast('Gagal mengunduh grafik', true); };
  img.src = url;
}

/* ---------------------------------------------------------
   12. KALENDER
--------------------------------------------------------- */
const BULAN_INDO = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const BULAN_SINGKAT_INDO = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
let calBulan = new Date().getMonth();
let calTahun = new Date().getFullYear();
let calHariDipilih = null;

function parseTanggalIndo(str){
  if(!str) return null;
  const m = String(str).trim().match(/^(\d{1,2})\s+([A-Za-z]{3,})/);
  if(!m) return null;
  const hari = parseInt(m[1], 10);
  const idxBulan = BULAN_SINGKAT_INDO.findIndex(b => b.toLowerCase() === m[2].slice(0,3).toLowerCase());
  if(idxBulan === -1 || !hari) return null;
  return { hari, bulan: idxBulan };
}

function gantiBulanKalender(delta, keHariIni){
  if(keHariIni){
    calBulan = new Date().getMonth(); calTahun = new Date().getFullYear();
    calHariDipilih = new Date().getDate();
  } else {
    calBulan += delta;
    if(calBulan < 0){ calBulan = 11; calTahun--; }
    if(calBulan > 11){ calBulan = 0; calTahun++; }
    calHariDipilih = null;
  }
  renderKalender();
}

function itemUntukTanggal(hari, bulan, tahun){
  const hasil = [];
  // Purchasing hanya boleh melihat Kalender miliknya sendiri: proyek yang ia
  // buat, dan tugas yang ditugaskan ke/oleh dirinya (lihat juga renderTugas
  // yang menerapkan aturan serupa untuk menu Tugas non-admin).
  const isPurchasing = CURRENT_USER && CURRENT_USER.peran === 'purchasing';
  DATA.proyek.forEach(p => {
    if(!p.tenggat) return;
    if(isPurchasing && p.dibuat_oleh_id !== CURRENT_USER.id) return;
    const d = new Date(p.tenggat);
    if(d.getDate() === hari && d.getMonth() === bulan && d.getFullYear() === tahun){
      hasil.push({ tipe:'proyek', teks: p.nama, sub: p.pelanggan_nama, status: p.status });
    }
  });
  DATA.tugas.forEach(t => {
    if(isPurchasing && t.ditugaskan_ke !== CURRENT_USER.id && t.ditugaskan_oleh !== CURRENT_USER.id) return;
    const tgl = parseTanggalIndo(t.tenggat) || (/^\d{4}-\d{2}-\d{2}/.test(t.tenggat||'') ? { hari: new Date(t.tenggat).getDate(), bulan: new Date(t.tenggat).getMonth() } : null);
    if(tgl && tgl.hari === hari && tgl.bulan === bulan){
      const status = statusKerjaTugas(t);
      hasil.push({ tipe:'tugas', teks: t.judul, sub: labelStatusKerja(status), status });
    }
  });
  return hasil;
}

function pilihHariKalender(hari){
  calHariDipilih = hari;
  renderKalender();
}

function renderKalender(){
  document.getElementById('cal-label').textContent = BULAN_INDO[calBulan] + ' ' + calTahun;
  const weekdayWrap = document.getElementById('cal-weekdays');
  weekdayWrap.innerHTML = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'].map(d => `<div class="cal-weekday">${d}</div>`).join('');

  const daysWrap = document.getElementById('cal-days');
  const firstDay = new Date(calTahun, calBulan, 1).getDay();
  const jumlahHari = new Date(calTahun, calBulan + 1, 0).getDate();
  const hariIni = new Date();
  const isBulanIni = hariIni.getMonth() === calBulan && hariIni.getFullYear() === calTahun;

  let html = '';
  for(let i=0;i<firstDay;i++) html += `<div class="cal-cell muted"></div>`;
  for(let hari=1; hari<=jumlahHari; hari++){
    const items = itemUntukTanggal(hari, calBulan, calTahun);
    const isToday = isBulanIni && hariIni.getDate() === hari;
    const isSelected = calHariDipilih === hari;
    const tampil = items.slice(0,2);
    const sisa = items.length - tampil.length;
    html += `<div class="cal-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" onclick="pilihHariKalender(${hari})">
      <div class="cal-daynum">${hari}</div>
      <div class="cal-dot-row">
        ${tampil.map(it => `<div class="cal-tag ${it.tipe}">${esc(it.teks)}</div>`).join('')}
        ${sisa > 0 ? `<div class="cal-more">+${sisa} lagi</div>` : ''}
      </div>
    </div>`;
  }
  daysWrap.innerHTML = html;

  const agendaTitle = document.getElementById('cal-agenda-title');
  const agendaList = document.getElementById('cal-agenda-list');
  if(calHariDipilih){
    const items = itemUntukTanggal(calHariDipilih, calBulan, calTahun);
    agendaTitle.textContent = `Agenda ${calHariDipilih} ${BULAN_INDO[calBulan]}`;
    agendaList.innerHTML = items.length ? items.map(it => `
      <div class="agenda-item">
        <div class="dot" style="background:${it.tipe==='proyek' ? 'var(--blue)' : 'var(--accent-bright)'}"></div>
        <div><b>${esc(it.teks)}</b> — <span class="cell-muted">${esc(it.sub)}</span></div>
      </div>`).join('') : `<div class="empty-state"><p>Tidak ada agenda di tanggal ini.</p></div>`;
  } else {
    agendaTitle.textContent = 'Agenda Bulan Ini';
    const semuaItem = [];
    for(let h=1; h<=jumlahHari; h++) itemUntukTanggal(h, calBulan, calTahun).forEach(it => semuaItem.push({ ...it, hari: h }));
    agendaList.innerHTML = semuaItem.length ? semuaItem.map(it => `
      <div class="agenda-item">
        <div class="dot" style="background:${it.tipe==='proyek' ? 'var(--blue)' : 'var(--accent-bright)'}"></div>
        <div><b>${esc(it.teks)}</b> — <span class="cell-muted">${esc(it.sub)} · ${it.hari} ${BULAN_SINGKAT_INDO[calBulan]}</span></div>
      </div>`).join('') : `<div class="empty-state"><p>Tidak ada tenggat proyek/tugas di bulan ini.</p></div>`;
  }
}

/* ---------------------------------------------------------
   13. LAPORAN
--------------------------------------------------------- */
function renderLaporan(){
  const { awal, akhir } = dapatkanRentangPeriode('laporan');
  const proyekPeriode = DATA.proyek.filter(p => tanggalDalamRentang(p.tanggal, awal, akhir));

  // Nilai proyek diambil dari grand_total (field yang sama dipakai di menu
  // Pelanggan & "Proyek Pelanggan Ini"), dengan fallback ke field lama
  // "nilai" untuk data lampau yang belum sempat disimpan ulang lewat form.
  // Proyek berstatus "tertunda" & "dibatalkan" DIKECUALIKAN dari nilai —
  // sama seperti aturan Sub Total/Grand Total/Profit di menu Pelanggan —
  // supaya angka di Laporan selalu sinkron dengan menu Pelanggan.
  const nilaiProyek = (p) => p.grand_total || p.nilai || 0;
  const STATUS_DIKECUALIKAN = ['tertunda', 'dibatalkan'];
  const proyekAktif = proyekPeriode.filter(p => !STATUS_DIKECUALIKAN.includes(p.status));
  const totalNilai = proyekAktif.reduce((s,p) => s + nilaiProyek(p), 0);
  const selesai = proyekPeriode.filter(p => p.status === 'selesai').length;
  const dibatalkan = proyekPeriode.filter(p => p.status === 'dibatalkan').length;
  const totalDitutup = selesai + dibatalkan;
  const winRate = totalDitutup ? Math.round((selesai/totalDitutup)*100) : 0;

  const laporanKpi = document.getElementById('laporan-kpi');
  const gradienKpi = ['cmd-grad-cyan', 'cmd-grad-purple', 'cmd-grad-blue', 'cmd-grad-green'];
  const kartu = [
    ['Total Nilai Proyek Aktif', formatRupiah(totalNilai)],
    ['Proyek Selesai', selesai],
    ['Proyek Dibatalkan', dibatalkan],
    ['Tingkat Menang', winRate + '%'],
  ];
  laporanKpi.innerHTML = kartu.map(([label,val], i) => `
    <div class="kpi-card cmd-stat-card ${gradienKpi[i % gradienKpi.length]}">
      <div class="kpi-top"><span class="kpi-label">${label}</span></div>
      <div class="kpi-bottom"><div class="kpi-value">${val}</div></div>
    </div>`).join('');

  // Rekap per industri: jumlah proyek dihitung dari SEMUA status (agar tetap
  // terlihat berapa banyak proyek per industri), tapi nilai rupiah hanya
  // dari proyek yang tidak tertunda/dibatalkan — konsisten dengan kartu di atas.
  const perIndustri = {};
  proyekPeriode.forEach(p => {
    const pel = DATA.pelanggan.find(x => x.nama === p.pelanggan_nama);
    const industri = pel ? (pel.industri || 'Umum') : 'Umum';
    perIndustri[industri] = perIndustri[industri] || { jumlah:0, nilai:0 };
    perIndustri[industri].jumlah++;
    if(!STATUS_DIKECUALIKAN.includes(p.status)) perIndustri[industri].nilai += nilaiProyek(p);
  });
  document.getElementById('laporan-industri').innerHTML = Object.keys(perIndustri).length
    ? Object.entries(perIndustri).map(([nama,d]) => `<div class="report-row"><span>${nama}</span><b>${d.jumlah} proyek · ${formatRupiah(d.nilai)}</b></div>`).join('')
    : `<div class="empty-state"><p>Belum ada data proyek pada periode ini.</p></div>`;

  const perStatus = { berjalan:0, tertunda:0, selesai:0, dibatalkan:0 };
  proyekPeriode.forEach(p => perStatus[p.status] = (perStatus[p.status]||0) + 1);
  document.getElementById('laporan-status').innerHTML = Object.entries(perStatus).map(([status,jumlah]) =>
    `<div class="report-row"><span>${labelStatusProyek(status)}</span><b>${jumlah} proyek</b></div>`).join('');
}

/* ---------------------------------------------------------
   14. PESAN / CATATAN TIM
--------------------------------------------------------- */
function renderPesan(){
  const wrap = document.getElementById('message-list');
  const badge = document.getElementById('badge-pesan');
  if(!DATA.catatan.length){
    wrap.innerHTML = `<div class="empty-state"><p>Belum ada catatan. Tulis pengumuman pertama untuk tim Anda.</p></div>`;
    badge.style.display = 'none';
    return;
  }
  badge.textContent = DATA.catatan.length;
  badge.style.display = 'inline-block';
  wrap.innerHTML = DATA.catatan.map(c => `
    <div class="message-item">
      <div class="message-avatar">${esc((c.dibuat_oleh||'?').trim().charAt(0).toUpperCase())}</div>
      <div class="message-body">
        <div class="message-head">
          <span class="message-author">${esc(c.dibuat_oleh)}</span>
          <span class="message-time">${esc(waktuRelatif(c.dibuat_pada))}</span>
        </div>
        <div class="message-text">${esc(c.isi)}</div>
      </div>
      <div class="message-del" title="Hapus" onclick="hapusCatatan('${c.id}')">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>
      </div>
    </div>`).join('');
}
async function tambahCatatan(){
  const isiEl = document.getElementById('input-catatan');
  const isi = isiEl.value.trim();
  // BUGFIX (audit): sebelumnya nama pengirim diambil dari field teks bebas
  // (#input-catatan-nama, default "Lawrence Austin"), jadi siapa pun yang
  // login bisa mengaku sebagai orang lain / Admin di papan Pesan. Nama
  // sekarang selalu diambil dari akun yang sedang login.
  const nama = (CURRENT_USER && CURRENT_USER.nama) || 'Anonim';
  if(!isi){ tampilkanToast('Tulis catatan terlebih dahulu', true); return; }

  const { data, error } = await supabaseClient.from('catatan_tim').insert({ isi, dibuat_oleh: nama }).select().single();
  if(error){
    console.error(error);
    tampilkanToast('Gagal menyimpan. Sudahkah migrasi tabel catatan_tim dijalankan? Lihat schema.sql', true);
    return;
  }
  DATA.catatan.unshift(data);
  renderPesan();
  isiEl.value = '';
  tampilkanToast('Catatan terkirim');
}
async function hapusCatatan(id){
  const { error } = await supabaseClient.from('catatan_tim').delete().eq('id', id);
  if(error){ console.error(error); tampilkanToast('Gagal menghapus catatan', true); return; }
  DATA.catatan = DATA.catatan.filter(c => c.id !== id);
  renderPesan();
  tampilkanToast('Catatan dihapus');
}

/* ---------------------------------------------------------
   15. INTEGRASI — CEK KONEKSI SUPABASE
--------------------------------------------------------- */
async function tesKoneksiSupabase(){
  const icon = document.getElementById('integrasi-icon');
  const status = document.getElementById('integrasi-status');
  status.textContent = 'Memeriksa koneksi...';
  const { error, count } = await supabaseClient.from('pelanggan').select('*', { count: 'exact', head: true });
  const jam = new Date().toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
  if(error){
    icon.classList.remove('ok'); icon.classList.add('fail');
    status.textContent = `Gagal terhubung (${jam}). Periksa config.js & kebijakan RLS.`;
  } else {
    icon.classList.remove('fail'); icon.classList.add('ok');
    status.textContent = `Terhubung · ${count ?? DATA.pelanggan.length} baris pelanggan · diperiksa ${jam}`;
  }
}

/* ---------------------------------------------------------
   16. PUSAT BANTUAN (FAQ)
--------------------------------------------------------- */
const DAFTAR_FAQ = [
  { q: 'Bagaimana cara menambah pelanggan atau proyek baru?', a: 'Untuk pelanggan: buka menu Pelanggan, klik tombol "Tambah Pelanggan". Untuk proyek: klik nama pelanggan yang dituju untuk membuka halaman detailnya, lalu klik "Tambah Proyek" — proyek baru otomatis tertaut ke pelanggan tersebut.' },
  { q: 'Kenapa data tidak muncul saat pertama kali membuka aplikasi?', a: 'Pastikan config.js sudah diisi dengan SUPABASE_URL dan SUPABASE_ANON_KEY yang benar, dan skema tabel di supabase/schema.sql sudah dijalankan di SQL Editor Supabase Anda.' },
  { q: 'Bagaimana cara mengubah status sebuah proyek?', a: 'Buka halaman detail pelanggan terkait, lalu klik tombol Edit pada baris proyek yang bersangkutan dan ubah Status di form. Perubahan otomatis tercatat di menu Aktivitas.' },
  { q: 'Apakah bisa memberi tugas ke anggota tim tertentu dan memantau progresnya?', a: 'Fitur ini sedang direncanakan sebagai tahap berikutnya (memerlukan sistem login multi-pengguna). Untuk saat ini, gunakan menu Tugas untuk daftar tugas bersama dan menu Pesan untuk koordinasi tim.' },
  { q: 'Bagaimana cara mengunduh laporan?', a: 'Buka menu Laporan, lalu klik tombol "Unduh CSV" di kanan atas untuk mengunduh data proyek, atau "Cetak" untuk mencetak/menyimpan sebagai PDF.' },
  { q: 'Apa itu Row Level Security (RLS) dan apakah data saya aman?', a: 'RLS adalah aturan akses tingkat baris di database Supabase. Saat ini kebijakan mengizinkan akses baca/tulis publik lewat anon key — cocok untuk tim internal. Untuk keamanan lebih ketat per-pengguna, aktifkan Supabase Auth.' },
  { q: 'Bagaimana cara mengganti foto profil atau kata sandi saya?', a: 'Buka menu Pengaturan di sidebar (atau ikon gear di topbar → "Edit Profil & Perusahaan"). Di kartu "Profil Saya" Anda bisa mengganti foto, nama, jabatan, dan telepon; di bawahnya ada form untuk memperbarui kata sandi.' },
  { q: 'Bagaimana cara mengganti logo dan nama perusahaan yang tampil di sidebar?', a: 'Hanya Admin yang bisa mengubahnya, lewat menu Pengaturan → kartu "Profil Perusahaan". Unggah logo (disarankan PNG/SVG transparan, persegi) dan ubah nama perusahaan, lalu klik Simpan — perubahan langsung tampil di sidebar dan layar masuk semua pengguna.' },
];
function renderFAQ(){
  const wrap = document.getElementById('faq-list');
  wrap.innerHTML = DAFTAR_FAQ.map((item, i) => `
    <div class="faq-item" id="faq-${i}">
      <div class="faq-q" onclick="toggleFAQ(${i})">
        <span>${item.q}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg>
      </div>
      <div class="faq-a"><div class="faq-a-inner">${item.a}</div></div>
    </div>`).join('');
}
function toggleFAQ(i){
  document.getElementById('faq-' + i).classList.toggle('open');
}

/* ---------------------------------------------------------
   11. INISIALISASI APLIKASI
--------------------------------------------------------- */
function initNavigasi(){
  document.querySelectorAll('.nav-item[data-view]').forEach(el => {
    el.addEventListener('click', () => pindahTampilan(el.dataset.view));
  });
}
function initEventListener(){
  document.getElementById('filter-periode-ringkasan').addEventListener('change', renderRingkasan);
  document.getElementById('periode-dari-ringkasan').addEventListener('change', renderRingkasan);
  document.getElementById('periode-sampai-ringkasan').addEventListener('change', renderRingkasan);

  document.getElementById('cari-pelanggan').addEventListener('input', renderPelanggan);
  document.getElementById('form-pelanggan').addEventListener('submit', simpanPelanggan);
  document.getElementById('filter-periode-pelanggan').addEventListener('change', renderPelanggan);
  document.getElementById('periode-dari-pelanggan').addEventListener('change', renderPelanggan);
  document.getElementById('periode-sampai-pelanggan').addEventListener('change', renderPelanggan);

  document.getElementById('cari-proyek-detail').addEventListener('input', renderProyekDetail);
  document.getElementById('filter-status-proyek-detail').addEventListener('change', renderProyekDetail);
  document.getElementById('filter-periode-proyek-detail').addEventListener('change', renderProyekDetail);
  document.getElementById('periode-dari-proyek-detail').addEventListener('change', renderProyekDetail);
  document.getElementById('periode-sampai-proyek-detail').addEventListener('change', renderProyekDetail);
  document.getElementById('form-proyek').addEventListener('submit', simpanProyek);
  ['input-subtotal-proyek','input-tax-proyek','input-dana-lain-proyek','input-total-budget-proyek','input-budget-terpakai-proyek']
    .forEach(id => document.getElementById(id).addEventListener('input', perbaruiKalkulasiFormProyek));

  document.getElementById('form-tugas').addEventListener('submit', tambahTugas);

  document.getElementById('form-profil-saya').addEventListener('submit', simpanProfilSaya);
  document.getElementById('form-ubah-sandi').addEventListener('submit', simpanUbahSandi);
  const formPerusahaan = document.getElementById('form-perusahaan');
  if(formPerusahaan) formPerusahaan.addEventListener('submit', simpanPerusahaan);
  const formResetData = document.getElementById('form-reset-data');
  if(formResetData) formResetData.addEventListener('submit', prosesResetData);

  document.getElementById('cari-aktivitas').addEventListener('input', renderAktivitas);
  document.getElementById('filter-tipe-aktivitas').addEventListener('change', renderAktivitas);
  document.getElementById('filter-periode-aktivitas').addEventListener('change', renderAktivitas);
  document.getElementById('periode-dari-aktivitas').addEventListener('change', renderAktivitas);
  document.getElementById('periode-sampai-aktivitas').addEventListener('change', renderAktivitas);

  document.getElementById('filter-periode-laporan').addEventListener('change', renderLaporan);
  document.getElementById('periode-dari-laporan').addEventListener('change', renderLaporan);
  document.getElementById('periode-sampai-laporan').addEventListener('change', renderLaporan);

  document.getElementById('cari-gudang').addEventListener('input', renderGudang);
  document.getElementById('filter-lokasi-gudang').addEventListener('change', renderGudang);
  document.getElementById('filter-merek-gudang').addEventListener('change', renderGudang);
  document.getElementById('filter-kategori-gudang').addEventListener('change', renderGudang);
  document.getElementById('filter-status-gudang').addEventListener('change', renderGudang);
  document.getElementById('form-item-stok').addEventListener('submit', simpanItemStok);
  document.getElementById('form-gudang').addEventListener('submit', tambahGudang);

  document.getElementById('cari-produk-master').addEventListener('input', renderProdukMaster);
  document.getElementById('filter-merek-produk-master').addEventListener('change', renderProdukMaster);
  document.getElementById('filter-kategori-produk-master').addEventListener('change', renderProdukMaster);
  document.getElementById('form-kategori').addEventListener('submit', simpanKategori);
  document.getElementById('form-merek').addEventListener('submit', simpanMerek);
  document.getElementById('form-produk-master').addEventListener('submit', simpanProdukMaster);

  document.getElementById('cari-stok-masuk-detail').addEventListener('input', renderTabelStokMasukDetail);
  document.getElementById('filter-kondisi-stok-masuk-detail').addEventListener('change', renderTabelStokMasukDetail);
  document.getElementById('form-stok-masuk').addEventListener('submit', simpanStokMasuk);

  document.getElementById('cari-stok-keluar-detail').addEventListener('input', renderTabelStokKeluarDetail);
  document.getElementById('filter-status-keluar-stok-keluar-detail').addEventListener('change', renderTabelStokKeluarDetail);
  document.getElementById('form-stok-keluar').addEventListener('submit', simpanStokKeluar);
  document.getElementById('input-pelanggan-stok-keluar').addEventListener('change', saatPelangganStokKeluarBerubah);
  document.getElementById('input-proyek-stok-keluar').addEventListener('change', saatProyekStokKeluarBerubah);

  document.querySelectorAll('.range-tab').forEach(tab => {
    tab.addEventListener('click', () => ubahRentangChart(tab.dataset.range));
  });
}

/* ---------------------------------------------------------
   20. IMPORT DATA (CSV) — mesin generik dipakai di semua menu
   yang punya tombol "Import Data" (Pelanggan, Proyek Pelanggan,
   Tugas, Stock & Gudang, Kategori Merek, Kategori Produk, Gudang).

   Alur: 1) Unduh Template CSV (header + 1 baris contoh sesuai
   skema tabel tujuan) -> 2) Pengguna isi & unggah lagi -> 3) Setiap
   baris divalidasi di sisi klien dulu (format, data wajib, relasi
   ke master data yang sudah ada) & ditampilkan pratinjaunya sebelum
   disimpan -> 4) Baris yang valid disimpan ke Supabase per-baris
   (supaya satu baris gagal tidak menggagalkan baris lain), lalu
   cache DATA & tampilan terkait disegarkan sama seperti alur
   tambah data manual.
--------------------------------------------------------- */
let IMPOR_STATE = { tipe: null, mentah: [], hasil: [] };

const IMPOR_SKEMA = {
  pelanggan: {
    judul: 'Import Data Pelanggan',
    deskripsi: 'Tambah banyak pelanggan sekaligus lewat file CSV. Kode Pelanggan boleh dikosongkan (dibuat otomatis).',
    labelSatuan: 'pelanggan',
    tabel: 'pelanggan',
    tipeAktivitas: 'pelanggan',
    kolom: [
      { key:'kode', label:'Kode Pelanggan', contoh:'CL-3001' },
      { key:'nama', label:'Nama Pelanggan', wajib:true, contoh:'PT Contoh Sukses' },
      { key:'industri', label:'Industri', contoh:'Retail' },
      { key:'status', label:'Status (aktif/tertunda/nonaktif)', contoh:'aktif' },
      { key:'alamat', label:'Alamat', contoh:'Jl. Raya No. 10, Surabaya' },
      { key:'no_telepon', label:'No Telepon', contoh:'031-7654321' },
      { key:'no_whatsapp', label:'No WhatsApp', contoh:'081234567890' },
      { key:'nama_pic', label:'Nama PIC', contoh:'Sari Wulandari' },
    ],
    siapkanBaris(r){
      const nama = (r.nama || '').trim();
      if(!nama) return { ok:false, pesan:'Nama Pelanggan wajib diisi' };
      let status = (r.status || 'aktif').trim().toLowerCase();
      if(!['aktif','tertunda','nonaktif'].includes(status)) status = 'aktif';
      const kode = (r.kode || '').trim() || kodeAcak('CL');
      return { ok:true, baris:{
        kode, nama, industri:(r.industri||'').trim() || 'Umum', status,
        alamat:(r.alamat||'').trim() || null, no_telepon:(r.no_telepon||'').trim() || null,
        no_whatsapp:(r.no_whatsapp||'').trim() || null, nama_pic:(r.nama_pic||'').trim() || null,
        kontak_terakhir: new Date().toISOString().slice(0,10)
      }};
    },
    setelahSimpan(rows){
      DATA.pelanggan.unshift(...rows);
      renderPelanggan(); isiDropdownPelangganProyek(); renderRingkasanTabelPelanggan();
    }
  },

  proyek: {
    judul: 'Import Data Proyek',
    deskripsi: 'Tambah banyak proyek/PO sekaligus untuk pelanggan yang sedang dibuka ini. No PO boleh dikosongkan (dibuat otomatis).',
    labelSatuan: 'proyek',
    tabel: 'proyek',
    tipeAktivitas: 'proyek',
    kolom: [
      { key:'no_po', label:'No PO', contoh:'PO-9001' },
      { key:'nama', label:'Nama Proyek', wajib:true, contoh:'Instalasi Jaringan Kantor' },
      { key:'status', label:'Status (berjalan/tertunda/selesai/dibatalkan)', contoh:'berjalan' },
      { key:'tanggal', label:'Tanggal PO (YYYY-MM-DD)', contoh:'2026-07-14' },
      { key:'tenggat', label:'Tenggat (YYYY-MM-DD)', contoh:'2026-08-30' },
      { key:'sub_total', label:'Sub Total', contoh:'50000000' },
      { key:'tax_persen', label:'Tax (%)', contoh:'11' },
      { key:'dana_lainnya', label:'Dana Lainnya', contoh:'0' },
      { key:'total_budget', label:'Total Budget', contoh:'40000000' },
      { key:'budget_terpakai', label:'Budget Terpakai', contoh:'0' },
    ],
    siapkanBaris(r){
      const nama = (r.nama || '').trim();
      if(!nama) return { ok:false, pesan:'Nama Proyek wajib diisi' };
      const pelanggan = DATA.pelanggan.find(p => p.id === PELANGGAN_AKTIF_ID);
      if(!pelanggan) return { ok:false, pesan:'Pelanggan aktif tidak ditemukan' };
      let status = (r.status || 'berjalan').trim().toLowerCase();
      if(!['berjalan','tertunda','selesai','dibatalkan'].includes(status)) status = 'berjalan';
      const sub_total = parseInt(r.sub_total || '0', 10) || 0;
      const tax_persen = parseFloat(r.tax_persen || '0') || 0;
      const dana_lainnya = parseInt(r.dana_lainnya || '0', 10) || 0;
      const total_budget = parseInt(r.total_budget || '0', 10) || 0;
      const budget_terpakai = parseInt(r.budget_terpakai || '0', 10) || 0;
      const grand_total = hitungGrandTotal(sub_total, tax_persen, dana_lainnya);
      const progres = status === 'selesai' ? 100 : 0;
      const kode = (r.no_po || '').trim() || kodeAcak('PO');
      return { ok:true, baris:{
        kode, nama, pelanggan_id: pelanggan.id, pelanggan_nama: pelanggan.nama,
        tanggal: (r.tanggal||'').trim() || new Date().toISOString().slice(0,10),
        tenggat: (r.tenggat||'').trim() || null,
        status, progres, sub_total, tax_persen, dana_lainnya, grand_total,
        total_budget, budget_terpakai, nilai: grand_total,
        dibuat_oleh_id: CURRENT_USER ? CURRENT_USER.id : null,
        dibuat_oleh_nama: CURRENT_USER ? CURRENT_USER.nama : null,
        diupdate_pada: new Date().toISOString()
      }};
    },
    setelahSimpan(rows){
      DATA.proyek.unshift(...rows);
      segarkanDetailPelangganJikaAktif(); renderFunnel(); renderPelanggan(); renderRingkasan();
    }
  },

  tugas: {
    judul: 'Import Data Tugas',
    deskripsi: 'Tambah banyak tugas sekaligus. Kolom "Ditugaskan Ke" harus persis sama dengan nama anggota di menu Kelola Pengguna, atau dikosongkan.',
    labelSatuan: 'tugas',
    tabel: 'tugas',
    tipeAktivitas: 'tugas',
    kolom: [
      { key:'judul', label:'Judul Tugas', wajib:true, contoh:'Follow up penawaran' },
      { key:'deskripsi', label:'Deskripsi', contoh:'Hubungi klien terkait status penawaran' },
      { key:'ditugaskan_ke', label:'Ditugaskan Ke (nama anggota)', contoh:'Budi Santoso' },
      { key:'prioritas', label:'Prioritas (rendah/normal/tinggi)', contoh:'normal' },
      { key:'tenggat', label:'Tenggat', contoh:'20 Jul' },
    ],
    siapkanBaris(r){
      const judul = (r.judul || '').trim();
      if(!judul) return { ok:false, pesan:'Judul Tugas wajib diisi' };
      let prioritas = (r.prioritas || 'normal').trim().toLowerCase();
      if(!['rendah','normal','tinggi'].includes(prioritas)) prioritas = 'normal';
      let ditugaskan_ke = null, peringatan = null;
      const namaAssignee = (r.ditugaskan_ke || '').trim();
      if(namaAssignee){
        const profilCocok = DATA.profil.find(p => (p.nama||'').toLowerCase() === namaAssignee.toLowerCase());
        if(profilCocok) ditugaskan_ke = profilCocok.id;
        else peringatan = `Anggota "${namaAssignee}" tidak ditemukan — dibiarkan belum ditugaskan`;
      }
      return { ok:true, peringatan, baris:{
        judul, deskripsi:(r.deskripsi||'').trim() || null, ditugaskan_ke, prioritas,
        tenggat:(r.tenggat||'').trim() || null,
        ditugaskan_oleh: CURRENT_USER ? CURRENT_USER.id : null,
        status_kerja:'belum', selesai:false
      }};
    },
    setelahSimpan(rows){
      DATA.tugas.unshift(...rows);
      renderTugas(); renderDashTeamRow();
      if(CURRENT_USER && CURRENT_USER.peran === 'admin') renderPengawasanTim();
    }
  },

  stok_item: {
    judul: 'Import Data Stock & Gudang',
    deskripsi: 'Tambah banyak item stok sekaligus. Nama Gudang harus sudah terdaftar di menu Manajemen Produk & Kategori. Kategori/Merek yang belum ada otomatis dipakaikan "Umum".',
    labelSatuan: 'item stok',
    tabel: 'stok_item',
    tipeAktivitas: 'gudang',
    kolom: [
      { key:'gudang', label:'Nama Gudang', wajib:true, contoh:'Gudang Pusat Surabaya' },
      { key:'sku', label:'SKU', wajib:true, contoh:'SKU-3001' },
      { key:'nama_produk', label:'Nama Produk', wajib:true, contoh:'Kabel HDMI 2 Meter' },
      { key:'variant', label:'Variant', contoh:'Hitam' },
      { key:'kategori', label:'Kategori', contoh:'Elektronik' },
      { key:'merek', label:'Merek', contoh:'Anker' },
      { key:'satuan', label:'Satuan', contoh:'Pcs' },
      { key:'stok_minimum', label:'Stok Minimum', contoh:'10' },
      { key:'stok_awal', label:'Stok Awal (Stok Masuk)', contoh:'50' },
      { key:'status', label:'Status (aktif/nonaktif)', contoh:'aktif' },
    ],
    validasiSebelumImpor(){
      if(!DATA.gudang.length) return 'Tambah gudang terlebih dahulu lewat "Manajemen Produk & Kategori" sebelum import item stok.';
      return null;
    },
    siapkanBaris(r){
      const sku = (r.sku || '').trim();
      const nama_produk = (r.nama_produk || '').trim();
      if(!sku || !nama_produk) return { ok:false, pesan:'SKU dan Nama Produk wajib diisi' };
      const namaGudangDicari = (r.gudang || '').trim();
      const gudangObj = DATA.gudang.find(g => g.nama.toLowerCase() === namaGudangDicari.toLowerCase());
      if(!gudangObj) return { ok:false, pesan:`Gudang "${namaGudangDicari}" tidak ditemukan` };
      if(DATA.stokItem.some(i => i.gudang_id === gudangObj.id && (i.sku||'').toLowerCase() === sku.toLowerCase()))
        return { ok:false, pesan:`SKU "${sku}" sudah ada di gudang "${gudangObj.nama}"` };

      let peringatan = null;
      let kategori = (r.kategori || '').trim() || 'Umum';
      const kategoriObj = DATA.kategoriProduk.find(k => k.nama.toLowerCase() === kategori.toLowerCase());
      if(!kategoriObj && kategori.toLowerCase() !== 'umum'){ peringatan = `Kategori "${kategori}" tidak ditemukan, dipakai "Umum"`; kategori = 'Umum'; }
      let merek = (r.merek || '').trim() || 'Umum';
      const merekObj = DATA.kategoriMerek.find(m => m.nama.toLowerCase() === merek.toLowerCase());
      if(!merekObj && merek.toLowerCase() !== 'umum'){ peringatan = (peringatan ? peringatan + '; ' : '') + `Merek "${merek}" tidak ditemukan, dipakai "Umum"`; merek = 'Umum'; }

      const stok_minimum = Number(r.stok_minimum) || 0;
      const stokAwal = Number(r.stok_awal) || 0;
      const satuan = (r.satuan || '').trim() || 'Pcs';
      let status = (r.status || 'aktif').trim().toLowerCase();
      if(!['aktif','nonaktif'].includes(status)) status = 'aktif';

      return { ok:true, peringatan, stokAwal, baris:{
        gudang_id: gudangObj.id, sku, nama_produk, variant:(r.variant||'').trim() || null,
        kategori, kategori_id: kategoriObj ? kategoriObj.id : ((DATA.kategoriProduk.find(k=>k.nama==='Umum')||{}).id || null),
        merek, merek_id: merekObj ? merekObj.id : ((DATA.kategoriMerek.find(m=>m.nama==='Umum')||{}).id || null),
        stok_minimum, satuan, status, stok_masuk: stokAwal, stok_keluar: 0,
        diupdate_oleh_id: CURRENT_USER ? CURRENT_USER.id : null,
        diupdate_oleh_nama: CURRENT_USER ? CURRENT_USER.nama : null
      }};
    },
    async setelahBarisDisimpan(hasilAsli, dataTersimpan){
      // Catat stok awal (jika ada) sebagai satu baris riwayat stok masuk, sama seperti alur Tambah Item Stok manual
      if(hasilAsli.stokAwal > 0){
        await supabaseClient.from('riwayat_stok').insert({
          item_id: dataTersimpan.id, tipe:'masuk', stok_baru: hasilAsli.stokAwal, jumlah: hasilAsli.stokAwal,
          catatan:'Stok awal saat item dibuat (Import CSV)',
          dibuat_oleh_id: CURRENT_USER ? CURRENT_USER.id : null, dibuat_oleh_nama: CURRENT_USER ? CURRENT_USER.nama : null
        });
      }
    },
    setelahSimpan(rows){
      DATA.stokItem.unshift(...rows);
      renderGudang(); renderProdukMaster();
    }
  },

  kategori_produk: {
    judul: 'Import Data Kategori Produk',
    deskripsi: 'Tambah banyak kategori produk sekaligus.',
    labelSatuan: 'kategori',
    tabel: 'kategori_produk',
    tipeAktivitas: 'gudang',
    kolom: [ { key:'nama', label:'Nama Kategori', wajib:true, contoh:'Aksesoris' } ],
    siapkanBaris(r){
      const nama = (r.nama || '').trim();
      if(!nama) return { ok:false, pesan:'Nama Kategori wajib diisi' };
      if(DATA.kategoriProduk.some(k => k.nama.toLowerCase() === nama.toLowerCase())) return { ok:false, pesan:'Kategori ini sudah ada' };
      return { ok:true, baris:{ nama } };
    },
    setelahSimpan(rows){
      DATA.kategoriProduk.push(...rows);
      DATA.kategoriProduk.sort((a,b) => a.nama.localeCompare(b.nama));
      renderKategoriMaster(); renderStatManajemenProduk();
    }
  },

  kategori_merek: {
    judul: 'Import Data Kategori Merek',
    deskripsi: 'Tambah banyak merek/brand sekaligus.',
    labelSatuan: 'merek',
    tabel: 'kategori_merek',
    tipeAktivitas: 'gudang',
    kolom: [ { key:'nama', label:'Nama Merek', wajib:true, contoh:'Samsung' } ],
    siapkanBaris(r){
      const nama = (r.nama || '').trim();
      if(!nama) return { ok:false, pesan:'Nama Merek wajib diisi' };
      if(DATA.kategoriMerek.some(m => m.nama.toLowerCase() === nama.toLowerCase())) return { ok:false, pesan:'Merek ini sudah ada' };
      return { ok:true, baris:{ nama } };
    },
    setelahSimpan(rows){
      DATA.kategoriMerek.push(...rows);
      DATA.kategoriMerek.sort((a,b) => a.nama.localeCompare(b.nama));
      renderMerekMaster(); renderStatManajemenProduk();
    }
  },

  gudang: {
    judul: 'Import Data Gudang',
    deskripsi: 'Tambah banyak gudang/lokasi penyimpanan sekaligus.',
    labelSatuan: 'gudang',
    tabel: 'gudang',
    tipeAktivitas: 'gudang',
    kolom: [
      { key:'nama', label:'Nama Gudang', wajib:true, contoh:'Gudang Cabang Bandung' },
      { key:'lokasi', label:'Lokasi', contoh:'Jl. Soekarno Hatta, Bandung' },
    ],
    siapkanBaris(r){
      const nama = (r.nama || '').trim();
      if(!nama) return { ok:false, pesan:'Nama Gudang wajib diisi' };
      if(DATA.gudang.some(g => g.nama.toLowerCase() === nama.toLowerCase())) return { ok:false, pesan:'Gudang ini sudah ada' };
      return { ok:true, baris:{ nama, lokasi:(r.lokasi||'').trim() || null } };
    },
    setelahSimpan(rows){
      DATA.gudang.push(...rows);
      renderListGudangKelola(); renderStatManajemenProduk(); isiDropdownGudang(); renderGudang();
    }
  },
};

function bukaModalImport(tipe){
  const skema = IMPOR_SKEMA[tipe];
  if(!skema) return;
  if(tipe === 'proyek' && !PELANGGAN_AKTIF_ID){ tampilkanToast('Buka detail pelanggan terlebih dahulu', true); return; }
  if(skema.validasiSebelumImpor){
    const pesan = skema.validasiSebelumImpor();
    if(pesan){ tampilkanToast(pesan, true); return; }
  }
  IMPOR_STATE = { tipe, mentah: [], hasil: [] };
  document.getElementById('judul-modal-import').textContent = skema.judul;
  document.getElementById('deskripsi-modal-import').textContent = skema.deskripsi;
  document.getElementById('input-file-import').value = '';
  document.getElementById('wrap-preview-import').classList.add('hidden');
  document.getElementById('wrap-hasil-import').classList.add('hidden');
  document.getElementById('wrap-hasil-import').innerHTML = '';
  document.getElementById('btn-proses-import').disabled = true;
  document.getElementById('btn-proses-import').textContent = 'Mulai Import';
  bukaModal('modal-import');
}

/* Parser CSV sederhana namun tangguh: menangani nilai yang dibungkus tanda kutip
   (termasuk yang berisi koma/baris baru/tanda kutip ganda "" untuk escape) —
   dipakai supaya file yang diedit di Excel/Google Sheets tetap terbaca benar. */
function parseCSV(teks){
  if(teks.charCodeAt(0) === 0xFEFF) teks = teks.slice(1); // buang BOM jika ada
  const semuaBaris = [];
  let baris = [], field = '', dalamKutip = false;
  for(let i = 0; i < teks.length; i++){
    const c = teks[i];
    if(dalamKutip){
      if(c === '"'){
        if(teks[i+1] === '"'){ field += '"'; i++; }
        else dalamKutip = false;
      } else field += c;
    } else {
      if(c === '"') dalamKutip = true;
      else if(c === ','){ baris.push(field); field = ''; }
      else if(c === '\r'){ /* lewati, ditangani bareng \n */ }
      else if(c === '\n'){ baris.push(field); semuaBaris.push(baris); baris = []; field = ''; }
      else field += c;
    }
  }
  if(field.length || baris.length){ baris.push(field); semuaBaris.push(baris); }
  return semuaBaris.filter(b => b.some(v => (v||'').trim() !== ''));
}

function unduhTemplateImport(){
  const skema = IMPOR_SKEMA[IMPOR_STATE.tipe];
  if(!skema) return;
  unduhCSV(`template-import-${IMPOR_STATE.tipe}.csv`,
    skema.kolom.map(k => k.label),
    [ skema.kolom.map(k => k.contoh || '') ]);
  tampilkanToast('Template CSV diunduh');
}

function bacaFileImport(e){
  const file = e.target.files[0];
  if(!file) return;
  const skema = IMPOR_SKEMA[IMPOR_STATE.tipe];
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const semuaBaris = parseCSV(String(reader.result));
      if(semuaBaris.length < 2){ tampilkanToast('File CSV kosong atau tidak berisi baris data', true); return; }
      const headerMentah = semuaBaris[0].map(h => (h||'').trim());
      const petaKolom = headerMentah.map(h => {
        const idx = skema.kolom.findIndex(k => k.label.toLowerCase() === h.toLowerCase());
        return idx > -1 ? skema.kolom[idx].key : null;
      });
      // Kalau header tidak cocok sama sekali dengan template (mis. diketik ulang manual),
      // fallback ke urutan kolom template apa adanya supaya file tetap bisa dibaca.
      const petaFinal = petaKolom.some(k => k) ? petaKolom : skema.kolom.map(k => k.key);

      const dataMentah = semuaBaris.slice(1).map(sel => {
        const obj = {};
        petaFinal.forEach((key, i) => { if(key) obj[key] = sel[i] !== undefined ? sel[i] : ''; });
        return obj;
      }).filter(obj => Object.values(obj).some(v => (v||'').trim() !== ''));

      if(!dataMentah.length){ tampilkanToast('Tidak ada baris data yang bisa dibaca dari file ini', true); return; }
      IMPOR_STATE.mentah = dataMentah;
      validasiDanTampilkanPreviewImport();
    } catch(err){
      console.error(err);
      tampilkanToast('Gagal membaca file CSV. Pastikan formatnya benar.', true);
    }
  };
  reader.readAsText(file, 'UTF-8');
}

function validasiDanTampilkanPreviewImport(){
  const skema = IMPOR_SKEMA[IMPOR_STATE.tipe];
  IMPOR_STATE.hasil = IMPOR_STATE.mentah.map(r => skema.siapkanBaris(r));

  const jumlahValid = IMPOR_STATE.hasil.filter(h => h.ok).length;
  const jumlahError = IMPOR_STATE.hasil.length - jumlahValid;

  document.getElementById('ringkasan-preview-import').innerHTML = `
    <span class="impor-badge total">${IMPOR_STATE.hasil.length} baris terbaca</span>
    <span class="impor-badge ok">${jumlahValid} siap diimport</span>
    ${jumlahError ? `<span class="impor-badge error">${jumlahError} bermasalah</span>` : ''}`;

  document.getElementById('thead-preview-import').innerHTML =
    skema.kolom.map(k => `<th>${esc(k.label)}</th>`).join('') + '<th>Status</th>';

  document.getElementById('tbody-preview-import').innerHTML = IMPOR_STATE.mentah.map((r, i) => {
    const h = IMPOR_STATE.hasil[i];
    const kolomHtml = skema.kolom.map(k => `<td>${esc(r[k.key]) || '<span class="cell-muted">—</span>'}</td>`).join('');
    let statusHtml;
    if(!h.ok) statusHtml = `<td class="impor-status-error">Gagal: ${esc(h.pesan)}</td>`;
    else if(h.peringatan) statusHtml = `<td class="impor-status-warn">Siap (${esc(h.peringatan)})</td>`;
    else statusHtml = `<td class="impor-status-ok">Siap diimport</td>`;
    return `<tr>${kolomHtml}${statusHtml}</tr>`;
  }).join('');

  document.getElementById('wrap-preview-import').classList.remove('hidden');
  document.getElementById('wrap-hasil-import').classList.add('hidden');
  document.getElementById('btn-proses-import').disabled = jumlahValid === 0;
}

/* Membagi array jadi beberapa potongan kecil supaya satu request insert
   tidak terlalu besar, dan supaya kalau ada masalah, cakupan baris yang
   perlu diulang per-baris (fallback) tidak terlalu banyak. */
function potongArray(arr, ukuran){
  const hasil = [];
  for(let i = 0; i < arr.length; i += ukuran) hasil.push(arr.slice(i, i + ukuran));
  return hasil;
}

async function prosesImportSekarang(){
  const skema = IMPOR_SKEMA[IMPOR_STATE.tipe];
  const btn = document.getElementById('btn-proses-import');
  btn.disabled = true;
  btn.textContent = 'Memproses...';

  const validEntries = IMPOR_STATE.hasil
    .map((h, i) => ({ h, i }))
    .filter(x => x.h.ok);

  const tersimpan = []; // { hasilAsli, data }
  const gagal = []; // { nomorBaris, pesan }

  for(const potongan of potongArray(validEntries, 40)){
    const { data, error } = await supabaseClient.from(skema.tabel).insert(potongan.map(x => x.h.baris)).select();
    if(!error){
      data.forEach((d, idx) => tersimpan.push({ hasilAsli: potongan[idx].h, data: d }));
      continue;
    }
    // Batch gagal (mis. ada 1 baris duplikat) — coba ulang satu-satu supaya baris yang
    // valid tetap tersimpan dan hanya baris bermasalah yang dilaporkan gagal.
    for(const x of potongan){
      const { data: d1, error: e1 } = await supabaseClient.from(skema.tabel).insert(x.h.baris).select().single();
      if(e1) gagal.push({ nomorBaris: x.i + 2, pesan: pesanErrorKode(e1, null) || e1.message || 'Gagal menyimpan baris ini' });
      else tersimpan.push({ hasilAsli: x.h, data: d1 });
    }
  }

  if(skema.setelahBarisDisimpan){
    for(const t of tersimpan) await skema.setelahBarisDisimpan(t.hasilAsli, t.data);
  }
  if(tersimpan.length) skema.setelahSimpan(tersimpan.map(t => t.data));

  const jumlahDitolakValidasi = IMPOR_STATE.hasil.filter(h => !h.ok).length;
  const totalGagal = gagal.length + jumlahDitolakValidasi;

  if(tersimpan.length){
    await catatAktivitas(skema.tipeAktivitas, `Import CSV: ${tersimpan.length} ${escB(skema.labelSatuan)} baru ditambahkan`);
  }
  tampilkanToast(
    tersimpan.length
      ? `${tersimpan.length} data berhasil diimport${totalGagal ? ', ' + totalGagal + ' gagal' : ''}`
      : 'Tidak ada data yang berhasil diimport',
    tersimpan.length === 0
  );

  const daftarErrorGagalSimpan = gagal.map(g => `<li>Baris ${g.nomorBaris}: ${esc(g.pesan)}</li>`).join('');
  document.getElementById('wrap-hasil-import').innerHTML = `
    <div class="impor-hasil-box">
      <div class="impor-ringkasan" style="margin-bottom:${totalGagal ? '8px':'0'};">
        <span class="impor-badge ok">${tersimpan.length} berhasil disimpan</span>
        ${totalGagal ? `<span class="impor-badge error">${totalGagal} gagal</span>` : ''}
      </div>
      ${daftarErrorGagalSimpan ? `<ul class="impor-error-list">${daftarErrorGagalSimpan}</ul>` : ''}
    </div>`;
  document.getElementById('wrap-hasil-import').classList.remove('hidden');
  document.getElementById('wrap-preview-import').classList.add('hidden');
  btn.textContent = 'Mulai Import';
  btn.disabled = true;
  document.getElementById('input-file-import').value = '';
}

/* ===================== ENHANCER: KARTU TABEL DI MOBILE =====================
   Menambahkan atribut data-label ke setiap <td> berdasarkan teks <th> yang
   sepadan, supaya CSS (lihat style.css @media max-width:760px) bisa menyusun
   tiap baris tabel sebagai kartu "label: nilai" di layar kecil. Dipasang lewat
   MutationObserver supaya otomatis berlaku ke SEMUA tabel .data-table di
   aplikasi (Pelanggan, Proyek, Tugas, Gudang, dll) — tidak perlu menyentuh
   setiap fungsi renderXxx() satu per satu. */
function terapkanLabelTabelResponsif(root){
  (root || document).querySelectorAll('.data-table').forEach(table => {
    const headThs = table.querySelectorAll('thead th');
    if(!headThs.length) return;
    const label = Array.from(headThs).map(th => th.textContent.trim());
    table.querySelectorAll('tbody tr').forEach(tr => {
      Array.from(tr.children).forEach((td, i) => {
        if(td.colSpan && td.colSpan > 1) return; // baris "tidak ada data" dsb — biarkan tampil apa adanya
        if(label[i] !== undefined && td.getAttribute('data-label') !== label[i]){
          td.setAttribute('data-label', label[i]);
        }
      });
    });
  });
}
(function(){
  let timeoutId = null;
  const observer = new MutationObserver(() => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => terapkanLabelTabelResponsif(document), 60);
  });
  document.addEventListener('DOMContentLoaded', () => {
    terapkanLabelTabelResponsif(document);
    observer.observe(document.body, { childList:true, subtree:true });
  });
})();

function mulai(){
  if(typeof supabaseClient === 'undefined'){
    tampilkanToast('config.js belum diatur. Lihat README.md', true);
    console.error('supabaseClient tidak ditemukan — pastikan config.js sudah diisi dan dimuat sebelum script.js');
    return;
  }
  sinkronkanUITema(); // samakan sakelar tema dengan data-theme yang sudah diterapkan di <head>
  muatBrandingPerusahaan(); // tidak perlu ditunggu — sidebar/layar masuk pakai fallback "Dealstack" dulu
  initAuthUI();
}

document.addEventListener('DOMContentLoaded', mulai);
