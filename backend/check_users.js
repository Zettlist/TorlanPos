import { prepare, initDatabase } from './database/db.js';

async function checkUsers() {
    await initDatabase();

    console.log('--- Users ---');
    const users = prepare('SELECT id, username, empresa_id, role FROM users').all();
    console.table(users);
}

checkUsers();
