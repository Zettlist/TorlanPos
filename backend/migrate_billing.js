import pool from './database/db.js';

async function migrate() {
    try {
        console.log('🔍 Checking/Adding billing_cycle_date column...');
        // Try to add the column. If it exists, it will throw a specific error we can ignore/log.
        await pool.query(`
            ALTER TABLE empresas
            ADD COLUMN billing_cycle_date VARCHAR(50) NULL;
        `);
        console.log('✅ Column added successfully.');
    } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
            console.log('ℹ️ Column already exists. No action needed.');
        } else {
            console.error('❌ Migration error:', error);
        }
    } finally {
        pool.end();
    }
}

migrate();
