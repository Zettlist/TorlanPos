import express from 'express';
import pool from '../database/db.js';
import { authenticateToken, validateEmpresaActive } from '../middleware/auth.js';
import { sendOrderEmail } from '../services/emailService.js';

const router = express.Router();

const BISONTE_SHOP_URL = process.env.BISONTE_SHOP_URL || 'http://localhost:3000';
const BISONTE_CAPTURE_KEY = process.env.BISONTE_CAPTURE_KEY;

const VALID_STATUSES = ['pendiente', 'confirmado', 'envio', 'entregado', 'reclamo', 'cancelado'];

const ENVIA_URL_BASE = 'https://api-test.envia.com';
const STATE_CODES_ENVIA = {
    'Aguascalientes': 'AG', 'Baja California': 'BC', 'Baja California Sur': 'BS',
    'Campeche': 'CM', 'Chiapas': 'CS', 'Chihuahua': 'CH', 'Ciudad de México': 'CX',
    'Coahuila': 'CO', 'Colima': 'CL', 'Durango': 'DG', 'Guanajuato': 'GT',
    'Guerrero': 'GR', 'Hidalgo': 'HG', 'Jalisco': 'JA', 'Estado de México': 'EM',
    'Michoacán': 'MC', 'Morelos': 'MO', 'Nayarit': 'NA', 'Nuevo León': 'NL',
    'Oaxaca': 'OA', 'Puebla': 'PU', 'Querétaro': 'QT', 'Quintana Roo': 'QR',
    'San Luis Potosí': 'SL', 'Sinaloa': 'SI', 'Sonora': 'SO', 'Tabasco': 'TB',
    'Tamaulipas': 'TM', 'Tlaxcala': 'TL', 'Veracruz': 'VE', 'Yucatán': 'YU',
    'Zacatecas': 'ZA',
};

/**
 * Generate an Envia.com label and save tracking to DB.
 * @param {number} saleId
 * @param {object} quote  — envia_quote_data (already parsed)
 * @param {object} address — shipping_address_json (already parsed)
 * @returns {{ trackingNumber, labelData }} or throws on error
 */
