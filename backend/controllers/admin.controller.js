import Log from '../models/Log.js';
import zlib from 'zlib';
import { promisify } from 'util';

const gunzip = promisify(zlib.gunzip);

export const getAdminAnalytics = async (req, res) => {
    try {
        // 1. Geographical Hotspots: Grouping by rounded Lat/Long to find common areas
        const geoHotspots = await Log.aggregate([
            {
                $group: {
                    _id: {
                        lat: { $substr: ["$latitude", 0, 5] },
                        lng: { $substr: ["$longitude", 0, 5] }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);

        // 2. IP Region Analysis: Grouping by IP (or subnet)
        const ipDistribution = await Log.aggregate([
            { $group: { _id: "$ip", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        res.json({ geoHotspots, ipDistribution });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const getAllRawLogs = async (req, res) => {
    try {
        const logs = await Log.find().sort({ receivedAt: -1 }).lean();
        const decrypted = await Promise.all(logs.map(async (log) => {
            const buffer = await gunzip(log.payload);
            return { ...JSON.parse(buffer.toString()), id: log._id, ip: log.ip };
        }));
        res.json(decrypted);
    } catch (err) {
        res.status(500).json({ error: "Decompression failed" });
    }
};