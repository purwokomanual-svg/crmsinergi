/* =========================================================
   DEALSTACK CRM — LOGIKA APLIKASI (script.js)
   Versi ini terhubung ke database Supabase (PostgreSQL).
   Semua data (pelanggan, proyek, tugas, aktivitas) dibaca
   dan ditulis langsung ke tabel Supabase lewat supabaseClient
   yang didefinisikan di config.js.
   ========================================================= */

/* Cache data di memori, diisi dari Supabase saat halaman dimuat
   dan diperbarui lagi setiap ada perubahan (tambah/hapus/ubah) */
let DATA = { pelanggan: [], proyek: [], tugas: [], aktivitas: [], catatan: [], profil: [], gudang: [], stokItem: [], riwayatStok: [], perusahaan: { nama_perusahaan: 'Dealstack', logo_url: null } };

/* Pengguna yang sedang login (diisi setelah autentikasi berhasil) */
let CURRENT_USER = null; // { id, nama, email, peran }
let APLIKASI_SUDAH_DIMUAT = false;

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
  renderNotifikasi();
  tampilkanToast('Pengaturan disimpan');
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
    tampilkanPesanAuth('daftar-msg', 'Akun dibuat, masuk otomatis...', false);
  } else {
    tampilkanPesanAuth('daftar-msg', 'Akun dibuat! Jika verifikasi email diaktifkan di project Anda, cek kotak masuk sebelum masuk.', false);
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

function terapkanPeran(){
  const isAdmin = CURRENT_USER && CURRENT_USER.peran === 'admin';
  document.querySelectorAll('[data-role="admin"]').forEach(el => {
    el.style.display = isAdmin ? '' : 'none';
  });
  document.getElementById('user-name').textContent = CURRENT_USER ? CURRENT_USER.nama : '—';
  document.getElementById('user-avatar').outerHTML = CURRENT_USER
    ? markupAvatar(CURRENT_USER).replace('class="user-avatar"', 'class="user-avatar" id="user-avatar"')
    : '<div class="user-avatar" id="user-avatar">?</div>';
  document.getElementById('panel-akun-nama').textContent = CURRENT_USER ? CURRENT_USER.nama : '—';
  document.getElementById('panel-akun-peran').textContent = isAdmin ? 'Administrator' : 'Anggota Tim';
}

/* Dipanggil sekali saat login berhasil: muat profil pengguna & seluruh data aplikasi */
async function masukKeAplikasi(session){
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  if(APLIKASI_SUDAH_DIMUAT) return;
  APLIKASI_SUDAH_DIMUAT = true;

  const { data: profil, error } = await supabaseClient.from('profil').select('*').eq('id', session.user.id).single();
  if(error || !profil){
    console.warn('Profil belum ditemukan (migrasi v3 mungkin belum dijalankan). Menggunakan data dasar dari akun.', error);
    CURRENT_USER = { id: session.user.id, nama: session.user.email.split('@')[0], email: session.user.email, peran: 'admin' };
  } else {
    CURRENT_USER = profil;
  }

  muatPengaturan();
  terapkanPeran();
  initNavigasi();
  initEventListener();
  await muatSemuaData();
  await muatBrandingPerusahaan();
  renderKPI();
  renderTagRingkasan();
  renderPelanggan();
  isiDropdownPelangganProyek();
  renderFunnel();
  renderAktivitas();
  renderTugas();
  renderPesan();
  renderNotifikasi();
  renderChart();
  renderStatGudang();
  if(CURRENT_USER.peran === 'admin'){ renderPengawasanTim(); renderPenggunaAdmin(); }
  initRealtime();
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
      document.getElementById('app-shell').classList.add('hidden');
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
  if(profil.avatar_url) return `<div class="user-avatar"><img src="${profil.avatar_url}" alt="${profil.nama || ''}"></div>`;
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
    html += pelanggan.map(p => `<div class="search-result-item" onclick="bukaHasilPencarian('pelanggan','${p.id}')"><b>${p.nama}</b><span>${p.industri || 'Umum'} · ${labelStatusPelanggan(p.status)}</span></div>`).join('');
  }
  if(proyek.length){
    html += `<div class="search-result-group">Proyek</div>`;
    html += proyek.map(p => `<div class="search-result-item" onclick="bukaHasilPencarian('proyek','${p.id}')"><b>${p.nama}</b><span>${p.pelanggan_nama} · ${labelStatusProyek(p.status)}</span></div>`).join('');
  }
  if(tugas.length){
    html += `<div class="search-result-group">Tugas</div>`;
    html += tugas.map(t => `<div class="search-result-item" onclick="bukaHasilPencarian('tugas','${t.id}')"><b>${t.judul}</b><span>${labelStatusKerja(statusKerjaTugas(t))}</span></div>`).join('');
  }
  if(stok.length){
    html += `<div class="search-result-group">Stock &amp; Gudang</div>`;
    html += stok.map(i => `<div class="search-result-item" onclick="bukaHasilPencarian('stok','${i.id}')"><b>${i.nama_produk} (${i.sku})</b><span>${namaGudang(i.gudang_id)} · ${labelStatusStok(hitungStatusStok(i))}</span></div>`).join('');
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
      bukaDetailPelanggan(proyek.pelanggan_id);
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
  DATA.proyek.forEach(p => {
    if(p.status === 'selesai' || p.status === 'dibatalkan') return;
    const sisa = hariMenujuTenggat(p.tenggat);
    if(sisa !== null && sisa <= 3){
      hasil.push({
        judul: sisa < 0 ? `Proyek "${p.nama}" telah lewat tenggat` : `Proyek "${p.nama}" jatuh tempo ${sisa === 0 ? 'hari ini' : 'dalam ' + sisa + ' hari'}`,
        meta: p.pelanggan_nama, urgent: sisa <= 0, urutan: sisa
      });
    }
  });
  DATA.tugas.filter(t => statusKerjaTugas(t) !== 'selesai').forEach(t => {
    const d = tenggatKeTanggal(t.tenggat);
    if(d){
      const sisa = hariMenujuTenggat(d.toISOString().slice(0,10));
      if(sisa !== null && sisa <= 3){
        hasil.push({ judul: `Tugas "${t.judul}" ${sisa < 0 ? 'terlambat' : (sisa===0?'jatuh tempo hari ini':'jatuh tempo dalam '+sisa+' hari')}`, meta: 'Tugas', urgent: sisa <= 0, urutan: sisa });
      }
    }
  });
  DATA.stokItem.filter(i => i.status !== 'nonaktif').forEach(i => {
    const status = hitungStatusStok(i);
    if(status === 'habis'){
      hasil.push({ judul: `Stok "${i.nama_produk}" (${i.sku}) di ${namaGudang(i.gudang_id)} habis`, meta: 'Stock & Gudang', urgent: true, urutan: -1 });
    } else if(status === 'menipis'){
      hasil.push({ judul: `Stok "${i.nama_produk}" (${i.sku}) di ${namaGudang(i.gudang_id)} menipis (sisa ${sisaStok(i)})`, meta: 'Stock & Gudang', urgent: false, urutan: 2 });
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
        <div><div class="notif-title">${n.judul}</div><div class="notif-meta">${n.meta}</div></div>
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
  const [pelanggan, proyek, tugas, aktivitas, catatan, profil, gudang, stokItem, riwayatStok] = await Promise.all([
    supabaseClient.from('pelanggan').select('*').order('dibuat_pada', { ascending: false }),
    supabaseClient.from('proyek').select('*').order('dibuat_pada', { ascending: false }),
    supabaseClient.from('tugas').select('*').order('dibuat_pada', { ascending: false }),
    supabaseClient.from('aktivitas').select('*').order('dibuat_pada', { ascending: false }).limit(80),
    supabaseClient.from('catatan_tim').select('*').order('dibuat_pada', { ascending: false }),
    supabaseClient.from('profil').select('*').order('nama', { ascending: true }),
    supabaseClient.from('gudang').select('*').order('nama', { ascending: true }),
    supabaseClient.from('stok_item').select('*').order('nama_produk', { ascending: true }),
    supabaseClient.from('riwayat_stok').select('*').order('dibuat_pada', { ascending: false }),
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
    : namaView === 'stok-keluar-detail' ? 'gudang'
    : namaView;
  document.querySelectorAll('.nav-item[data-view]').forEach(el => {
    el.classList.toggle('active', el.dataset.view === namaViewNav);
  });
  tutupSidebarMobile();
  if(namaView === 'ringkasan'){ renderChart(); renderTagRingkasan(); }
  if(namaView === 'pelanggan-detail') renderDetailPelanggan();
  if(namaView === 'kalender') renderKalender();
  if(namaView === 'gudang') renderGudang();
  if(namaView === 'stok-keluar-detail') renderDetailStokKeluar();
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
function renderKPI(){
  const proyekAktif = DATA.proyek.filter(p => p.status !== 'dibatalkan');
  const totalNilai = proyekAktif.reduce((s,p) => s + Number(p.nilai), 0);
  const rataRata = proyekAktif.length ? totalNilai / proyekAktif.length : 0;
  const selesai = DATA.proyek.filter(p => p.status === 'selesai').length;
  const dibatalkan = DATA.proyek.filter(p => p.status === 'dibatalkan').length;
  const totalDitutup = selesai + dibatalkan;
  const winRate = totalDitutup ? Math.round((selesai/totalDitutup)*100) : 0;
  const jumlahProyek = DATA.proyek.length;

  document.getElementById('kpi-total-nilai').textContent = formatRupiah(totalNilai);
  document.getElementById('kpi-rata-rata').textContent = formatRupiah(Math.round(rataRata));
  document.getElementById('kpi-win-rate').textContent = winRate + '%';
  document.getElementById('kpi-jumlah-proyek').textContent = jumlahProyek;
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
      ['Total Nilai Proyek Aktif', DATA.proyek.filter(p=>p.status!=='dibatalkan').reduce((s,p)=>s+Number(p.nilai),0)],
    ]);
  tampilkanToast('Ringkasan diunduh');
}
function unduhLaporanCSV(){
  unduhCSV('laporan-proyek-dealstack.csv',
    ['Kode','Nama Proyek','Pelanggan','Status','Progres (%)','Nilai (Rp)','Tenggat'],
    DATA.proyek.map(p => [p.kode, p.nama, p.pelanggan_nama, labelStatusProyek(p.status), p.progres, p.nilai, p.tenggat || '']));
  tampilkanToast('Laporan diunduh');
}

/* ---------------------------------------------------------
   5. RENDER: TABEL PELANGGAN
--------------------------------------------------------- */
function hitungTotalNilaiProyek(pelangganId, filterStatus){
  return DATA.proyek
    .filter(pr => pr.pelanggan_id === pelangganId && (filterStatus === 'semua' || pr.status === filterStatus))
    .reduce((total, pr) => total + (pr.nilai || 0), 0);
}

function renderPelanggan(){
  const tbody = document.getElementById('tbody-pelanggan');
  const q = (document.getElementById('cari-pelanggan').value || '').toLowerCase();
  const filterNilaiProyek = document.getElementById('filter-nilai-proyek-pelanggan').value;

  const data = DATA.pelanggan.filter(p => {
    return p.nama.toLowerCase().includes(q) || (p.industri || '').toLowerCase().includes(q);
  });

  if(!data.length){
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">
      <p>Tidak ada pelanggan yang cocok dengan pencarian.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(p => `
    <tr>
      <td class="cell-muted">${p.kode}</td>
      <td class="cell-name"><span class="cell-link" title="Lihat proyek pelanggan ini" onclick="bukaDetailPelanggan('${p.id}')">${p.nama}</span></td>
      <td>${p.industri || '—'}</td>
      <td>${p.alamat || '—'}</td>
      <td>${p.no_telepon || '—'}</td>
      <td>${p.no_whatsapp || '—'}</td>
      <td>${p.nama_pic || '—'}</td>
      <td>${formatRupiah(hitungTotalNilaiProyek(p.id, filterNilaiProyek))}</td>
      <td class="cell-actions">
        <div class="icon-btn" title="Edit" onclick="editPelanggan('${p.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </div>
        <div class="icon-btn" title="Hapus" onclick="hapusPelanggan('${p.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>
        </div>
      </td>
    </tr>
  `).join('');
}

async function hapusPelanggan(id){
  const p = DATA.pelanggan.find(x => x.id === id);
  const { error } = await supabaseClient.from('pelanggan').delete().eq('id', id);
  if(error){ console.error(error); tampilkanToast('Gagal menghapus pelanggan', true); return; }
  DATA.pelanggan = DATA.pelanggan.filter(x => x.id !== id);
  renderPelanggan();
  isiDropdownPelangganProyek();
  if(p) await catatAktivitas('pelanggan', `Pelanggan <b>${p.nama}</b> dihapus`);
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
  if(cari) cari.value = '';
  if(filter) filter.value = 'semua';
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

  const proyekPelanggan = DATA.proyek.filter(pr => pr.pelanggan_id === PELANGGAN_AKTIF_ID);
  document.getElementById('detail-pelanggan-jumlah-proyek').textContent = proyekPelanggan.length + ' Proyek';
  document.getElementById('detail-pelanggan-total-nilai').textContent = 'Total Nilai: ' + formatRupiah(hitungTotalNilaiProyek(PELANGGAN_AKTIF_ID, 'semua'));

  renderProyekDetail();
}

/* Panggil setelah data proyek berubah (tambah/edit/hapus) supaya header
   & tabel di halaman detail ikut ter-update, hanya jika sedang dibuka */
function segarkanDetailPelangganJikaAktif(){
  if(PELANGGAN_AKTIF_ID) renderDetailPelanggan();
}

function renderProyekDetail(){
  const tbody = document.getElementById('tbody-proyek-detail');
  if(!tbody || !PELANGGAN_AKTIF_ID) return;
  const q = (document.getElementById('cari-proyek-detail').value || '').toLowerCase();
  const filterStatus = document.getElementById('filter-status-proyek-detail').value;

  const data = DATA.proyek.filter(p => {
    if(p.pelanggan_id !== PELANGGAN_AKTIF_ID) return false;
    const cocokCari = p.nama.toLowerCase().includes(q) || (p.kode||'').toLowerCase().includes(q);
    const cocokStatus = filterStatus === 'semua' || p.status === filterStatus;
    return cocokCari && cocokStatus;
  });

  if(!data.length){
    tbody.innerHTML = `<tr><td colspan="12"><div class="empty-state">
      <p>Belum ada proyek untuk pelanggan ini.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(p => {
    const persenBudget = hitungPersenBudget(p.budget_terpakai, p.total_budget);
    return `
    <tr>
      <td class="cell-name">${p.kode}<div class="cell-muted">${p.nama}</div></td>
      <td class="cell-muted">${formatTanggal(p.tanggal)}</td>
      <td class="cell-muted">${formatTanggal(p.tenggat)}</td>
      <td class="cell-muted">${p.dibuat_oleh_nama || '—'}</td>
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
  renderKPI();
  renderFunnel();
  renderPelanggan();
  if(p) await catatAktivitas('proyek', `Proyek <b>${p.nama}</b> dihapus`);
  tampilkanToast('Proyek dihapus');
}

function isiDropdownPelangganProyek(){
  const select = document.getElementById('input-pelanggan-proyek');
  if(!select) return;
  const nilaiSebelumnya = select.value;
  select.disabled = false;
  select.innerHTML = `<option value="" disabled ${!nilaiSebelumnya ? 'selected' : ''}>Pilih pelanggan...</option>` +
    DATA.pelanggan.map(p => `<option value="${p.id}">${p.nama}</option>`).join('');
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

/* Dipanggil dari tombol "Tambah Proyek" di halaman detail pelanggan —
   sama seperti bukaModalTambahProyek(), tapi field Nama Pelanggan
   otomatis diisi & dikunci ke pelanggan yang sedang dibuka. */
function bukaModalTambahProyekUntukPelangganAktif(){
  if(!PELANGGAN_AKTIF_ID) return;
  bukaModalTambahProyek();
  const select = document.getElementById('input-pelanggan-proyek');
  select.value = PELANGGAN_AKTIF_ID;
  select.disabled = true;
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
      total_budget, budget_terpakai, nilai: grand_total
    };
    const { data, error } = await supabaseClient.from('proyek').update(baris).eq('id', id).select().single();
    if(error){ console.error(error); tampilkanToast(pesanErrorKode(error, 'No PO') || 'Gagal menyimpan perubahan proyek', true); return; }

    const idx = DATA.proyek.findIndex(x => x.id === id);
    if(idx > -1) DATA.proyek[idx] = data;
    segarkanDetailPelangganJikaAktif(); renderKPI(); renderFunnel(); renderPelanggan();
    await catatAktivitas('proyek', `Proyek <b>${nama}</b> (${data.kode}) diperbarui`);
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
      total_budget, budget_terpakai, nilai: grand_total
    };
    const { data, error } = await supabaseClient.from('proyek').insert(baris).select().single();
    if(error){ console.error(error); tampilkanToast(pesanErrorKode(error, 'No PO') || 'Gagal menambah proyek', true); return; }

    DATA.proyek.unshift(data);
    segarkanDetailPelangganJikaAktif(); renderKPI(); renderFunnel(); renderPelanggan();
    await catatAktivitas('proyek', `Proyek baru <b>${nama}</b> (${data.kode}) dibuat untuk ${pelanggan.nama}`);
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
  const totalNilaiSemua = DATA.proyek.reduce((s,p) => s + Number(p.nilai), 0) || 1;

  const wrap = document.getElementById('funnel-wrap');
  wrap.innerHTML = tahapan.map(t => {
    const proyekTahap = DATA.proyek.filter(p => p.status === t.key);
    const nilai = proyekTahap.reduce((s,p) => s + Number(p.nilai), 0);
    const pct = Math.max(6, Math.round((nilai/totalNilaiSemua)*100));
    return `
      <div class="funnel-row">
        <div class="funnel-name">${t.nama}</div>
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

  const data = DATA.aktivitas.filter(a => {
    const cocokTipe = filterTipe === 'semua' || a.tipe === filterTipe;
    const cocokCari = !q || a.teks.toLowerCase().includes(q) || (a.pelaku_nama || '').toLowerCase().includes(q);
    return cocokTipe && cocokCari;
  });

  if(!data.length){
    wrap.innerHTML = `<div class="empty-state"><p>Tidak ada aktivitas yang cocok.</p></div>`;
    return;
  }
  wrap.innerHTML = data.map(a => `
    <div class="timeline-item">
      <div class="timeline-dot">${ikonAktivitas[a.tipe] || ikonAktivitas.proyek}</div>
      <div class="timeline-body">
        <div class="timeline-title">${a.teks}</div>
        <div class="timeline-meta">${waktuRelatif(a.dibuat_pada)}${a.pelaku_nama ? ' · oleh ' + a.pelaku_nama : ''}</div>
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

  // Isi ulang opsi filter anggota berdasarkan profil yang tersedia
  const opsiSaatIni = filterAssignee.value;
  filterAssignee.innerHTML = '<option value="semua">Semua Anggota</option>' +
    DATA.profil.map(p => `<option value="${p.id}">${p.nama}</option>`).join('') +
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
      <td class="cell-name">${t.judul}${t.deskripsi ? `<div class="cell-muted">${t.deskripsi}</div>` : ''}</td>
      <td>
        <div class="assignee-cell">
          ${isAdmin ? `
          <select class="filter-select" style="font-size:12px;padding:5px 8px;" onchange="ubahAssigneeTugas('${t.id}', this.value)">
            <option value="">Belum ditugaskan</option>
            ${DATA.profil.map(p => `<option value="${p.id}" ${p.id===t.ditugaskan_ke?'selected':''}>${p.nama}</option>`).join('')}
          </select>` : (assignee ? `${markupAvatar(assignee)}<span>${assignee.nama}</span>` : `<span class="cell-muted">Belum ditugaskan</span>`)}
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
    DATA.profil.map(p => `<option value="${p.id}">${p.nama}</option>`).join('');
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
  renderNotifikasi();
  if(CURRENT_USER && CURRENT_USER.peran === 'admin') renderPengawasanTim();
  await catatAktivitas('tugas', `Status tugas <b>${t.judul}</b> diubah menjadi ${labelStatusKerja(statusBaru)}`);
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
  if(CURRENT_USER && CURRENT_USER.peran === 'admin') renderPengawasanTim();
  const namaBaru = DATA.profil.find(p => p.id === assigneeBaru)?.nama;
  await catatAktivitas('tugas', `Tugas <b>${t.judul}</b> ditugaskan ulang ke ${namaBaru || 'tidak ada (dilepas)'}`);
  tampilkanToast('Tugas ditugaskan ulang');
}

async function hapusTugas(id){
  const t = DATA.tugas.find(x => x.id === id);
  const { error } = await supabaseClient.from('tugas').delete().eq('id', id);
  if(error){ console.error(error); tampilkanToast('Gagal menghapus tugas', true); return; }
  DATA.tugas = DATA.tugas.filter(x => x.id !== id);
  renderTugas();
  if(CURRENT_USER && CURRENT_USER.peran === 'admin') renderPengawasanTim();
  if(t) await catatAktivitas('tugas', `Tugas <b>${t.judul}</b> dihapus`);
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

function isiDropdownGudang(){
  // Dropdown gudang di form Tambah/Edit Item
  const selForm = document.getElementById('input-gudang-item-stok');
  if(selForm){
    const nilaiSaatIni = selForm.value;
    selForm.innerHTML = '<option value="" disabled>Pilih gudang...</option>' +
      DATA.gudang.map(g => `<option value="${g.id}">${g.nama}</option>`).join('');
    if(nilaiSaatIni) selForm.value = nilaiSaatIni;
  }
  // Filter gudang di toolbar menu Stock & Gudang
  const selFilter = document.getElementById('filter-lokasi-gudang');
  if(selFilter){
    const nilaiSaatIni = selFilter.value || 'semua';
    selFilter.innerHTML = '<option value="semua">Semua Gudang</option>' +
      DATA.gudang.map(g => `<option value="${g.id}">${g.nama}</option>`).join('');
    selFilter.value = nilaiSaatIni;
  }
}
function isiDropdownKategoriGudang(){
  const sel = document.getElementById('filter-kategori-gudang');
  if(!sel) return;
  const nilaiSaatIni = sel.value || 'semua';
  const kategoriUnik = [...new Set(DATA.stokItem.map(i => i.kategori || 'Umum'))].sort();
  sel.innerHTML = '<option value="semua">Semua Kategori</option>' +
    kategoriUnik.map(k => `<option value="${k}">${k}</option>`).join('');
  sel.value = nilaiSaatIni;
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
  wrap.innerHTML = `
    <div class="stat-mini-card">
      <span class="stat-mini-label">Total Item (SKU x Gudang)</span>
      <span class="stat-mini-value">${items.length}</span>
    </div>
    <div class="stat-mini-card">
      <span class="stat-mini-label">Jumlah Gudang</span>
      <span class="stat-mini-value">${DATA.gudang.length}</span>
    </div>
    <div class="stat-mini-card ${jumlahMenipis ? 'warn' : 'ok'}">
      <span class="stat-mini-label">Stok Menipis</span>
      <span class="stat-mini-value">${jumlahMenipis}</span>
    </div>
    <div class="stat-mini-card ${jumlahHabis ? 'danger' : 'ok'}">
      <span class="stat-mini-label">Stok Habis</span>
      <span class="stat-mini-value">${jumlahHabis}</span>
    </div>`;
}

function renderGudang(){
  isiDropdownGudang();
  isiDropdownKategoriGudang();
  renderStatGudang();
  const tbody = document.getElementById('tbody-gudang');
  if(!tbody) return;
  const isAdmin = CURRENT_USER && CURRENT_USER.peran === 'admin';
  const q = (document.getElementById('cari-gudang').value || '').toLowerCase();
  const filterGudang = document.getElementById('filter-lokasi-gudang').value;
  const filterKategori = document.getElementById('filter-kategori-gudang').value;
  const filterStatus = document.getElementById('filter-status-gudang').value;

  const data = DATA.stokItem.filter(i => {
    const cocokCari = i.sku.toLowerCase().includes(q) || i.nama_produk.toLowerCase().includes(q) || (i.variant || '').toLowerCase().includes(q);
    const cocokGudang = filterGudang === 'semua' || i.gudang_id === filterGudang;
    const cocokKategori = filterKategori === 'semua' || (i.kategori || 'Umum') === filterKategori;
    const cocokStatus = filterStatus === 'semua' || hitungStatusStok(i) === filterStatus;
    return cocokCari && cocokGudang && cocokKategori && cocokStatus;
  });

  if(!data.length){
    tbody.innerHTML = `<tr><td colspan="12"><div class="empty-state"><p>Tidak ada item stok yang cocok.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(i => {
    const status = hitungStatusStok(i);
    return `
    <tr>
      <td class="cell-muted">${i.sku}</td>
      <td class="cell-name">${i.nama_produk}</td>
      <td>${i.variant || '—'}</td>
      <td>${i.kategori || 'Umum'}</td>
      <td>${namaGudang(i.gudang_id)}</td>
      <td>${(i.stok_masuk || 0).toLocaleString('id-ID')}</td>
      <td><span class="cell-link" title="Lihat detail stok keluar produk ini" onclick="bukaDetailStokKeluar('${i.id}')">${(i.stok_keluar || 0).toLocaleString('id-ID')}</span></td>
      <td><b>${sisaStok(i).toLocaleString('id-ID')}</b></td>
      <td class="cell-muted">${i.diupdate_pada ? waktuRelatif(i.diupdate_pada) : '—'}</td>
      <td class="cell-muted">${i.diupdate_oleh_nama || '—'}</td>
      <td><span class="stok-status stok-status--${status}">${labelStatusStok(status)}</span></td>
      <td class="cell-actions">
        <div class="icon-btn btn-tambah-stok" title="Tambah Stok" onclick="bukaModalTambahStok('${i.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>
        </div>
        <div class="icon-btn" title="Edit" onclick="editItemStok('${i.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </div>
        ${isAdmin ? `<div class="icon-btn" title="Hapus" onclick="hapusItemStok('${i.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>
        </div>` : ''}
      </td>
    </tr>`;
  }).join('');
}

function bukaModalTambahItemStok(){
  if(!DATA.gudang.length){
    tampilkanToast('Tambah gudang terlebih dahulu lewat "Kelola Gudang"', true);
    return;
  }
  document.getElementById('form-item-stok').reset();
  document.getElementById('input-id-item-stok').value = '';
  document.getElementById('input-status-item-stok').value = 'aktif';
  document.getElementById('input-satuan-item-stok').value = 'Pcs';
  document.getElementById('wrap-stok-awal-item-stok').style.display = '';
  document.getElementById('input-stok-awal-item-stok').disabled = false;
  document.getElementById('catatan-modal-item-stok').innerHTML = 'Stok Minimum dipakai sistem untuk otomatis menandai status "Stok Menipis". Setelah item dibuat, ubah jumlah stok lewat tombol <b>Tambah Stok</b> di tabel agar riwayat pergerakan stok tetap tercatat.';
  document.getElementById('judul-modal-item-stok').textContent = 'Tambah Item Stok';
  document.getElementById('btn-simpan-item-stok').textContent = 'Simpan Item';
  isiDropdownGudang();
  bukaModal('modal-item-stok');
}

function editItemStok(id){
  const i = DATA.stokItem.find(x => x.id === id);
  if(!i) return;
  isiDropdownGudang();
  document.getElementById('input-id-item-stok').value = i.id;
  document.getElementById('input-gudang-item-stok').value = i.gudang_id;
  document.getElementById('input-sku-item-stok').value = i.sku || '';
  document.getElementById('input-kategori-item-stok').value = i.kategori || '';
  document.getElementById('input-nama-item-stok').value = i.nama_produk || '';
  document.getElementById('input-variant-item-stok').value = i.variant || '';
  document.getElementById('input-stok-minimum-item-stok').value = i.stok_minimum || 0;
  document.getElementById('input-satuan-item-stok').value = i.satuan || 'Pcs';
  document.getElementById('input-status-item-stok').value = i.status || 'aktif';
  // Stok Masuk/Keluar hanya bisa diubah lewat "Tambah Stok" (menjaga riwayat tetap akurat)
  document.getElementById('wrap-stok-awal-item-stok').style.display = 'none';
  document.getElementById('catatan-modal-item-stok').innerHTML = `Sisa stok saat ini: <b>${sisaStok(i).toLocaleString('id-ID')}</b>. Gunakan tombol <b>Tambah Stok</b> di tabel untuk mencatat stok masuk/keluar baru — bukan lewat form ini.`;
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
  const stok_minimum = Number(document.getElementById('input-stok-minimum-item-stok').value) || 0;
  const satuan = document.getElementById('input-satuan-item-stok').value.trim() || 'Pcs';
  const status = document.getElementById('input-status-item-stok').value;
  if(!gudang_id || !sku || !nama_produk) return;

  const diupdate_oleh_id = CURRENT_USER ? CURRENT_USER.id : null;
  const diupdate_oleh_nama = CURRENT_USER ? CURRENT_USER.nama : null;

  if(id){
    // --- mode edit: hanya metadata, jumlah stok tidak diubah dari sini ---
    const baris = { gudang_id, sku, nama_produk, variant, kategori, stok_minimum, satuan, status, diupdate_oleh_id, diupdate_oleh_nama, diupdate_pada: new Date().toISOString() };
    const { data, error } = await supabaseClient.from('stok_item').update(baris).eq('id', id).select().single();
    if(error){ console.error(error); tampilkanToast(pesanErrorKode(error, 'SKU pada gudang ini') || 'Gagal menyimpan perubahan item', true); return; }
    const idx = DATA.stokItem.findIndex(x => x.id === id);
    if(idx > -1) DATA.stokItem[idx] = data;
    renderGudang();
    await catatAktivitas('gudang', `Item stok <b>${nama_produk}</b> (${sku}) diperbarui`);
    tutupModal('modal-item-stok');
    tampilkanToast('Perubahan item stok disimpan');
  } else {
    // --- mode tambah ---
    const stokAwal = Number(document.getElementById('input-stok-awal-item-stok').value) || 0;
    const baris = { gudang_id, sku, nama_produk, variant, kategori, stok_minimum, satuan, status, stok_masuk: stokAwal, stok_keluar: 0, diupdate_oleh_id, diupdate_oleh_nama };
    const { data, error } = await supabaseClient.from('stok_item').insert(baris).select().single();
    if(error){ console.error(error); tampilkanToast(pesanErrorKode(error, 'SKU pada gudang ini') || 'Gagal menambah item stok', true); return; }
    DATA.stokItem.unshift(data);
    if(stokAwal > 0){
      await supabaseClient.from('riwayat_stok').insert({ item_id: data.id, tipe: 'masuk', jumlah: stokAwal, catatan: 'Stok awal saat item dibuat', dibuat_oleh_id: diupdate_oleh_id, dibuat_oleh_nama: diupdate_oleh_nama });
    }
    renderGudang();
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
  if(i) await catatAktivitas('gudang', `Item stok <b>${i.nama_produk}</b> (${i.sku}) dihapus`);
  tampilkanToast('Item stok dihapus');
}

function bukaModalTambahStok(id){
  const i = DATA.stokItem.find(x => x.id === id);
  if(!i) return;
  document.getElementById('form-tambah-stok').reset();
  document.getElementById('input-id-item-tambah-stok').value = id;
  document.getElementById('info-item-tambah-stok').innerHTML = `<b>${i.nama_produk}</b> (${i.sku}) · ${namaGudang(i.gudang_id)} — Sisa stok saat ini: <b>${sisaStok(i).toLocaleString('id-ID')}</b>`;
  bukaModal('modal-tambah-stok');
}

/* Modal ini sekarang khusus mencatat Stok Masuk (mis. pembelian/retur).
   Stok Keluar dicatat lewat halaman detail (lihat bagian 17c di bawah)
   supaya setiap pengiriman selalu punya No DO/Pelanggan/No PO/Proyek. */
async function simpanTambahStok(e){
  e.preventDefault();
  const id = document.getElementById('input-id-item-tambah-stok').value;
  const i = DATA.stokItem.find(x => x.id === id);
  if(!i) return;
  const jumlah = Number(document.getElementById('input-jumlah-tambah-stok').value);
  const catatan = document.getElementById('input-catatan-tambah-stok').value.trim() || null;
  if(!jumlah || jumlah <= 0) return;

  const diupdate_oleh_id = CURRENT_USER ? CURRENT_USER.id : null;
  const diupdate_oleh_nama = CURRENT_USER ? CURRENT_USER.nama : null;
  const baris = { stok_masuk: (i.stok_masuk || 0) + jumlah, diupdate_oleh_id, diupdate_oleh_nama, diupdate_pada: new Date().toISOString() };

  const { data, error } = await supabaseClient.from('stok_item').update(baris).eq('id', id).select().single();
  if(error){ console.error(error); tampilkanToast('Gagal mencatat stok masuk', true); return; }

  const { data: riwayat, error: errRiwayat } = await supabaseClient.from('riwayat_stok')
    .insert({ item_id: id, tipe: 'masuk', tanggal: new Date().toISOString().slice(0,10), jumlah, catatan, satuan: i.satuan || 'Pcs', dibuat_oleh_id: diupdate_oleh_id, dibuat_oleh_nama: diupdate_oleh_nama })
    .select().single();
  if(!errRiwayat && riwayat) DATA.riwayatStok.unshift(riwayat);

  const idx = DATA.stokItem.findIndex(x => x.id === id);
  if(idx > -1) DATA.stokItem[idx] = data;
  renderGudang();
  await catatAktivitas('gudang', `Stok masuk <b>${jumlah.toLocaleString('id-ID')}</b> dicatat untuk <b>${i.nama_produk}</b> (${i.sku})`);
  tutupModal('modal-tambah-stok');
  tampilkanToast('Stok masuk dicatat');
  e.target.reset();
}

/* ---------------------------------------------------------
   17c. DETAIL STOK KELUAR (per item, dibuka dari klik angka
   Stok Keluar pada tabel Stock & Gudang). Setiap baris riwayat
   di sini adalah satu pengiriman keluar, lengkap dengan No DO,
   Pelanggan, No PO, Proyek, Qty, Satuan, dan Catatan.
--------------------------------------------------------- */
let STOK_ITEM_AKTIF_ID = null; // id item stok yang sedang dibuka di halaman detail

function bukaDetailStokKeluar(itemId){
  STOK_ITEM_AKTIF_ID = itemId;
  const cari = document.getElementById('cari-stok-keluar-detail');
  if(cari) cari.value = '';
  pindahTampilan('stok-keluar-detail');
}

function renderDetailStokKeluar(){
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

  renderTabelStokKeluarDetail();
}

function renderTabelStokKeluarDetail(){
  const tbody = document.getElementById('tbody-stok-keluar-detail');
  if(!tbody || !STOK_ITEM_AKTIF_ID) return;
  const isAdmin = CURRENT_USER && CURRENT_USER.peran === 'admin';
  const q = (document.getElementById('cari-stok-keluar-detail').value || '').toLowerCase();

  const data = DATA.riwayatStok.filter(r => {
    if(r.item_id !== STOK_ITEM_AKTIF_ID || r.tipe !== 'keluar') return false;
    if(!q) return true;
    const gabungan = [r.no_do, r.pelanggan_nama, r.no_po, r.proyek_nama, r.catatan].filter(Boolean).join(' ').toLowerCase();
    return gabungan.includes(q);
  }).sort((a,b) => (b.tanggal || '').localeCompare(a.tanggal || '') || (b.dibuat_pada || '').localeCompare(a.dibuat_pada || ''));

  if(!data.length){
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">
      <p>Belum ada riwayat stok keluar untuk produk ini.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(r => `
    <tr>
      <td class="cell-muted">${formatTanggal(r.tanggal)}</td>
      <td>${r.no_do || '—'}</td>
      <td>${r.pelanggan_nama || '—'}</td>
      <td>${r.no_po || '—'}</td>
      <td>${r.proyek_nama || '—'}</td>
      <td><b>${Number(r.jumlah || 0).toLocaleString('id-ID')}</b></td>
      <td>${r.satuan || '—'}</td>
      <td class="cell-muted">${r.catatan || '—'}</td>
      <td class="cell-actions">
        <div class="icon-btn" title="Edit" onclick="editStokKeluar('${r.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </div>
        ${isAdmin ? `<div class="icon-btn" title="Hapus" onclick="hapusStokKeluar('${r.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>
        </div>` : ''}
      </td>
    </tr>
  `).join('');
}

/* Isi dropdown Nama Pelanggan di form Tambah/Edit Stok Keluar */
function isiDropdownPelangganStokKeluar(pelangganIdTerpilih){
  const select = document.getElementById('input-pelanggan-stok-keluar');
  if(!select) return;
  select.innerHTML = `<option value="">— Tanpa pelanggan terdaftar —</option>` +
    DATA.pelanggan.map(p => `<option value="${p.id}">${p.nama}</option>`).join('') +
    `<option value="__manual__">✏️ Ketik nama pelanggan lain...</option>`;
  select.value = pelangganIdTerpilih || '';
}

/* Isi dropdown Nama Proyek, difilter per pelanggan yang sedang dipilih (jika ada) */
function isiDropdownProyekStokKeluar(pelangganId, proyekIdTerpilih){
  const select = document.getElementById('input-proyek-stok-keluar');
  if(!select) return;
  const daftar = pelangganId ? DATA.proyek.filter(p => p.pelanggan_id === pelangganId) : DATA.proyek;
  select.innerHTML = `<option value="">— Tanpa proyek/PO —</option>` +
    daftar.map(p => `<option value="${p.id}">${p.nama} (${p.kode})</option>`).join('') +
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
  document.getElementById('input-no-po-stok-keluar').readOnly = false;
  document.getElementById('wrap-pelanggan-manual-stok-keluar').classList.add('hidden');
  document.getElementById('wrap-proyek-manual-stok-keluar').classList.add('hidden');
  isiDropdownPelangganStokKeluar('');
  isiDropdownProyekStokKeluar(null);
  document.getElementById('info-item-stok-keluar').innerHTML = `<b>${i.nama_produk}</b> (${i.sku}) · ${namaGudang(i.gudang_id)} — Sisa stok saat ini: <b>${sisaStok(i).toLocaleString('id-ID')} ${i.satuan || 'Pcs'}</b>`;
  document.getElementById('judul-modal-stok-keluar').textContent = 'Tambah Stok Keluar';
  document.getElementById('btn-simpan-stok-keluar').textContent = 'Simpan Stok Keluar';
  bukaModal('modal-stok-keluar');
}

function editStokKeluar(riwayatId){
  const r = DATA.riwayatStok.find(x => x.id === riwayatId);
  const i = DATA.stokItem.find(x => x.id === STOK_ITEM_AKTIF_ID);
  if(!r || !i) return;
  document.getElementById('form-stok-keluar').reset();
  document.getElementById('input-id-riwayat-stok-keluar').value = r.id;
  document.getElementById('input-tanggal-stok-keluar').value = r.tanggal || new Date().toISOString().slice(0,10);
  document.getElementById('input-no-do-stok-keluar').value = r.no_do || '';
  document.getElementById('input-qty-stok-keluar').value = r.jumlah || '';
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

  document.getElementById('info-item-stok-keluar').innerHTML = `<b>${i.nama_produk}</b> (${i.sku}) · ${namaGudang(i.gudang_id)} — Sisa stok saat ini: <b>${sisaStok(i).toLocaleString('id-ID')} ${i.satuan || 'Pcs'}</b>`;
  document.getElementById('judul-modal-stok-keluar').textContent = 'Edit Stok Keluar';
  document.getElementById('btn-simpan-stok-keluar').textContent = 'Simpan Perubahan';
  bukaModal('modal-stok-keluar');
}

async function simpanStokKeluar(e){
  e.preventDefault();
  const i = DATA.stokItem.find(x => x.id === STOK_ITEM_AKTIF_ID);
  if(!i) return;
  const idRiwayat = document.getElementById('input-id-riwayat-stok-keluar').value;
  const tanggal = document.getElementById('input-tanggal-stok-keluar').value || new Date().toISOString().slice(0,10);
  const no_do = document.getElementById('input-no-do-stok-keluar').value.trim() || null;
  const qty = Number(document.getElementById('input-qty-stok-keluar').value);
  const satuan = document.getElementById('input-satuan-stok-keluar').value.trim() || i.satuan || 'Pcs';
  const catatan = document.getElementById('input-catatan-stok-keluar').value.trim() || null;
  if(!qty || qty <= 0) return;

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
  const barisRiwayat = { tanggal, no_do, pelanggan_id, pelanggan_nama, no_po, proyek_id, proyek_nama, jumlah: qty, satuan, catatan };

  if(idRiwayat){
    // --- mode edit ---
    const { data, error } = await supabaseClient.from('riwayat_stok').update(barisRiwayat).eq('id', idRiwayat).select().single();
    if(error){ console.error(error); tampilkanToast(pesanErrorKode(error) || 'Gagal menyimpan perubahan stok keluar. Pastikan migrasi v11 di schema.sql sudah dijalankan.', true); return; }
    const idx = DATA.riwayatStok.findIndex(x => x.id === idRiwayat);
    if(idx > -1) DATA.riwayatStok[idx] = data;
  } else {
    // --- mode tambah ---
    const { data, error } = await supabaseClient.from('riwayat_stok')
      .insert({ item_id: i.id, tipe: 'keluar', dibuat_oleh_id: pelaku_id, dibuat_oleh_nama: pelaku_nama, ...barisRiwayat })
      .select().single();
    if(error){ console.error(error); tampilkanToast(pesanErrorKode(error) || 'Gagal menambah stok keluar. Pastikan migrasi v11 di schema.sql sudah dijalankan.', true); return; }
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

  renderDetailStokKeluar();
  renderGudang();
  await catatAktivitas('gudang', `Stok keluar <b>${qty.toLocaleString('id-ID')} ${satuan}</b> ${idRiwayat ? 'diperbarui' : 'dicatat'} untuk <b>${i.nama_produk}</b> (${i.sku})${pelanggan_nama ? ' ke ' + pelanggan_nama : ''}`);
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

  renderDetailStokKeluar();
  renderGudang();
  await catatAktivitas('gudang', `Riwayat stok keluar <b>${Number(r.jumlah||0).toLocaleString('id-ID')}</b> untuk <b>${i.nama_produk}</b> (${i.sku}) dihapus`);
  tampilkanToast('Riwayat stok keluar dihapus');
}

/* ---- Kelola Gudang (daftar lokasi/cabang) ---- */
function bukaModalKelolaGudang(){
  renderListGudangKelola();
  document.getElementById('form-gudang').reset();
  bukaModal('modal-gudang');
}
function renderListGudangKelola(){
  const wrap = document.getElementById('list-gudang-kelola');
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
        <div class="gudang-row-name">${g.nama}</div>
        <div class="gudang-row-loc">${g.lokasi || 'Lokasi belum diisi'} · ${jumlahItem} item stok</div>
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
  isiDropdownGudang();
  renderGudang();
  if(g) await catatAktivitas('gudang', `Gudang <b>${g.nama}</b> dihapus`);
  tampilkanToast('Gudang dihapus');
}

function unduhStokCSV(){
  unduhCSV('stock-gudang-dealstack.csv',
    ['SKU','Nama Produk','Variant','Kategori','Gudang','Satuan','Stok Masuk','Stok Keluar','Sisa Stok','Update Terakhir','Diupdate Oleh','Status'],
    DATA.stokItem.map(i => [i.sku, i.nama_produk, i.variant || '', i.kategori || 'Umum', namaGudang(i.gudang_id), i.satuan || 'Pcs', i.stok_masuk || 0, i.stok_keluar || 0, sisaStok(i), i.diupdate_pada || '', i.diupdate_oleh_nama || '', labelStatusStok(hitungStatusStok(i))]));
  tampilkanToast('Data stok diunduh');
}

function unduhStokKeluarDetailCSV(){
  if(!STOK_ITEM_AKTIF_ID) return;
  const i = DATA.stokItem.find(x => x.id === STOK_ITEM_AKTIF_ID);
  const data = DATA.riwayatStok.filter(r => r.item_id === STOK_ITEM_AKTIF_ID && r.tipe === 'keluar');
  unduhCSV(`stok-keluar-${i ? i.sku : 'item'}.csv`,
    ['Tanggal Keluar','No DO','Nama Pelanggan','No PO','Nama Proyek','Qty','Satuan','Catatan'],
    data.map(r => [formatTanggal(r.tanggal), r.no_do || '', r.pelanggan_nama || '', r.no_po || '', r.proyek_nama || '', r.jumlah || 0, r.satuan || '', r.catatan || '']));
  tampilkanToast('Riwayat stok keluar diunduh');
}

/* ---------------------------------------------------------
   18. PENGAWASAN TIM (khusus Admin)
--------------------------------------------------------- */
function renderPengawasanTim(){
  const wrap = document.getElementById('team-grid');
  if(!wrap) return;
  if(!DATA.profil.length){
    wrap.innerHTML = `<div class="empty-state"><p>Belum ada anggota tim terdaftar. Minta anggota mendaftar lewat layar Masuk/Daftar.</p></div>`;
    return;
  }
  wrap.innerHTML = DATA.profil.map(p => {
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
          <div><div class="team-card-name">${p.nama}</div><div class="team-card-role">${p.peran === 'admin' ? 'Administrator' : 'Anggota Tim'}</div></div>
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
function renderPenggunaAdmin(){
  const tbody = document.getElementById('tbody-pengguna');
  if(!tbody) return;
  if(!DATA.profil.length){
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><p>Belum ada pengguna terdaftar.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = DATA.profil.map(p => `
    <tr>
      <td class="assignee-cell cell-name">${markupAvatar(p)}${p.nama}</td>
      <td class="cell-muted">${p.email}</td>
      <td>
        <select class="filter-select" onchange="ubahPeranPengguna('${p.id}', this.value)" ${p.id === CURRENT_USER.id ? 'disabled title="Tidak bisa mengubah peran sendiri"' : ''}>
          <option value="anggota" ${p.peran==='anggota'?'selected':''}>Anggota Tim</option>
          <option value="admin" ${p.peran==='admin'?'selected':''}>Admin</option>
        </select>
      </td>
      <td class="cell-muted">${waktuRelatif(p.dibuat_pada)}</td>
    </tr>`).join('');
}
async function ubahPeranPengguna(id, peranBaru){
  const p = DATA.profil.find(x => x.id === id);
  if(!p) return;
  const { error } = await supabaseClient.from('profil').update({ peran: peranBaru }).eq('id', id);
  if(error){ console.error(error); tampilkanToast('Gagal mengubah peran. Sudahkah migrasi v5 dijalankan?', true); renderPenggunaAdmin(); return; }
  p.peran = peranBaru;
  renderPenggunaAdmin();
  renderPengawasanTim();
  await catatAktivitas('pengguna', `Peran <b>${p.nama}</b> diubah menjadi ${peranBaru === 'admin' ? 'Admin' : 'Anggota Tim'}`);
  tampilkanToast('Peran pengguna diperbarui');
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
  pill.textContent = CURRENT_USER.peran === 'admin' ? 'Administrator' : 'Anggota Tim';
  const preview = document.getElementById('avatar-preview');
  preview.innerHTML = CURRENT_USER.avatar_url
    ? `<img src="${CURRENT_USER.avatar_url}" alt="">`
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
  await catatAktivitas('pengguna', `Profil perusahaan diperbarui oleh <b>${CURRENT_USER.nama}</b>`);
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
      if(STOK_ITEM_AKTIF_ID) renderTabelStokKeluarDetail();
    })
    .subscribe();
}

/* ---------------------------------------------------------
   9. MODAL HELPERS
--------------------------------------------------------- */
function bukaModal(id){ document.getElementById(id).classList.remove('hidden'); }
function tutupModal(id){ document.getElementById(id).classList.add('hidden'); }

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
        <stop offset="0%" stop-color="#ef3f4d" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#ef3f4d" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <line x1="0" y1="0" x2="${W}" y2="0" stroke="rgba(255,255,255,.08)" stroke-dasharray="3 5"/>
    <path id="chart-ghost-path" d="${ghostPath}" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="1.5" style="${compareHidden ? 'display:none' : ''}"/>
    <path d="${areaPath}" fill="url(#areaGrad)"/>
    <path d="${linePath}" fill="none" stroke="#ff6b74" stroke-width="2"/>
  `;

  const crossIdx = Math.round(N * 0.42);
  const crossX = (crossIdx / (N - 1)) * W;
  const crossY = H - (mainSeries[crossIdx] / maxV) * H;
  svg.innerHTML += `
    <line x1="${crossX}" y1="0" x2="${crossX}" y2="${H}" stroke="rgba(255,255,255,.35)" stroke-dasharray="4 4"/>
    <circle cx="${crossX}" cy="${crossY}" r="4.5" fill="#161618" stroke="#fff" stroke-width="2"/>
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
  brushSvg.innerHTML = `<path d="${brushLine}" fill="none" stroke="rgba(255,107,116,.55)" stroke-width="1.5"/>`;

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
    ctx.fillStyle = '#1b1a1d';
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
  DATA.proyek.forEach(p => {
    if(!p.tenggat) return;
    const d = new Date(p.tenggat);
    if(d.getDate() === hari && d.getMonth() === bulan && d.getFullYear() === tahun){
      hasil.push({ tipe:'proyek', teks: p.nama, sub: p.pelanggan_nama, status: p.status });
    }
  });
  DATA.tugas.forEach(t => {
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
        ${tampil.map(it => `<div class="cal-tag ${it.tipe}">${it.teks}</div>`).join('')}
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
        <div><b>${it.teks}</b> — <span class="cell-muted">${it.sub}</span></div>
      </div>`).join('') : `<div class="empty-state"><p>Tidak ada agenda di tanggal ini.</p></div>`;
  } else {
    agendaTitle.textContent = 'Agenda Bulan Ini';
    const semuaItem = [];
    for(let h=1; h<=jumlahHari; h++) itemUntukTanggal(h, calBulan, calTahun).forEach(it => semuaItem.push({ ...it, hari: h }));
    agendaList.innerHTML = semuaItem.length ? semuaItem.map(it => `
      <div class="agenda-item">
        <div class="dot" style="background:${it.tipe==='proyek' ? 'var(--blue)' : 'var(--accent-bright)'}"></div>
        <div><b>${it.teks}</b> — <span class="cell-muted">${it.sub} · ${it.hari} ${BULAN_SINGKAT_INDO[calBulan]}</span></div>
      </div>`).join('') : `<div class="empty-state"><p>Tidak ada tenggat proyek/tugas di bulan ini.</p></div>`;
  }
}

/* ---------------------------------------------------------
   13. LAPORAN
--------------------------------------------------------- */
function renderLaporan(){
  const proyekAktif = DATA.proyek.filter(p => p.status !== 'dibatalkan');
  const totalNilai = proyekAktif.reduce((s,p) => s + Number(p.nilai), 0);
  const selesai = DATA.proyek.filter(p => p.status === 'selesai').length;
  const dibatalkan = DATA.proyek.filter(p => p.status === 'dibatalkan').length;
  const totalDitutup = selesai + dibatalkan;
  const winRate = totalDitutup ? Math.round((selesai/totalDitutup)*100) : 0;

  const laporanKpi = document.getElementById('laporan-kpi');
  const kartu = [
    ['Total Nilai Proyek Aktif', formatRupiah(totalNilai)],
    ['Proyek Selesai', selesai],
    ['Proyek Dibatalkan', dibatalkan],
    ['Tingkat Menang', winRate + '%'],
  ];
  laporanKpi.innerHTML = kartu.map(([label,val]) => `
    <div class="kpi-card">
      <div class="kpi-top"><span class="kpi-label">${label}</span></div>
      <div class="kpi-bottom"><div class="kpi-value">${val}</div></div>
    </div>`).join('');

  const perIndustri = {};
  DATA.proyek.forEach(p => {
    const pel = DATA.pelanggan.find(x => x.nama === p.pelanggan_nama);
    const industri = pel ? (pel.industri || 'Umum') : 'Umum';
    perIndustri[industri] = perIndustri[industri] || { jumlah:0, nilai:0 };
    perIndustri[industri].jumlah++;
    perIndustri[industri].nilai += Number(p.nilai);
  });
  document.getElementById('laporan-industri').innerHTML = Object.keys(perIndustri).length
    ? Object.entries(perIndustri).map(([nama,d]) => `<div class="report-row"><span>${nama}</span><b>${d.jumlah} proyek · ${formatRupiah(d.nilai)}</b></div>`).join('')
    : `<div class="empty-state"><p>Belum ada data proyek.</p></div>`;

  const perStatus = { berjalan:0, tertunda:0, selesai:0, dibatalkan:0 };
  DATA.proyek.forEach(p => perStatus[p.status] = (perStatus[p.status]||0) + 1);
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
      <div class="message-avatar">${(c.dibuat_oleh||'?').trim().charAt(0).toUpperCase()}</div>
      <div class="message-body">
        <div class="message-head">
          <span class="message-author">${c.dibuat_oleh}</span>
          <span class="message-time">${waktuRelatif(c.dibuat_pada)}</span>
        </div>
        <div class="message-text">${c.isi}</div>
      </div>
      <div class="message-del" title="Hapus" onclick="hapusCatatan('${c.id}')">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>
      </div>
    </div>`).join('');
}
async function tambahCatatan(){
  const isiEl = document.getElementById('input-catatan');
  const namaEl = document.getElementById('input-catatan-nama');
  const isi = isiEl.value.trim();
  const nama = namaEl.value.trim() || 'Anonim';
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
  document.getElementById('cari-pelanggan').addEventListener('input', renderPelanggan);
  document.getElementById('filter-nilai-proyek-pelanggan').addEventListener('change', renderPelanggan);
  document.getElementById('form-pelanggan').addEventListener('submit', simpanPelanggan);

  document.getElementById('cari-proyek-detail').addEventListener('input', renderProyekDetail);
  document.getElementById('filter-status-proyek-detail').addEventListener('change', renderProyekDetail);
  document.getElementById('form-proyek').addEventListener('submit', simpanProyek);
  ['input-subtotal-proyek','input-tax-proyek','input-dana-lain-proyek','input-total-budget-proyek','input-budget-terpakai-proyek']
    .forEach(id => document.getElementById(id).addEventListener('input', perbaruiKalkulasiFormProyek));

  document.getElementById('form-tugas').addEventListener('submit', tambahTugas);

  document.getElementById('form-profil-saya').addEventListener('submit', simpanProfilSaya);
  document.getElementById('form-ubah-sandi').addEventListener('submit', simpanUbahSandi);
  const formPerusahaan = document.getElementById('form-perusahaan');
  if(formPerusahaan) formPerusahaan.addEventListener('submit', simpanPerusahaan);

  document.getElementById('cari-aktivitas').addEventListener('input', renderAktivitas);
  document.getElementById('filter-tipe-aktivitas').addEventListener('change', renderAktivitas);

  document.getElementById('cari-gudang').addEventListener('input', renderGudang);
  document.getElementById('filter-lokasi-gudang').addEventListener('change', renderGudang);
  document.getElementById('filter-kategori-gudang').addEventListener('change', renderGudang);
  document.getElementById('filter-status-gudang').addEventListener('change', renderGudang);
  document.getElementById('form-item-stok').addEventListener('submit', simpanItemStok);
  document.getElementById('form-tambah-stok').addEventListener('submit', simpanTambahStok);
  document.getElementById('form-gudang').addEventListener('submit', tambahGudang);

  document.getElementById('cari-stok-keluar-detail').addEventListener('input', renderTabelStokKeluarDetail);
  document.getElementById('form-stok-keluar').addEventListener('submit', simpanStokKeluar);
  document.getElementById('input-pelanggan-stok-keluar').addEventListener('change', saatPelangganStokKeluarBerubah);
  document.getElementById('input-proyek-stok-keluar').addEventListener('change', saatProyekStokKeluarBerubah);

  document.querySelectorAll('.range-tab').forEach(tab => {
    tab.addEventListener('click', () => ubahRentangChart(tab.dataset.range));
  });
}

function mulai(){
  if(typeof supabaseClient === 'undefined'){
    tampilkanToast('config.js belum diatur. Lihat README.md', true);
    console.error('supabaseClient tidak ditemukan — pastikan config.js sudah diisi dan dimuat sebelum script.js');
    return;
  }
  muatBrandingPerusahaan(); // tidak perlu ditunggu — sidebar/layar masuk pakai fallback "Dealstack" dulu
  initAuthUI();
}

document.addEventListener('DOMContentLoaded', mulai);
