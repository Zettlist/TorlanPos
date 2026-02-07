process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3308';
process.env.DB_USER = 'torlan_user';
process.env.DB_PASSWORD = 'rUJJkcUfzloxoxzQVPH3MKK1';

import pool from './database/db.js';

async function getData() {
    try {
        const [users] = await pool.query('SELECT id, username FROM users WHERE empresa_id = 118 LIMIT 1');
        const [products] = await pool.query('SELECT id, price FROM products WHERE empresa_id = 118 LIMIT 10');

        console.log('User:', JSON.stringify(users[0]));
        console.log('Products:', JSON.stringify(products));
    } catch (error) {
        console.error(error);
    } finally {
        await pool.end();
    }
}

getData();
