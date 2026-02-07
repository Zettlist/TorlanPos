import { prepare, initDatabase } from './database/db.js';

// EXACT COPY of logic from backend/routes/sales.js
function getMexicoCityDate() {
    const now = new Date();
    // Shift time back by 4 hours so that 00:00-03:59 counts as previous day
    now.setHours(now.getHours() - 4);

    // Use Intl to get parts in correct timezone
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
    process.env.TZ = 'America/Mexico_City';
    await initDatabase();

    const empresaId = 12; // Javi's company
    const todayStr = getMexicoCityDate();

    console.log('--- TEST LOGIC EXECUTION ---');
    console.log('Server Time:', new Date().toString());
    console.log('Calculated Business Date:', todayStr);

    // 1. Check raw recent sales
    const raw = prepare('SELECT created_at FROM sales ORDER BY id DESC LIMIT 3').all();
    console.log('Recent Sales (Raw UTC):', raw);

    // 2. Check -10 hours projection
    const projected = prepare(`
        SELECT 
            id, 
            created_at, 
            DATE(created_at, '-10 hours') as business_date 
        FROM sales 
        WHERE empresa_id = ? 
        ORDER BY id DESC LIMIT 3
    `).all(empresaId);
    console.table(projected);

    // 3. Execute "Today" Query
    const todaySales = prepare(`
        SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
        FROM sales 
        WHERE empresa_id = ? AND DATE(created_at, '-10 hours') = ?
    `).get(empresaId, todayStr);
    console.log('Today Sales Query Result:', todaySales);

    // 4. Verify Week/Month Start Logic
    const mxDate = new Date(todayStr + 'T12:00:00');
    const monthStart = new Date(mxDate.getFullYear(), mxDate.getMonth(), 1);
    const monthStartStr = monthStart.toISOString().split('T')[0];
    console.log('Month Start Str:', monthStartStr);

    const monthSales = prepare(`
        SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
        FROM sales 
        WHERE empresa_id = ? AND DATE(created_at, '-10 hours') >= ?
    `).get(empresaId, monthStartStr);
    console.log('Month Sales Query Result:', monthSales);
}

runTest();
