import db, { initDatabase } from './database/db.js';

async function sanitizeStrict() {
    await initDatabase();
    console.log('🧹 Iniciando limpieza ESTRICTA de productos...');

    const empresaId = 12; // Bisonte Manga
    console.log(`🏢 Empresa ID: ${empresaId}`);

    // Get all products
    const products = db.prepare('SELECT id, name, isbn, stock FROM products WHERE empresa_id = ?').all(empresaId);

    const isbnMap = new Map(); // Map cleanISBN -> { masterId, totalStock }
    const toDelete = [];
    const toUpdate = [];

    console.log(`🔍 Analizando ${products.length} productos...`);

    for (const p of products) {
        let cleanIsbn = '';

        if (p.isbn) {
            // Remove everything except numbers
            cleanIsbn = p.isbn.replace(/\D/g, '');
        }

        // Fill voids or invalid (empty string)
        if (cleanIsbn === '') {
            // Generate random 13 digit
            let randomDigits = '';
            for (let i = 0; i < 12; i++) {
                randomDigits += Math.floor(Math.random() * 10).toString();
            }
            cleanIsbn = '2' + randomDigits; // Prefix 2 for internal generated
            console.log(`✨ Generado ISBN para "${p.name}": ${cleanIsbn}`);
        }

        // Logic for duplicates
        if (isbnMap.has(cleanIsbn)) {
            // Duplicate found!
            const master = isbnMap.get(cleanIsbn);

            console.log(`⚠️ Fusión detectada: "${p.name}" (${p.id}) se unirá a "${master.name}" (${master.id}) [ISBN: ${cleanIsbn}]`);

            // Mark for deletion
            toDelete.push(p.id);

            // Update master stock
            master.stock += (p.stock || 0);

        } else {
            // New unique ISBN encountered
            isbnMap.set(cleanIsbn, {
                id: p.id,
                name: p.name,
                stock: p.stock || 0,
                originalIsbn: p.isbn
            });

            // Mark for update if changed
            if (p.isbn !== cleanIsbn) {
                toUpdate.push({ id: p.id, isbn: cleanIsbn });
            }
        }
    }

    // Execute changes
    // 1. Updates (only for masters/singles)
    for (const item of toUpdate) {
        // Only update if it's not in the delete list (redundant check but safe)
        if (!toDelete.includes(item.id)) {
            try {
                db.prepare('UPDATE products SET isbn = ? WHERE id = ?').run(item.isbn, item.id);
            } catch (e) {
                console.error(`❌ Error actualizando ID ${item.id}:`, e.message);
            }
        }
    }

    // 2. Stock Merges (Update masters with new totals)
    for (const [isbn, data] of isbnMap.entries()) {
        // If we merged anything into this master, we might need to save the new stock
        // We can just blindly update stock for all masters from our map, 
        // ensuring they have the sum of all merged duplicates.
        try {
            db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(data.stock, data.id);
        } catch (e) {
            console.error(`❌ Error actualizando stock master ID ${data.id}:`, e.message);
        }
    }

    // 3. Deletes
    for (const id of toDelete) {
        try {
            db.prepare('DELETE FROM products WHERE id = ?').run(id);
        } catch (e) {
            console.error(`❌ Error eliminando ID ${id}:`, e.message);
        }
    }

    console.log(`\n🎉 Limpieza terminada.`);
    console.log(`✏️ IDs Normalizados: ${toUpdate.length}`);
    console.log(`🗑️ IDs Fusionados/Eliminados: ${toDelete.length}`);
    console.log(`📦 Catálogo Final: ${products.length - toDelete.length} productos.`);
}

sanitizeStrict();
