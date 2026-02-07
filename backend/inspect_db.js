
import db, { initDatabase } from './database/db.js';

async function inspect() {
    console.log('--- STARTING DB INSPECTION ---');
    try {
        await initDatabase();
        console.log('DB Initialized.');

        console.log('--- USERS ---');
        const users = db.prepare("SELECT id, username, role, empresa_id FROM users").all();
        console.table(users);

        console.log('--- BUSINESS SETTINGS ---');
        const settings = db.prepare("SELECT * FROM business_settings").all();
        console.table(settings);
    } catch (e) {
        console.error('Inspection failed:', e);
    }
}

inspect();
