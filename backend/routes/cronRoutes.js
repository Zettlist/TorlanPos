import express from 'express';
import { autoCloseCashSessions } from '../jobs/autoCashClosure.js';

const router = express.Router();

/**
 * @route   GET /api/cron/auto-close
 * @desc    Endpoint triggered by App Engine Cron to close open cash sessions
 * @access  Public (Protected by App Engine logic or specific header in future)
 */
router.get('/auto-close', (req, res) => {
    // Check for App Engine Cron header to ensure security
    // X-Appengine-Cron: true
    const isCron = req.get('X-Appengine-Cron') === 'true';

    // Allow local development testing or if strictly from App Engine
    if (!isCron && process.env.NODE_ENV === 'production') {
        return res.status(403).json({ message: 'Forbidden: Only App Engine Cron can execute this.' });
    }

    try {
        console.log('⏰ [Cron API] Received auto-close request');
        autoCloseCashSessions();
        res.status(200).json({ message: 'Auto-close process executed successfully' });
    } catch (error) {
        console.error('❌ [Cron API] Error executing auto-close:', error);
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
});

export default router;
