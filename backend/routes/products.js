import express from 'express';
import pool from '../database/db.js';
import { authenticateToken, validateEmpresaActive, getEmpresaId } from '../middleware/auth.js';
import { requireInventoryWrite } from '../middleware/inventoryAccess.js';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';
import multer from 'multer';
import { uploadFileToGCS } from '../utils/storage.js';
// import ptp from 'pdf-to-printer'; // Removed for client-side printing support
import { fileURLToPath } from 'url';
import { generarCodigoParaEmpresa } from '../utils/barcodeGenerator.js';
import { buscarSinopsis } from '../services/sinopsisFinder.js';

// Configure Multer (Memory Storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
});

// const { print } = ptp;

const router = express.Router();

// El endpoint GET /migrate-schema-secure vivia aqui: creaba `categories` y
// `publishers` y anadia doce columnas a `products` con ALTER en caliente,
// protegido por el secreto 'secure-setup-123' escrito en el propio archivo.
// El esquema completo esta ahora en db/schema.sql y se carga antes de arrancar,
// asi que no hay nada que migrar en runtime — ni un secreto en el repositorio.

// All routes require authentication and active empresa
router.use(authenticateToken);
router.use(validateEmpresaActive);

// ─── Ayudas de normalizacion ────────────────────────────────────────────────
//
// El formulario manda multipart/form-data, asi que todo llega como cadena: un
// campo vacio es '' y un numero es '12'. Sin convertir, '' entraba en columnas
// numericas como 0 y en las de texto como cadena vacia, que no es lo mismo que
// "sin dato" — un ISBN '' choca con el UNIQUE del siguiente producto sin ISBN.

/**
 * '' y undefined pasan a NULL; el resto se queda igual.
 *
 * Tambien las cadenas 'null' y 'undefined': en multipart todo se serializa, y
 * un campo que vale null en el formulario llega literalmente como el texto
 * "null". Asi es como un producto acababa con language = 'null' en la base —
 * un valor que no es nulo, no es un idioma, y la tienda muestra tal cual.
 */
const nulo = (v) => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return (s === '' || s === 'null' || s === 'undefined') ? null : v;
};

/** Entero o NULL. Nunca 0 por accidente. */
const aEntero = (v) => {
    const s = nulo(v);
    if (s === null) return null;
    const n = Number.parseInt(s, 10);
    return Number.isNaN(n) ? null : n;
};

/** La rama del catalogo. Llega como '1'/'0', 'true'/'false' o booleano. */
const esAdulto = (v) => (v === '1' || v === 1 || v === true || v === 'true') ? 1 : 0;

/**
 * Devuelve el id de la categoria, creandola si hace falta.
 *
 * La rama forma parte de la identidad de la categoria: la base exige que
 * (category_id, is_adult) exista tal cual en `categories`. Si la categoria ya
 * existe en la otra rama, la insercion fallaria con ER_NO_REFERENCED_ROW_2 y
 * el mensaje no diria nada util; se atrapa aqui para explicar el choque.
 */
async function resolverCategoria(nombre, rama) {
    const limpio = nulo(nombre);
    if (limpio === null) return null;

    const [existentes] = await pool.query(
        'SELECT id, is_adult FROM categories WHERE name = ?', [limpio]);

    if (existentes.length > 0) {
        if (Number(existentes[0].is_adult) !== Number(rama)) {
            const suya = existentes[0].is_adult ? 'Contenido de Adultos' : 'Contenido Regular';
            throw new Error(
                `La categoria "${limpio}" pertenece a ${suya}. Elige otra categoria o cambia la ` +
                `clasificacion del producto — una categoria no puede estar en las dos ramas.`);
        }
        return existentes[0].id;
    }

    const [r] = await pool.query(
        'INSERT INTO categories (name, is_adult) VALUES (?, ?)', [limpio, rama]);
    return r.insertId;
}

/** Igual, pero la editorial no tiene rama. */
async function resolverEditorial(nombre) {
    const limpio = nulo(nombre);
    if (limpio === null) return null;
    const [r] = await pool.execute(
        'INSERT INTO publishers (name) VALUES (?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)',
        [limpio]);
    return r.insertId;
}

