import { prepare, initDatabase } from './database/db.js';

// Helper matching sales.js
function getMexicoCityDate() {
    // Rely on process.env.TZ = 'America/Mexico_City' if set, or force it
    // But sales.js uses Intl, which is safe
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('es-MX', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = formatter.formatToParts(now);
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const d = parts.find(p => p.type === 'day').value;
    return `${y}-${m}-${d}`;
}

async function runTest() {
    process.env.TZ = 'America/Mexico_City'; // Validate environment force
    await initDatabase();

    console.log('--- DIAGNOSTIC START ---');
    console.log('Server Time (New Date):', new Date().toString());
    console.log('Calculated Mexico City Date (Target):', getMexicoCityDate());

    // Check recent sales
    console.log('\n--- Recent Sales (Raw & Shifted) ---');
    const recent = prepare(`
        SELECT 
            id, 
            total, 
            empresa_id,
            created_at as raw_utc, 
            DATE(created_at, '-06:00') as shifted_mx_date
        FROM sales 
        ORDER BY id DESC 
        LIMIT 5
    `).all();
    console.table(recent);

    // Simulate Dashboard Query
    const empresaId = 12; // Hardcoded for Bisonte Manga based on previous checks
    const todayStr = getMexicoCityDate();

    console.log(`\n--- Querying for Empresa ${empresaId} on Date ${todayStr} ---`);
    const stats = prepare(`
        SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
        FROM sales 
        WHERE empresa_id = ? AND DATE(created_at, '-06:00') = ?
    `).get(empresaId, todayStr);

    console.log('DASHBOARD RESULT:', stats);

    if (stats.total === 0 && recent.length > 0) {
        console.log('\n❌ MISMATCH DETECTED!');
        console.log(`The Dashboard is looking for ${todayStr}, but recent sales are mapped to ${recent[0]?.shifted_mx_date}.`);
        console.log('This confirms the "Midnight Crossing" or "Timezone" issue.');
    } else {
        console.log('\n✅ Data matches query expectations.');
    }
}

runTest();
