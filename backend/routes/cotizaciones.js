import express from 'express';
import multer from 'multer';
import pool from '../database/db.js';
import { uploadFileToGCS } from '../utils/storage.js';
import { authenticateToken, requireEmpresaAdmin, getEmpresaId } from '../middleware/auth.js';

const router = express.Router();

// Imagen en memoria -> Cloud Storage (carpeta 'cotizaciones'). Limite 25MB.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// ─────────────────────────────────────────────────────────────────────────────
// Cotizaciones (v2). Una cotizacion es una LISTA con nombre:
//   · items      -> productos (tipo offline/online + link, costo compra, precio venta, imagen)
//   · proveedores-> cada uno con precio base + conceptos (Envio, extra, ...) = su total
// El panel muestra totales de la cotizacion (compra, venta, % ganancia auto) y
// los totales desglosados de cada proveedor para decidir cual conviene.
// Todo con alcance por empresa del token (nunca del body).
// ─────────────────────────────────────────────────────────────────────────────

router.use(authenticateToken, requireEmpresaAdmin);

function empresaOrError(req, res) {
    const empresa_id = getEmpresaId(req);
    if (!empresa_id) {
        res.status(400).json({ error: 'Las cotizaciones requieren una empresa. Inicia sesión con un usuario de empresa.' });
        return null;
    }
    return empresa_id;
}

// ── Mapeos DB -> app ──────────────────────────────────────────────────────────
// costoCompra y precioVenta son UNITARIOS (precio de UNA unidad = un paquete).
//
//   unidades -> cuantas veces se compra el renglon.
//   piezas   -> cuantos articulos trae CADA unidad (paquetes, lotes, sets).
//   peso_kg  -> peso aproximado de UNA unidad, en kilos.
//
// Las piezas NO entran en el dinero: el precio ya es el del paquete completo.
// Solo dicen cuantos articulos se reciben. Los totales de renglon van
// precalculados para que el front no repita la operacion en cada lugar.
function mapItem(r) {
    const unidades = Math.max(1, Number(r.unidades) || 1);
    const piezas = Math.max(1, Number(r.piezas) || 1);
    const pesoKg = Math.max(0, Number(r.peso_kg) || 0);
    const costoCompra = Number(r.costo_compra);
    const precioVenta = Number(r.precio_venta);
    return {
        id: r.id,
        producto: r.producto,
        unidades,
        piezas,
        pesoKg,
        tipo: r.tipo,
        link: r.link || null,
        costoCompra,
        precioVenta,
        compraLinea: costoCompra * unidades,
        ventaLinea: precioVenta * unidades,
        piezasLinea: piezas * unidades,
        pesoLinea: pesoKg * unidades,
        imagenUrl: r.imagen_url || null,
    };
}
function mapProveedor(r, conceptos, rate) {
    const conc = conceptos.map((c) => ({ id: c.id, concepto: c.concepto, monto: Number(c.monto) }));
    // El total es SOLO la suma de los conceptos (desglose). Sin precio base aparte.
    const total = conc.reduce((s, c) => s + c.monto, 0);
    const moneda = r.moneda || 'JPY';
    // total en MXN para comparar todos los proveedores en la misma moneda.
    const totalMXN = moneda === 'JPY' ? total * rate : total;
    let itemIds = [];
    if (r.item_ids) {
        try { itemIds = typeof r.item_ids === 'string' ? JSON.parse(r.item_ids) : r.item_ids; }
        catch { itemIds = []; }
    }
    return {
        id: r.id,
        nombre: r.nombre,
        moneda,
        precioBase: Number(r.precio_base),
        notas: r.notas || null,
        conceptos: conc,
        itemIds: Array.isArray(itemIds) ? itemIds : [],
        total,       // en la moneda del proveedor
        totalMXN,    // convertido a MXN
    };
}

// Tasa JPY->MXN (MXN por 1 JPY) desde open.er-api.com. Fallback 0.13.
async function fetchRate() {
    try {
        const resp = await fetch('https://open.er-api.com/v6/latest/JPY');
        const d = await resp.json();
        if (d?.rates?.MXN) return Math.round(d.rates.MXN * 10000) / 10000;
    } catch { /* red */ }
    return 0.13;
}

