/**
 * Prepara una base MySQL remota (Aiven) para el POS y la tienda.
 *
 * Carga db/schema.sql, opcionalmente db/grants.sql, y siembra lo minimo para
 * poder entrar: la empresa, un administrador de empresa y el administrador
 * global. El catalogo NO se siembra — se captura desde el POS.
 *
 *   node backend/scripts/setup-aiven.mjs --check     # solo conecta y reporta
 *   node backend/scripts/setup-aiven.mjs             # carga esquema y semilla
 *   node backend/scripts/setup-aiven.mjs --grants    # ademas carga grants.sql
 *
 * Lee la conexion de backend/.env.aiven (o de --env <ruta>):
 *
 *   DB_HOST=mysql-xxxx.aivencloud.com
 *   DB_PORT=12345
 *   DB_USER=avnadmin
 *   DB_PASSWORD=...
 *   DB_NAME=torlan_pos
 *   DB_SSL_CA=./certs/aiven-ca.pem
 *
 * ─── Seguridad ──────────────────────────────────────────────────────────────
 *
 * Este script escribe en una base que va a tener datos de clientes reales. Por
 * eso:
 *
 *   · Exige TLS verificado contra la CA de Aiven. Sin DB_SSL_CA se planta: una
 *     conexion sin cifrar manda la contrasena del admin en claro por internet.
 *   · No borra nada. `schema.sql` es idempotente (CREATE TABLE IF NOT EXISTS)
 *     y la semilla usa INSERT IGNORE, asi que correrlo dos veces no destruye
 *     lo que ya haya. No hay DROP en ninguna parte.
 *   · Si la base ya tiene productos, se detiene y avisa en vez de sembrar
 *     encima.
 *   · Las contrasenas de la semilla se piden por variable de entorno; no hay
 *     ninguna escrita aqui.
 */
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND = resolve(__dirname, '..');

const args = process.argv.slice(2);
const tiene = (f) => args.includes(f);
const valor = (f, pordefecto) => {
    const i = args.indexOf(f);
    return i >= 0 && args[i + 1] ? args[i + 1] : pordefecto;
};

const SOLO_VERIFICAR = tiene('--check');
const CON_GRANTS = tiene('--grants');
const ENV_PATH = resolve(BACKEND, valor('--env', '.env.aiven'));

// ── Configuracion ───────────────────────────────────────────────────────────
if (!existsSync(ENV_PATH)) {
    console.error(`No encuentro ${ENV_PATH}`);
    console.error('Crealo con DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME y DB_SSL_CA.');
    process.exit(1);
}
dotenv.config({ path: ENV_PATH });

const falta = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']
    .filter(k => !process.env[k]);
if (falta.length) {
    console.error(`Faltan variables en ${ENV_PATH}: ${falta.join(', ')}`);
    process.exit(1);
}

const rutaCA = process.env.DB_SSL_CA
    ? resolve(BACKEND, process.env.DB_SSL_CA)
    : null;
if (!rutaCA || !existsSync(rutaCA)) {
    console.error('Falta el certificado de la CA (DB_SSL_CA).');
    console.error('Descargalo del panel de Aiven — sin el, la conexion viaja sin verificar.');
    process.exit(1);
}

// El esquema vive en el repo de la tienda: es la base compartida.
const CANDIDATOS = [
    resolve(BACKEND, '../../Bisonte shop/Bisonteshop/db'),
    resolve(BACKEND, '../db'),
];
const DB_DIR = CANDIDATOS.find(p => existsSync(resolve(p, 'schema.sql')));
if (!DB_DIR) {
    console.error('No encuentro db/schema.sql. Rutas probadas:');
    CANDIDATOS.forEach(p => console.error('  ' + p));
    process.exit(1);
}

// ── Conexion ────────────────────────────────────────────────────────────────
console.log(`Conectando a ${process.env.DB_HOST}:${process.env.DB_PORT} (TLS verificado)…`);
const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
    ssl: { ca: readFileSync(rutaCA, 'utf8'), rejectUnauthorized: true },
});

const [[version]] = await conn.query('SELECT VERSION() AS v');
console.log(`Conectado. MySQL ${version.v}`);

const [tablas] = await conn.query('SHOW TABLES');
console.log(`Tablas actuales: ${tablas.length}`);

