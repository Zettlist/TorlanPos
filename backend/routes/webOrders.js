import express from 'express';
import pool from '../database/db.js';
import { authenticateToken, validateEmpresaActive } from '../middleware/auth.js';

const router = express.Router();

const BISONTE_SHOP_URL = process.env.BISONTE_SHOP_URL || 'http://localhost:3000';
const BISONTE_CAPTURE_KEY = process.env.BISONTE_CAPTURE_KEY;

async function callBisonteCapture(saleId, action) {
    const res = await fetch(`${BISONTE_SHOP_URL}/api/orders/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleId, action, apiKey: BISONTE_CAPTURE_KEY }),
    });
    return res.json();
}

/**
 * Evalúa el stock de un pedido considerando la cola FIFO.
 *
 * Distingue dos situaciones:
 *  - faltantes_fifo:   stock insuficiente PORQUE órdenes anteriores ya lo reservaron
 *                      → auto-cancelar (el cliente llegó tarde)
 *  - faltantes_stock:  stock insuficiente sin que haya órdenes anteriores del mismo producto
 *                      → solo advertencia, el staff cancela manualmente y contacta al cliente
 *
 * @returns {{ okFifo: boolean, faltantesFifo: string[], advertenciasStock: string[] }}
 */
async function checkFifoStock(saleId, conn) {
    const [items] = await conn.query(`
        SELECT si.product_id, si.quantity, p.name, p.stock
        FROM sale_items si
        JOIN products p ON p.id = si.product_id
        WHERE si.sale_id = ?
    `, [saleId]);

    const faltantesFifo    = []; // causados por órdenes anteriores → auto-cancel
    const advertenciasStock = []; // stock simplemente insuficiente → manual

    for (const item of items) {
        const [[{ reservado }]] = await conn.query(`
            SELECT COALESCE(SUM(si2.quantity), 0) AS reservado
            FROM sales s2
            JOIN sale_items si2 ON si2.sale_id = s2.id
            WHERE s2.web_status = 'pendiente'
              AND s2.id < ?
              AND si2.product_id = ?
        `, [saleId, item.product_id]);

        const disponible = item.stock - reservado;

        if (disponible < item.quantity) {
            if (reservado > 0) {
                // Hay órdenes anteriores que se llevan el stock → FIFO violation
                faltantesFifo.push(
                    `"${item.name}" (stock: ${item.stock}, reservado por órdenes anteriores: ${reservado}, necesitas: ${item.quantity})`
                );
            } else {
                // Stock puro insuficiente, nadie más lo está pidiendo
                advertenciasStock.push(
                    `"${item.name}" (stock disponible: ${item.stock}, pedido: ${item.quantity})`
                );
            }
        }
    }

    return {
        okFifo: faltantesFifo.length === 0,  // false → auto-cancelar
        faltantesFifo,
        advertenciasStock,                    // solo advertencia, no auto-cancelar
    };
}

/**
 * Después de confirmar un pedido, cancela automáticamente los pedidos
 * POSTERIORES (id mayor) que ya no pueden cumplirse con el stock restante.
 *
 * @param {number} confirmedSaleId  - ID del pedido recién confirmado
 * @param {object} conn             - Conexión de BD
 * @returns {number[]} IDs de pedidos auto-cancelados
 */
async function cascadeCancelLaterOrders(confirmedSaleId, conn) {
    // Productos afectados por el pedido confirmado
    const [confirmedItems] = await conn.query(`
        SELECT product_id FROM sale_items WHERE sale_id = ?
    `, [confirmedSaleId]);

    const productIds = confirmedItems.map(i => i.product_id);
    if (!productIds.length) return [];

    // Pedidos pendientes POSTERIORES que tienen alguno de esos productos
    const [laterOrders] = await conn.query(`
        SELECT DISTINCT s.id
        FROM sales s
        JOIN sale_items si ON si.sale_id = s.id
        WHERE s.web_status = 'pendiente'
          AND s.id > ?
          AND si.product_id IN (?)
        ORDER BY s.id ASC
    `, [confirmedSaleId, productIds]);

    const autoCancelled = [];

    for (const { id: laterSaleId } of laterOrders) {
        const { okFifo, faltantesFifo } = await checkFifoStock(laterSaleId, conn);

        if (!okFifo) {
            // Cancelar en bisonte_orders si existe
            try {
                await callBisonteCapture(laterSaleId, 'cancel');
            } catch { /* sin bisonte_order, ignorar */ }

            await conn.query(
                `UPDATE sales SET web_status = 'cancelado', web_process_type = 'auto' WHERE id = ?`,
                [laterSaleId]
            );
            autoCancelled.push({ id: laterSaleId, motivo: faltantesFifo.join('; ') });
            console.log(`[FIFO] Auto-cancelado pedido #${laterSaleId}: ${faltantesFifo.join(', ')}`);
        }
    }

    return autoCancelled;
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/web-orders
// ──────────────────────────────────────────────────────────────────────────────
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
                s.id, s.total, s.subtotal, s.discount, s.surcharge,
                s.payment_method, s.web_status, s.web_process_type, s.created_at,
                cl.id AS cliente_id, cl.nombre, cl.apellido, cl.email, cl.client_code,
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

        // Para cada pedido pendiente, calcular si tiene conflicto FIFO (órdenes anteriores
        // reservan stock que podría no alcanzar para este pedido)
        const ordersWithConflict = await Promise.all(orders.map(async (order) => {
            if (order.web_status !== 'pendiente') return { ...order, conflicto: false };

            const conn = await pool.getConnection();
            const { okFifo } = await checkFifoStock(order.id, conn);
            conn.release();
            return { ...order, conflicto: !okFifo };
        }));

        res.json({ orders: ordersWithConflict, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
        console.error('Error fetching web orders:', err);
        res.status(500).json({ error: 'Error al obtener pedidos' });
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/web-orders/:id
// ──────────────────────────────────────────────────────────────────────────────
router.get('/:id', authenticateToken, validateEmpresaActive, async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { id } = req.params;

        const [[order]] = await pool.query(`
            SELECT
                s.id, s.total, s.subtotal, s.discount, s.surcharge,
                s.payment_method, s.web_status, s.web_process_type, s.created_at,
                cl.id AS cliente_id, cl.nombre, cl.apellido, cl.email, cl.client_code, cl.telefono,
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
            SELECT si.id, si.quantity, si.price, p.id AS product_id,
                   p.name, p.image_url, p.barcode, p.stock
            FROM sale_items si
            JOIN products p ON p.id = si.product_id
            WHERE si.sale_id = ?
        `, [id]);

        // Para cada item pendiente, calcular cuánto está reservado por órdenes anteriores
        let itemsConReserva = items;
        if (order.web_status === 'pendiente') {
            itemsConReserva = await Promise.all(items.map(async (item) => {
                const [[{ reservado }]] = await pool.query(`
                    SELECT COALESCE(SUM(si2.quantity), 0) AS reservado
                    FROM sales s2
                    JOIN sale_items si2 ON si2.sale_id = s2.id
                    WHERE s2.web_status = 'pendiente'
                      AND s2.id < ?
                      AND si2.product_id = ?
                `, [id, item.product_id]);

                return {
                    ...item,
                    reservado_anteriores: reservado,
                    disponible: item.stock - reservado,
                    alcanza: (item.stock - reservado) >= item.quantity,
                };
            }));
        }

        res.json({ ...order, items: itemsConReserva });
    } catch (err) {
        console.error('Error fetching order detail:', err);
        res.status(500).json({ error: 'Error al obtener el pedido' });
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/web-orders/:id/auto-process
// Llamado por Bisonte Shop justo después de crear el pedido.
// Corre FIFO + captura automática si hay stock, o cancela si no.
// Protegido por API key (no requiere JWT de usuario POS).
// ──────────────────────────────────────────────────────────────────────────────
router.post('/:id/auto-process', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== BISONTE_CAPTURE_KEY) {
        return res.status(401).json({ error: 'API key inválida' });
    }

    const { id } = req.params;
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        const [[order]] = await conn.query(`
            SELECT id, web_status, empresa_id FROM sales
            WHERE id = ? AND cash_session_id IS NULL AND cliente_id IS NOT NULL
            FOR UPDATE
        `, [id]);

        if (!order) {
            await conn.rollback();
            return res.status(404).json({ error: 'Pedido no encontrado' });
        }
        if (order.web_status !== 'pendiente') {
            await conn.rollback();
            return res.json({ skipped: true, web_status: order.web_status });
        }

        // ── 1. Verificar FIFO ──────────────────────────────────────────────
        const { okFifo, faltantesFifo, advertenciasStock } = await checkFifoStock(parseInt(id), conn);

        if (!okFifo) {
            await callBisonteCapture(parseInt(id), 'cancel').catch(() => {});
            await conn.query(`UPDATE sales SET web_status = 'cancelado', web_process_type = 'auto' WHERE id = ?`, [id]);
            await conn.commit();
            console.log(`[AutoProcess] Pedido #${id} auto-cancelado por FIFO: ${faltantesFifo.join(', ')}`);
            return res.json({ success: false, cancelado: true, motivo: faltantesFifo.join(' | ') });
        }

        // ── 2. Stock insuficiente (sin conflicto FIFO) → dejar pendiente, staff atiende ──
        if (advertenciasStock.length > 0) {
            await conn.rollback();
            console.log(`[AutoProcess] Pedido #${id} queda pendiente — stock insuficiente: ${advertenciasStock.join(', ')}`);
            return res.json({ success: false, pendiente: true, advertencias: advertenciasStock });
        }

        // ── 3. Stock OK → capturar pago ────────────────────────────────────
        const bisonteRes = await callBisonteCapture(parseInt(id), 'capture');

        if (!bisonteRes.success) {
            const nuevoEstado = bisonteRes.error?.includes('captured') ? 'confirmado' : 'cancelado';
            await conn.query(`UPDATE sales SET web_status = ?, web_process_type = 'auto' WHERE id = ?`, [nuevoEstado, id]);
            await conn.commit();
            return res.json({ success: false, error: bisonteRes.error, web_status: nuevoEstado });
        }

        await conn.query(`UPDATE sales SET web_status = 'confirmado', web_process_type = 'auto' WHERE id = ?`, [id]);

        // ── 4. Cascade: cancelar posteriores que ya no alcanzan ───────────
        const autoCancelados = await cascadeCancelLaterOrders(parseInt(id), conn);

        await conn.commit();
        console.log(`[AutoProcess] Pedido #${id} confirmado automáticamente.`);
        res.json({ success: true, confirmado: true, autoCancelados });

    } catch (err) {
        await conn.rollback();
        console.error('[AutoProcess] Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        conn.release();
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/web-orders/:id/confirm — FIFO check → capturar pago → cascade cancel
// ──────────────────────────────────────────────────────────────────────────────
router.put('/:id/confirm', authenticateToken, validateEmpresaActive, async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        const [[order]] = await conn.query(`
            SELECT id, web_status FROM sales
            WHERE id = ? AND empresa_id = ?
              AND cash_session_id IS NULL AND cliente_id IS NOT NULL
            FOR UPDATE
        `, [id, empresa_id]);

        if (!order) {
            await conn.rollback();
            return res.status(404).json({ error: 'Pedido no encontrado' });
        }
        if (order.web_status !== 'pendiente') {
            await conn.rollback();
            return res.status(400).json({ error: `El pedido ya está ${order.web_status}` });
        }

        // ── 1. Verificar posición en cola FIFO ─────────────────────────────
        const { okFifo, faltantesFifo, advertenciasStock } = await checkFifoStock(parseInt(id), conn);

        if (!okFifo) {
            // Este pedido llega "tarde" — órdenes anteriores se llevan el stock
            await callBisonteCapture(parseInt(id), 'cancel').catch(() => {});
            await conn.query(`UPDATE sales SET web_status = 'cancelado', web_process_type = 'auto' WHERE id = ?`, [id]);
            await conn.commit();

            return res.json({
                success: false,
                cancelado: true,
                motivo: `Cancelado automáticamente: órdenes anteriores ya reservaron el stock. ${faltantesFifo.join(' | ')}`,
            });
        }

        // Si hay advertencias de stock insuficiente (sin conflicto FIFO), advertir pero no bloquear
        // El staff deberá cancelar manualmente y contactar al cliente
        if (advertenciasStock.length > 0) {
            await conn.rollback();
            return res.status(409).json({
                success: false,
                stockInsuficiente: true,
                advertencias: advertenciasStock,
                mensaje: 'Stock insuficiente para confirmar. Cancela manualmente y contacta al cliente.',
            });
        }

        // ── 2. Stock OK según FIFO → capturar pago en Bisonte Shop ─────────
        const bisonteRes = await callBisonteCapture(parseInt(id), 'capture');

        if (!bisonteRes.success) {
            const nuevoEstado = bisonteRes.error?.includes('captured') ? 'confirmado' : 'cancelado';
            await conn.query(`UPDATE sales SET web_status = ?, web_process_type = 'manual' WHERE id = ?`, [nuevoEstado, id]);
            await conn.commit();
            return res.status(409).json({ error: bisonteRes.error });
        }

        await conn.query(`UPDATE sales SET web_status = 'confirmado', web_process_type = 'manual' WHERE id = ?`, [id]);

        // ── 3. Cascade: cancelar pedidos posteriores que ya no alcanzan ────
        const autoCancelados = await cascadeCancelLaterOrders(parseInt(id), conn);

        await conn.commit();

        res.json({
            success: true,
            confirmado: true,
            autoCancelados,
            stockErrors: bisonteRes.stockErrors ?? [],
        });

    } catch (err) {
        await conn.rollback();
        console.error('Error confirming web order:', err);
        res.status(500).json({ error: 'Error al confirmar el pedido: ' + err.message });
    } finally {
        conn.release();
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/web-orders/:id/cancel — liberar autorización de Stripe
// ──────────────────────────────────────────────────────────────────────────────
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

        const bisonteRes = await callBisonteCapture(parseInt(id), 'cancel');

        if (!bisonteRes.success
            && !bisonteRes.error?.includes('cancelled')
            && !bisonteRes.error?.includes('No se encontró')) {
            return res.status(500).json({ error: bisonteRes.error || 'Error al cancelar en Bisonte Shop' });
        }

        await pool.query(`UPDATE sales SET web_status = 'cancelado', web_process_type = 'manual' WHERE id = ?`, [id]);
        res.json({ success: true });

    } catch (err) {
        console.error('Error cancelling web order:', err);
        res.status(500).json({ error: 'Error al cancelar el pedido: ' + err.message });
    }
});

export default router;
