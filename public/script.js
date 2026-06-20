// ========================================================
//  KONFIGURASI API & SELECTOR ELEMENT
// ========================================================
const API_URL = '/api/sensor';
const API_LOG_SESI = '/api/log-sesi'; // Endpoint sesi baru

const suhuDisplay = document.getElementById('suhu-display');
const lembapDisplay = document.getElementById('kelembapan-display');
const ruanganDisplay = document.getElementById('ruangan-display');
const waktuDisplay = document.getElementById('waktu-display');
const statusBadge = document.getElementById('status-badge');
const tableLogSesi = document.getElementById('tableLogSesi'); // Target tabel HTML histori sesi

// ========================================================
//  FUNGSI: MENGAMBIL DATA SENSOR REALTIME
// ========================================================
async function ambilDataSensor() {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error(`Status: ${response.status}`);
    
    const arrayData = await response.json();

    // Karena API sekarang mengirim array data (20 data terakhir), kita ambil yang paling ujung/terbaru
    if (Array.isArray(arrayData) && arrayData.length > 0) {
      const dataTerbaru = arrayData[arrayData.length - 1]; 
      perbaruiTampilanDashboard(dataTerbaru);
    } else if (arrayData && arrayData.suhu !== undefined) {
      perbaruiTampilanDashboard(arrayData);
    } else {
      tampilkanStatusMenunggu();
    }
  } catch (error) {
    console.error('Error saat mengambil data:', error);
    if (statusBadge) {
      statusBadge.innerText = "❌ ERROR: PUTUS KONEKSI";
      statusBadge.style.backgroundColor = "#ef4444"; 
    }
  }
}

// ========================================================
//  FUNGSI: MENGAMBIL HISTORI SESI ALAT
// ========================================================
async function ambilLogSesi() {
  // Jika di HTML tidak ada tabelnya, hentikan eksekusi agar tidak muncul error di console
  if (!tableLogSesi) return; 

  try {
    const response = await fetch(API_LOG_SESI);
    const data = await response.json();
    tableLogSesi.innerHTML = '';

    if(data.length === 0) {
      tableLogSesi.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">Belum ada histori sesi terekam.</td></tr>';
      return;
    }

    data.forEach(item => {
      const isSesiAktif = !item.waktuSelesai;
      const waktuSelesaiTeks = isSesiAktif ? '-' : new Date(item.waktuSelesai).toLocaleString('id-ID');
      const waktuMulaiTeks = new Date(item.waktuMulai).toLocaleString('id-ID');
      
      const statusSesi = isSesiAktif 
          ? '<span class="badge bg-primary"><i class="fa-solid fa-satellite-dish fa-beat me-1"></i>Alat Aktif</span>' 
          : '<span class="badge bg-secondary">Sesi Selesai</span>';

      tableLogSesi.innerHTML += `<tr>
          <td>${waktuMulaiTeks}</td>
          <td>${waktuSelesaiTeks}</td>
          <td class="fw-medium">${item.durasi}</td>
          <td class="fw-bold text-danger">${item.rataSuhu.toFixed(1)}</td>
          <td>${statusSesi}</td>
      </tr>`;
    });
  } catch (error) {
    console.error("Gagal mengambil histori sesi:", error);
    tableLogSesi.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-danger">Gagal memuat data sesi.</td></tr>';
  }
}

// ========================================================
//  FUNGSI MANIPULASI DOM
// ========================================================
function perbaruiTampilanDashboard(data) {
  if (suhuDisplay) suhuDisplay.innerText = parseFloat(data.suhu).toFixed(1);
  if (lembapDisplay) lembapDisplay.innerText = parseFloat(data.kelembapan).toFixed(1);
  if (ruanganDisplay) ruanganDisplay.innerText = data.ruangan || "Ruang NICU (Default)";

  if (waktuDisplay) {
    const sekarang = new Date();
    const jam = String(sekarang.getHours()).padStart(2, '0');
    const menit = String(sekarang.getMinutes()).padStart(2, '0');
    const detik = String(sekarang.getSeconds()).padStart(2, '0');
    waktuDisplay.innerText = `${jam}:${menit}:${detik} WIB`;
  }

  if (statusBadge) {
    if (parseFloat(data.suhu) > 35.0) {
      statusBadge.innerText = "⚠️ WARNING: SUHU PANAS!";
      statusBadge.style.backgroundColor = "#dc2626"; 
      statusBadge.style.color = "#ffffff";
      statusBadge.classList.add('animate-pulse'); 
    } else {
      statusBadge.innerText = "✅ STATUS: NORMAL";
      statusBadge.style.backgroundColor = "#16a34a"; 
      statusBadge.style.color = "#ffffff";
      statusBadge.classList.remove('animate-pulse');
    }
  }
}

function tampilkanStatusMenunggu() {
  if (statusBadge) {
    statusBadge.innerText = "⏳ MENCARI DATA ESP32...";
    statusBadge.style.backgroundColor = "#eab308"; 
  }
}

// ========================================================
//  INSIALISASI OTOMATIS SAAT HALAMAN DIBUKA
// ========================================================
document.addEventListener('DOMContentLoaded', () => {
  ambilDataSensor();
  ambilLogSesi();
  
  // Refresh data realtime setiap 5 detik
  setInterval(ambilDataSensor, 5000);

  // Refresh histori sesi setiap 60 detik (tidak perlu secepat realtime)
  setInterval(ambilLogSesi, 60000); 
});