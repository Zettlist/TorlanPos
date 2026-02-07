import pool from './database/db.js';
import { generateEAN13, validateEAN13 } from './utils/barcodeGenerator.js';

console.log('🧪 Testing EAN-13 Barcode Generation\n');

async function testBarcodeGeneration() {
    try {
        // Test 1: Generate sample barcodes
        console.log('📊 Test 1: Generate sample barcodes\n');

        const testCases = [
            { empresaId: 1, categoryId: 1, publisherId: 1, sequence: 1 },
            { empresaId: 5, categoryId: 3, publisherId: 12, sequence: 47 },
            { empresaId: 999, categoryId: 99, publisherId: null, sequence: 9999 },
            { empresaId: 118, categoryId: 5, publisherId: 8, sequence: 1 }
        ];

        for (const test of testCases) {
            const barcode = generateEAN13(
                test.empresaId,
                test.categoryId,
                test.publisherId,
                test.sequence
            );
            const isValid = validateEAN13(barcode);
            console.log(`E:${test.empresaId} C:${test.categoryId} P:${test.publisherId || 0} S:${test.sequence}`);
            console.log(`  → ${barcode} ${isValid ? '✓ VALID' : '✗ INVALID'}\n`);
        }

        // Test 2: Query actual categories and publishers
        console.log('\n📦 Test 2: Query database for categories and publishers\n');

        const [categories] = await pool.query('SELECT id, name FROM categories LIMIT 5');
        console.log('Categories:');
        categories.forEach(cat => console.log(`  ${cat.id}: ${cat.name}`));

        const [publishers] = await pool.query('SELECT id, name FROM publishers LIMIT 5');
        console.log('\nPublishers:');
        publishers.forEach(pub => console.log(`  ${pub.id}: ${pub.name}`));

        // Test 3: Simulate creating a product with barcode
        console.log('\n\n🔨 Test 3: Simulate product creation with auto-barcode\n');

        const empresaId = 118;
        const categoryName = 'Electrónica';
        const publisherName = 'Generic';

        // Get category ID
        const [catResult] = await pool.execute(
            'INSERT INTO categories (name) VALUES (?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)',
            [categoryName]
        );
        const categoryId = catResult.insertId;
        console.log(`Category "${categoryName}" → ID: ${categoryId}`);

        // Get publisher ID
        const [pubResult] = await pool.execute(
            'INSERT INTO publishers (name) VALUES (?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)',
            [publisherName]
        );
        const publisherId = pubResult.insertId;
        console.log(`Publisher "${publisherName}" → ID: ${publisherId}`);

        // Get sequence count
        const [countRows] = await pool.execute(
            `SELECT COUNT(*) as count FROM products 
             WHERE empresa_id = ? 
             AND category_id = ? 
             AND (publisher_id = ? OR (publisher_id IS NULL AND ? IS NULL))`,
            [empresaId, categoryId, publisherId, publisherId]
        );
        const sequence = countRows[0].count + 1;
        console.log(`Current sequence for this combination: ${sequence}`);

        // Generate barcode
        const barcode = generateEAN13(empresaId, categoryId, publisherId, sequence);
        const isValid = validateEAN13(barcode);

        console.log(`\n✨ Generated EAN-13: ${barcode}`);
        console.log(`   Validation: ${isValid ? '✅ VALID' : '❌ INVALID'}`);
        console.log(`   Formula breakdown:`);
        console.log(`      2 (prefix)`);
        console.log(`    + ${empresaId.toString().padStart(3, '0')} (empresa)`);
        console.log(`    + ${categoryId.toString().padStart(2, '0')} (category)`);
        console.log(`    + ${(publisherId || 0).toString().padStart(2, '0')} (publisher)`);
        console.log(`    + ${sequence.toString().padStart(4, '0')} (sequence)`);
        console.log(`    + ${barcode[12]} (check digit)`);
        console.log(`    = ${barcode}`);

        console.log('\n✅ All tests completed successfully!\n');

    } catch (error) {
        console.error('\n❌ Test failed:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

testBarcodeGeneration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
