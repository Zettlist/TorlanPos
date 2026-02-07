
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function inspectPrices() {
    const pool = mysql.createPool({
        host: '127.0.0.1',
        port: 3308,
        user: 'torlan_user',
        password: 'rUJJkcUfzloxoxzQVPH3MKK1',
        database: 'torlan_pos',
    });

    try {
        const [rows] = await pool.query('SELECT id, name, cost_price, sale_price, supplier_id, supplier_price FROM products WHERE cost_price = 0 OR cost_price IS NULL LIMIT 20');
        const [countResult] = await pool.query('SELECT COUNT(*) as count FROM products WHERE cost_price = 0 OR cost_price IS NULL');
        
        console.log(`Total products with 0 cost price: ${countResult[0].count}`);
        console.log('Sample missing costs:');
        console.table(rows);
    } catch (error) {
        console.error('Inspection error:', error);
    } finally {
        await pool.end();
    }
}

inspectPrices();
