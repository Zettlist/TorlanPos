
import { initDatabase, prepare } from './backend/database/db.js';

(async () => {
    try {
        await initDatabase();

        console.log('--- Testing Raw Insert ---');

        const empresas = prepare('SELECT * FROM empresas').all();
        console.log('Empresas:', JSON.stringify(empresas, null, 2));

        const empresaId = empresas.length > 0 ? empresas[0].id : 1;
        const publisher = "TestPublisher_" + Date.now();

        console.log(`Using Empresa ID: ${empresaId}`);

        // Try inserting a dummy product with publisher
        const result = prepare(`
            INSERT INTO products (
                empresa_id, name, price, category, publisher, weight, page_count
            ) VALUES (
                ?, 'Test Product', 100, 'TestCategory', ?, 500, 200
            )
        `).run(empresaId, publisher);

        console.log('Insert Result:', result);
        const newItemId = result.lastInsertRowid;

        // Read it back
        const savedItem = prepare('SELECT * FROM products WHERE id = ?').get(newItemId);
        console.log('Saved Item:', JSON.stringify(savedItem, null, 2));

        if (savedItem.publisher === publisher) {
            console.log('✅ SUCCESS: Publisher saved correctly');
        } else {
            console.log('❌ FAILURE: Publisher NOT saved (Value: ' + savedItem.publisher + ')');
        }

    } catch (error) {
        console.error('Error:', error);
    }
})();