// ── Validaciones ──────────────────────────────────────────────────────────────
function parseItem(body, { partial } = { partial: false }) {
    const out = {};
    const errors = [];

    if (body.producto !== undefined) {
        if (typeof body.producto !== 'string' || !body.producto.trim()) errors.push('producto');
        else out.producto = body.producto.trim().slice(0, 255);
    } else if (!partial) errors.push('producto');

    if (body.tipo !== undefined) {
        if (!['offline', 'online'].includes(body.tipo)) errors.push('tipo');
        else out.tipo = body.tipo;
    } else if (!partial) out.tipo = 'offline';

    if (body.link !== undefined) {
        out.link = body.link ? String(body.link).slice(0, 1024) : null;
    }

    // Unidades y piezas: enteros >= 1. Tope de 100000 para que un dedazo no
    // reviente los totales ni el DECIMAL(12,2) al multiplicar.
    for (const [k, col] of Object.entries({ unidades: 'unidades', piezas: 'piezas' })) {
        if (body[k] !== undefined) {
            const n = Number(body[k]);
            if (!Number.isInteger(n) || n < 1 || n > 100000) errors.push(k);
            else out[col] = n;
        } else if (!partial) out[col] = 1;
    }

    // Peso aproximado de una unidad, en KILOS. 0 = sin capturar. Se redondea a
    // 3 decimales (precision al gramo), que es lo que guarda la columna. El tope
    // de 1000 kg es solo para atajar un dedazo.
    if (body.pesoKg !== undefined) {
        const n = Number(body.pesoKg);
        if (isNaN(n) || n < 0 || n > 1000) errors.push('pesoKg');
        else out.peso_kg = Math.round(n * 1000) / 1000;
    } else if (!partial) out.peso_kg = 0;

    for (const [k, col] of Object.entries({ costoCompra: 'costo_compra', precioVenta: 'precio_venta' })) {
        if (body[k] !== undefined) {
            const n = Number(body[k]);
            if (isNaN(n) || n < 0) errors.push(k);
            else out[col] = n;
        } else if (!partial) out[col] = 0;
    }

    if (body.imagenUrl !== undefined) {
        out.imagen_url = body.imagenUrl ? String(body.imagenUrl).slice(0, 1024) : null;
    }

    return { data: out, errors };
}

// Total-o-nada: valida y normaliza toda la lista de proveedores (con conceptos).
function parseProveedores(list) {
    if (!Array.isArray(list)) return { error: 'proveedores debe ser una lista' };
    const out = [];
    for (let i = 0; i < list.length; i++) {
        const p = list[i] || {};
        if (typeof p.nombre !== 'string' || !p.nombre.trim()) return { error: `Proveedor ${i + 1}: falta nombre` };
        const moneda = p.moneda === 'MXN' ? 'MXN' : 'JPY';
        const conceptos = [];
        const rawConc = Array.isArray(p.conceptos) ? p.conceptos : [];
        for (let j = 0; j < rawConc.length; j++) {
            const c = rawConc[j] || {};
            const concepto = typeof c.concepto === 'string' ? c.concepto.trim().slice(0, 255) : '';
            if (!concepto) continue; // ignora conceptos vacíos
            const monto = Number(c.monto);
            if (isNaN(monto) || monto < 0) return { error: `Proveedor ${i + 1}, concepto ${j + 1}: monto inválido` };
            conceptos.push({ concepto, monto });
        }
        const itemIds = Array.isArray(p.itemIds)
            ? p.itemIds.map(Number).filter((n) => Number.isInteger(n))
            : [];
        out.push({
            nombre: p.nombre.trim().slice(0, 255),
            moneda,
            precioBase: 0, // ya no se usa; el total sale de los conceptos
            notas: p.notas ? String(p.notas) : null,
            itemIds,
            conceptos,
        });
    }
    return { data: out };
}

// Limpieza lazy: borra la selección (item_ids) de folios con más de 20 días.
// El folio (número + fecha) se conserva; solo la selección de productos caduca.
async function limpiarFoliosVencidos(empresa_id) {
    try {
        await pool.query(
            'UPDATE cotizacion_folios SET item_ids = NULL WHERE empresa_id = ? AND item_ids IS NOT NULL AND expires_at < NOW()',
            [empresa_id]
        );
    } catch (e) { console.error('limpiarFoliosVencidos:', e.message); }
}

