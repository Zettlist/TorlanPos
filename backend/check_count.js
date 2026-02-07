import pool from './database/db.js';

async function checkCount() {
    try {
        const [rows] = await pool.query(`
            SELECT empresa_id, COUNT(*) as count 
            FROM products 
            GROUP BY empresa_id
        `);
        console.log('Product counts per company:');
        console.log(JSON.stringify(rows, null, 2));
    } catch (error) {
        console.error(error);
    } finally {
        await pool.end();
    }
}

checkCount();
