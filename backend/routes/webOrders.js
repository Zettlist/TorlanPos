import express from 'express';
import pool from '../database/db.js';
import { authenticateToken, validateEmpresaActive } from '../middleware/auth.js';

const router = express.Router();

const BISONTE_SHOP_URL = process.env.BISONTE_SHOP_URL || 'http://localhost:3000';
const BISONTE_CAPTURE_KEY = process.env.BISONTE_CAPTURE_KEY;

// Llama al endpoint de captura de Bisonte Shop
async function callBisonteCapture(saleId, action) {
    const res = await fetch(`${BISONTE_SHOP_URL}/api/orders/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleId, action, apiKey: BISONTE_CAPTURE_KEY }),
    });
    return res.json();
}

// GET /api/web-orders
router.get('/', authenticateToken, validateEmpresaActive, async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { page = 1, limit = 30, status } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const params = [empresa_id];
        let statusFilter = '';
        if (status && ['pendiente', 'confirmado', 'cancelado'].includes(status)) {
            statusFilter = 'AND s.web_status = ?';
            params.push(status);
        }

        const [orders] = await pool.query(`
            SELECT
                s.id,
                s.total,
                s.subtotal,
                s.discount,
                s.surcharge,
                s.payment_method,
                s.web_status,
                s.created_at,
                cl.id AS cliente_id,
                cl.nombre,
                cl.apellido,
                cl.email,
                cl.client_code,
                COUNT(si.id) AS total_items
            FROM sales s
            LEFT JOIN clientes cl ON cl.id = s.cliente_id
            LEFT JOIN sale_items si ON si.sale_id = s.id
            WHERE s.empresa_id = ?
              AND s.cash_session_id IS NULL
              AND s.cliente_id IS NOT NULL
              ${statusFilter}
            GROUP BY s.id, cl.id
            ORDER BY
              CASE s.web_status WHEN 'pendiente' THEN 0 WHEN 'confirmado' THEN 1 ELSE 2 END,
              s.created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, parseInt(limit), offset]);

        const [[{ total }]] = await pool.query(`
            SELECT COUNT(*) AS total
            FROM sales s
            WHERE s.empresa_id = ?
              AND s.cash_session_id IS NULL
              AND s.cliente_id IS NOT NULL
              ${statusFilter}
        `, params);

        res.json({ orders, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
        console.error('Error fetching web orders:', err);
        res.status(500).json({ error: 'Error al obtener pedidos' });
    }
});

// GET /api/web-orders/:id
router.get('/:id', authenticateToken, validateEmpresaActive, async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { id } = req.params;

        const [[order]] = await pool.query(`
            SELECT
                s.id, s.total, s.subtotal, s.discount, s.surcharge,
                s.payment_method, s.web_status, s.created_at,
                cl.id AS cliente_id, cl.nombre, cl.apellido, cl.email, cl.client_code,
                ua.nombre_recibe, ua.calle, ua.numero, ua.colonia,
                ua.municipio, ua.estado AS estado_entrega, ua.cp
            FROM sales s
            LEFT JOIN clientes cl ON cl.id = s.cliente_id
            LEFT JOIN user_addresses ua ON ua.cliente_id = cl.id AND ua.is_default = 1
            WHERE s.id = ? AND s.empresa_id = ?
              AND s.cash_session_id IS NULL AND s.cliente_id IS NOT NULL
        `, [id, empresa_id]);

        if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

        const [items] = await pool.query(`
            SELECT si.id, si.quantity, si.price, p.name, p.image_url, p.barcode, p.stock
            FROM sale_items si
            JOIN products p ON p.id = si.product_id
            WHERE si.sale_id = ?
        `, [id]);

        res.json({ ...order, items });
    } catch (err) {
        console.error('Error fetching order detail:', err);
        res.status(500).json({ error: 'Error al obtener el pedido' });
    }
});

// PUT /api/web-orders/:id/confirm — capturar pago y descontar stock vía Bisonte Shop
router.put('/:id/confirm', authenticateToken, validateEmpresaActive, async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    try {
        // Verificar que el pedido existe y está pendiente
        const [[order]] = await pool.query(`
            SELECT id, web_status FROM sales
            WHERE id = ? AND empresa_id = ?
              AND cash_session_id IS NULL AND cliente_id IS NOT NULL
        `, [id, empresa_id]);

        if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
        if (order.web_status !== 'pendiente') {
            return res.status(400).json({ error: `El pedido ya está ${order.web_status}` });
        }

        // Llamar a Bisonte Shop para capturar el pago y descontar stock
        const bisonteRes = await callBisonteCapture(parseInt(id), 'capture');

        if (!bisonteRes.success) {
            // Si el error es 409 (ya procesado) igual actualizamos el estado local
            const nuevoEstado = bisonteRes.error?.includes('captured') ? 'confirmado' : 'cancelado';
            await pool.query(`UPDATE sales SET web_status = ? WHERE id = ?`, [nuevoEstado, id]);
            return res.status(409).json({ error: bisonteRes.error });
        }

        // Marcar como confirmado en sales
        await pool.query(`UPDATE sales SET web_status = 'confirmado' WHERE id = ?`, [id]);

        const stockErrors = bisonteRes.stockErrors ?? [];
        res.json({
            success: true,
            confirmado: true,
            stockErrors,
            motivo: stockErrors.length > 0
                ? `Capturado con advertencias: ${stockErrors.join(', ')}`
                : null,
        });

    } catch (err) {
        console.error('Error confirming web order:', err);
        res.status(500).json({ error: 'Error al confirmar el pedido: ' + err.message });
    }
});

// PUT /api/web-orders/:id/cancel — liberar autorización de Stripe
router.put('/:id/cancel', authenticateToken, validateEmpresaActive, async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    try {
        const [[order]] = await pool.query(`
            SELECT id, web_status FROM sales
            WHERE id = ? AND empresa_id = ?
              AND cash_session_id IS NULL AND cliente_id IS NOT NULL
        `, [id, empresa_id]);

        if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
        if (order.web_status === 'confirmado') {
            return res.status(400).json({ error: 'No se puede cancelar un pedido ya confirmado y cobrado' });
        }

        // Llamar a Bisonte Shop para liberar los fondos
        const bisonteRes = await callBisonteCapture(parseInt(id), 'cancel');

        if (!bisonteRes.success && !bisonteRes.error?.includes('cancelled')) {
            return res.status(500).json({ error: bisonteRes.error || 'Error al cancelar en Bisonte Shop' });
        }

        await pool.query(`UPDATE sales SET web_status = 'cancelado' WHERE id = ?`, [id]);
        res.json({ success: true });

    } catch (err) {
        console.error('Error cancelling web order:', err);
        res.status(500).json({ error: 'Error al cancelar el pedido: ' + err.message });
    }
});

export default router;
