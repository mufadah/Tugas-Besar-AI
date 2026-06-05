const express = require('express');
const serverless = require('serverless-http');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const router = express.Router();

// Middleware
app.use(cors());
app.use(express.json());

// Konfigurasi Koneksi MongoDB (Serverless-safe Pattern)
let isConnected = false;

async function connectToDatabase() {
    if (isConnected) {
        return;
    }
    console.log("=> Membuka koneksi baru ke MongoDB Atlas...");
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000
        });
        isConnected = true;
        console.log("Berhasil terhubung ke MongoDB Atlas!");
    } catch (error) {
        console.error("Gagal terhubung ke MongoDB Atlas:", error.message);
        throw error;
    }
}

// Skema & Model Data (Sesuaikan kolom dengan project IoT/Dashboard Anda)
const DataLogSchema = new mongoose.Schema({
    timestamp: { type: String, required: true },
    ruangan: { type: String, required: true },
    suhu: { type: Number, required: true },
    kelembapan: { type: Number, required: true }
}, { collection: 'logs' });

const DataLog = mongoose.models.DataLog || mongoose.model('DataLog', DataLogSchema);

// Middleware untuk memastikan database terkoneksi di setiap request
router.use(async (req, res, next) => {
    try {
        await connectToDatabase();
        next();
    } catch (error) {
        return res.status(500).json({ 
            status: "error", 
            message: "Koneksi database gagal terhubung." 
        });
    }
});

// 1. Endpoint Ambil Data (GET) - Ini yang sebelumnya memicu ERR_HTTP_HEADERS_SENT
router.get('/logs', async (req, res) => {
    try {
        const logs = await DataLog.find().sort({ _id: -1 }).limit(100);
        // Pastikan menggunakan return untuk menghentikan fungsi
        return res.status(200).json(logs); 
    } catch (error) {
        console.error("Error saat mengambil data:", error);
        // Pastikan menggunakan return di blok catch
        return res.status(500).json({ 
            status: "error", 
            message: "Gagal mengambil data dari database." 
        });
    }
});

// 2. Endpoint Tambah Data (POST) - Biasanya digunakan oleh ESP32 / Simulator Data
router.post('/logs', async (req, res) => {
    try {
        const { ruangan, suhu, kelembapan } = req.body;
        
        if (!ruangan || suhu == null || kelembapan == null) {
            return res.status(400).json({ 
                status: "error", 
                message: "Data tidak lengkap! Pastikan nilai ruangan, suhu, dan kelembapan terisi." 
            });
        }

        const logBaru = new DataLog({
            timestamp: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }),
            ruangan,
            suhu: Number(suhu),
            kelembapan: Number(kelembapan)
        });

        await logBaru.save();
        return res.status(201).json({ 
            status: "success", 
            message: "Data berhasil disimpan!", 
            data: logBaru 
        });
    } catch (error) {
        console.error("Error saat menyimpan data:", error);
        return res.status(500).json({ 
            status: "error", 
            message: "Gagal menyimpan data ke database." 
        });
    }
});

// Integrasi Express Router ke Base Path Netlify Functions
app.use('/.netlify/functions/api', router);

module.exports.handler = serverless(app);