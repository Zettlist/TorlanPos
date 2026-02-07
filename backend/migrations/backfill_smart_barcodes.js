import pool from '../database/db.js';
import { generateEAN13 } from '../utils/barcodeGenerator.js';

console.log('🔄 Starting Smart Barcode Backfill...\n');

async function backfillBarcodes() {
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Get all products that need backfilling
        // Ordering by id ensures deterministic sequence assignment
        const [products] = await connection.query(`
            SELECT id, empresa_id, category_id, publisher_id, name 
            FROM products 
            WHERE category_id IS NOT NULL 
            ORDER BY empresa_id, category_id, publisher_id, id
        `);

        console.log(`📦 Found ${products.length} products to process\n`);

        // Track sequence counts for each combination
        // Key: "empresaId-categoryId-publisherId" -> Value: current sequence
        const sequences = new Map();
        let updatedCount = 0;

        for (const product of products) {
            const { id, empresa_id, category_id, publisher_id } = product;

            // Create key for this combination
            // Handle null publisher_id as 0 for consistency with generator logic
            const pubIdKey = publisher_id || 0;
            const key = `${empresa_id}-${category_id}-${pubIdKey}`;

            // Get next sequence
            const currentSeq = sequences.get(key) || 0;
            const nextSeq = currentSeq + 1;
            sequences.set(key, nextSeq);

            // Generate intelligent barcode
            const newBarcode = generateEAN13(empresa_id, category_id, publisher_id, nextSeq);

            // Update product (barcode and sbin_code)
            await connection.query(
                'UPDATE products SET barcode = ?, sbin_code = ? WHERE id = ?',
                [newBarcode, newBarcode, id]
            );

            updatedCount++;
            if (updatedCount % 100 === 0) {
                process.stdout.write(`   Processed ${updatedCount} products...\r`);
            }
        }

        await connection.commit();
        console.log(`\n\n✅ Successfully updated ${updatedCount} products with Smart EAN-13 barcodes!`);

        // Show some examples
        console.log('\n📊 Examples of new barcodes:');
        const [examples] = await pool.query(`
            SELECT name, barcode, category_id, publisher_id 
            FROM products 
            ORDER BY id DESC LIMIT 5
        `);
        examples.forEach(ex => {
            console.log(`   ${ex.name.padEnd(40)} -> ${ex.barcode} (C:${ex.category_id} P:${ex.publisher_id})`);
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('\n❌ Error during backfill:', error);
        throw error;
    } finally {
        if (connection) connection.release();
        await pool.end();
    }
}

backfillBarcodes()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
