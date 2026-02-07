import pool from '../database/db.js';

console.log('🔧 Starting database migration: Add categories and publishers lookup tables\n');

async function migrate() {
    try {
        // 1. Create categories table
        console.log('📦 Creating categories table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS categories (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_name (name)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✓ Categories table created\n');

        // 2. Create publishers table
        console.log('📚 Creating publishers table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS publishers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_name (name)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✓ Publishers table created\n');

        // 3. Populate categories from existing products
        console.log('🔄 Populating categories from existing products...');
        await pool.query(`
            INSERT IGNORE INTO categories (name)
            SELECT DISTINCT category 
            FROM products 
            WHERE category IS NOT NULL AND category != ''
        `);
        const [catCount] = await pool.query('SELECT COUNT(*) as count FROM categories');
        console.log(`✓ ${catCount[0].count} categories imported\n`);

        // 4. Populate publishers from existing products
        console.log('🔄 Populating publishers from existing products...');
        await pool.query(`
            INSERT IGNORE INTO publishers (name)
            SELECT DISTINCT publisher 
            FROM products 
            WHERE publisher IS NOT NULL AND publisher != ''
        `);
        const [pubCount] = await pool.query('SELECT COUNT(*) as count FROM publishers');
        console.log(`✓ ${pubCount[0].count} publishers imported\n`);

        // 5. Add new columns to products table
        console.log('🔧 Adding category_id and publisher_id columns to products...');

        // Check if columns already exist
        const [columns] = await pool.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'products' 
            AND COLUMN_NAME IN ('category_id', 'publisher_id')
        `);

        const existingColumns = columns.map(c => c.COLUMN_NAME);

        if (!existingColumns.includes('category_id')) {
            await pool.query(`
                ALTER TABLE products 
                ADD COLUMN category_id INT NULL AFTER category
            `);
            console.log('✓ category_id column added');
        } else {
            console.log('✓ category_id column already exists');
        }

        if (!existingColumns.includes('publisher_id')) {
            await pool.query(`
                ALTER TABLE products 
                ADD COLUMN publisher_id INT NULL AFTER publisher
            `);
            console.log('✓ publisher_id column added');
        } else {
            console.log('✓ publisher_id column already exists');
        }
        console.log();

        // 6. Link existing products to category IDs
        console.log('🔗 Linking products to category IDs...');
        const [catUpdated] = await pool.query(`
            UPDATE products p
            INNER JOIN categories c ON p.category = c.name
            SET p.category_id = c.id
            WHERE p.category IS NOT NULL AND p.category != ''
        `);
        console.log(`✓ ${catUpdated.affectedRows} products linked to categories\n`);

        // 7. Link existing products to publisher IDs
        console.log('🔗 Linking products to publisher IDs...');
        const [pubUpdated] = await pool.query(`
            UPDATE products p
            INNER JOIN publishers pub ON p.publisher = pub.name
            SET p.publisher_id = pub.id
            WHERE p.publisher IS NOT NULL AND p.publisher != ''
        `);
        console.log(`✓ ${pubUpdated.affectedRows} products linked to publishers\n`);

        // 8. Add foreign key constraints
        console.log('🔐 Adding foreign key constraints...');

        // Check if foreign keys already exist
        const [fks] = await pool.query(`
            SELECT CONSTRAINT_NAME 
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'products' 
            AND CONSTRAINT_NAME IN ('fk_products_category', 'fk_products_publisher')
        `);

        const existingFKs = fks.map(fk => fk.CONSTRAINT_NAME);

        if (!existingFKs.includes('fk_products_category')) {
            await pool.query(`
                ALTER TABLE products 
                ADD CONSTRAINT fk_products_category 
                FOREIGN KEY (category_id) REFERENCES categories(id)
            `);
            console.log('✓ Category foreign key added');
        } else {
            console.log('✓ Category foreign key already exists');
        }

        if (!existingFKs.includes('fk_products_publisher')) {
            await pool.query(`
                ALTER TABLE products 
                ADD CONSTRAINT fk_products_publisher 
                FOREIGN KEY (publisher_id) REFERENCES publishers(id)
            `);
            console.log('✓ Publisher foreign key added');
        } else {
            console.log('✓ Publisher foreign key already exists');
        }
        console.log();

        console.log('✅ Migration completed successfully!\n');

        // Summary
        console.log('📊 Summary:');
        console.log(`   Categories: ${catCount[0].count}`);
        console.log(`   Publishers: ${pubCount[0].count}`);
        console.log(`   Products with category_id: ${catUpdated.affectedRows}`);
        console.log(`   Products with publisher_id: ${pubUpdated.affectedRows}`);

    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

// Run migration
migrate()
    .then(() => {
        console.log('\n🎉 Migration script completed!');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n💥 Fatal error:', error);
        process.exit(1);
    });
