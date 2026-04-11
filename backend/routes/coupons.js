import express from 'express';
import pool from '../database/db.js';
import apiKeyAuth from '../middleware/apiKeyAuth.js';
import { authenticateToken, requireEmpresaAdmin, getEmpresaId } from '../middleware/auth.js';

const router = express.Router();

/**
 * =============================================================================
 * EXTERNAL API (API Key Auth)
 * =============================================================================
 */

/**
 * POST /api/coupons/validate
 * Validates a coupon code and calculates the discount amount.
 * Body: { code: "BISONTE10", apply_to_amount: 1000 }
 */
router.post('/validate', apiKeyAuth, async (req, res) => {
    const { code, apply_to_amount } = req.body;

    if (!code) {
        return res.status(400).json({ valid: false, error: 'Debe proporcionar un código de cupón' });
    }

    const amount = parseFloat(apply_to_amount);
    if (isNaN(amount) || amount < 0) {
        return res.status(400).json({ valid: false, error: 'Monto a aplicar inválido' });
    }

    try {
        const [coupons] = await pool.query('SELECT * FROM coupons WHERE code = ?', [code]);

        if (coupons.length === 0) {
            return res.status(404).json({ valid: false, error: 'El cupón no existe' });
        }

        const coupon = coupons[0];

        if (coupon.status !== 'active') {
            return res.status(400).json({ valid: false, error: 'Este cupón no está activo' });
        }

        if (coupon.expiration_date && new Date(coupon.expiration_date) < new Date()) {
            return res.status(400).json({ valid: false, error: 'El cupón ha expirado' });
        }

        if (coupon.usage_limit !== null && coupon.usage_count >= coupon.usage_limit) {
            return res.status(400).json({ valid: false, error: 'El cupón ha superado su límite de usos' });
        }

        let discount_amount = 0;
        if (coupon.discount_type === 'percentage') {
            discount_amount = amount * (parseFloat(coupon.discount_value) / 100);
        } else if (coupon.discount_type === 'fixed') {
            discount_amount = parseFloat(coupon.discount_value);
        }

        discount_amount = Math.min(discount_amount, amount);
        discount_amount = parseFloat(discount_amount.toFixed(2));

        return res.json({
            valid: true,
            discount_amount: discount_amount
        });

    } catch (error) {
        console.error('❌ Error validating coupon:', error);
        return res.status(500).json({ valid: false, error: 'Error interno al procesar el cupón' });
    }
});

/**
 * =============================================================================
 * INTERNAL MANAGEMENT API (JWT Auth)
 * =============================================================================
 */

/**
 * GET /api/coupons
 * List all coupons for the user's empresa
 */
router.get('/', authenticateToken, requireEmpresaAdmin, async (req, res) => {
    const empresa_id = getEmpresaId(req);
    try {
        const [coupons] = await pool.query(
            'SELECT * FROM coupons WHERE empresa_id = ? OR (empresa_id IS NULL AND ?) ORDER BY created_at DESC',
            [empresa_id, req.user.role === 'global_admin']
        );
        res.json(coupons);
    } catch (error) {
        console.error('GET /api/coupons error:', error);
        res.status(500).json({ error: 'Error al obtener cupones' });
    }
});

/**
 * POST /api/coupons
 * Create a new coupon
 */
router.post('/', authenticateToken, requireEmpresaAdmin, async (req, res) => {
    const empresa_id = getEmpresaId(req);
    const { code, discount_type, discount_value, status, expiration_date, usage_limit } = req.body;

    if (!code || !discount_type || discount_value === undefined) {
        return res.status(400).json({ error: 'Datos incompletos' });
    }

    try {
        const [result] = await pool.query(
            `INSERT INTO coupons (empresa_id, code, discount_type, discount_value, status, expiration_date, usage_limit)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [empresa_id, code.toUpperCase(), discount_type, discount_value, status || 'active', expiration_date || null, usage_limit || null]
        );
        res.status(201).json({ id: result.insertId, message: 'Cupón creado exitosamente' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'El código del cupón ya existe' });
        }
        console.error('POST /api/coupons error:', error);
        res.status(500).json({ error: 'Error al crear el cupón' });
    }
});

/**
 * PUT /api/coupons/:id
 * Update an existing coupon
 */
router.put('/:id', authenticateToken, requireEmpresaAdmin, async (req, res) => {
    const empresa_id = getEmpresaId(req);
    const { id } = req.params;
    const { code, discount_type, discount_value, status, expiration_date, usage_limit } = req.body;

    try {
        // Verify ownership
        const [existing] = await pool.query('SELECT id FROM coupons WHERE id = ? AND (empresa_id = ? OR empresa_id IS NULL)', [id, empresa_id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Cupón no encontrado' });
        }

        await pool.query(
            `UPDATE coupons 
             SET code = ?, discount_type = ?, discount_value = ?, status = ?, expiration_date = ?, usage_limit = ?
             WHERE id = ?`,
            [code.toUpperCase(), discount_type, discount_value, status, expiration_date || null, usage_limit || null, id]
        );
        res.json({ message: 'Cupón actualizado exitosamente' });
    } catch (error) {
        console.error('PUT /api/coupons/:id error:', error);
        res.status(500).json({ error: 'Error al actualizar el cupón' });
    }
});

/**
 * DELETE /api/coupons/:id
 * Delete a coupon
 */
router.delete('/:id', authenticateToken, requireEmpresaAdmin, async (req, res) => {
    const empresa_id = getEmpresaId(req);
    const { id } = req.params;

    try {
        const [result] = await pool.query('DELETE FROM coupons WHERE id = ? AND (empresa_id = ? OR empresa_id IS NULL)', [id, empresa_id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Cupón no encontrado' });
        }
        res.json({ message: 'Cupón eliminado exitosamente' });
    } catch (error) {
        console.error('DELETE /api/coupons/:id error:', error);
        res.status(500).json({ error: 'Error al eliminar el cupón' });
    }
});

/**
 * POST /api/coupons/redeem
 * Increments usage count for a coupon.
 * Protected by API Key (external) OR JWT (internal)
 */
router.post('/redeem', async (req, res, next) => {
    // Try API Key first
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
        return apiKeyAuth(req, res, next);
    }
    // Fallback to JWT
    return authenticateToken(req, res, next);
}, async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Código de cupón requerido' });

    try {
        // Increment usage count atomically
        const [result] = await pool.query(
            'UPDATE coupons SET usage_count = usage_count + 1 WHERE code = ? AND status = "active" AND (usage_limit IS NULL OR usage_count < usage_limit)',
            [code]
        );

        if (result.affectedRows === 0) {
            return res.status(400).json({ error: 'No se pudo redimir el cupón (inválido, inactivo o límite alcanzado)' });
        }

        res.json({ success: true, message: 'Cupón redimido exitosamente' });
    } catch (error) {
        console.error('POST /api/coupons/redeem error:', error);
        res.status(500).json({ error: 'Error al redimir el cupón' });
    }
});

export default router;

