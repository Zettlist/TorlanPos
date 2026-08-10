import express from 'express';
import pool from '../database/db.js';
import { authenticateToken, validateEmpresaActive } from '../middleware/auth.js';
import { sendOrderEmail } from '../services/emailService.js';

const router = express.Router();

const VALID_STATUSES = ['pendiente', 'confirmado', 'envio', 'entregado', 'reclamo', 'cancelado'];

const ENVIA_URL_BASE = process.env.ENVIA_API_URL || 'https://api-test.envia.com';
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

// El pedido web ya no se deduce de sales (antes: cash_session_id IS NULL AND
// cliente_id IS NOT NULL). Existe si hay fila en bisonte_orders, punto.
const ORDER_FROM = `
    FROM bisonte_orders bo
    JOIN sales s ON s.id = bo.sale_id
    LEFT JOIN clientes cl ON cl.id = bo.cliente_id
`;

// ─────────────────────────────────────────────────────────────────────────────
//  BANDEJA DE SALIDA
//
//  El cobro en Stripe vive en la tienda, asi que el POS tiene que saltar por
//  HTTP. Ese salto no es transaccional: antes el error se tragaba en un catch
//  vacio y el POS daba por cancelado un pedido cuya autorizacion seguia viva en
//  la tarjeta del cliente.
//
//  Ahora la intencion se escribe en la MISMA transaccion que mueve el estado.
//  Si el proceso muere entre el commit y la llamada, la fila sigue pendiente y
//  el worker la reintenta. Nada se pierde en silencio.
// ─────────────────────────────────────────────────────────────────────────────
async function enqueue(conn, tipo, saleId, payload = null) {
    await conn.query(
        `INSERT INTO integration_outbox (tipo, sale_id, payload) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE estado = 'pendiente', intentos = 0, ultimo_error = NULL`,
        [tipo, saleId, payload ? JSON.stringify(payload) : null]
    );
}

// ─────────────────────────────────────────────────────────────────────────────
//  RESERVA DE INVENTARIO
//
//  La tienda reserva al confirmar el checkout (stock_reservado += cantidad),
//  con CHECK (stock_reservado <= stock) impidiendo la sobreventa desde la base.
//  Aqui solo se consuma o se libera.
//
//  Esto reemplaza a checkFifoStock y cascadeCancelLaterOrders, que recorrian
//  toda la cola de pendientes con una subquery por item — O(n^2) y sin bloqueo,
//  o sea sobreventa cuando dos confirmaciones corrian a la vez. Con la reserva
//  hecha en el checkout el orden de llegada se resuelve solo: quien no alcanza
//  no completa la compra, en vez de enterarse despues de pagar.
// ─────────────────────────────────────────────────────────────────────────────

/** Consuma la reserva: baja stock fisico y libera lo comprometido. */
async function commitReservation(saleId, conn) {
    const [[row]] = await conn.query(
        `SELECT stock_deducted FROM bisonte_orders WHERE sale_id = ? FOR UPDATE`, [saleId]
    );
    if (!row || row.stock_deducted) return false;

    await conn.query(`
        UPDATE products p
          JOIN sale_items si ON si.product_id = p.id
           SET p.stock           = p.stock - si.quantity,
               p.stock_reservado = GREATEST(0, p.stock_reservado - si.quantity)
         WHERE si.sale_id = ?
    `, [saleId]);

    await conn.query(
        `UPDATE bisonte_orders SET stock_deducted = 1 WHERE sale_id = ?`, [saleId]
    );
    return true;
}

/** Libera la reserva sin tocar el stock fisico (pedido cancelado antes de surtir). */
async function releaseReservation(saleId, conn) {
    await conn.query(`
        UPDATE products p
          JOIN sale_items si ON si.product_id = p.id
           SET p.stock_reservado = GREATEST(0, p.stock_reservado - si.quantity)
         WHERE si.sale_id = ?
    `, [saleId]);
}

