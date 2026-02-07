import express from 'express';
import pool from '../database/db.js';
import { authenticateToken, validateEmpresaActive, getEmpresaId, requireEmpresaAdmin } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication and empresa admin role
router.use(authenticateToken);
router.use(validateEmpresaActive);

/**
 * GET /api/settings
 * Get all business settings for the empresa
 */
router.get('/', requireEmpresaAdmin, async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);

        const [settings] = await pool.query(`
            SELECT setting_key, setting_value, updated_at
            FROM business_settings
            WHERE empresa_id = ?
        `, [empresaId]);

        // Convert to object format
        const settingsObj = {};
        settings.forEach(s => {
            settingsObj[s.setting_key] = {
                value: s.setting_value,
                updated_at: s.updated_at
            };
        });

        // Return with defaults if not set
        res.json({
            weekly_sales_goal: settingsObj.weekly_sales_goal?.value || null,
            monthly_sales_goal: settingsObj.monthly_sales_goal?.value || null,
            require_cash_session: settingsObj.require_cash_session?.value || 'false',
            ...settingsObj
        });
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ error: 'Error al obtener configuración' });
    }
});

/**
 * PUT /api/settings
 * Update business settings
 */
router.put('/', requireEmpresaAdmin, async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { weekly_sales_goal, monthly_sales_goal, require_cash_session } = req.body;

        // Upsert each setting
        const upsertSetting = async (key, value) => {
            if (value !== undefined) {
                const [existing] = await pool.query(`
                    SELECT id FROM business_settings
                    WHERE empresa_id = ? AND setting_key = ?
                `, [empresaId, key]);

                if (existing.length > 0) {
                    await pool.query(`
                        UPDATE business_settings
                        SET setting_value = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE empresa_id = ? AND setting_key = ?
                    `, [String(value), empresaId, key]);
                } else {
                    await pool.query(`
                        INSERT INTO business_settings (empresa_id, setting_key, setting_value)
                        VALUES (?, ?, ?)
                    `, [empresaId, key, String(value)]);
                }
            }
        };

        await upsertSetting('weekly_sales_goal', weekly_sales_goal);
        await upsertSetting('monthly_sales_goal', monthly_sales_goal);
        await upsertSetting('require_cash_session', require_cash_session);

        res.json({ message: 'Configuración actualizada exitosamente' });
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ error: 'Error al actualizar configuración' });
    }
});

/**
 * GET /api/settings/goals
 * Get sales goals (accessible by all authenticated users)
 */
router.get('/goals', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);

        const [weeklyGoalRows] = await pool.query(`
            SELECT setting_value FROM business_settings
            WHERE empresa_id = ? AND setting_key = 'weekly_sales_goal'
        `, [empresaId]);

        const [monthlyGoalRows] = await pool.query(`
            SELECT setting_value FROM business_settings
            WHERE empresa_id = ? AND setting_key = 'monthly_sales_goal'
        `, [empresaId]);

        const weeklyGoal = weeklyGoalRows[0];
        const monthlyGoal = monthlyGoalRows[0];

        res.json({
            weekly_sales_goal: weeklyGoal?.setting_value ? parseFloat(weeklyGoal.setting_value) : null,
            monthly_sales_goal: monthlyGoal?.setting_value ? parseFloat(monthlyGoal.setting_value) : null
        });
    } catch (error) {
        console.error('Get goals error:', error);
        res.status(500).json({ error: 'Error al obtener metas' });
    }
});

export default router;
