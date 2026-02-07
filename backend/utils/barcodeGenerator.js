/**
 * EAN-13 Barcode Generator for Torlan POS
 * 
 * Formula: 2-EEE-CC-MM-SSSS-D (13 digits)
 * - P (1 digit): Prefix '2' (private use in EAN-13)
 * - EEE (3 digits): Empresa ID
 * - CC (2 digits): Category ID
 * - MM (2 digits): Publisher ID (00 if null)
 * - SSSS (4 digits): Sequential count
 * - D (1 digit): EAN-13 check digit
 */

/**
 * Calculate EAN-13 check digit
 * @param {string} code12 - First 12 digits of barcode
 * @returns {string} Single check digit (0-9)
 */
function calculateEAN13CheckDigit(code12) {
    if (code12.length !== 12) {
        throw new Error('Code must be exactly 12 digits');
    }

    let sum = 0;
    for (let i = 0; i < 12; i++) {
        const digit = parseInt(code12[i]);
        // Odd positions (1st, 3rd, 5th...) get weight 1
        // Even positions (2nd, 4th, 6th...) get weight 3
        sum += (i % 2 === 0) ? digit : digit * 3;
    }

    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit.toString();
}

/**
 * Generate EAN-13 barcode
 * @param {number} empresaId - Company ID
 * @param {number} categoryId - Category ID
 * @param {number|null} publisherId - Publisher ID (null = 00)
 * @param {number} sequence - Sequential count for this combination
 * @returns {string} 13-digit EAN-13 barcode
 */
function generateEAN13(empresaId, categoryId, publisherId, sequence) {
    // Validate inputs
    if (!empresaId || empresaId < 0) {
        throw new Error('Invalid empresa_id');
    }
    if (!categoryId || categoryId < 0) {
        throw new Error('Invalid category_id');
    }
    if (sequence < 0) {
        throw new Error('Invalid sequence');
    }

    // Build components
    const P = '2'; // Prefix for private/internal use
    const EEE = empresaId.toString().padStart(3, '0').slice(-3); // Last 3 digits
    const CC = categoryId.toString().padStart(2, '0').slice(-2); // Last 2 digits
    const MM = (publisherId || 0).toString().padStart(2, '0').slice(-2); // Last 2 digits
    const SSSS = sequence.toString().padStart(4, '0').slice(-4); // Last 4 digits

    // Combine first 12 digits
    const first12 = P + EEE + CC + MM + SSSS;

    // Calculate check digit
    const checkDigit = calculateEAN13CheckDigit(first12);

    return first12 + checkDigit;
}

/**
 * Get sequential count for barcode generation
 * @param {object} pool - MySQL pool connection
 * @param {number} empresaId - Company ID
 * @param {number} categoryId - Category ID  
 * @param {number|null} publisherId - Publisher ID
 * @returns {Promise<number>} Next sequence number
 */
async function getProductSequence(pool, empresaId, categoryId, publisherId) {
    const [rows] = await pool.execute(
        `SELECT COUNT(*) as count FROM products 
         WHERE empresa_id = ? 
         AND category_id = ? 
         AND (publisher_id = ? OR (publisher_id IS NULL AND ? IS NULL))`,
        [empresaId, categoryId, publisherId, publisherId]
    );

    return rows[0].count + 1;
}

/**
 * Validate EAN-13 barcode format and check digit
 * @param {string} barcode - Barcode to validate
 * @returns {boolean} True if valid EAN-13
 */
function validateEAN13(barcode) {
    if (!barcode || typeof barcode !== 'string') {
        return false;
    }

    // Must be exactly 13 digits
    if (!/^\d{13}$/.test(barcode)) {
        return false;
    }

    // Verify check digit
    const first12 = barcode.substring(0, 12);
    const providedCheckDigit = barcode[12];
    const calculatedCheckDigit = calculateEAN13CheckDigit(first12);

    return providedCheckDigit === calculatedCheckDigit;
}

export {
    generateEAN13,
    getProductSequence,
    calculateEAN13CheckDigit,
    validateEAN13
};
