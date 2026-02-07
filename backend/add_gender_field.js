import mysql from 'mysql2/promise';

async function addGenderField() {
    const pool = mysql.createPool({
        host: '127.0.0.1',
        port: 3308,
        user: 'torlan_user',
        password: 'rUJJkcUfzloxoxzQVPH3MKK1',
        database: 'torlan_pos',
    });

    try {
        // Check if gender column exists
        const [columns] = await pool.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = 'torlan_pos' 
            AND TABLE_NAME = 'products' 
            AND COLUMN_NAME = 'gender'
        `);

        if (columns.length === 0) {
            console.log('Adding gender column to products table...');
            await pool.query(`
                ALTER TABLE products 
                ADD COLUMN gender VARCHAR(50) DEFAULT NULL AFTER category
            `);
            console.log('✅ Gender column added successfully');
        } else {
            console.log('✅ Gender column already exists');
        }

        // Show current structure
        const [describe] = await pool.query('DESCRIBE products');
        console.log('\nCurrent products table structure:');
        console.table(describe);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await pool.end();
    }
}

addGenderField();
