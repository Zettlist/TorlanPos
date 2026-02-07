import pool from '../database/db.js';

async function migrateUsersUniqueness() {
    console.log('🔄 Starting migration: Update users uniqueness constraint...');
    const connection = await pool.getConnection();

    try {
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');

        // 1. Identify constraint/index names
        const [indexes] = await connection.query(`
            SELECT INDEX_NAME 
            FROM INFORMATION_SCHEMA.STATISTICS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'users' 
            AND COLUMN_NAME = 'username' 
            AND NON_UNIQUE = 0
        `);

        console.log('📊 Found unique indexes on username:', indexes.map(i => i.INDEX_NAME));

        // 2. Drop existing unique indexes on username
        for (const idx of indexes) {
            if (idx.INDEX_NAME !== 'PRIMARY') {
                console.log(`- Dropping index: ${idx.INDEX_NAME}`);
                await connection.query(`ALTER TABLE users DROP INDEX ${idx.INDEX_NAME}`);
            }
        }

        // 3. Add new composite unique index
        console.log('+ Adding new UNIQUE(username, empresa_id) constraint');
        await connection.query(`
            ALTER TABLE users 
            ADD UNIQUE INDEX unique_username_empresa (username, empresa_id)
        `);

        // 4. Also ensure simple index on username exists for fast login lookups (since we dropped the unique one)
        // Check if a non-unique index already exists
        const [simpleIndex] = await connection.query(`
            SELECT INDEX_NAME 
            FROM INFORMATION_SCHEMA.STATISTICS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'users' 
            AND COLUMN_NAME = 'username' 
            AND INDEX_NAME = 'idx_username'
        `);

        if (simpleIndex.length === 0) {
            console.log('+ Adding standard index for login lookups');
            await connection.query('CREATE INDEX idx_username ON users(username)');
        }

        console.log('✅ Migration completed successfully');

    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        connection.release();
        process.exit();
    }
}

migrateUsersUniqueness();
