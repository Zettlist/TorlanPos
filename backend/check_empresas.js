import pool from './database/db.js';

async function listEmpresas() {
    try {
        console.log('🔍 Listing Companies...');
        const [rows] = await pool.query("SELECT id, nombre_empresa, estado, plan_contratado FROM empresas");
        console.table(rows);
    } catch (error) {
        console.error('❌ Error listing companies:', error);
    } finally {
        await pool.end();
    }
}

listEmpresas();
