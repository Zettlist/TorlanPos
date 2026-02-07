import pool from './database/db.js';

async function finish() {
    try {
        console.log('🎯 Setting monthly goal manually...');
        await pool.execute(
            `INSERT INTO sales_goals (empresa_id, user_id, type, target, current, period_start)
             VALUES (99, 3, 'monthly', 45000.00, 0, '2026-01-01')`
        );
        console.log('✅ Monthly goal set');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

finish();
