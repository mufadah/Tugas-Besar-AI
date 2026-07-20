const express = require('express');
const serverless = require('serverless-http');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const router = express.Router();

app.use(cors({ origin: '*', methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());

// =============================================
//  1. KONEKSI MONGODB CACHED
// =============================================
let isConnected = false;

async function connectDatabase() {
  if (isConnected) return;
  try {
    const db = await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false });
    isConnected = db.connections[0].readyState;
  } catch (err) {
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
//  2. SKEMA DATABASE
// =============================================
const SensorSchema = new mongoose.Schema({
  ruangan: String,
  suhu: Number,
  kelembapan: Number,
  waktu: { type: Date, default: Date.now }
});

const Sensor = mongoose.models.Sensor || mongoose.model('Sensor', SensorSchema);

// =============================================
//  3. RUTE API
// =============================================

// [POST] Simpan data dari ESP32
router.post('/sensor', async (req, res) => {
  try {
    const { ruangan, suhu, kelembapan } = req.body;
    const dataBaru = new Sensor({ ruangan: ruangan || "Ruang Bayi 1 (NICU)", suhu, kelembapan });
    await dataBaru.save({ checkKeys: false });
    res.status(201).json({ message: 'Data tersimpan!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// [GET] Data Realtime (20 terakhir untuk grafik utama)
router.get('/sensor', async (req, res) => {
  try {
    const dataTerakhir = await Sensor.find().sort({ waktu: -1 }).limit(20);
    if (!dataTerakhir || dataTerakhir.length === 0) return res.status(404).json({ message: 'Kosong' });
    res.status(200).json(dataTerakhir.reverse());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// [GET] Logika Histori Sesi Alat (Tak Terbatas)
router.get('/log-sesi', async (req, res) => {
  try {
    const data = await Sensor.find().sort({ waktu: 1 });
    if (!data || data.length === 0) return res.status(200).json([]);

    const sessions = [];
    let currentSession = null;
    const GAP_THRESHOLD = 2 * 60 * 1000; // Celah 2 menit = Sesi Putus

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const time = new Date(row.waktu).getTime();

      if (!currentSession) {
        currentSession = { waktuMulai: row.waktu, waktuSelesai: row.waktu, dataSuhu: [row.suhu], lastTime: time };
      } else {
        const diff = time - currentSession.lastTime;
        if (diff > GAP_THRESHOLD) {
          sessions.push(formatSession(currentSession)); 
          currentSession = { waktuMulai: row.waktu, waktuSelesai: row.waktu, dataSuhu: [row.suhu], lastTime: time };
        } else {
          currentSession.waktuSelesai = row.waktu;
          currentSession.dataSuhu.push(row.suhu);
          currentSession.lastTime = time;
        }
      }
    }

    if (currentSession) {
      const now = Date.now();
      if (now - currentSession.lastTime <= GAP_THRESHOLD) currentSession.waktuSelesai = null; 
      sessions.push(formatSession(currentSession));
    }
    res.status(200).json(sessions.reverse());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// [GET] Detail Data Dalam Rentang Waktu Sesi (Untuk Modal)
router.get('/sensor-range', async (req, res) => {
  try {
    const { start, end } = req.query;
    let query = { waktu: { $gte: new Date(start) } };
    if (end && end !== 'null' && end !== 'undefined') query.waktu.$lte = new Date(end);
    
    const data = await Sensor.find(query).sort({ waktu: 1 });
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper Format Sesi
function formatSession(session) {
  const avgSuhu = session.dataSuhu.reduce((a, b) => a + b, 0) / session.dataSuhu.length;
  let durasiStr = "Sedang Dihitung...";
  if (session.waktuSelesai) {
    const diffMins = Math.floor((new Date(session.waktuSelesai) - new Date(session.waktuMulai)) / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const remMins = diffMins % 60;
    if (diffHours > 0) durasiStr = `${diffHours} Jam ${remMins} Menit`;
    else if (diffMins > 0) durasiStr = `${remMins} Menit`;
    else durasiStr = "< 1 Menit";
  }
  return { waktuMulai: session.waktuMulai, waktuSelesai: session.waktuSelesai, durasi: durasiStr, rataSuhu: avgSuhu };
}

router.get('/chart', async (req, res) => {
  try {

    const range = req.query.range || "today";

    let startDate = new Date();

    switch (range) {

      case "7days":
        startDate.setDate(startDate.getDate() - 7);
        break;

      case "30days":
        startDate.setDate(startDate.getDate() - 30);
        break;

      case "all":
        startDate = new Date("2000-01-01");
        break;

      default: // today
        startDate.setHours(0,0,0,0);
    }

    const data = await Sensor.find({
      waktu: { $gte: startDate }
    }).sort({ waktu: 1 });

    res.json(data);

  } catch(err){
    res.status(500).json({
      error: err.message
    });
  }
});

app.use('/api', router);
app.use('/.netlify/functions/api', router);

// Tambahkan rute ini di api.js
router.get('/export-csv', async (req, res) => {
  try {
    // Ambil SEMUA data tanpa limit
    const allData = await Sensor.find().sort({ waktu: 1 });
    
    // Format menjadi CSV string
    let csv = "Timestamp,Ruangan,Suhu (C),Kelembapan (%)\n";
    allData.forEach(row => {
      csv += `${row.waktu.toISOString()},${row.ruangan},${row.suhu},${row.kelembapan}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="Full_Log_NICU.csv"');
    res.status(200).send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports.handler = serverless(app);