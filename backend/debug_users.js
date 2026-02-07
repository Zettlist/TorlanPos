import dbHelpers, { initDatabase } from './database/db.js';

await initDatabase();

console.log('=== USERS ===');
const users = dbHelpers.prepare('SELECT id, username, empresa_id, role, is_admin, first_login FROM users').all();
console.table(users);

console.log('\n=== EMPRESAS ===');
const empresas = dbHelpers.prepare('SELECT id, nombre_empresa, plan_contratado, estado FROM empresas').all();
console.table(empresas);
