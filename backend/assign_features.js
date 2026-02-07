// Assign all features to test users
import pool from './database/db.js';

async function assignFeatures() {
    console.log('🎯 Assigning features to test users...\n');

    // Get Bisonte Test Lab empresa
    const [empresas] = await pool.query("SELECT id FROM empresas WHERE nombre_empresa = 'Bisonte Test Lab'");
    const empresaId = empresas[0].id;

    // Get test users
    const [users] = await pool.query("SELECT id, username FROM users WHERE empresa_id = ?", [empresaId]);

    // Get all features
    const [features] = await pool.query("SELECT id, name FROM features");

    console.log(`Found ${users.length} users and ${features.length} features\n`);

    // Assign all features to all test users
    for (const user of users) {
        for (const feature of features) {
            await pool.query(`
                INSERT INTO user_features (user_id, feature_id, is_enabled)
                VALUES (?, ?, 1)
                ON DUPLICATE KEY UPDATE is_enabled = 1
            `, [user.id, feature.id]);
        }
        console.log(`✅ Enabled all features for ${user.username}`);
    }

    console.log('\n✅ All features assigned!\n');
    await pool.end();
}

assignFeatures().catch(console.error);
