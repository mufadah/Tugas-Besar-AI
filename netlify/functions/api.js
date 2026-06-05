const express = require('express');
const serverless = require('serverless-http');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const router = express.Router();

app.use(cors({
  origin: '*', 
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
      bufferCommands: false, 
    });
    isConnected = db.connections[0].readyState;
    console.log('Berhasil terhubung ke MongoDB Atlas!');
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
    // Tambahkan return untuk memastikan eksekusi middleware berhenti di sini saat error
    return res.status(500).json({ error: "Gagal tersambung ke database cloud: " + err.message });
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
      suhu: parseFloat(suhu),
      kelembapan: parseFloat(kelembapan)
    });
    
    await dataBaru.save({ checkKeys: false });
    return res.status(201).json({ message: 'Data ESP32 sukses disimpan ke cloud!' });
  } catch (error) {
    console.error('Error saat simpan data:', error);
    // Menggunakan return untuk mencegah kebocoran respon ganda jika ada alur internal yang berlanjut
    return res.status(500).json({ error: error.message });
  }
});

// [GET] Mengirimkan data histori untuk kebutuhan Dashboard
router.get('/sensor', async (req, res) => {
  try {
    // Mengambil 20 data terakhir untuk menyuplai komponen Chart.js & log tabel
    const dataTerakhir = await Sensor.find().sort({ waktu: -1 }).limit(20);
    
    if (!dataTerakhir || dataTerakhir.length === 0) {
      return res.status(200).json([]); // Kirim array kosong jika DB belum terisi
    }
    
    // Membalikkan urutan agar data paling lampau di kiri dan data paling baru di kanan grafik
    return res.status(200).json(dataTerakhir.reverse());
  } catch (error) {
    console.error('Error saat mengambil data:', error);
    // Pastikan menggunakan return di dalam catch block agar proses berhenti
    return res.status(500).json({ error: error.message });
  }
});

app.use('/api', router);
app.use('/.netlify/functions/api', router);

module.exports.handler = serverless(app);