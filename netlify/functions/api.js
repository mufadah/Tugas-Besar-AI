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
    const dataTerakhir = await Sensor.findOne().sort({ waktu: -1 });
    if (!dataTerakhir) {
      return res.status(404).json({ message: 'Database masih kosong' });
    }
    res.status(200).json(dataTerakhir);
  } catch (error) {
    console.error('Error saat mengambil data:', error);
    res.status(500).json({ error: error.message });
  }
});

app.use('/api', router);
app.use('/.netlify/functions/api', router);

module.exports.handler = serverless(app);