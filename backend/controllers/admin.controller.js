import Log from '../models/Log.js';
import zlib from 'zlib';
import { promisify } from 'util';

const gunzip = promisify(zlib.gunzip);

// GET /api/admin/stats — Total audit count + browser distribution
// Used by the main frontend to show system-wide stats on load
export const getStats = async (req, res) => {
    try {
        const totalRequests = await Log.countDocuments();

        const browserStats = await Log.aggregate([
            { $group: { _id: '$browser', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        res.json({ totalRequests, browsers: browserStats });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
};

// GET /api/admin/analytics — Geo hotspots & IP distribution
// NOTE: lat/lng are stored in the compressed payload, so we aggregate
// on the uncompressed top-level fields (ip, browser) only.
export const getAdminAnalytics = async (req, res) => {
    try {
        // Top IPs by scan count
        const ipDistribution = await Log.aggregate([
            { $group: { _id: '$ip', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        // Browser distribution
        const browserDistribution = await Log.aggregate([
            { $group: { _id: '$browser', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        res.json({ ipDistribution, browserDistribution });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/admin/logs — Fetch and decompress all raw logs
export const getAllRawLogs = async (req, res) => {
    try {
        const logs = await Log.find().sort({ receivedAt: -1 }).lean();
        const decrypted = await Promise.all(
            logs.map(async (log) => {
                try {
                    const buffer = await gunzip(log.payload);
                    return {
                        id: log._id,
                        ip: log.ip,
                        browser: log.browser,
                        receivedAt: log.receivedAt,
                        ...JSON.parse(buffer.toString())
                    };
                } catch (e) {
                    return { id: log._id, ip: log.ip, error: 'Decompression failed' };
                }
            })
        );
        res.json(decrypted);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
};