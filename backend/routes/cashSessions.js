import express from 'express';
import pool from '../database/db.js';
import { authenticateToken, validateEmpresaActive, getEmpresaId } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);
router.use(validateEmpresaActive);

/**
 * GET /api/cash/current
 * Get current open cash session for the user
 */
router.get('/current', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);

        const [sessions] = await pool.query(`
            SELECT cs.*, u.username as opened_by_username
            FROM cash_sessions cs
            JOIN users u ON cs.user_id = u.id
            WHERE cs.empresa_id = ? AND cs.user_id = ? AND cs.status = 'open'
            ORDER BY cs.opened_at DESC
            LIMIT 1
        `, [empresaId, req.user.id]);

        if (sessions.length === 0) {
            return res.json({ session: null, message: 'No hay caja abierta' });
        }

        const session = sessions[0];

        // Calculate current sales total for this session
        const [salesResult] = await pool.query(`
            SELECT COALESCE(SUM(total), 0) as total
            FROM sales
            WHERE cash_session_id = ? AND payment_method = 'cash'
        `, [session.id]);

        res.json({
            session: {
                ...session,
                current_sales_total: Number(salesResult[0]?.total || 0),
                current_expected: Number(session.opening_amount) + Number(salesResult[0]?.total || 0)
            }
        });
    } catch (error) {
        console.error('Get current session error:', error);
        res.status(500).json({ error: 'Error al obtener sesión de caja' });
    }
});


/**
 * GET /api/cash/active-list
 * Get ALL open sessions (Manager Dashboard)
 */
router.get('/active-list', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);

        // Check if admin (Gerente or Global)
        const [userRows] = await pool.query('SELECT role FROM users WHERE id = ?', [req.user.id]);
        if (userRows.length === 0 || (userRows[0].role !== 'empresa_admin' && userRows[0].role !== 'global_admin')) {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        const [sessions] = await pool.query(`
            SELECT cs.*, u.username as opened_by_username
            FROM cash_sessions cs
            JOIN users u ON cs.user_id = u.id
            WHERE cs.empresa_id = ? AND cs.status = 'open'
            ORDER BY cs.opened_at DESC
        `, [empresaId]);

        // Enhance with current sales
        const enhancedSessions = await Promise.all(sessions.map(async (session) => {
            const [salesResult] = await pool.query(`
                SELECT COALESCE(SUM(total), 0) as total
                FROM sales
                WHERE cash_session_id = ? AND payment_method = 'cash'
            `, [session.id]);

            return {
                ...session,
                current_sales_total: Number(salesResult[0]?.total || 0),
                current_expected: Number(session.opening_amount) + Number(salesResult[0]?.total || 0)
            };
        }));

        res.json(enhancedSessions);
    } catch (error) {
        console.error('Get active list error:', error);
        res.status(500).json({ error: 'Error al obtener lista de cajas activas' });
    }
});

/**
 * POST /api/cash/open
 * Open a new cash session
 */
router.post('/open', async (req, res) => {
    try {
        const { opening_amount } = req.body;
        const empresaId = getEmpresaId(req);
        const userId = req.user.id;

        // Check if user already has an open session
        const [existingSessions] = await pool.query(`
            SELECT id FROM cash_sessions
            WHERE empresa_id = ? AND user_id = ? AND status = 'open'
        `, [empresaId, userId]);

        if (existingSessions.length > 0) {
            return res.status(400).json({
                error: 'Ya tienes una caja abierta. Cierra la caja actual antes de abrir una nueva.'
            });
        }

        // Create new session
        const [result] = await pool.query(`
            INSERT INTO cash_sessions (empresa_id, user_id, opening_amount, status)
            VALUES (?, ?, ?, 'open')
        `, [empresaId, userId, opening_amount]);

        res.json({
            message: 'Caja abierta correctamente',
            session_id: result.insertId,
            opening_amount
        });
    } catch (error) {
        console.error('Open cash session error:', error);
        res.status(500).json({ error: 'Error al abrir caja' });
    }
});

