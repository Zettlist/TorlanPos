import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'torlan_pos',
    port: process.env.DB_PORT || 3307
};

// Product categories for variety
const categories = [
    'Electrónica', 'Ropa', 'Alimentos', 'Bebidas', 'Juguetes',
    'Herramientas', 'Libros', 'Deportes', 'Hogar', 'Belleza',
    'Mascotas', 'Automotriz', 'Jardinería', 'Papelería', 'Música'
];

const brands = [
    'Samsung', 'Apple', 'Sony', 'LG', 'Panasonic', 'Generic', 'Premium',
    'Standard', 'Deluxe', 'Basic', 'Pro', 'Ultra', 'Max', 'Plus', 'Elite'
];

const publishers = [
    'Editorial Planeta', 'Penguin Random House', 'HarperCollins', 'Simon & Schuster',
    'Hachette', 'Macmillan', 'Scholastic', 'Pearson', 'Wiley', 'Oxford University Press',
    'Cambridge', 'Springer', 'Editorial Grijalbo', 'Alfaguara', 'Anagrama'
];

// Generate random product name
function generateProductName(index) {
    const category = categories[index % categories.length];
    const brand = brands[Math.floor(Math.random() * brands.length)];
    const variant = ['Modelo A', 'Modelo B', 'Modelo C', 'Versión X', 'Versión Y', 'Serie 1', 'Serie 2'][Math.floor(Math.random() * 7)];
    return `${brand} ${category} ${variant} #${index}`;
}

// Generate random price
function generatePrice() {
    const basePrice = Math.random() * 1000;
    return Math.round(basePrice * 100) / 100;
}

// Generate random barcode
function generateBarcode(index) {
    return `75${String(index).padStart(11, '0')}`;
}

// Generate random SKU
function generateSKU(index) {
    const prefix = ['PRD', 'ITM', 'SKU', 'CAT'][Math.floor(Math.random() * 4)];
    return `${prefix}-${String(index).padStart(6, '0')}`;
}

// Generate SBIN code (numeric only)
function generateSBIN(index) {
    return String(index).padStart(13, '0'); // 13-digit numeric code
}

// Get category
function getCategory(index) {
    return categories[index % categories.length];
}

// Get random publisher
function getPublisher() {
    return publishers[Math.floor(Math.random() * publishers.length)];
}

async function seedStressTestCompany() {
    let connection;

    try {
        console.log('🔌 Connecting to database...');
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connected successfully\n');

        // Start transaction
        await connection.beginTransaction();

        // 1. Create test company
        console.log('📦 Creating test company...');
        const empresaResult = await connection.execute(
            `INSERT INTO empresas (nombre_empresa, plan_contratado, max_usuarios, max_productos, estado, fecha_registro)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            ['Empresa Stress Test 2500', 'Empresarial', 10, 5000, 'Activo']
        );
        const empresaId = empresaResult[0].insertId;
        console.log(`✅ Company created with ID: ${empresaId}`);

        // 2. Create admin user
        console.log('\n👤 Creating admin user...');
        const hashedPassword = await bcrypt.hash('admin123', 10);
        const userResult = await connection.execute(
            `INSERT INTO users (username, password_hash, role, empresa_id, is_admin, has_setup_complete, onboarding_completed, first_login)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            ['StressTest2500', hashedPassword, 'empresa_admin', empresaId, 1, 1, 1, 0]
        );
        const userId = userResult[0].insertId;
        console.log(`✅ Admin user created: StressTest2500 / admin123 (ID: ${userId})`);

        // 3. Create 2500 products
        console.log('\n📦 Creating 2500 products...');
        const productsPerBatch = 100;
        const totalProducts = 2500;

        for (let i = 0; i < totalProducts; i += productsPerBatch) {
            const batchEnd = Math.min(i + productsPerBatch, totalProducts);
            const batchSize = batchEnd - i;

            // Prepare batch insert
            const values = [];
            for (let j = i; j < batchEnd; j++) {
                const name = generateProductName(j);
                const price = generatePrice();
                const salePrice = price * (0.8 + Math.random() * 0.2); // 80-100% of price
                const stock = Math.floor(Math.random() * 100) + 10; // 10-110 units
                const barcode = generateBarcode(j);
                const sbinCode = generateSBIN(j);
                const category = getCategory(j);
                const publisher = getPublisher();

                values.push(
                    name,
                    price,
                    salePrice,
                    stock,
                    category,
                    barcode,
                    sbinCode,
                    publisher,
                    empresaId
                );
            }

            // Generate placeholders for batch insert (9 fields per product)
            const placeholders = Array(batchSize)
                .fill('(?, ?, ?, ?, ?, ?, ?, ?, ?)')
                .join(', ');

            await connection.execute(
                `INSERT INTO products (name, price, sale_price, stock, category, barcode, sbin_code, publisher, empresa_id)
                 VALUES ${placeholders}`,
                values
            );

            const progress = Math.round((batchEnd / totalProducts) * 100);
            console.log(`   Progress: ${batchEnd}/${totalProducts} (${progress}%)`);
        }

        console.log('✅ 2500 products created successfully');

        // 4. Verify counts
        console.log('\n🔍 Verifying data...');
        const [productCount] = await connection.execute(
            'SELECT COUNT(*) as count FROM products WHERE empresa_id = ?',
            [empresaId]
        );
        console.log(`   Products in database: ${productCount[0].count}`);

        // Commit transaction
        await connection.commit();
        console.log('\n✅ Transaction committed successfully');

        console.log('\n' + '='.repeat(60));
        console.log('🎉 STRESS TEST COMPANY CREATED SUCCESSFULLY!');
        console.log('='.repeat(60));
        console.log('\n📋 Login Credentials:');
        console.log('   Username: StressTest2500');
        console.log('   Password: admin123');
        console.log(`\n📊 Company Details:`);
        console.log(`   Company ID: ${empresaId}`);
        console.log(`   Company Name: Empresa Stress Test 2500`);
        console.log(`   Products: 2500`);
        console.log(`   Plan: Empresarial (max 5000 products)`);
        console.log('\n🌐 Access at: https://pos-torlan.web.app');
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n❌ Error during seed:', error);
        if (connection) {
            await connection.rollback();
            console.log('🔄 Transaction rolled back');
        }
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            console.log('\n🔌 Database connection closed');
        }
    }
}

// Run the seed
console.log('\n' + '='.repeat(60));
console.log('🚀 TORLAN POS - STRESS TEST SEED (2500 Products)');
console.log('='.repeat(60) + '\n');

seedStressTestCompany()
    .then(() => {
        console.log('\n✅ Seed completed successfully!\n');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    });
