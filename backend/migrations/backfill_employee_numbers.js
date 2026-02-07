import pool from '../database/db.js';

// Helper to generate a random 5-digit string "10000" to "99999"
function generateRandomPin() {
    return Math.floor(10000 + Math.random() * 90000).toString();
}

export async function backfillEmployeeNumbers(connection) {
    try {
        console.log('🔄 Checking for users without employee numbers...');

        // 1. Get users with NULL employee_number
        const [users] = await connection.query(`
            SELECT id, username, empresa_id 
            FROM users 
            WHERE employee_number IS NULL OR employee_number = ''
        `);

        if (users.length === 0) {
            console.log('✅ All users have employee numbers.');
            return;
        }

        console.log(`⚠️ Found ${users.length} users needing employee numbers.`);
        console.log('🎲 Generating unique random PINs (5-digits)...');

        for (const user of users) {
            let pin = generateRandomPin();
            let isUnique = false;
            let attempts = 0;

            // Ensure uniqueness within empresa
            while (!isUnique && attempts < 10) {
                let query = 'SELECT id FROM users WHERE employee_number = ? AND empresa_id = ?';
                let params = [pin, user.empresa_id];

                if (!user.empresa_id) {
                    query = 'SELECT id FROM users WHERE employee_number = ? AND empresa_id IS NULL';
                    params = [pin];
                }

                const [existing] = await connection.query(query, params);
                if (existing.length === 0) {
                    isUnique = true;
                } else {
                    pin = generateRandomPin(); // Retry
                    attempts++;
                }
            }

            if (isUnique) {
                await connection.query('UPDATE users SET employee_number = ? WHERE id = ?', [pin, user.id]);
                console.log(`   > Assigned ${pin} to ${user.username}`);
            } else {
                console.error(`❌ Could not generate unique PIN for user ${user.username} after 10 attempts.`);
            }
        }

        console.log('✅ Backfill completed.');

    } catch (error) {
        console.error('❌ Backfill failed:', error);
    }
}
