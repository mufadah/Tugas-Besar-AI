// ========================================================
//  KONFIGURASI API & VARIABEL GLOBAL
// ========================================================
const API_URL = '/api/sensor';
const API_LOG_SESI = '/api/log-sesi';

let dataHistori = [];
let waktuTerakhirUpdate = 0; 
const BATAS_OFFLINE = 20000; // 20 detik tanpa data baru = Offline
let chartDetailInstance = null; // Menyimpan instance grafik pada modal

// ========================================================
//  INISIALISASI GRAFIK REALTIME (CHART.JS)
// ========================================================
const ctx = document.getElementById('realtimeChart').getContext('2d');
const configChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            { label: 'Suhu (°C)', data: [], borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderWidth: 3, tension: 0.3, fill: true, yAxisID: 'y' },
            { label: 'Kelembapan (%)', data: [], borderColor: '#06b6d4', backgroundColor: 'rgba(6, 182, 212, 0.1)', borderWidth: 3, tension: 0.3, fill: true, yAxisID: 'y1' }
        ]
    },
    options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
            x: { ticks: { color: '#64748b' }, grid: { color: '#e2e8f0' } },
            y: { type: 'linear', position: 'left', ticks: { color: '#64748b' }, grid: { color: '#e2e8f0' } },
            y1: { type: 'linear', position: 'right', ticks: { color: '#64748b' }, grid: { drawOnChartArea: false } }
        },
        plugins: { legend: { labels: { color: '#64748b' } } }
    }
});

// ========================================================
//  LOGIKA DARK/LIGHT MODE
// ========================================================
const themeToggle = document.getElementById('themeToggle');
const htmlTag = document.documentElement;
const iconTheme = themeToggle.querySelector('i');
const tableHead = document.getElementById('tableHead');

function terapkanTema(theme) {
    htmlTag.setAttribute('data-bs-theme', theme);
    iconTheme.className = theme === 'dark' ? 'fa-solid fa-sun me-1' : 'fa-solid fa-moon me-1';
    iconTheme.style.color = theme === 'dark' ? '#fbbf24' : 'inherit';
    tableHead.className = theme === 'dark' ? 'table-dark sticky-top' : 'table-light sticky-top';
    
    const textColor = theme === 'dark' ? '#94a3b8' : '#64748b';
    const gridColor = theme === 'dark' ? '#334155' : '#e2e8f0';
    configChart.options.scales.x.ticks.color = textColor; configChart.options.scales.x.grid.color = gridColor;
    configChart.options.scales.y.ticks.color = textColor; configChart.options.scales.y.grid.color = gridColor;
    configChart.options.scales.y1.ticks.color = textColor; configChart.options.plugins.legend.labels.color = textColor;
    configChart.update();
}

terapkanTema(localStorage.getItem('theme') || 'light');
themeToggle.addEventListener('click', () => {
    const newTheme = htmlTag.getAttribute('data-bs-theme') === 'light' ? 'dark' : 'light';
    terapkanTema(newTheme); localStorage.setItem('theme', newTheme);
});

// ========================================================
//  FUNGSI BANTUAN STATUS VISUAL
// ========================================================
function dapatkanStatus(suhu, kelembapan) {
    if (suhu < 36.5 || suhu > 37.5 || kelembapan < 40 || kelembapan > 60) {
        if (suhu > 38.0 || kelembapan < 30) return '<span class="status-badge bg-danger-custom">Kritis</span>';
        return '<span class="status-badge bg-warning-custom">Peringatan</span>';
    }
    return '<span class="status-badge bg-normal">Normal</span>';
}

