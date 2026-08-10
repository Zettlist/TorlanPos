/**
 * Generador de codigos de barra EAN-13 para uso interno.
 *
 * ─── Formato ────────────────────────────────────────────────────────────────
 *
 *   2 · EEE · SSSSSSSS · D          (13 digitos)
 *
 *   2         Prefijo de uso privado. EAN-13 reserva 20-29 para codigos
 *             internos que no salen de la tienda, que es justo este caso.
 *   EEE       Empresa (3 digitos).
 *   SSSSSSSS  Secuencia por empresa (8 digitos) = 100 millones de productos.
 *   D         Digito verificador EAN-13.
 *
 * ─── Por que cambio el formato ──────────────────────────────────────────────
 *
 * El anterior era 2-EEE-CC-MM-SSSS-D, con CC = categoria y MM = editorial
 * recortadas a dos digitos. Eso producia choques silenciosos:
 *
 *   · Las categorias 5 y 105 daban ambas "05". Lo mismo editoriales 3 y 103.
 *   · La secuencia de 4 digitos se envolvia al llegar a 10000 -> "0000".
 *   · Un producto sin categoria no recibia codigo: la generacion se saltaba.
 *
 * Y esos digitos no servian para nada: nada en el sistema lee el codigo para
 * recuperar categoria o editorial. Solo se escanea para encontrar el producto.
 * Quitarlos libera espacio para una secuencia que no se desborda.
 *
 * Los codigos ya impresos siguen siendo validos: se escanean igual, porque la
 * busqueda es por coincidencia exacta contra la columna, no por decodificacion.
 */

const PREFIJO = '2';
const MAX_EMPRESA = 999;
const MAX_SECUENCIA = 99_999_999;

/**
 * Digito verificador EAN-13: posiciones impares peso 1, pares peso 3.
 * @param {string} code12
 * @returns {string}
 */
function calculateEAN13CheckDigit(code12) {
    if (!/^\d{12}$/.test(code12)) {
        throw new Error('El codigo base debe ser exactamente 12 digitos');
    }
    let suma = 0;
    for (let i = 0; i < 12; i++) {
        suma += (i % 2 === 0) ? +code12[i] : +code12[i] * 3;
    }
    return String((10 - (suma % 10)) % 10);
}

/**
 * Arma el EAN-13 a partir de empresa y secuencia.
 *
 * Falla en vez de recortar: antes se usaba `.slice(-3)` sobre el id de empresa,
 * asi que la empresa 1001 generaba los mismos codigos que la 1 sin avisar.
 *
 * @param {number} empresaId
 * @param {number} secuencia
 * @returns {string} 13 digitos
 */
function generateEAN13(empresaId, secuencia) {
    if (!Number.isInteger(empresaId) || empresaId < 1 || empresaId > MAX_EMPRESA) {
        throw new Error(
            `empresa_id ${empresaId} fuera de rango para el formato de codigo (1-${MAX_EMPRESA}). ` +
            `Ampliar el formato antes de dar de alta esta empresa.`
        );
    }
    if (!Number.isInteger(secuencia) || secuencia < 1 || secuencia > MAX_SECUENCIA) {
        throw new Error(
            `Secuencia ${secuencia} fuera de rango (1-${MAX_SECUENCIA}). ` +
            `La empresa agoto su espacio de codigos.`
        );
    }

    const base = PREFIJO
        + String(empresaId).padStart(3, '0')
        + String(secuencia).padStart(8, '0');

    return base + calculateEAN13CheckDigit(base);
}

/**
 * Reserva el siguiente numero de secuencia de forma atomica.
 *
 * `LAST_INSERT_ID(expr)` fija el valor devuelto por LAST_INSERT_ID() dentro de
 * la misma conexion, asi que la reserva y la lectura son una sola operacion:
 * dos altas simultaneas obtienen numeros distintos sin necesidad de bloquear.
 *
 * Un numero reservado no vuelve a entregarse aunque el producto se borre.
 * Eso es deliberado: los codigos se imprimen en etiquetas fisicas y reutilizar
 * uno significaria dos articulos distintos con la misma etiqueta en la tienda.
 *
 * @param {object} ejecutor pool o conexion (debe soportar .query)
 * @param {number} empresaId
 * @returns {Promise<number>}
 */
async function reservarSecuencia(ejecutor, empresaId) {
    // LAST_INSERT_ID() es POR CONEXION. Si `ejecutor` es un pool, el INSERT y
    // el SELECT que lo lee pueden caer en conexiones distintas y devolver el
    // valor de otra reserva: con 50 altas simultaneas sobre un pool de 20 se
    // obtenian 20 codigos para las 50. Hay que tomar una conexion y usar la
    // misma para las dos sentencias.
    const esPool = typeof ejecutor.getConnection === 'function';
    const conn = esPool ? await ejecutor.getConnection() : ejecutor;

    try {
        // Las DOS ramas fijan LAST_INSERT_ID explicitamente. Es facil escribir
        // `VALUES (?, 1)` y leerlo despues, pero cuando la sentencia no lo fija
        // LAST_INSERT_ID() conserva el de la anterior: como esta tabla no tiene
        // AUTO_INCREMENT, el primer producto de una empresa recibia una
        // secuencia arbitraria en vez de 1.
        await conn.query(
            `INSERT INTO barcode_sequences (empresa_id, next_seq) VALUES (?, LAST_INSERT_ID(1))
             ON DUPLICATE KEY UPDATE next_seq = LAST_INSERT_ID(next_seq + 1)`,
            [empresaId]
        );
        const [[fila]] = await conn.query('SELECT LAST_INSERT_ID() AS seq');
        return Number(fila.seq);
    } finally {
        if (esPool) conn.release();
    }
}

/**
 * Reserva secuencia y devuelve el codigo listo para guardar.
 * @param {object} ejecutor
 * @param {number} empresaId
 * @returns {Promise<string>}
 */
async function generarCodigoParaEmpresa(ejecutor, empresaId) {
    const secuencia = await reservarSecuencia(ejecutor, empresaId);
    return generateEAN13(empresaId, secuencia);
}

/**
 * Valida formato y digito verificador.
 * @param {string} barcode
 * @returns {boolean}
 */
function validateEAN13(barcode) {
    if (typeof barcode !== 'string' || !/^\d{13}$/.test(barcode)) return false;
    return barcode[12] === calculateEAN13CheckDigit(barcode.slice(0, 12));
}

export {
    generateEAN13,
    reservarSecuencia,
    generarCodigoParaEmpresa,
    calculateEAN13CheckDigit,
    validateEAN13,
    MAX_EMPRESA,
    MAX_SECUENCIA,
};
