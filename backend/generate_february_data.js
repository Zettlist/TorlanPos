
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
const USER_ID = 14;

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

async function generateFebruary() {
    console.log(`Starting February 2026 generation for Empresa ${EMPRESA_ID}...`);
    let connection;

    try {
        connection = await pool.getConnection();

        const [products] = await connection.query(
            'SELECT id, price FROM products WHERE empresa_id = ?',
            [EMPRESA_ID]
        );
        console.log(`Loaded ${products.length} products.`);

        // Generate for Feb 1 to Feb 28, 2026
        const days = [];
        for (let d = 1; d <= 28; d++) {
            days.push(new Date(2026, 1, d)); // Month is 0-indexed: 1 = Feb
        }

        console.log(`Generating ${days.length} days of data...`);

        for (const date of days) {
            const dateStr = date.toISOString().split('T')[0];

            // 1. Open Session
            const openTime = randomDate(date, 8, 9);
            const initialCash = randomInt(1000, 5000);

            const [sessionResult] = await connection.query(`
                INSERT INTO cash_sessions (empresa_id, user_id, opening_amount, status, opened_at)
                VALUES (?, ?, ?, 'open', ?)
            `, [EMPRESA_ID, USER_ID, initialCash, openTime]);

            const sessionId = sessionResult.insertId;

            // 2. Generate Sales
            const salesCount = randomInt(15, 35);
            let cashSalesTotal = 0;

            for (let s = 0; s < salesCount; s++) {
                const saleTime = randomDate(date, 10, 20);
                const isCash = Math.random() < 0.6;
                const paymentMethod = isCash ? 'cash' : 'card';

                const itemsCount = randomInt(1, 5);
                let saleTotal = 0;
                const saleItems = [];

                for (let k = 0; k < itemsCount; k++) {
                    const product = products[randomInt(0, products.length - 1)];
                    const qty = randomInt(1, 4);
                    saleItems.push({
                        product_id: product.id,
                        quantity: qty,
                        price: product.price
                    });
                    saleTotal += (product.price * qty);
                }

                const [saleResult] = await connection.query(`
                    INSERT INTO sales (empresa_id, user_id, total, payment_method, created_at)
                    VALUES (?, ?, ?, ?, ?)
                `, [EMPRESA_ID, USER_ID, saleTotal, paymentMethod, saleTime]);

                const saleId = saleResult.insertId;

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

                if (isCash) cashSalesTotal += saleTotal;
            }

            // 3. Close Session
            const closeTime = randomDate(date, 21, 23);
            const expected = initialCash + cashSalesTotal;
            const diff = randomFloat(-50, 50);
            const declared = expected + diff;

            await connection.query(`
                UPDATE cash_sessions 
                SET expected_amount =?, declared_amount=?, difference=?, status='closed', closed_at=?
                WHERE id=?
            `, [expected, declared, diff, closeTime, sessionId]);

            process.stdout.write('.');
        }

        console.log('\n✅ February 2026 data generated!');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        if (connection) connection.release();
        await pool.end();
    }
}

generateFebruary();