// Carga el detalle completo de una cotizacion (cabecera + items + proveedores).
async function loadDetalle(empresa_id, id) {
    const [headers] = await pool.query(
        'SELECT * FROM cotizaciones WHERE id = ? AND empresa_id = ?', [id, empresa_id]
    );
    if (headers.length === 0) return null;
    const h = headers[0];

    const [items] = await pool.query(
        'SELECT * FROM cotizacion_items WHERE cotizacion_id = ? ORDER BY orden ASC, id ASC', [id]
    );
    const [provs] = await pool.query(
        'SELECT * FROM cotizacion_proveedores WHERE cotizacion_id = ? ORDER BY orden ASC, id ASC', [id]
    );
    let conceptos = [];
    if (provs.length) {
        const ids = provs.map((p) => p.id);
        const [rows] = await pool.query(
            `SELECT * FROM cotizacion_proveedor_conceptos WHERE proveedor_id IN (${ids.map(() => '?').join(',')}) ORDER BY orden ASC, id ASC`,
            ids
        );
        conceptos = rows;
    }
    // Última selección guardada (folio vigente, no vencido).
    await limpiarFoliosVencidos(empresa_id);
    let seleccionGuardada = null;
    const [selRows] = await pool.query(
        'SELECT item_ids FROM cotizacion_folios WHERE cotizacion_id = ? AND item_ids IS NOT NULL AND expires_at > NOW() ORDER BY id DESC LIMIT 1',
        [id]
    );
    if (selRows.length) {
        try { seleccionGuardada = typeof selRows[0].item_ids === 'string' ? JSON.parse(selRows[0].item_ids) : selRows[0].item_ids; }
        catch { seleccionGuardada = null; }
    }

    const rate = Number(h.tipo_cambio) || 0;
    const proveedores = provs.map((p) => mapProveedor(p, conceptos.filter((c) => c.proveedor_id === p.id), rate));

    const mappedItems = items.map(mapItem);
    // Compra en JPY (¥), venta en MXN ($). Se convierte compra a MXN con la tasa
    // para calcular la ganancia real.
    const totalCompraJPY = mappedItems.reduce((s, i) => s + i.compraLinea, 0);
    const totalCompraMXN = totalCompraJPY * rate;
    const totalVentaMXN = mappedItems.reduce((s, i) => s + i.ventaLinea, 0);
    const totalUnidades = mappedItems.reduce((s, i) => s + i.unidades, 0);
    const totalPiezas = mappedItems.reduce((s, i) => s + i.piezasLinea, 0);
    // Se redondea el acumulado: sumar decimales en coma flotante deja colas
    // tipo 6.040000000000001 que luego se ven en pantalla.
    const totalPesoKg = Math.round(mappedItems.reduce((s, i) => s + i.pesoLinea, 0) * 1000) / 1000;
    const gananciaPorc = totalCompraMXN > 0 ? Math.round(((totalVentaMXN - totalCompraMXN) / totalCompraMXN) * 1000) / 10 : 0;

    return {
        id: h.id,
        nombre: h.nombre,
        estado: h.estado,
        tipoCambio: rate,
        notas: h.notas || null,
        seleccionGuardada,
        items: mappedItems,
        proveedores,
        totales: {
            totalCompraJPY,
            totalCompraMXN,
            totalVentaMXN,
            totalUnidades,
            totalPiezas,
            totalPesoKg,
            gananciaPorc,
            gananciaMonto: totalVentaMXN - totalCompraMXN,
        },
    };
}

// ═══ Cotizaciones (cabecera) ═════════════════════════════════════════════════

// GET /api/cotizaciones/img-proxy?url=... — devuelve los bytes de una imagen de
// GCS con los headers CORS del API, para poder incrustarla en el PDF sin
// contaminar el canvas. Solo permite el bucket de storage.googleapis.com (anti-SSRF).
router.get('/img-proxy', async (req, res) => {
    const empresa_id = empresaOrError(req, res);
    if (!empresa_id) return;
    const url = String(req.query.url || '');
    if (!/^https:\/\/storage\.googleapis\.com\//.test(url)) {
        return res.status(400).json({ error: 'URL no permitida' });
    }
    try {
        const r = await fetch(url);
        if (!r.ok) return res.status(502).json({ error: 'No se pudo obtener la imagen' });
        const ct = r.headers.get('content-type') || 'image/jpeg';
        const buf = Buffer.from(await r.arrayBuffer());
        res.setHeader('Content-Type', ct);
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.send(buf);
    } catch (e) {
        console.error('GET /api/cotizaciones/img-proxy error:', e);
        res.status(500).json({ error: 'Error al obtener la imagen' });
    }
});

// GET /api/cotizaciones/fx — tasa actual JPY->MXN (para el formulario).
router.get('/fx', async (req, res) => {
    const empresa_id = empresaOrError(req, res);
    if (!empresa_id) return;
    const rate = await fetchRate();
    res.json({ rate });
});

// POST /api/cotizaciones/upload-imagen — sube una imagen a GCS y devuelve la URL,
// SIN tocar la BD. Sirve para el formulario de creación (los items aún no existen).
router.post('/upload-imagen', upload.single('imagen'), async (req, res) => {
    const empresa_id = empresaOrError(req, res);
    if (!empresa_id) return;
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' });
    try {
        const url = await uploadFileToGCS(req.file, 'cotizaciones');
        res.json({ url });
    } catch (e) {
        console.error('POST /api/cotizaciones/upload-imagen error:', e);
        res.status(500).json({ error: 'Error al subir la imagen' });
    }
});

