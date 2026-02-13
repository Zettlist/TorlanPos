import { useState, useEffect, useRef } from 'react';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';

export default function Anticipos() {
    const { token, user } = useAuth();
    const [anticipos, setAnticipos] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);

    // Form state
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [notes, setNotes] = useState('');
    const [paidAmount, setPaidAmount] = useState('');
    const [selectedItems, setSelectedItems] = useState([]);

    // Search state
    const [search, setSearch] = useState('');
    const [showAutocomplete, setShowAutocomplete] = useState(false);
    const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);

    // Modal state
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showCompleteModal, setShowCompleteModal] = useState(false);
    const [selectedAnticipo, setSelectedAnticipo] = useState(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [finalPayment, setFinalPayment] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('cash');

    const searchInputRef = useRef(null);
    const autocompleteRef = useRef(null);

    useEffect(() => {
        console.log('🚀 Anticipos v2.1 - Búsqueda corregida');
        fetchAnticipos();
    }, []);


    // Search products with debounce
    useEffect(() => {
        const debounceTimer = setTimeout(() => {
            if (search.trim().length > 0) {
                searchProducts(search);
            } else {
                setProducts([]);
            }
            setShowAutocomplete(search.length > 0);
            setSelectedSuggestionIndex(-1);
        }, 150);
        return () => clearTimeout(debounceTimer);
    }, [search]);

    // Close autocomplete when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (autocompleteRef.current && !autocompleteRef.current.contains(e.target)) {
                setShowAutocomplete(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchAnticipos = async () => {
        try {
            const response = await fetch(`${API_URL}/anticipos`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                setAnticipos(await response.json());
            }
        } catch (error) {
            console.error('Error fetching anticipos:', error);
        } finally {
            setLoading(false);
        }
    };

    const searchProducts = async (query) => {
        if (!query || query.trim().length === 0) {
            setProducts([]);
            return;
        }

        try {
            const response = await fetch(`${API_URL}/products/search?q=${encodeURIComponent(query)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const results = await response.json();
                setProducts(results);
                console.log('🔍 Búsqueda:', query, '- Resultados:', results.length);
            }
        } catch (error) {
            console.error('Error searching products:', error);
            setProducts([]);
        }
    };

    const handleSearchKeyDown = (e) => {
        const autocompleteProducts = products.slice(0, 5);

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedSuggestionIndex(prev =>
                prev < autocompleteProducts.length - 1 ? prev + 1 : prev
            );
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
            return;
        }

        if (e.key === 'Escape') {
            setShowAutocomplete(false);
            setSelectedSuggestionIndex(-1);
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedSuggestionIndex >= 0 && autocompleteProducts[selectedSuggestionIndex]) {
                handleSuggestionClick(autocompleteProducts[selectedSuggestionIndex]);
            }
        }
    };

    const handleSuggestionClick = (product) => {
        const existing = selectedItems.find(item => item.product_id === product.id);

        if (existing) {
            if (existing.quantity >= product.stock) {
                alert(`Stock insuficiente. Disponible: ${product.stock}`);
                return;
            }
            setSelectedItems(selectedItems.map(item =>
                item.product_id === product.id
                    ? { ...item, quantity: item.quantity + 1 }
                    : item
            ));
        } else {
            if (product.stock <= 0) {
                alert('Producto sin stock');
                return;
            }
            setSelectedItems([...selectedItems, {
                product_id: product.id,
                name: product.name,
                price: Number(product.sale_price || product.price),
                quantity: 1,
                stock: product.stock,
                image_url: product.image_url,
                sbin_code: product.sbin_code
            }]);
        }

        setSearch('');
        setShowAutocomplete(false);
        setSelectedSuggestionIndex(-1);
        searchInputRef.current?.focus();
    };

    const updateItemQuantity = (productId, delta) => {
        setSelectedItems(selectedItems.map(item => {
            if (item.product_id === productId) {
                const newQty = item.quantity + delta;
                if (newQty > item.stock) {
                    alert(`Stock insuficiente. Disponible: ${item.stock}`);
                    return item;
                }
                return newQty > 0 ? { ...item, quantity: newQty } : item;
            }
            return item;
        }).filter(item => item.quantity > 0));
    };

    const removeItem = (productId) => {
        setSelectedItems(selectedItems.filter(item => item.product_id !== productId));
    };

    const getTotal = () => {
        return selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    };

    const handleCreateAnticipo = async () => {
        if (!customerName.trim()) {
            alert('El nombre del cliente es obligatorio');
            return;
        }

        if (selectedItems.length === 0) {
            alert('Debe agregar al menos un producto');
            return;
        }

        setProcessing(true);

        try {
            const response = await fetch(`${API_URL}/anticipos`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    customer_name: customerName,
                    customer_phone: customerPhone,
                    items: selectedItems.map(item => ({
                        product_id: item.product_id,
                        quantity: item.quantity
                    })),
                    paid_amount: paidAmount ? Number(paidAmount) : 0,
                    notes
                })
            });

            if (response.ok) {
                alert('Anticipo creado exitosamente');
                // Reset form
                setCustomerName('');
                setCustomerPhone('');
                setNotes('');
                setPaidAmount('');
                setSelectedItems([]);
                fetchAnticipos();
            } else {
                const error = await response.json();
                alert(error.error || 'Error al crear anticipo');
            }
        } catch (error) {
            console.error('Error creating anticipo:', error);
            alert('Error al crear anticipo');
        } finally {
            setProcessing(false);
        }
    };

    const handleRegisterPayment = async () => {
        if (!paymentAmount || Number(paymentAmount) <= 0) {
            alert('Ingrese un monto válido');
            return;
        }

        try {
            const response = await fetch(`${API_URL}/anticipos/${selectedAnticipo.id}/payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ amount: Number(paymentAmount) })
            });

            if (response.ok) {
                alert('Pago registrado exitosamente');
                setShowPaymentModal(false);
                setPaymentAmount('');
                fetchAnticipos();
            } else {
                const error = await response.json();
                alert(error.error || 'Error al registrar pago');
            }
        } catch (error) {
            console.error('Error registering payment:', error);
            alert('Error al registrar pago');
        }
    };

    const handleCompleteAnticipo = async () => {
        const remaining = Number(selectedAnticipo.total_amount) - Number(selectedAnticipo.paid_amount);
        const finalPaymentValue = Number(finalPayment) || 0;

        if (finalPaymentValue < remaining) {
            alert(`Falta pagar $${(remaining - finalPaymentValue).toFixed(2)}`);
            return;
        }

        try {
            const response = await fetch(`${API_URL}/anticipos/${selectedAnticipo.id}/complete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    final_payment: finalPaymentValue,
                    payment_method: paymentMethod
                })
            });

            if (response.ok) {
                alert('Anticipo liquidado exitosamente');
                setShowCompleteModal(false);
                setFinalPayment('');
                fetchAnticipos();
            } else {
                const error = await response.json();
                alert(error.error || 'Error al liquidar anticipo');
            }
        } catch (error) {
            console.error('Error completing anticipo:', error);
            alert('Error al liquidar anticipo');
        }
    };

    const handleDeleteAnticipo = async (id) => {
        if (!confirm('¿Está seguro de eliminar este anticipo? Los productos se devolverán al inventario.')) {
            return;
        }

        try {
            const response = await fetch(`${API_URL}/anticipos/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                alert('Anticipo eliminado y productos devueltos al inventario');
                fetchAnticipos();
            } else {
                const error = await response.json();
                alert(error.error || 'Error al eliminar anticipo');
            }
        } catch (error) {
            console.error('Error deleting anticipo:', error);
            alert('Error al eliminar anticipo');
        }
    };

    const openPaymentModal = (anticipo) => {
        setSelectedAnticipo(anticipo);
        setShowPaymentModal(true);
    };

    const openCompleteModal = (anticipo) => {
        setSelectedAnticipo(anticipo);
        const remaining = Number(anticipo.total_amount) - Number(anticipo.paid_amount);
        setFinalPayment(remaining.toString());
        setShowCompleteModal(true);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-primary-500"></div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="container-custom py-6">
                <h1 className="text-2xl font-bold mb-6">Anticipos</h1>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left: Anticipos Table */}
                    <div className="glass-card">
                        <h2 className="text-xl font-semibold mb-4">Anticipos Activos</h2>

                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-white/10">
                                        <th className="text-left p-3 text-sm text-slate-400">Cliente</th>
                                        <th className="text-left p-3 text-sm text-slate-400">Total</th>
                                        <th className="text-left p-3 text-sm text-slate-400">Abonado</th>
                                        <th className="text-left p-3 text-sm text-slate-400">Estado</th>
                                        <th className="text-right p-3 text-sm text-slate-400">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {anticipos.map(anticipo => {
                                        const remaining = Number(anticipo.total_amount) - Number(anticipo.paid_amount);
                                        return (
                                            <tr key={anticipo.id} className="border-b border-white/5 hover:bg-white/5">
                                                <td className="p-3">
                                                    <div>
                                                        <p className="font-medium">{anticipo.customer_name}</p>
                                                        {anticipo.customer_phone && (
                                                            <p className="text-sm text-slate-400">{anticipo.customer_phone}</p>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-3">${Number(anticipo.total_amount).toFixed(2)}</td>
                                                <td className="p-3">
                                                    <div>
                                                        <p>${Number(anticipo.paid_amount).toFixed(2)}</p>
                                                        <p className="text-xs text-amber-400">Pendiente: ${remaining.toFixed(2)}</p>
                                                    </div>
                                                </td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-1 text-xs rounded-full ${anticipo.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                                                        anticipo.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                                                            'bg-slate-500/20 text-slate-400'
                                                        }`}>
                                                        {anticipo.status === 'pending' ? 'Pendiente' :
                                                            anticipo.status === 'completed' ? 'Completado' : 'Cancelado'}
                                                    </span>
                                                </td>
                                                <td className="p-3">
                                                    {anticipo.status === 'pending' && (
                                                        <div className="flex gap-2 justify-end flex-wrap">
                                                            <button
                                                                onClick={() => openPaymentModal(anticipo)}
                                                                className="btn-secondary text-xs px-2 py-1"
                                                            >
                                                                Abonar
                                                            </button>
                                                            <button
                                                                onClick={() => openCompleteModal(anticipo)}
                                                                className="btn-primary text-xs px-2 py-1"
                                                            >
                                                                Liquidar
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteAnticipo(anticipo.id)}
                                                                className="text-red-400 hover:text-red-300 text-xs px-2 py-1"
                                                            >
                                                                Eliminar
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            {anticipos.length === 0 && (
                                <div className="text-center py-12 text-slate-400">
                                    No hay anticipos registrados
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: New Anticipo Form */}
                    <div className="glass-card">
                        <h2 className="text-xl font-semibold mb-4">Nuevo Anticipo</h2>

                        <div className="space-y-4">
                            {/* Customer Info */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Nombre del Cliente *</label>
                                    <input
                                        type="text"
                                        value={customerName}
                                        onChange={(e) => setCustomerName(e.target.value)}
                                        className="input-glass w-full"
                                        placeholder="Nombre completo"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Teléfono</label>
                                    <input
                                        type="tel"
                                        value={customerPhone}
                                        onChange={(e) => setCustomerPhone(e.target.value)}
                                        className="input-glass w-full"
                                        placeholder="(opcional)"
                                    />
                                </div>
                            </div>

                            {/* Product Search with Autocomplete - COPIED FROM SALES.JSX */}
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Buscar Productos</label>
                                <div className="relative" ref={autocompleteRef}>
                                    <input
                                        ref={searchInputRef}
                                        type="text"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        onKeyDown={handleSearchKeyDown}
                                        placeholder="Buscar por nombre o código..."
                                        className="input-glass w-full"
                                    />

                                    {/* Autocomplete Dropdown */}
                                    {showAutocomplete && products.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900/98 backdrop-blur-xl border-2 border-primary-500/30 rounded-lg overflow-hidden z-50 shadow-2xl max-h-80 overflow-y-auto">
                                            {products.slice(0, 5).map((product, index) => (
                                                <button
                                                    key={product.id}
                                                    onClick={() => handleSuggestionClick(product)}
                                                    disabled={product.stock <= 0}
                                                    className={`w-full p-3 flex items-center gap-3 transition-colors text-left ${index === selectedSuggestionIndex
                                                        ? 'bg-primary-500/30 border-l-2 border-primary-400'
                                                        : 'hover:bg-white/5'
                                                        } ${product.stock <= 0 ? 'opacity-50 cursor-not-allowed' : ''} ${index !== products.slice(0, 5).length - 1 ? 'border-b border-white/5' : ''
                                                        }`}
                                                >
                                                    {product.image_url ? (
                                                        <img
                                                            src={product.image_url}
                                                            alt={product.name}
                                                            className="w-12 h-12 object-cover rounded"
                                                        />
                                                    ) : (
                                                        <div className="w-12 h-12 bg-black/20 rounded flex items-center justify-center">
                                                            <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                            </svg>
                                                        </div>
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-medium truncate">{product.name}</p>
                                                        {product.sbin_code && (
                                                            <p className="text-xs text-slate-400 font-mono">{product.sbin_code}</p>
                                                        )}
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="font-bold text-primary-400">
                                                            ${Number(product.sale_price || product.price).toFixed(2)}
                                                        </p>
                                                        {product.stock <= 0 ? (
                                                            <p className="text-xs text-red-400">Sin stock</p>
                                                        ) : product.stock <= 5 ? (
                                                            <p className="text-xs text-amber-400">Stock: {product.stock}</p>
                                                        ) : null}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                    Usa <kbd className="px-1 py-0.5 bg-slate-700 rounded text-xs">↑↓</kbd> para navegar • <kbd className="px-1 py-0.5 bg-slate-700 rounded text-xs">Enter</kbd> para agregar
                                </p>
                            </div>

                            {/* Selected Products */}
                            {selectedItems.length > 0 && (
                                <div>
                                    <div className="flex justify-between items-end mb-2">
                                        <label className="text-sm text-slate-400">Productos Seleccionados</label>
                                        <span className="text-xs text-slate-500">{selectedItems.reduce((acc, item) => acc + item.quantity, 0)} artículos</span>
                                    </div>
                                    <div className="bg-slate-900/50 rounded-lg overflow-hidden border border-white/5 max-h-60 overflow-y-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-white/5 text-slate-400">
                                                <tr>
                                                    <th className="p-2 text-left">Producto</th>
                                                    <th className="p-2 text-center w-24">Cant.</th>
                                                    <th className="p-2 text-right">Total</th>
                                                    <th className="p-2 w-8"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                                {selectedItems.map(item => (
                                                    <tr key={item.product_id} className="hover:bg-white/5 transition-colors">
                                                        <td className="p-2">
                                                            <div className="flex items-center gap-2">
                                                                {item.image_url && (
                                                                    <img src={item.image_url} alt={item.name} className="w-8 h-8 object-cover rounded" />
                                                                )}
                                                                <div className="min-w-0">
                                                                    <p className="font-medium truncate max-w-[150px]">{item.name}</p>
                                                                    <p className="text-xs text-slate-500">${item.price.toFixed(2)}</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="p-2">
                                                            <div className="flex items-center justify-center gap-1">
                                                                <button
                                                                    onClick={() => updateItemQuantity(item.product_id, -1)}
                                                                    className="w-6 h-6 flex items-center justify-center bg-slate-700/50 hover:bg-slate-700 rounded transition-colors"
                                                                >
                                                                    -
                                                                </button>
                                                                <span className="w-6 text-center tabular-nums">{item.quantity}</span>
                                                                <button
                                                                    onClick={() => updateItemQuantity(item.product_id, 1)}
                                                                    className="w-6 h-6 flex items-center justify-center bg-slate-700/50 hover:bg-slate-700 rounded transition-colors"
                                                                >
                                                                    +
                                                                </button>
                                                            </div>
                                                        </td>
                                                        <td className="p-2 text-right font-medium text-emerald-400 tabular-nums">
                                                            ${(item.price * item.quantity).toFixed(2)}
                                                        </td>
                                                        <td className="p-2 text-center">
                                                            <button
                                                                onClick={() => removeItem(item.product_id)}
                                                                className="text-slate-500 hover:text-red-400 transition-colors"
                                                            >
                                                                &times;
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Additional Info */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Abono Inicial</label>
                                    <input
                                        type="number"
                                        value={paidAmount}
                                        onChange={(e) => setPaidAmount(e.target.value)}
                                        className="input-glass w-full"
                                        placeholder="0.00"
                                        step="0.01"
                                        min="0"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Total</label>
                                    <div className="input-glass bg-slate-800 text-primary-400 font-bold">
                                        ${getTotal().toFixed(2)}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Notas</label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    className="input-glass w-full"
                                    rows="2"
                                    placeholder="Notas adicionales (opcional)"
                                ></textarea>
                            </div>

                            <button
                                onClick={handleCreateAnticipo}
                                disabled={processing || selectedItems.length === 0 || !customerName.trim()}
                                className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {processing ? 'Creando...' : 'Crear Anticipo'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Payment Modal */}
            {showPaymentModal && selectedAnticipo && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="glass-card max-w-md w-full">
                        <h3 className="text-xl font-semibold mb-4">Registrar Abono</h3>

                        <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Total:</span>
                                <span className="font-bold">${Number(selectedAnticipo.total_amount).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Abonado:</span>
                                <span>${Number(selectedAnticipo.paid_amount).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Pendiente:</span>
                                <span className="text-amber-400 font-bold">
                                    ${(Number(selectedAnticipo.total_amount) - Number(selectedAnticipo.paid_amount)).toFixed(2)}
                                </span>
                            </div>

                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Monto a Abonar</label>
                                <input
                                    type="number"
                                    value={paymentAmount}
                                    onChange={(e) => setPaymentAmount(e.target.value)}
                                    className="input-glass w-full"
                                    placeholder="0.00"
                                    step="0.01"
                                    min="0"
                                    autoFocus
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowPaymentModal(false)}
                                    className="btn-secondary flex-1"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleRegisterPayment}
                                    className="btn-primary flex-1"
                                >
                                    Registrar Pago
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Complete Modal */}
            {showCompleteModal && selectedAnticipo && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="glass-card max-w-md w-full">
                        <h3 className="text-xl font-semibold mb-4">Liquidar Anticipo</h3>

                        <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Cliente:</span>
                                <span className="font-medium">{selectedAnticipo.customer_name}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Total:</span>
                                <span className="font-bold">${Number(selectedAnticipo.total_amount).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Abonado:</span>
                                <span>${Number(selectedAnticipo.paid_amount).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-lg">
                                <span className="text-slate-400">Saldo Final:</span>
                                <span className="text-emerald-400 font-bold">
                                    ${(Number(selectedAnticipo.total_amount) - Number(selectedAnticipo.paid_amount)).toFixed(2)}
                                </span>
                            </div>

                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Pago Final</label>
                                <input
                                    type="number"
                                    value={finalPayment}
                                    onChange={(e) => setFinalPayment(e.target.value)}
                                    className="input-glass w-full"
                                    step="0.01"
                                    min="0"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Método de Pago</label>
                                <select
                                    value={paymentMethod}
                                    onChange={(e) => setPaymentMethod(e.target.value)}
                                    className="input-glass w-full"
                                >
                                    <option value="cash">Efectivo</option>
                                    <option value="card">Tarjeta</option>
                                </select>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowCompleteModal(false)}
                                    className="btn-secondary flex-1"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleCompleteAnticipo}
                                    className="btn-primary flex-1"
                                >
                                    Completar Venta
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
