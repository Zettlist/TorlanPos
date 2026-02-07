import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';

const SAMPLE_PRODUCTS = [
    { name: 'Coca-Cola 600ml', price: 18, stock: 100, category: 'Bebidas', extras: [] },
    { name: 'Pepsi 600ml', price: 17, stock: 80, category: 'Bebidas', extras: [] },
    { name: 'Agua Bonafont 1L', price: 15, stock: 150, category: 'Bebidas', extras: [] },
    { name: 'Sabritas Original', price: 22, stock: 50, category: 'Snacks', extras: [] },
    { name: 'Doritos Nacho', price: 25, stock: 40, category: 'Snacks', extras: [] },
    { name: 'Gansito Marinela', price: 18, stock: 60, category: 'Pan Dulce', extras: [] },
    { name: 'Bimbo Pan Blanco', price: 45, stock: 30, category: 'Pan', extras: [] },
    { name: 'Leche Lala 1L', price: 28, stock: 40, category: 'Lácteos', extras: [] },
];

// Predefined extras options
const AVAILABLE_EXTRAS = [
    'Funda',
    'Protector de pantalla',
    'Cargador',
    'Auriculares',
    'Cable USB',
    'Soporte',
    'Estuche',
    'Garantía extendida',
    'Empaque regalo',
    'Batería extra'
];

