import pool from './database/db.js';

console.log('🧹 Cleaning up test data...\n');

try {
    // Delete in correct order to respect foreign keys
    await pool.execute('DELETE FROM products WHERE empresa_id IN (SELECT id FROM empresas WHERE nombre_empresa LIKE "Empresa Stress Test%")');
    console.log('✓ Products deleted');

    await pool.execute('DELETE FROM users WHERE empresa_id IN (SELECT id FROM empresas WHERE nombre_empresa LIKE "Empresa Stress Test%")');
    console.log('✓ Users deleted');

    await pool.execute('DELETE FROM empresas WHERE nombre_empresa LIKE "Empresa Stress Test%"');
    console.log('✓ Companies deleted');

    console.log('\n✅ Cleanup completed successfully!\n');
} catch (error) {
    console.error('❌ Error during cleanup:', error);
} finally {
    await pool.end();
}
