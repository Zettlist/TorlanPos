
import mysql from 'mysql2/promise';

const dbConfig = {
    host: '127.0.0.1',
    port: 3308,
    user: 'torlan_user',
    password: 'rUJJkcUfzloxoxzQVPH3MKK1',
    database: 'torlan_pos',
    waitForConnections: true,
    connectionLimit: 12, // Slightly higher than concurrency to be safe
    queueLimit: 0
};

const EMPRESA_ID = 118;
const USER_ID = 14;
const DAYS_HISTORY = 90;
const CONCURRENCY = 10;

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
    return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

function randomDate(baseDate, startHour, endHour) {
    const date = new Date(baseDate);
    const hour = randomInt(startHour, endHour);
    const minute = randomInt(0, 59);
    date.setHours(hour, minute, 0, 0);
    return date;
}

const pool = mysql.createPool(dbConfig);

async function processDay(date, products) {
    let connection;
    try {
        connection = await pool.getConnection();

        // 1. Open Session
        const openTime = randomDate(date, 8, 9);
        const initialCash = randomInt(1000, 5000);

        const [sessionResult] = await connection.query(`
            INSERT INTO cash_sessions (empresa_id, user_id, opening_amount, status, opened_at)
            VALUES (?, ?, ?, 'open', ?)
        `, [EMPRESA_ID, USER_ID, initialCash, openTime]);

        const sessionId = sessionResult.insertId;

        // 2. Generate Sales
        const salesCount = randomInt(12, 28);
        let dailyTotal = 0;
        let cashSalesTotal = 0;

        for (let s = 0; s < salesCount; s++) {
            const saleTime = randomDate(date, 10, 20);
            const isCash = Math.random() < 0.6;
            const paymentMethod = isCash ? 'cash' : 'card';

            const itemsCount = randomInt(1, 4);
            let saleTotal = 0;
            const saleItems = [];

            for (let k = 0; k < itemsCount; k++) {
                const product = products[randomInt(0, products.length - 1)];
                const qty = randomInt(1, 3);
                saleItems.push({
                    product_id: product.id,
                    quantity: qty,
                    price: product.price
                });
                saleTotal += (product.price * qty);
            }

            // Insert Sale
            const [saleResult] = await connection.query(`
                INSERT INTO sales (empresa_id, user_id, total, payment_method, created_at)
                VALUES (?, ?, ?, ?, ?)
            `, [EMPRESA_ID, USER_ID, saleTotal, paymentMethod, saleTime]);

            const saleId = saleResult.insertId;

            // Batch Items
            if (saleItems.length > 0) {
                const placeholders = saleItems.map(() => '(?, ?, ?, ?)').join(', ');
                const values = [];
                saleItems.forEach(item => {
                    values.push(saleId, item.product_id, item.quantity, item.price);
                });

                await connection.query(
                    `INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES ${placeholders}`,
                    values
                );
            }

            dailyTotal += saleTotal;
            if (isCash) cashSalesTotal += saleTotal;
        }

        // 3. Close Session
        const closeTime = randomDate(date, 21, 22);
        const expected = initialCash + cashSalesTotal;
        const diff = randomFloat(-20, 20);
        const declared = expected + diff;

        await connection.query(`
            UPDATE cash_sessions 
            SET expected_amount = ?, declared_amount = ?, difference = ?, status = 'closed', closed_at = ?
            WHERE id = ?
        `, [expected, declared, diff, closeTime, sessionId]);

        return true;

    } catch (error) {
        console.error(`Error processing day ${date.toISOString().split('T')[0]}:`, error);
        return false;
    } finally {
        if (connection) connection.release();
    }
}

async function generateHistory() {
    console.log(`Starting PARALLEL history generation for Empresa ${EMPRESA_ID}...`);
    let mainConnection;

    try {
        mainConnection = await pool.getConnection();

        // Fetch products
        const [products] = await mainConnection.query(
            'SELECT id, price FROM products WHERE empresa_id = ?',
            [EMPRESA_ID]
        );
        console.log(`Loaded ${products.length} products.`);
        mainConnection.release();

        const today = new Date();
        const daysToProcess = [];

        for (let i = DAYS_HISTORY; i >= 1; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            daysToProcess.push(d);
        }

        console.log(`Processing ${daysToProcess.length} days with concurrency ${CONCURRENCY}...`);

        for (let i = 0; i < daysToProcess.length; i += CONCURRENCY) {
            const chunk = daysToProcess.slice(i, i + CONCURRENCY);
            console.log(`Processing chunk ${i / CONCURRENCY + 1}/${Math.ceil(daysToProcess.length / CONCURRENCY)}...`);

            await Promise.all(chunk.map(day => processDay(day, products)));
        }

        console.log('✅ History generation complete!');

    } catch (error) {
        console.error('Fatal Error:', error);
    } finally {
        await pool.end();
    }
}

generateHistory();
