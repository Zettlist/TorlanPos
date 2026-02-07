
export async function migrateProductImage(connection) {
    try {
        console.log('🔄 Checking for image_url column in products...');

        const [columns] = await connection.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'products' 
            AND COLUMN_NAME = 'image_url'
        `);

        if (columns.length === 0) {
            console.log('⚠️ Migration needed: Add image_url to products');

            await connection.query(`
                ALTER TABLE products 
                ADD COLUMN image_url TEXT NULL AFTER name
            `);
            console.log('+ Added image_url column');
        } else {
            console.log('✅ Schema is up to date (image_url).');
        }

    } catch (error) {
        console.error('❌ Product Image Migration failed:', error);
    }
}
