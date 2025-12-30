import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import zlib from 'zlib';
import { promisify } from 'util';

import connectDB from './config/db.js';
import Log from './models/Log.js';
import adminRoutes from './routes/admin.routes.js';

dotenv.config();
const app = express();

// MongoDB Connection Intialization
connectDB();

const PORT = process.env.PORT || 4000;
const LOG_FILE = 'logs.json';

// Helper for compression
const gzip = promisify(zlib.gzip);

// Rate Limiting 
const limiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 100, // Limit each IP to 100 requests per window
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(limiter);

// CORS Configuration
// Replace 'https://your-vercel-project.vercel.app' with your actual Vercel URL
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? 'https://your-vercel-project.vercel.app'
        : '*',
    methods: ['POST', 'GET'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// Routes
// Admin Endpoint
app.use('/api/admin', adminRoutes); // Mount Admin Routes

// Home Route
app.get('/', (req, res) => {
    res.status(200).send("System Diagnostic Logging Server is Active");
});

// app.post('/receive', async (req, res) => {
//     try {
//         const logEntry = {
//             id: Date.now(),
//             // Better IP detection for proxy-heavy environments like Render/Vercel
//             ip: req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress,
//             receivedAt: new Date().toISOString(),
//             ...req.body
//         };

//         let logs = [];
//         try {
//             const fileData = await fs.readFile(LOG_FILE, 'utf8');
//             logs = JSON.parse(fileData);
//         } catch (e) {
//             // Create empty array if file is missing or corrupted
//             logs = [];
//         }

//         logs.push(logEntry);

//         // Use 'null, 2' for readable formatting in logs.json
//         await fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2));

//         console.log(`[AUDIT] Data received from IP: ${logEntry.ip}`);
//         res.status(200).json({ status: "captured", message: "System analysis logged." });
//     } catch (err) {
//         console.error("Write Error:", err);
//         res.status(500).json({ error: "Internal Server Error" });
//     }
// });

app.post('/receive', async (req, res) => {
    try {
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

        // 1. Prepare Data for MongoDB (with compression)
        const dataString = JSON.stringify(req.body);
        const compressedBuffer = await gzip(dataString);

        // 2. DB Operation: Save to MongoDB
        const newLog = new Log({
            payload: compressedBuffer,
            ip: ip,
            browser: req.body.browser || 'Unknown'
        });
        await newLog.save();

        // 3. Existing Operation: Save to logs.json
        const logEntry = {
            id: Date.now(),
            ip,
            receivedAt: new Date().toISOString(),
            ...req.body
        };
        let logs = [];
        try {
            const fileData = await fs.readFile(LOG_FILE, 'utf8');
            logs = JSON.parse(fileData);
        } catch (e) { logs = []; }
        logs.push(logEntry);
        await fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2));

        console.log(`[AUDIT] Data synced to DB and File from IP: ${ip}`);
        res.status(200).json({ status: "captured", message: "Logged to DB and local storage." });
    } catch (err) {
        console.error("Critical Error:", err);
        res.status(500).json({ error: "Logging Failure" });
    }
});

// --- ADMIN API: Get Niche Stats (Total Requests & Browser Distribution) ---
app.get('/api/admin/stats', async (req, res) => {
    try {
        // 1. Count total documents in collection
        const totalRequests = await Log.countDocuments();

        // 2. Aggregate uncompressed 'browser' field to find niche reach
        const browserStats = await Log.aggregate([
            { $group: { _id: "$browser", count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        res.json({
            totalRequests,
            browsers: browserStats
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch stats" });
    }
});

// --- ADMIN API: Fetch & Decompress Raw Logs ---
app.get('/api/admin/logs', async (req, res) => {
    try {
        const encryptedLogs = await Log.find().sort({ receivedAt: -1 }).lean();

        const decryptedLogs = await Promise.all(encryptedLogs.map(async (log) => {
            try {
                const decompressedBuffer = await gunzip(log.payload);
                const originalData = JSON.parse(decompressedBuffer.toString());
                return {
                    id: log._id,
                    ip: log.ip,
                    receivedAt: log.receivedAt,
                    ...originalData
                };
            } catch (e) {
                return { id: log._id, error: "Decompression failed", raw: log.ip };
            }
        }));

        res.json(decryptedLogs);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch logs" });
    }
});

app.listen(PORT, () => {
    console.log(`Secure Server Active on Port: ${PORT}`);
});