// ========================================================
//  FUNGSI: MENGAMBIL DATA SENSOR REALTIME (POLLING)
// ========================================================
async function pollDataSensor() {
    try {
        const res = await fetch(API_URL);
        const arrayData = await res.json();
        
        if (Array.isArray(arrayData) && arrayData.length > 0) {
            const dataTerbaru = arrayData[arrayData.length - 1];
            waktuTerakhirUpdate = new Date(dataTerbaru.waktu).getTime();
            
            // Format ulang data untuk grafik dan tabel
            dataHistori = arrayData.map(i => ({ 
                timestamp: new Date(i.waktu).toLocaleTimeString('id-ID'), 
                ruangan: i.ruangan, 
                suhu: parseFloat(i.suhu), 
                kelembapan: parseFloat(i.kelembapan) 
            }));
            
            // Update Grafik
            configChart.data.labels = dataHistori.map(i => i.timestamp);
            configChart.data.datasets[0].data = dataHistori.map(i => i.suhu);
            configChart.data.datasets[1].data = dataHistori.map(i => i.kelembapan);
            configChart.update();

            // Update Tabel Log Terakhir
            const tbody = document.getElementById('tableBody'); 
            tbody.innerHTML = ''; 
            [...dataHistori].reverse().forEach(i => {
                tbody.innerHTML += `<tr>
                    <td class="text-muted">${i.timestamp}</td>
                    <td>${i.ruangan}</td>
                    <td class="text-danger fw-bold">${i.suhu}</td>
                    <td class="text-info fw-bold">${i.kelembapan}</td>
                    <td>${dapatkanStatus(i.suhu, i.kelembapan)}</td>
                </tr>`;
            });
            
            // Update Angka Live di Kartu Atas
            document.getElementById('liveTemp').innerText = dataTerbaru.suhu.toFixed(1);
            document.getElementById('liveHum').innerText = dataTerbaru.kelembapan.toFixed(1);
        }
    } catch (e) { console.error("Error polling data:", e); }
}

// ========================================================
//  FUNGSI: MENGAMBIL LOG HISTORI SESI
// ========================================================
async function ambilLogSesi() {
    try {
        const res = await fetch(API_LOG_SESI);
        const data = await res.json();
        const tbody = document.getElementById('tableLogSesi'); 
        tbody.innerHTML = '';
        
        if(data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-muted py-4">Belum ada sesi terekam.</td></tr>';
            return;
        }

        data.forEach(item => {
            const isAktif = !item.waktuSelesai;
            const endText = isAktif ? '-' : new Date(item.waktuSelesai).toLocaleString('id-ID');
            const startText = new Date(item.waktuMulai).toLocaleString('id-ID');
            const badge = isAktif 
                ? '<span class="badge bg-primary"><i class="fa-solid fa-satellite-dish fa-beat me-1"></i>Alat Aktif</span>' 
                : '<span class="badge bg-secondary">Sesi Selesai</span>';
            
            // Baris tabel ditambahkan event onClick untuk membuka modal
            tbody.innerHTML += `<tr style="cursor: pointer; transition: background-color 0.2s;" class="hover-shadow" 
                onclick="bukaDetailSesi('${item.waktuMulai}', '${item.waktuSelesai || 'null'}')">
                <td>${startText}</td>
                <td>${endText}</td>
                <td class="fw-medium">${item.durasi}</td>
                <td class="text-danger fw-bold">${item.rataSuhu.toFixed(1)}</td>
                <td>${badge}</td>
            </tr>`;
        });
    } catch (e) {
        console.error("Gagal mengambil log sesi:", e);
    }
}