async function generateEnviaLabel(saleId, quote, address) {
    const token = process.env.ENVIA_BEARER_TOKEN;
    if (!token) throw new Error('ENVIA_BEARER_TOKEN no configurado');

    const rawSt = (address.estado || '').trim().normalize('NFC').toLowerCase();
    let stateCode = 'CX';
    for (const [k, v] of Object.entries(STATE_CODES_ENVIA)) {
        if (k.normalize('NFC').toLowerCase() === rawSt) { stateCode = v; break; }
    }
    if ((address.estado || '').length <= 3 && address.estado) stateCode = address.estado;

    const pkg = quote.pkg || { length: 23, width: 32, height: 1, weight: 0.25 };
    const branchCode = quote.raw?.branches?.[0]?.branch_code || 'MTY04';

    const body = {
        origin: {
            name: 'Bisonte Manga',
            phone: '8110000000',
            street: 'Delta',
            number: '172',
            district: 'Viejo Roble',
            city: 'San Nicolás de los Garza',
            state: 'NL',
            country: 'MX',
            postalCode: '66418',
            branchCode,
        },
        destination: {
            name: address.nombre_recibe || 'Cliente',
            phone: (address.telefono || '0000000000').replace(/\D/g, '').slice(0, 10),
            street: address.calle || '',
            number: address.numero_exterior || 'S/N',
            district: address.colonia || '',
            city: address.municipio || '',
            state: stateCode,
            country: 'MX',
            postalCode: String(address.cp || '').trim(),
        },
        packages: [{
            type: 'box',
            content: 'Manga',
            amount: 1,
            declaredValue: 200,
            lengthUnit: 'CM',
            weightUnit: 'KG',
            weight: pkg.weight,
            dimensions: { length: pkg.length, width: pkg.width, height: pkg.height },
        }],
        shipment: {
            type: 1,
            carrier: quote.carrier || 'estafeta',
            service: quote.service || quote.raw?.service,
        },
        settings: {
            printFormat: 'PDF',
            printSize: 'PAPER_7X4.75',
        },
    };

    const res = await fetch(`${ENVIA_URL_BASE}/ship/generate/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(`Envia.com respuesta inválida: ${text.slice(0, 200)}`); }

    if (!res.ok || data.error || !data.data) {
        const errObj = data.error || data.message || `Envia.com error ${res.status}`;
        throw new Error(typeof errObj === 'string' ? errObj : JSON.stringify(errObj));
    }

    const labelData = Array.isArray(data.data) ? data.data[0] : data.data;
    const trackingNumber = labelData.trackingNumber || labelData.tracking_number || labelData.guia || '';

    await pool.query(
        `UPDATE sales SET envia_label_data = ?, tracking_number = ? WHERE id = ?`,
        [JSON.stringify(labelData), trackingNumber, saleId]
    );

    console.log(`[Envia] Sale #${saleId} — guía generada. Tracking: ${trackingNumber}`);
    return { trackingNumber, labelData };
}

async function callBisonte(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch {
        console.error(`[Bisonte] Non-JSON response (${res.status}) from ${url}:`, text.slice(0, 300));
        return { success: false, error: `Bisonte HTTP ${res.status}: respuesta inválida`, _rawStatus: res.status };
    }
}

async function callBisonteCapture(saleId, action) {
    return callBisonte(`${BISONTE_SHOP_URL}/api/orders/capture`, { saleId, action, apiKey: BISONTE_CAPTURE_KEY });
}

async function callBisonteRefund(saleId, reason) {
    return callBisonte(`${BISONTE_SHOP_URL}/api/orders/refund`, { saleId, reason: reason || 'requested_by_customer', apiKey: BISONTE_CAPTURE_KEY });
}

/**
 * Deduct stock for all items in an order.
 * Uses stock_deducted flag to prevent double deduction.
 */
async function deductStock(saleId, conn) {
    const [[{ already }]] = await conn.query(
        `SELECT stock_deducted AS already FROM sales WHERE id = ?`, [saleId]
    );
    if (already) return; // already deducted, skip

    await conn.query(`
        UPDATE products p
        JOIN sale_items si ON si.product_id = p.id
        SET p.stock = GREATEST(0, p.stock - si.quantity)
        WHERE si.sale_id = ?
    `, [saleId]);

    await conn.query(
        `UPDATE sales SET stock_deducted = 1 WHERE id = ?`, [saleId]
    );
}

/**
 * Fetch minimal order data for email (nombre, apellido, email, total, etc.)
 */
async function getOrderForEmail(saleId, conn) {
    const [[order]] = await conn.query(`
        SELECT s.id, s.total, s.tracking_number, s.claim_notes,
               cl.nombre, cl.apellido, cl.email
        FROM sales s
        LEFT JOIN clientes cl ON cl.id = s.cliente_id
        WHERE s.id = ?
    `, [saleId]);
    return order;
}

/**
 * Evalúa el stock de un pedido considerando la cola FIFO.
 */
async function checkFifoStock(saleId, conn) {
    const [items] = await conn.query(`
        SELECT si.product_id, si.quantity, p.name, p.stock
        FROM sale_items si
        JOIN products p ON p.id = si.product_id
        WHERE si.sale_id = ?
    `, [saleId]);

    const faltantesFifo    = [];
    const advertenciasStock = [];

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
                faltantesFifo.push(
                    `"${item.name}" (stock: ${item.stock}, reservado por órdenes anteriores: ${reservado}, necesitas: ${item.quantity})`
                );
            } else {
                advertenciasStock.push(
                    `"${item.name}" (stock disponible: ${item.stock}, pedido: ${item.quantity})`
                );
            }
        }
    }

    return { okFifo: faltantesFifo.length === 0, faltantesFifo, advertenciasStock };
}

/**
 * Cancela automáticamente pedidos POSTERIORES que ya no tienen stock.
 */
