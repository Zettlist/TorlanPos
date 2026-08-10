/**
 * Base de datos local para desarrollo.
 *
 * Los proyectos GCP se desactivaron en jun 2026 y los datos de Cloud SQL se
 * perdieron. Este script levanta un MySQL 8 efimero en la maquina, carga
 * db/schema.sql y siembra lo minimo para entrar y navegar el POS: una empresa,
 * un usuario y catalogo de prueba.
 *
 *   node backend/scripts/dev-db.mjs
 *
 * Deja el servidor corriendo hasta Ctrl+C. Los datos NO persisten entre
 * ejecuciones -- es un entorno de prueba, no un respaldo.
 */
import { createDB } from 'mysql-memory-server';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND = resolve(__dirname, '..');

// El esquema vive en el repo de la tienda: es la base compartida.
const SCHEMA_CANDIDATES = [
    resolve(BACKEND, '../../Bisonte shop/Bisonteshop/db/schema.sql'),
    resolve(BACKEND, '../db/schema.sql'),
];
const schemaPath = SCHEMA_CANDIDATES.find(existsSync);
if (!schemaPath) {
    console.error('No encuentro db/schema.sql. Rutas probadas:');
    SCHEMA_CANDIDATES.forEach(p => console.error('  ' + p));
    process.exit(1);
}

const USUARIO = 'admin';
const CLAVE = 'torlan2026';

console.log('Arrancando MySQL 8 local (la primera vez descarga binarios)…');
const db = await createDB({ version: '8.0.x', dbName: 'torlan_pos' });

const conn = await mysql.createConnection({
    host: '127.0.0.1', port: db.port, user: db.username,
    database: db.dbName, multipleStatements: true,
});

console.log(`Cargando esquema desde ${schemaPath.replace(/\\/g, '/')}…`);
await conn.query(readFileSync(schemaPath, 'utf8'));

// ── Semilla ──────────────────────────────────────────────────────────────────
const [emp] = await conn.query(
    `INSERT INTO empresas (nombre_empresa, plan_contratado, estado) VALUES (?,?,?)`,
    ['Bisonte Manga', 'Premium', 'Activo']);
const empresaId = emp.insertId;

const hash = await bcrypt.hash(CLAVE, 10);
await conn.query(
    `INSERT INTO users (username, employee_number, password_hash, empresa_id, role, is_admin,
                        first_login, has_setup_complete, onboarding_completed)
     VALUES (?,?,?,?,?,1,0,1,1)`,
    [USUARIO, '10001', hash, empresaId, 'empresa_admin']);

// Todas las funciones encendidas para que se vean los modulos del menu.
await conn.query(`
    INSERT INTO user_features (user_id, feature_id, is_enabled)
    SELECT u.id, f.id, 1 FROM users u CROSS JOIN features f WHERE u.username = ?`, [USUARIO]);

const [prov] = await conn.query(
    `INSERT INTO suppliers (empresa_id, name, contact_info) VALUES (?,?,?)`,
    [empresaId, 'Panini Manga', 'ventas@panini.example']);

const CATALOGO = [
    ['Berserk, Vol. 1',        '9788498147087', 110, 189, 12, 'Seinen'],
    ['Chainsaw Man, Vol. 4',   '9788411013246', 100, 175,  8, 'Shonen'],
    ['Vagabond, Vol. 12',      '9788416700455', 130, 220,  3, 'Seinen'],
    ['Jujutsu Kaisen, Vol. 2', '9788418610257',  95, 165, 20, 'Shonen'],
    ['Monster, Vol. 1',        '9788418862632', 140, 245,  0, 'Seinen'],
];
for (const [name, isbn, cost, sale, stock, cat] of CATALOGO) {
    await conn.query(
        `INSERT INTO products (empresa_id, name, isbn, barcode, cost_price, sale_price,
                               stock, category, supplier_id, supplier_price, publisher)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [empresaId, name, isbn, isbn, cost, sale, stock, cat, prov.insertId, cost, 'Panini']);
}

// ── Apunta el backend a esta base ────────────────────────────────────────────
const envPath = join(BACKEND, '.env');
if (existsSync(envPath)) {
    const original = readFileSync(envPath, 'utf8');
    const actualizado = original
        .replace(/^DB_HOST=.*$/m, 'DB_HOST=127.0.0.1')
        .replace(/^DB_PORT=.*$/m, `DB_PORT=${db.port}`)
        .replace(/^DB_USER=.*$/m, `DB_USER=${db.username}`)
        .replace(/^DB_PASSWORD=.*$/m, 'DB_PASSWORD=')
        .replace(/^DB_NAME=.*$/m, 'DB_NAME=torlan_pos');
    writeFileSync(envPath, actualizado);
    console.log('backend/.env actualizado con los datos de esta base.');
}

console.log(`
────────────────────────────────────────────────
  MySQL local listo en 127.0.0.1:${db.port}
  Base: torlan_pos · ${CATALOGO.length} productos sembrados

  Entrar al POS:
    Usuario:    ${USUARIO}   (o el numero 10001)
    Contraseña: ${CLAVE}

  Deja esta ventana abierta. Ctrl+C para detener.
────────────────────────────────────────────────
`);

const cerrar = async () => {
    console.log('\nDeteniendo MySQL…');
    try { await conn.end(); } catch { }
    try { await db.stop(); } catch { }
    process.exit(0);
};
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
setInterval(() => { }, 1 << 30);
