import pool from '../database/db.js';

export async function migrateEmployeeNumber(connection) {
    try {
        // Check if column exists
        const [columns] = await connection.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'users' 
            AND COLUMN_NAME = 'employee_number'
        `);

        if (columns.length === 0) {
            console.log('⚠️ Migration needed: Add employee_number to users');

            await connection.query(`
                ALTER TABLE users 
                ADD COLUMN employee_number VARCHAR(50) NULL AFTER username
            `);
            console.log('+ Added employee_number column');

            // Add unique index (per empresa)
            await connection.query(`
                ALTER TABLE users 
                ADD UNIQUE INDEX unique_employee_number_empresa (employee_number, empresa_id)
            `);
            console.log('+ Added UNIQUE(employee_number, empresa_id) index');

        } else {
            console.log('✅ Schema is up to date (employee_number).');
        }

    } catch (error) {
        console.error('❌ Employee Number Migration failed:', error);
        throw error;
    }
}