// GET /api/cotizaciones — lista con totales agregados.
router.get('/', async (req, res) => {
    const empresa_id = empresaOrError(req, res);
    if (!empresa_id) return;
    try {
        const [rows] = await pool.query(
            `SELECT c.id, c.nombre, c.estado, c.tipo_cambio, c.created_at,
                (SELECT COUNT(*) FROM cotizacion_items i WHERE i.cotizacion_id = c.id) AS num_items,
                (SELECT COALESCE(SUM(i.unidades),0) FROM cotizacion_items i WHERE i.cotizacion_id = c.id) AS total_unidades,
                (SELECT COALESCE(SUM(i.unidades * i.piezas),0) FROM cotizacion_items i WHERE i.cotizacion_id = c.id) AS total_piezas,
                (SELECT COALESCE(SUM(i.unidades * i.peso_kg),0) FROM cotizacion_items i WHERE i.cotizacion_id = c.id) AS total_peso_kg,
                (SELECT COALESCE(SUM(i.costo_compra * i.unidades),0) FROM cotizacion_items i WHERE i.cotizacion_id = c.id) AS total_compra_jpy,
                (SELECT COALESCE(SUM(i.precio_venta * i.unidades),0) FROM cotizacion_items i WHERE i.cotizacion_id = c.id) AS total_venta_mxn,
                (SELECT COUNT(*) FROM cotizacion_proveedores p WHERE p.cotizacion_id = c.id) AS num_proveedores
             FROM cotizaciones c
             WHERE c.empresa_id = ?
             ORDER BY c.created_at DESC, c.id DESC`,
            [empresa_id]
        );
        const list = rows.map((r) => {
            const rate = Number(r.tipo_cambio) || 0;
            const totalCompraJPY = Number(r.total_compra_jpy);
            const totalCompraMXN = totalCompraJPY * rate;
            const totalVentaMXN = Number(r.total_venta_mxn);
            return {
                id: r.id,
                nombre: r.nombre,
                estado: r.estado,
                tipoCambio: rate,
                numItems: r.num_items,
                totalUnidades: Number(r.total_unidades),
                totalPiezas: Number(r.total_piezas),
                totalPesoKg: Number(r.total_peso_kg),
                numProveedores: r.num_proveedores,
                totalCompraJPY,
                totalCompraMXN,
                totalVentaMXN,
                gananciaPorc: totalCompraMXN > 0 ? Math.round(((totalVentaMXN - totalCompraMXN) / totalCompraMXN) * 1000) / 10 : 0,
            };
        });
        res.json(list);
    } catch (e) {
        console.error('GET /api/cotizaciones error:', e);
        res.status(500).json({ error: 'Error al obtener cotizaciones' });
    }
});

