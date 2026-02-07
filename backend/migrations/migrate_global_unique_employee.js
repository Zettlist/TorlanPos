import pool from '../database/db.js';

// Helper to generate a random 5-digit string
function generateRandomPin() {
    return Math.floor(10000 + Math.random() * 90000).toString();
}

export async function migrateGlobalUniqueEmployee(connection) {
    try {
        console.log('🔄 Checking global uniqueness for employee numbers...');

        // 1. Check for duplicates globally
        const [duplicates] = await connection.query(`
            SELECT employee_number, COUNT(*) as count 
            FROM users 
            WHERE employee_number IS NOT NULL 
            GROUP BY employee_number 
            HAVING count > 1
        `);

        if (duplicates.length > 0) {
            console.log(`⚠️ Found ${duplicates.length} duplicate employee numbers. Resolving...`);

            for (const dup of duplicates) {
                const [users] = await connection.query('SELECT id, username FROM users WHERE employee_number = ?', [dup.employee_number]);

                // Skip the first one, update the rest
                for (let i = 1; i < users.length; i++) {
                    const user = users[i];
                    let newPin = generateRandomPin();
                    let isUnique = false;

                    // Find a globally unique pin
                    while (!isUnique) {
                        const [check] = await connection.query('SELECT id FROM users WHERE employee_number = ?', [newPin]);
                        if (check.length === 0) isUnique = true;
                        else newPin = generateRandomPin();
                    }

                    await connection.query('UPDATE users SET employee_number = ? WHERE id = ?', [newPin, user.id]);
                    console.log(`   > Re-assigned ${newPin} to user ${user.username} (was duplicate)`);
                }
            }
        }

        // 2. Drop old per-company index if exists
        const [oldIndex] = await connection.query(`
            SELECT INDEX_NAME 
            FROM INFORMATION_SCHEMA.STATISTICS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'users' 
            AND INDEX_NAME = 'unique_employee_number_empresa'
        `);

        if (oldIndex.length > 0) {
            await connection.query('ALTER TABLE users DROP INDEX unique_employee_number_empresa');
            console.log('- Dropped old per-company index');
        }

        // 3. Add new Global Unique Index
        const [newIndex] = await connection.query(`
            SELECT INDEX_NAME 
            FROM INFORMATION_SCHEMA.STATISTICS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'users' 
            AND INDEX_NAME = 'unique_employee_number_global'
        `);

        if (newIndex.length === 0) {
            await connection.query('ALTER TABLE users ADD UNIQUE INDEX unique_employee_number_global (employee_number)');
            console.log('+ Added GLOBAL UNIQUE index on employee_number');
        } else {
            console.log('✅ Global unique index already exists');
        }

    } catch (error) {
        console.error('❌ Global Unique Migration failed:', error);
        throw error;
    }
}
