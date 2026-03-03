// run_indexes_migration.js
// Run: node run_indexes_migration.js
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root_password_123',
    database: process.env.DB_NAME || 'torlan_pos',
    port: parseInt(process.env.DB_PORT) || 3306,
    multipleStatements: true
};

if (config.host.startsWith('/cloudsql/')) {
    config.socketPath = config.host;
    delete config.host;
    delete config.port;
}

const statements = [
    "ALTER TABLE sales ADD INDEX IF NOT EXISTS idx_empresa_created (empresa_id, created_at)",
    "ALTER TABLE cash_sessions ADD INDEX IF NOT EXISTS idx_empresa_user_status (empresa_id, user_id, status)",
    "ALTER TABLE products ADD INDEX IF NOT EXISTS idx_empresa_name (empresa_id, name)",
    "ALTER TABLE products ADD INDEX IF NOT EXISTS idx_empresa_sbin (empresa_id, sbin_code)",
    "ALTER TABLE sale_items ADD INDEX IF NOT EXISTS idx_sale_product (sale_id, product_id)"
];

console.log('🚀 Running performance index migration...\n');

let conn;
try {
    conn = await mysql.createConnection(config);
    console.log('✅ Connected to MySQL\n');

    for (const sql of statements) {
        const shortName = sql.match(/idx_\w+/)?.[0] || sql.slice(0, 50);
        try {
            await conn.execute(sql);
            console.log(`  ✅ ${shortName}`);
        } catch (err) {
            if (err.code === 'ER_DUP_KEYNAME') {
                console.log(`  ⚠️  ${shortName} (already exists, skipped)`);
            } else {
                throw err;
            }
        }
    }

    console.log('\n✅ Migration complete! All indexes applied.');
} catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    process.exit(1);
} finally {
    if (conn) await conn.end();
}
