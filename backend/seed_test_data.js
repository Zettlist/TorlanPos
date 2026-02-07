/**
 * QA Test Data Seeder
 * Generates realistic sales data for 120 days (4 months)
 * No external dependencies beyond bcrypt and native MySQL pool
 */

import pool from './database/db.js';
import bcrypt from 'bcrypt';

// ============================================================================
// CONFIGURATION
// ============================================================================

const EMPRESA_NAME = 'Bisonte Test Lab';
const MONTHLY_GOAL = 50000;
const DAYS_TO_GENERATE = 120;
const MIN_SALES_PER_DAY = 0;
const MAX_SALES_PER_DAY = 8;
const DEFAULT_PASSWORD = '123456';

// ============================================================================
// PRODUCT CATALOG (Realistic manga store inventory)
// ============================================================================

const PRODUCTS = [
    { name: 'One Piece Vol 1', category: 'Manga', publisher: 'Panini', cost: 80, price: 150, stock: 50 },
    { name: 'Naruto Vol 1', category: 'Manga', publisher: 'Panini', cost: 75, price: 140, stock: 45 },
    { name: 'Dragon Ball Super Vol 1', category: 'Manga', publisher: 'Ivrea', cost: 90, price: 165, stock: 40 },
    { name: 'Attack on Titan Vol 1', category: 'Manga', publisher: 'Norma', cost: 85, price: 155, stock: 35 },
    { name: 'Demon Slayer Vol 1', category: 'Manga', publisher: 'Panini', cost: 85, price: 160, stock: 60 },
    { name: 'My Hero Academia Vol 1', category: 'Manga', publisher: 'Panini', cost: 80, price: 150, stock: 55 },
    { name: 'Jujutsu Kaisen Vol 1', category: 'Manga', publisher: 'Ivrea', cost: 90, price: 170, stock: 50 },
    { name: 'Tokyo Ghoul Vol 1', category: 'Manga', publisher: 'Norma', cost: 85, price: 155, stock: 30 },
    { name: 'Chainsaw Man Vol 1', category: 'Manga', publisher: 'Ivrea', cost: 95, price: 175, stock: 40 },
    { name: 'Spy x Family Vol 1', category: 'Manga', publisher: 'Panini', cost: 85, price: 160, stock: 65 },
    { name: 'Death Note Vol 1', category: 'Manga', publisher: 'Panini', cost: 75, price: 140, stock: 25 },
    { name: 'Fullmetal Alchemist Vol 1', category: 'Manga', publisher: 'Norma', cost: 80, price: 150, stock: 30 },
    { name: 'Figura Luffy Gear 5', category: 'Figuras', publisher: 'Bandai', cost: 450, price: 850, stock: 15 },
    { name: 'Figura Goku Ultra Instinct', category: 'Figuras', publisher: 'Bandai', cost: 500, price: 950, stock: 12 },
    { name: 'Nendoroid Nezuko', category: 'Figuras', publisher: 'Good Smile', cost: 600, price: 1100, stock: 8 },
    { name: 'Pocky Chocolate', category: 'Snacks', publisher: 'Glico', cost: 25, price: 45, stock: 100 },
    { name: 'Ramune Original', category: 'Bebidas', publisher: 'Sangaria', cost: 20, price: 35, stock: 80 },
    { name: 'Kit Kat Matcha', category: 'Snacks', publisher: 'Nestlé', cost: 30, price: 55, stock: 90 },
    { name: 'Poster Naruto', category: 'Coleccionables', publisher: 'Genérico', cost: 40, price: 80, stock: 50 },
    { name: 'Llavero Eren', category: 'Coleccionables', publisher: 'Genérico', cost: 35, price: 65, stock: 70 }
];

const PAYMENT_METHODS = ['cash', 'card'];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate random integer between min and max (inclusive)
 */
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Pick random element from array
 */
function randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
}

/**
 * Get date N days ago from today
 */
function daysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
}

/**
 * Format date for MySQL DATETIME
 */
