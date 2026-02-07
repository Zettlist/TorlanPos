import { useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export default function ComprobantePublico() {
    const [orderData, setOrderData] = useState(null);
    const [receiptImageURL, setReceiptImageURL] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Format price helper
    const formatPrice = (price) => {
        return parseFloat(price).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    };

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const reciboData = params.get('recibo');

        if (reciboData) {
            try {
                const parsedData = JSON.parse(decodeURIComponent(reciboData));
                setOrderData(parsedData);
            } catch (err) {
                console.error('Error parsing receipt data:', err);
                setError('Datos del comprobante inválidos');
            }
        } else {
            setError('No se encontró información del comprobante');
        }
        setLoading(false);
    }, []);

    const generateReceipt = async () => {
        if (!orderData) return;

        try {
            // Load template image
            const templateImg = new Image();
            templateImg.crossOrigin = 'anonymous';

            templateImg.onload = () => {
                // Create canvas with template dimensions
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = templateImg.width;
                canvas.height = templateImg.height;

                // Draw template
                ctx.drawImage(templateImg, 0, 0);

                // Overlay data
                // Calculate generic responsive coordinates
                const w = canvas.width;
                const h = canvas.height;

                // Configure text style
                ctx.fillStyle = '#5A5A5A';
                ctx.font = `bold ${w * 0.035}px Arial`; // Responsively scaled font
                ctx.textAlign = 'center'; // Center text in boxes

                // FECHA (Date) - Top left box
                // Center matches approx 30% of width, 55% -> 58% of height
                ctx.fillText(orderData.lastPaymentDate || '', w * 0.30, h * 0.58);

                // ANTICIPO (Advance) - Top right box  
                // Center matches approx 70% of width, 55% -> 58% of height
                ctx.fillText(`$${formatPrice(orderData.totalPaid || 0)}`, w * 0.70, h * 0.58);

                // PRODUCTO (Product) - Middle box
                // Center matches 50% of width, 69% -> 72% of height
                ctx.fillText((orderData.title || '').substring(0, 40), w * 0.50, h * 0.72);

                // Fecha de Pago (Payment Date) - Bottom
                // Left aligned in small box
                // 65% width, 79% -> 82% height
                ctx.textAlign = 'left';
                ctx.font = `bold ${w * 0.025}px Arial`;
                ctx.fillText(orderData.lastPaymentDate || '', w * 0.65, h * 0.82);

                // Convert to image
                const imageURL = canvas.toDataURL('image/png');
                setReceiptImageURL(imageURL);
            };

            templateImg.onerror = () => {
                setError('Error al cargar la plantilla del comprobante');
            };

            // Load template from public folder
            templateImg.src = '/templates/comprobante-template.png';

        } catch (err) {
            console.error('Error generating receipt:', err);
            setError('Error al generar la imagen del comprobante');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
                <div className="bg-white p-6 rounded-lg shadow-lg text-center max-w-md w-full">
                    <div className="text-red-500 text-5xl mb-4">⚠️</div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">Error</h2>
                    <p className="text-gray-600">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 py-8 px-4 flex flex-col items-center justify-center">
            <div className="max-w-md w-full bg-white rounded-xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="bg-green-600 p-6 text-center">
                    <h1 className="text-2xl font-bold text-white mb-1">Comprobante de Pago</h1>
                    <p className="text-green-100 text-sm">Escanea para descargar tu recibo</p>
                </div>

                <div className="p-6">
                    {/* Order Details Preview */}
                    {!receiptImageURL && (
                        <div className="space-y-4 mb-6">
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-gray-500 text-sm">Orden:</span>
                                    <span className="font-bold text-gray-800">#{orderData.orderNumber}</span>
                                </div>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-gray-500 text-sm">Producto:</span>
                                    <span className="font-medium text-gray-800 text-right truncate w-40">{orderData.title}</span>
                                </div>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-gray-500 text-sm">Total Pagado:</span>
                                    <span className="font-bold text-green-600">${formatPrice(orderData.totalPaid)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-500 text-sm">Fecha:</span>
                                    <span className="text-gray-800">{orderData.lastPaymentDate}</span>
                                </div>
                            </div>

                            <button
                                onClick={generateReceipt}
                                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg shadow-lg transform transition hover:scale-105 flex items-center justify-center gap-2"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                GENERAR COMPROBANTE
                            </button>
                        </div>
                    )}

                    {/* Generated Receipt Image */}
                    {receiptImageURL && (
                        <div className="space-y-4 animate-fade-in">
                            <div className="relative group">
                                <img
                                    src={receiptImageURL}
                                    alt="Comprobante"
                                    className="w-full rounded-lg shadow-md"
                                />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                                    <span className="text-white font-medium">Vista Previa</span>
                                </div>
                            </div>

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 text-center">
                                Tip: Mantén presionada la imagen para guardarla en tu galería.
                            </div>

                            <a
                                href={receiptImageURL}
                                download={`Comprobante-${orderData.orderNumber}.png`}
                                className="block w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg text-center shadow-lg transform transition hover:scale-105"
                            >
                                📥 DESCARGAR AHORA
                            </a>

                            <button
                                onClick={() => setReceiptImageURL(null)}
                                className="block w-full text-gray-500 hover:text-gray-700 text-sm py-2"
                            >
                                ← Volver
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 text-center">
                    <p className="text-xs text-gray-400">Torlan POS System</p>
                </div>
            </div>
        </div>
    );
}