/** Traduce los fallos de integridad a algo que se pueda leer en el mostrador. */
function traducirErrorDeBase(error) {
    if (error.code === 'ER_DUP_ENTRY') {
        const campo = /barcode/.test(error.message) ? 'código de barras'
            : /isbn/.test(error.message) ? 'ISBN'
                : 'código';
        return { status: 409, error: `Ese ${campo} ya está en uso por otro producto de la empresa.` };
    }
    if (error.code === 'ER_NO_REFERENCED_ROW_2' && /fk_products_category/.test(error.message)) {
        return {
            status: 400,
            error: 'La categoría no corresponde a la clasificación elegida (Regular / Adultos).',
        };
    }
    if (error.code === 'ER_NO_REFERENCED_ROW_2' && /fk_products_format/.test(error.message)) {
        return { status: 400, error: 'El formato de envío seleccionado ya no existe.' };
    }
    return null;
}

// Categorias y editoriales para el formulario.
//
// Las categorias salen del catalogo `categories`, no de un DISTINCT sobre
// products: ahi cada falta de ortografia era una categoria nueva ('Shonen',
// 'shonen', 'Shounen') y la lista crecia sola. Ademas vienen partidas por rama
// — el formulario solo puede ofrecer las de la rama elegida, porque la base
// rechaza un producto cuya rama no coincida con la de su categoria.
router.get('/suggestions', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        const [[categorias], [publishers]] = await Promise.all([
            pool.query('SELECT id, name, is_adult FROM categories ORDER BY is_adult, name'),
            pool.query(
                `SELECT DISTINCT publisher FROM products
                  WHERE empresa_id = ? AND publisher IS NOT NULL AND publisher != ''
                  ORDER BY publisher`,
                [empresaId]
            )
        ]);

        res.json({
            categorias: {
                regular: categorias.filter(c => !c.is_adult).map(({ id, name }) => ({ id, name })),
                adultos: categorias.filter(c => c.is_adult).map(({ id, name }) => ({ id, name })),
            },
            // Se conserva la forma vieja para las pantallas que aun la leen.
            categories: categorias.map(c => c.name),
            publishers: publishers.map(p => p.publisher)
        });
    } catch (error) {
        console.error('Get suggestions error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Get all tags for the empresa
router.get('/tags', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        const [tags] = await pool.query(
            'SELECT id, name FROM tags WHERE empresa_id = ? ORDER BY name',
            [empresaId]
        );

        res.json(tags.map(t => t.name));
    } catch (error) {
        console.error('Get tags error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Get all products (filtered by empresa_id)
router.get('/', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        // STRICT ACCESS CONTROL: Employees cannot see the full product list (Management)
        const [userRows] = await pool.query('SELECT role FROM users WHERE id = ?', [req.user.id]);
        const user = userRows[0];

        if (user.role !== 'empresa_admin' && user.role !== 'global_admin') {
            return res.status(403).json({
                error: 'Acceso denegado. No tiene permisos para ver el inventario completo.',
                code: 'INVENTORY_ACCESS_DENIED'
            });
        }

        const [products] = await pool.query(`
            SELECT p.*, GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR ',') as tags
            FROM products p
            LEFT JOIN product_tags pt ON p.id = pt.product_id
            LEFT JOIN tags t ON pt.tag_id = t.id
            WHERE p.empresa_id = ?
            GROUP BY p.id
            ORDER BY p.name
        `, [empresaId]);

        // Parse tags from comma-separated string to array
        const productsWithTags = products.map(p => ({
            ...p,
            tags: p.tags ? p.tags.split(',') : []
        }));

        res.json(productsWithTags);
    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Search products by name or SBIN code (optimized for barcode scanners)
router.get('/search', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { q, exact } = req.query;

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        if (!q || q.length < 1) {
            const [products] = await pool.query(
                'SELECT * FROM products WHERE empresa_id = ? ORDER BY name LIMIT 50',
                [empresaId]
            );
            return res.json(products);
        }

        // Exact match mode for barcode scanner (Enter key pressed)
        if (exact === 'true') {
            const [productRows] = await pool.query(
                'SELECT * FROM products WHERE empresa_id = ? AND (name = ? OR barcode = ? OR isbn = ?) LIMIT 1',
                [empresaId, q, q, q]
            );

            if (productRows.length > 0) {
                return res.json({ exactMatch: true, product: productRows[0] });
            }
            return res.json({ exactMatch: false, product: null });
        }

        const searchTerm = `%${q}%`;
        const [products] = await pool.query(`
            SELECT * FROM products
            WHERE empresa_id = ? AND (name LIKE ? OR barcode LIKE ? OR isbn LIKE ? OR series LIKE ?)
            ORDER BY
                CASE
                    WHEN isbn = ? THEN 1
                    WHEN barcode = ? THEN 2
                    WHEN isbn LIKE ? THEN 3
                    ELSE 4
                END,
                name
            LIMIT 50
        `, [empresaId, searchTerm, searchTerm, searchTerm, searchTerm, q, q, `${q}%`]);

        res.json(products);
    } catch (error) {
        console.error('Search products error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Aviso de codigo repetido al escanear.
//
// Se dispara mientras se teclea, antes de guardar. No sustituye a la unicidad
// —esa la impone la base con UNIQUE (empresa_id, isbn)— pero convierte un
// error al final del formulario en un aviso al principio, y sobre todo dice
// *cual* es el producto que ya lo tiene: casi siempre es el mismo tomo que se
// esta reingresando por error, y lo que se queria era sumar existencias.
router.get('/check-isbn', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { isbn, exclude_id } = req.query;

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        const codigo = String(isbn || '').trim();
        if (!codigo) return res.json({ isDuplicate: false });

        // Se busca tambien contra barcode: el lector no distingue entre el ISBN
        // impreso por el editor y la etiqueta interna, y el operador tampoco.
        let query = `SELECT id, name, series, volume, stock, sale_price, image_url,
                            CASE WHEN isbn = ? THEN 'isbn' ELSE 'barcode' END AS campo
                       FROM products
                      WHERE empresa_id = ? AND (isbn = ? OR barcode = ?)`;
        const params = [codigo, empresaId, codigo, codigo];

        if (exclude_id) {
            query += ' AND id != ?';
            params.push(exclude_id);
        }
        query += ' LIMIT 1';

        const [existing] = await pool.query(query, params);

        res.json({
            isDuplicate: existing.length > 0,
            existingProduct: existing[0] || null
        });
    } catch (error) {
        console.error('Check ISBN error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ─── Continuar serie ────────────────────────────────────────────────────────
//
// En una tienda de manga casi todo lo que entra es un tomo nuevo de algo que ya
// se vende. Entre un tomo y el siguiente cambian tres cosas — numero, precio y
// existencias — y las otras quince se vuelven a capturar a mano cada vez.
// Estas dos rutas son el atajo: buscar la serie y heredar el resto.

// Series del catalogo que coinciden con la busqueda, con su ultimo tomo.
router.get('/series', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        if (!empresaId) return res.status(403).json({ error: 'Usuario sin empresa asignada' });

        const q = String(req.query.q || '').trim();
        if (q.length < 2) return res.json([]);

        // GROUP BY series: la ficha que se muestra es la serie, no cada tomo.
        // La portada y el precio salen del tomo mas alto, que es el que se va a
        // continuar. MAX(volume) da el numero a proponer.
        const [rows] = await pool.query(`
            SELECT p.series,
                   COUNT(*)                              AS tomos,
                   MAX(p.volume)                         AS ultimo_volumen,
                   SUBSTRING_INDEX(GROUP_CONCAT(p.image_url  ORDER BY p.volume DESC), ',', 1) AS image_url,
                   SUBSTRING_INDEX(GROUP_CONCAT(p.publisher  ORDER BY p.volume DESC), ',', 1) AS publisher,
                   SUBSTRING_INDEX(GROUP_CONCAT(p.category   ORDER BY p.volume DESC), ',', 1) AS category,
                   SUBSTRING_INDEX(GROUP_CONCAT(p.sale_price ORDER BY p.volume DESC), ',', 1) AS sale_price
              FROM products p
             WHERE p.empresa_id = ? AND p.series IS NOT NULL AND p.series LIKE ?
             GROUP BY p.series
             ORDER BY tomos DESC, p.series
             LIMIT 8
        `, [empresaId, `%${q}%`]);

        res.json(rows);
    } catch (error) {
        console.error('Buscar series:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Plantilla para el siguiente tomo de una serie.
router.get('/series/plantilla', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        if (!empresaId) return res.status(403).json({ error: 'Usuario sin empresa asignada' });

        const serie = String(req.query.serie || '').trim();
        if (!serie) return res.status(400).json({ error: 'Falta el nombre de la serie' });

        // El tomo mas alto, no el primero: es el que refleja el precio y el
        // proveedor actuales. Una serie que cambio de editorial a mitad se
        // continua con la editorial nueva, que es lo que se quiere.
        const [rows] = await pool.query(`
            SELECT id, name, series, volume, cost_price, sale_price, category, category_id,
                   is_adult, publisher, publisher_id, language, page_color, format_id,
                   supplier_id, supplier_price, artist, group_name, image_url
              FROM products
             WHERE empresa_id = ? AND series = ?
             ORDER BY volume DESC, id DESC
             LIMIT 1
        `, [empresaId, serie]);

        if (rows.length === 0) return res.status(404).json({ error: 'Serie no encontrada' });

        const base = rows[0];
        const siguiente = base.volume == null ? null : Number(base.volume) + 1;

        res.json({
            // Lo que se hereda tal cual.
            plantilla: {
                series: base.series,
                volume: siguiente,
                name: siguiente ? `${base.series}, Vol. ${siguiente}` : base.series,
                cost_price: base.cost_price,
                sale_price: base.sale_price,
                category: base.category,
                category_id: base.category_id,
                is_adult: base.is_adult,
                publisher: base.publisher,
                publisher_id: base.publisher_id,
                language: base.language,
                page_color: base.page_color,
                format_id: base.format_id,
                supplier_id: base.supplier_id,
                supplier_price: base.supplier_price,
                artist: base.artist,
                group_name: base.group_name,
            },
            // Lo que NO se hereda, y por que — para que el formulario lo diga.
            noHeredado: {
                stock: 'Las existencias son de este tomo',
                isbn: 'Cada tomo tiene su propio ISBN',
                image_url: 'La portada cambia en cada tomo',
                sinopsis: 'La sinopsis es de este tomo',
            },
            tomoBase: { id: base.id, name: base.name, volume: base.volume, image_url: base.image_url },
        });
    } catch (error) {
        console.error('Plantilla de serie:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ─── Sinopsis ───────────────────────────────────────────────────────────────
//
// Copia texto de catalogos publicos. No lo redacta: ver services/sinopsisFinder.js.
router.get('/sinopsis', async (req, res) => {
    try {
        const { isbn, titulo, serie } = req.query;
        if (!isbn && !titulo && !serie) {
            return res.status(400).json({ error: 'Hace falta al menos ISBN, titulo o serie' });
        }

        const resultados = await buscarSinopsis({ isbn, titulo, serie });

        res.json({
            resultados,
            // Sin resultados no se rellena nada. Un campo vacio es mejor que un
            // texto que no corresponde al libro.
            mensaje: resultados.length === 0
                ? 'Ninguna fuente reconocio el titulo. Escribe la sinopsis a mano.'
                : null,
        });
    } catch (error) {
        console.error('Buscar sinopsis:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Create product - PROTECTED: requires admin role
router.post('/', requireInventoryWrite, upload.single('image'), async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { name, series, volume, cost_price, sale_price, stock, category, gender, barcode, isbn,
            extras, publication_date, publisher, page_count, dimensions, weight, page_color,
            language, format_id, supplier_id, supplier_price, is_adult, artist, group_name,
            events, sinopsis, sinopsis_fuente } = req.body;

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        // Validate required fields
        if (!name || cost_price === undefined || sale_price === undefined) {
            return res.status(400).json({ error: 'Nombre, precio de costo y precio de venta son requeridos' });
        }
        if (!sinopsis || !sinopsis.trim()) {
            return res.status(400).json({ error: 'La sinopsis es obligatoria' });
        }

        // Validate Image (Required)
        if (!req.file) {
            return res.status(400).json({ error: 'La imagen del producto es obligatoria' });
        }

        // Validate price values
        if (parseFloat(cost_price) < 0 || parseFloat(sale_price) < 0) {
            return res.status(400).json({ error: 'Los precios deben ser positivos' });
        }

        // Check product limit for empresa
        const [empresaRows] = await pool.query('SELECT max_productos FROM empresas WHERE id = ?', [empresaId]);
        const empresa = empresaRows[0];
        const [productCountRows] = await pool.query('SELECT COUNT(*) as count FROM products WHERE empresa_id = ?', [empresaId]);
        const productCount = productCountRows[0];

        if (productCount.count >= empresa.max_productos) {
            return res.status(400).json({
                error: `Límite de productos alcanzado (${empresa.max_productos}). Actualice su plan para más productos.`
            });
        }

        // Los tres SELECT-antes-de-INSERT que comprobaban sbin, isbn y barcode
        // ya no estan. No protegian de nada: entre la consulta y la insercion
        // cabe otra peticion con el mismo codigo. La unicidad la impone la base
        // con UNIQUE (empresa_id, isbn) y (empresa_id, barcode), y el manejador
        // de ER_DUP_ENTRY del final traduce el fallo. El aviso temprano vive en
        // GET /check-isbn, que es donde sirve: mientras se teclea.

        const rama = esAdulto(is_adult);

        // Upload Image to GCS
        let imageUrl = null;
        if (req.file) {
            try {
                imageUrl = await uploadFileToGCS(req.file);
            } catch (uploadError) {
                return res.status(500).json({ error: 'Error al subir la imagen' });
            }
        }

        let categoryId;
        try {
            categoryId = await resolverCategoria(category, rama);
        } catch (e) {
            return res.status(400).json({ error: e.message });
        }
        const publisherId = await resolverEditorial(publisher);

        // Codigo de barras automatico si no se captura uno.
        //
        // Antes solo se generaba cuando el producto traia categoria, asi que
        // los que no la tenian quedaban sin codigo y no se podian escanear. Y
        // si la generacion fallaba se seguia en silencio: el producto nacia sin
        // etiqueta posible y nadie se enteraba hasta el mostrador.
        let finalBarcode = barcode;
        if (!barcode) {
            finalBarcode = await generarCodigoParaEmpresa(pool, empresaId);
        }

        const [result] = await pool.query(`
            INSERT INTO products (
                empresa_id, name, series, volume, cost_price, sale_price, stock, category, category_id,
                barcode, isbn, extras, publication_date, publisher, publisher_id, page_count, dimensions,
                weight, page_color, language, format_id, supplier_id, supplier_price, image_url, gender,
                is_adult, artist, group_name, events, sinopsis, sinopsis_fuente
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            empresaId, name, nulo(series), aEntero(volume), cost_price, sale_price, stock || 0,
            nulo(category), categoryId, finalBarcode || null, nulo(isbn), nulo(extras),
            nulo(publication_date), nulo(publisher), publisherId, aEntero(page_count), nulo(dimensions),
            nulo(weight), nulo(page_color), nulo(language), aEntero(format_id), aEntero(supplier_id),
            nulo(supplier_price), imageUrl, null,
            rama, nulo(artist), nulo(group_name), nulo(events), nulo(sinopsis), nulo(sinopsis_fuente)
        ]);

        res.json({
            message: 'Producto creado correctamente',
            id: result.insertId,
            barcode: finalBarcode,
            image_url: imageUrl
        });

        // Save tags asynchronously (don't block the response)
        const tags = req.body.tags;
        if (tags) {
            try {
                await saveProductTags(pool, result.insertId, empresaId, tags);
            } catch (tagError) {
                console.error('Error saving tags:', tagError);
            }
        }
    } catch (error) {
        // La unicidad y la coherencia de rama las impone la base, no un SELECT
        // previo. Si dos altas simultaneas mandan el mismo codigo, aqui llega
        // la segunda.
        const traducido = traducirErrorDeBase(error);
        if (traducido) return res.status(traducido.status).json({ error: traducido.error });

        console.error('Create product error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Update product - PROTECTED: requires admin role
router.put('/:id', requireInventoryWrite, upload.single('image'), async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { name, series, volume, cost_price, sale_price, stock, category, gender, barcode, isbn,
            extras, publication_date, publisher, page_count, dimensions, weight, page_color,
            language, format_id, supplier_id, supplier_price, is_adult, artist, group_name,
            events, sinopsis, sinopsis_fuente } = req.body;
        const { id } = req.params;

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        // Verify product belongs to user's empresa
        const [productRows] = await pool.query('SELECT id, image_url FROM products WHERE id = ? AND empresa_id = ?', [id, empresaId]);
        if (productRows.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        if (!sinopsis || !sinopsis.trim()) {
            return res.status(400).json({ error: 'La sinopsis es obligatoria' });
        }

        let imageUrl = productRows[0].image_url;

        // Check JSON content type too, sometimes image isn't updated
        // Upload New Image if present
        if (req.file) {
            try {
                imageUrl = await uploadFileToGCS(req.file);
            } catch (uploadError) {
                return res.status(500).json({ error: 'Error al subir la imagen' });
            }
        }

        const rama = esAdulto(is_adult);

        let categoryId;
        try {
            categoryId = await resolverCategoria(category, rama);
        } catch (e) {
            return res.status(400).json({ error: e.message });
        }
        const publisherId = await resolverEditorial(publisher);

        // El UPDATE no tocaba category_id ni publisher_id: al cambiar la
        // categoria de un producto, el texto se movia y el id se quedaba
        // apuntando a la anterior. La tienda filtra por id, el POS muestra el
        // texto, y el producto aparecia en dos categorias distintas segun donde
        // se mirara.
        await pool.query(`
            UPDATE products SET
                name = ?, series = ?, volume = ?, cost_price = ?, sale_price = ?, stock = ?,
                category = ?, category_id = ?, gender = ?, barcode = ?, isbn = ?, extras = ?,
                publication_date = ?, publisher = ?, publisher_id = ?, page_count = ?,
                dimensions = ?, weight = ?, page_color = ?, language = ?, format_id = ?,
                supplier_id = ?, supplier_price = ?, image_url = ?, is_adult = ?, artist = ?,
                group_name = ?, events = ?, sinopsis = ?, sinopsis_fuente = ?
            WHERE id = ? AND empresa_id = ?
        `, [
            name, nulo(series), aEntero(volume), cost_price, sale_price, stock || 0,
            nulo(category), categoryId, null, nulo(barcode), nulo(isbn), nulo(extras),
            nulo(publication_date), nulo(publisher), publisherId, aEntero(page_count),
            nulo(dimensions), nulo(weight), nulo(page_color), nulo(language), aEntero(format_id),
            aEntero(supplier_id), nulo(supplier_price), imageUrl, rama, nulo(artist),
            nulo(group_name), nulo(events), nulo(sinopsis), nulo(sinopsis_fuente),
            id, empresaId
        ]);

        // Save tags
        const tags = req.body.tags;
        if (tags !== undefined) {
            try {
                await saveProductTags(pool, id, empresaId, tags);
            } catch (tagError) {
                console.error('Error saving tags:', tagError);
            }
        }

        res.json({ message: 'Producto actualizado correctamente', image_url: imageUrl });
    } catch (error) {
        const traducido = traducirErrorDeBase(error);
        if (traducido) return res.status(traducido.status).json({ error: traducido.error });

        console.error('Update product error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Bulk update events (rotation) - PATCH /rotation
router.patch('/rotation', requireInventoryWrite, async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        if (!empresaId) return res.status(403).json({ error: 'Acceso denegado.' });

        const { updates } = req.body; // [{ id, events }]
        if (!Array.isArray(updates) || updates.length === 0) {
            return res.status(400).json({ error: 'updates array requerido' });
        }

        // Merge events instead of replace — preserves general/adult keys independently
        await Promise.all(updates.map(async ({ id, events }) => {
            const [rows] = await pool.query(
                'SELECT events FROM products WHERE id = ? AND empresa_id = ?',
                [id, empresaId]
            );
            let current = {};
            if (rows[0]?.events) {
                try { current = typeof rows[0].events === 'string' ? JSON.parse(rows[0].events) : rows[0].events; } catch {}
            }
            const merged = { ...current, ...events };
            return pool.query(
                'UPDATE products SET events = ? WHERE id = ? AND empresa_id = ?',
                [JSON.stringify(merged), id, empresaId]
            );
        }));

        res.json({ success: true, updated: updates.length });
    } catch (err) {
        console.error('Rotation update error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete product - PROTECTED: requires admin role
router.delete('/:id', requireInventoryWrite, async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { id } = req.params;

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        // Verify product belongs to user's empresa
        const [productRows] = await pool.query('SELECT id, name FROM products WHERE id = ? AND empresa_id = ?', [id, empresaId]);
        const product = productRows[0];

        if (!product) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        // Check for force delete
        const force = req.query.force === 'true';

        if (force) {
            // Force Delete: Remove related sale items first
            console.log(`Force deleting product ${id} and its history...`);

            // 1. Get sales that contain this product
            const [relatedSales] = await pool.query(`
                SELECT DISTINCT sale_id FROM sale_items WHERE product_id = ?
            `, [id]);

            // 2. Delete items
            await pool.query('DELETE FROM sale_items WHERE product_id = ?', [id]);

            // 3. Cleanup empty sales (orphaned headers)
            for (const sale of relatedSales) {
                const [remainingItems] = await pool.query('SELECT COUNT(*) as count FROM sale_items WHERE sale_id = ?', [sale.sale_id]);
                if (remainingItems[0].count === 0) {
                    await pool.query('DELETE FROM sales WHERE id = ?', [sale.sale_id]);
                } else {
                    // Start Recalculate Total for split sales
                    const [newTotal] = await pool.query('SELECT SUM(price * quantity) as total FROM sale_items WHERE sale_id = ?', [sale.sale_id]);
                    await pool.query('UPDATE sales SET total = ? WHERE id = ?', [newTotal[0].total || 0, sale.sale_id]);
                }
            }
        }

        await pool.query('DELETE FROM products WHERE id = ? AND empresa_id = ?', [id, empresaId]);
        res.json({ message: `Producto "${product.name}" eliminado correctamente` });
    } catch (error) {
        console.error('Delete product error:', error);
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({
                error: 'No se puede eliminar este producto porque tiene ventas o registros asociados. Considere desactivarlo o cambiar el stock a 0.'
            });
        }
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Bulk create products (for setup wizard) - PROTECTED: requires admin role
router.post('/bulk', requireInventoryWrite, async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { products } = req.body;

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        if (!products || !Array.isArray(products)) {
            return res.status(400).json({ error: 'Se requiere un array de productos' });
        }

        // Check product limit
        const [empresaRows] = await pool.query('SELECT max_productos FROM empresas WHERE id = ?', [empresaId]);
        const empresa = empresaRows[0];
        const [productCountRows] = await pool.query('SELECT COUNT(*) as count FROM products WHERE empresa_id = ?', [empresaId]);
        const productCount = productCountRows[0];

        if (productCount.count + products.length > empresa.max_productos) {
            return res.status(400).json({
                error: `Límite de productos alcanzado. Puede añadir máximo ${empresa.max_productos - productCount.count} productos más.`
            });
        }

        for (const product of products) {
            await pool.query(
                `INSERT INTO products (empresa_id, name, series, volume, sale_price, stock, category,
                                       isbn, extras, publication_date, publisher, page_count,
                                       dimensions, weight, page_color, language)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [empresaId, product.name, nulo(product.series), aEntero(product.volume),
                    product.sale_price ?? product.price, product.stock || 0, nulo(product.category),
                    nulo(product.isbn), nulo(product.extras), nulo(product.publication_date),
                    nulo(product.publisher), aEntero(product.page_count), nulo(product.dimensions),
                    nulo(product.weight), nulo(product.page_color), nulo(product.language)]
            );
        }

        res.json({ message: `${products.length} productos creados correctamente` });
    } catch (error) {
        const traducido = traducirErrorDeBase(error);
        if (traducido) return res.status(traducido.status).json({ error: traducido.error });

        console.error('Bulk create products error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Print label directly to printer
const __dirname = path.dirname(fileURLToPath(import.meta.url));

router.post('/print-label', async (req, res) => {
    try {
        const empresaId = getEmpresaId(req);
        const { product } = req.body;

        if (!empresaId) {
            return res.status(403).json({ error: 'Acceso denegado. Usuario sin empresa asignada.' });
        }

        if (!product) {
            return res.status(400).json({ error: 'Datos del producto requeridos' });
        }

        // Verify product belongs to user's empresa
        const [dbProductRows] = await pool.query('SELECT id FROM products WHERE id = ? AND empresa_id = ?', [product.id, empresaId]);
        if (dbProductRows.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        // El codigo de barras primero, no el ISBN. La etiqueta se imprime para
        // escanearla en el mostrador y `barcode` es el que siempre existe —
        // se genera solo en el alta. El ISBN puede faltar (figuras, mercancia)
        // y ademas no todos los ISBN son EAN-13 imprimibles.
        const codeToPrint = product.barcode || product.isbn;
        if (!codeToPrint) {
            return res.status(400).json({ error: 'El producto no tiene código para imprimir' });
        }

        // Stream PDF directly to client
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="label.pdf"');

        // Create PDF (50mm x 25mm = ~141.7pt x ~70.9pt)
        const doc = new PDFDocument({
            size: [141.73, 70.87],
            margin: 0,
            autoFirstPage: true
        });

        doc.pipe(res);

        // Generate barcode buffer
        const png = await bwipjs.toBuffer({
            bcid: 'code128',
            text: codeToPrint,
            scale: 2,
            height: 10,
            includetext: true,
            textxalign: 'center',
        });

        // Add Product Name (centered, small font)
        doc.font('Helvetica-Bold').fontSize(8);

        // Truncate name if too long
        let name = product.name;
        if (name.length > 22) name = name.substring(0, 22) + '...';

        doc.text(name, 0, 5, {
            align: 'center',
            width: 141.73
        });

        // Add Barcode Image
        doc.image(png, 23, 18, {
            fit: [95, 35],
            align: 'center',
            valign: 'center'
        });

        // Add Price
        const priceToPrint = Number(product.sale_price || product.price || 0);
        doc.fontSize(8).text(`$${priceToPrint.toFixed(2)}`, 0, 58, {
            align: 'center',
            width: 141.73
        });

        doc.end();

    } catch (error) {
        console.error('Print label error:', error);
        // Only send JSON if headers haven't been sent yet
        if (!res.headersSent) {
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
});

// Helper: Save product tags (create new tags on-the-fly, manage junction table)
async function saveProductTags(pool, productId, empresaId, tagsInput) {
    // Parse tags — accept JSON string or array
    let tagNames = [];
    if (typeof tagsInput === 'string') {
        try {
            tagNames = JSON.parse(tagsInput);
        } catch {
            tagNames = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
        }
    } else if (Array.isArray(tagsInput)) {
        tagNames = tagsInput.map(t => t.trim()).filter(Boolean);
    }

    // Remove duplicates
    tagNames = [...new Set(tagNames)];

    // Clear existing product_tags for this product
    await pool.query('DELETE FROM product_tags WHERE product_id = ?', [productId]);

    if (tagNames.length === 0) return;

    // For each tag name, get or create the tag, then insert the junction row
    for (const tagName of tagNames) {
        // INSERT IGNORE to handle the unique constraint gracefully
        await pool.query(
            'INSERT IGNORE INTO tags (empresa_id, name) VALUES (?, ?)',
            [empresaId, tagName]
        );

        // Get the tag id
        const [tagRows] = await pool.query(
            'SELECT id FROM tags WHERE empresa_id = ? AND name = ?',
            [empresaId, tagName]
        );

        if (tagRows.length > 0) {
            await pool.query(
                'INSERT IGNORE INTO product_tags (product_id, tag_id) VALUES (?, ?)',
                [productId, tagRows[0].id]
            );
        }
    }
}

export default router;

