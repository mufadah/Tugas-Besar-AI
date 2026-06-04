const express = require('express');
const serverless = require('serverless-http');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const router = express.Router();

// Middleware dasar
app.use(cors());
app.use(express.json());

// =============================================
//  1. KONEKSI KE MONGODB ATLAS
// =============================================
// Pastikan MONGODB_URI sudah diisi di menu Environment Variables Netlify
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Berhasil terhubung ke MongoDB Atlas!'))
  .catch((err) => console.error('Gagal terhubung ke MongoDB:', err));

// =============================================
//  2. SKEMA DATABASE (MODEL)
// =============================================
const SensorSchema = new mongoose.Schema({
  ruangan: String,
  suhu: Number,
  kelembapan: Number,
  waktu: { type: Date, default: Date.now }
});

// Mencegah error penumpukan model saat serverless me-restart fungsi
const Sensor = mongoose.models.Sensor || mongoose.model('Sensor', SensorSchema);

// =============================================
//  3. RUTE API (ROUTER)
// =============================================

// [POST] Menerima data sensor yang dikirim dari ESP32
router.post('/sensor', async (req, res) => {
  try {
    const { ruangan, suhu, kelembapan } = req.body;
    
    const dataBaru = new Sensor({
      ruangan: ruangan || "Ruang Bayi 1 (NICU)",
      suhu: suhu,
      kelembapan: kelembapan
    });
    
    await dataBaru.save();
    res.status(201).json({ message: 'Data ESP32 sukses disimpan ke cloud!' });
  } catch (error) {
    console.error('Error saat simpan data:', error);
    res.status(500).json({ error: error.message });
  }
});

// [GET] Mengirimkan data paling baru ke Website (script.js)
router.get('/sensor', async (req, res) => {
  try {
    // Cari 1 data dengan waktu terbaru (sort -1)
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

// =============================================
//  4. MOUNTING & EXPORT (WAJIB UNTUK NETLIFY)
// =============================================
// Trik agar API terbaca baik dengan atau tanpa redirect netlify.toml
app.use('/api', router);
app.use('/.netlify/functions/api', router);

// Membungkus aplikasi Express menjadi fungsi Serverless
module.exports.handler = serverless(app);