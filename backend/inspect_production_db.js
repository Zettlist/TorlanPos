import pool from './database/db.js';

async function inspect() {
    try {
        console.log('🔍 Inspecting Database Schema...');

        // List Tables
        const [tables] = await pool.query("SHOW TABLES");
        const tableNames = tables.map(t => Object.values(t)[0]);
        console.log('📂 Tables found:', tableNames);

        const requiredTables = [
            'empresas',
            'global_changes_log',
            'users',
            'features',
            'user_features',
            'products',
            'sales',
            'sale_items',
            'business_settings',
            'sales_goals',
            'cash_sessions'
        ];

        const missing = requiredTables.filter(t => !tableNames.includes(t));

        if (missing.length > 0) {
            console.error('❌ MISSING TABLES:', missing);
        } else {
            console.log('✅ All required tables are present.');
        }

        // Check columns for 'empresas'
        console.log('\n📋 Columns in [empresas]:');
        const [empresaCols] = await pool.query("SHOW COLUMNS FROM empresas");
        empresaCols.forEach(c => console.log(` - ${c.Field} (${c.Type})`));

        // Check columns for 'global_changes_log'
        if (tableNames.includes('global_changes_log')) {
            console.log('\n📋 Columns in [global_changes_log]:');
            const [logsCols] = await pool.query("SHOW COLUMNS FROM global_changes_log");
            logsCols.forEach(c => console.log(` - ${c.Field} (${c.Type})`));
        }

    } catch (error) {
        console.error('❌ Error inspecting DB:', error);
    } finally {
        await pool.end();
    }
}

inspect();
