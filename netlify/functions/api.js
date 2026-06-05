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
//  1. KONEKSI MONGODB DENGAN POLA CACHED (ANTI-TIMEOUT)
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
      // Opsi tambahan agar Mongoose langsung melempar error jika koneksi gagal,
      // bukannya melakukan buffering selama 10 detik yang bikin timeout.
      bufferCommands: false, 
    });
    isConnected = db.connections[0].readyState;
    console.log(' Berhasil terhubung ke MongoDB Atlas!');
  } catch (err) {
    console.error('❌ Gagal terhubung ke MongoDB:', err.message);
    throw err;
  }
}

// Middleware otomatis untuk memastikan database terhubung sebelum membaca rute API
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

// Hapus parameter ketiga agar Mongoose kembali menggunakan nama standar 'sensors'
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
    
    // Matikan buffer pada instance ini demi keamanan serverless
    await dataBaru.save({ checkKeys: false });
    res.status(201).json({ message: 'Data ESP32 sukses disimpan ke cloud!' });
  } catch (error) {
    console.error('Error saat simpan data:', error);
    res.status(500).json({ error: error.message });
  }
});

// [GET] Mengirimkan data paling baru ke Website
router.get('/sensor', async (req, res) => {
  try {
    const dataTerakhir = await Sensor.find().sort({ waktu: -1 }).limit(20);
    
    // 1. Cek dulu apakah data kosong (Mongoose find() mengembalikan array kosong [] jika tidak ada data)
    if (!dataTerakhir || dataTerakhir.length === 0) {
      return res.status(404).json({ message: 'Database masih kosong' });
    }
    
    // 2. Balik urutan data agar kronologis dari lama -> baru di grafik website, lalu gunakan RETURN
    return res.status(200).json(dataTerakhir.reverse());
    
  } catch (error) {
    console.error('Error saat mengambil data:', error);
    // 3. Pastikan di blok catch juga menggunakan RETURN demi keamanan serverless
    return res.status(500).json({ error: error.message });
  }
});

// [GET] Mengambil Log Agregasi Rata-rata per 30 Menit
router.get('/log-30menit', async (req, res) => {
  try {
    const logAgregasi = await Sensor.aggregate([
      {
        $group: {
          _id: {
            year: { $year: "$waktu" },
            month: { $month: "$waktu" },
            day: { $dayOfMonth: "$waktu" },
            hour: { $hour: "$waktu" },
            // Membagi menit menjadi blok 30 menitan (contoh: menit 15 jadi 0, menit 45 jadi 30)
            minute: {
              $subtract: [
                { $minute: "$waktu" },
                { $mod: [{ $minute: "$waktu" }, 30] }
              ]
            }
          },
          rataSuhu: { $avg: "$suhu" },
          rataKelembapan: { $avg: "$kelembapan" }
        }
      },
      // Mengurutkan dari blok waktu paling baru ke paling lama
      { $sort: { "_id.year": -1, "_id.month": -1, "_id.day": -1, "_id.hour": -1, "_id.minute": -1 } },
      { $limit: 10 } // Batasi hanya menampilkan 10 blok waktu terakhir
    ]);
    
    return res.status(200).json(logAgregasi);
  } catch (error) {
    console.error('Error saat agregasi data 30 menit:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.use('/api', router);
app.use('/.netlify/functions/api', router);

module.exports.handler = serverless(app);