
import { initDatabase, prepare, exec } from './backend/database/db.js';

(async () => {
    try {
        await initDatabase();

        console.log('--- Checking Schema ---');
        const columns = prepare("PRAGMA table_info(products)").all();
        console.log('Columns:', columns.map(c => `${c.name} (${c.type})`).join(', '));

        console.log('--- Checking Last ID before insert ---');
        const lastIdBefore = prepare('SELECT MAX(id) as max_id FROM products').get();
        console.log('Max ID:', lastIdBefore.max_id);

        console.log('--- Attempting Minimal Insert ---');
        const testName = "SchemaTest_" + Date.now();
        // Insert with explicit values embedded in SQL to rule out param binding issues first
        exec(`INSERT INTO products (empresa_id, name, price, publisher) VALUES (11, '${testName}', 123.45, 'DirectPublisher')`);

        console.log('--- Verifying Insert ---');
        const inserted = prepare('SELECT * FROM products WHERE name = ?').get(testName);
        console.log('Found inserted product:', JSON.stringify(inserted, null, 2));

        if (inserted && inserted.publisher === 'DirectPublisher') {
            console.log('✅ Success: Data saved via direct SQL exec.');
        } else {
            console.log('❌ Failure: Data NOT saved.');
        }

    } catch (error) {
        console.error('Error:', error);
    }
})();
