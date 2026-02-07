import sqlite3 from 'sqlite3';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
    console.log("🚀 Iniciando migración final para la Convención...");
    
    const sqliteDb = new sqlite3.Database(path.join(__dirname, 'database', 'database.sqlite'));
    const mysqlDb = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: 'root_password_123',
        database: 'torlan_pos'
    });

    // Migrar Empresas (Usando el nombre correcto: empresas)
    sqliteDb.all("SELECT * FROM empresas", [], async (err, rows) => {
        if (err) return console.error("❌ Error en SQLite (empresas):", err.message);
        if (rows) {
            for (const row of rows) {
                await mysqlDb.execute(
                    "INSERT IGNORE INTO empresas (id, nombre, meta_mensual) VALUES (?, ?, ?)",
                    [row.id, row.nombre, row.meta_mensual || 0]
                );
            }
            console.log("✅ Empresas migradas.");
        }
    });

    // Migrar Usuarios (Usando el nombre correcto: usuarios)
    sqliteDb.all("SELECT * FROM usuarios", [], async (err, rows) => {
        if (err) return console.error("❌ Error en SQLite (usuarios):", err.message);
        if (rows) {
            for (const row of rows) {
                await mysqlDb.execute(
                    "INSERT IGNORE INTO usuarios (id, nombre, password_hash, role, company_id) VALUES (?, ?, ?, ?, ?)",
                    [row.id, row.nombre, row.password_hash, row.role, row.company_id]
                );
            }
            console.log("✅ Usuarios migrados. Ya puedes iniciar sesión.");
            console.log("👉 PRÓXIMO PASO: Refactorizar las rutas.");
            setTimeout(() => process.exit(0), 1000);
        }
    });
}

migrate().catch(err => console.error("❌ Error crítico:", err));