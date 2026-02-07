import dbHelpers, { initDatabase } from './database/db.js';

console.log('🔄 Updating database schema for Plan Prueba...');

// Helper to run raw SQL
const db = {
    exec: (sql) => {
        console.log(`Executing SQL: ${sql.substring(0, 50)}...`);
        return dbHelpers.exec(sql);
    },
    run: (sql, params) => dbHelpers.prepare(sql).run(...(Array.isArray(params) ? params : [params]))
};

async function migrate_plans() {
    await initDatabase();

    try {
        // Clean up potential failed previous run
        try {
            db.exec('DROP TABLE IF EXISTS empresas_old');
        } catch (e) {
            console.log('Cleanup error (ignored):', e.message);
        }

        db.exec('PRAGMA foreign_keys = OFF');
        // Removing explicit transaction to avoid sql.js saveDatabase conflict
        // db.exec('BEGIN TRANSACTION');

        console.log('Renaming table...');
        db.exec('ALTER TABLE empresas RENAME TO empresas_old');

        console.log('Creating new table...');
        db.exec(`
            CREATE TABLE empresas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre_empresa TEXT NOT NULL,
                plan_contratado TEXT NOT NULL DEFAULT 'Basico' CHECK(plan_contratado IN ('Prueba', 'Basico', 'Premium', 'Empresarial')),
                estado TEXT NOT NULL DEFAULT 'Activo' CHECK(estado IN ('Activo', 'Suspendido', 'Baja')),
                max_usuarios INTEGER DEFAULT 5,
                max_productos INTEGER DEFAULT 100,
                fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
                fecha_suspension DATETIME,
                notas TEXT
            )
        `);

        console.log('Copying data...');
        db.exec(`
            INSERT INTO empresas (id, nombre_empresa, plan_contratado, estado, max_usuarios, max_productos, fecha_registro, fecha_suspension, notas)
            SELECT id, nombre_empresa, plan_contratado, estado, max_usuarios, max_productos, fecha_registro, fecha_suspension, notas
            FROM empresas_old
        `);

        console.log('Dropping old table...');
        db.exec('DROP TABLE empresas_old');

        // db.exec('COMMIT');
        db.exec('PRAGMA foreign_keys = ON');

        console.log('✅ Schema migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed! Error:', error);
        // try {
        //     console.log('Attempting rollback...');
        //     db.exec('ROLLBACK');
        // } catch (rbError) {
        //     console.error('Rollback failed (might not be in transaction):', rbError.message);
        // }
    }
}

migrate_plans();