// POST /api/cotizaciones — crea la cotizacion (nombre) con sus items de una.
// Body: { nombre, notas?, items: [ { producto, tipo, link, costoCompra, precioVenta } ] }
router.post('/', async (req, res) => {
    const empresa_id = empresaOrError(req, res);
    if (!empresa_id) return;

    const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim().slice(0, 255) : '';
    if (!nombre) return res.status(400).json({ error: 'Falta el nombre de la cotización' });

    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    if (rawItems.length > 500) return res.status(400).json({ error: 'Demasiados productos (máx. 500)' });

    const parsedItems = [];
    for (let i = 0; i < rawItems.length; i++) {
        const { data, errors } = parseItem(rawItems[i], { partial: false });
        if (errors.length) return res.status(400).json({ error: `Producto ${i + 1}: campos inválidos`, fields: errors, row: i });
        parsedItems.push(data);
    }

    // Tipo de cambio JPY->MXN: del body si viene válido, si no se consulta en vivo.
    let tipoCambio = Number(req.body?.tipoCambio);
    if (isNaN(tipoCambio) || tipoCambio <= 0) tipoCambio = await fetchRate();

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [r] = await conn.query(
            'INSERT INTO cotizaciones (empresa_id, nombre, estado, tipo_cambio, notas) VALUES (?, ?, ?, ?, ?)',
            [empresa_id, nombre, 'confirmada', tipoCambio, req.body?.notas ? String(req.body.notas) : null]
        );
        const cotizId = r.insertId;
        let orden = 0;
        for (const it of parsedItems) {
            await conn.query(
                `INSERT INTO cotizacion_items
                   (cotizacion_id, empresa_id, producto, unidades, piezas, peso_kg, tipo, link, costo_compra, precio_venta, imagen_url, orden)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [cotizId, empresa_id, it.producto, it.unidades ?? 1, it.piezas ?? 1, it.peso_kg ?? 0, it.tipo ?? 'offline', it.link ?? null,
                 it.costo_compra ?? 0, it.precio_venta ?? 0, it.imagen_url ?? null, orden++]
            );
        }
        await conn.commit();
        const detalle = await loadDetalle(empresa_id, cotizId);
        res.status(201).json(detalle);
    } catch (e) {
        await conn.rollback();
        console.error('POST /api/cotizaciones error:', e);
        res.status(500).json({ error: 'Error al crear la cotización' });
    } finally {
        conn.release();
    }
});

// GET /api/cotizaciones/:id — detalle completo.
router.get('/:id', async (req, res) => {
    const empresa_id = empresaOrError(req, res);
    if (!empresa_id) return;
    try {
        const detalle = await loadDetalle(empresa_id, req.params.id);
        if (!detalle) return res.status(404).json({ error: 'Cotización no encontrada' });
        res.json(detalle);
    } catch (e) {
        console.error('GET /api/cotizaciones/:id error:', e);
        res.status(500).json({ error: 'Error al obtener la cotización' });
    }
});

// PATCH /api/cotizaciones/:id — edita cabecera (nombre, notas, estado).
router.patch('/:id', async (req, res) => {
    const empresa_id = empresaOrError(req, res);
    if (!empresa_id) return;
    const { id } = req.params;

    const set = [];
    const vals = [];
    if (req.body.nombre !== undefined) {
        const n = String(req.body.nombre).trim().slice(0, 255);
        if (!n) return res.status(400).json({ error: 'Nombre inválido' });
        set.push('nombre = ?'); vals.push(n);
    }
    if (req.body.notas !== undefined) { set.push('notas = ?'); vals.push(req.body.notas ? String(req.body.notas) : null); }
    if (req.body.tipoCambio !== undefined) {
        const tc = Number(req.body.tipoCambio);
        if (isNaN(tc) || tc <= 0) return res.status(400).json({ error: 'Tipo de cambio inválido' });
        set.push('tipo_cambio = ?'); vals.push(tc);
    }
    if (req.body.estado !== undefined) {
        if (!['borrador', 'confirmada'].includes(req.body.estado)) return res.status(400).json({ error: 'Estado inválido' });
        set.push('estado = ?'); vals.push(req.body.estado);
    }
    if (!set.length) return res.status(400).json({ error: 'Nada que actualizar' });

    try {
        const [r] = await pool.query(
            `UPDATE cotizaciones SET ${set.join(', ')} WHERE id = ? AND empresa_id = ?`,
            [...vals, id, empresa_id]
        );
        if (r.affectedRows === 0) return res.status(404).json({ error: 'Cotización no encontrada' });
        res.json(await loadDetalle(empresa_id, id));
    } catch (e) {
        console.error('PATCH /api/cotizaciones/:id error:', e);
        res.status(500).json({ error: 'Error al actualizar la cotización' });
    }
});

// DELETE /api/cotizaciones/:id — borra cotizacion (items y proveedores en cascada).
router.delete('/:id', async (req, res) => {
    const empresa_id = empresaOrError(req, res);
    if (!empresa_id) return;
    try {
        const [r] = await pool.query('DELETE FROM cotizaciones WHERE id = ? AND empresa_id = ?', [req.params.id, empresa_id]);
        if (r.affectedRows === 0) return res.status(404).json({ error: 'Cotización no encontrada' });
        res.json({ ok: true });
    } catch (e) {
        console.error('DELETE /api/cotizaciones/:id error:', e);
        res.status(500).json({ error: 'Error al eliminar la cotización' });
    }
});

// ── helper: valida que la cotizacion es de la empresa ─────────────────────────
async function ownCotiz(empresa_id, id) {
    const [r] = await pool.query('SELECT id FROM cotizaciones WHERE id = ? AND empresa_id = ?', [id, empresa_id]);
    return r.length > 0;
}

// ═══ Items (productos de la cotizacion) ══════════════════════════════════════

// POST /api/cotizaciones/:id/items — agrega un producto.
router.post('/:id/items', async (req, res) => {
    const empresa_id = empresaOrError(req, res);
    if (!empresa_id) return;
    const { id } = req.params;
    if (!(await ownCotiz(empresa_id, id))) return res.status(404).json({ error: 'Cotización no encontrada' });

    const { data, errors } = parseItem(req.body, { partial: false });
    if (errors.length) return res.status(400).json({ error: 'Campos inválidos', fields: errors });
    try {
        const [[{ maxOrden }]] = await pool.query(
            'SELECT COALESCE(MAX(orden), -1) + 1 AS maxOrden FROM cotizacion_items WHERE cotizacion_id = ?', [id]
        );
        await pool.query(
            `INSERT INTO cotizacion_items (cotizacion_id, empresa_id, producto, unidades, piezas, peso_kg, tipo, link, costo_compra, precio_venta, imagen_url, orden)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, empresa_id, data.producto, data.unidades ?? 1, data.piezas ?? 1, data.peso_kg ?? 0, data.tipo ?? 'offline', data.link ?? null,
             data.costo_compra ?? 0, data.precio_venta ?? 0, data.imagen_url ?? null, maxOrden]
        );
        res.status(201).json(await loadDetalle(empresa_id, id));
    } catch (e) {
        console.error('POST item error:', e);
        res.status(500).json({ error: 'Error al agregar el producto' });
    }
});