/** Devuelve al inventario un pedido ya surtido (cancelacion con reembolso). */
async function restoreStock(saleId, conn) {
    const [[row]] = await conn.query(
        `SELECT stock_deducted FROM bisonte_orders WHERE sale_id = ? FOR UPDATE`, [saleId]
    );
    if (!row || !row.stock_deducted) return false;

    await conn.query(`
        UPDATE products p
          JOIN sale_items si ON si.product_id = p.id
           SET p.stock = p.stock + si.quantity
         WHERE si.sale_id = ?
    `, [saleId]);

    await conn.query(
        `UPDATE bisonte_orders SET stock_deducted = 0 WHERE sale_id = ?`, [saleId]
    );
    return true;
}

async function getOrderForEmail(saleId, conn) {
    const [[order]] = await conn.query(`
        SELECT s.id, s.total, bo.tracking_number, bo.claim_notes,
               bo.shipping_method, bo.envia_quote_data,
               cl.nombre, cl.apellido, cl.email
        ${ORDER_FROM}
        WHERE s.id = ?
    `, [saleId]);
    if (!order) return order;

    if (order.envia_quote_data) {
        try {
            const q = typeof order.envia_quote_data === 'string'
                ? JSON.parse(order.envia_quote_data)
                : order.envia_quote_data;
            order.carrier = q.carrier || null;
        } catch { order.carrier = null; }
    }
    return order;
}

