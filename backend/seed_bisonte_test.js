import pool, { initDatabase } from './database/db.js';
import bcrypt from 'bcryptjs';

// Adapter to make MySQL pool compatible with existing code expecting SQLite-style helpers
const dbHelpers = {
    run: async (sql, params) => {
        const [result] = await pool.execute(sql, params);
        return { lastInsertId: result.insertId, changes: result.affectedRows };
    },
    get: async (sql, params) => {
        const [rows] = await pool.execute(sql, params);
        return rows[0];
    },
    all: async (sql, params) => {
        const [rows] = await pool.execute(sql, params);
        return rows;
    }
};

console.log('🧪 Seeding Bisonte Test Lab data (MySQL)...\n');

// Initialize DB first
await initDatabase();

// =============================================
// CONFIGURATION
// =============================================
const EMPRESA_ID = 99;
const EMPRESA_NAME = 'Bisonte Test Lab';
const PASSWORD = '1234';
const HASHED_PASSWORD = bcrypt.hashSync(PASSWORD, 10);

// Date ranges for historical data
const START_DATE = new Date('2025-11-01');
const END_DATE = new Date('2026-01-31');

// =============================================
// CLEANUP FUNCTION
// =============================================
async function cleanupTestData() {
    console.log('🧹 Cleaning up existing test data...');

    try {
        // Delete in correct order to respect foreign keys
        await dbHelpers.run('DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE empresa_id = ?)', [EMPRESA_ID]);
        await dbHelpers.run('DELETE FROM sales WHERE empresa_id = ?', [EMPRESA_ID]);
        await dbHelpers.run('DELETE FROM cash_sessions WHERE empresa_id = ?', [EMPRESA_ID]);
        await dbHelpers.run('DELETE FROM sales_goals WHERE empresa_id = ?', [EMPRESA_ID]);
        await dbHelpers.run('DELETE FROM business_settings WHERE empresa_id = ?', [EMPRESA_ID]);
        await dbHelpers.run('DELETE FROM products WHERE empresa_id = ?', [EMPRESA_ID]);
        await dbHelpers.run('DELETE FROM user_features WHERE user_id IN (SELECT id FROM users WHERE empresa_id = ?)', [EMPRESA_ID]);
        await dbHelpers.run('DELETE FROM users WHERE empresa_id = ?', [EMPRESA_ID]);
        await dbHelpers.run('DELETE FROM empresas WHERE id = ?', [EMPRESA_ID]);

        console.log('✅ Cleanup completed\n');
    } catch (error) {
        console.error('❌ Cleanup error:', error.message);
    }
}

