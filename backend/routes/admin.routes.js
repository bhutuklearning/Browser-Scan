import express from 'express';
import { getAdminAnalytics, getAllRawLogs } from '../controllers/admin.controller.js';

const router = express.Router();

router.get('/analytics', getAdminAnalytics);
router.get('/logs', getAllRawLogs);

export default router;