if (SOLO_VERIFICAR) {
    if (tablas.length) {
        const [[p]] = await conn.query('SELECT COUNT(*) AS n FROM products').catch(() => [[{ n: '?' }]]);
        console.log(`Productos: ${p.n}`);
    }
    await conn.end();
    process.exit(0);
}

// ── Esquema ─────────────────────────────────────────────────────────────────
console.log('Cargando schema.sql…');
await conn.query(readFileSync(resolve(DB_DIR, 'schema.sql'), 'utf8'));

const [despues] = await conn.query('SHOW TABLES');
console.log(`Tablas tras cargar el esquema: ${despues.length}`);

// ── Permisos ────────────────────────────────────────────────────────────────
if (CON_GRANTS) {
    const grants = readFileSync(resolve(DB_DIR, 'grants.sql'), 'utf8');
    // El archivo trae marcadores en vez de contrasenas justo para que nadie
    // ejecute el que esta en el repositorio.
    if (/CAMBIAR_ANTES_DE_EJECUTAR/.test(grants)) {
        console.error('\ngrants.sql todavia tiene CAMBIAR_ANTES_DE_EJECUTAR.');
        console.error('Pon contrasenas reales (y guardalas en Bitwarden) antes de --grants.');
        await conn.end();
        process.exit(1);
    }
    console.log('Cargando grants.sql…');
    await conn.query(grants);
}

// ── Semilla minima ──────────────────────────────────────────────────────────
//
// Solo lo que hace falta para entrar. El catalogo se captura desde el POS.
const [[cuenta]] = await conn.query('SELECT COUNT(*) AS n FROM products');
if (Number(cuenta.n) > 0) {
    console.log(`\nLa base ya tiene ${cuenta.n} productos. No se siembra nada mas.`);
    await conn.end();
    process.exit(0);
}

const CLAVE_ADMIN = process.env.SEED_ADMIN_PASSWORD;
const CLAVE_GLOBAL = process.env.SEED_GLOBAL_PASSWORD;
if (!CLAVE_ADMIN || !CLAVE_GLOBAL) {
    console.log('\nEsquema cargado. No se sembraron usuarios.');
    console.log('Para sembrarlos, define en el .env:');
    console.log('  SEED_ADMIN_PASSWORD=<clave del admin de empresa>');
    console.log('  SEED_GLOBAL_PASSWORD=<clave del admin global>');
    console.log('Y guardalas en Bitwarden en cuanto existan.');
    await conn.end();
    process.exit(0);
}

const EMPRESA = process.env.SEED_EMPRESA || 'Bisonte Manga';

await conn.query(
    `INSERT IGNORE INTO empresas (nombre_empresa, plan_contratado, estado)
     VALUES (?, 'Premium', 'Activo')`, [EMPRESA]);
const [[emp]] = await conn.query(
    'SELECT id FROM empresas WHERE nombre_empresa = ?', [EMPRESA]);

await conn.query(
    `INSERT IGNORE INTO users (username, employee_number, password_hash, empresa_id, role,
                               is_admin, first_login, has_setup_complete, onboarding_completed)
     VALUES (?,?,?,?,?,1,0,1,1)`,
    ['admin', '10001', await bcrypt.hash(CLAVE_ADMIN, 10), emp.id, 'empresa_admin']);

// empresa_id NULL: el admin global no cuelga de ninguna empresa.
await conn.query(
    `INSERT IGNORE INTO users (username, employee_number, password_hash, empresa_id, role,
                               is_admin, first_login, has_setup_complete, onboarding_completed)
     VALUES (?,?,?,NULL,?,1,0,1,1)`,
    ['TorlanAdmin', '90001', await bcrypt.hash(CLAVE_GLOBAL, 10), 'global_admin']);

// Todas las funciones encendidas para el admin de empresa.
await conn.query(`
    INSERT IGNORE INTO user_features (user_id, feature_id, is_enabled)
    SELECT u.id, f.id, 1 FROM users u CROSS JOIN features f WHERE u.username = 'admin'`);

console.log(`\nListo. Empresa "${EMPRESA}" (id ${emp.id}), usuarios admin y TorlanAdmin creados.`);
console.log('El catalogo esta vacio: se captura desde el POS.');
console.log('\nGuarda las dos contrasenas en Bitwarden y borra SEED_* del .env.');

await conn.end();
