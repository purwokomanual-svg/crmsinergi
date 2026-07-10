/* =========================================================
   DEALSTACK CRM — LOGIKA APLIKASI (script.js)
   Versi ini terhubung ke database Supabase (PostgreSQL).
   Semua data (pelanggan, proyek, tugas, aktivitas) dibaca
   dan ditulis langsung ke tabel Supabase lewat supabaseClient
   yang didefinisikan di config.js.
   ========================================================= */

/* Cache data di memori, diisi dari Supabase saat halaman dimuat
   dan diperbarui lagi setiap ada perubahan (tambah/hapus/ubah) */
let DATA = { pelanggan: [], proyek: [], tugas: [], aktivitas: [] };

/* ---------------------------------------------------------
   1. UTIL
--------------------------------------------------------- */
function formatRupiah(v){
  v = Number(v) || 0;
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

/* ---------------------------------------------------------
   2. LAPISAN DATA — SUPABASE
   Semua fungsi di bawah ini melakukan query ke database.
--------------------------------------------------------- */
async function muatSemuaData(){
  const [pelanggan, proyek, tugas, aktivitas] = await Promise.all([
    supabaseClient.from('pelanggan').select('*').order('dibuat_pada', { ascending: false }),
    supabaseClient.from('proyek').select('*').order('dibuat_pada', { ascending: false }),
    supabaseClient.from('tugas').select('*').order('dibuat_pada', { ascending: false }),
    supabaseClient.from('aktivitas').select('*').order('dibuat_pada', { ascending: false }).limit(20),
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
}

async function catatAktivitas(tipe, teks){
  const { error } = await supabaseClient.from('aktivitas').insert({ tipe, teks });
  if(error) console.error(error);
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
  if(namaView === 'ringkasan') renderChart();
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
  const { error } = await supabaseClient.from('pelanggan').delete().eq('id', id);
  if(error){ console.error(error); tampilkanToast('Gagal menghapus pelanggan', true); return; }
  DATA.pelanggan = DATA.pelanggan.filter(p => p.id !== id);
  renderPelanggan();
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
  await catatAktivitas('proyek', `Status proyek <b>${proyek.nama}</b> diubah menjadi ${labelStatusProyek(statusBaru)}`);
  DATA.aktivitas.unshift({ tipe:'proyek', teks:`Status proyek <b>${proyek.nama}</b> diubah menjadi ${labelStatusProyek(statusBaru)}`, dibuat_pada: new Date().toISOString() });

  renderProyek();
  renderKPI();
  renderFunnel();
  renderAktivitas();
  tampilkanToast('Status proyek diperbarui');
}

async function hapusProyek(id){
  const { error } = await supabaseClient.from('proyek').delete().eq('id', id);
  if(error){ console.error(error); tampilkanToast('Gagal menghapus proyek', true); return; }
  DATA.proyek = DATA.proyek.filter(p => p.id !== id);
  renderProyek();
  renderKPI();
  renderFunnel();
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
  await catatAktivitas('proyek', `Proyek baru <b>${nama}</b> dibuat untuk ${pelanggan_nama}`);
  DATA.aktivitas.unshift({ tipe:'proyek', teks:`Proyek baru <b>${nama}</b> dibuat untuk ${pelanggan_nama}`, dibuat_pada: new Date().toISOString() });

  renderProyek();
  renderKPI();
  renderFunnel();
  renderAktivitas();
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
  if(!DATA.aktivitas.length){
    wrap.innerHTML = `<div class="empty-state"><p>Belum ada aktivitas.</p></div>`;
    return;
  }
  wrap.innerHTML = DATA.aktivitas.map(a => `
    <div class="timeline-item">
      <div class="timeline-dot">${ikonAktivitas[a.tipe] || ikonAktivitas.proyek}</div>
      <div class="timeline-body">
        <div class="timeline-title">${a.teks}</div>
        <div class="timeline-meta">${waktuRelatif(a.dibuat_pada)}</div>
      </div>
    </div>
  `).join('');
}

function renderTugas(){
  const wrap = document.getElementById('task-wrap');
  wrap.innerHTML = DATA.tugas.map(t => `
    <div class="task-item ${t.selesai ? 'done' : ''}">
      <div class="task-check" onclick="toggleTugas('${t.id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M4 12l5 5L20 6"/></svg>
      </div>
      <div class="task-title">${t.judul}</div>
      <div class="task-due">${t.tenggat || ''}</div>
    </div>
  `).join('');
}
async function toggleTugas(id){
  const t = DATA.tugas.find(x => x.id === id);
  if(!t) return;
  const selesaiBaru = !t.selesai;
  const { error } = await supabaseClient.from('tugas').update({ selesai: selesaiBaru }).eq('id', id);
  if(error){ console.error(error); tampilkanToast('Gagal memperbarui tugas', true); return; }
  t.selesai = selesaiBaru;
  renderTugas();
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
function renderChart(){
  if(chartSudahDigambar) return;
  chartSudahDigambar = true;

  const N = 140;
  const mainSeries = buildSeries(N, 42);
  const ghostSeries = buildSeries(N, 91).map(v => v * 0.62 + 6);
  const maxV = Math.max(...mainSeries, ...ghostSeries) * 1.08;

  const W = 1200, H = 360;
  const linePath = toPath(mainSeries, W, H, maxV);
  const areaPath = linePath + ` L${W},${H} L0,${H} Z`;
  const ghostPath = toPath(ghostSeries, W, H, maxV);

  const svg = document.getElementById('main-chart');
  svg.innerHTML = `
    <defs>
      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <line x1="0" y1="0" x2="${W}" y2="0" stroke="rgba(255,255,255,.08)" stroke-dasharray="3 5"/>
    <path d="${ghostPath}" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="1.5"/>
    <path d="${areaPath}" fill="url(#areaGrad)"/>
    <path d="${linePath}" fill="none" stroke="#a78bfa" stroke-width="2"/>
  `;

  const crossIdx = Math.round(N * 0.42);
  const crossX = (crossIdx / (N - 1)) * W;
  const crossY = H - (mainSeries[crossIdx] / maxV) * H;
  svg.innerHTML += `
    <line x1="${crossX}" y1="0" x2="${crossX}" y2="${H}" stroke="rgba(255,255,255,.35)" stroke-dasharray="4 4"/>
    <circle cx="${crossX}" cy="${crossY}" r="4.5" fill="#0c0a17" stroke="#fff" stroke-width="2"/>
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
  const xLabels = ['00.00','03.00','06.00','09.00','12.00','15.00','18.00','21.00'];
  xAxis.innerHTML = xLabels.map(l => `<span>${l}</span>`).join('');

  const brushSvg = document.getElementById('brush-chart');
  const brushSeries = buildSeries(N, 55);
  const bMax = Math.max(...brushSeries) * 1.15;
  const brushLine = toPath(brushSeries, W, 52, bMax);
  brushSvg.innerHTML = `<path d="${brushLine}" fill="none" stroke="rgba(167,139,250,.55)" stroke-width="1.5"/>`;

  const brushWindow = document.getElementById('brush-window');
  brushWindow.style.left = '74%';
  brushWindow.style.width = '18%';
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

  document.querySelectorAll('.range-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.range-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });
}

async function mulaiAplikasi(){
  if(typeof supabaseClient === 'undefined'){
    tampilkanToast('config.js belum diatur. Lihat README.md', true);
    console.error('supabaseClient tidak ditemukan — pastikan config.js sudah diisi dan dimuat sebelum script.js');
    return;
  }
  initNavigasi();
  initEventListener();
  await muatSemuaData();
  renderKPI();
  renderPelanggan();
  renderProyek();
  renderFunnel();
  renderAktivitas();
  renderTugas();
  renderChart();
}

document.addEventListener('DOMContentLoaded', mulaiAplikasi);
