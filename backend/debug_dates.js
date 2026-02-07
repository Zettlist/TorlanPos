import { prepare, initDatabase } from './database/db.js';

async function checkDates() {
    await initDatabase();

    console.log('--- Timezone Debug ---');
    const timeTest = prepare("SELECT datetime('now') as utc, datetime('now', 'localtime') as local").get();
    console.log('SQLite Now:', timeTest);

    const jsDate = new Date();
    console.log('JS Date:', jsDate.toString());
    console.log('JS ISO:', jsDate.toISOString());
    console.log('JS Local Components:',
        jsDate.getFullYear(),
        jsDate.getMonth() + 1,
        jsDate.getDate()
    );

    console.log('\n--- Recent Sales ---');
    const sales = prepare(`
        SELECT 
            id, 
            total, 
            created_at, 
            DATE(created_at) as date_utc,
            DATE(created_at, 'localtime') as date_local
        FROM sales 
        ORDER BY id DESC 
        LIMIT 5
    `).all();
    console.table(sales);

    console.log('\n--- Test Query Match ---');
    const todayStr = jsDate.getFullYear() + '-' + String(jsDate.getMonth() + 1).padStart(2, '0') + '-' + String(jsDate.getDate()).padStart(2, '0');
    console.log('Searching for Local Date:', todayStr);

    const count = prepare(`
        SELECT COUNT(*) as c 
        FROM sales 
        WHERE DATE(created_at, 'localtime') = ?
    `).get(todayStr);
    console.log('Matching Sales Count:', count.c);
}

checkDates();
