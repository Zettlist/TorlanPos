/**
 * Worker de la bandeja de salida.
 *
 * El cobro en Stripe vive en la tienda, asi que el POS tiene que saltar por
 * HTTP. Ese salto no es transaccional. Antes la llamada se hacia en linea y el
 * error se tragaba:
 *
 *     try { await callBisonteCapture(id, 'cancel'); } catch { }
 *     UPDATE sales SET web_status = 'cancelado' ...
 *
 * El POS daba por cancelado un pedido cuya autorizacion seguia viva en la
 * tarjeta del cliente, y nadie se enteraba.
 *
 * Ahora las rutas solo escriben la intencion en integration_outbox, dentro de
 * la misma transaccion que mueve el estado. Este worker la ejecuta y reintenta
 * con retroceso exponencial. Lo que no se pudo entregar queda visible en la
 * tabla con su ultimo_error, en vez de desaparecer.
 */
import pool from '../database/db.js';

const BISONTE_SHOP_URL = process.env.BISONTE_SHOP_URL || 'http://localhost:3000';
const BISONTE_CAPTURE_KEY = process.env.BISONTE_CAPTURE_KEY;

const INTERVALO_MS = Number(process.env.OUTBOX_POLL_MS) || 15_000;
const MAX_INTENTOS = Number(process.env.OUTBOX_MAX_INTENTOS) || 8;
const LOTE = 20;

/** Espera creciente entre reintentos: 1, 2, 4, 8... minutos, tope 1 hora. */
function esperaMinutos(intentos) {
    return Math.min(2 ** intentos, 60);
}

async function llamarTienda(tipo, saleId, payload) {
    const ruta = tipo === 'refund' ? '/api/orders/refund' : '/api/orders/capture';
    const body = tipo === 'refund'
        ? { saleId, reason: payload?.motivo || 'requested_by_customer', apiKey: BISONTE_CAPTURE_KEY }
        : { saleId, action: tipo === 'capture' ? 'capture' : 'cancel', apiKey: BISONTE_CAPTURE_KEY };

    const res = await fetch(`${BISONTE_SHOP_URL}${ruta}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(`Tienda HTTP ${res.status}: respuesta no-JSON: ${text.slice(0, 200)}`); }

    // Ya procesado en la tienda cuenta como exito: el reintento es idempotente.
    if (data.alreadyRefunded) return data;
    if (data.error?.includes('ya fue procesado') || data.error?.includes('captured')) return data;
    if (!data.success) throw new Error(data.error || `Tienda respondio ${res.status} sin exito`);
    return data;
}

/** Refleja en el pedido lo que la tienda confirmo. */
async function marcarPago(tipo, saleId) {
    const estadoPago = { capture: 'capturado', cancel: 'cancelado', refund: 'reembolsado' }[tipo];
    await pool.query(
        `UPDATE bisonte_orders SET pago_estado = ? WHERE sale_id = ?`, [estadoPago, saleId]);
}

async function procesarUno(fila) {
    const { id, tipo, sale_id, payload } = fila;
    try {
        await llamarTienda(tipo, sale_id, payload);
        await marcarPago(tipo, sale_id);
        await pool.query(
            `UPDATE integration_outbox SET estado = 'ok', processed_at = NOW() WHERE id = ?`, [id]);
        console.log(`[Outbox] #${id} ${tipo} pedido ${sale_id} — ok`);
    } catch (err) {
        const intentos = fila.intentos + 1;
        const agotado = intentos >= MAX_INTENTOS;
        await pool.query(`
            UPDATE integration_outbox
               SET estado = ?, intentos = ?, ultimo_error = ?,
                   next_retry_at = NOW() + INTERVAL ? MINUTE
             WHERE id = ?
        `, [agotado ? 'fallido' : 'pendiente', intentos, err.message.slice(0, 1000),
            esperaMinutos(intentos), id]);

        // Un fallido no es ruido: es dinero sin liberar o sin cobrar. Que grite.
        console.error(
            agotado
                ? `[Outbox] #${id} ${tipo} pedido ${sale_id} AGOTADO tras ${intentos} intentos: ${err.message}`
                : `[Outbox] #${id} ${tipo} pedido ${sale_id} falló (${intentos}/${MAX_INTENTOS}): ${err.message}`
        );
    }
}

export async function procesarPendientes() {
    // SKIP LOCKED permite varias instancias del POS sin repartirse mal el lote.
    const conn = await pool.getConnection();
    let filas = [];
    try {
        await conn.beginTransaction();
        const [rows] = await conn.query(`
            SELECT id, tipo, sale_id, payload, intentos
              FROM integration_outbox
             WHERE estado = 'pendiente'
               AND (next_retry_at IS NULL OR next_retry_at <= NOW())
             ORDER BY created_at, id
             LIMIT ?
             FOR UPDATE SKIP LOCKED
        `, [LOTE]);
        filas = rows;
        if (filas.length) {
            await conn.query(
                `UPDATE integration_outbox SET estado = 'procesando' WHERE id IN (?)`,
                [filas.map(f => f.id)]);
        }
        await conn.commit();
    } catch (err) {
        await conn.rollback();
        console.error('[Outbox] Error tomando lote:', err.message);
        return 0;
    } finally {
        conn.release();
    }

    for (const fila of filas) await procesarUno(fila);
    return filas.length;
}

let timer = null;

export function iniciarOutboxWorker() {
    if (timer) return;
    console.log(`[Outbox] Worker activo, cada ${INTERVALO_MS / 1000}s`);
    const tick = async () => {
        try { await procesarPendientes(); }
        catch (err) { console.error('[Outbox] Error en ciclo:', err.message); }
    };
    timer = setInterval(tick, INTERVALO_MS);
    tick();
}

export function detenerOutboxWorker() {
    if (timer) { clearInterval(timer); timer = null; }
}
