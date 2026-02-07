import express from 'express';
import pool from '../database/db.js';
import { authenticateToken, validateEmpresaActive, getEmpresaId, requireEmpresaAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);
router.use(validateEmpresaActive);

/**
 * GET /api/onboarding/status
 * Check onboarding status for current user
 */
router.get('/status', async (req, res) => {
    try {
        const isCompleted = req.user.onboarding_completed === 1;

        if (isCompleted) {
            return res.json({
                completed: true,
                message: 'Onboarding completado'
            });
        }

        // Determine current step based on what's configured
        const empresaId = getEmpresaId(req);

        // Check if goals are set
        const [goalsSetRows] = await pool.query(`
            SELECT COUNT(*) as count FROM business_settings
            WHERE empresa_id = ? AND setting_key IN ('weekly_sales_goal', 'monthly_sales_goal')
            AND setting_value IS NOT NULL
        `, [empresaId]);

        // Check if employees exist (besides the admin)
        const [employeesExistRows] = await pool.query(`
            SELECT COUNT(*) as count FROM users
            WHERE empresa_id = ? AND role = 'employee'
        `, [empresaId]);

        const goalsSet = goalsSetRows[0];
        const employeesExist = employeesExistRows[0];

        let currentStep = 1;
        if (goalsSet?.count >= 1) currentStep = 2;
        if (goalsSet?.count >= 2) currentStep = 3;
        // Employee creation is optional, so we don't require it

        res.json({
            completed: false,
            current_step: currentStep,
            total_steps: 4,
            steps: {
                welcome: { completed: true, step: 1 },
                weekly_goal: { completed: goalsSet?.count >= 1, step: 2 },
                monthly_goal: { completed: goalsSet?.count >= 2, step: 3 },
                finish: { completed: false, step: 4 }
            },
            has_employees: employeesExist?.count > 0
        });
    } catch (error) {
        console.error('Get onboarding status error:', error);
        res.status(500).json({ error: 'Error al obtener estado de onboarding' });
    }
});

/**
 * POST /api/onboarding/complete
 * Mark onboarding as complete
 */
router.post('/complete', authenticateToken, validateEmpresaActive, async (req, res) => {
    try {
        const userId = req.user.id;
        const empresaId = getEmpresaId(req);

        // Get fresh user data from database to check role
        const [userRows] = await pool.query('SELECT role FROM users WHERE id = ?', [userId]);
        const user = userRows[0];

        if (!user || (user.role !== 'empresa_admin' && user.role !== 'global_admin')) {
            return res.status(403).json({
                error: 'Acceso denegado. Solo administradores pueden completar el onboarding.'
            });
        }

        // Verify minimum requirements (at least one goal set)
        const [goalsSetRows] = await pool.query(`
            SELECT COUNT(*) as count FROM business_settings
            WHERE empresa_id = ? AND setting_key IN ('weekly_sales_goal', 'monthly_sales_goal')
            AND setting_value IS NOT NULL
        `, [empresaId]);

        const goalsSet = goalsSetRows[0];

        if (!goalsSet || goalsSet.count === 0) {
            return res.status(400).json({
                error: 'Debe configurar al menos una meta de ventas antes de completar el onboarding'
            });
        }

        // Mark onboarding as complete
        await pool.query(`
            UPDATE users SET onboarding_completed = 1 WHERE id = ?
        `, [userId]);

        res.json({
            message: 'Configuración inicial completada',
            completed: true
        });
    } catch (error) {
        console.error('Complete onboarding error:', error);
        res.status(500).json({ error: 'Error al completar onboarding' });
    }
});

/**
 * POST /api/onboarding/skip
 * Skip onboarding (mark as complete without requirements)
 */
router.post('/skip', authenticateToken, validateEmpresaActive, async (req, res) => {
    try {
        const userId = req.user.id;

        // Get fresh user data to check role
        const [userRows] = await pool.query('SELECT role FROM users WHERE id = ?', [userId]);
        const user = userRows[0];

        if (!user || (user.role !== 'empresa_admin' && user.role !== 'global_admin')) {
            return res.status(403).json({
                error: 'Acceso denegado. Solo administradores pueden omitir el onboarding.'
            });
        }

        await pool.query(`
            UPDATE users SET onboarding_completed = 1 WHERE id = ?
        `, [userId]);

        res.json({
            message: 'Onboarding omitido',
            completed: true
        });
    } catch (error) {
        console.error('Skip onboarding error:', error);
        res.status(500).json({ error: 'Error al omitir onboarding' });
    }
});

export default router;