/**
 * POST /api/cash/close
 * Close cash session with BLIND CUT (employee only sees if there's discrepancy, not amount)
 */
router.post('/close', async (req, res) => {
    try {
        const { declared_amount, notes } = req.body;
        const empresaId = getEmpresaId(req);
        const isAdmin = req.user.role === 'empresa_admin' || req.user.role === 'global_admin';

        // Get current open session for this user
        const [sessionRows] = await pool.query(`
            SELECT * FROM cash_sessions
            WHERE empresa_id = ? AND user_id = ? AND status = 'open'
            ORDER BY opened_at DESC
            LIMIT 1
        `, [empresaId, req.user.id]);

        if (sessionRows.length === 0) {
            return res.status(400).json({ error: 'No tienes una caja abierta' });
        }

        const session = sessionRows[0];

        // Calculate expected amount (opening + cash sales)
        const [salesResult] = await pool.query(`
            SELECT COALESCE(SUM(total), 0) as total
            FROM sales
            WHERE cash_session_id = ? AND payment_method = 'cash'
        `, [session.id]);

        const cashSalesTotal = Number(salesResult[0]?.total || 0);
        const expectedAmount = Number(session.opening_amount) + cashSalesTotal;
        const difference = declared_amount - expectedAmount;

        // Update session with close data
        await pool.query(`
            UPDATE cash_sessions
            SET expected_amount = ?,
                declared_amount = ?,
                difference = ?,
                status = 'closed',
                closed_at = CURRENT_TIMESTAMP,
                notes = ?
            WHERE id = ?
        `, [expectedAmount, declared_amount, difference, notes || null, session.id]);

        // BLIND CUT LOGIC FOR EMPLOYEES
        if (!isAdmin) {
            // Employee only knows IF there's a discrepancy, NOT the amount
            if (difference === 0) {
                return res.json({
                    message: '✅ Cuadre perfecto!',
                    status: 'balanced',
                    session_id: session.id
                });
            } else {
                // Has discrepancy - alert employee but don't show numbers
                return res.json({
                    message: 'Comunícate con tu gerente',
                    status: 'revision_requerida',
                    session_id: session.id
                });
            }
        }

        // ADMIN - FULL VISIBILITY
        res.json({
            message: 'Caja cerrada correctamente',
            session_id: session.id,
            opening_amount: session.opening_amount,
            expected_amount: expectedAmount,
            declared_amount,
            difference,
            status: difference === 0 ? 'balanced' : (difference > 0 ? 'excess' : 'deficit')
        });
    } catch (error) {
        console.error('Close cash session error:', error);
        res.status(500).json({ error: 'Error al cerrar caja' });
    }
});

/**
 * GET /api/cash/history
 * Get cash session history (admin only sees full details)
 */
router.get('/history', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const isAdmin = req.user.role === 'empresa_admin' || req.user.role === 'global_admin';
        const { limit = 20, offset = 0 } = req.query;

        const [sessions] = await pool.query(`
            SELECT cs.*, u.username as opened_by_username
            FROM cash_sessions cs
            JOIN users u ON cs.user_id = u.id
            WHERE cs.empresa_id = ? AND cs.status = 'closed'
            ORDER BY cs.closed_at DESC
            LIMIT ? OFFSET ?
        `, [empresaId, parseInt(limit), parseInt(offset)]);

        // Sanitize response based on role
        const sanitizedSessions = sessions.map(s => {
            if (!isAdmin) {
                // Employee: Hide financial details
                return {
                    id: s.id,
                    opened_at: s.opened_at,
                    closed_at: s.closed_at,
                    has_discrepancy: s.difference !== 0
                    // Hide: expected_amount, declared_amount, difference
                };
            }
            return s;
        });

        res.json(sanitizedSessions);
    } catch (error) {
        console.error('Get history error:', error);
        res.status(500).json({ error: 'Error al obtener historial' });
    }
});

