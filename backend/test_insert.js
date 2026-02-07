import { prepare, initDatabase } from './database/db.js';

async function testInsert() {
    await initDatabase();

    try {
        console.log('Starting test insert...');

        // 1. Create Sale
        const empresaId = 12; // Matching the one from inspector
        const userId = 19;
        const total = 100;

        const saleResult = prepare(
            'INSERT INTO sales (empresa_id, user_id, total, payment_method) VALUES (?, ?, ?, ?)'
        ).run(empresaId, userId, total, 'cash');

        console.log('Sale Result:', saleResult);
        const saleId = saleResult.lastInsertRowid;
        console.log('New Sale ID:', saleId);

        if (!saleId) {
            console.error('Failed to get lastInsertRowid');
            return;
        }

        // 2. Create Sale Item
        // Find a valid product first
        const product = prepare('SELECT id FROM products WHERE empresa_id = ? LIMIT 1').get(empresaId);
        if (!product) {
            console.log('No products found for test, skipping item insert');
            return;
        }
        console.log('Using Product ID:', product.id);

        const itemResult = prepare(
            'INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES (?, ?, ?, ?)'
        ).run(saleId, product.id, 1, 100);

        console.log('Item Result:', itemResult);

        // 3. Verify
        const items = prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId);
        console.log('Verified Items:', items);

    } catch (e) {
        console.error('Test Error:', e);
    }
}

testInsert();
