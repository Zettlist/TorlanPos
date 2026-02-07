import pool from './database/db.js';

async function setup() {
    console.log("☢️ Iniciando protocolo de limpieza profunda...");
    
    try {
        // 1. Desactivar candados de seguridad (Foreign Keys) para poder borrar sin errores
        await pool.query("SET FOREIGN_KEY_CHECKS = 0");

        // 2. Borrar cualquier tabla "zombie" que haya quedado de intentos anteriores
        const tablas = ['users', 'usuarios', 'companies', 'empresas', 'products', 'productos'];
        for (const tabla of tablas) {
            await pool.query(`DROP TABLE IF EXISTS ${tabla}`);
            console.log(`🗑️ Tabla eliminada: ${tabla}`);
        }

        // 3. Reactivar candados de seguridad
        await pool.query("SET FOREIGN_KEY_CHECKS = 1");

        console.log("✨ Lienzo en blanco. Construyendo estructura SaaS...");

        // 4. Crear tabla de empresas (Bien definida)
        await pool.query(`
            CREATE TABLE empresas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(255) NOT NULL,
                meta_mensual DECIMAL(10,2) DEFAULT 0
            )`);

        // 5. Crear tabla de usuarios (Bien vinculada)
        await pool.query(`
            CREATE TABLE usuarios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'admin',
                company_id INT,
                FOREIGN KEY (company_id) REFERENCES empresas(id)
            )`);

        // 6. Insertar a Bisonte Manga
        await pool.query("INSERT INTO empresas (id, nombre) VALUES (1, 'Bisonte Manga')");
        
        // 7. Crear tu admin
        await pool.query(`
            INSERT INTO usuarios (nombre, password_hash, role, company_id) 
            VALUES ('admin', 'admin123', 'admin', 1)`);

        console.log("✅ ¡Sistema reseteado exitosamente! MySQL listo para Google Cloud.");
        process.exit(0);
    } catch (error) {
        console.error("❌ Error fatal:", error);
        process.exit(1);
    }
}

setup();