async function cascadeCancelLaterOrders(confirmedSaleId, conn) {
    const [confirmedItems] = await conn.query(
        `SELECT product_id FROM sale_items WHERE sale_id = ?`, [confirmedSaleId]
    );
    const productIds = confirmedItems.map(i => i.product_id);
    if (!productIds.length) return [];

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
            try { await callBisonteCapture(laterSaleId, 'cancel'); } catch { /* ignore */ }
            await conn.query(
                `UPDATE sales SET web_status = 'cancelado', web_process_type = 'auto' WHERE id = ?`,
                [laterSaleId]
            );
            autoCancelled.push({ id: laterSaleId, motivo: faltantesFifo.join('; ') });
            // Notify client of auto-cancel
            const orderData = await getOrderForEmail(laterSaleId, conn);
            if (orderData?.email) {
                sendOrderEmail('cancelado', orderData.email, { ...orderData, motivo: faltantesFifo.join(' | ') });
            }
        }
    }

    return autoCancelled;
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/web-orders/envia-webhook  — Envia.com connectivity test (Probar)
// ──────────────────────────────────────────────────────────────────────────────
router.get('/envia-webhook', (req, res) => {
    res.json({ ok: true });
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/web-orders/envia-webhook
// Envia.com onShipmentStatusUpdate — no auth required (external callback)
// Marks sale as 'entregado' when carrier delivers the package.
// ──────────────────────────────────────────────────────────────────────────────
router.post('/envia-webhook', async (req, res) => {
    const body = req.body;
    console.log('[EnviaWebhook] Received:', JSON.stringify(body));

    // Respond 200 immediately so Envia.com doesn't retry
    res.json({ received: true });

    try {
        // Envia.com field names vary — try all known variants
        const trackingNumber =
            body.trackingNumber || body.tracking_number || body.guia ||
            body.data?.trackingNumber || body.data?.tracking_number || body.data?.guia;

        const statusRaw = (
            body.status || body.shipmentStatus || body.state ||
            body.data?.status || body.data?.shipmentStatus || body.data?.state || ''
        ).toLowerCase();

        if (!trackingNumber) {
            console.log('[EnviaWebhook] No tracking number found in payload — ignoring.');
            return;
        }

        // Detect delivery: Envia.com may send "delivered", "entregado", "D", etc.
        const isDelivered = ['delivered', 'entregado', 'delivery', 'entrega'].some(k => statusRaw.includes(k));

        if (!isDelivered) {
            console.log(`[EnviaWebhook] Tracking ${trackingNumber} status="${statusRaw}" — not a delivery event, ignoring.`);
            return;
        }

        // Find the sale by tracking number
        const [[sale]] = await pool.query(
            `SELECT id, web_status FROM sales WHERE tracking_number = ? AND cash_session_id IS NULL LIMIT 1`,
            [trackingNumber]
        );

        if (!sale) {
            console.log(`[EnviaWebhook] No sale found for tracking ${trackingNumber}`);
            return;
        }

        if (sale.web_status === 'entregado') {
            console.log(`[EnviaWebhook] Sale #${sale.id} already entregado — skipping.`);
            return;
        }

        if (sale.web_status !== 'envio') {
            console.log(`[EnviaWebhook] Sale #${sale.id} status="${sale.web_status}" — unexpected, skipping auto-deliver.`);
            return;
        }

        await pool.query(
            `UPDATE sales SET web_status = 'entregado', delivered_at = NOW() WHERE id = ?`,
            [sale.id]
        );
        console.log(`[EnviaWebhook] Sale #${sale.id} marcado como entregado. Tracking: ${trackingNumber}`);

        // Send delivery email
        const conn = await pool.getConnection();
        const orderData = await getOrderForEmail(sale.id, conn);
        conn.release();
        if (orderData?.email) sendOrderEmail('entregado', orderData.email, orderData);

    } catch (err) {
        console.error('[EnviaWebhook] Error processing webhook:', err.message);
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/web-orders
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', authenticateToken, validateEmpresaActive, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const empresa_id = req.user.empresa_id;
        const { page = 1, limit = 30, status } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const params = [empresa_id];
        let statusFilter = '';
        if (status && VALID_STATUSES.includes(status)) {
            statusFilter = 'AND s.web_status = ?';
            params.push(status);
        }

        const [orders] = await pool.query(`
            SELECT
                s.id, s.total, s.subtotal, s.discount, s.surcharge,
                s.payment_method, s.web_status, s.web_process_type, s.created_at,
                s.shipping_status, s.tracking_number, s.claim_status,
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
              CASE s.web_status
                WHEN 'pendiente'  THEN 0
                WHEN 'confirmado' THEN 1
                WHEN 'envio'      THEN 2
                WHEN 'reclamo'    THEN 3
                WHEN 'entregado'  THEN 4
                ELSE 5
              END,
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
                s.shipping_status, s.tracking_number, s.claim_status, s.claim_notes,
                s.shipped_at, s.delivered_at,
                s.shipping_method, s.envia_quote_data, s.envia_label_data, s.shipping_address_json,
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

        const { okFifo, faltantesFifo, advertenciasStock } = await checkFifoStock(parseInt(id), conn);

        if (!okFifo) {
            await callBisonteCapture(parseInt(id), 'cancel').catch(() => {});
            await conn.query(`UPDATE sales SET web_status = 'cancelado', web_process_type = 'auto' WHERE id = ?`, [id]);
            await conn.commit();
            const orderData = await getOrderForEmail(id, conn);
            if (orderData?.email) sendOrderEmail('cancelado', orderData.email, { ...orderData, motivo: faltantesFifo.join(' | ') });
            return res.json({ success: false, cancelado: true, motivo: faltantesFifo.join(' | ') });
        }

        if (advertenciasStock.length > 0) {
            await conn.rollback();
            return res.json({ success: false, pendiente: true, advertencias: advertenciasStock });
        }

        const bisonteRes = await callBisonteCapture(parseInt(id), 'capture');

        if (!bisonteRes.success) {
            const nuevoEstado = bisonteRes.error?.includes('captured') ? 'confirmado' : 'cancelado';
            await conn.query(`UPDATE sales SET web_status = ?, web_process_type = 'auto' WHERE id = ?`, [nuevoEstado, id]);
            await conn.commit();
            return res.json({ success: false, error: bisonteRes.error, web_status: nuevoEstado });
        }

        await conn.query(`UPDATE sales SET web_status = 'confirmado', web_process_type = 'auto' WHERE id = ?`, [id]);
        await deductStock(parseInt(id), conn);
        const autoCancelados = await cascadeCancelLaterOrders(parseInt(id), conn);
        await conn.commit();

        const orderData = await getOrderForEmail(id, conn);
        if (orderData?.email) sendOrderEmail('confirmado', orderData.email, orderData);

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
// PUT /api/web-orders/:id/confirm
// ──────────────────────────────────────────────────────────────────────────────
router.put('/:id/confirm', authenticateToken, validateEmpresaActive, async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        const [[order]] = await conn.query(`
            SELECT id, web_status, shipping_method, envia_quote_data, envia_label_data, shipping_address_json
            FROM sales
            WHERE id = ? AND empresa_id = ?
              AND cash_session_id IS NULL AND cliente_id IS NOT NULL
            FOR UPDATE
        `, [id, empresa_id]);

        if (!order) { await conn.rollback(); return res.status(404).json({ error: 'Pedido no encontrado' }); }
        if (order.web_status !== 'pendiente') { await conn.rollback(); return res.status(400).json({ error: `El pedido ya está ${order.web_status}` }); }

        const { okFifo, faltantesFifo, advertenciasStock } = await checkFifoStock(parseInt(id), conn);

        if (!okFifo) {
            await callBisonteCapture(parseInt(id), 'cancel').catch(() => {});
            await conn.query(`UPDATE sales SET web_status = 'cancelado', web_process_type = 'auto' WHERE id = ?`, [id]);
            await conn.commit();
            const orderData = await getOrderForEmail(id, conn);
            if (orderData?.email) sendOrderEmail('cancelado', orderData.email, { ...orderData, motivo: faltantesFifo.join(' | ') });
            return res.json({ success: false, cancelado: true, motivo: `Cancelado automáticamente: ${faltantesFifo.join(' | ')}` });
        }

        if (advertenciasStock.length > 0) {
            await conn.rollback();
            return res.status(409).json({ success: false, stockInsuficiente: true, advertencias: advertenciasStock, mensaje: 'Stock insuficiente. Cancela manualmente y contacta al cliente.' });
        }

        // Stock OK — generate Envia.com label BEFORE capturing payment
        let labelError = null;
        if (order.shipping_method === 'envia' && !order.envia_label_data) {
            await conn.rollback(); // release row lock during external API call
            try {
                const quote = typeof order.envia_quote_data === 'string'
                    ? JSON.parse(order.envia_quote_data)
                    : (order.envia_quote_data || {});
                const address = typeof order.shipping_address_json === 'string'
                    ? JSON.parse(order.shipping_address_json)
                    : (order.shipping_address_json || {});
                await generateEnviaLabel(parseInt(id), quote, address);
            } catch (err) {
                console.error(`[Envia] Error generando guía para pedido #${id}:`, err.message);
                labelError = err.message; // log but don't block confirmation
            }
            // Re-acquire connection for the rest of the transaction
            await conn.beginTransaction();
        }

        const bisonteRes = await callBisonteCapture(parseInt(id), 'capture');

        if (!bisonteRes.success) {
            const nuevoEstado = bisonteRes.error?.includes('captured') ? 'confirmado' : 'cancelado';
            await conn.query(`UPDATE sales SET web_status = ?, web_process_type = 'manual' WHERE id = ?`, [nuevoEstado, id]);
            await conn.commit();
            return res.status(409).json({ error: bisonteRes.error });
        }

        await conn.query(`UPDATE sales SET web_status = 'confirmado', web_process_type = 'manual' WHERE id = ?`, [id]);
        await deductStock(parseInt(id), conn);
        const autoCancelados = await cascadeCancelLaterOrders(parseInt(id), conn);
        await conn.commit();

        const orderData = await getOrderForEmail(id, conn);
        if (orderData?.email) sendOrderEmail('confirmado', orderData.email, orderData);

        res.json({ success: true, confirmado: true, autoCancelados, stockErrors: bisonteRes.stockErrors ?? [], labelError });
    } catch (err) {
        await conn.rollback();
        console.error('Error confirming web order:', err);
        res.status(500).json({ error: 'Error al confirmar el pedido: ' + err.message });
    } finally {
        conn.release();
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/web-orders/:id/ship
// Body: { shipping_status: 'en_espera'|'despachado', tracking_number?: string }
// ──────────────────────────────────────────────────────────────────────────────
router.put('/:id/ship', authenticateToken, validateEmpresaActive, async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;
    const { shipping_status, tracking_number } = req.body;

    if (!['en_espera', 'despachado'].includes(shipping_status)) {
        return res.status(400).json({ error: 'shipping_status debe ser en_espera o despachado' });
    }

    try {
        const [[order]] = await pool.query(`
            SELECT id, web_status FROM sales
            WHERE id = ? AND empresa_id = ? AND cash_session_id IS NULL AND cliente_id IS NOT NULL
        `, [id, empresa_id]);

        if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
        if (!['confirmado', 'envio'].includes(order.web_status)) {
            return res.status(400).json({ error: 'Solo se pueden enviar pedidos confirmados' });
        }

        await pool.query(`
            UPDATE sales
            SET web_status = 'envio',
                shipping_status = ?,
                tracking_number = ?,
                shipped_at = CASE WHEN shipped_at IS NULL THEN NOW() ELSE shipped_at END
            WHERE id = ?
        `, [shipping_status, tracking_number || null, id]);

        const conn = await pool.getConnection();
        const orderData = await getOrderForEmail(id, conn);
        conn.release();

        const templateKey = shipping_status === 'despachado' ? 'envio_despachado' : 'envio_espera';
        if (orderData?.email) sendOrderEmail(templateKey, orderData.email, { ...orderData, tracking_number });

        res.json({ success: true, web_status: 'envio', shipping_status, tracking_number });
    } catch (err) {
        console.error('Error shipping order:', err);
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/web-orders/:id/deliver
// ──────────────────────────────────────────────────────────────────────────────
router.put('/:id/deliver', authenticateToken, validateEmpresaActive, async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    try {
        const [[order]] = await pool.query(`
            SELECT id, web_status FROM sales
            WHERE id = ? AND empresa_id = ? AND cash_session_id IS NULL AND cliente_id IS NOT NULL
        `, [id, empresa_id]);

        if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
        if (order.web_status !== 'envio') {
            return res.status(400).json({ error: 'Solo se pueden entregar pedidos en envío' });
        }

        await pool.query(`
            UPDATE sales SET web_status = 'entregado', delivered_at = NOW()
            WHERE id = ?
        `, [id]);

        const conn = await pool.getConnection();
        const orderData = await getOrderForEmail(id, conn);
        conn.release();

        if (orderData?.email) sendOrderEmail('entregado', orderData.email, orderData);

        res.json({ success: true, web_status: 'entregado' });
    } catch (err) {
        console.error('Error delivering order:', err);
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/web-orders/:id/claim
// Body: { claim_status: 'disputa'|'resolucion', claim_notes?: string }
// Stock: NEVER moved (neither on disputa nor resolucion)
// ──────────────────────────────────────────────────────────────────────────────
router.put('/:id/claim', authenticateToken, validateEmpresaActive, async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;
    const { claim_status, claim_notes } = req.body;

    if (!['disputa', 'resolucion'].includes(claim_status)) {
        return res.status(400).json({ error: 'claim_status debe ser disputa o resolucion' });
    }

    try {
        const [[order]] = await pool.query(`
            SELECT id, web_status FROM sales
            WHERE id = ? AND empresa_id = ? AND cash_session_id IS NULL AND cliente_id IS NOT NULL
        `, [id, empresa_id]);

        if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
        if (['cancelado', 'pendiente'].includes(order.web_status)) {
            return res.status(400).json({ error: 'No se puede abrir reclamo en este estado' });
        }

        await pool.query(`
            UPDATE sales
            SET web_status = 'reclamo', claim_status = ?, claim_notes = ?
            WHERE id = ?
        `, [claim_status, claim_notes || null, id]);

        const conn = await pool.getConnection();
        const orderData = await getOrderForEmail(id, conn);
        conn.release();

        const templateKey = claim_status === 'resolucion' ? 'reclamo_resolucion' : 'reclamo_disputa';
        if (orderData?.email) sendOrderEmail(templateKey, orderData.email, { ...orderData, claim_notes });

        res.json({ success: true, web_status: 'reclamo', claim_status });
    } catch (err) {
        console.error('Error claiming order:', err);
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/web-orders/:id/cancel
// ──────────────────────────────────────────────────────────────────────────────
router.put('/:id/cancel', authenticateToken, validateEmpresaActive, async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;
    const { motivo } = req.body || {};

    try {
        const [[order]] = await pool.query(`
            SELECT id, web_status, stock_deducted FROM sales
            WHERE id = ? AND empresa_id = ? AND cash_session_id IS NULL AND cliente_id IS NOT NULL
        `, [id, empresa_id]);

        if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

        const needsRefund = ['confirmado', 'envio', 'entregado', 'reclamo'].includes(order.web_status);

        if (needsRefund) {
            // Payment was already captured — issue Stripe refund via Bisonte Shop
            const refundRes = await callBisonteRefund(parseInt(id), motivo || 'requested_by_customer');

            if (!refundRes.success && !refundRes.alreadyRefunded) {
                return res.status(502).json({
                    error: refundRes.error || 'Error al procesar el reembolso en Stripe',
                    code: 'REFUND_FAILED',
                });
            }

            // Restore stock if it was deducted by TorlanPos
            if (order.stock_deducted) {
                await pool.query(`
                    UPDATE products p
                    JOIN sale_items si ON si.product_id = p.id
                    SET p.stock = p.stock + si.quantity
                    WHERE si.sale_id = ?
                `, [id]);
                await pool.query(`UPDATE sales SET stock_deducted = 0 WHERE id = ?`, [id]);
            }

            await pool.query(
                `UPDATE sales SET web_status = 'cancelado', web_process_type = 'manual' WHERE id = ?`, [id]
            );

            const conn = await pool.getConnection();
            const orderData = await getOrderForEmail(id, conn);
            conn.release();
            if (orderData?.email) sendOrderEmail('cancelado', orderData.email, { ...orderData, motivo });

            return res.json({
                success: true,
                refunded: true,
                refund_id: refundRes.refund_id,
                alreadyRefunded: refundRes.alreadyRefunded || false,
            });
        }

        // Pending order — just void the payment authorization
        const bisonteRes = await callBisonteCapture(parseInt(id), 'cancel');

        // If Bisonte says it was already captured (race condition), switch to refund flow
        if (!bisonteRes.success && bisonteRes.error?.includes('captured')) {
            const refundRes = await callBisonteRefund(parseInt(id), motivo || 'requested_by_customer');
            if (!refundRes.success && !refundRes.alreadyRefunded) {
                return res.status(502).json({ error: refundRes.error || 'Error al reembolsar en Stripe', code: 'REFUND_FAILED' });
            }
            await pool.query(`UPDATE sales SET web_status = 'cancelado', web_process_type = 'manual' WHERE id = ?`, [id]);
            const conn2 = await pool.getConnection();
            const orderData2 = await getOrderForEmail(id, conn2);
            conn2.release();
            if (orderData2?.email) sendOrderEmail('cancelado', orderData2.email, { ...orderData2, motivo });
            return res.json({ success: true, refunded: true, refund_id: refundRes.refund_id });
        }

        if (!bisonteRes.success
            && !bisonteRes.error?.includes('cancelled')
            && !bisonteRes.error?.includes('No se encontró')) {
            return res.status(500).json({ error: bisonteRes.error || 'Error al cancelar en Bisonte Shop' });
        }

        await pool.query(
            `UPDATE sales SET web_status = 'cancelado', web_process_type = 'manual' WHERE id = ?`, [id]
        );

        const conn = await pool.getConnection();
        const orderData = await getOrderForEmail(id, conn);
        conn.release();
        if (orderData?.email) sendOrderEmail('cancelado', orderData.email, { ...orderData, motivo });

        res.json({ success: true, refunded: false });
    } catch (err) {
        console.error('Error cancelling web order:', err);
        res.status(500).json({ error: 'Error al cancelar el pedido: ' + err.message });
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/web-orders/:id/generate-label
// Fallback: manually generate Envia.com label (if auto-gen at confirm failed)
// Works for pendiente (label only), confirmado/envio (label + advance to envio)
// ──────────────────────────────────────────────────────────────────────────────
router.post('/:id/generate-label', authenticateToken, validateEmpresaActive, async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    try {
        const [[order]] = await pool.query(`
            SELECT id, web_status, shipping_method, envia_quote_data, envia_label_data, shipping_address_json
            FROM sales WHERE id = ? AND empresa_id = ?
              AND cash_session_id IS NULL AND cliente_id IS NOT NULL
        `, [id, empresa_id]);

        if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
        if (order.shipping_method !== 'envia') return res.status(400).json({ error: 'Este pedido usa Envío Bisonte, no Envia.com' });
        if (!['pendiente', 'confirmado', 'envio'].includes(order.web_status)) {
            return res.status(400).json({ error: 'No se puede generar etiqueta para este pedido' });
        }

        // Already has label — return idempotently
        if (order.envia_label_data) {
            const label = typeof order.envia_label_data === 'string'
                ? JSON.parse(order.envia_label_data)
                : order.envia_label_data;
            return res.json({ success: true, alreadyGenerated: true, label });
        }

        const quote = typeof order.envia_quote_data === 'string'
            ? JSON.parse(order.envia_quote_data) : (order.envia_quote_data || {});
        const address = typeof order.shipping_address_json === 'string'
            ? JSON.parse(order.shipping_address_json) : (order.shipping_address_json || {});

        const { trackingNumber, labelData } = await generateEnviaLabel(parseInt(id), quote, address);

        // pendiente: label stored only (stock not confirmed yet, no status change)
        // confirmado/envio: advance to envio
        if (order.web_status !== 'pendiente') {
            await pool.query(
                `UPDATE sales SET web_status = 'envio',
                 shipping_status = 'en_espera', shipped_at = COALESCE(shipped_at, NOW())
                 WHERE id = ?`,
                [id]
            );
        }

        const conn = await pool.getConnection();
        const orderData = await getOrderForEmail(id, conn);
        conn.release();
        if (orderData?.email) {
            sendOrderEmail('envio_espera', orderData.email, { ...orderData, tracking_number: trackingNumber });
        }

        res.json({ success: true, label: labelData, trackingNumber });

    } catch (err) {
        console.error('[GenerateLabel] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
