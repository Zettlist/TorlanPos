
import mysql from 'mysql2/promise';

const dbConfig = {
    host: '127.0.0.1',
    port: 3308,
    user: 'torlan_user',
    password: 'rUJJkcUfzloxoxzQVPH3MKK1',
    database: 'torlan_pos',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const EMPRESA_ID = 118;

const PUBLISHERS = ['Wiley', 'Pearson', 'McGraw-Hill', 'Penguin Random House', 'HarperCollins', 'Planeta', 'Alfaguara', 'Cátedra'];
const LANGUAGES = ['Español', 'Inglés', 'Francés', 'Alemán'];
const PAGE_COLORS = ['B/N', 'Color'];

function randomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
    return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

function randomDate(start, end) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
        .toISOString().split('T')[0]; // Format YYYY-MM-DD
}

const pool = mysql.createPool(dbConfig);

async function populateDetails() {
    console.log(`Starting product details backfill for Empresa ${EMPRESA_ID}...`);
    let connection;

    try {
        connection = await pool.getConnection();

        // 1. Get all product IDs for the empresa
        const [products] = await connection.query(
            'SELECT id FROM products WHERE empresa_id = ?',
            [EMPRESA_ID]
        );

        console.log(`Found ${products.length} products to update.`);

        // 2. Update in batches
        const batchSize = 100;
        let updatedCount = 0;

        for (let i = 0; i < products.length; i += batchSize) {
            const batch = products.slice(i, i + batchSize);
            const promises = batch.map(product => {
                const publisher = randomElement(PUBLISHERS);
                const language = randomElement(LANGUAGES);
                const pageColor = Math.random() < 0.8 ? 'B/N' : 'Color'; // 80% B/N
                const pageCount = randomInt(120, 1000);
                const weight = randomFloat(0.2, 1.5); // kg or grams, assuming grams based on UI "Peso (g)" label but 0.2-1.5 matches small books if kg. Re-checking usage. 
                // Image says "Peso (g)", so better use grams like 200 - 1500.
                const weightGrams = randomInt(200, 1500);

                // Dimensions: L x W x H
                const largo = randomFloat(18, 30);
                const ancho = randomFloat(10, 22);
                const alto = randomFloat(1, 5);
                const dimensions = `${largo}x${ancho}x${alto}`; // Simple string format

                const pubDate = randomDate(new Date(2015, 0, 1), new Date(2025, 11, 31));

                return connection.query(`
                    UPDATE products 
                    SET 
                        publisher = ?,
                        language = ?,
                        page_color = ?,
                        page_count = ?,
                        weight = ?,
                        dimensions = ?,
                        publication_date = ?
                    WHERE id = ?
                `, [publisher, language, pageColor, pageCount, weightGrams, dimensions, pubDate, product.id]);
            });

            await Promise.all(promises);
            updatedCount += batch.length;
            process.stdout.write(`\rUpdated ${updatedCount}/${products.length} products...`);
        }

        console.log('\n✅ All products updated successfully!');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        if (connection) connection.release();
        await pool.end();
    }
}

populateDetails();
