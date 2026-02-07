import { prepare, initDatabase } from './database/db.js';

async function verify() {
    await initDatabase();

    // Find the most recent sale if id 3 doesn't exist or just to be sure
    const latestSale = prepare('SELECT id FROM sales ORDER BY id DESC LIMIT 1').get();
    const saleId = latestSale ? latestSale.id : 3;

    console.log(`Inspecting Sale ID: ${saleId}`);

    const sale = prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
    console.log('SALE:', sale);

    const items = prepare(`
        SELECT si.quantity, si.price, p.name, p.sbin_code
        FROM sale_items si
        JOIN products p ON si.product_id = p.id
        WHERE si.sale_id = ?
    `).all(saleId);

    console.log('ITEMS (Joined):', items);

    const rawItems = prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId);
    console.log('RAW SALE ITEMS:', rawItems);

    if (rawItems.length > 0) {
        // Check if product exists
        const productId = rawItems[0].product_id;
        const product = prepare('SELECT * FROM products WHERE id = ?').get(productId);
        console.log(`Product ${productId}:`, product);
    }
}

verify();
