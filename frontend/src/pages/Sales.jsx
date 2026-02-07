import { useState, useEffect, useRef } from 'react';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';

const MEXICAN_BANKS = [
    'BBVA',
    'Santander',
    'Banamex (Citibanamex)',
    'Banorte',
    'HSBC',
    'Scotiabank',
    'Inbursa',
    'Banco Azteca',
    'Banregio',
    'Afirme'
];

// Helper to parse extras from backend (handles JSON string, array, or null)
const parseExtras = (extras) => {
    if (!extras) return [];
    if (Array.isArray(extras)) return extras;
    if (typeof extras === 'string') {
        try {
            const parsed = JSON.parse(extras);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            // Fallback for comma-separated strings
            return extras.split(',').map(e => e.trim()).filter(Boolean);
        }
    }
    return [];
};

export default function Sales() {
    const { token, user } = useAuth();
    const [products, setProducts] = useState([]);
    const [cart, setCart] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [success, setSuccess] = useState(null);
    const [scannerFeedback, setScannerFeedback] = useState(null);
    const [stockAlert, setStockAlert] = useState(null);

    // Payment confirmation state
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState(null);
    const [cardType, setCardType] = useState('debit');
    const [selectedBank, setSelectedBank] = useState('');
    const [amountReceived, setAmountReceived] = useState('');
    const [showTicket, setShowTicket] = useState(false);
    const [ticketData, setTicketData] = useState(null);

    // Extras verification state
    const [showExtrasVerification, setShowExtrasVerification] = useState(false);
    const [verifiedExtras, setVerifiedExtras] = useState({});
    const [pendingPaymentMethod, setPendingPaymentMethod] = useState(null);

    const searchInputRef = useRef(null);

    useEffect(() => {
        fetchProducts();
        if (searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, []);

    useEffect(() => {
        const debounceTimer = setTimeout(() => {
            searchProducts(search);
        }, 150);
        return () => clearTimeout(debounceTimer);
    }, [search]);

    const fetchProducts = async () => {
        try {
            const response = await fetch(`${API_URL}/products`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                setProducts(await response.json());
            }
        } catch (error) {
            console.error('Error fetching products:', error);
        } finally {
            setLoading(false);
        }
    };

    const searchProducts = async (query) => {
        try {
            const response = await fetch(`${API_URL}/products/search?q=${encodeURIComponent(query)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                setProducts(await response.json());
            }
        } catch (error) {
            console.error('Error searching products:', error);
        }
    };

    const handleSearchKeyDown = async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (!search.trim()) return;

            try {
                const response = await fetch(`${API_URL}/products/search?q=${encodeURIComponent(search.trim())}&exact=true`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.exactMatch && data.product) {
                        if (data.product.stock <= 0) {
                            showStockAlert(data.product.name);
                        } else {
                            addToCart(data.product);
                            showScannerFeedback('success', `✓ ${data.product.name} agregado`);
                        }
                    } else {
                        showScannerFeedback('error', `✗ Producto no encontrado: ${search}`);
                    }
                }
            } catch (error) {
                console.error('Error in barcode search:', error);
                showScannerFeedback('error', 'Error al buscar producto');
            }

            setSearch('');
            searchInputRef.current?.focus();
        }
    };

    const showStockAlert = (productName) => {
        setStockAlert(productName);
        setTimeout(() => setStockAlert(null), 3000);
    };

    const showScannerFeedback = (type, message) => {
        setScannerFeedback({ type, message });
        setTimeout(() => setScannerFeedback(null), 2000);
    };

    const addToCart = (product) => {
        if (product.stock <= 0) {
            showStockAlert(product.name);
            return;
        }

        const existing = cart.find(item => item.product_id === product.id);
        const currentQty = existing ? existing.quantity : 0;

        if (currentQty >= product.stock) {
            showStockAlert(product.name);
            return;
        }

        if (existing) {
            setCart(cart.map(item =>
                item.product_id === product.id
                    ? { ...item, quantity: item.quantity + 1 }
                    : item
            ));
        } else {
            setCart([...cart, {
                product_id: product.id,
                name: product.name,
                price: Number(product.sale_price || product.price),
                quantity: 1,
                sbin_code: product.sbin_code,
                stock: product.stock,
                image_url: product.image_url
            }]);
        }

        setSearch('');
        searchInputRef.current?.focus();
    };

    const updateQuantity = (productId, delta) => {
        setCart(cart.map(item => {
            if (item.product_id === productId) {
                const newQty = item.quantity + delta;
                if (newQty > item.stock) {
                    showStockAlert(item.name);
                    return item;
                }
                return newQty > 0 ? { ...item, quantity: newQty } : item;
            }
            return item;
        }).filter(item => item.quantity > 0));
    };

    const removeFromCart = (productId) => {
        setCart(cart.filter(item => item.product_id !== productId));
    };

    const getTotal = () => {
        return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    };

    const getChange = () => {
        const received = parseFloat(amountReceived) || 0;
        return Math.max(0, received - getTotal());
    };

    const openPaymentModal = (method) => {
        if (cart.length === 0) return;

        // Check if any products in cart have extras that need verification
        const productsWithExtras = cart.filter(item => {
            const product = products.find(p => p.id === item.product_id);
            const extras = product ? parseExtras(product.extras) : [];
            return extras.length > 0;
        });

        if (productsWithExtras.length > 0) {
            // Show verification modal first
            setPendingPaymentMethod(method);
            setVerifiedExtras({});
            setShowExtrasVerification(true);
        } else {
            // No extras to verify, proceed directly to payment
            setPaymentMethod(method);
            setShowPaymentModal(true);
            setCardType('debit');
            setSelectedBank('');
            setAmountReceived('');
        }
    };

    const handleVerifyExtra = (productId) => {
        setVerifiedExtras(prev => ({
            ...prev,
            [productId]: !prev[productId]
        }));
    };

    const getProductsWithExtras = () => {
        return cart.filter(item => {
            const product = products.find(p => p.id === item.product_id);
            const extras = product ? parseExtras(product.extras) : [];
            return extras.length > 0;
        }).map(item => {
            const product = products.find(p => p.id === item.product_id);
            return { ...item, extras: parseExtras(product.extras) };
        });
    };

    const areAllExtrasVerified = () => {
        const productsWithExtras = getProductsWithExtras();
        return productsWithExtras.every(item => verifiedExtras[item.product_id]);
    };

    const proceedFromVerification = () => {
        if (!areAllExtrasVerified()) return;
        setShowExtrasVerification(false);
        setPaymentMethod(pendingPaymentMethod);
        setShowPaymentModal(true);
        setCardType('debit');
        setSelectedBank('');
        setAmountReceived('');
    };

    const closeExtrasVerification = () => {
        setShowExtrasVerification(false);
        setPendingPaymentMethod(null);
        setVerifiedExtras({});
    };

    const closePaymentModal = () => {
        setShowPaymentModal(false);
        setPaymentMethod(null);
        setAmountReceived('');
        setSelectedBank('');
    };

    const [paymentError, setPaymentError] = useState('');

    // ... (inside component)

    const handleProceedPayment = async () => {
        setPaymentError('');
        if (cart.length === 0) return;

        // Validate cash payment
        if (paymentMethod === 'cash') {
            const received = parseFloat(amountReceived) || 0;
            if (received < getTotal()) {
                return; // Not enough money
            }
        }

        // Validate card payment
        if (paymentMethod === 'card' && !selectedBank) {
            return; // Need to select bank
        }

        setProcessing(true);
        try {
            const response = await fetch(`${API_URL}/sales`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    items: cart.map(item => ({
                        product_id: item.product_id,
                        quantity: item.quantity,
                        price: item.price
                    })),
                    payment_method: paymentMethod,
                    card_type: paymentMethod === 'card' ? cardType : null,
                    bank: paymentMethod === 'card' ? selectedBank : null
                })
            });

            const data = await response.json();

            if (response.ok) {
                // Generate ticket data
                setTicketData({
                    id: data.id,
                    date: new Date(),
                    items: [...cart],
                    total: data.total,
                    paymentMethod,
                    cardType: paymentMethod === 'card' ? cardType : null,
                    bank: paymentMethod === 'card' ? selectedBank : null,
                    amountReceived: paymentMethod === 'cash' ? parseFloat(amountReceived) : null,
                    change: paymentMethod === 'cash' ? getChange() : null,
                    cashier: user?.username
                });

                setShowPaymentModal(false);
                setShowTicket(true);
                setCart([]);
                fetchProducts(); // Refresh stock
            } else {
                // Specific handling for missing cash session
                if (data.code === 'NO_CASH_SESSION') {
                    setPaymentError('⚠️ No tienes una caja abierta. Ve a "Control de Caja" para abrir tu caja antes de realizar ventas.');
                } else {
                    setPaymentError(data.error || 'Error al procesar la venta');
                }
            }
        } catch (error) {
            console.error('Error processing sale:', error);
            setPaymentError('Error de conexión con el servidor');
        } finally {
            setProcessing(false);
        }
    };

    const closeTicket = () => {
        setShowTicket(false);
        setTicketData(null);
        searchInputRef.current?.focus();
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-2rem)] flex gap-6 animate-fade-in">
            {/* Stock Alert Modal */}
            {stockAlert && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
                    <div className="bg-red-500/90 backdrop-blur-sm text-white px-6 py-3 rounded-xl shadow-xl flex items-center gap-3">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span className="font-medium">"{stockAlert}" no se encuentra en stock</span>
                    </div>
                </div>
            )}

            {/* Extras Verification Modal */}
            {showExtrasVerification && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="glass-card p-6 w-full max-w-lg animate-slide-up">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-amber-500/20 rounded-xl">
                                    <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <h2 className="text-xl font-bold">Verificar Extras</h2>
                            </div>
                            <button onClick={closeExtrasVerification} className="p-2 hover:bg-white/10 rounded-lg">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <p className="text-slate-400 mb-4">
                            Por favor verifica que los siguientes productos tengan sus extras antes de continuar con el cobro.
                        </p>

                        <div className="space-y-3 mb-6 max-h-64 overflow-y-auto">
                            {getProductsWithExtras().map(item => (
                                <div
                                    key={item.product_id}
                                    className={`p-4 rounded-xl border transition-all cursor-pointer ${verifiedExtras[item.product_id]
                                        ? 'bg-emerald-500/20 border-emerald-500/50'
                                        : 'bg-white/5 border-white/10 hover:border-amber-500/50'
                                        }`}
                                    onClick={() => handleVerifyExtra(item.product_id)}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <p className="font-medium">{item.name}</p>
                                            <p className="text-sm text-slate-400">
                                                Cantidad: {item.quantity} • Extras: {item.extras.join(', ')}
                                            </p>
                                        </div>
                                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${verifiedExtras[item.product_id]
                                            ? 'bg-emerald-500 border-emerald-500'
                                            : 'border-slate-500'
                                            }`}>
                                            {verifiedExtras[item.product_id] && (
                                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={proceedFromVerification}
                            disabled={!areAllExtrasVerified()}
                            className="w-full btn-primary py-4 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {areAllExtrasVerified() ? 'Continuar al Pago' : 'Verifica todos los productos'}
                        </button>
                    </div>
                </div>
            )}

            {/* Payment Confirmation Modal */}
            {showPaymentModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="glass-card p-6 w-full max-w-lg animate-slide-up">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold">Confirmación de Venta</h2>
                            <button onClick={closePaymentModal} className="p-2 hover:bg-white/10 rounded-lg">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Order Summary */}
                        <div className="bg-white/5 rounded-xl p-4 mb-6">
                            <p className="text-sm text-slate-400 mb-2">Resumen del pedido</p>
                            <div className="max-h-32 overflow-auto space-y-1">
                                {cart.map(item => (
                                    <div key={item.product_id} className="flex justify-between text-sm">
                                        <span>{item.quantity}x {item.name}</span>
                                        <span className="text-slate-300">${(item.price * item.quantity).toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="border-t border-white/10 mt-3 pt-3 flex justify-between">
                                <span className="font-semibold">Total:</span>
                                <span className="text-xl font-bold text-primary-400">${getTotal().toFixed(2)} MXN</span>
                            </div>
                        </div>

                        {/* Cash Payment */}
                        {paymentMethod === 'cash' && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 p-3 bg-emerald-500/20 rounded-xl">
                                    <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                    <span className="font-semibold text-emerald-300">Pago en Efectivo</span>
                                </div>

                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Monto recibido (MXN)</label>
                                    <input
                                        type="number"
                                        value={amountReceived}
                                        onChange={(e) => setAmountReceived(e.target.value)}
                                        className="input-glass text-2xl font-bold text-center"
                                        placeholder="0.00"
                                        min={getTotal()}
                                        step="0.01"
                                        autoFocus
                                    />
                                </div>

                                {parseFloat(amountReceived) >= getTotal() && (
                                    <div className="bg-emerald-500/20 rounded-xl p-4 text-center">
                                        <p className="text-sm text-slate-400">Cambio a devolver</p>
                                        <p className="text-3xl font-bold text-emerald-400">${getChange().toFixed(2)} MXN</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Card Payment */}
                        {paymentMethod === 'card' && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 p-3 bg-blue-500/20 rounded-xl">
                                    <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                    </svg>
                                    <span className="font-semibold text-blue-300">Pago con Tarjeta</span>
                                </div>

                                <div>
                                    <label className="block text-sm text-slate-400 mb-2">Tipo de tarjeta</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => setCardType('debit')}
                                            className={`p-3 rounded-xl border-2 transition-all ${cardType === 'debit'
                                                ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                                                : 'border-white/10 hover:border-white/30'
                                                }`}
                                        >
                                            <span className="font-semibold">Débito</span>
                                        </button>
                                        <button
                                            onClick={() => setCardType('credit')}
                                            className={`p-3 rounded-xl border-2 transition-all ${cardType === 'credit'
                                                ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                                                : 'border-white/10 hover:border-white/30'
                                                }`}
                                        >
                                            <span className="font-semibold">Crédito</span>
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm text-slate-400 mb-2">Banco emisor</label>
                                    <select
                                        value={selectedBank}
                                        onChange={(e) => setSelectedBank(e.target.value)}
                                        className="input-glass w-full"
                                    >
                                        <option value="">Selecciona un banco...</option>
                                        {MEXICAN_BANKS.map(bank => (
                                            <option key={bank} value={bank}>{bank}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        {/* Error Message */}
                        {paymentError && (
                            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 text-sm flex items-center gap-2">
                                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {paymentError}
                            </div>
                        )}

                        {/* Proceed Button */}
                        <button
                            onClick={handleProceedPayment}
                            disabled={
                                processing ||
                                (paymentMethod === 'cash' && parseFloat(amountReceived) < getTotal()) ||
                                (paymentMethod === 'card' && !selectedBank)
                            }
                            className="w-full mt-6 btn-primary py-4 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {processing ? (
                                <span className="flex items-center justify-center gap-2">
                                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-white"></div>
                                    Procesando...
                                </span>
                            ) : (
                                'Proceder al Pago'
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Payment Ticket Modal */}
            {showTicket && ticketData && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white text-gray-900 w-full max-w-sm rounded-lg shadow-2xl animate-slide-up overflow-hidden">
                        {/* Ticket Header */}
                        <div className="bg-gray-100 p-4 text-center border-b-2 border-dashed border-gray-300">
                            <h2 className="text-xl font-bold">TORLAN POS</h2>
                            <p className="text-sm text-gray-600">Ticket de Venta #{ticketData.id}</p>
                            <p className="text-xs text-gray-500 mt-1">
                                {ticketData.date.toLocaleDateString('es-MX')} - {ticketData.date.toLocaleTimeString('es-MX')}
                            </p>
                        </div>

                        {/* Ticket Items */}
                        <div className="p-4 border-b-2 border-dashed border-gray-300">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-gray-500 text-xs">
                                        <th className="text-left py-1">CANT.</th>
                                        <th className="text-left py-1">PRODUCTO</th>
                                        <th className="text-right py-1">PRECIO</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ticketData.items.map(item => (
                                        <tr key={item.product_id}>
                                            <td className="py-1">{item.quantity}</td>
                                            <td className="py-1">{item.name}</td>
                                            <td className="py-1 text-right">${(item.price * item.quantity).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Ticket Totals */}
                        <div className="p-4 bg-gray-50">
                            <div className="flex justify-between text-lg font-bold mb-2">
                                <span>TOTAL:</span>
                                <span>${ticketData.total.toFixed(2)} MXN</span>
                            </div>

                            <div className="text-sm text-gray-600 space-y-1">
                                <div className="flex justify-between">
                                    <span>Método de pago:</span>
                                    <span className="font-medium">
                                        {ticketData.paymentMethod === 'cash' ? 'Efectivo' : `Tarjeta ${ticketData.cardType === 'debit' ? 'Débito' : 'Crédito'}`}
                                    </span>
                                </div>

                                {ticketData.paymentMethod === 'card' && (
                                    <div className="flex justify-between">
                                        <span>Banco:</span>
                                        <span className="font-medium">{ticketData.bank}</span>
                                    </div>
                                )}

                                {ticketData.paymentMethod === 'cash' && (
                                    <>
                                        <div className="flex justify-between">
                                            <span>Recibido:</span>
                                            <span className="font-medium">${ticketData.amountReceived.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-emerald-600 font-semibold">
                                            <span>Cambio:</span>
                                            <span>${ticketData.change.toFixed(2)}</span>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="mt-4 pt-4 border-t border-gray-300 text-center text-xs text-gray-500">
                                <p>Atendió: {ticketData.cashier}</p>
                                <p className="mt-2">¡Gracias por su compra!</p>
                            </div>
                        </div>

                        {/* Close Button */}
                        <button
                            onClick={closeTicket}
                            className="w-full p-4 bg-primary-600 text-white font-semibold hover:bg-primary-500 transition-colors"
                        >
                            Cerrar Ticket
                        </button>
                    </div>
                </div>
            )}

            {/* Products Section */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="mb-4">
                    <h1 className="text-2xl font-bold">Cobrar</h1>
                    <p className="text-slate-400">Escanea o busca productos para agregar</p>
                </div>

                {scannerFeedback && (
                    <div className={`mb-4 p-3 rounded-xl animate-fade-in ${scannerFeedback.type === 'success'
                        ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300'
                        : 'bg-red-500/20 border border-red-500/30 text-red-300'
                        }`}>
                        <div className="flex items-center gap-2 font-medium">
                            {scannerFeedback.message}
                        </div>
                    </div>
                )}

                <div className="mb-4">
                    <div className="relative">
                        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                        </svg>
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                            placeholder="Escanea el código del producto"
                            className="input-glass pl-14 pr-4 py-4 text-lg w-full"
                            autoFocus
                        />
                        {search && (
                            <button
                                onClick={() => {
                                    setSearch('');
                                    searchInputRef.current?.focus();
                                }}
                                className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 ml-1">
                        Presiona <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-300">Enter</kbd> para agregar automáticamente
                    </p>
                </div>

                <div className="flex-1 overflow-auto">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {products.map(product => (
                            <button
                                key={product.id}
                                onClick={() => addToCart(product)}
                                disabled={product.stock <= 0}
                                className={`glass-card p-4 text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${product.stock <= 0 ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary-500/50'
                                    }`}
                            >
                                <div className="flex flex-col gap-2 mb-2">
                                    <div className="w-full aspect-[4/3] rounded-lg bg-black/20 overflow-hidden mb-1">
                                        {product.image_url ? (
                                            <img
                                                src={product.image_url}
                                                alt={product.name}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-600">
                                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-start justify-between">
                                        <h3 className="font-medium text-sm line-clamp-2">{product.name}</h3>
                                        {product.stock <= 5 && product.stock > 0 && (
                                            <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded shrink-0 ml-1">
                                                {product.stock}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {product.sbin_code && (
                                    <p className="text-xs text-slate-500 mb-1 font-mono">{product.sbin_code}</p>
                                )}
                                <p className="text-lg font-bold text-primary-400">
                                    ${Number(product.sale_price || product.price).toFixed(2)}
                                </p>
                                {product.stock <= 0 && (
                                    <p className="text-xs text-red-400 mt-1">Sin stock</p>
                                )}
                            </button>
                        ))}
                    </div>

                    {products.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <p>No se encontraron productos</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Cart Section */}
            <div className="w-96 flex flex-col glass-card-dark">
                <div className="p-4 border-b border-white/10">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">Ticket de Cobro</h2>
                        {cart.length > 0 && (
                            <span className="px-2 py-1 bg-primary-500/20 text-primary-400 rounded-full text-sm">
                                {cart.reduce((sum, item) => sum + item.quantity, 0)} items
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-4 space-y-3">
                    {cart.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                            <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                            </svg>
                            <p className="text-sm">Escanea productos para comenzar</p>
                        </div>
                    ) : (
                        cart.map(item => (
                            <div key={item.product_id} className="bg-white/5 rounded-xl p-3">
                                <div className="flex items-start gap-3 mb-2">
                                    <div className="w-12 h-12 rounded-lg bg-black/20 overflow-hidden shrink-0 border border-white/10">
                                        {item.image_url ? (
                                            <img
                                                src={item.image_url}
                                                alt={item.name}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-600">
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm truncate">{item.name}</p>
                                        {item.sbin_code && (
                                            <p className="text-xs text-slate-500 font-mono">{item.sbin_code}</p>
                                        )}
                                        <p className="text-xs text-slate-400">${item.price.toFixed(2)} c/u</p>
                                    </div>
                                    <button
                                        onClick={() => removeFromCart(item.product_id)}
                                        className="p-1 hover:bg-red-500/20 rounded text-slate-400 hover:text-red-400"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => updateQuantity(item.product_id, -1)}
                                            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                                            </svg>
                                        </button>
                                        <span className="w-8 text-center font-medium">{item.quantity}</span>
                                        <button
                                            onClick={() => updateQuantity(item.product_id, 1)}
                                            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                            </svg>
                                        </button>
                                    </div>
                                    <p className="font-semibold text-primary-400">
                                        ${(item.price * item.quantity).toFixed(2)}
                                    </p>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="p-4 border-t border-white/10 space-y-4">
                    <div className="flex items-center justify-between text-xl">
                        <span className="font-medium">Total a Cobrar:</span>
                        <span className="font-bold text-2xl text-primary-400">
                            ${getTotal().toFixed(2)}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => openPaymentModal('cash')}
                            disabled={cart.length === 0}
                            className="btn-primary py-4 flex flex-col items-center gap-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            <span className="font-semibold">Cobro en Efectivo</span>
                        </button>
                        <button
                            onClick={() => openPaymentModal('card')}
                            disabled={cart.length === 0}
                            className="btn-primary py-4 flex flex-col items-center gap-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                            </svg>
                            <span className="font-semibold">Pago con Tarjeta</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
