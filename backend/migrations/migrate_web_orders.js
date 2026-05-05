import pool from '../database/db.js';

export async function migrateWebOrders(connection) {
    const conn = connection || await pool.getConnection();
    const release = !connection;

    try {
        const addCol = async (col, def) => {
            const [rows] = await conn.query(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales' AND COLUMN_NAME = ?`,
                [col]
            );
            if (rows.length === 0) {
                await conn.query(`ALTER TABLE sales ADD COLUMN ${col} ${def}`);
                return `added ${col}`;
            }
            return `${col} exists`;
        };

        await Promise.all([
            addCol('shipping_status',  "ENUM('en_espera','despachado') NULL DEFAULT NULL"),
            addCol('tracking_number',  "VARCHAR(100) NULL DEFAULT NULL"),
            addCol('claim_status',     "ENUM('disputa','resolucion') NULL DEFAULT NULL"),
            addCol('claim_notes',      "TEXT NULL DEFAULT NULL"),
            addCol('shipped_at',       "DATETIME NULL DEFAULT NULL"),
            addCol('delivered_at',     "DATETIME NULL DEFAULT NULL"),
            addCol('stock_deducted',   "TINYINT(1) NOT NULL DEFAULT 0"),
        ]);

        console.log('✅ Web orders schema up to date.');
    } catch (err) {
        console.error('❌ migrate_web_orders error:', err.message);
    } finally {
        if (release) conn.release();
    }
}
