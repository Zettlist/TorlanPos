// Quick verification script to check seeded data
import pool from './database/db.js';

async function verify() {
    console.log('🔍 Verifying Test Data...\n');

    // Check empresa
    const [empresas] = await pool.query("SELECT * FROM empresas WHERE nombre_empresa = 'Bisonte Test Lab'");
    console.log('📦 Empresa:', empresas[0]);

    // Check users
    const [users] = await pool.query("SELECT id, username, role, empresa_id FROM users WHERE empresa_id = ?", [empresas[0].id]);
    console.log('\n👥 Users:', users);

    // Check user features
    const [features] = await pool.query(`
        SELECT u.username, f.name, uf.is_enabled 
        FROM user_features uf
        JOIN users u ON uf.user_id = u.id
        JOIN features f ON uf.feature_id = f.id
        WHERE u.empresa_id = ?
    `, [empresas[0].id]);
    console.log('\n🎯 User Features:', features);

    // Check sales count
    const [salesCount] = await pool.query("SELECT COUNT(*) as count FROM sales WHERE empresa_id = ?", [empresas[0].id]);
    console.log('\n💰 Total Sales:', salesCount[0].count);

    // Check recent sales
    const [recentSales] = await pool.query(`
        SELECT id, total, payment_method, created_at 
        FROM sales 
        WHERE empresa_id = ? 
        ORDER BY created_at DESC 
        LIMIT 5
    `, [empresas[0].id]);
    console.log('\n📊 Recent Sales:', recentSales);

    // Check products
    const [products] = await pool.query("SELECT COUNT(*) as count FROM products WHERE empresa_id = ?", [empresas[0].id]);
    console.log('\n📦 Total Products:', products[0].count);

    await pool.end();
}

verify().catch(console.error);
