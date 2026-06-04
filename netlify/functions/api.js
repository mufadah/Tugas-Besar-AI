const express = require('express');
const serverless = require('serverless-http');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// 1. Koneksi ke MongoDB Atlas menggunakan Environment Variable Netlify
const mongoURI = process.env.MONGODB_URI;
mongoose.connect(mongoURI)
  .then(() => console.log('MongoDB Terhubung...'))
  .catch(err => console.error('Gagal koneksi MongoDB:', err));

// 2. Definisi Schema & Model Sensor (Sesuaikan dengan skema Anda)
const SensorSchema = new mongoose.Schema({
  ruangan: String,
  suhu: Number,
  kelembapan: Number,
  waktu: { type: Date, default: Date.now }
});

// Pastikan nama collection-nya sesuai (misal: "sensors" atau "datasensor")
const Sensor = mongoose.models.Sensor || mongoose.model('Sensor', SensorSchema);

// =============================================
//   RUTE API (BACKEND)
// =============================================

// 🟢 RUTE POST: Menerima data dari ESP32
app.post('/api/sensor', async (req, res) => {
  try {
    const dataBaru = new Sensor({
      ruangan: req.body.ruangan,
      suhu: req.body.suhu,
      kelembapan: req.body.kelembapan
    });
    
    await dataBaru.save();
    res.status(201).json({ message: 'Data berhasil disimpan ke MongoDB!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🔵 RUTE GET: Menyajikan data terbaru ke Website (script.js)
app.get('/api/sensor', async (req, res) => {
  try {
    // Mengambil 1 data paling terakhir dimasukkan
    const dataTerakhir = await Sensor.findOne().sort({ waktu: -1 });
    res.status(200).json(dataTerakhir);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export fungsi agar dikenali sebagai Netlify Functions
module.exports.handler = serverless(app);