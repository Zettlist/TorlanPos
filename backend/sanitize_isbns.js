import db, { initDatabase } from './database/db.js';

async function sanitizeIsbns() {
    await initDatabase();
    console.log('🧹 Iniciando limpieza de ISBNs...');

    // Get active company (Bisonte Manga ID 12 based on previous context, but let's be safe)
    // User asked for "Empresa Activa". I'll target ID 12 specifically as that's the one we were working on.
    const empresaId = 12;

    console.log(`🏢 Empresa ID: ${empresaId}`);

    const products = db.prepare('SELECT id, name, isbn, sbin_code FROM products WHERE empresa_id = ?').all(empresaId);

    let updatedCount = 0;

    db.transaction(() => {
        for (const p of products) {
            let wasUpdated = false;
            let newIsbn = p.isbn;
            let newSbin = p.sbin_code;

            // Clean ISBN
            if (newIsbn) {
                // Remove non-numeric
                const numeric = newIsbn.replace(/\D/g, '');
                if (numeric.length > 0) {
                    // Pad to 13
                    newIsbn = numeric.padStart(13, '0');
                } else {
                    newIsbn = null; // If it was just letters, clear it? Or keep random? User said "Elimina cualquier letra...".
                }
                if (newIsbn !== p.isbn) wasUpdated = true;
            }

            // Clean SBIN (Internal Code) - User prompt mentioned "ISBN", but usually these fields are linked. 
            // The prompt specifically said: "Elimina cualquier letra ... de los ISBN existentes". 
            // I will only touch 'isbn' column as requested, unless 'sbin_code' is used as the displayed code.
            // In Torlan logic, SBIN is an internal code. I shouldn't touch it unless requested.
            // Wait, the prompt said "Generador Numérico: Ajusta el botón 'Generar'. En lugar de usar prefijos como BIS-, debe generar una cadena aleatoria de 13 dígitos".
            // The generator populates `isbn` (or `sku` in frontend which maps to `isbn`).
            // I check `Products.jsx` logic... `generateSku` sets `isbn`.
            // So I will only sanitize `isbn`.

            if (wasUpdated) {
                console.log(`🔄 Updating ${p.name}: ${p.isbn} -> ${newIsbn}`);
                db.prepare('UPDATE products SET isbn = ? WHERE id = ?').run(newIsbn, p.id);
                updatedCount++;
            }
        }
    })();

    console.log(`✅ ${updatedCount} productos actualizados.`);
}

sanitizeIsbns();