// PATCH /api/cotizaciones/:id/items/:itemId — edita un producto.
router.patch('/:id/items/:itemId', async (req, res) => {
    const empresa_id = empresaOrError(req, res);
    if (!empresa_id) return;
    const { id, itemId } = req.params;

    const { data, errors } = parseItem(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ error: 'Campos inválidos', fields: errors });
    const cols = Object.keys(data);
    if (!cols.length) return res.status(400).json({ error: 'Nada que actualizar' });
    try {
        const set = cols.map((c) => `${c} = ?`).join(', ');
        const [r] = await pool.query(
            `UPDATE cotizacion_items SET ${set} WHERE id = ? AND cotizacion_id = ? AND empresa_id = ?`,
            [...cols.map((c) => data[c]), itemId, id, empresa_id]
        );
        if (r.affectedRows === 0) return res.status(404).json({ error: 'Producto no encontrado' });
        res.json(await loadDetalle(empresa_id, id));
    } catch (e) {
        console.error('PATCH item error:', e);
        res.status(500).json({ error: 'Error al actualizar el producto' });
    }
});

// DELETE /api/cotizaciones/:id/items/:itemId
router.delete('/:id/items/:itemId', async (req, res) => {
    const empresa_id = empresaOrError(req, res);
    if (!empresa_id) return;
    const { id, itemId } = req.params;
    try {
        const [r] = await pool.query(
            'DELETE FROM cotizacion_items WHERE id = ? AND cotizacion_id = ? AND empresa_id = ?', [itemId, id, empresa_id]
        );
        if (r.affectedRows === 0) return res.status(404).json({ error: 'Producto no encontrado' });
        res.json(await loadDetalle(empresa_id, id));
    } catch (e) {
        console.error('DELETE item error:', e);
        res.status(500).json({ error: 'Error al eliminar el producto' });
    }
});

