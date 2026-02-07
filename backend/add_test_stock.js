
import pool from './database/db.js';

async function addTestStock() {
    try {
        console.log('🔄 Updating stock for all products...');
        const [result] = await pool.query('UPDATE products SET stock = 50 WHERE stock < 10');
        console.log(`✅ Stock updated! ${result.changedRows} products now have 50 units.`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Error updating stock:', error);
        process.exit(1);
    }
}

addTestStock();