export default function SetupWizard() {
    const [step, setStep] = useState(1);
    const [products, setProducts] = useState(SAMPLE_PRODUCTS);
    const [newProduct, setNewProduct] = useState({ name: '', price: '', stock: '', category: '', isbn: '', extras: [] });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const { token, completeSetup, isEmpresaAdmin, isGlobalAdmin, user } = useAuth();
    const navigate = useNavigate();

    // STRICT SECURITY: Redirect employees to dashboard immediately
    useEffect(() => {
        if (user && !isEmpresaAdmin() && !isGlobalAdmin()) {
            navigate('/', { replace: true });
        }
    }, [user, isEmpresaAdmin, isGlobalAdmin, navigate]);

    // Extras modal state
    const [showExtrasModal, setShowExtrasModal] = useState(false);
    const [selectedExtras, setSelectedExtras] = useState([]);
    const [customExtra, setCustomExtra] = useState('');

    // Extras modal functions
    const openExtrasModal = () => {
        setSelectedExtras([...newProduct.extras]);
        setShowExtrasModal(true);
    };

    const toggleExtra = (extra) => {
        setSelectedExtras(prev =>
            prev.includes(extra)
                ? prev.filter(e => e !== extra)
                : [...prev, extra]
        );
    };

    const addCustomExtra = () => {
        if (customExtra.trim() && !selectedExtras.includes(customExtra.trim())) {
            setSelectedExtras([...selectedExtras, customExtra.trim()]);
            setCustomExtra('');
        }
    };

    const confirmExtras = () => {
        setNewProduct({ ...newProduct, extras: selectedExtras });
        setShowExtrasModal(false);
    };

    const removeExtraFromProduct = (extra) => {
        setNewProduct({
            ...newProduct,
            extras: newProduct.extras.filter(e => e !== extra)
        });
    };

    const handleAddProduct = () => {
        if (!newProduct.name || !newProduct.price) {
            setError('Nombre y precio son requeridos');
            return;
        }

        setProducts([...products, {
            ...newProduct,
            price: parseFloat(newProduct.price),
            stock: parseInt(newProduct.stock) || 0,
            extras: newProduct.extras || []
        }]);
        setNewProduct({ name: '', price: '', stock: '', category: '', isbn: '', extras: [] });
        setSelectedExtras([]);
        setError('');
    };

    const handleRemoveProduct = (index) => {
        setProducts(products.filter((_, i) => i !== index));
    };

    const handleFinish = async () => {
        if (products.length === 0) {
            setError('Debes agregar al menos un producto');
            return;
        }

        setLoading(true);
        setError('');

        try {
            // Save products
            const response = await fetch(`${API_URL}/products/bulk`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ products })
            });

            if (!response.ok) {
                throw new Error('Error al guardar productos');
            }

            // Mark setup as complete
            await completeSetup();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            {/* Extras Selection Modal */}
            {showExtrasModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="glass-card p-6 w-full max-w-md animate-slide-up">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold">Seleccionar Extras</h2>
                            <button
                                onClick={() => setShowExtrasModal(false)}
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Predefined extras list */}
                        <div className="mb-4">
                            <label className="block text-sm text-slate-400 mb-2">Extras disponibles</label>
                            <div className="max-h-48 overflow-y-auto space-y-2 bg-white/5 rounded-xl p-3">
                                {AVAILABLE_EXTRAS.map((extra) => (
                                    <button
                                        key={extra}
                                        type="button"
                                        onClick={() => toggleExtra(extra)}
                                        className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${selectedExtras.includes(extra)
                                            ? 'bg-primary-500/30 text-primary-300 border border-primary-500/50'
                                            : 'hover:bg-white/10 border border-transparent'
                                            }`}
                                    >
                                        <span>{extra}</span>
                                        {selectedExtras.includes(extra) && (
                                            <svg className="w-5 h-5 text-primary-400" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Custom extra input */}
                        <div className="mb-4">
                            <label className="block text-sm text-slate-400 mb-2">Agregar extra personalizado</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={customExtra}
                                    onChange={(e) => setCustomExtra(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && addCustomExtra()}
                                    placeholder="Escribir extra..."
                                    className="input-glass flex-1"
                                />
                                <button
                                    type="button"
                                    onClick={addCustomExtra}
                                    disabled={!customExtra.trim()}
                                    className="btn-secondary px-4 disabled:opacity-50"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Selected extras preview */}
                        {selectedExtras.length > 0 && (
                            <div className="mb-4 p-3 bg-white/5 rounded-xl">
                                <p className="text-sm text-slate-400 mb-2">Seleccionados ({selectedExtras.length})</p>
                                <div className="flex flex-wrap gap-2">
                                    {selectedExtras.map((extra, i) => (
                                        <span
                                            key={i}
                                            className="inline-flex items-center gap-1 px-2 py-1 bg-primary-500/20 text-primary-300 rounded-full text-sm"
                                        >
                                            {extra}
                                            <button
                                                type="button"
                                                onClick={() => toggleExtra(extra)}
                                                className="hover:text-white"
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Confirm button */}
                        <button
                            type="button"
                            onClick={confirmExtras}
                            className="w-full btn-primary py-3 font-semibold"
                        >
                            Confirmar Extras
                        </button>
                    </div>
                </div>
            )}

            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 -left-20 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl"></div>
                <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-primary-500/20 rounded-full blur-3xl"></div>
            </div>

            <div className="w-full max-w-4xl relative">
                {/* Header */}
                <div className="text-center mb-8 animate-fade-in">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-2xl shadow-emerald-500/30 mb-6">
                        <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-bold text-white">
                        Configuración Inicial
                    </h1>
                    <p className="text-slate-400 mt-2">
                        Configura tu catálogo de productos para comenzar
                    </p>
                </div>

                {/* Steps indicator */}
                <div className="flex justify-center gap-4 mb-8">
                    {[1, 2].map((s) => (
                        <div
                            key={s}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${step === s
                                ? 'bg-primary-500/20 border border-primary-500/50 text-primary-400'
                                : step > s
                                    ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400'
                                    : 'bg-slate-700/30 text-slate-500'
                                }`}
                        >
                            {step > s ? (
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                            ) : (
                                <span className="w-5 h-5 flex items-center justify-center text-sm font-medium">{s}</span>
                            )}
                            <span className="font-medium">
                                {s === 1 ? 'Productos' : 'Confirmar'}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Content */}
                <div className="glass-card p-8 animate-slide-up">
                    {error && (
                        <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 text-sm">
                            {error}
                        </div>
                    )}

                    {step === 1 && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-semibold">Catálogo de Productos</h2>
                                <span className="text-slate-400 text-sm">{products.length} productos</span>
                            </div>

                            {/* Add product form */}
                            <div className="space-y-3">
                                {/* First row: Name, Price, Stock */}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                    <input
                                        type="text"
                                        value={newProduct.name}
                                        onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                                        placeholder="Nombre del producto"
                                        className="input-glass md:col-span-2"
                                    />
                                    <input
                                        type="number"
                                        value={newProduct.price}
                                        onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                                        placeholder="Precio"
                                        className="input-glass"
                                        min="0"
                                        step="0.01"
                                    />
                                    <input
                                        type="number"
                                        value={newProduct.stock}
                                        onChange={(e) => setNewProduct({ ...newProduct, stock: e.target.value })}
                                        placeholder="Stock"
                                        className="input-glass"
                                        min="0"
                                    />
                                </div>
                                {/* Second row: Category, ISBN, Extras, Add button */}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                    <input
                                        type="text"
                                        value={newProduct.category}
                                        onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                                        placeholder="Categoría"
                                        className="input-glass"
                                    />
                                    <input
                                        type="text"
                                        value={newProduct.isbn}
                                        onChange={(e) => setNewProduct({ ...newProduct, isbn: e.target.value })}
                                        placeholder="ISBN"
                                        className="input-glass"
                                    />
                                    <button
                                        type="button"
                                        onClick={openExtrasModal}
                                        className="input-glass text-left flex items-center justify-between hover:border-primary-500/50 transition-colors"
                                    >
                                        <span className={newProduct.extras.length > 0 ? 'text-white' : 'text-slate-400'}>
                                            {newProduct.extras.length > 0
                                                ? `${newProduct.extras.length} extra${newProduct.extras.length > 1 ? 's' : ''}`
                                                : 'Extras...'}
                                        </span>
                                        <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={handleAddProduct}
                                        className="btn-secondary flex items-center justify-center gap-2"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        Agregar
                                    </button>
                                </div>
                            </div>

                            {/* Show selected extras as badges */}
                            {newProduct.extras.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {newProduct.extras.map((extra, i) => (
                                        <span
                                            key={i}
                                            className="inline-flex items-center gap-1 px-3 py-1 bg-primary-500/20 text-primary-300 rounded-full text-sm"
                                        >
                                            {extra}
                                            <button
                                                type="button"
                                                onClick={() => removeExtraFromProduct(extra)}
                                                className="hover:text-white transition-colors"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Products list */}
                            <div className="max-h-80 overflow-y-auto space-y-2">
                                {products.map((product, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10"
                                    >
                                        <div className="flex-1">
                                            <p className="font-medium">{product.name}</p>
                                            <p className="text-sm text-slate-400">
                                                {product.category && `${product.category} • `}
                                                {product.isbn && `ISBN: ${product.isbn} • `}
                                                Stock: {product.stock}
                                                {product.extras && product.extras.length > 0 && (
                                                    <span className="text-primary-400"> • Extras: {product.extras.join(', ')}</span>
                                                )}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="text-lg font-semibold text-emerald-400">
                                                ${Number(product.price).toFixed(2)}
                                            </span>
                                            <button
                                                onClick={() => handleRemoveProduct(index)}
                                                className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex justify-end">
                                <button
                                    onClick={() => setStep(2)}
                                    className="btn-primary flex items-center gap-2"
                                >
                                    Continuar
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-6 text-center">
                            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-emerald-500/20 mb-4">
                                <svg className="w-12 h-12 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>

                            <h2 className="text-2xl font-bold">¡Todo listo!</h2>
                            <p className="text-slate-400 max-w-md mx-auto">
                                Has configurado <span className="text-white font-medium">{products.length} productos</span> en tu catálogo.
                                Puedes agregar más productos después desde el menú de Productos.
                            </p>

                            <div className="flex justify-center gap-4 pt-4">
                                <button
                                    onClick={() => setStep(1)}
                                    className="btn-secondary"
                                >
                                    Volver a editar
                                </button>
                                <button
                                    onClick={handleFinish}
                                    disabled={loading}
                                    className="btn-primary flex items-center gap-2"
                                >
                                    {loading ? (
                                        <>
                                            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                                            Guardando...
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            Comenzar a usar Torlan POS
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
