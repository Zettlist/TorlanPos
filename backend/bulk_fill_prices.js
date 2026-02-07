
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function fillPrices() {
    const pool = mysql.createPool({
        host: '127.0.0.1',
        port: 3308,
        user: 'torlan_user',
        password: 'rUJJkcUfzloxoxzQVPH3MKK1',
        database: 'torlan_pos',
    });

    try {
        console.log('Fetching suppliers...');
        const [suppliers] = await pool.query('SELECT id FROM suppliers');
        if (suppliers.length === 0) {
            console.log('No suppliers found. Please create suppliers first.');
            return;
        }

        const supplierIds = suppliers.map(s => s.id);
        console.log(`Found ${supplierIds.length} suppliers: ${supplierIds.join(', ')}`);

        console.log('Updating products...');
        // Set cost_price to 60% of sale_price
        // Also set supplier_price to the same value
        // Assign a random supplier from the available list
        const [products] = await pool.query('SELECT id, sale_price FROM products WHERE cost_price IS NULL OR cost_price = 0');

        console.log(`Found ${products.length} products to update.`);

        for (const product of products) {
            const cost = (parseFloat(product.sale_price) * 0.6).toFixed(2);
            const randomSupplierId = supplierIds[Math.floor(Math.random() * supplierIds.length)];

            await pool.query(
                'UPDATE products SET cost_price = ?, supplier_price = ?, supplier_id = ? WHERE id = ?',
                [cost, cost, randomSupplierId, product.id]
            );
        }

        console.log('✅ Update complete.');
    } catch (error) {
        console.error('Update error:', error);
    } finally {
        await pool.end();
    }
}

fillPrices();
