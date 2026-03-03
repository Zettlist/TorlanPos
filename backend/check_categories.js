import pool from './database/db.js';

async function checkCategories() {
    try {
        // Find empresa Bisonte
        const [empresas] = await pool.query(
            "SELECT id, nombre_empresa FROM empresas WHERE nombre_empresa LIKE '%bisonte%' OR nombre_empresa LIKE '%Bisonte%'"
        );
        console.log('🏢 Empresas encontradas:', empresas);

        if (empresas.length === 0) {
            console.log('No se encontró ninguna empresa Bisonte');
            await pool.end();
            return;
        }

        const empresaId = empresas[0].id;
        console.log(`\n📦 Categorías de "${empresas[0].nombre_empresa}" (ID: ${empresaId}):\n`);

        // Get distinct categories from products
        const [categories] = await pool.query(
            `SELECT DISTINCT category, COUNT(*) as total_productos
             FROM products
             WHERE empresa_id = ? AND category IS NOT NULL AND category != ''
             GROUP BY category
             ORDER BY total_productos DESC`,
            [empresaId]
        );

        console.table(categories);
        console.log(`\nTotal de categorías: ${categories.length}`);

        await pool.end();
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

checkCategories();
