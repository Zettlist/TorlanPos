import express from 'express';
import pool from '../database/db.js';
import { authenticateToken, validateEmpresaActive } from '../middleware/auth.js';

const router = express.Router();

// Pedidos web = sales con cash_session_id IS NULL y cliente_id NOT NULL

// GET /api/web-orders
router.get('/', authenticateToken, validateEmpresaActive, async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { page = 1, limit = 30 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const [orders] = await pool.query(`
            SELECT
                s.id,
                s.total,
                s.subtotal,
                s.discount,
                s.surcharge,
                s.payment_method,
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
            GROUP BY s.id, cl.id
            ORDER BY s.created_at DESC
            LIMIT ? OFFSET ?
        `, [empresa_id, parseInt(limit), offset]);

        const [[{ total }]] = await pool.query(`
            SELECT COUNT(*) AS total
            FROM sales s
            WHERE s.empresa_id = ?
              AND s.cash_session_id IS NULL
              AND s.cliente_id IS NOT NULL
        `, [empresa_id]);

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
                s.payment_method, s.created_at,
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
            SELECT
                si.id, si.quantity, si.price,
                p.name, p.image_url, p.barcode
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

export default router;
