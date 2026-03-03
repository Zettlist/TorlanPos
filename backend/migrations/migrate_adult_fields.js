import pool from '../database/db.js';

async function migrateAdultFields() {
    try {
        console.log('--- Starting Adult Fields & Product Types Migration ---');

        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // 1. Add artist and group_name columns
            const [columns] = await connection.query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'artist'
            `);

            if (columns.length === 0) {
                console.log('Adding artist and group_name columns...');
                await connection.query(`ALTER TABLE products ADD COLUMN artist VARCHAR(255) DEFAULT NULL`);
                await connection.query(`ALTER TABLE products ADD COLUMN group_name VARCHAR(255) DEFAULT NULL`);
            } else {
                console.log('Columns "artist" and "group_name" already exist, skipping ALTER TABLE.');
            }

            // 2. Removed non-existent product_type column update.

            await connection.commit();
            console.log('✅ Adult fields & Product Types migration completed successfully');
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
}

export default migrateAdultFields;