/**
 * GET /api/cash/session/:id
 * Get specific session details (admin only for closed sessions with discrepancy)
 */
router.get('/session/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const empresaId = getEmpresaId(req);
        const isAdmin = req.user.role === 'empresa_admin' || req.user.role === 'global_admin';

        const [sessionRows] = await pool.query(`
            SELECT cs.*, u.username as opened_by_username
            FROM cash_sessions cs
            JOIN users u ON cs.user_id = u.id
            WHERE cs.id = ? AND cs.empresa_id = ?
        `, [id, empresaId]);

        if (sessionRows.length === 0) {
            return res.status(404).json({ error: 'Sesión no encontrada' });
        }

        const session = sessionRows[0];

        // Get sales for this session
        const [sales] = await pool.query(`
            SELECT id, total, payment_method, created_at
            FROM sales
            WHERE cash_session_id = ?
            ORDER BY created_at DESC
        `, [id]);

        // If not admin and session is closed, sanitize
        if (!isAdmin && session.status === 'closed') {
            return res.json({
                session: {
                    id: session.id,
                    opened_at: session.opened_at,
                    closed_at: session.closed_at,
                    has_discrepancy: session.difference !== 0
                },
                sales
            });
        }

        res.json({ session, sales });
    } catch (error) {
        console.error('Get session details error:', error);
        res.status(500).json({ error: 'Error al obtener detalles de sesión' });
    }
});


/**
 * GET /api/cash/session/:id/details
 * Detailed view for managers (Active or Closed)
 */
router.get('/session/:id/details', async (req, res) => {
    try {
        const { id } = req.params;
        const empresaId = getEmpresaId(req);

        // Strict Role Check: Managers/Admins ONLY
        const [userRows] = await pool.query('SELECT role FROM users WHERE id = ?', [req.user.id]);
        if (userRows.length === 0 || (userRows[0].role !== 'empresa_admin' && userRows[0].role !== 'global_admin')) {
            return res.status(403).json({ error: 'Solo gerentes pueden ver este detalle' });
        }

        // Get session
        const [sessionRows] = await pool.query(`
            SELECT cs.*, u.username as opened_by_username
            FROM cash_sessions cs
            JOIN users u ON cs.user_id = u.id
            WHERE cs.id = ? AND cs.empresa_id = ?
        `, [id, empresaId]);

        if (sessionRows.length === 0) {
            return res.status(404).json({ error: 'Sesión no encontrada' });
        }

        const session = sessionRows[0];

        // Payment method breakdown
        const [paymentSummary] = await pool.query(`
            SELECT payment_method, COALESCE(SUM(total), 0) as total, COUNT(*) as count
            FROM sales
            WHERE cash_session_id = ?
            GROUP BY payment_method
        `, [id]);

        const cashSales = Number(paymentSummary.find(p => p.payment_method === 'cash')?.total || 0);
        const calculatedExpected = Number(session.opening_amount) + cashSales;

        // Recent Transactions (limit 50)
        const [recentSales] = await pool.query(`
            SELECT s.id, s.total, s.payment_method, s.created_at, u.username as sold_by
            FROM sales s
            JOIN users u ON s.user_id = u.id
            WHERE s.cash_session_id = ?
            ORDER BY s.created_at DESC
            LIMIT 50
        `, [id]);

        res.json({
            session: {
                ...session,
                calculated_expected: calculatedExpected
            },
            summary: {
                payment_breakdown: paymentSummary,
                total_sales: paymentSummary.reduce((sum, p) => sum + parseFloat(p.total), 0),
                total_transactions: paymentSummary.reduce((sum, p) => sum + p.count, 0)
            },
            recent_sales: recentSales
        });
    } catch (error) {
        console.error('Get session details error:', error);
        res.status(500).json({ error: 'Error al obtener detalles' });
    }
});

export default router;
