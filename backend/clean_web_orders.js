import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'torlan_user',
    password: 'rUJJkcUfzloxoxzQVPH3MKK1',
    database: 'torlan_pos',
});

// Get web order IDs
const [orders] = await conn.query(`
    SELECT id FROM sales
    WHERE cash_session_id IS NULL AND cliente_id IS NOT NULL
`);

const ids = orders.map(o => o.id);
console.log(`Found ${ids.length} web orders:`, ids);

if (!ids.length) {
    console.log('Nothing to delete.');
    await conn.end();
    process.exit(0);
}

// Delete in order (FK constraints)
const [r1] = await conn.query(`DELETE FROM sale_items WHERE sale_id IN (?)`, [ids]);
console.log(`Deleted ${r1.affectedRows} sale_items`);

const [r2] = await conn.query(`DELETE FROM bisonte_orders WHERE sale_id IN (?)`, [ids]);
console.log(`Deleted ${r2.affectedRows} bisonte_orders`);

const [r3] = await conn.query(`
    DELETE FROM sales WHERE cash_session_id IS NULL AND cliente_id IS NOT NULL
`);
console.log(`Deleted ${r3.affectedRows} sales`);

await conn.end();
console.log('Done ✅');
