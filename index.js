require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');       // 🔥 Ditambahkan untuk HTTP server
const WebSocket = require('ws');    // 🔥 Ditambahkan untuk WebSockets

const app = express();
const PORT = process.env.PORT || 3000;

// ── Gabungkan Express dengan HTTP Server & WebSocket ────────────────
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

// ── Koneksi MongoDB ──────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// ── Schema & Model ───────────────────────────────────────────────
const Sensor = mongoose.model('Sensor', new mongoose.Schema({
  suhu:         { type: Number, required: true },
  kelembapan:   { type: Number, required: true },
  ruangan:      { type: String, required: true },
  waktu_update: { type: Date, default: Date.now }
}));

// ── Event Listener WebSocket (Dashboard) ─────────────────────────
wss.on('connection', (ws) => {
  console.log('🔌 Dashboard terhubung melalui WebSocket');
});

// ── POST /api/sensor (Dari ESP32) ─────────────────────────────
app.post('/api/sensor', async (req, res) => {
  try {
    const { suhu, kelembapan, ruangan } = req.body;

    if (suhu === undefined || kelembapan === undefined || !ruangan) {
      return res.status(400).json({ error: 'Field suhu, kelembapan, dan ruangan wajib diisi' });
    }

    const dataBaru = new Sensor({ suhu, kelembapan, ruangan });
    await dataBaru.save();

    // 🔥 BROADCAST DATA REAL-TIME KE DASHBOARD HTML LEWAT WEBSOCKET
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          ruangan: dataBaru.ruangan,
          suhu: dataBaru.suhu,
          kelembapan: dataBaru.kelembapan,
          waktu_update: dataBaru.waktu_update
        }));
      }
    });

    res.status(200).json({ message: 'Data tersimpan', data: dataBaru });

  } catch (e) {
    console.error('POST /api/sensor error:', e.message);
    res.status(500).json({ error: 'Gagal menyimpan data' });
  }
});

// ── GET /api/get-sensor (Untuk Ambil Data Awal Dashboard) ────────
app.get('/api/get-sensor', async (req, res) => {
  try {
    const filter = req.query.ruangan ? { ruangan: req.query.ruangan } : {};
    const data = await Sensor.find(filter).sort({ waktu_update: -1 }).limit(15);
    
    // Format ulang agar sesuai dengan kebutuhan array dataHistori dashboard
    const formatData = data.map(item => ({
      waktu_update: item.waktu_update,
      ruangan: item.ruangan,
      suhu: item.suhu,
      kelembapan: item.kelembapan
    }));

    res.json(formatData.reverse()); 
  } catch (e) {
    console.error('GET /api/get-sensor error:', e.message);
    res.status(500).json({ error: 'Gagal mengambil data' });
  }
});

// ── GET /api/log-30menit (Disinkronkan dengan Fungsi HTML) ───────
app.get('/api/log-30menit', async (req, res) => {
  try {
    const INTERVAL_MS  = 30 * 60 * 1000; 
    const WINDOW_HOURS = 10;              

    const sejak = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000);

    const matchStage = { waktu_update: { $gte: sejak } };
    if (req.query.ruangan) matchStage.ruangan = req.query.ruangan;

    const data = await Sensor.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            ruangan: '$ruangan',
            slot: {
              $subtract: [
                { $toLong: '$waktu_update' },
                { $mod: [{ $toLong: '$waktu_update' }, INTERVAL_MS] }
              ]
            }
          },
          rataSuhu:       { $avg: '$suhu' },
          rataKelembapan: { $avg: '$kelembapan' },
          waktu:          { $first: '$waktu_update' }
        }
      },
      { $sort: { '_id.slot': -1 } }, // Urutkan dari yang terbaru
      { $limit: 40 },
      {
        // 🔥 Diubah agar strukturnya pas dengan format: item._id.year, item._id.month, dll di HTML
        $project: {
          _id: {
            year:  { $year: '$waktu' },
            month: { $month: '$waktu' },
            day:   { $dayOfMonth: '$waktu' },
            hour:  { $hour: '$waktu' },
            minute:{ $minute: '$waktu' }
          },
          ruangan: '$_id.ruangan',
          rataSuhu:       { $round: ['$rataSuhu', 1] },
          rataKelembapan: { $round: ['$rataKelembapan', 1] }
        }
      }
    ]);

    res.json(data);

  } catch (e) {
    console.error('GET /api/log-30menit error:', e.message);
    res.status(500).json({ error: 'Gagal mengambil log' });
  }
});

// ── Start Server ─────────────────────────────────────────────────
// 🔥 Menggunakan server.listen dan mengikat ke '0.0.0.0' agar bisa diakses ESP32 via IP lokal
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT} (Listening to all interfaces)`);
});