// =============================================
// HELPER FUNCTIONS
// =============================================
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, decimals = 2) {
    return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function randomChoice(arr) {
    return arr[randomInt(0, arr.length - 1)];
}

function generateISBN() {
    const prefix = '978';
    const group = randomInt(0, 9);
    const publisher = String(randomInt(10000, 99999));
    const title = String(randomInt(1000, 9999));
    const check = randomInt(0, 9);
    return `${prefix}${group}${publisher}${title}${check}`;
}

function formatDate(date) {
    return date.toISOString().split('T')[0];
}

function formatDateTime(date) {
    return date.toISOString().replace('T', ' ').substring(0, 19);
}

// =============================================
// MAIN SEEDING
// =============================================

try {
    // 1. CLEANUP
    await cleanupTestData();

    // 2. CREATE EMPRESA
    console.log('📊 Creating empresa...');
    await dbHelpers.run(
        `INSERT INTO empresas (id, nombre_empresa, plan_contratado, max_usuarios, max_productos, estado)
         VALUES (?, ?, 'Premium', 20, 500, 'Activo')`,
        [EMPRESA_ID, EMPRESA_NAME]
    );
    console.log(`✅ Created: ${EMPRESA_NAME} (ID: ${EMPRESA_ID})\n`);

    // 3. CREATE USERS
    console.log('👥 Creating users...');
    const users = [
        { username: 'gerente_test', role: 'empresa_admin', is_admin: 1 },
        { username: 'supervisor_test', role: 'employee', is_admin: 1 },
        { username: 'vendedor_test', role: 'employee', is_admin: 0 }
    ];

    const userIds = [];
    for (const user of users) {
        const result = await dbHelpers.run(
            `INSERT INTO users (username, password_hash, empresa_id, role, is_admin, first_login, has_setup_complete)
             VALUES (?, ?, ?, ?, ?, 0, 1)`,
            [user.username, HASHED_PASSWORD, EMPRESA_ID, user.role, user.is_admin]
        );

        userIds.push(result.lastInsertId);
        console.log(`✅ Created user: ${user.username} (ID: ${result.lastInsertId})`);
    }
    console.log(`\n📝 Password for all users: ${PASSWORD}\n`);

    // 4. CREATE PRODUCTS
    console.log('📚 Creating products...');
    const categories = ['Shonen', 'Seinen', 'Artbooks'];
    const productData = [
        'One Piece Vol. 1', 'Attack on Titan Vol. 5', 'My Hero Academia Vol. 10',
        'Demon Slayer Vol. 3', 'Jujutsu Kaisen Vol. 7', 'Tokyo Ghoul Vol. 2',
        'Naruto Vol. 15', 'Death Note Vol. 1', 'Fullmetal Alchemist Vol. 8',
        'Berserk Vol. 12', 'Vagabond Vol. 4', 'Chainsaw Man Vol. 2',
        'Spy x Family Vol. 5', 'Bleach Vol. 20', 'Hunter x Hunter Vol. 9',
        'One Punch Man Vol. 6', 'Mob Psycho 100 Vol. 3', 'Vinland Saga Vol. 7',
        'Kimetsu Artbook', 'Jump Force Art Collection'
    ];

    const publishers = ['Panini', 'Kamite', 'Ivrea', 'Editorial Vid'];
    const productIds = [];

    for (let idx = 0; idx < productData.length; idx++) {
        const name = productData[idx];
        const costPrice = randomFloat(100, 300);
        const margin = randomFloat(1.3, 1.5);
        const salePrice = parseFloat((costPrice * margin).toFixed(2));
        const stock = idx < 18 ? randomInt(5, 50) : randomInt(0, 3);
        const category = categories[idx % 3];

        const result = await dbHelpers.run(
            `INSERT INTO products (
                empresa_id, name, price, stock, category, isbn, sbin_code,
                cost_price, sale_price, publisher, publication_date, 
                page_count, language, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'es', NOW())`,
            [
                EMPRESA_ID, name, salePrice, stock, category, generateISBN(),
                `SBIN${String(idx + 1).padStart(4, '0')}`, costPrice, salePrice,
                randomChoice(publishers), `2023-${String(randomInt(1, 12)).padStart(2, '0')}-01`,
                randomInt(120, 350)
            ]
        );

        productIds.push(result.lastInsertId);
        if ((idx + 1) % 5 === 0) console.log(`✅ Created ${idx + 1}/${productData.length} products...`);
    }
    console.log(`✅ All 20 products created\n`);

    // 5. CREATE SALES HISTORY
    console.log('💰 Generating sales history (Nov 2025 - Jan 2026)...');
    let totalSales = 0;
    let currentDate = new Date(START_DATE);

    while (currentDate <= END_DATE) {
        const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
        const dailySalesCount = isWeekend ? randomInt(5, 12) : randomInt(3, 8);
        const dateTimeBase = formatDateTime(new Date(currentDate.getTime() + 9 * 60 * 60 * 1000));

        const sessionUserId = randomChoice(userIds);
        const openingAmount = 500;

        const cashResult = await dbHelpers.run(
            `INSERT INTO cash_sessions (empresa_id, user_id, opening_amount, status, opened_at)
             VALUES (?, ?, ?, 'open', ?)`,
            [EMPRESA_ID, sessionUserId, openingAmount, dateTimeBase]
        );

        const sessionId = cashResult.lastInsertId;
        let dailyTotal = 0;
        let cashTotal = 0;

        for (let i = 0; i < dailySalesCount; i++) {
            const saleUserId = randomChoice(userIds);
            const paymentMethod = Math.random() < 0.6 ? 'cash' : 'card';
            const itemsCount = randomInt(1, 3);
            let saleTotal = 0;
            const saleDateTime = formatDateTime(
                new Date(currentDate.getTime() + (9 + i) * 60 * 60 * 1000 + randomInt(0, 3600) * 1000)
            );

            const saleResult = await dbHelpers.run(
                `INSERT INTO sales (empresa_id, user_id, total, payment_method, created_at)
                 VALUES (?, ?, 0, ?, ?)`,
                [EMPRESA_ID, saleUserId, paymentMethod, saleDateTime]
            );

            const saleId = saleResult.lastInsertId;

            for (let j = 0; j < itemsCount; j++) {
                const productId = randomChoice(productIds);
                const quantity = randomInt(1, 2);

                const product = await dbHelpers.get('SELECT price, stock FROM products WHERE id = ?', [productId]);
                if (product && product.stock >= quantity) {
                    const itemTotal = product.price * quantity;
                    saleTotal += itemTotal;

                    await dbHelpers.run(
                        `INSERT INTO sale_items (sale_id, product_id, quantity, price)
                         VALUES (?, ?, ?, ?)`,
                        [saleId, productId, quantity, product.price]
                    );

                    await dbHelpers.run(
                        'UPDATE products SET stock = stock - ? WHERE id = ?',
                        [quantity, productId]
                    );
                }
            }

            await dbHelpers.run('UPDATE sales SET total = ? WHERE id = ?', [saleTotal, saleId]);
            dailyTotal += saleTotal;
            if (paymentMethod === 'cash') cashTotal += saleTotal;
        }

        // CLOSE CASH SESSION
        const isAutoClosed = Math.random() < 0.2;
        const expectedAmount = openingAmount + cashTotal;
        const declaredAmount = isAutoClosed ? expectedAmount : expectedAmount + randomFloat(-50, 50);
        const difference = declaredAmount - expectedAmount;
        const closeDateTime = formatDateTime(
            new Date(currentDate.getTime() + (isAutoClosed ? 23 * 60 * 60 * 1000 : 20 * 60 * 60 * 1000))
        );
        const notes = isAutoClosed ? 'CIERRE AUTOMÁTICO POR SISTEMA (Medianoche)' : null;

        await dbHelpers.run(
            `UPDATE cash_sessions 
             SET status = 'closed', expected_amount = ?, declared_amount = ?,
             difference = ?, closed_at = ?, notes = ? WHERE id = ?`,
            [expectedAmount, declaredAmount, difference, closeDateTime, notes, sessionId]
        );

        totalSales++;
        if (totalSales % 20 === 0) {
            console.log(`✅ Generated ${totalSales} days of sales...`);
        }

        currentDate.setDate(currentDate.getDate() + 1);
    }
    console.log(`✅ Generated ${totalSales} days of sales history\n`);

    // 6. CREATE MONTHLY GOAL
    console.log('🎯 Setting monthly goal...');
    await dbHelpers.run(
        `INSERT INTO sales_goals (empresa_id, user_id, type, target, current, period_start)
         VALUES (?, ?, 'monthly', 45000.00, 0, '2026-01-01')`,
        [EMPRESA_ID, userIds[0]]
    );
    console.log('✅ Monthly goal set: $45,000.00 for January 2026\n');

    // SUMMARY
    console.log('═══════════════════════════════════════════════');
    console.log('✅ SEEDING COMPLETED SUCCESSFULLY!');
    console.log('═══════════════════════════════════════════════\n');

    console.log('📊 Summary:');
    console.log(`   • Empresa: ${EMPRESA_NAME} (ID: ${EMPRESA_ID})`);
    console.log(`   • Users: ${users.length} (Password: ${PASSWORD})`);
    users.forEach(u => console.log(`     - ${u.username}`));
    console.log(`   • Products: 20 manga items`);
    console.log(`   • Sales History: ${totalSales} days (Nov 2025 - Jan 2026)`);
    console.log(`   • Cash Sessions: ${totalSales} (80% manual, 20% auto-closed)`);
    console.log(`   • Monthly Goal: $45,000 (Jan 2026)`);
    console.log('\n🎉 Ready to test Reports module!\n');

} catch (error) {
    console.error('\n❌ SEEDING FAILED:', error);
    console.error(error.stack);
    process.exit(1);
}
