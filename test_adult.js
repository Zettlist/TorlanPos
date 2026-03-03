import pool from './backend/database/db.js';

async function test() {
    const [rows] = await pool.query('SELECT name, category, is_adult FROM products LIMIT 5');
    console.log(rows);
    process.exit(0);
}
test();