// POST /api/cotizaciones/:id/items/:itemId/imagen — sube/reemplaza imagen del producto.
router.post('/:id/items/:itemId/imagen', upload.single('imagen'), async (req, res) => {
    const empresa_id = empresaOrError(req, res);
    if (!empresa_id) return;
    const { id, itemId } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' });
    try {
        const [ex] = await pool.query(
            'SELECT id FROM cotizacion_items WHERE id = ? AND cotizacion_id = ? AND empresa_id = ?', [itemId, id, empresa_id]
        );
        if (ex.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
        const url = await uploadFileToGCS(req.file, 'cotizaciones');
        await pool.query('UPDATE cotizacion_items SET imagen_url = ? WHERE id = ?', [url, itemId]);
        res.json(await loadDetalle(empresa_id, id));
    } catch (e) {
        console.error('POST item imagen error:', e);
        res.status(500).json({ error: 'Error al subir la imagen' });
    }
});

// DELETE /api/cotizaciones/:id/items/:itemId/imagen
router.delete('/:id/items/:itemId/imagen', async (req, res) => {
    const empresa_id = empresaOrError(req, res);
    if (!empresa_id) return;
    const { id, itemId } = req.params;
    try {
        const [r] = await pool.query(
            'UPDATE cotizacion_items SET imagen_url = NULL WHERE id = ? AND cotizacion_id = ? AND empresa_id = ?', [itemId, id, empresa_id]
        );
        if (r.affectedRows === 0) return res.status(404).json({ error: 'Producto no encontrado' });
        res.json(await loadDetalle(empresa_id, id));
    } catch (e) {
        console.error('DELETE item imagen error:', e);
        res.status(500).json({ error: 'Error al quitar la imagen' });
    }
});

// ═══ Folios de descarga ══════════════════════════════════════════════════════

// POST /api/cotizaciones/:id/folio — registra una descarga: asigna folio
// secuencial (por empresa) y guarda la selección de productos (item_ids) 20 días.
// Body: { itemIds: [id, ...] }. Devuelve { folio, createdAt, nombre }.
router.post('/:id/folio', async (req, res) => {
    const empresa_id = empresaOrError(req, res);
    if (!empresa_id) return;
    const { id } = req.params;

    try {
        const [h] = await pool.query('SELECT nombre, tipo_cambio FROM cotizaciones WHERE id = ? AND empresa_id = ?', [id, empresa_id]);
        if (h.length === 0) return res.status(404).json({ error: 'Cotización no encontrada' });
        const rate = Number(h[0].tipo_cambio) || 0;

        await limpiarFoliosVencidos(empresa_id);

        const itemIds = Array.isArray(req.body?.itemIds)
            ? req.body.itemIds.map(Number).filter((n) => Number.isInteger(n))
            : [];

        // ── Folio estructurado: [45|88]-Q[n]-COT[##]-[01|02] ──────────────────
        const [allItems] = await pool.query('SELECT id, costo_compra, unidades FROM cotizacion_items WHERE cotizacion_id = ?', [id]);
        const totalItems = allItems.length;
        const selSet = new Set(itemIds);
        const selected = allItems.filter((i) => selSet.has(i.id));

        // Prefijo por costo de compra (ref.) en MXN de lo seleccionado.
        // Precio unitario x unidades: el prefijo 45/88 depende del costo REAL
        // del pedido, no del costo de una pieza de cada cosa.
        const costoCompraMXN = selected.reduce(
            (s, i) => s + Number(i.costo_compra) * Math.max(1, Number(i.unidades) || 1), 0) * rate;
        const prefijo = costoCompraMXN > 5000 ? '88' : '45';
        // 01 completa (todos los productos) · 02 parcial.
        const tipo = (totalItems > 0 && selected.length === totalItems) ? '01' : '02';

        // Trimestre desde la fecha actual (TZ del proceso = America/Mexico_City).
        const now = new Date();
        const anio = now.getFullYear();
        const trimestre = Math.floor(now.getMonth() / 3) + 1;

        // Núm. de cotización: consecutivo por trimestre; si esta cotización ya
        // tuvo folio este trimestre, reutiliza su número.
        let numCotizacion;
        const [ex] = await pool.query(
            'SELECT num_cotizacion FROM cotizacion_folios WHERE empresa_id = ? AND cotizacion_id = ? AND anio = ? AND trimestre = ? AND num_cotizacion IS NOT NULL ORDER BY id DESC LIMIT 1',
            [empresa_id, id, anio, trimestre]
        );
        if (ex.length) {
            numCotizacion = ex[0].num_cotizacion;
        } else {
            const [[{ cnt }]] = await pool.query(
                'SELECT COUNT(DISTINCT cotizacion_id) AS cnt FROM cotizacion_folios WHERE empresa_id = ? AND anio = ? AND trimestre = ?',
                [empresa_id, anio, trimestre]
            );
            numCotizacion = cnt + 1;
        }

        // Consecutivo de descarga: cada PDF emitido lleva folio propio, aunque
        // sea la misma cotización con la misma selección. Las filas de
        // cotizacion_folios nunca se borran (limpiarFoliosVencidos solo vacía
        // item_ids; el ON DELETE CASCADE se lleva la cotización entera), así que
        // COUNT es exactamente "esta es la descarga N".
        // Se toma también el MAX ya emitido por si alguna vez llegara a faltar
        // una fila: el consecutivo nunca debe retroceder ni repetirse.
        // El MAX solo mira folios que YA traen sufijo: en los viejos
        // (45Q3COT0101, sin guion) SUBSTRING_INDEX devuelve la cadena completa
        // y castearla daría 45, disparando el consecutivo.
        const [[{ nPrevias, maxSeq }]] = await pool.query(
            `SELECT COUNT(*) AS nPrevias,
                    COALESCE(MAX(CASE WHEN folio_str LIKE '%-%'
                                      THEN CAST(SUBSTRING_INDEX(folio_str, '-', -1) AS UNSIGNED)
                                 END), 0) AS maxSeq
               FROM cotizacion_folios
              WHERE empresa_id = ? AND cotizacion_id = ?`,
            [empresa_id, id]
        );
        const descargaSeq = Math.max(Number(nPrevias), Number(maxSeq)) + 1;

        const folioStr = `${prefijo}Q${trimestre}COT${String(numCotizacion).padStart(2, '0')}${tipo}-${String(descargaSeq).padStart(2, '0')}`;

        // Folio numérico interno (compat / orden), no visible.
        const [[{ maxFolio }]] = await pool.query(
            'SELECT COALESCE(MAX(folio), 0) AS maxFolio FROM cotizacion_folios WHERE empresa_id = ?', [empresa_id]
        );

        const [ins] = await pool.query(
            `INSERT INTO cotizacion_folios
               (empresa_id, cotizacion_id, folio, folio_str, anio, trimestre, num_cotizacion, nombre_snapshot, item_ids, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), DATE_ADD(NOW(), INTERVAL 20 DAY))`,
            [empresa_id, id, maxFolio + 1, folioStr, anio, trimestre, numCotizacion, h[0].nombre, JSON.stringify(itemIds)]
        );
        const [row] = await pool.query('SELECT created_at FROM cotizacion_folios WHERE id = ?', [ins.insertId]);
        res.status(201).json({ folio: folioStr, createdAt: row[0].created_at, nombre: h[0].nombre });
    } catch (e) {
        console.error('POST /api/cotizaciones/:id/folio error:', e);
        res.status(500).json({ error: 'Error al registrar el folio' });
    }
});

// GET /api/cotizaciones/:id/folio/:folio — consulta un folio de esta cotización
// y devuelve los productos que cubría (para cargarlos al registrar un proveedor).
router.get('/:id/folio/:folio', async (req, res) => {
    const empresa_id = empresaOrError(req, res);
    if (!empresa_id) return;
    const { id } = req.params;
    const raw = String(req.params.folio || '').trim();
    if (!raw) return res.status(400).json({ error: 'Folio inválido' });
    const asInt = parseInt(raw, 10);

    try {
        await limpiarFoliosVencidos(empresa_id);
        // Acepta el folio estructurado (folio_str) o el número interno viejo.
        let [rows] = await pool.query(
            'SELECT * FROM cotizacion_folios WHERE cotizacion_id = ? AND empresa_id = ? AND (folio_str = ? OR folio = ?) ORDER BY id DESC LIMIT 1',
            [id, empresa_id, raw, Number.isInteger(asInt) ? asInt : -1]
        );
        // Ahora cada descarga agrega "-NN" al folio. Si teclean uno sin sufijo
        // (los de antes, o copiado a medias), se toma la descarga más reciente
        // que empiece con ese folio en vez de mandar un 404 confuso.
        if (rows.length === 0 && !raw.includes('-') && /^[A-Za-z0-9]+$/.test(raw)) {
            [rows] = await pool.query(
                "SELECT * FROM cotizacion_folios WHERE cotizacion_id = ? AND empresa_id = ? AND folio_str LIKE CONCAT(?, '-%') ORDER BY id DESC LIMIT 1",
                [id, empresa_id, raw]
            );
        }
        if (rows.length === 0) return res.status(404).json({ error: 'Ese folio no existe en esta cotización' });
        const f = rows[0];
        let itemIds = null;
        if (f.item_ids) {
            try { itemIds = typeof f.item_ids === 'string' ? JSON.parse(f.item_ids) : f.item_ids; } catch { itemIds = null; }
        }
        if (!Array.isArray(itemIds) || itemIds.length === 0) {
            return res.status(410).json({ error: 'Ese folio ya no tiene productos guardados (venció a los 20 días)' });
        }
        res.json({ folio: f.folio_str || String(f.folio), itemIds, createdAt: f.created_at });
    } catch (e) {
        console.error('GET /api/cotizaciones/:id/folio/:folio error:', e);
        res.status(500).json({ error: 'Error al consultar el folio' });
    }
});

// ═══ Proveedores (con conceptos) ═════════════════════════════════════════════

// PUT /api/cotizaciones/:id/proveedores — reemplaza toda la lista de proveedores
// (con sus conceptos) de una cotizacion. Simplifica la edicion: el front manda
// el estado completo y aquí se rehace en una transacción.
// Body: { proveedores: [ { nombre, precioBase, notas?, conceptos: [ { concepto, monto } ] } ] }
router.put('/:id/proveedores', async (req, res) => {
    const empresa_id = empresaOrError(req, res);
    if (!empresa_id) return;
    const { id } = req.params;
    if (!(await ownCotiz(empresa_id, id))) return res.status(404).json({ error: 'Cotización no encontrada' });

    const { data, error } = parseProveedores(req.body?.proveedores);
    if (error) return res.status(400).json({ error });
    if (data.length > 100) return res.status(400).json({ error: 'Demasiados proveedores (máx. 100)' });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        // Borra todos (conceptos caen por cascada) y reinserta.
        await conn.query('DELETE FROM cotizacion_proveedores WHERE cotizacion_id = ? AND empresa_id = ?', [id, empresa_id]);
        let orden = 0;
        for (const p of data) {
            const [pr] = await conn.query(
                'INSERT INTO cotizacion_proveedores (cotizacion_id, empresa_id, nombre, moneda, precio_base, item_ids, notas, orden) VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?)',
                [id, empresa_id, p.nombre, p.moneda, p.precioBase, JSON.stringify(p.itemIds || []), p.notas, orden++]
            );
            let cOrden = 0;
            for (const c of p.conceptos) {
                await conn.query(
                    'INSERT INTO cotizacion_proveedor_conceptos (proveedor_id, empresa_id, concepto, monto, orden) VALUES (?, ?, ?, ?, ?)',
                    [pr.insertId, empresa_id, c.concepto, c.monto, cOrden++]
                );
            }
        }
        await conn.commit();
        res.json(await loadDetalle(empresa_id, id));
    } catch (e) {
        await conn.rollback();
        console.error('PUT proveedores error:', e);
        res.status(500).json({ error: 'Error al guardar los proveedores' });
    } finally {
        conn.release();
    }
});

export default router;