/** Genera guia en Envia.com y guarda el tracking. Lanza si falla. */
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
            name: process.env.SHIP_ORIGIN_NAME || 'Bisonte Manga',
            phone: process.env.SHIP_ORIGIN_PHONE || '8110000000',
            street: process.env.SHIP_ORIGIN_STREET || 'Delta',
            number: '172',
            district: process.env.SHIP_ORIGIN_DISTRICT || 'Viejo Roble',
            city: process.env.SHIP_ORIGIN_CITY || 'San Nicolás de los Garza',
            state: process.env.SHIP_ORIGIN_STATE || 'NL',
            country: 'MX',
            postalCode: process.env.SHIP_ORIGIN_CP || '66418',
            branchCode,
        },
        destination: {
            name: address.nombre_recibe || 'Cliente',
            phone: (address.telefono || '0000000000').replace(/\D/g, '').slice(0, 10),
            street: address.calle || '',
            number: address.numero_ext || address.numero_exterior || 'S/N',
            district: address.colonia || '',
            city: address.municipio || '',
            state: stateCode,
            country: 'MX',
            postalCode: String(address.cp || '').trim(),
        },
        packages: [{
            type: 'box', content: 'Manga', amount: 1, declaredValue: 200,
            lengthUnit: 'CM', weightUnit: 'KG', weight: pkg.weight,
            dimensions: { length: pkg.length, width: pkg.width, height: pkg.height },
        }],
        shipment: {
            type: 1,
            carrier: quote.carrier || 'estafeta',
            service: quote.service || quote.raw?.service,
        },
        settings: { printFormat: 'PDF', printSize: 'PAPER_7X4.75' },
    };

    const res = await fetch(`${ENVIA_URL_BASE}/ship/generate/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(`Envia.com respuesta inválida: ${text.slice(0, 200)}`); }

    if (!res.ok || data.error || !data.data) {
        const errObj = data.error || data.message || `Envia.com error ${res.status}`;
        throw new Error(typeof errObj === 'string' ? errObj : JSON.stringify(errObj));
    }

    const labelData = Array.isArray(data.data) ? data.data[0] : data.data;
    const trackingNumber = labelData.trackingNumber || labelData.tracking_number || labelData.guia || '';

    await pool.query(
        `UPDATE bisonte_orders SET envia_label_data = ?, tracking_number = ? WHERE sale_id = ?`,
        [JSON.stringify(labelData), trackingNumber, saleId]
    );

    console.log(`[Envia] Pedido #${saleId} — guía generada. Tracking: ${trackingNumber}`);
    return { trackingNumber, labelData };
}

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/web-orders
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', authenticateToken, validateEmpresaActive, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const empresa_id = req.user.empresa_id;
        const { page = 1, limit = 30, status, claim_status } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const params = [empresa_id];
        let filtro = '';
        if (status && VALID_STATUSES.includes(status)) {
            filtro = 'AND bo.estado = ?';
            params.push(status);
        }
        if (claim_status && ['disputa', 'resolucion'].includes(claim_status)) {
            filtro += ' AND bo.claim_status = ?';
            params.push(claim_status);
        }

        // `conflicto` sale de un LEFT JOIN agregado, no de una consulta por
        // pedido. Antes esta ruta abria UNA CONEXION NUEVA por cada pedido
        // pendiente de la pagina y corria checkFifoStock (a su vez una query
        // por item): con 30 pedidos podia agotar el pool para pintar una lista.
        const [orders] = await pool.query(`
            SELECT
                s.id, s.total, s.subtotal, s.discount, s.surcharge, s.payment_method,
                s.created_at,
                bo.estado AS web_status, bo.process_type AS web_process_type,
                bo.pago_estado, bo.shipping_status, bo.tracking_number,
                bo.claim_status, bo.claim_type, bo.shipping_method,
                cl.id AS cliente_id, cl.nombre, cl.apellido, cl.email, cl.client_code,
                agg.total_items,
                (bo.estado = 'pendiente' AND COALESCE(agg.faltantes, 0) > 0) AS conflicto
            ${ORDER_FROM}
            LEFT JOIN (
                SELECT si.sale_id,
                       COUNT(*) AS total_items,
                       SUM(si.quantity > p.stock) AS faltantes
                  FROM sale_items si
                  JOIN products p ON p.id = si.product_id
                 GROUP BY si.sale_id
            ) agg ON agg.sale_id = s.id
            WHERE s.empresa_id = ? ${filtro}
            ORDER BY
              CASE bo.estado
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
            SELECT COUNT(*) AS total ${ORDER_FROM} WHERE s.empresa_id = ? ${filtro}
        `, params);

        res.json({
            orders: orders.map(o => ({ ...o, conflicto: Boolean(o.conflicto) })),
            total, page: parseInt(page), limit: parseInt(limit),
        });
    } catch (err) {
        console.error('Error fetching web orders:', err);
        res.status(500).json({ error: 'Error al obtener pedidos' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/web-orders/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', authenticateToken, validateEmpresaActive, async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { id } = req.params;

        const [[order]] = await pool.query(`
            SELECT
                s.id, s.total, s.subtotal, s.discount, s.surcharge, s.payment_method,
                s.created_at,
                bo.estado AS web_status, bo.process_type AS web_process_type,
                bo.pago_estado, bo.payment_intent_id, bo.refund_id,
                bo.shipping_status, bo.tracking_number,
                bo.claim_status, bo.claim_type, bo.claim_notes,
                bo.shipped_at, bo.delivered_at, bo.confirmed_at, bo.cancelled_at,
                bo.shipping_method, bo.envia_quote_data, bo.envia_label_data,
                bo.shipping_address_json,
                cl.id AS cliente_id, cl.nombre, cl.apellido, cl.email,
                cl.client_code, cl.telefono
            ${ORDER_FROM}
            WHERE s.id = ? AND s.empresa_id = ?
        `, [id, empresa_id]);

        if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

        // La disponibilidad viene de la columna generada. Antes eran N subqueries
        // sumando la cola de pedidos anteriores, una por item.
        const [items] = await pool.query(`
            SELECT si.id, si.quantity, si.price,
                   p.id AS product_id, p.name, p.image_url, p.barcode,
                   p.stock, p.stock_reservado, p.stock_disponible AS disponible,
                   (p.stock >= si.quantity) AS alcanza
              FROM sale_items si
              JOIN products p ON p.id = si.product_id
             WHERE si.sale_id = ?
        `, [id]);

        res.json({
            ...order,
            items: items.map(i => ({ ...i, alcanza: Boolean(i.alcanza) })),
        });
    } catch (err) {
        console.error('Error fetching order detail:', err);
        res.status(500).json({ error: 'Error al obtener el pedido' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/web-orders/envia-webhook
//  Callback externo de Envia.com. Sin auth: responde 200 de inmediato para que
//  no reintente, y procesa despues.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/envia-webhook', (req, res) => res.json({ ok: true }));

const ENVIA_STATUS_MAP = [
    [['delivered', 'entregado', 'delivery', 'entrega'], 'entregado'],
    [['in_transit', 'shipped', 'enviado', 'picked_up', 'en_camino', 'transit'], 'envio'],
    [['devol', 'return'], 'reclamo'],
    [['incident', 'incidente', 'exception', 'con_incidente'], 'reclamo'],
    [['cancelled', 'canceled', 'cancelado'], 'cancelado'],
];

const TRANSICIONES_VALIDAS = {
    envio:     ['confirmado'],
    entregado: ['envio'],
    reclamo:   ['envio', 'entregado'],
    cancelado: ['pendiente', 'confirmado', 'envio'],
};

router.post('/envia-webhook', async (req, res) => {
    const body = req.body;
    console.log('[EnviaWebhook] Recibido:', JSON.stringify(body));
    res.json({ received: true });

    try {
        const trackingNumber =
            body.trackingNumber || body.tracking_number || body.guia ||
            body.data?.trackingNumber || body.data?.tracking_number || body.data?.guia;
        const statusRaw = (
            body.status || body.shipmentStatus || body.state ||
            body.data?.status || body.data?.shipmentStatus || body.data?.state || ''
        ).toLowerCase();

        if (!trackingNumber) return console.log('[EnviaWebhook] Sin tracking — ignorado.');

        const nuevo = ENVIA_STATUS_MAP.find(([keys]) => keys.some(k => statusRaw.includes(k)))?.[1];
        if (!nuevo) {
            return console.log(`[EnviaWebhook] ${trackingNumber} status="${statusRaw}" sin mapeo.`);
        }

        // La transicion valida se expresa en el WHERE: si el pedido ya avanzo o
        // el salto no aplica, affectedRows es 0 y no hubo lectura previa que
        // pudiera quedar obsoleta.
        const permitidos = TRANSICIONES_VALIDAS[nuevo];
        const extra = nuevo === 'entregado' ? ', bo.delivered_at = NOW()'
            : nuevo === 'reclamo' ? `, bo.claim_type = 'paqueteria', bo.claim_status = 'disputa'`
                : '';

        const [r] = await pool.query(`
            UPDATE bisonte_orders bo
               SET bo.estado = ?${extra}
             WHERE bo.tracking_number = ?
               AND bo.estado IN (${permitidos.map(() => '?').join(',')})
        `, [nuevo, trackingNumber, ...permitidos]);

        if (!r.affectedRows) {
            return console.log(`[EnviaWebhook] ${trackingNumber}: transición a ${nuevo} no aplicable.`);
        }

        const [[sale]] = await pool.query(
            `SELECT sale_id FROM bisonte_orders WHERE tracking_number = ? LIMIT 1`, [trackingNumber]);
        console.log(`[EnviaWebhook] Pedido #${sale.sale_id} → ${nuevo}. Tracking: ${trackingNumber}`);

        const conn = await pool.getConnection();
        const orderData = await getOrderForEmail(sale.sale_id, conn);
        conn.release();

        const plantilla = { entregado: 'entregado', reclamo: 'reclamo_paqueteria',
            cancelado: 'cancelado', envio: 'envio_despachado' }[nuevo];
        if (orderData?.email && plantilla) sendOrderEmail(plantilla, orderData.email, orderData);
    } catch (err) {
        console.error('[EnviaWebhook] Error:', err.message);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  CONFIRMACION DE PEDIDO
//
//  Antes esta logica estaba duplicada en /confirm (staff) y /auto-process
//  (llamada de la tienda con API key), con las dos copias divergiendo poco a
//  poco. Ahora es una funcion y las dos rutas solo cambian quien autentica y
//  que process_type se registra.
//
//  El bug que se corrige aqui era serio: cuando habia que generar guia de
//  Envia.com, la ruta hacia `await conn.rollback()` A MEDIA TRANSACCION para
//  soltar el lock durante la llamada externa, y luego `beginTransaction()` de
//  nuevo dando por hecho que el estado seguia igual. Entre esos dos puntos otra
//  peticion podia confirmar el mismo pedido: la verificacion de estado ya habia
//  pasado y el lock ya no existia. Doble cobro.
//
//  Ahora la llamada externa ocurre ANTES de abrir la transaccion, y todo lo que
//  toca la base va en una sola sin soltar el lock.
// ─────────────────────────────────────────────────────────────────────────────
async function confirmarPedido(saleId, empresaId, processType) {
    // 1. Lectura previa sin lock, solo para saber si hace falta la guia.
    const [[pre]] = await pool.query(`
        SELECT bo.estado, bo.shipping_method, bo.envia_label_data,
               bo.envia_quote_data, bo.shipping_address_json
        ${ORDER_FROM}
        WHERE s.id = ?${empresaId ? ' AND s.empresa_id = ?' : ''}
    `, empresaId ? [saleId, empresaId] : [saleId]);

    if (!pre) return { http: 404, body: { error: 'Pedido no encontrado' } };
    if (pre.estado !== 'pendiente') {
        return { http: 400, body: { skipped: true, web_status: pre.estado,
            error: `El pedido ya está ${pre.estado}` } };
    }

    // 2. Llamada externa FUERA de la transaccion. Si falla se registra pero no
    //    bloquea: la guia se puede regenerar despues desde /generate-label.
    let labelError = null;
    if (pre.shipping_method === 'envia' && !pre.envia_label_data) {
        try {
            const parse = v => typeof v === 'string' ? JSON.parse(v) : (v || {});
            await generateEnviaLabel(saleId, parse(pre.envia_quote_data), parse(pre.shipping_address_json));
        } catch (err) {
            console.error(`[Envia] Error generando guía para pedido #${saleId}:`, err.message);
            labelError = err.message;
        }
    }

    // 3. Una transaccion, un lock, sin soltarlo.
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [[order]] = await conn.query(`
            SELECT bo.id, bo.estado
              FROM bisonte_orders bo
              JOIN sales s ON s.id = bo.sale_id
             WHERE s.id = ?
             FOR UPDATE
        `, [saleId]);

        // Se revalida DENTRO del lock: entre el paso 1 y aqui pudo cambiar.
        if (!order || order.estado !== 'pendiente') {
            await conn.rollback();
            return { http: 409, body: { error: `El pedido ya está ${order?.estado ?? 'ausente'}` } };
        }

        // El stock fisico tiene que alcanzar. La reserva se hizo en el checkout,
        // asi que esto solo falla si hubo merma o ajuste manual del inventario.
        const [faltantes] = await conn.query(`
            SELECT p.name, p.stock, si.quantity
              FROM sale_items si
              JOIN products p ON p.id = si.product_id
             WHERE si.sale_id = ? AND p.stock < si.quantity
        `, [saleId]);

        if (faltantes.length) {
            await conn.rollback();
            return { http: 409, body: {
                success: false, stockInsuficiente: true,
                advertencias: faltantes.map(f => `"${f.name}" (stock: ${f.stock}, pedido: ${f.quantity})`),
                mensaje: 'Stock insuficiente. Cancela manualmente y contacta al cliente.',
            } };
        }

        await commitReservation(saleId, conn);
        await conn.query(`
            UPDATE bisonte_orders
               SET estado = 'confirmado', process_type = ?, confirmed_at = NOW()
             WHERE sale_id = ?
        `, [processType, saleId]);

        // El cobro se encola DENTRO de la transaccion: o se guardan las dos
        // cosas o ninguna. Si el proceso muere justo aqui, la fila queda
        // pendiente y el worker la reintenta.
        await enqueue(conn, 'capture', saleId);
        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }

    const conn2 = await pool.getConnection();
    const orderData = await getOrderForEmail(saleId, conn2);
    conn2.release();
    if (orderData?.email) sendOrderEmail('confirmado', orderData.email, orderData);

    return { http: 200, body: { success: true, confirmado: true, labelError } };
}

// PUT /api/web-orders/:id/confirm — staff del POS
router.put('/:id/confirm', authenticateToken, validateEmpresaActive, async (req, res) => {
    try {
        const r = await confirmarPedido(parseInt(req.params.id), req.user.empresa_id, 'manual');
        res.status(r.http).json(r.body);
    } catch (err) {
        console.error('Error confirming web order:', err);
        res.status(500).json({ error: 'Error al confirmar el pedido: ' + err.message });
    }
});

// POST /api/web-orders/:id/auto-process — llamada de la tienda con API key
router.post('/:id/auto-process', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.BISONTE_CAPTURE_KEY) {
        return res.status(401).json({ error: 'API key inválida' });
    }
    try {
        const r = await confirmarPedido(parseInt(req.params.id), null, 'auto');
        // El llamador automatico no distingue 4xx de exito parcial: siempre 200
        // con el detalle en el cuerpo, como hacia la version anterior.
        res.json(r.http === 200 ? r.body : { success: false, ...r.body });
    } catch (err) {
        console.error('[AutoProcess] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  PUT /api/web-orders/:id/ship
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/ship', authenticateToken, validateEmpresaActive, async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const saleId = parseInt(req.params.id);
    const { shipping_status, tracking_number } = req.body;

    if (!['en_espera', 'despachado'].includes(shipping_status)) {
        return res.status(400).json({ error: 'shipping_status debe ser en_espera o despachado' });
    }

    try {
        // La guardia de estado va en el propio UPDATE: si otra peticion movio el
        // pedido, affectedRows es 0 y no hay ventana entre leer y escribir.
        const [r] = await pool.query(`
            UPDATE bisonte_orders bo
              JOIN sales s ON s.id = bo.sale_id
               SET bo.estado          = 'envio',
                   bo.shipping_status = ?,
                   bo.tracking_number = COALESCE(?, bo.tracking_number),
                   bo.shipped_at      = COALESCE(bo.shipped_at, NOW())
             WHERE s.id = ? AND s.empresa_id = ?
               AND bo.estado IN ('confirmado', 'envio')
        `, [shipping_status, tracking_number || null, saleId, empresa_id]);

        if (!r.affectedRows) {
            return res.status(400).json({ error: 'Solo se pueden enviar pedidos confirmados' });
        }

        const conn = await pool.getConnection();
        const orderData = await getOrderForEmail(saleId, conn);
        conn.release();

        const templateKey = shipping_status === 'despachado' ? 'envio_despachado' : 'envio_espera';
        if (orderData?.email) sendOrderEmail(templateKey, orderData.email, { ...orderData, tracking_number });

        res.json({ success: true, web_status: 'envio', shipping_status, tracking_number });
    } catch (err) {
        console.error('Error shipping order:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  PUT /api/web-orders/:id/deliver
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/deliver', authenticateToken, validateEmpresaActive, async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const saleId = parseInt(req.params.id);

    try {
        const [r] = await pool.query(`
            UPDATE bisonte_orders bo
              JOIN sales s ON s.id = bo.sale_id
               SET bo.estado = 'entregado', bo.delivered_at = NOW()
             WHERE s.id = ? AND s.empresa_id = ? AND bo.estado = 'envio'
        `, [saleId, empresa_id]);

        if (!r.affectedRows) {
            return res.status(400).json({ error: 'Solo se pueden entregar pedidos en envío' });
        }

        const conn = await pool.getConnection();
        const orderData = await getOrderForEmail(saleId, conn);
        conn.release();
        if (orderData?.email) sendOrderEmail('entregado', orderData.email, orderData);

        res.json({ success: true, web_status: 'entregado' });
    } catch (err) {
        console.error('Error delivering order:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  PUT /api/web-orders/:id/claim
//  El stock NUNCA se mueve aqui, ni al abrir disputa ni al resolverla.
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/claim', authenticateToken, validateEmpresaActive, async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const saleId = parseInt(req.params.id);
    const { claim_status, claim_type, claim_notes } = req.body;

    if (!['disputa', 'resolucion'].includes(claim_status)) {
        return res.status(400).json({ error: 'claim_status debe ser disputa o resolucion' });
    }
    if (claim_type && !['paqueteria', 'cliente'].includes(claim_type)) {
        return res.status(400).json({ error: 'claim_type debe ser paqueteria o cliente' });
    }

    try {
        const [r] = await pool.query(`
            UPDATE bisonte_orders bo
              JOIN sales s ON s.id = bo.sale_id
               SET bo.estado = 'reclamo', bo.claim_status = ?,
                   bo.claim_type = ?, bo.claim_notes = ?
             WHERE s.id = ? AND s.empresa_id = ?
               AND bo.estado NOT IN ('cancelado', 'pendiente')
        `, [claim_status, claim_type || 'cliente', claim_notes || null, saleId, empresa_id]);

        if (!r.affectedRows) {
            return res.status(400).json({ error: 'No se puede abrir reclamo en este estado' });
        }

        const conn = await pool.getConnection();
        const orderData = await getOrderForEmail(saleId, conn);
        conn.release();

        const resolvedClaimType = claim_type || 'cliente';
        const templateKey = claim_status === 'resolucion'
            ? 'reclamo_resolucion'
            : resolvedClaimType === 'paqueteria' ? 'reclamo_paqueteria' : 'reclamo_cliente';
        if (orderData?.email) sendOrderEmail(templateKey, orderData.email, { ...orderData, claim_notes });

        res.json({ success: true, web_status: 'reclamo', claim_status });
    } catch (err) {
        console.error('Error claiming order:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  PUT /api/web-orders/:id/cancel
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/cancel', authenticateToken, validateEmpresaActive, async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const saleId = parseInt(req.params.id);
    const { motivo } = req.body || {};

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [[order]] = await conn.query(`
            SELECT bo.estado, bo.pago_estado, bo.stock_deducted
              FROM bisonte_orders bo
              JOIN sales s ON s.id = bo.sale_id
             WHERE s.id = ? AND s.empresa_id = ?
             FOR UPDATE
        `, [saleId, empresa_id]);

        if (!order) { await conn.rollback(); return res.status(404).json({ error: 'Pedido no encontrado' }); }
        if (order.estado === 'cancelado') {
            await conn.rollback();
            return res.status(409).json({ error: 'El pedido ya está cancelado' });
        }

        // Ya cobrado -> reembolso. Aun autorizado -> basta con liberar.
        const yaCobrado = order.pago_estado === 'capturado';

        if (order.stock_deducted) {
            await restoreStock(saleId, conn);
        } else {
            await releaseReservation(saleId, conn);
        }

        await conn.query(`
            UPDATE bisonte_orders
               SET estado = 'cancelado', process_type = 'manual',
                   claim_notes = COALESCE(?, claim_notes), cancelled_at = NOW()
             WHERE sale_id = ?
        `, [motivo || null, saleId]);

        // Antes el reembolso se pedia por HTTP ANTES de tocar la base, y si
        // Stripe fallaba la ruta devolvia 502 dejando el pedido a medias.
        // Ahora la intencion viaja con el resto de la transaccion.
        await enqueue(conn, yaCobrado ? 'refund' : 'cancel', saleId,
            { motivo: motivo || 'requested_by_customer' });

        await conn.commit();

        const orderData = await getOrderForEmail(saleId, conn);
        if (orderData?.email) {
            sendOrderEmail('cancelado', orderData.email, { ...orderData, motivo });
        }

        res.json({ success: true, web_status: 'cancelado', reembolso: yaCobrado });
    } catch (err) {
        await conn.rollback();
        console.error('Error cancelling order:', err);
        res.status(500).json({ error: err.message });
    } finally {
        conn.release();
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/web-orders/:id/generate-label
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/generate-label', authenticateToken, validateEmpresaActive, async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const saleId = parseInt(req.params.id);

    try {
        const [[order]] = await pool.query(`
            SELECT bo.envia_quote_data, bo.shipping_address_json, bo.envia_label_data
            ${ORDER_FROM}
            WHERE s.id = ? AND s.empresa_id = ?
        `, [saleId, empresa_id]);

        if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
        if (order.envia_label_data) {
            return res.status(409).json({ error: 'El pedido ya tiene guía generada' });
        }

        const parse = v => typeof v === 'string' ? JSON.parse(v) : (v || {});
        const { trackingNumber } = await generateEnviaLabel(
            saleId, parse(order.envia_quote_data), parse(order.shipping_address_json));

        res.json({ success: true, tracking_number: trackingNumber });
    } catch (err) {
        console.error('Error generating label:', err);
        res.status(502).json({ error: err.message });
    }
});

export default router;
