import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import jsPDF from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';
import { API_URL } from '../config';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// Simple Modal Component
const Modal = ({ type, title, isOpen, onClose, children }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
            <div className="bg-slate-800 rounded-xl shadow-2xl border border-slate-700 w-full max-w-2xl overflow-hidden animate-scale-in">
                <div className="flex justify-between items-center p-4 border-b border-slate-700 bg-slate-900/50">
                    <h3 className="text-xl font-bold text-white">{title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="p-6 max-h-[70vh] overflow-y-auto">
                    {children}
                </div>
                <div className="p-4 border-t border-slate-700 bg-slate-900/50 flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors">
                        Cerrar
                    </button>
                    {type === 'order' && (
                        <button className="ml-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                            Imprimir Recibo
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default function Preventas() {
    // Helper function to format prices with thousand separators
    const formatPrice = (price) => {
        return parseFloat(price).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    };

    const [items, setItems] = useState([]);
    const [formData, setFormData] = useState({
        // Client Information
        clientName: '',
        clientPhone: '',
        clientEmail: '',
        clientAddress: '',
        // Product Information
        totalPrice: '',
        deposit: '',
        title: '',
        artist: '',
        group: '',
        language: '',
        category: '',
        pages: '',
        isbn: '',
        photo: null
    });

    // Modal States
    const [selectedClient, setSelectedClient] = useState(null);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [showLiquidateModal, setShowLiquidateModal] = useState(false);
    const [liquidateAmount, setLiquidateAmount] = useState('');
    const [showQRModal, setShowQRModal] = useState(false);
    const [qrCodeURL, setQrCodeURL] = useState('');
    const [showQRDownload, setShowQRDownload] = useState(false);
    const [qrOrderData, setQrOrderData] = useState(null);
    const [receiptImageURL, setReceiptImageURL] = useState(null);

    // Fetch Items from API
    const fetchItems = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/preventas`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setItems(data);
            }
        } catch (error) {
            console.error('Error fetching preventas:', error);
        }
    };

    useEffect(() => {
        fetchItems();
    }, []);

    // Generate PDF Receipt
    const generatePDF = (orderData) => {
        const doc = new jsPDF();

        // Header
        doc.setFontSize(20);
        doc.text('TORLAN POS', 105, 20, { align: 'center' });
        doc.setFontSize(14);
        doc.text('Comprobante de Apartado', 105, 30, { align: 'center' });

        // Order Info
        doc.setFontSize(12);
        doc.text(`Orden: ${orderData.orderNumber}`, 20, 50);
        doc.text(`Fecha: ${orderData.lastPaymentDate}`, 20, 58);
        doc.text(`Cliente: ${orderData.clientNumber}`, 20, 66);
        doc.text(`Nombre: ${orderData.clientName}`, 20, 74);

        // Product Info
        doc.setFontSize(14);
        doc.text('Informaci\u00f3n del Producto', 20, 90);
        doc.setFontSize(10);
        doc.text(`T\u00edtulo: ${orderData.title}`, 20, 100);
        doc.text(`Artista: ${orderData.artist}`, 20, 108);
        doc.text(`Grupo: ${orderData.group}`, 20, 116);
        doc.text(`Idioma: ${orderData.language}`, 20, 124);
        doc.text(`Categor\u00eda: ${orderData.category}`, 20, 132);

        // Payment Info
        doc.setFontSize(14);
        doc.text('Resumen de Pago', 20, 150);
        doc.setFontSize(10);
        doc.text(`Costo Total: $${formatPrice(orderData.totalPrice)}`, 20, 160);
        doc.text(`Total Pagado: $${formatPrice(orderData.totalPaid)}`, 20, 168);
        doc.setFontSize(12);
        doc.text(`Saldo Pendiente: $${formatPrice(orderData.balance)}`, 20, 180);

        // Payment History
        doc.setFontSize(14);
        doc.text('Historial de Pagos', 20, 200);
        let yPos = 210;
        doc.setFontSize(10);
        orderData.payments.forEach((payment, index) => {
            doc.text(`${payment.paymentNumber}. ${payment.date} - $${formatPrice(payment.amount)}`, 20, yPos);
            yPos += 8;
        });

        // Footer
        doc.setFontSize(8);
        doc.text('Gracias por su compra', 105, 280, { align: 'center' });

        // Generate blob URL for downloading
        const pdfBlob = doc.output('blob');
        const url = URL.createObjectURL(pdfBlob);
        return url;
    };

    const handlePhotoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData(prev => ({ ...prev, photo: reader.result }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validate deposit
        const total = parseFloat(formData.totalPrice);
        const dep = parseFloat(formData.deposit);

        if (dep > total) {
            alert('El apartado no puede ser mayor que el costo del producto');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const isExistingClient = items.length > 0 && Math.random() > 0.5;
            const clientNum = isExistingClient
                ? items[Math.floor(Math.random() * items.length)]?.clientNumber || `BIS${Math.floor(10000 + Math.random() * 90000)}`
                : `BIS${Math.floor(10000 + Math.random() * 90000)}`;

            const payload = {
                ...formData,
                clientNumber: clientNum,
                orderNumber: `ORD-${Math.floor(100000 + Math.random() * 900000)}`,
                balance: total - dep,
                isPaidInFull: (total - dep) === 0,
                status: (total - dep) === 0 ? 'paid' : 'pending',
                payments: [{
                    amount: dep,
                    date: new Date().toISOString(),
                    paymentNumber: 1
                }]
            };

            const response = await fetch(`${API_URL}/preventas`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                await fetchItems();
                setFormData({
                    clientName: '',
                    clientPhone: '',
                    clientEmail: '',
                    clientAddress: '',
                    totalPrice: '',
                    deposit: '',
                    title: '',
                    artist: '',
                    group: '',
                    language: '',
                    category: '',
                    pages: '',
                    isbn: '',
                    photo: null
                });
                alert('Preventa registrada exitosamente');
            } else {
                const errorData = await response.json();
                alert(`Error: ${errorData.error}`);
            }
        } catch (error) {
            console.error('Submit error:', error);
            alert('Error de conexión');
        }
    };

    // Handle liquidation
    // Handle liquidation
    const handleLiquidate = async () => {
        const amount = parseFloat(liquidateAmount);
        const order = selectedOrder;

        if (!amount || amount <= 0) {
            alert('Ingresa un monto válido');
            return;
        }

        if (amount > order.balance) {
            alert('El monto no puede ser mayor que el saldo pendiente');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/preventas/${order.id}/liquidate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ amount })
            });

            if (response.ok) {
                await fetchItems();
                setShowLiquidateModal(false);
                setLiquidateAmount('');
                setSelectedOrder(null);
                alert('Pago registrado exitosamente');
            } else {
                const errorData = await response.json();
                alert(`Error al registrar pago: ${errorData.error || 'Desconocido'}`);
            }
        } catch (error) {
            console.error('Liquidate error:', error);
            alert('Error de conexión');
        }
    };

    // Handle QR Code Display
    const handleShowQRCode = () => {
        // Encode order data in URL query parameter
        const orderData = encodeURIComponent(JSON.stringify(selectedOrder));
        const baseURL = window.location.origin;
        const shareableURL = `${baseURL}/comprobante?recibo=${orderData}`;
        setQrCodeURL(shareableURL);
        setShowQRModal(true);
    };

    // Derived state for history modal
    const clientHistory = selectedClient
        ? items.filter(item => item.clientNumber === selectedClient)
        : [];

    // Handle QR code scans - show download prompt when accessing receipt URL
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const reciboData = params.get('recibo');

        if (reciboData) {
            try {
                const orderData = JSON.parse(decodeURIComponent(reciboData));
                setQrOrderData(orderData);
                setShowQRDownload(true);

                // Clear query parameter from URL
                window.history.replaceState({}, '', '/preventas');
            } catch (error) {
                console.error('Error parsing QR data:', error);
                window.history.replaceState({}, '', '/preventas');
            }
        }
    }, []);

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-slate-100">Módulo de Preventas</h1>

            {/* QR Download Banner - shown when accessed via QR code */}
            {showQRDownload && qrOrderData && (
                <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-xl p-6 shadow-lg border-2 border-green-400 animate-pulse">
                    <div className="text-center space-y-4">
                        <div className="flex items-center justify-center gap-3">
                            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                            </svg>
                            <h2 className="text-2xl font-bold text-white">¡Comprobante Listo!</h2>
                        </div>
                        <p className="text-white text-lg">
                            Pedido: <span className="font-mono font-bold">{qrOrderData.orderNumber}</span>
                        </p>
                        <p className="text-green-100">
                            Cliente: {qrOrderData.clientName} ({qrOrderData.clientNumber})
                        </p>
                        <button
                            onClick={() => {
                                // Load template image
                                const templateImg = new Image();
                                templateImg.crossOrigin = 'anonymous';
                                templateImg.onload = async () => {
                                    // Create canvas with template dimensions
                                    const canvas = document.createElement('canvas');
                                    const ctx = canvas.getContext('2d');
                                    canvas.width = templateImg.width;
                                    canvas.height = templateImg.height;

                                    // Draw template
                                    ctx.drawImage(templateImg, 0, 0);

                                    // Overlay data (adjust positions based on your template)
                                    // Calculate generic responsive coordinates
                                    const w = canvas.width;
                                    const h = canvas.height;

                                    // Configure text style
                                    ctx.fillStyle = '#5A5A5A';
                                    ctx.font = `bold ${w * 0.035}px Arial`;
                                    ctx.textAlign = 'center';

                                    // FECHA (Date) - Top left box
                                    ctx.fillText(qrOrderData.lastPaymentDate, w * 0.30, h * 0.58);

                                    // ANTICIPO (Advance) - Top right box  
                                    ctx.fillText(`$${formatPrice(qrOrderData.totalPaid)}`, w * 0.70, h * 0.58);

                                    // PRODUCTO (Product) - Middle box
                                    ctx.fillText(qrOrderData.title.substring(0, 40), w * 0.50, h * 0.72);

                                    // Fecha de Pago (Payment Date) - Bottom
                                    ctx.textAlign = 'left';
                                    ctx.font = `bold ${w * 0.025}px Arial`;
                                    ctx.fillText(qrOrderData.lastPaymentDate, w * 0.65, h * 0.82);

                                    // Convert to image
                                    const imageData = canvas.toDataURL('image/png');

                                    // Upload to server
                                    try {
                                        const token = localStorage.getItem('token');
                                        const response = await fetch(`${API_URL}/preventas/generate-receipt`, {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json',
                                                'Authorization': `Bearer ${token}`
                                            },
                                            body: JSON.stringify({
                                                orderNumber: qrOrderData.orderNumber,
                                                imageData: imageData
                                            })
                                        });

                                        if (response.ok) {
                                            const { receiptUrl } = await response.json();
                                            setReceiptImageURL(receiptUrl);
                                        } else {
                                            console.error('Error uploading receipt');
                                            setReceiptImageURL(imageData);
                                        }
                                    } catch (error) {
                                        console.error('Upload error:', error);
                                        setReceiptImageURL(imageData);
                                    }
                                };
                                // Load template
                                templateImg.src = '/templates/comprobante-template.png';
                            }}
                            className="bg-white hover:bg-gray-100 text-green-700 font-bold py-4 px-8 rounded-lg text-xl transition-all transform hover:scale-105 shadow-xl flex items-center gap-3 mx-auto"
                        >
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            GENERAR COMPROBANTE
                        </button>

                        {/* Image Viewer */}
                        {receiptImageURL && (
                            <div className="mt-4 bg-white rounded-lg p-4">
                                <img
                                    src={receiptImageURL}
                                    alt="Comprobante de Apartado"
                                    className="w-full rounded shadow-lg"
                                />
                                <div className="mt-4 space-y-2">
                                    <p className="text-sm text-center text-gray-700 font-medium">
                                        📱 Para descargar en móvil: Mantén presionada la imagen y selecciona "Guardar imagen"
                                    </p>
                                    <p className="text-sm text-center text-gray-600">
                                        💻 En computadora: Click derecho → "Guardar imagen como..."
                                    </p>
                                    <a
                                        href={receiptImageURL}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        download
                                        className="block w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg text-center transition-colors text-lg"
                                    >
                                        📥 DESCARGAR COMPROBANTE
                                    </a>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )
            }

            {/* Form Card */}
            <div className="bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-700">
                <h2 className="text-lg font-semibold text-slate-200 mb-4">Registrar Nuevo Título</h2>
                <form onSubmit={handleSubmit} className="space-y-6">

                    {/* Client Information Section */}
                    <div className="border border-slate-600 rounded-lg p-4 bg-slate-900/30">
                        <h3 className="text-md font-semibold text-primary-400 mb-3 flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            Información del Cliente
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="space-y-1">
                                <label className="text-sm text-slate-400">Nombre del Cliente *</label>
                                <input
                                    type="text"
                                    name="clientName"
                                    value={formData.clientName}
                                    onChange={handleChange}
                                    required
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    placeholder="Nombre completo"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-sm text-slate-400">Teléfono</label>
                                <input
                                    type="tel"
                                    name="clientPhone"
                                    value={formData.clientPhone}
                                    onChange={handleChange}
                                    disabled
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500 opacity-50 cursor-not-allowed"
                                    placeholder="000-000-0000"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-sm text-slate-400">Email</label>
                                <input
                                    type="email"
                                    name="clientEmail"
                                    value={formData.clientEmail}
                                    onChange={handleChange}
                                    disabled
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500 opacity-50 cursor-not-allowed"
                                    placeholder="correo@ejemplo.com"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-sm text-slate-400">Dirección</label>
                                <input
                                    type="text"
                                    name="clientAddress"
                                    value={formData.clientAddress}
                                    onChange={handleChange}
                                    disabled
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500 opacity-50 cursor-not-allowed"
                                    placeholder="Dirección del cliente"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Product Information Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

                        <div className="space-y-1">
                            <label className="text-sm text-slate-400">Título</label>
                            <input
                                type="text"
                                name="title"
                                value={formData.title}
                                onChange={handleChange}
                                required
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                placeholder="Nombre del libro/obra"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm text-slate-400">Costo del Producto</label>
                            <input
                                type="number"
                                name="totalPrice"
                                value={formData.totalPrice}
                                onChange={handleChange}
                                required
                                min="0"
                                step="0.01"
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                placeholder="0.00"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm text-slate-400">Apartado del Cliente</label>
                            <input
                                type="number"
                                name="deposit"
                                value={formData.deposit}
                                onChange={handleChange}
                                required
                                min="0"
                                step="0.01"
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                placeholder="0.00"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm text-slate-400">Artista/Autor</label>
                            <input
                                type="text"
                                name="artist"
                                value={formData.artist}
                                onChange={handleChange}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                placeholder="Nombre del autor"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm text-slate-400">Grupo/Editorial</label>
                            <input
                                type="text"
                                name="group"
                                value={formData.group}
                                onChange={handleChange}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                placeholder="Editorial o grupo"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm text-slate-400">Lenguaje</label>
                            <select
                                name="language"
                                value={formData.language}
                                onChange={handleChange}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                            >
                                <option value="">Seleccionar...</option>
                                <option value="Español">Español</option>
                                <option value="Inglés">Inglés</option>
                                <option value="Japonés">Japonés</option>
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm text-slate-400">Categoría</label>
                            <input
                                type="text"
                                name="category"
                                value={formData.category}
                                onChange={handleChange}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                placeholder="Ficción, Texto, etc."
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm text-slate-400">Páginas</label>
                            <input
                                type="number"
                                name="pages"
                                value={formData.pages}
                                onChange={handleChange}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                placeholder="0"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm text-slate-400">ISBN (SIBN)</label>
                            <input
                                type="text"
                                name="isbn"
                                value={formData.isbn}
                                onChange={handleChange}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                placeholder="Código ISBN"
                            />
                        </div>

                        <div className="space-y-1 col-span-1 md:col-span-2">
                            <label className="text-sm text-slate-400">Fotografía</label>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handlePhotoChange}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-600 file:text-white hover:file:bg-primary-700"
                            />
                            {formData.photo && (
                                <div className="mt-2 text-center">
                                    <img src={formData.photo} alt="Vista previa" className="h-20 w-auto object-contain mx-auto rounded-md border border-slate-600" />
                                </div>
                            )}
                        </div>

                        <div className="col-span-1 md:col-span-2 lg:col-span-4 flex justify-end mt-2">
                            <button
                                type="submit"
                                className="bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-6 rounded-lg transition-colors flex items-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                                Registrar Preventa
                            </button>
                        </div>
                    </div>

                </form>
            </div>

            {/* Table Card */}
            <div className="bg-slate-800 rounded-xl shadow-sm border border-slate-700 overflow-hidden">
                <div className="p-4 border-b border-slate-700">
                    <h2 className="text-lg font-semibold text-slate-200">Registros de Preventa</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-300">
                        <thead className="bg-slate-900/50 text-slate-400 uppercase text-xs">
                            <tr>
                                <th className="px-6 py-3">No. Pedido</th>
                                <th className="px-6 py-3">No. Cliente</th>
                                <th className="px-6 py-3">Foto</th>
                                <th className="px-6 py-3">Título</th>
                                <th className="px-6 py-3">Autor</th>
                                <th className="px-6 py-3 text-right">Saldo</th>
                                <th className="px-6 py-3 text-center">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                            {items.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="px-6 py-8 text-center text-slate-500 italic">
                                        No hay registros en la tabla aún.
                                    </td>
                                </tr>
                            ) : (
                                items.map((item) => (
                                    <tr key={item.id} className="hover:bg-slate-700/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => setSelectedOrder(item)}
                                                className="text-primary-400 hover:text-primary-300 hover:underline font-mono font-medium"
                                            >
                                                #{item.orderNumber}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => setSelectedClient(item.clientNumber)}
                                                className="bg-slate-700 hover:bg-slate-600 text-white text-xs px-2 py-1 rounded transition-colors font-mono"
                                            >
                                                {item.clientNumber}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4">
                                            {item.photo ? (
                                                <img src={item.photo} alt={item.title} className="w-10 h-10 object-cover rounded-md" />
                                            ) : (
                                                <div className="w-10 h-10 bg-slate-700 rounded-md flex items-center justify-center text-xs text-slate-500">N/A</div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 font-medium text-slate-200">{item.title}</td>
                                        <td className="px-6 py-4">{item.artist}</td>
                                        <td className="px-6 py-4 text-right font-medium">
                                            <span className={item.balance > 0 ? "text-orange-400" : "text-green-400"}>
                                                ${formatPrice(item.balance)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`text-xs px-2 py-1 rounded font-medium ${item.isPaidInFull
                                                ? "bg-green-600/20 text-green-400 ring-1 ring-green-500/30"
                                                : "bg-orange-600/20 text-orange-400 ring-1 ring-orange-500/30"
                                                }`}>
                                                {item.isPaidInFull ? "Liquidado" : "Apartado"}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div >

            {/* Client History Modal */}
            < Modal
                title={`Historial de Cliente: ${selectedClient}`
                }
                isOpen={!!selectedClient}
                onClose={() => setSelectedClient(null)}
            >
                <div className="space-y-4">
                    <p className="text-slate-400 text-sm">Mostrando todos los anticipos y registros asociados a este cliente.</p>
                    <div className="overflow-hidden bg-slate-900 rounded-lg border border-slate-700">
                        <table className="w-full text-left text-sm text-slate-300">
                            <thead className="bg-slate-800 text-slate-400 uppercase text-xs">
                                <tr>
                                    <th className="px-4 py-2">Fecha</th>
                                    <th className="px-4 py-2">Pedido</th>
                                    <th className="px-4 py-2">Título</th>
                                    <th className="px-4 py-2 text-right">Total</th>
                                    <th className="px-4 py-2 text-right">Saldo</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700">
                                {clientHistory.map(histItem => (
                                    <tr key={histItem.id}>
                                        <td className="px-4 py-2">{histItem.lastPaymentDate}</td>
                                        <td className="px-4 py-2 font-mono text-xs">{histItem.orderNumber}</td>
                                        <td className="px-4 py-2">{histItem.title}</td>
                                        <td className="px-4 py-2 text-right text-slate-200">${formatPrice(histItem.totalPrice)}</td>
                                        <td className="px-4 py-2 text-right">
                                            <span className={histItem.balance > 0 ? "text-orange-400" : "text-green-400"}>
                                                ${formatPrice(histItem.balance)}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex justify-between pt-2">
                        <p className="text-lg font-bold text-slate-200">
                            Total de Órdenes: <span className="text-primary-400">{clientHistory.length}</span>
                        </p>
                    </div>
                </div>
            </Modal >

            {/* Order Summary Modal */}
            < Modal
                type="order"
                title={`Resumen de Pedido: ${selectedOrder?.orderNumber}`}
                isOpen={!!selectedOrder}
                onClose={() => setSelectedOrder(null)}
            >
                {selectedOrder && (
                    <div className="space-y-6">
                        <div className="flex flex-col md:flex-row gap-6">
                            {/* Photo */}
                            <div className="w-full md:w-1/3">
                                {selectedOrder.photo ? (
                                    <img src={selectedOrder.photo} alt={selectedOrder.title} className="w-full h-auto rounded-lg shadow-lg border border-slate-600" />
                                ) : (
                                    <div className="w-full aspect-square bg-slate-700 rounded-lg flex items-center justify-center text-slate-500">Sin Foto</div>
                                )}
                            </div>

                            {/* Details */}
                            <div className="w-full md:w-2/3 space-y-4">
                                <div>
                                    <h4 className="text-sm text-slate-400 uppercase tracking-wider">Título de la Obra</h4>
                                    <p className="text-xl font-bold text-white">{selectedOrder.title}</p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <h4 className="text-xs text-slate-500 uppercase">Artista / Grupo</h4>
                                        <p className="text-slate-200">{selectedOrder.artist} <span className="text-slate-500">/</span> {selectedOrder.group}</p>
                                    </div>
                                    <div>
                                        <h4 className="text-xs text-slate-500 uppercase">Idioma / Categoría</h4>
                                        <p className="text-slate-200">{selectedOrder.language} - {selectedOrder.category}</p>
                                    </div>
                                    <div>
                                        <h4 className="text-xs text-slate-500 uppercase">ISBN</h4>
                                        <p className="font-mono text-slate-300">{selectedOrder.isbn || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <h4 className="text-xs text-slate-500 uppercase">Páginas</h4>
                                        <p className="text-slate-300">{selectedOrder.pages}</p>
                                    </div>
                                </div>

                                <div className="p-4 bg-slate-700/30 rounded-lg border border-slate-700/50 mt-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-slate-400">Cliente</span>
                                        <span className="font-mono text-white text-lg">{selectedOrder.clientNumber}</span>
                                    </div>
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-slate-400">Nombre</span>
                                        <span className="text-white font-medium">{selectedOrder.clientName}</span>
                                    </div>
                                    <div className="w-full h-px bg-slate-600 my-3"></div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-slate-400">Costo Total</span>
                                            <span className="text-lg font-medium text-slate-200">${formatPrice(selectedOrder.totalPrice)}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-slate-400">Total Pagado</span>
                                            <span className="text-lg font-medium text-blue-400">${formatPrice(selectedOrder.totalPaid)}</span>
                                        </div>
                                        <div className="w-full h-px bg-slate-600 my-2"></div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-slate-400 font-medium">Saldo Pendiente</span>
                                            <span className={`text-2xl font-bold ${selectedOrder.balance > 0 ? 'text-orange-400' : 'text-green-400'}`}>
                                                ${formatPrice(selectedOrder.balance)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Payment History */}
                        <div className="mt-6">
                            <h4 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Historial de Pagos</h4>
                            <div className="overflow-hidden bg-slate-900 rounded-lg border border-slate-700">
                                <table className="w-full text-left text-sm text-slate-300">
                                    <thead className="bg-slate-800 text-slate-400 uppercase text-xs">
                                        <tr>
                                            <th className="px-4 py-2">#</th>
                                            <th className="px-4 py-2">Fecha</th>
                                            <th className="px-4 py-2 text-right">Monto</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700">
                                        {selectedOrder.payments.map((payment, index) => (
                                            <tr key={index}>
                                                <td className="px-4 py-2 font-mono text-xs">{payment.paymentNumber}</td>
                                                <td className="px-4 py-2">{payment.date}</td>
                                                <td className="px-4 py-2 text-right text-green-400">${formatPrice(payment.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                            {/* QR Code Button */}
                            <button
                                onClick={handleShowQRCode}
                                className="bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                                </svg>
                                Código QR
                            </button>

                            {/* Liquidate Button */}
                            {selectedOrder.balance > 0 && (
                                <button
                                    onClick={() => setShowLiquidateModal(true)}
                                    className="bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Liquidar Pedido
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </Modal >

            {/* Liquidation Modal */}
            < Modal
                title="Liquidar Pedido"
                isOpen={showLiquidateModal}
                onClose={() => {
                    setShowLiquidateModal(false);
                    setLiquidateAmount('');
                }}
            >
                <div className="space-y-4">
                    <div className="p-4 bg-slate-900 rounded-lg border border-slate-700">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-slate-400">Saldo Pendiente:</span>
                            <span className="text-2xl font-bold text-orange-400">${formatPrice(selectedOrder?.balance || 0)}</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm text-slate-400 font-medium">Monto del Pago</label>
                        <input
                            type="number"
                            value={liquidateAmount}
                            onChange={(e) => setLiquidateAmount(e.target.value)}
                            placeholder="0.00"
                            min="0"
                            step="0.01"
                            max={selectedOrder?.balance || 0}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 text-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                        <p className="text-xs text-slate-500">
                            Saldo restante después del pago: ${formatPrice(Math.max(0, (selectedOrder?.balance || 0) - (parseFloat(liquidateAmount) || 0)))}
                        </p>
                    </div>

                    <button
                        onClick={handleLiquidate}
                        className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6 rounded-lg transition-colors"
                    >
                        Confirmar Pago
                    </button>
                </div>
            </Modal >

            {/* QR Code Modal */}
            <Modal
                title="Código QR - Comprobante de Apartado"
                isOpen={showQRModal}
                onClose={() => {
                    setShowQRModal(false);
                    if (qrCodeURL) URL.revokeObjectURL(qrCodeURL);
                }}
            >
                <div className="flex flex-col items-center space-y-4">
                    <p className="text-slate-400 text-center">
                        Escanea este código QR con tu teléfono para descargar el comprobante en PDF
                    </p>
                    <div className="p-6 bg-white rounded-lg">
                        {qrCodeURL && (
                            <QRCodeSVG
                                value={qrCodeURL}
                                size={256}
                                level="H"
                                includeMargin={true}
                            />
                        )}
                    </div>
                    <p className="text-sm text-slate-500">
                        También puedes hacer clic en el botón de abajo para descargar directamente
                    </p>
                    <button
                        onClick={() => {
                            const pdfURL = generatePDF(selectedOrder);
                            const link = document.createElement('a');
                            link.href = pdfURL;
                            link.download = `Comprobante-${selectedOrder?.orderNumber}.pdf`;
                            link.click();
                            URL.revokeObjectURL(pdfURL);
                        }}
                        className="bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-6 rounded-lg transition-colors flex items-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Descargar PDF
                    </button>
                </div>
            </Modal>
        </div >
    );
}
