import express from 'express';
import pool from '../database/db.js';
import { authenticateToken, requireEmpresaAdmin, getEmpresaId } from '../middleware/auth.js';

const router = express.Router();

// Modulo ERP integrado. Portado del proyecto Next.js "erp-financiero": de lo
// que tenia UI real solo existian Dashboard (rentabilidad) y Pedidos. Aqui se
// reconstruye sobre el stack del POS (Express + mysql2 + JWT + empresa_id).
//
// Se corrigen dos bugs del original:
//   · stats filtraba status === "ACTIVO" (enum inexistente) -> siempre 0.
//   · la grafica usaba p.precioVentaUnit (columna inexistente) -> ingreso 0.

const STATUSES = ['EN_RUTA', 'PROBLEMA_ADUANAS', 'EN_VENTA', 'LIQUIDANDO'];

// Todas las rutas: empresa admin, alcance por empresa del token (nunca del body).
router.use(authenticateToken, requireEmpresaAdmin);

// Devuelve el empresa_id del token o corta si es global_admin (sin empresa).
function empresaOrError(req, res) {
    const empresa_id = getEmpresaId(req);
    if (!empresa_id) {
        res.status(400).json({ error: 'El ERP requiere una empresa. Inicia sesión con un usuario de empresa.' });
        return null;
    }
    return empresa_id;
}

// Fila DB (snake_case) -> objeto de la app (camelCase), como esperaba la UI.
function mapPedido(r) {
    return {
        id: r.id,
        proveedor: r.proveedor,
        fechaPedido: r.fecha_pedido,
        costoProducto: Number(r.costo_producto),
        costoEnvio: Number(r.costo_envio),
        impuestos: Number(r.impuestos),
        imprevistos: Number(r.imprevistos),
        totalPiezas: r.total_piezas,
        piezasVendidas: r.piezas_vendidas,
        porcentajeGanancia: Number(r.porcentaje_ganancia),
        status: r.status,
        notas: r.notas,
    };
}

// Normaliza y valida el cuerpo. `partial` permite campos ausentes (PATCH).
function parseBody(body, { partial } = { partial: false }) {
    const out = {};
    const errors = [];

    if (body.proveedor !== undefined) {
        if (typeof body.proveedor !== 'string' || !body.proveedor.trim()) errors.push('proveedor');
        else out.proveedor = body.proveedor.trim();
    } else if (!partial) errors.push('proveedor');

    if (body.fechaPedido !== undefined) {
        const d = new Date(body.fechaPedido);
        if (isNaN(d.getTime())) errors.push('fechaPedido');
        else out.fecha_pedido = body.fechaPedido.slice(0, 10);
    } else if (!partial) errors.push('fechaPedido');

    const nums = {
        costoProducto: 'costo_producto', costoEnvio: 'costo_envio',
        impuestos: 'impuestos', imprevistos: 'imprevistos',
        porcentajeGanancia: 'porcentaje_ganancia',
    };
    for (const [k, col] of Object.entries(nums)) {
        if (body[k] !== undefined) {
            const n = Number(body[k]);
            if (isNaN(n) || n < 0) errors.push(k);
            else out[col] = n;
        }
    }

    const ints = { totalPiezas: 'total_piezas', piezasVendidas: 'piezas_vendidas' };
    for (const [k, col] of Object.entries(ints)) {
        if (body[k] !== undefined) {
            const n = Number(body[k]);
            if (!Number.isInteger(n) || n < 0) errors.push(k);
            else out[col] = n;
        }
    }
    if (!partial && out.total_piezas === undefined) errors.push('totalPiezas');

    if (body.status !== undefined) {
        if (!STATUSES.includes(body.status)) errors.push('status');
        else out.status = body.status;
    }

    if (body.notas !== undefined) {
        out.notas = body.notas ? String(body.notas) : null;
    }

    return { data: out, errors };
}

// ── Pedidos ──────────────────────────────────────────────────────────────────

// GET /api/erp/pedidos
router.get('/pedidos', async (req, res) => {
    const empresa_id = empresaOrError(req, res);
    if (!empresa_id) return;
    try {
        const [rows] = await pool.query(
            'SELECT * FROM erp_pedidos WHERE empresa_id = ? ORDER BY fecha_pedido DESC, id DESC',
            [empresa_id]
        );
        res.json(rows.map(mapPedido));
    } catch (e) {
        console.error('GET /api/erp/pedidos error:', e);
        res.status(500).json({ error: 'Error al obtener pedidos' });
    }
});

