import pool from './database/db.js';

async function checkSettings() {
    try {
        console.log('Checking business_settings table...');
        const [rows] = await pool.query('SELECT * FROM business_settings');
        console.log('Total settings found:', rows.length);
        console.table(rows);

        const [users] = await pool.query('SELECT id, username, empresa_id FROM users');
        console.log('\nUsers:');
        console.table(users);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkSettings();
