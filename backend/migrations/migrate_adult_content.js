import pool from '../database/db.js';

export async function migrateAdultContent() {
    let connection;
    try {
        connection = await pool.getConnection();

        // 1. Check if is_adult column exists in products table
        const [columns] = await connection.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'products' 
            AND COLUMN_NAME = 'is_adult'
        `);

        if (columns.length === 0) {
            console.log('🔄 Migrating: Adding is_adult column to products table...');

            // Add the column
            await connection.query(`
                ALTER TABLE products 
                ADD COLUMN is_adult BOOLEAN DEFAULT FALSE
            `);

            console.log('✅ Column is_adult added successfully');

            // 2. Perform data migration: update existing adult content based on category
            // "Doujinshi" "Manga Hentai" "Revista Hentai"
            console.log('🔄 Migrating: Updating existing adult products flag...');

            const [updateResult] = await connection.query(`
                UPDATE products 
                SET is_adult = TRUE 
                WHERE category IN ('Doujinshi', 'Manga Hentai', 'Revista Hentai')
            `);

            console.log(`✅ Existing adult products updated (Rows affected: ${updateResult.affectedRows || 0})`);
        } else {
            console.log('✅ is_adult column already exists in products table, skipping migration.');
        }

    } catch (error) {
        console.error('❌ Error in migrateAdultContent:', error);
        throw error; // Re-throw to be caught by startup.js
    } finally {
        if (connection) {
            connection.release();
        }
    }
}