// ========================================================
//  FUNGSI: MEMBUKA MODAL DAN MENAMPILKAN DETAIL SESI
// ========================================================
async function bukaDetailSesi(start, end) {
    // Tampilkan Modal Bootstrap
    const modalDetail = new bootstrap.Modal(document.getElementById('modalDetailSesi'));
    modalDetail.show();
    
    const tbody = document.getElementById('tableBodyDetailSesi');
    tbody.innerHTML = '<tr><td colspan="4" class="text-muted py-4"><i class="fa-solid fa-spinner fa-spin me-2"></i>Mengambil data detail...</td></tr>';
    
    // Ubah label tanggal
    const endLabel = end !== 'null' ? new Date(end).toLocaleString('id-ID') : 'Sekarang (Berjalan)';
    document.getElementById('labelWaktuSesi').innerText = `${new Date(start).toLocaleString('id-ID')} s/d ${endLabel}`;

    try {
        const res = await fetch(`/api/sensor-range?start=${start}&end=${end}`);
        const dataDetail = await res.json();
        tbody.innerHTML = '';
        
        const labels = [], dataSuhu = [], dataLembap = [];
        
        dataDetail.forEach(item => {
            const time = new Date(item.waktu).toLocaleTimeString('id-ID');
            labels.push(time); 
            dataSuhu.push(item.suhu); 
            dataLembap.push(item.kelembapan);
            
            tbody.innerHTML += `<tr>
                <td class="text-muted">${time}</td>
                <td class="text-danger fw-bold">${item.suhu.toFixed(1)}</td>
                <td class="text-info fw-bold">${item.kelembapan.toFixed(1)}</td>
                <td>${dapatkanStatus(item.suhu, item.kelembapan)}</td>
            </tr>`;
        });

        // Gambar ulang grafik di dalam modal
        if (chartDetailInstance) {
            chartDetailInstance.destroy();
        }
        
        const ctxModal = document.getElementById('chartDetailSesi').getContext('2d');
        chartDetailInstance = new Chart(ctxModal, {
            type: 'line', 
            data: { 
                labels: labels, 
                datasets: [
                    { label: 'Suhu', data: dataSuhu, borderColor: '#ef4444', borderWidth: 2, tension: 0.1, pointRadius: 1 },
                    { label: 'Lembap', data: dataLembap, borderColor: '#06b6d4', borderWidth: 2, tension: 0.1, yAxisID: 'y1', pointRadius: 1 }
                ]
            },
            options: { 
                responsive: true, maintainAspectRatio: false, 
                interaction: { mode: 'index', intersect: false },
                scales: { 
                    y: { position: 'left' }, 
                    y1: { position: 'right', grid: { drawOnChartArea: false } } 
                } 
            }
        });
    } catch (e) { 
        tbody.innerHTML = '<tr><td colspan="4" class="text-danger py-4">Gagal memuat detail data dari server.</td></tr>'; 
    }
}

// ========================================================
//  FUNGSI: VALIDASI STATUS ALAT (ONLINE / OFFLINE)
// ========================================================
function cekStatusKoneksi() {
    const badge = document.getElementById('espStatus');
    const sekarang = Date.now();
    
    if (waktuTerakhirUpdate === 0) { 
        badge.className = 'badge bg-secondary px-3 py-2 fs-6'; 
        badge.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>Menunggu Data...'; 
    } else if (sekarang - waktuTerakhirUpdate > BATAS_OFFLINE) { 
        badge.className = 'badge bg-danger px-3 py-2 fs-6'; 
        badge.innerHTML = '<i class="fa-solid fa-circle-xmark me-2"></i>Offline (Alat Terputus)'; 
        document.getElementById('liveTemp').className = 'value-display text-muted'; 
        document.getElementById('liveHum').className = 'value-display text-muted'; 
    } else { 
        badge.className = 'badge bg-success px-3 py-2 fs-6'; 
        badge.innerHTML = '<i class="fa-solid fa-wifi me-2"></i>Online (Terhubung)'; 
        document.getElementById('liveTemp').className = 'value-display text-danger'; 
        document.getElementById('liveHum').className = 'value-display text-info'; 
    }
}

// ========================================================
//  JALANKAN FUNGSI SECARA OTOMATIS
// ========================================================
pollDataSensor(); 
ambilLogSesi();

setInterval(pollDataSensor, 5000); // Refresh data realtime 5 detik
setInterval(cekStatusKoneksi, 1000); // Cek status koneksi 1 detik
setInterval(ambilLogSesi, 60000); // Refresh data sesi setiap 1 menit

// ========================================================
//  FUNGSI: EXPORT KE CSV
// ========================================================
document.getElementById('btnExport').addEventListener('click', async function() {
    // Tombol export sekarang langsung mendownload dari endpoint /api/export-csv
    // yang akan menarik SEMUA data dari MongoDB
    window.location.href = '/api/export-csv';
});