function toMySQLDateTime(date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Generate random time during business hours (10:00 - 21:00)
 */
function randomBusinessTime(date) {
    const hour = randomInt(10, 21);
    const minute = randomInt(0, 59);
    const second = randomInt(0, 59);

    const newDate = new Date(date);
    newDate.setHours(hour, minute, second);
    return newDate;
}

// ============================================================================
// MAIN SEEDER
// ============================================================================

async function seedTestData() {
    let empresaId;
    let adminUserId;
    let vendedorUserId;
    const productIds = [];

    try {
        console.log('🌱 Starting QA Test Data Seeder...\n');

        // ========================================================================
        // STEP 1: Verify/Create Empresa
        // ========================================================================
        console.log('📦 STEP 1: Setting up empresa...');

        const [empresas] = await pool.query(
            'SELECT id FROM empresas WHERE nombre_empresa = ?',
            [EMPRESA_NAME]
        );

        if (empresas.length > 0) {
            empresaId = empresas[0].id;
            console.log(`   ✓ Found existing empresa: ${EMPRESA_NAME} (ID: ${empresaId})`);
        } else {
            const [result] = await pool.query(`
                INSERT INTO empresas (nombre_empresa, plan_contratado, estado, max_usuarios, max_productos)
                VALUES (?, 'Premium', 'Activo', 50, 1000)
            `, [EMPRESA_NAME]);
            empresaId = result.insertId;
            console.log(`   ✓ Created new empresa: ${EMPRESA_NAME} (ID: ${empresaId})`);
        }

        // Set monthly goal
        await pool.query(`
            INSERT INTO business_settings (empresa_id, setting_key, setting_value)
            VALUES (?, 'monthly_goal', ?)
            ON DUPLICATE KEY UPDATE setting_value = ?
        `, [empresaId, MONTHLY_GOAL.toString(), MONTHLY_GOAL.toString()]);
        console.log(`   ✓ Set monthly goal: $${MONTHLY_GOAL.toLocaleString()}\n`);

        // ========================================================================
        // STEP 2: Create Users
        // ========================================================================
        console.log('👥 STEP 2: Creating test users...');

        const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

        // Create admin user
        const [existingAdmin] = await pool.query(
            'SELECT id FROM users WHERE username = ? AND empresa_id = ?',
            ['test_admin', empresaId]
        );

        if (existingAdmin.length > 0) {
            adminUserId = existingAdmin[0].id;
            console.log('   ✓ Admin user already exists (test_admin)');
        } else {
            const [adminResult] = await pool.query(`
                INSERT INTO users (username, password_hash, empresa_id, role, is_admin, first_login, onboarding_completed, has_setup_complete)
                VALUES (?, ?, ?, 'empresa_admin', 1, 0, 1, 1)
            `, ['test_admin', hashedPassword, empresaId]);
            adminUserId = adminResult.insertId;
            console.log('   ✓ Created admin user: test_admin / 123456');
        }

        // Create vendedor user
        const [existingVendedor] = await pool.query(
            'SELECT id FROM users WHERE username = ? AND empresa_id = ?',
            ['test_vendedor', empresaId]
        );

        if (existingVendedor.length > 0) {
            vendedorUserId = existingVendedor[0].id;
            console.log('   ✓ Vendedor user already exists (test_vendedor)');
        } else {
            const [vendedorResult] = await pool.query(`
                INSERT INTO users (username, password_hash, empresa_id, role, is_admin, first_login, onboarding_completed, has_setup_complete)
                VALUES (?, ?, ?, 'employee', 0, 0, 1, 1)
            `, ['test_vendedor', hashedPassword, empresaId]);
            vendedorUserId = vendedorResult.insertId;
            console.log('   ✓ Created vendedor user: test_vendedor / 123456');
        }

        console.log('');

        // ========================================================================
        // STEP 3: Create Product Inventory
        // ========================================================================
        console.log('🛍️  STEP 3: Creating product inventory...');

        for (const product of PRODUCTS) {
            const [existing] = await pool.query(
                'SELECT id FROM products WHERE name = ? AND empresa_id = ?',
                [product.name, empresaId]
            );

            if (existing.length > 0) {
                productIds.push(existing[0].id);
            } else {
                const [result] = await pool.query(`
                    INSERT INTO products (
                        empresa_id, name, price, cost_price, sale_price, stock, 
                        category, publisher
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    empresaId, product.name, product.price, product.cost,
                    product.price, product.stock, product.category, product.publisher
                ]);
                productIds.push(result.insertId);
            }
        }
        console.log(`   ✓ Created/verified ${PRODUCTS.length} products\n`);

        // ========================================================================
        // STEP 4: Generate Sales History (MOST IMPORTANT)
        // ========================================================================
        console.log(`📊 STEP 4: Generating ${DAYS_TO_GENERATE} days of sales history...`);
        console.log('   This may take a minute...\n');

        let totalSalesGenerated = 0;
        let totalRevenue = 0;

        for (let dayOffset = DAYS_TO_GENERATE; dayOffset >= 0; dayOffset--) {
            const date = daysAgo(dayOffset);
            const salesThisDay = randomInt(MIN_SALES_PER_DAY, MAX_SALES_PER_DAY);

            for (let saleNum = 0; saleNum < salesThisDay; saleNum++) {
                // Random sale time during business hours
                const saleTime = randomBusinessTime(date);
                const saleDateTime = toMySQLDateTime(saleTime);

                // Random payment method
                const paymentMethod = randomChoice(PAYMENT_METHODS);

                // Random user (admin or vendedor)
                const userId = Math.random() > 0.3 ? vendedorUserId : adminUserId;

                // Generate 1-4 random items for this sale
                const itemCount = randomInt(1, 4);
                const saleItems = [];
                let saleTotal = 0;

                for (let i = 0; i < itemCount; i++) {
                    const productIndex = randomInt(0, PRODUCTS.length - 1);
                    const product = PRODUCTS[productIndex];
                    const productId = productIds[productIndex];
                    const quantity = randomInt(1, 3);
                    const itemTotal = product.price * quantity;

                    saleItems.push({
                        productId,
                        productName: product.name,
                        quantity,
                        price: product.price
                    });

                    saleTotal += itemTotal;
                }

                // Insert sale
                const [saleResult] = await pool.query(`
                    INSERT INTO sales (empresa_id, user_id, total, payment_method, created_at)
                    VALUES (?, ?, ?, ?, ?)
                `, [empresaId, userId, saleTotal, paymentMethod, saleDateTime]);

                const saleId = saleResult.insertId;

                // Insert sale items and update stock
                for (const item of saleItems) {
                    await pool.query(`
                        INSERT INTO sale_items (sale_id, product_id, quantity, price)
                        VALUES (?, ?, ?, ?)
                    `, [saleId, item.productId, item.quantity, item.price]);

                    // Decrement stock
                    await pool.query(`
                        UPDATE products 
                        SET stock = GREATEST(0, stock - ?)
                        WHERE id = ?
                    `, [item.quantity, item.productId]);
                }

                totalSalesGenerated++;
                totalRevenue += saleTotal;
            }

            // Progress indicator every 10 days
            if ((DAYS_TO_GENERATE - dayOffset) % 10 === 0) {
                console.log(`   📅 Processed ${DAYS_TO_GENERATE - dayOffset}/${DAYS_TO_GENERATE} days...`);
            }
        }

        console.log('\n✅ SEEDING COMPLETE!\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📈 SUMMARY');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`🏢 Empresa:          ${EMPRESA_NAME}`);
        console.log(`👥 Users:            2 (test_admin, test_vendedor)`);
        console.log(`📦 Products:         ${PRODUCTS.length} items`);
        console.log(`💰 Sales Generated:  ${totalSalesGenerated} transactions`);
        console.log(`💵 Total Revenue:    $${totalRevenue.toFixed(2)}`);
        console.log(`📊 Avg per Sale:     $${(totalRevenue / totalSalesGenerated).toFixed(2)}`);
        console.log(`📅 Date Range:       ${toMySQLDateTime(daysAgo(DAYS_TO_GENERATE)).split(' ')[0]} to ${toMySQLDateTime(new Date()).split(' ')[0]}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('🔑 TEST CREDENTIALS:');
        console.log('   Admin:    test_admin / 123456');
        console.log('   Vendedor: test_vendedor / 123456\n');

    } catch (error) {
        console.error('\n❌ ERROR during seeding:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

// Run the seeder
seedTestData();