// POST /api/erp/pedidos
router.post('/pedidos', async (req, res) => {
    const empresa_id = empresaOrError(req, res);
    if (!empresa_id) return;

    const { data, errors } = parseBody(req.body, { partial: false });
    if (errors.length) return res.status(400).json({ error: 'Campos inválidos', fields: errors });

    try {
        const [result] = await pool.query(
            `INSERT INTO erp_pedidos
               (empresa_id, proveedor, fecha_pedido, costo_producto, costo_envio, impuestos,
                imprevistos, total_piezas, piezas_vendidas, porcentaje_ganancia, status, notas)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                empresa_id, data.proveedor, data.fecha_pedido,
                data.costo_producto ?? 0, data.costo_envio ?? 0, data.impuestos ?? 0,
                data.imprevistos ?? 0, data.total_piezas, data.piezas_vendidas ?? 0,
                data.porcentaje_ganancia ?? 0, data.status ?? 'EN_RUTA', data.notas ?? null,
            ]
        );
        const [rows] = await pool.query('SELECT * FROM erp_pedidos WHERE id = ?', [result.insertId]);
        res.status(201).json(mapPedido(rows[0]));
    } catch (e) {
        console.error('POST /api/erp/pedidos error:', e);
        res.status(500).json({ error: 'Error al crear el pedido' });
    }
});

// PATCH /api/erp/pedidos/:id
router.patch('/pedidos/:id', async (req, res) => {
    const empresa_id = empresaOrError(req, res);
    if (!empresa_id) return;
    const { id } = req.params;

    const { data, errors } = parseBody(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ error: 'Campos inválidos', fields: errors });

    try {
        const [existing] = await pool.query(
            'SELECT id FROM erp_pedidos WHERE id = ? AND empresa_id = ?', [id, empresa_id]
        );
        if (existing.length === 0) return res.status(404).json({ error: 'Pedido no encontrado' });

        const cols = Object.keys(data);
        if (cols.length) {
            const set = cols.map((c) => `${c} = ?`).join(', ');
            await pool.query(
                `UPDATE erp_pedidos SET ${set} WHERE id = ? AND empresa_id = ?`,
                [...cols.map((c) => data[c]), id, empresa_id]
            );
        }

        // Auto-liquidacion: si EN_VENTA y ya se vendio mas del 85% -> LIQUIDANDO.
        const [rows] = await pool.query('SELECT * FROM erp_pedidos WHERE id = ?', [id]);
        let pedido = rows[0];
        if (pedido.status === 'EN_VENTA' && pedido.total_piezas > 0
            && pedido.piezas_vendidas / pedido.total_piezas > 0.85) {
            await pool.query('UPDATE erp_pedidos SET status = ? WHERE id = ?', ['LIQUIDANDO', id]);
            pedido = { ...pedido, status: 'LIQUIDANDO' };
        }
        res.json(mapPedido(pedido));
    } catch (e) {
        console.error('PATCH /api/erp/pedidos/:id error:', e);
        res.status(500).json({ error: 'Error al actualizar el pedido' });
    }
});

// DELETE /api/erp/pedidos/:id
router.delete('/pedidos/:id', async (req, res) => {
    const empresa_id = empresaOrError(req, res);
    if (!empresa_id) return;
    const { id } = req.params;
    try {
        const [result] = await pool.query(
            'DELETE FROM erp_pedidos WHERE id = ? AND empresa_id = ?', [id, empresa_id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
        res.json({ ok: true });
    } catch (e) {
        console.error('DELETE /api/erp/pedidos/:id error:', e);
        res.status(500).json({ error: 'Error al eliminar el pedido' });
    }
});

// ── Dashboard ─────────────────────────────────────────────────────────────────

// GET /api/erp/stats — metricas agregadas + serie mensual (6 meses).
router.get('/stats', async (req, res) => {
    const empresa_id = empresaOrError(req, res);
    if (!empresa_id) return;
    try {
        const [rows] = await pool.query(
            'SELECT * FROM erp_pedidos WHERE empresa_id = ? ORDER BY fecha_pedido DESC',
            [empresa_id]
        );

        let totalPiezas = 0, totalVendidas = 0, inversionTotal = 0;
        let ingresoEsperado = 0, ingresoActual = 0, pedidosActivos = 0;

        // Serie de 6 meses (mes actual hacia atras).
        const meses = {};
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' });
            meses[key] = { mes: label, inversion: 0, ingreso: 0 };
        }

        for (const p of rows) {
            const inversion = Number(p.costo_producto) + Number(p.costo_envio)
                + Number(p.impuestos) + Number(p.imprevistos);
            const costoUnit = p.total_piezas > 0 ? inversion / p.total_piezas : 0;
            const precioVenta = costoUnit * (1 + Number(p.porcentaje_ganancia) / 100);

            totalPiezas += p.total_piezas;
            totalVendidas += p.piezas_vendidas;
            inversionTotal += inversion;
            ingresoEsperado += p.total_piezas * precioVenta;
            ingresoActual += p.piezas_vendidas * precioVenta;
            if (p.status !== 'LIQUIDANDO') pedidosActivos += 1;

            const d = new Date(p.fecha_pedido);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (meses[key]) {
                meses[key].inversion += inversion;
                meses[key].ingreso += p.piezas_vendidas * precioVenta;
            }
        }

        const ganancia = inversionTotal > 0
            ? ((ingresoActual - inversionTotal) / inversionTotal) * 100 : 0;

        res.json({
            piezasVendidas: totalVendidas,
            piezasFaltantes: totalPiezas - totalVendidas,
            gananciaPorc: Math.round(ganancia * 10) / 10,
            inversionTotal,
            deberiamos: ingresoEsperado,
            ingresoActual,
            pedidosActivos,
            totalPedidos: rows.length,
            pedidosPorMes: Object.values(meses),
        });
    } catch (e) {
        console.error('GET /api/erp/stats error:', e);
        res.status(500).json({ error: 'Error al calcular estadísticas' });
    }
});

export default router;
