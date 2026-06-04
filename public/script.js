// ========================================================
//  KONFIGURASI API & SELECTOR ELEMENT
// ========================================================
// Berkat file netlify.toml, kita cukup memanggil rute relatif '/api/sensor'
const API_URL = '/api/sensor';

// Mengambil referensi elemen HTML berdasarkan ID
const suhuDisplay = document.getElementById('suhu-display');
const lembapDisplay = document.getElementById('kelembapan-display');
const ruanganDisplay = document.getElementById('ruangan-display');
const waktuDisplay = document.getElementById('waktu-display');
const statusBadge = document.getElementById('status-badge');

// ========================================================
//  FUNGSI UTAMA: MENGAMBIL DATA DARI MONGO VIA NETLIFY
// ========================================================
async function ambilDataSensor() {
  try {
    const response = await fetch(API_URL);
    
    if (!response.ok) {
      throw new Error(`Gagal merespon dengan status: ${response.status}`);
    }

    const data = await response.json();

    // Jika data ditemukan (tidak null atau kosong)
    if (data && data.suhu !== undefined) {
      perbaruiTampilanDashboard(data);
    } else {
      tampilkanStatusMenunggu();
    }
  } catch (error) {
    console.error('Error saat mengambil data dari cloud:', error);
    if (statusBadge) {
      statusBadge.innerText = "❌ ERROR: PUTUS KONEKSI SERVER";
      statusBadge.style.backgroundColor = "#ef4444"; // Merah
    }
  }
}

// ========================================================
//  FUNGSI MANIPULASI DOM (MENGUBAH TAMPILAN HTML)
// ========================================================
function perbaruiTampilanDashboard(data) {
  // 1. Update angka suhu dan kelembapan (dibulatkan 1 angka di belakang koma)
  if (suhuDisplay) suhuDisplay.innerText = parseFloat(data.suhu).toFixed(1);
  if (lembapDisplay) lembapDisplay.innerText = parseFloat(data.kelembapan).toFixed(1);
  
  // 2. Update nama ruangan dinamis dari database
  if (ruanganDisplay) ruanganDisplay.innerText = data.ruangan || "Ruang NICU (Default)";

  // 3. Update waktu pembaruan terakhir di browser
  if (waktuDisplay) {
    const sekarang = new Date();
    const jam = String(sekarang.getHours()).padStart(2, '0');
    const menit = String(sekarang.getMinutes()).padStart(2, '0');
    const detik = String(sekarang.getSeconds()).padStart(2, '0');
    waktuDisplay.innerText = `${jam}:${menit}:${detik} WIB`;
  }

  // 4. Logika Indikator Alert Visual (Sesuai Ambang Batas ESP32: 35.0°C)
  if (statusBadge) {
    if (parseFloat(data.suhu) > 35.0) {
      statusBadge.innerText = "⚠️ WARNING: SUHU PANAS!";
      statusBadge.style.backgroundColor = "#dc2626"; // Merah pekat
      statusBadge.style.color = "#ffffff";
      statusBadge.classList.add('animate-pulse'); // Efek berkedip jika Anda menggunakan Tailwind CSS
    } else {
      statusBadge.innerText = "✅ STATUS: NORMAL";
      statusBadge.style.backgroundColor = "#16a34a"; // Hijau
      statusBadge.style.color = "#ffffff";
      statusBadge.classList.remove('animate-pulse');
    }
  }
}

function tampilkanStatusMenunggu() {
  if (statusBadge) {
    statusBadge.innerText = "⏳ MENCARI DATA ESP32...";
    statusBadge.style.backgroundColor = "#eab308"; // Kuning/Oranye
  }
}

// ========================================================
//  INSIALISASI OTOMATIS SAAT HALAMAN DIBUKA
// ========================================================
document.addEventListener('DOMContentLoaded', () => {
  // Jalankan sekali di awal saat halaman selesai dimuat
  ambilDataSensor();
  
  // Lakukan polling otomatis (refresh data) setiap 5 detik (5000 milidetik)
  setInterval(ambilDataSensor, 5000);
});