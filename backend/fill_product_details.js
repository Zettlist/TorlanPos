
import pool from './database/db.js';

async function fillProductDetails() {
    try {
        console.log('🔄 Filling missing product details...');

        const query = `
            UPDATE products
            SET 
                isbn = IF(isbn IS NULL OR isbn = '', FLOOR(1000000000000 + RAND() * 8999999999999), isbn),
                publication_date = IF(publication_date IS NULL OR publication_date = '', '2024-01-01', publication_date),
                publisher = IF(publisher IS NULL OR publisher = '', 'Editorial Test', publisher),
                page_count = IF(page_count IS NULL OR page_count = 0, 200, page_count),
                dimensions = IF(dimensions IS NULL OR dimensions = '', '15x21x2', dimensions),
                weight = IF(weight IS NULL OR weight = 0, 350, weight),
                language = IF(language IS NULL OR language = '', 'Español', language)
            WHERE id > 0;
        `;

        const [result] = await pool.query(query);
        console.log(`✅ Updated ${result.changedRows} products with default details.`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Error updating product details:', error);
        process.exit(1);
    }
}

fillProductDetails();
