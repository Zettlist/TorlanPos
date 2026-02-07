
// import fetch from 'node-fetch'; // Removed
// const fetch = global.fetch; 
import db, { initDatabase, saveDatabase } from './database/db.js';
import bcrypt from 'bcryptjs';

async function setupAndTest() {
    console.log('--- SETUP TEST USER ---');
    await initDatabase();

    // 1. Create ManagerTest - SKIPPED (Already done, protecting sync)
    // const existing = db.prepare("SELECT id FROM users WHERE username = 'ManagerTest'").get();
    // const hash = bcrypt.hashSync('test1234', 10);
    // if (!existing) {
    //     db.prepare(`
    //         INSERT INTO users (username, password_hash, role, empresa_id, is_admin)
    //         VALUES (?, ?, 'empresa_admin', 12, 0)
    //     `).run('ManagerTest', hash);
    //     console.log('Created ManagerTest user.');
    // } else {
    //     console.log('ManagerTest already exists. Updating password...');
    //     db.prepare("UPDATE users SET password_hash = ? WHERE username = 'ManagerTest'").run(hash);
    // }

    // 2. Login as ManagerTest
    // Need backend running!
    try {
        const loginRes = await fetch('http://localhost:3001/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'ManagerTest', password: 'test1234' })
        });

        if (!loginRes.ok) throw new Error(await loginRes.text());
        const { token } = await loginRes.json();
        console.log('Login OK.');

        // 3. GET Goals
        const goalsRes = await fetch('http://localhost:3001/api/sales/goals', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const goals = await goalsRes.json();
        console.log('GET /goals response:', JSON.stringify(goals, null, 2));

    } catch (e) {
        console.error('Test failed (Backend likely down):', e.message);
    }
}

setupAndTest();
