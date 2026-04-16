import express from 'express';
import pool from '../database/db.js';
import apiKeyAuth from '../middleware/apiKeyAuth.js';
import { authenticateToken, requireEmpresaAdmin, getEmpresaId } from '../middleware/auth.js';

const router = express.Router();

// Genera un código único tipo CREDIT-XXXX-XXXX
async function generateCreditCode() {
    let code, exists = true;
    while (exists) {
        const part = () => Math.random().toString(36).substring(2, 6).toUpperCase();
        code = `CR-${part()}-${part()}`;
        const [rows] = await pool.query('SELECT id FROM store_credits WHERE code = ?', [code]);
        exists = rows.length > 0;
    }
    return code;
}

// ──────────────────────────────────────────────────────────
// GET /api/store-credits/search-clientes?q=  — buscar clientes
// ──────────────────────────────────────────────────────────
router.get('/search-clientes', authenticateToken, requireEmpresaAdmin, async (req, res) => {
    const empresa_id = getEmpresaId(req);
    const { q = '', limit = 8 } = req.query;
    if (!q || q.length < 2) return res.json([]);
    try {
        const like = `%${q}%`;
        const [rows] = await pool.query(`
            SELECT id, nombre, apellido, email, client_code
            FROM clientes
            WHERE empresa_id = ? AND (nombre LIKE ? OR apellido LIKE ? OR email LIKE ? OR client_code LIKE ?)
            LIMIT ?
        `, [empresa_id, like, like, like, like, parseInt(limit)]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────────
// GET /api/store-credits  — lista todos los créditos
// ──────────────────────────────────────────────────────────
router.get('/', authenticateToken, requireEmpresaAdmin, async (req, res) => {
    const empresa_id = getEmpresaId(req);
    try {
        const [credits] = await pool.query(`
            SELECT sc.*, cl.nombre AS cliente_nombre, cl.apellido AS cliente_apellido, cl.email AS cliente_email
            FROM store_credits sc
            LEFT JOIN clientes cl ON cl.id = sc.cliente_id
            WHERE sc.empresa_id = ?
            ORDER BY sc.created_at DESC
        `, [empresa_id]);
        res.json(credits);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────────
// GET /api/store-credits/:id/uses  — historial de uso
// ──────────────────────────────────────────────────────────
router.get('/:id/uses', authenticateToken, requireEmpresaAdmin, async (req, res) => {
    const empresa_id = getEmpresaId(req);
    const { id } = req.params;
    try {
        const [[credit]] = await pool.query('SELECT id FROM store_credits WHERE id = ? AND empresa_id = ?', [id, empresa_id]);
        if (!credit) return res.status(404).json({ error: 'No encontrado' });

        const [uses] = await pool.query(`
            SELECT * FROM store_credit_uses WHERE credit_id = ? ORDER BY used_at DESC
        `, [id]);
        res.json(uses);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────────
// POST /api/store-credits  — crear crédito
// ──────────────────────────────────────────────────────────
router.post('/', authenticateToken, requireEmpresaAdmin, async (req, res) => {
    const empresa_id = getEmpresaId(req);
    const { balance, cliente_id, expiration_date, notes, code: customCode } = req.body;

    if (!balance || isNaN(balance) || Number(balance) <= 0) {
        return res.status(400).json({ error: 'Saldo inválido' });
    }

    try {
        const code = customCode ? customCode.toUpperCase() : await generateCreditCode();
        const [result] = await pool.query(`
            INSERT INTO store_credits (empresa_id, code, balance, original_balance, cliente_id, expiration_date, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [empresa_id, code, Number(balance), Number(balance), cliente_id || null, expiration_date || null, notes || null]);

        res.status(201).json({ id: result.insertId, code, message: 'Crédito creado' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'El código ya existe' });
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────────
// PUT /api/store-credits/:id  — editar (estado, notas, expiración)
// ──────────────────────────────────────────────────────────
router.put('/:id', authenticateToken, requireEmpresaAdmin, async (req, res) => {
    const empresa_id = getEmpresaId(req);
    const { id } = req.params;
    const { status, notes, expiration_date, balance } = req.body;

    try {
        const [[credit]] = await pool.query('SELECT id FROM store_credits WHERE id = ? AND empresa_id = ?', [id, empresa_id]);
        if (!credit) return res.status(404).json({ error: 'No encontrado' });

        await pool.query(`
            UPDATE store_credits
            SET status = COALESCE(?, status),
                notes = COALESCE(?, notes),
                expiration_date = ?,
                balance = COALESCE(?, balance)
            WHERE id = ?
        `, [status || null, notes || null, expiration_date !== undefined ? (expiration_date || null) : undefined, balance ? Number(balance) : null, id]);

        res.json({ message: 'Crédito actualizado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────────
// DELETE /api/store-credits/:id
// ──────────────────────────────────────────────────────────
router.delete('/:id', authenticateToken, requireEmpresaAdmin, async (req, res) => {
    const empresa_id = getEmpresaId(req);
    const { id } = req.params;
    try {
        const [result] = await pool.query('DELETE FROM store_credits WHERE id = ? AND empresa_id = ?', [id, empresa_id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'No encontrado' });
        res.json({ message: 'Crédito eliminado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────────
// POST /api/store-credits/validate  — validar código (API Key, para Bisonte Shop)
// ──────────────────────────────────────────────────────────
router.post('/validate', apiKeyAuth, async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ valid: false, error: 'Código requerido' });

    try {
        const [[credit]] = await pool.query(`
            SELECT id, code, balance, status, expiration_date, cliente_id
            FROM store_credits WHERE code = ?
        `, [code.toUpperCase()]);

        if (!credit) return res.status(404).json({ valid: false, error: 'El código no existe' });
        if (credit.status !== 'active') return res.status(400).json({ valid: false, error: 'El crédito no está activo' });
        if (credit.expiration_date && new Date(credit.expiration_date) < new Date()) {
            return res.status(400).json({ valid: false, error: 'El crédito ha expirado' });
        }
        if (Number(credit.balance) <= 0) return res.status(400).json({ valid: false, error: 'El crédito no tiene saldo' });

        res.json({ valid: true, balance: Number(credit.balance), credit_id: credit.id });
    } catch (err) {
        res.status(500).json({ valid: false, error: err.message });
    }
});

// ──────────────────────────────────────────────────────────
// POST /api/store-credits/redeem  — canjear saldo
// ──────────────────────────────────────────────────────────
router.post('/redeem', apiKeyAuth, async (req, res) => {
    const { code, amount, sale_id } = req.body;
    if (!code || !amount) return res.status(400).json({ error: 'Código y monto requeridos' });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [[credit]] = await conn.query(`
            SELECT id, balance, status, expiration_date FROM store_credits WHERE code = ? FOR UPDATE
        `, [code.toUpperCase()]);

        if (!credit || credit.status !== 'active') {
            await conn.rollback();
            return res.status(400).json({ error: 'Crédito inválido o inactivo' });
        }
        if (credit.expiration_date && new Date(credit.expiration_date) < new Date()) {
            await conn.rollback();
            return res.status(400).json({ error: 'Crédito expirado' });
        }

        const toUse = Math.min(Number(amount), Number(credit.balance));
        const newBalance = Number(credit.balance) - toUse;
        const newStatus = newBalance <= 0 ? 'used' : 'active';

        await conn.query(`
            UPDATE store_credits SET balance = ?, status = ? WHERE id = ?
        `, [newBalance, newStatus, credit.id]);

        await conn.query(`
            INSERT INTO store_credit_uses (credit_id, sale_id, amount_used, balance_before, balance_after)
            VALUES (?, ?, ?, ?, ?)
        `, [credit.id, sale_id || null, toUse, Number(credit.balance), newBalance]);

        await conn.commit();
        res.json({ success: true, amount_used: toUse, new_balance: newBalance });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        conn.release();
    }
});

export default router;
