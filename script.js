/* =========================================================
   DEALSTACK CRM — LOGIKA APLIKASI (script.js)
   Versi ini terhubung ke database Supabase (PostgreSQL).
   Semua data (pelanggan, proyek, tugas, aktivitas) dibaca
   dan ditulis langsung ke tabel Supabase lewat supabaseClient
   yang didefinisikan di config.js.
   ========================================================= */

/* Cache data di memori, diisi dari Supabase saat halaman dimuat
   dan diperbarui lagi setiap ada perubahan (tambah/hapus/ubah) */
let DATA = { pelanggan: [], proyek: [], tugas: [], aktivitas: [], catatan: [], profil: [], perusahaan: { nama_perusahaan: 'Dealstack', logo_url: null } };

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
  renderKPI(); renderPelanggan(); renderProyek(); renderLaporan();
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
  renderProyek();
  renderFunnel();
  renderAktivitas();
  renderTugas();
  renderPesan();
  renderNotifikasi();
  renderChart();
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

  if(!pelanggan.length && !proyek.length && !tugas.length){
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
    pindahTampilan('proyek');
    document.getElementById('cari-proyek').value = DATA.proyek.find(p=>p.id===id)?.nama || '';
    renderProyek();
  } else if(jenis === 'tugas'){
    pindahTampilan('tugas');
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
  const [pelanggan, proyek, tugas, aktivitas, catatan, profil] = await Promise.all([
    supabaseClient.from('pelanggan').select('*').order('dibuat_pada', { ascending: false }),
    supabaseClient.from('proyek').select('*').order('dibuat_pada', { ascending: false }),
    supabaseClient.from('tugas').select('*').order('dibuat_pada', { ascending: false }),
    supabaseClient.from('aktivitas').select('*').order('dibuat_pada', { ascending: false }).limit(80),
    supabaseClient.from('catatan_tim').select('*').order('dibuat_pada', { ascending: false }),
    supabaseClient.from('profil').select('*').order('nama', { ascending: true }),
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
  document.querySelectorAll('.nav-item[data-view]').forEach(el => {
    el.classList.toggle('active', el.dataset.view === namaView);
  });
  if(namaView === 'ringkasan'){ renderChart(); renderTagRingkasan(); }
  if(namaView === 'kalender') renderKalender();
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
function renderPelanggan(){
  const tbody = document.getElementById('tbody-pelanggan');
  const q = (document.getElementById('cari-pelanggan').value || '').toLowerCase();
  const filterStatus = document.getElementById('filter-status-pelanggan').value;

  const data = DATA.pelanggan.filter(p => {
    const cocokCari = p.nama.toLowerCase().includes(q) || (p.industri || '').toLowerCase().includes(q);
    const cocokStatus = filterStatus === 'semua' || p.status === filterStatus;
    return cocokCari && cocokStatus;
  });

  if(!data.length){
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">
      <p>Tidak ada pelanggan yang cocok dengan pencarian.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(p => `
    <tr>
      <td class="cell-name">${p.nama}<div class="cell-muted">${p.kode}</div></td>
      <td>${p.industri || '—'}</td>
      <td><span class="badge badge-${p.status === 'nonaktif' ? 'dibatalkan' : p.status}"><span class="dot"></span>${labelStatusPelanggan(p.status)}</span></td>
      <td>${formatRupiah(p.nilai)}</td>
      <td class="cell-muted">${formatTanggal(p.kontak_terakhir)}</td>
      <td class="cell-actions">
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
  if(p) await catatAktivitas('pelanggan', `Pelanggan <b>${p.nama}</b> dihapus`);
  tampilkanToast('Pelanggan dihapus');
}

async function tambahPelanggan(e){
  e.preventDefault();
  const nama = document.getElementById('input-nama-pelanggan').value.trim();
  const industri = document.getElementById('input-industri-pelanggan').value.trim() || 'Umum';
  const nilai = parseInt(document.getElementById('input-nilai-pelanggan').value || '0', 10);
  if(!nama) return;

  const baris = {
    kode: kodeAcak('CL'), nama, industri, status: 'aktif', nilai,
    kontak_terakhir: new Date().toISOString().slice(0,10)
  };
  const { data, error } = await supabaseClient.from('pelanggan').insert(baris).select().single();
  if(error){ console.error(error); tampilkanToast('Gagal menambah pelanggan', true); return; }

  DATA.pelanggan.unshift(data);
  renderPelanggan();
  await catatAktivitas('pelanggan', `Pelanggan baru <b>${nama}</b> ditambahkan ke sistem`);
  tutupModal('modal-pelanggan');
  e.target.reset();
  tampilkanToast('Pelanggan baru ditambahkan');
}

/* ---------------------------------------------------------
   6. RENDER: TABEL PROYEK
--------------------------------------------------------- */
function renderProyek(){
  const tbody = document.getElementById('tbody-proyek');
  const q = (document.getElementById('cari-proyek').value || '').toLowerCase();
  const filterStatus = document.getElementById('filter-status-proyek').value;

  const data = DATA.proyek.filter(p => {
    const cocokCari = p.nama.toLowerCase().includes(q) || p.pelanggan_nama.toLowerCase().includes(q);
    const cocokStatus = filterStatus === 'semua' || p.status === filterStatus;
    return cocokCari && cocokStatus;
  });

  if(!data.length){
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">
      <p>Tidak ada proyek yang cocok dengan pencarian.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(p => `
    <tr>
      <td class="cell-name">${p.nama}<div class="cell-muted">${p.kode} · ${p.pelanggan_nama}</div></td>
      <td>
        <select class="filter-select" style="font-size:12px;padding:5px 8px;" onchange="ubahStatusProyek('${p.id}', this.value)">
          ${['berjalan','tertunda','selesai','dibatalkan'].map(s => `<option value="${s}" ${s===p.status?'selected':''}>${labelStatusProyek(s)}</option>`).join('')}
        </select>
      </td>
      <td>
        <div class="progress-mini"><div class="progress-mini-fill" style="width:${p.progres}%"></div></div>
        <div class="progress-mini-label">${p.progres}%</div>
      </td>
      <td>${formatRupiah(p.nilai)}</td>
      <td class="cell-muted">${formatTanggal(p.tenggat)}</td>
      <td class="cell-actions">
        <div class="icon-btn" title="Hapus" onclick="hapusProyek('${p.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>
        </div>
      </td>
    </tr>
  `).join('');
}

async function ubahStatusProyek(id, statusBaru){
  const proyek = DATA.proyek.find(p => p.id === id);
  if(!proyek) return;
  const progresBaru = statusBaru === 'selesai' ? 100 : proyek.progres;

  const { error } = await supabaseClient.from('proyek')
    .update({ status: statusBaru, progres: progresBaru })
    .eq('id', id);
  if(error){ console.error(error); tampilkanToast('Gagal mengubah status proyek', true); return; }

  proyek.status = statusBaru;
  proyek.progres = progresBaru;

  renderProyek();
  renderKPI();
  renderFunnel();
  await catatAktivitas('proyek', `Status proyek <b>${proyek.nama}</b> diubah menjadi ${labelStatusProyek(statusBaru)}`);
  tampilkanToast('Status proyek diperbarui');
}

async function hapusProyek(id){
  const p = DATA.proyek.find(x => x.id === id);
  const { error } = await supabaseClient.from('proyek').delete().eq('id', id);
  if(error){ console.error(error); tampilkanToast('Gagal menghapus proyek', true); return; }
  DATA.proyek = DATA.proyek.filter(x => x.id !== id);
  renderProyek();
  renderKPI();
  renderFunnel();
  if(p) await catatAktivitas('proyek', `Proyek <b>${p.nama}</b> dihapus`);
  tampilkanToast('Proyek dihapus');
}

async function tambahProyek(e){
  e.preventDefault();
  const nama = document.getElementById('input-nama-proyek').value.trim();
  const pelanggan_nama = document.getElementById('input-pelanggan-proyek').value.trim();
  const nilai = parseInt(document.getElementById('input-nilai-proyek').value || '0', 10);
  const tenggat = document.getElementById('input-tenggat-proyek').value || null;
  if(!nama || !pelanggan_nama) return;

  const baris = { kode: kodeAcak('PR'), nama, pelanggan_nama, status:'berjalan', progres:0, nilai, tenggat };
  const { data, error } = await supabaseClient.from('proyek').insert(baris).select().single();
  if(error){ console.error(error); tampilkanToast('Gagal menambah proyek', true); return; }

  DATA.proyek.unshift(data);
  renderProyek();
  renderKPI();
  renderFunnel();
  await catatAktivitas('proyek', `Proyek baru <b>${nama}</b> dibuat untuk ${pelanggan_nama}`);
  tutupModal('modal-proyek');
  e.target.reset();
  tampilkanToast('Proyek baru ditambahkan');
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
}

/* ---------------------------------------------------------
   9. MODAL HELPERS
--------------------------------------------------------- */
function bukaModal(id){ document.getElementById(id).classList.remove('hidden'); }
function tutupModal(id){ document.getElementById(id).classList.add('hidden'); }

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
  { q: 'Bagaimana cara menambah pelanggan atau proyek baru?', a: 'Buka menu Pelanggan atau Proyek di sidebar, lalu klik tombol "Tambah" di kanan atas. Isi form dan klik Simpan — data langsung tersimpan ke database Supabase.' },
  { q: 'Kenapa data tidak muncul saat pertama kali membuka aplikasi?', a: 'Pastikan config.js sudah diisi dengan SUPABASE_URL dan SUPABASE_ANON_KEY yang benar, dan skema tabel di supabase/schema.sql sudah dijalankan di SQL Editor Supabase Anda.' },
  { q: 'Bagaimana cara mengubah status sebuah proyek?', a: 'Di tabel Proyek, gunakan dropdown status pada baris proyek yang bersangkutan. Perubahan otomatis tercatat di menu Aktivitas.' },
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
  document.getElementById('filter-status-pelanggan').addEventListener('change', renderPelanggan);
  document.getElementById('form-pelanggan').addEventListener('submit', tambahPelanggan);

  document.getElementById('cari-proyek').addEventListener('input', renderProyek);
  document.getElementById('filter-status-proyek').addEventListener('change', renderProyek);
  document.getElementById('form-proyek').addEventListener('submit', tambahProyek);

  document.getElementById('form-tugas').addEventListener('submit', tambahTugas);

  document.getElementById('form-profil-saya').addEventListener('submit', simpanProfilSaya);
  document.getElementById('form-ubah-sandi').addEventListener('submit', simpanUbahSandi);
  const formPerusahaan = document.getElementById('form-perusahaan');
  if(formPerusahaan) formPerusahaan.addEventListener('submit', simpanPerusahaan);

  document.getElementById('cari-aktivitas').addEventListener('input', renderAktivitas);
  document.getElementById('filter-tipe-aktivitas').addEventListener('change', renderAktivitas);

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
