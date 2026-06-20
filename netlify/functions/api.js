const express = require('express');
const serverless = require('serverless-http');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const router = express.Router();

app.use(cors({
  origin: '*', // Izinkan semua akses untuk debugging
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// =============================================
//  1. KONEKSI MONGODB DENGAN POLA CACHED
// =============================================
let isConnected = false;

async function connectDatabase() {
  if (isConnected) {
    console.log('=> Menggunakan koneksi database yang sudah ada (Cached).');
    return;
  }

  console.log('=> Membuka koneksi baru ke MongoDB Atlas...');
  try {
    const db = await mongoose.connect(process.env.MONGODB_URI, {
      bufferCommands: false, 
    });
    isConnected = db.connections[0].readyState;
    console.log('✅ Berhasil terhubung ke MongoDB Atlas!');
  } catch (err) {
    console.error('❌ Gagal terhubung ke MongoDB:', err.message);
    throw err;
  }
}

app.use(async (req, res, next) => {
  try {
    await connectDatabase();
    next();
  } catch (err) {
    res.status(500).json({ error: "Gagal tersambung ke database cloud: " + err.message });
  }
});

// =============================================
//  2. SKEMA DATABASE (MODEL)
// =============================================
const SensorSchema = new mongoose.Schema({
  ruangan: String,
  suhu: Number,
  kelembapan: Number,
  waktu: { type: Date, default: Date.now }
});

const Sensor = mongoose.models.Sensor || mongoose.model('Sensor', SensorSchema);

// =============================================
//  3. RUTE API (ROUTER)
// =============================================

// [POST] Menerima data sensor dari ESP32
router.post('/sensor', async (req, res) => {
  console.log("Data diterima dari ESP32:", req.body);
  try {
    const { ruangan, suhu, kelembapan } = req.body;
    
    const dataBaru = new Sensor({
      ruangan: ruangan || "Ruang Bayi 1 (NICU)",
      suhu: suhu,
      kelembapan: kelembapan
    });
    
    await dataBaru.save({ checkKeys: false });
    res.status(201).json({ message: 'Data ESP32 sukses disimpan ke cloud!' });
  } catch (error) {
    console.error('Error saat simpan data:', error);
    res.status(500).json({ error: error.message });
  }
});

// [GET] Mengirimkan data paling baru ke Website (Telah Diperbaiki)
router.get('/sensor', async (req, res) => {
  try {
    const dataTerakhir = await Sensor.find().sort({ waktu: -1 }).limit(20);
    
    if (!dataTerakhir || dataTerakhir.length === 0) {
      return res.status(404).json({ message: 'Database masih kosong' });
    }
    
    // Reverse agar data di array sesuai urutan waktu maju (untuk grafik visualisasi)
    res.status(200).json(dataTerakhir.reverse());
  } catch (error) {
    console.error('Error saat mengambil data:', error);
    res.status(500).json({ error: error.message });
  }
});

// 🔥 [GET] LOGIKA HISTORI SESI ALAT (BARU) 🔥
router.get('/log-sesi', async (req, res) => {
  try {
    // Ambil data (misal maksimal 2000 data terakhir agar memori fungsi Netlify tidak jebol)
    const data = await Sensor.find().sort({ waktu: 1 }).limit(2000);
    
    if (!data || data.length === 0) {
      return res.status(200).json([]);
    }

    const sessions = [];
    let currentSession = null;
    const GAP_THRESHOLD = 2 * 60 * 1000; // Celah 2 menit (dalam milidetik)

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const time = new Date(row.waktu).getTime();

      if (!currentSession) {
        // Buka Sesi Pertama
        currentSession = { waktuMulai: row.waktu, waktuSelesai: row.waktu, dataSuhu: [row.suhu], lastTime: time };
      } else {
        const diff = time - currentSession.lastTime;
        
        // Jika selisih waktu log sekarang dengan log sebelumnya lebih dari 2 menit = Alat sempat mati/putus
        if (diff > GAP_THRESHOLD) {
          sessions.push(formatSession(currentSession)); // Simpan sesi lama
          // Buka sesi baru
          currentSession = { waktuMulai: row.waktu, waktuSelesai: row.waktu, dataSuhu: [row.suhu], lastTime: time };
        } else {
          // Masih dalam sesi yang sama (update waktu selesai & tambah array suhu)
          currentSession.waktuSelesai = row.waktu;
          currentSession.dataSuhu.push(row.suhu);
          currentSession.lastTime = time;
        }
      }
    }

    // Eksekusi sesi paling akhir
    if (currentSession) {
      const now = Date.now();
      // Cek apakah data terakhir ini masih baru (< 2 menit yang lalu). Jika ya, alat masih menyala.
      if (now - currentSession.lastTime <= GAP_THRESHOLD) {
        currentSession.waktuSelesai = null; 
      }
      sessions.push(formatSession(currentSession));
    }

    // Kirim data, dibalik agar sesi paling baru ada di atas (batas 30 sesi terakhir)
    res.status(200).json(sessions.reverse().slice(0, 30));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper untuk menghitung durasi & rata-rata di BE
function formatSession(session) {
  const avgSuhu = session.dataSuhu.reduce((a, b) => a + b, 0) / session.dataSuhu.length;
  let durasiStr = "Sedang Dihitung...";
  
  if (session.waktuSelesai) {
    const diffMs = new Date(session.waktuSelesai) - new Date(session.waktuMulai);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const remMins = diffMins % 60;
    
    if (diffHours > 0) durasiStr = `${diffHours} Jam ${remMins} Menit`;
    else if (diffMins > 0) durasiStr = `${remMins} Menit`;
    else durasiStr = "< 1 Menit";
  }

  return {
    waktuMulai: session.waktuMulai,
    waktuSelesai: session.waktuSelesai,
    durasi: durasiStr,
    rataSuhu: avgSuhu
  };
}

app.use('/api', router);
app.use('/.netlify/functions/api', router);

module.exports.handler = serverless(app);