// Esquema de Cotizaciones (v2). Una cotizacion es una lista con nombre; contiene
// items (productos) y proveedores (cada uno con sus conceptos/segmentaciones).
//
//   cotizaciones                    -> cabecera (nombre, estado)
//   cotizacion_items                -> productos: tipo offline/online, link, CC, PV, imagen
//   cotizacion_proveedores          -> proveedores de la cotizacion (precio base)
//   cotizacion_proveedor_conceptos  -> desglose por proveedor (Envio, extra, etc.)
//
// La tabla vieja "plana" (producto+proveedor por fila) se renombra a
// cotizaciones_legacy_flat para no perder nada. Correr con el proxy en 3306.
//   node migrations/migrate_cotizaciones.js
import 'dotenv/config';
import pool from '../database/db.js';

async function tableExists(name) {
    const [r] = await pool.query('SHOW TABLES LIKE ?', [name]);
    return r.length > 0;
}
async function columnExists(table, col) {
    const [r] = await pool.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [col]);
    return r.length > 0;
}

const NEW_TABLES = [
    `CREATE TABLE IF NOT EXISTS cotizaciones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        empresa_id INT NOT NULL,
        nombre VARCHAR(255) NOT NULL,
        estado ENUM('borrador','confirmada') NOT NULL DEFAULT 'confirmada',
        notas TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_cotiz_empresa (empresa_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS cotizacion_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cotizacion_id INT NOT NULL,
        empresa_id INT NOT NULL,
        producto VARCHAR(255) NOT NULL,
        unidades INT NOT NULL DEFAULT 1,
        piezas INT NOT NULL DEFAULT 1,
        peso_kg DECIMAL(10,3) NOT NULL DEFAULT 0,
        tipo ENUM('offline','online') NOT NULL DEFAULT 'offline',
        link VARCHAR(1024) NULL,
        costo_compra DECIMAL(12,2) NOT NULL DEFAULT 0,
        precio_venta DECIMAL(12,2) NOT NULL DEFAULT 0,
        imagen_url VARCHAR(1024) NULL,
        orden INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_item_cotiz (cotizacion_id),
        INDEX idx_item_empresa (empresa_id),
        CONSTRAINT fk_item_cotiz FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS cotizacion_proveedores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cotizacion_id INT NOT NULL,
        empresa_id INT NOT NULL,
        nombre VARCHAR(255) NOT NULL,
        precio_base DECIMAL(12,2) NOT NULL DEFAULT 0,
        notas TEXT NULL,
        orden INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_prov_cotiz (cotizacion_id),
        INDEX idx_prov_empresa (empresa_id),
        CONSTRAINT fk_prov_cotiz FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS cotizacion_proveedor_conceptos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        proveedor_id INT NOT NULL,
        empresa_id INT NOT NULL,
        concepto VARCHAR(255) NOT NULL,
        monto DECIMAL(12,2) NOT NULL DEFAULT 0,
        orden INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_concepto_prov (proveedor_id),
        INDEX idx_concepto_empresa (empresa_id),
        CONSTRAINT fk_concepto_prov FOREIGN KEY (proveedor_id) REFERENCES cotizacion_proveedores(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

try {
    // Si existe la tabla vieja plana (tiene columna 'producto'), renombrarla.
    if (await tableExists('cotizaciones') && await columnExists('cotizaciones', 'producto')) {
        if (!(await tableExists('cotizaciones_legacy_flat'))) {
            await pool.query('RENAME TABLE cotizaciones TO cotizaciones_legacy_flat');
            console.log('📦 Tabla vieja renombrada -> cotizaciones_legacy_flat');
        } else {
            await pool.query('DROP TABLE cotizaciones');
            console.log('🗑️  Tabla vieja eliminada (ya había backup legacy)');
        }
    }

    for (const sql of NEW_TABLES) {
        await pool.query(sql);
    }

    // ── v3: multi-divisa ──────────────────────────────────────────────────────
    // Compra en JPY (¥), venta en MXN ($). tipo_cambio = MXN por 1 JPY.
    // Proveedores pueden cotizar en JPY o MXN (columna moneda).
    async function colExists(table, col) {
        const [r] = await pool.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [col]);
        return r.length > 0;
    }

    // Tasa actual JPY->MXN para backfill (fallback si la API falla).
    let rate = 0.13;
    try {
        const resp = await fetch('https://open.er-api.com/v6/latest/JPY');
        const d = await resp.json();
        if (d?.rates?.MXN) rate = Math.round(d.rates.MXN * 10000) / 10000;
        console.log('💱 Tasa JPY->MXN:', rate);
    } catch { console.log('💱 API de tasa falló, uso fallback', rate); }

    if (!(await colExists('cotizaciones', 'tipo_cambio'))) {
        await pool.query('ALTER TABLE cotizaciones ADD COLUMN tipo_cambio DECIMAL(10,4) NOT NULL DEFAULT 0 AFTER estado');
        await pool.query('UPDATE cotizaciones SET tipo_cambio = ? WHERE tipo_cambio = 0', [rate]);
        console.log('➕ cotizaciones.tipo_cambio agregado y backfilleado');
    }
    if (!(await colExists('cotizacion_proveedores', 'moneda'))) {
        await pool.query("ALTER TABLE cotizacion_proveedores ADD COLUMN moneda ENUM('JPY','MXN') NOT NULL DEFAULT 'JPY' AFTER nombre");
        console.log('➕ cotizacion_proveedores.moneda agregado');
    }

    // ── v5: productos que cubre cada propuesta de proveedor ────────────────────
    if (!(await colExists('cotizacion_proveedores', 'item_ids'))) {
        await pool.query('ALTER TABLE cotizacion_proveedores ADD COLUMN item_ids JSON NULL AFTER precio_base');
        console.log('➕ cotizacion_proveedores.item_ids agregado');
    }

    // ── v6: el "precio base" desaparece; el total = suma de conceptos. Se
    //    convierte el base existente en un concepto "Precio base" y se pone en 0.
    const [basedProvs] = await pool.query('SELECT id, empresa_id, precio_base FROM cotizacion_proveedores WHERE precio_base > 0');
    for (const p of basedProvs) {
        await pool.query(
            'INSERT INTO cotizacion_proveedor_conceptos (proveedor_id, empresa_id, concepto, monto, orden) VALUES (?, ?, ?, ?, ?)',
            [p.id, p.empresa_id, 'Precio base', p.precio_base, -1]
        );
        await pool.query('UPDATE cotizacion_proveedores SET precio_base = 0 WHERE id = ?', [p.id]);
    }
    if (basedProvs.length) console.log(`➕ ${basedProvs.length} precios base convertidos a concepto`);

    // ── v4: folios de descarga (con selección de productos, expira a 20 días) ───
    await pool.query(`
        CREATE TABLE IF NOT EXISTS cotizacion_folios (
            id INT AUTO_INCREMENT PRIMARY KEY,
            empresa_id INT NOT NULL,
            cotizacion_id INT NOT NULL,
            folio INT NOT NULL,
            nombre_snapshot VARCHAR(255) NULL,
            item_ids JSON NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL,
            INDEX idx_folio_empresa (empresa_id),
            INDEX idx_folio_cotiz (cotizacion_id),
            INDEX idx_folio_expires (expires_at),
            CONSTRAINT fk_folio_cotiz FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── v7: folio estructurado ([45|88]-Q[n]-COT[##]-[01|02]) ──────────────────
    for (const [col, ddl] of [
        ['anio', 'ADD COLUMN anio INT NULL'],
        ['trimestre', 'ADD COLUMN trimestre INT NULL'],
        ['num_cotizacion', 'ADD COLUMN num_cotizacion INT NULL'],
        ['folio_str', 'ADD COLUMN folio_str VARCHAR(40) NULL'],
    ]) {
        if (!(await colExists('cotizacion_folios', col))) {
            await pool.query(`ALTER TABLE cotizacion_folios ${ddl}`);
            console.log(`➕ cotizacion_folios.${col} agregado`);
        }
    }

    // ── v8: unidades por producto ─────────────────────────────────────────────
    // costo_compra y precio_venta son precios UNITARIOS; los totales se calculan
    // multiplicando por unidades. DEFAULT 1 deja los renglones existentes con
    // exactamente los mismos totales que antes.
    if (!(await colExists('cotizacion_items', 'unidades'))) {
        await pool.query('ALTER TABLE cotizacion_items ADD COLUMN unidades INT NOT NULL DEFAULT 1 AFTER producto');
        console.log('➕ cotizacion_items.unidades agregado');
    }

    // ── v9: piezas por paquete + peso aproximado ──────────────────────────────
    // unidades = cuantas veces se compra el renglon.
    // piezas   = cuantos articulos trae CADA renglon (paquetes, lotes, sets).
    //            No toca el dinero: el precio ya es el del paquete completo.
    //            Articulos recibidos = unidades * piezas.
    // El peso vive en peso_kg (ver v10 abajo): peso aproximado de UNA unidad.
    // El del pedido sale de multiplicar por unidades. 0 = sin capturar.
    if (!(await colExists('cotizacion_items', 'piezas'))) {
        await pool.query('ALTER TABLE cotizacion_items ADD COLUMN piezas INT NOT NULL DEFAULT 1 AFTER unidades');
        console.log('➕ cotizacion_items.piezas agregado');
    }

    // ── v10: el peso se maneja en KILOS ───────────────────────────────────────
    // Nacio como peso_g (gramos). Se cambia a kg porque es la unidad con la que
    // se cotiza el envio. DECIMAL(10,3) conserva la precision al gramo.
    // Si existe la columna vieja se CONVIERTE (÷1000) antes de tirarla: aqui no
    // hay pesos capturados, pero la migracion tiene que ser correcta en
    // cualquier ambiente donde si los haya.
    if (!(await colExists('cotizacion_items', 'peso_kg'))) {
        await pool.query('ALTER TABLE cotizacion_items ADD COLUMN peso_kg DECIMAL(10,3) NOT NULL DEFAULT 0 AFTER piezas');
        console.log('➕ cotizacion_items.peso_kg agregado');
        if (await colExists('cotizacion_items', 'peso_g')) {
            const [r] = await pool.query('UPDATE cotizacion_items SET peso_kg = peso_g / 1000 WHERE peso_g <> 0');
            console.log(`🔄 ${r.affectedRows} peso(s) convertidos de gramos a kilos`);
        }
    }
    if (await colExists('cotizacion_items', 'peso_g')) {
        await pool.query('ALTER TABLE cotizacion_items DROP COLUMN peso_g');
        console.log('🗑️  cotizacion_items.peso_g eliminado (reemplazado por peso_kg)');
    }

    console.log('✅ Esquema de cotizaciones v10 listo (peso en kilos)');
    process.exit(0);
} catch (e) {
    console.error('❌ Error en migración de cotizaciones:', e.message);
    process.exit(1);
}
