import pool from '../database/db.js';

import { migrateEmployeeNumber } from './migrate_employee_number.js';
import { backfillEmployeeNumbers } from './backfill_employee_numbers.js';
import { migrateGlobalUniqueEmployee } from './migrate_global_unique_employee.js';
import { migrateProductImage } from './migrate_product_image.js';
import { migrate_anticipos } from './migrate_anticipos.js';
import { migrateProductSuppliers } from './migrate_product_suppliers.js';
import { migrateTags } from './migrate_tags.js';
import { migrateAdultContent } from './migrate_adult_content.js';
import migrateAdultFields from './migrate_adult_fields.js';

export async function runSchemaMigrations() {
    console.log('🔄 Checking database schema migrations...');
    const connection = await pool.getConnection();

    try {
        // 1. Run Employee Number Migration (Schema)
        await migrateEmployeeNumber(connection);

        // 2. Run Data Backfill (Random PINs)
        await backfillEmployeeNumbers(connection);

        // 3. Enforce Global Uniqueness
        await migrateGlobalUniqueEmployee(connection);

        // 4. Add Product Image Column
        await migrateProductImage(connection);

        // 5. Anticipos Module Tables
        await migrate_anticipos();

        // 6. Product Suppliers Columns
        await migrateProductSuppliers(connection);

        // 8. Tags system tables
        await migrateTags(connection);

        // 9. Adult Content flag
        await migrateAdultContent(connection);

        // 10. Check if we need to migrate users table (UNIQUE constraint)
        // We check if the 'unique_username_empresa' index exists. If not, we run the migration.
        const [existingIndex] = await connection.query(`
            SELECT INDEX_NAME 
            FROM INFORMATION_SCHEMA.STATISTICS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'users' 
            AND INDEX_NAME = 'unique_username_empresa'
        `);

        if (existingIndex.length === 0) {
            console.log('⚠️ Migration needed: Update users uniqueness to (username, empresa_id)');

            await connection.query('SET FOREIGN_KEY_CHECKS = 0');

            // Drop old unique indexes on username
            const [indexes] = await connection.query(`
                SELECT INDEX_NAME 
                FROM INFORMATION_SCHEMA.STATISTICS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'users' 
                AND COLUMN_NAME = 'username' 
                AND NON_UNIQUE = 0
            `);

            for (const idx of indexes) {
                if (idx.INDEX_NAME !== 'PRIMARY') {
                    console.log(`- Dropping index: ${idx.INDEX_NAME}`);
                    await connection.query(`ALTER TABLE users DROP INDEX ${idx.INDEX_NAME}`);
                }
            }

            // Add new composite unique index
            console.log('+ Adding UNIQUE(username, empresa_id)');
            await connection.query(`
                ALTER TABLE users 
                ADD UNIQUE INDEX unique_username_empresa (username, empresa_id)
            `);

            // Add standard index for performance
            const [simpleIndex] = await connection.query(`
                SELECT INDEX_NAME 
                FROM INFORMATION_SCHEMA.STATISTICS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'users' 
                AND COLUMN_NAME = 'username' 
                AND INDEX_NAME = 'idx_username'
            `);
            if (simpleIndex.length === 0) {
                console.log('+ Adding index idx_username');
                await connection.query('CREATE INDEX idx_username ON users(username)');
            }

            await connection.query('SET FOREIGN_KEY_CHECKS = 1');
            console.log('✅ Users uniqueness migration applied.');
        } else {
            console.log('✅ Schema is up to date (users uniqueness).');
        }

        // 7. Performance indexes (composite) — idempotent, safe to run every boot
        await migratePerformanceIndexes(connection);

        // 12. Adult Content Fields
        console.log('Running adult fields migration...');
        await migrateAdultFields(connection);

    } catch (error) {
        console.error('❌ Schema Migrations failed:', error);
        // Don't kill process, maybe DB is just starting up or other issue
    } finally {
        connection.release();
    }
}

async function migratePerformanceIndexes(connection) {
    // List of [table, indexName, columns] to ensure exist
    const indexes = [
        ['sales', 'idx_empresa_created', '(empresa_id, created_at)'],
        ['cash_sessions', 'idx_empresa_user_status', '(empresa_id, user_id, status)'],
        ['products', 'idx_empresa_name', '(empresa_id, name)'],
        ['products', 'idx_empresa_sbin', '(empresa_id, sbin_code)'],
        ['sale_items', 'idx_sale_product', '(sale_id, product_id)'],
    ];

    let added = 0;
    for (const [table, indexName, columns] of indexes) {
        const [existing] = await connection.query(
            `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
            [table, indexName]
        );
        if (existing.length === 0) {
            await connection.query(`ALTER TABLE ${table} ADD INDEX ${indexName} ${columns}`);
            console.log(`  ✅ Added index ${indexName} on ${table}`);
            added++;
        }
    }
    if (added === 0) {
        console.log('✅ Performance indexes already up to date.');
    } else {
        console.log(`✅ Added ${added} performance index(es).`);
    }
}
