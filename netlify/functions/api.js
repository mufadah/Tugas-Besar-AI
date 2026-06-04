require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const serverless = require('serverless-http');

const app = express();
app.use(cors());
app.use(express.json());

let isConnected = false;
const connectDB = async () => {
  if (isConnected) return;
  try {
    await mongoose.connect(process.env.MONGO_URI);
    isConnected = true;
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
  }
};

const Sensor = mongoose.models.Sensor || mongoose.model('Sensor', new mongoose.Schema({
  suhu:         { type: Number, required: true },
  kelembapan:   { type: Number, required: true },
  ruangan:      { type: String, required: true },
  waktu_update: { type: Date, default: Date.now }
}));

// POST /api/sensor (Dari ESP32)
app.post('/api/sensor', async (req, res) => {
  try {
    await connectDB();
    const { suhu, kelembapan, ruangan } = req.body;
    if (suhu === undefined || kelembapan === undefined || !ruangan) {
      return res.status(400).json({ error: 'Field wajib diisi' });
    }
    const dataBaru = new Sensor({ suhu, kelembapan, ruangan });
    await dataBaru.save();
    res.status(200).json({ message: 'Data tersimpan', data: dataBaru });
  } catch (e) {
    res.status(500).json({ error: 'Gagal menyimpan data' });
  }
});

// GET /api/get-sensor (Untuk Dashboard)
app.get('/api/get-sensor', async (req, res) => {
  try {
    await connectDB();
    const filter = req.query.ruangan ? { ruangan: req.query.ruangan } : {};
    const data = await Sensor.find(filter).sort({ waktu_update: -1 }).limit(15);
    const formatData = data.map(item => ({
      waktu_update: item.waktu_update,
      ruangan: item.ruangan,
      suhu: item.suhu,
      kelembapan: item.kelembapan
    }));
    res.json(formatData.reverse()); 
  } catch (e) {
    res.status(500).json({ error: 'Gagal mengambil data' });
  }
});

// GET /api/log-30menit
app.get('/api/log-30menit', async (req, res) => {
  try {
    await connectDB();
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
            slot: { $subtract: [ { $toLong: '$waktu_update' }, { $mod: [{ $toLong: '$waktu_update' }, INTERVAL_MS] } ] }
          },
          rataSuhu:       { $avg: '$suhu' },
          rataKelembapan: { $avg: '$kelembapan' },
          waktu:          { $first: '$waktu_update' }
        }
      },
      { $sort: { '_id.slot': -1 } },
      { $limit: 40 },
      {
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
    res.status(500).json({ error: 'Gagal mengambil log' });
  }
});

module.exports.handler = serverless(app);