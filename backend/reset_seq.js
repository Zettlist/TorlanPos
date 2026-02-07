import db, { initDatabase, saveDatabase } from './database/db.js';

async function resetSequence() {
    await initDatabase();

    // Check max ID
    const max = db.prepare('SELECT MAX(id) as maxId FROM empresas').get();
    const activeId = max.maxId || 0;

    console.log(`🆔 ID Actual Activo: ${activeId}`);

    // Reset sequence to current max
    db.exec(`UPDATE sqlite_sequence SET seq = ${activeId} WHERE name = 'empresas'`);
    saveDatabase();

    console.log(`✅ Secuencia autoincrement restablecida a ${activeId}`);

    // Verify
    const verify = db.prepare("SELECT * FROM sqlite_sequence WHERE name='empresas'").get();
    console.log('📊 Estado Final:', verify);
}

resetSequence();
