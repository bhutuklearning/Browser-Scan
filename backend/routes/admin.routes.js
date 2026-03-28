import express from 'express';
import { getStats, getAdminAnalytics, getAllRawLogs } from '../controllers/admin.controller.js';

const router = express.Router();

// --- API Key Middleware ---
// All /api/admin/* routes require the X-Admin-Key header to match ADMIN_API_KEY in .env
const requireApiKey = (req, res, next) => {
    const key = req.headers['x-admin-key'];
    // Fallback to a default key if the environment variable is not set (e.g., in production on Render)
    const validKey = process.env.ADMIN_API_KEY || 'scanbrowser-admin-2026';

    if (key !== validKey) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
    }
    next();
};

router.use(requireApiKey);

router.get('/stats', getStats);             // Used by frontend index.html on load
router.get('/analytics', getAdminAnalytics); // Geo hotspots + IP distribution
router.get('/logs', getAllRawLogs);           // Decompressed raw log data

export default router;