import dbHelpers, { initDatabase } from './database/db.js';

console.log('🔍 Inspecting database for empresas...\n');

// Initialize DB first
await initDatabase();

try {
    // Query all empresas
    const empresas = dbHelpers.prepare('SELECT * FROM empresas ORDER BY id').all();

    console.log(`Found ${empresas.length} empresa(s):\n`);

    empresas.forEach(emp => {
        console.log(`ID: ${emp.id}`);
        console.log(`Name: ${emp.nombre_empresa}`);
        console.log(`Plan: ${emp.plan_contratado}`);
        console.log(`Status: ${emp.estado}`);
        console.log(`Registered: ${emp.fecha_registro}`);
        console.log('---');
    });

    // Check specifically for ID 99
    const testEmpresa = dbHelpers.prepare('SELECT * FROM empresas WHERE id = 99').get();

    if (testEmpresa) {
        console.log('\n✅ Empresa ID 99 EXISTS in database!');

        // Count users for this empresa
        const userCount = dbHelpers.prepare('SELECT COUNT(*) as count FROM users WHERE empresa_id = 99').get();
        console.log(`   Users for empresa 99: ${userCount.count}`);

        // Count products
        const productCount = dbHelpers.prepare('SELECT COUNT(*) as count FROM products WHERE empresa_id = 99').get();
        console.log(`   Products for empresa 99: ${productCount.count}`);

        // Count sales
        const salesCount = dbHelpers.prepare('SELECT COUNT(*) as count FROM sales WHERE empresa_id = 99').get();
        console.log(`   Sales for empresa 99: ${salesCount.count}`);
    } else {
        console.log('\n❌ Empresa ID 99 NOT FOUND in database!');
        console.log('   The seed script may have failed or written to a different database file.');
    }

} catch (error) {
    console.error('❌ Database query error:', error.message);
}
