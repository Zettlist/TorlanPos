import { API_URL } from '../config';

/**
 * Sends a print request to the backend for direct printing.
 * 
 * @param {Object} product - The product object
 * @param {string} token - Auth token
 */
export const generateProductLabel = async (product, token) => {
    // Determine which code to use: ISBN > SBIN > Barcode
    const codeToPrint = product.isbn || product.sbin_code || product.barcode;

    if (!product || !codeToPrint) {
        console.error('Cannot generate label: Product or Code missing');
        alert('No se encontró un código (ISBN, SBIN o Código de Barras) para generar la etiqueta.');
        return;
    }

    if (!token) {
        alert('Error de autenticación. Por favor recarga la página.');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/products/print-label`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ product })
        });

        if (!response.ok) {
            let errorMessage = 'Error al generar etiqueta';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                // If response is not JSON (e.g. server error HTML), verify status text
                errorMessage = response.statusText || errorMessage;
            }
            throw new Error(errorMessage);
        }

        // Get PDF Blob
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);

        // Create invisible iframe to trigger print
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.src = url;
        document.body.appendChild(iframe);

        iframe.onload = () => {
            try {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
            } catch (e) {
                console.error('Print trigger error:', e);
                alert('No se pudo abrir el diálogo de impresión automáticamente. Por favor permita ventanas emergentes.');
                window.open(url, '_blank');
            }

            // Cleanup after a delay to allow print dialog to work
            setTimeout(() => {
                document.body.removeChild(iframe);
                window.URL.revokeObjectURL(url);
            }, 60000); // 1 minute timeout
        };
    } catch (error) {
        console.error('Error generating label:', error);
        alert(`Error al imprimir: ${error.message}`);
    }
};
