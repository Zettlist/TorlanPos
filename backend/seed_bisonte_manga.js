import db, { initDatabase } from './database/db.js';

const PRODUCTS = [
    { "isbn": "9786075280001", "name": "Dragon Ball Vol. 1", "price": 149, "publisher": "Panini", "category": "Shonen", "page_count": 192, "dimensions": "11.5x17.7x1.5", "weight": 180, "page_color": "B/N", "language": "Español" },
    { "isbn": "9788418190002", "name": "Berserk Deluxe Vol. 1", "price": 890, "publisher": "Panini", "category": "Seinen", "page_count": 690, "dimensions": "18.0x25.5x5.0", "weight": 1200, "page_color": "B/N", "language": "Español" },
    { "isbn": "9786076340003", "name": "Spy x Family Vol. 1", "price": 139, "publisher": "Panini", "category": "Comedia", "page_count": 210, "dimensions": "11.4x17.2x1.4", "weight": 190, "page_color": "B/N", "language": "Español" },
    { "isbn": "9784088700004", "name": "One Piece Vol. 100", "price": 159, "publisher": "Ivrea", "category": "Shonen", "page_count": 200, "dimensions": "11.5x17.0x1.3", "weight": 175, "page_color": "B/N", "language": "Español" },
    { "isbn": "9786074090005", "name": "Akira Vol. 1", "price": 450, "publisher": "Kamite", "category": "Cyberpunk", "page_count": 360, "dimensions": "18.2x25.7x2.8", "weight": 850, "page_color": "B/N", "language": "Español" },
    { "isbn": "9781974700006", "name": "Uzumaki (Hardcover)", "price": 650, "publisher": "Planeta", "category": "Terror", "page_count": 648, "dimensions": "14.6x21.0x4.5", "weight": 950, "page_color": "B/N", "language": "Español" },
    { "isbn": "9786075280007", "name": "Sailor Moon Eternal 1", "price": 420, "publisher": "Panini", "category": "Shojo", "page_count": 480, "dimensions": "15.0x21.0x3.5", "weight": 700, "page_color": "Color", "language": "Español" },
    { "isbn": "9788417400008", "name": "Chainsaw Man Vol. 1", "price": 149, "publisher": "Ivrea", "category": "Acción", "page_count": 192, "dimensions": "11.5x17.5x1.4", "weight": 185, "page_color": "B/N", "language": "Español" },
    { "isbn": "9786076340009", "name": "Demon Slayer Vol. 1", "price": 139, "publisher": "Panini", "category": "Shonen", "page_count": 192, "dimensions": "11.4x17.2x1.4", "weight": 180, "page_color": "B/N", "language": "Español" },
    { "isbn": "9784063100010", "name": "Blue Lock Vol. 1", "price": 159, "publisher": "Planeta", "category": "Deportes", "page_count": 208, "dimensions": "11.5x17.0x1.5", "weight": 190, "page_color": "B/N", "language": "Español" }
];

async function seedBisonteManga() {
    await initDatabase();
    console.log('🔍 Buscando empresa "Bisonte Manga"...');

    // 1. Find the company
    const empresa = db.prepare('SELECT id, nombre_empresa FROM empresas WHERE nombre_empresa LIKE ?').get('%Bisonte Manga%');

    if (!empresa) {
        console.error('❌ Error: No se encontró la empresa "Bisonte Manga". Asegúrate de crearla primero.');
        return;
    }

    console.log(`✅ Empresa encontrada: ${empresa.nombre_empresa} (ID: ${empresa.id})`);

    let insertedCount = 0;
    let skippedCount = 0;

    // 2. Validate and Insert
    for (const product of PRODUCTS) {
        // Check for duplicate ISBN in this empresa
        const existing = db.prepare('SELECT id FROM products WHERE empresa_id = ? AND isbn = ?').get(empresa.id, product.isbn);

        if (existing) {
            console.log(`⚠️ Saltando duplicado (ISBN ${product.isbn}): ${product.name}`);
            skippedCount++;
            continue;
        }

        try {
            // Insert
            db.prepare(`
                INSERT INTO products (
                    empresa_id, name, price, stock, category, 
                    isbn, publisher, page_count, dimensions, weight, page_color, language
                ) VALUES (
                    ?, ?, ?, ?, ?, 
                    ?, ?, ?, ?, ?, ?, ?
                )
            `).run(
                empresa.id, product.name, product.price, 10, product.category, // Default stock 10
                product.isbn, product.publisher, product.page_count, product.dimensions, product.weight, product.page_color, product.language
            );

            insertedCount++;
        } catch (err) {
            console.error(`❌ Error al insertar ${product.name}:`, err.message);
        }
    }

    console.log(`\n🎉 Proceso terminado.`);
    console.log(`✅ Insertados: ${insertedCount}`);
    console.log(`⏩ Saltados (Duplicados): ${skippedCount}`);
    console.log(`📊 Total en catálogo: ${db.prepare('SELECT COUNT(*) as count FROM products WHERE empresa_id = ?').get(empresa.id).count}`);
}

seedBisonteManga();
