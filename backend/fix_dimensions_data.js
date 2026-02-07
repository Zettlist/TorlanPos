
import mysql from 'mysql2/promise';

const dbConfig = {
    host: '127.0.0.1',
    port: 3308,
    user: 'torlan_user',
    password: 'rUJJkcUfzloxoxzQVPH3MKK1',
    database: 'torlan_pos',
};

async function fixData() {
    console.log('Starting data migration for dimensions...');
    const pool = mysql.createPool(dbConfig);
    const connection = await pool.getConnection();

    try {
        const [products] = await connection.query(
            'SELECT id, dimensions FROM products WHERE dimensions LIKE "%x%" AND dimensions NOT LIKE "{%"'
        );

        console.log(`Found ${products.length} products with legacy dimensions format.`);

        for (const product of products) {
            const [l, w, h] = product.dimensions.split('x');
            const jsonDimensions = JSON.stringify({
                length: l || '',
                width: w || '',
                height: h || ''
            });

            await connection.query(
                'UPDATE products SET dimensions = ? WHERE id = ?',
                [jsonDimensions, product.id]
            );
        }

        console.log('✅ Data migration complete.');
    } catch (error) {
        console.error('Error:', error);
    } finally {
        connection.release();
        await pool.end();
    }
}

fixData();
