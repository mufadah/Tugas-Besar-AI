// URL Endpoint API (Menyesuaikan dengan routing Netlify Functions atau local server)
const API_URL = '/.netlify/functions/api/logs';

// Fungsi untuk menentukan status berdasarkan suhu dan kelembapan
function dapatkanStatus(suhu, kelembapan) {
    if (suhu >= 30) {
        return '<span class="badge bg-danger">Panas</span>';
    } else if (suhu <= 20) {
        return '<span class="badge bg-info">Dingin</span>';
    } else if (kelembapan < 40) {
        return '<span class="badge bg-warning text-dark">Kering</span>';
    } else {
        return '<span class="badge bg-success">Normal</span>';
    }
}

// Fungsi utama untuk merender data ke tabel dan dashboard
function updateDashboardUI(dataHistori) {
    if (!dataHistori || dataHistori.length === 0) {
        console.warn("Belum ada data log yang tersedia.");
        return;
    }

    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = ''; 

    // Render tabel (data terbaru di atas)
    dataHistori.forEach(item => {
        tbody.innerHTML += `<tr>
            <td class="fw-medium text-muted">${item.timestamp}</td>
            <td>${item.ruangan}</td>
            <td class="fw-bold text-danger">${item.suhu.toFixed(1)} &deg;C</td>
            <td class="fw-bold text-info">${item.kelembapan.toFixed(1)} %</td>
            <td>${dapatkanStatus(item.suhu, item.kelembapan)}</td>
        </tr>`;
    });

    // Tampilkan data paling mutakhir di Card Atas
    const dataTerbaru = dataHistori[0]; // Mengasumsikan API sudah mengurutkan data terbaru di index 0
    document.getElementById('liveTemp').innerText = dataTerbaru.suhu.toFixed(1);
    document.getElementById('liveHum').innerText = dataTerbaru.kelembapan.toFixed(1);
}

// Fungsi untuk mengambil data dari Backend API
async function fetchLogs() {
    try {
        const response = await fetch(API_URL);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        updateDashboardUI(data);
    } catch (error) {
        console.error("Gagal mengambil data dari API:", error);
    }
}

// Eksekusi fungsi saat halaman pertama kali dimuat
document.addEventListener('DOMContentLoaded', () => {
    fetchLogs();
    
    // Auto-refresh data setiap 5 detik agar dashboard real-time
    setInterval(fetchLogs, 5000);
});