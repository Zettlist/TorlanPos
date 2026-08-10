/**
 * Busca la sinopsis de un producto en catalogos publicos y devuelve el texto
 * tal cual, para que una persona lo pegue o lo corrija.
 *
 * ─── Que NO hace ────────────────────────────────────────────────────────────
 *
 * No redacta. No hay modelo de lenguaje aqui. Lo que devuelve es texto que ya
 * existe en un catalogo publico, con la URL de donde salio; si ninguna fuente
 * conoce el titulo, devuelve la lista vacia y el campo se queda en blanco.
 * Un modelo llenaria el hueco inventando la trama, que en la ficha de un manga
 * real es una devolucion, no un error cosmetico.
 *
 * ─── Fuentes, en orden ──────────────────────────────────────────────────────
 *
 *   1. Google Books por ISBN.  El texto del editor para *esa* edicion, en el
 *      idioma en que se publico. Es el mejor resultado cuando hay ISBN.
 *      Necesita GOOGLE_BOOKS_API_KEY: sin llave la API responde 429 en cuanto
 *      la IP compartida agota la cuota anonima, que en Cloud Run es siempre.
 *   2. Open Library por ISBN.  Sin llave, cobertura desigual en manga en
 *      espanol, pero cuando acierta trae el texto del editor.
 *   3. AniList por titulo.  Cobertura de manga excelente y sin llave, pero
 *      devuelve ingles y describe la *obra*, no el tomo. Se marca como tal:
 *      el texto sirve de punto de partida y hay que traducirlo.
 *
 * Se consultan todas y se devuelven todas las que respondan, ordenadas. Elegir
 * es mas rapido que buscar, y ver dos versiones deja claro cual encaja.
 *
 * ─── Sobre el texto que devuelve ────────────────────────────────────────────
 *
 * Es material del editor y esta bajo su derecho de autor. Los editores lo
 * distribuyen justo para que las librerias lo usen, asi que pegarlo tal cual
 * es la practica normal del sector, pero conviene editarlo: la ficha queda
 * mejor y deja de ser una copia. Por eso `sinopsis_fuente` guarda la URL —
 * para poder atribuir el texto y para saber que revisar si la fuente cambia.
 */

const TIMEOUT_MS = 6000;

/** fetch con limite de tiempo. Una fuente lenta no debe colgar el formulario. */
async function get(url, opciones = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const r = await fetch(url, { ...opciones, signal: ctrl.signal });
        if (!r.ok) return null;
        return await r.json();
    } catch {
        return null;      // red caida, timeout o JSON invalido: esta fuente no aporta
    } finally {
        clearTimeout(t);
    }
}

/** Quita el HTML que algunas fuentes incrustan en la descripcion. */
function limpiar(texto) {
    if (!texto) return '';
    return String(texto)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Normaliza un ISBN a solo digitos y X. Los catalogos no aceptan guiones. */
const normalizarIsbn = (v) => String(v || '').replace(/[^0-9Xx]/g, '').toUpperCase();

async function googleBooks(isbn) {
    const llave = process.env.GOOGLE_BOOKS_API_KEY;
    const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`
        + (llave ? `&key=${encodeURIComponent(llave)}` : '');
    const j = await get(url);
    const vol = j?.items?.[0]?.volumeInfo;
    const texto = limpiar(vol?.description);
    if (!texto) return null;
    return {
        fuente: 'Google Books',
        idioma: vol.language || null,
        texto,
        url: vol.infoLink || `https://books.google.com/books?vid=ISBN${isbn}`,
        // El editor describe esta edicion concreta, no la obra entera.
        nota: null,
    };
}

// El campo llega como cadena o como { type, value } segun la antiguedad del
// registro de Open Library. Las dos formas conviven en la misma API.
const descOL = (d) => limpiar(typeof d === 'object' ? d?.value : d);

async function openLibrary(isbn) {
    const edicion = await get(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`);
    if (!edicion) return null;

    let texto = descOL(edicion.description);

    // Casi ninguna *edicion* de Open Library trae descripcion; la que la tiene
    // es la *obra*. Sin este segundo salto la fuente responde 200 y vacio
    // siempre, que parece "no lo conoce" cuando en realidad si lo conoce.
    if (!texto && edicion.works?.[0]?.key) {
        const obra = await get(`https://openlibrary.org${edicion.works[0].key}.json`);
        texto = descOL(obra?.description);
    }
    if (!texto) return null;

    return {
        fuente: 'Open Library',
        idioma: null,
        texto,
        url: `https://openlibrary.org/isbn/${isbn}`,
        nota: null,
    };
}

const ANILIST_QUERY = `
query ($busqueda: String) {
  Media (search: $busqueda, type: MANGA) {
    title { romaji english }
    description(asHtml: false)
    siteUrl
  }
}`;

async function anilist(titulo) {
    const j = await get('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ANILIST_QUERY, variables: { busqueda: titulo } }),
    });
    const m = j?.data?.Media;
    const texto = limpiar(m?.description);
    if (!texto) return null;
    return {
        fuente: 'AniList',
        idioma: 'en',
        texto,
        url: m.siteUrl,
        // Dos avisos que cambian como se usa el texto, asi que van visibles.
        nota: 'En ingles y sobre la serie completa, no sobre este tomo. Traducir antes de publicar.',
    };
}

/**
 * Devuelve las sinopsis encontradas, mejor primero.
 *
 * @param {{ isbn?: string, titulo?: string, serie?: string }} datos
 * @returns {Promise<Array<{fuente,idioma,texto,url,nota}>>}
 */
export async function buscarSinopsis({ isbn, titulo, serie } = {}) {
    const codigo = normalizarIsbn(isbn);
    // AniList indexa por el nombre de la obra: la serie acierta mas que el
    // titulo del tomo, que suele traer "Vol. 7" pegado y no encuentra nada.
    const busqueda = (serie || titulo || '').trim();

    const tareas = [];
    if (codigo.length === 10 || codigo.length === 13) {
        tareas.push(googleBooks(codigo), openLibrary(codigo));
    }
    if (busqueda) tareas.push(anilist(busqueda));

    if (tareas.length === 0) return [];

    // En paralelo: son tres peticiones a servidores distintos y en serie el
    // formulario esperaria la suma de las tres.
    const resultados = await Promise.all(tareas);
    return resultados.filter(Boolean);
}

export default { buscarSinopsis };
