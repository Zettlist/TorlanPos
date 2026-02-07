import 'dotenv/config';
import pool from '../database/db.js';

async function backfillEmployeeNumbers() {
    console.log('Starting backfill of employee numbers...');
    try {
        const [users] = await pool.query('SELECT id, username FROM users WHERE employee_number IS NULL OR employee_number = ""');

        console.log(`Found ${users.length} users with missing employee numbers.`);

        for (const user of users) {
            let isUnique = false;
            let employee_number = null;
            let attempts = 0;

            while (!isUnique && attempts < 10) {
                const pin = Math.floor(10000 + Math.random() * 90000).toString();
                const [existing] = await pool.query('SELECT id FROM users WHERE employee_number = ?', [pin]);
                if (existing.length === 0) {
                    employee_number = pin;
                    isUnique = true;
                }
                attempts++;
            }

            if (employee_number) {
                await pool.query('UPDATE users SET employee_number = ? WHERE id = ?', [employee_number, user.id]);
                console.log(`Updated user ${user.username} (ID: ${user.id}) with employee # ${employee_number}`);
            } else {
                console.warn(`Failed to generate unique number for user ${user.username} after 10 attempts`);
            }
        }

        console.log('Backfill complete.');
        process.exit(0);
    } catch (error) {
        console.error('Backfill error:', error);
        process.exit(1);
    }
}

backfillEmployeeNumbers();
