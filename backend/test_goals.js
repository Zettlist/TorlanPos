
// import fetch from 'node-fetch'; // Not needed in Node 18+
import db, { initDatabase } from './database/db.js';

// Reuse logic from login script or hardcode admin token if possible.
// Actually, let's just use the DB directly to check the "Before" state, 
// then hit the endpoint (LOGIN FIRST to get token), then check "After".

async function runTest() {
    console.log('--- STARTING PERSISTENCE TEST ---');

    // 1. Login to get token
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'TorlanAdmin', password: 'Ragnarok1!' })
    });

    if (!loginRes.ok) {
        console.error('Login Failed:', await loginRes.text());
        return;
    }

    const { token } = await loginRes.json();
    console.log('Login Successful. Token received.');

    // 0. Check DB State First
    await initDatabase();
    console.log('--- USERS ---');
    const users = db.prepare("SELECT id, username, role, empresa_id FROM users").all();
    console.table(users);

    console.log('--- BUSINESS SETTINGS ---');
    const settings = db.prepare("SELECT * FROM business_settings").all();
    console.table(settings);

    // 1. Login to get token
    const targetPayload = { weekly_target: 55000, monthly_target: 120000 };

    console.log('Sending PUT /api/sales/goals with:', targetPayload);
    const updateRes = await fetch('http://localhost:3001/api/sales/goals', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(targetPayload)
    });

    if (updateRes.ok) {
        console.log('Update Response: OK');
    } else {
        console.error('Update Failed:', await updateRes.text());
    }

    // 3. Check DB State After
    console.log('Checking database content...');
    // We need to know the empresa_id for TorlanAdmin.
    // Let's check the user first
    const adminUser = db.prepare("SELECT * FROM users WHERE username = 'TorlanAdmin'").get();
    console.log('Admin User Info:', adminUser);

    // If admin has no empresa_id, the PUT might fail (logic says: if !empresaId return 403).
    // EXCEPT if Global Admin logic handles it? 
    // In `sales.js`: `const empresaId = getEmpresaId(req);`
    // If Global Admin, getEmpresaId usually returns the managed empresa or null?
    // Let's see `auth.js`. 

    console.log('--- BUSINESS SETTINGS AFTER ---');
    const settingsAfter = db.prepare("SELECT * FROM business_settings").all();
    console.table(settingsAfter);

    console.log('--- TEST COMPLETE ---');
}

runTest();
