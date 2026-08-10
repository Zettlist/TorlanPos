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

// El admin global no pertenece a ninguna empresa: administra todas. Es el que
// abre TorlanAdmin (alta de empresas, features, planes). Sin el, esas pantallas
// devuelven 403 y no hay forma de verlas en local.
const ADMIN_GLOBAL = 'TorlanAdmin';
const CLAVE_GLOBAL = 'torlan-global-2026';

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

// empresa_id NULL a proposito: el admin global no cuelga de ninguna empresa,
// y `validateEmpresaActive` se salta la comprobacion justo por ese rol.
await conn.query(
    `INSERT INTO users (username, employee_number, password_hash, empresa_id, role, is_admin,
                        first_login, has_setup_complete, onboarding_completed)
     VALUES (?,?,?,NULL,?,1,0,1,1)`,
    [ADMIN_GLOBAL, '90001', await bcrypt.hash(CLAVE_GLOBAL, 10), 'global_admin']);

// Todas las funciones encendidas para que se vean los modulos del menu.
await conn.query(`
    INSERT INTO user_features (user_id, feature_id, is_enabled)
    SELECT u.id, f.id, 1 FROM users u CROSS JOIN features f WHERE u.username = ?`, [USUARIO]);

const [prov] = await conn.query(
    `INSERT INTO suppliers (empresa_id, name, contact_info) VALUES (?,?,?)`,
    [empresaId, 'Panini Manga', 'ventas@panini.example']);

// Formatos de envio. Las medidas son de ejemplo: en produccion se toman una
// vez por edicion. Sirven para que el selector del alta no salga vacio.
const FORMATOS = [
    ['Tankobon Panini', 18.0, 12.8, 1.5, 190],
    ['Kanzenban',       21.0, 14.8, 3.2, 480],
    ['Figura 1/7',      28.0, 20.0, 20.0, 900],
];
const formatoId = {};
for (const [nombre, l, w, h, g] of FORMATOS) {
    const [r] = await conn.query(
        `INSERT INTO product_formats (empresa_id, name, length_cm, width_cm, height_cm, weight_g)
         VALUES (?,?,?,?,?,?)`, [empresaId, nombre, l, w, h, g]);
    formatoId[nombre] = r.insertId;
}

// Las categorias cuelgan de una rama: is_adult forma parte de su identidad y la
// base exige que coincida con la del producto (FIX 20).
const CATEGORIAS = [['Seinen', 0], ['Shonen', 0], ['Shojo', 0], ['Doujinshi', 1]];
const categoriaId = {};
for (const [nombre, adulto] of CATEGORIAS) {
    const [r] = await conn.query(
        `INSERT INTO categories (name, is_adult) VALUES (?,?)`, [nombre, adulto]);
    categoriaId[nombre] = r.insertId;
}

// Series repetidas a proposito: «continuar serie» necesita al menos una serie
// con varios tomos para que se note lo que hereda.
const CATALOGO = [
    ['Berserk',        1, '9781506711980', 110, 189, 12, 'Seinen'],
    ['Berserk',        2, '9781506712000', 110, 189,  7, 'Seinen'],
    ['Berserk',        3, '9781506712017', 110, 189,  4, 'Seinen'],
    ['Chainsaw Man',   4, '9788411013246', 100, 175,  8, 'Shonen'],
    ['Vagabond',      12, '9788416700455', 130, 220,  3, 'Seinen'],
    ['Jujutsu Kaisen', 2, '9788418610257',  95, 165, 20, 'Shonen'],
    ['Monster',        1, '9788418862632', 140, 245,  0, 'Seinen'],
];
for (const [serie, tomo, isbn, cost, sale, stock, cat] of CATALOGO) {
    await conn.query(
        `INSERT INTO products (empresa_id, name, series, volume, isbn, barcode,
                               cost_price, sale_price, stock, category, category_id, is_adult,
                               format_id, supplier_id, supplier_price, publisher, language)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?)`,
        [empresaId, `${serie}, Vol. ${tomo}`, serie, tomo, isbn, isbn, cost, sale, stock,
            cat, categoriaId[cat], formatoId['Tankobon Panini'], prov.insertId, cost,
            'Panini', 'es']);
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
    // Sin credenciales de GCS ninguna alta de producto pasa, porque la imagen
    // es obligatoria. En local se guardan en backend/uploads.
    writeFileSync(envPath,
        /^LOCAL_UPLOADS=/m.test(actualizado)
            ? actualizado.replace(/^LOCAL_UPLOADS=.*$/m, 'LOCAL_UPLOADS=1')
            : `${actualizado.trimEnd()}\nLOCAL_UPLOADS=1\n`);
    console.log('backend/.env actualizado con los datos de esta base.');
}

console.log(`
────────────────────────────────────────────────
  MySQL local listo en 127.0.0.1:${db.port}
  Base: torlan_pos · ${CATALOGO.length} productos sembrados

  Entrar al POS (administrador de empresa):
    Usuario:    ${USUARIO}   (o el numero 10001)
    Contraseña: ${CLAVE}

  Administrador global (empresas, planes, features):
    Usuario:    ${ADMIN_GLOBAL}   (o el numero 90001)
    Contraseña: ${CLAVE_GLOBAL}

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
