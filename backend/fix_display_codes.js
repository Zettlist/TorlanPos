import db, { initDatabase } from './database/db.js';

async function fixDisplayCodes() {
    await initDatabase();
    console.log('🔧 Reparando códigos visuales (SBIN)...');

    const empresaId = 12;
    const products = db.prepare('SELECT id, name, isbn, sbin_code FROM products WHERE empresa_id = ?').all(empresaId);

    let fixedCount = 0;

    for (const p of products) {
        let newSbin = p.sbin_code;
        let newIsbn = p.isbn;
        let dirty = false;

        // 1. Clean SBIN
        if (newSbin) {
            if (newSbin.startsWith('INTERNAL-')) {
                newSbin = newSbin.replace('INTERNAL-', '');
                dirty = true;
            }
            if (newSbin === '-' || newSbin.trim() === '') {
                newSbin = null;
                dirty = true;
            }
        }

        // 2. Clean ISBN (Just in case)
        if (newIsbn) {
            if (newIsbn.startsWith('INTERNAL-')) {
                newIsbn = newIsbn.replace('INTERNAL-', '');
                dirty = true;
            }
            if (newIsbn === '-' || newIsbn.trim() === '') {
                newIsbn = null;
                dirty = true;
            }
        }

        // 3. Fallback / Generate
        // If we have a valid ISBN but no SBIN, use ISBN
        if (!newSbin && newIsbn) {
            newSbin = newIsbn;
            dirty = true;
        }
        // If we have valid SBIN but no ISBN, use SBIN
        if (newSbin && !newIsbn) {
            newIsbn = newSbin;
            dirty = true;
        }

        // If neither, generate specific 200... code
        if (!newSbin && !newIsbn) {
            let randomDigits = '';
            for (let i = 0; i < 10; i++) {
                randomDigits += Math.floor(Math.random() * 10).toString();
            }
            const code = '200' + randomDigits;
            newSbin = code;
            newIsbn = code;
            dirty = true;
        }

        if (dirty) {
            try {
                console.log(`🛠️ Reparando "${p.name}": SBIN [${p.sbin_code} -> ${newSbin}] | ISBN [${p.isbn} -> ${newIsbn}]`);
                db.prepare('UPDATE products SET sbin_code = ?, isbn = ? WHERE id = ?').run(newSbin, newIsbn, p.id);
                fixedCount++;
            } catch (err) {
                console.error(`❌ Error al actualizar ${p.name}:`, err.message);
            }
        }
    }

    console.log(`✅ ${fixedCount} productos reparados y sincronizados.`);
}

fixDisplayCodes();
