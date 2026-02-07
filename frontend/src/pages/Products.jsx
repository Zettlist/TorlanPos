import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { generateProductLabel } from '../utils/labelGenerator';

// Predefined extras options
const AVAILABLE_EXTRAS = [];

const CreatableSelect = ({ label, value, onChange, options, placeholder, ...props }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const wrapperRef = useRef(null);

    // Filter options based on current input
    const filteredOptions = useMemo(() => {
        if (!value || typeof value !== 'string') return options;
        const lowerValue = value.toLowerCase();
        return options.filter(opt =>
            opt.toLowerCase().includes(lowerValue) &&
            opt.toLowerCase() !== lowerValue // Don't show if exact match
        );
    }, [options, value]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex(prev => Math.min(prev + 1, filteredOptions.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && isOpen && filteredOptions.length > 0) {
            e.preventDefault();
            onChange(filteredOptions[highlightedIndex]);
            setIsOpen(false);
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        }
    };

    return (
        <div className="relative" ref={wrapperRef}>
            <label className="block text-sm text-slate-400 mb-1">{label}</label>
            <input
                type="text"
                value={value}
                onChange={(e) => {
                    onChange(e.target.value);
                    setIsOpen(true);
                    setHighlightedIndex(0);
                }}
                onFocus={() => setIsOpen(true)}
                onKeyDown={handleKeyDown}
                className="input-glass w-full"
                placeholder={placeholder}
                {...props}
            />
            {isOpen && filteredOptions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                    {filteredOptions.map((option, index) => (
                        <button
                            key={option}
                            type="button"
                            onClick={() => {
                                onChange(option);
                                setIsOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${index === highlightedIndex
                                ? 'bg-primary-500/20 text-primary-300'
                                : 'text-slate-300 hover:bg-white/5'
                                }`}
                        >
                            {option}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default function Products() {
    const { token } = useAuth();
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [forceDeleteConfirm, setForceDeleteConfirm] = useState(null);
    const [successData, setSuccessData] = useState(null);
    const [suppliers, setSuppliers] = useState([]);
    const [sbinStatus, setSbinStatus] = useState({ checking: false, isDuplicate: false, existingProduct: null });
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    const [formData, setFormData] = useState({
        name: '',
        product_type: 'Libro', // Default to Libro
        cost_price: '',
        sale_price: '',
        stock: '',
        category: '',
        gender: '',
        sbin_code: '',
        isbn: '',
        publication_date: '',
        publisher: '',
        page_count: '',
        dimensions: { length: '', width: '', height: '' },
        weight: '',
        page_color: 'Blanco y Negro',
        language: '',
        supplier_id: '',
        supplier_price: '',
        extras: [],
        barcode: ''
    });

    // Extras modal state
    const [showExtrasModal, setShowExtrasModal] = useState(false);
    const [selectedExtras, setSelectedExtras] = useState([]);
    const [customExtra, setCustomExtra] = useState('');

    // Image state
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [zoomImage, setZoomImage] = useState(null);

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Suggestions state
    const [suggestions, setSuggestions] = useState({ categories: [], publishers: [], genders: [] });

    // Helper to parse extras
    const parseExtras = (extras) => {
        if (!extras) return [];
        if (Array.isArray(extras)) return extras;
        if (typeof extras === 'string') {
            try {
                const parsed = JSON.parse(extras);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return extras.split(',').map(e => e.trim()).filter(Boolean);
            }
        }
        return [];
    };

    useEffect(() => {
        fetchProducts();
        fetchSuggestions();
        fetchSuppliers();
    }, []);

    const fetchSuppliers = async () => {
        try {
            const response = await fetch(`${API_URL}/suppliers`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setSuppliers(data);
            }
        } catch (error) {
            console.error('Error fetching suppliers:', error);
        }
    };

    // Extract unique values (Client-side fail-safe if API fails)
    const uniqueCategories = useMemo(() => {
        return suggestions?.categories || [];
    }, [suggestions]);

    const uniqueGenders = useMemo(() => {
        return suggestions?.genders || [];
    }, [suggestions]);

    const uniquePublishers = useMemo(() => {
        if (suggestions.publishers.length > 0) return suggestions.publishers;
        if (!products) return [];
        const pubs = new Set(products.map(p => p.publisher).filter(Boolean));
        return Array.from(pubs).sort();
    }, [products, suggestions.publishers]);

    // Debounced SBIN validation
    useEffect(() => {
        if (!formData.sbin_code || formData.sbin_code.trim() === '') {
            setSbinStatus({ checking: false, isDuplicate: false, existingProduct: null });
            return;
        }

        const timer = setTimeout(() => {
            checkSbinDuplicate(formData.sbin_code);
        }, 300);

        return () => clearTimeout(timer);
    }, [formData.sbin_code, editingProduct]);

    const checkSbinDuplicate = async (sbin_code) => {
        setSbinStatus(prev => ({ ...prev, checking: true }));
        try {
            const excludeId = editingProduct?.id || '';
            const response = await fetch(`${API_URL}/products/check-sbin?sbin_code=${encodeURIComponent(sbin_code)}&exclude_id=${excludeId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setSbinStatus({
                    checking: false,
                    isDuplicate: data.isDuplicate,
                    existingProduct: data.existingProduct
                });
            }
        } catch (error) {
            console.error('Error checking SBIN:', error);
            setSbinStatus({ checking: false, isDuplicate: false, existingProduct: null });
        }
    };

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

    const fetchSuggestions = async () => {
        try {
            const response = await fetch(`${API_URL}/products/suggestions`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setSuggestions(data);
            }
        } catch (error) {
            console.error('Error fetching suggestions:', error);
        }
    };

    const generateSku = async () => {
        try {
            const response = await fetch(`${API_URL}/products/generate-sku`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setFormData(prev => ({ ...prev, isbn: data.sku }));
            }
        } catch (error) {
            console.error('Error generating SKU:', error);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (sbinStatus.isDuplicate) {
            return; // Block submission
        }

        // Validate Image on Create
        if (!editingProduct && !imageFile) {
            alert('La imagen del producto es obligatoria.');
            return;
        }

        // Warning on sensitive field changes
        if (editingProduct) {
            const sensitiveChanged = (formData.category !== editingProduct.category) || (formData.publisher !== editingProduct.publisher);
            if (sensitiveChanged) {
                const proceed = window.confirm("⚠️ ADVERTENCIA: Has modificado la Categoría o Editorial.\n\nEsto podría hacer que el código actual (SBIN/ISBN) ya no coincida con las reglas de generación.\n\n¿Estás seguro de que deseas guardar los cambios?");
                if (!proceed) return;
            }
        }

        setIsSubmitting(true);

        const url = editingProduct
            ? `${API_URL}/products/${editingProduct.id}`
            : `${API_URL}/products`;
        const method = editingProduct ? 'PUT' : 'POST';

        try {
            const formDataToSend = new FormData();
            formDataToSend.append('name', formData.name);
            formDataToSend.append('cost_price', formData.cost_price);
            formDataToSend.append('sale_price', formData.sale_price);
            formDataToSend.append('stock', formData.stock || 0);
            formDataToSend.append('category', formData.category);
            formDataToSend.append('gender', formData.gender);
            formDataToSend.append('sbin_code', formData.sbin_code);
            formDataToSend.append('isbn', formData.isbn);
            formDataToSend.append('barcode', formData.barcode);
            formDataToSend.append('publication_date', formData.publication_date);
            formDataToSend.append('publisher', formData.publisher);
            formDataToSend.append('page_count', formData.page_count);
            formDataToSend.append('weight', formData.weight);
            formDataToSend.append('page_color', formData.page_color);
            formDataToSend.append('language', formData.language);
            formDataToSend.append('supplier_id', formData.supplier_id || '');
            formDataToSend.append('supplier_price', formData.supplier_price || '');

            formDataToSend.append('dimensions', JSON.stringify(formData.dimensions));
            formDataToSend.append('extras', JSON.stringify(formData.extras || []));

            if (imageFile) {
                formDataToSend.append('image', imageFile);
            }

            const response = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formDataToSend
            });

            if (response.ok) {
                const data = await response.json();
                fetchProducts();
                fetchSuggestions();
                closeForm();

                // Show success message if barcode was generated
                // We check if we sent a barcode (from formData) vs what we got back
                if (!editingProduct && !formData.barcode && !formData.sbin_code && data.barcode) {
                    setSuccessData({
                        title: '¡Producto Creado!',
                        message: 'Se ha generado automáticamente un código de barras para este producto.',
                        barcode: data.barcode,
                        name: formData.name
                    });
                }
            } else {
                const errorData = await response.json();
                alert(errorData.error || 'Error al guardar el producto');
            }
        } catch (error) {
            console.error('Error saving product:', error);
            alert('Error inesperado al guardar el producto: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const closeForm = () => {
        setShowForm(false);
        setEditingProduct(null);
        setFormData({
            name: '', product_type: 'Libro', cost_price: '', sale_price: '', stock: '', category: '', sbin_code: '', isbn: '',
            publication_date: '', publisher: '', page_count: '',
            dimensions: { length: '', width: '', height: '' }, weight: '',
            page_color: 'Blanco y Negro', language: '',
            supplier_id: '', supplier_price: '',
            extras: [], barcode: ''
        });
        setSbinStatus({ checking: false, isDuplicate: false, existingProduct: null });
        setSelectedExtras([]);
        setShowExtrasModal(false);
        setImageFile(null);
        setImagePreview(null);
    };

    // Extras modal functions
    const openExtrasModal = () => {
        setSelectedExtras([...formData.extras]);
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
        setFormData({ ...formData, extras: selectedExtras });
        setShowExtrasModal(false);
    };

    const removeExtraFromForm = (extra) => {
        setFormData({
            ...formData,
            extras: formData.extras.filter(e => e !== extra)
        });
    };

    // Sorting logic
    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedProducts = useMemo(() => {
        let sortableItems = [...products];

        // 1. Filter first
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            sortableItems = sortableItems.filter(product =>
                product.name.toLowerCase().includes(query) ||
                (product.sbin_code && product.sbin_code.toLowerCase().includes(query)) ||
                (product.isbn && product.isbn.toLowerCase().includes(query)) ||
                (product.barcode && product.barcode.toLowerCase().includes(query)) ||
                (product.category && product.category.toLowerCase().includes(query))
            );
        }

        // 2. Sort
        if (sortConfig.key !== null) {
            sortableItems.sort((a, b) => {
                let aValue, bValue;

                switch (sortConfig.key) {
                    case 'name':
                        aValue = a.name || '';
                        bValue = b.name || '';
                        break;
                    case 'isbn':
                        aValue = a.isbn || a.sbin_code || a.barcode || '';
                        bValue = b.isbn || b.sbin_code || b.barcode || '';
                        break;
                    case 'category':
                        aValue = a.category || '';
                        bValue = b.category || '';
                        break;
                    case 'publisher':
                        aValue = a.publisher || '';
                        bValue = b.publisher || '';
                        break;
                    case 'price':
                        aValue = Number(a.sale_price || a.price || 0);
                        bValue = Number(b.sale_price || b.price || 0);
                        break;
                    case 'stock':
                        aValue = Number(a.stock || 0);
                        bValue = Number(b.stock || 0);
                        break;
                    default:
                        return 0;
                }

                if (typeof aValue === 'string') {
                    return sortConfig.direction === 'asc'
                        ? aValue.localeCompare(bValue)
                        : bValue.localeCompare(aValue);
                } else {
                    // For numbers (Price/Stock), User wants Arrow Up (asc) to be Highest First (Desc)
                    return sortConfig.direction === 'asc'
                        ? bValue - aValue  // Descending
                        : aValue - bValue; // Ascending
                }
            });
        }
        return sortableItems;
    }, [products, sortConfig, searchQuery]);

    const handleEdit = (product) => {
        setEditingProduct(product);
        const parsedExtras = parseExtras(product.extras);

        // Robust dimensions parsing
        let parsedDimensions = { length: '', width: '', height: '' };
        if (product.dimensions) {
            try {
                if (typeof product.dimensions === 'string' && product.dimensions.startsWith('{')) {
                    parsedDimensions = JSON.parse(product.dimensions);
                } else if (typeof product.dimensions === 'string' && product.dimensions.includes('x')) {
                    // Handle legacy "LxWxH" format from backfill script
                    const [l, w, h] = product.dimensions.split('x');
                    parsedDimensions = { length: l || '', width: w || '', height: h || '' };
                }
            } catch (e) {
                console.warn('Error parsing dimensions:', e);
            }
        }

        setFormData({
            name: product.name,
            cost_price: product.cost_price || '',
            sale_price: product.sale_price || product.price || '',
            stock: product.stock.toString(),
            category: product.category || '',
            gender: product.gender || '',
            sbin_code: product.sbin_code || product.isbn || '',
            isbn: product.isbn || product.sbin_code || '',
            publication_date: product.publication_date || '',
            publisher: product.publisher || '',
            page_count: product.page_count || '',
            dimensions: parsedDimensions,
            weight: product.weight || '',
            page_color: product.page_color || 'Blanco y Negro',
            language: product.language || '',
            supplier_id: product.supplier_id || '',
            supplier_price: product.supplier_price || '',
            extras: parsedExtras,
            barcode: product.barcode || ''
        });
        setSelectedExtras(parsedExtras);
        setSbinStatus({ checking: false, isDuplicate: false, existingProduct: null });
        setImagePreview(product.image_url || null);
        setImageFile(null);
        setShowForm(true);
    };

    const handleDelete = async () => {
        if (!deleteConfirm) return;

        try {
            const response = await fetch(`${API_URL}/products/${deleteConfirm.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                fetchProducts();
                setDeleteConfirm(null);
            } else {
                const data = await response.json();
                if (response.status === 400 && data.error && data.error.includes('ventas o registros')) {
                    setDeleteConfirm(null); // Close standard delete modal
                    setForceDeleteConfirm(deleteConfirm); // Open force delete modal
                } else {
                    alert(data.error || 'Error al eliminar producto');
                }
            }
        } catch (error) {
            console.error('Error deleting product:', error);
            alert('Error al eliminar producto: Es posible que tenga ventas asociadas.');
        }
    };

    const handleForceDelete = async () => {
        if (!forceDeleteConfirm) return;

        try {
            const response = await fetch(`${API_URL}/products/${forceDeleteConfirm.id}?force=true`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                fetchProducts();
                setForceDeleteConfirm(null);
                // Optional: Show success toast
            } else {
                const data = await response.json();
                alert(data.error || 'Error al forzar la eliminación');
            }
        } catch (error) {
            console.error('Error force deleting product:', error);
            alert('Error crítico al eliminar producto.');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Productos</h1>
                    <p className="text-slate-400">{products.length} productos en catálogo</p>
                </div>
                <button
                    onClick={() => {
                        setShowForm(true);
                        setEditingProduct(null);
                        setFormData({
                            name: '', cost_price: '', sale_price: '', stock: '', category: '', gender: '', sbin_code: '', isbn: '',
                            publication_date: '', publisher: '', page_count: '',
                            dimensions: { length: '', width: '', height: '' }, weight: '',
                            page_color: 'Blanco y Negro', language: '',
                            supplier_id: '', supplier_price: '', extras: [], barcode: ''
                        });
                        setSelectedExtras([]);
                        setImageFile(null);
                        setImagePreview(null);
                    }}
                    className="btn-primary flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Nuevo Producto
                </button>
            </div>

            {/* Search Bar - No changes */}
            <div className="relative">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar productos por nombre, código o categoría..."
                    className="input-glass pl-12 pr-10 w-full"
                />
                {searchQuery && (
                    <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Success Barcode Modal */}
            {successData && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
                    <div className="glass-card p-6 w-full max-w-md animate-slide-up bg-slate-900/90 border border-emerald-500/30">
                        <div className="flex flex-col items-center text-center mb-6">
                            <div className="p-4 bg-emerald-500/20 rounded-full mb-4">
                                <svg className="w-10 h-10 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">{successData.title}</h3>
                            <p className="text-slate-400 text-sm">
                                {successData.message}
                            </p>
                        </div>

                        <div className="bg-black/40 rounded-xl p-6 mb-6 border border-white/5">
                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Código Generado (EAN-13)</p>
                            <div className="flex items-center justify-center gap-3">
                                <span className="text-2xl font-mono text-emerald-400 tracking-widest font-bold">
                                    {successData.barcode}
                                </span>
                                <button
                                    onClick={() => navigator.clipboard.writeText(successData.barcode)}
                                    className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                                    title="Copiar al portapapeles"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                    </svg>
                                </button>
                            </div>
                            <p className="text-center text-sm text-slate-400 mt-2">{successData.name}</p>
                        </div>

                        <button
                            onClick={() => setSuccessData(null)}
                            className="w-full btn-primary py-3"
                        >
                            Entendido
                        </button>
                    </div>
                </div>
            )}

            {/* Extras Selection Modal */}
            {showExtrasModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
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
                        {AVAILABLE_EXTRAS.length > 0 && (
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
                        )}

                        {/* Custom extra input */}
                        <div className="mb-4">
                            <label className="block text-sm text-slate-400 mb-2">Agregar extra personalizado</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={customExtra}
                                    onChange={(e) => setCustomExtra(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomExtra())}
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

            {/* Form Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="glass-card p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto animate-slide-up custom-scrollbar">
                        <h2 className="text-xl font-semibold mb-6 sticky top-0 bg-[#1e293b] z-10 pb-4 border-b border-white/5 -mx-6 px-6 pt-2 -mt-2">
                            {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
                        </h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Image Upload */}
                            <div className="flex justify-center mb-6">
                                <div className="relative group">
                                    <div className={`w-32 h-32 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden transition-colors ${imagePreview ? 'border-primary-500 bg-black/40' : 'border-slate-600 hover:border-primary-500/50 bg-white/5'
                                        }`}>
                                        {imagePreview ? (
                                            <img
                                                src={imagePreview}
                                                alt="Preview"
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="text-center p-4">
                                                <svg className="w-8 h-8 text-slate-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                                <span className="text-xs text-slate-500">
                                                    {editingProduct ? 'Cambiar imagen' : 'Subir foto *'}
                                                </span>
                                            </div>
                                        )}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => {
                                                const file = e.target.files[0];
                                                if (file) {
                                                    // Validate file size (50MB limit)
                                                    if (file.size > 50 * 1024 * 1024) {
                                                        alert('El archivo es demasiado grande. El límite máximo es de 50MB.');
                                                        e.target.value = null; // Clear input
                                                        return;
                                                    }
                                                    setImageFile(file);
                                                    setImagePreview(URL.createObjectURL(file));
                                                }
                                            }}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            required={!editingProduct && !imageFile}
                                        />
                                    </div>
                                    {editingProduct && !imagePreview && (
                                        <p className="text-xs text-center text-slate-500 mt-2">Sin imagen actual</p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Nombre</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="input-glass"
                                    placeholder="Nombre del producto"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">ISBN / SKU Interno</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={formData.isbn}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/\D/g, '');
                                            setFormData({ ...formData, isbn: val, sbin_code: val });
                                        }}
                                        className="input-glass flex-1 font-mono"
                                        placeholder="ISBN-13 o SKU interno"
                                        maxLength={13}
                                    />
                                    <button
                                        type="button"
                                        onClick={generateSku}
                                        disabled={!formData.name || !formData.category}
                                        className="px-3 py-2 bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-primary-500/20"
                                        title={!formData.name || !formData.category ? 'Complete nombre y categoría para generar' : 'Generar código único'}
                                    >
                                        Generar
                                    </button>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">El código generado también se usará para escáner</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Precio de Costo *</label>
                                    <input
                                        type="number"
                                        value={formData.cost_price}
                                        onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                                        onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()}
                                        className="input-glass"
                                        step="0.01"
                                        min="0"
                                        placeholder="0.00"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Precio de Venta *</label>
                                    <input
                                        type="number"
                                        value={formData.sale_price}
                                        onChange={(e) => setFormData({ ...formData, sale_price: e.target.value })}
                                        onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()}
                                        className="input-glass"
                                        step="0.01"
                                        min="0"
                                        placeholder="0.00"
                                        required
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Stock</label>
                                    <input
                                        type="number"
                                        value={formData.stock}
                                        onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                                        className="input-glass"
                                        min="0"
                                        placeholder="0"
                                    />
                                </div>
                                <div>
                                    <CreatableSelect
                                        label="Categoría"
                                        value={formData.category}
                                        onChange={(val) => setFormData(prev => ({ ...prev, category: val }))}
                                        options={uniqueCategories}
                                        placeholder="Ej: Bebidas..."
                                        required
                                    />
                                </div>
                                <div>
                                    <CreatableSelect
                                        label="Género"
                                        value={formData.gender}
                                        onChange={(val) => setFormData(prev => ({ ...prev, gender: val }))}
                                        options={uniqueGenders}
                                        placeholder="Ej: Shonen, Seinen..."
                                        required={false}
                                    />
                                </div>
                            </div>
                            {/* E-commerce & Technical Details */}
                            <div className="pt-4 border-t border-white/10 mb-4">
                                <h3 className="text-sm font-semibold text-white mb-4">Detalles Técnicos / E-commerce</h3>

                                {/* Product Type Selector */}
                                <div className="flex gap-4 mb-4">
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${formData.product_type === 'Libro' ? 'border-primary-500' : 'border-slate-500 group-hover:border-slate-400'}`}>
                                            {formData.product_type === 'Libro' && <div className="w-2.5 h-2.5 rounded-full bg-primary-500" />}
                                        </div>
                                        <input
                                            type="radio"
                                            name="product_type"
                                            value="Libro"
                                            checked={formData.product_type === 'Libro'}
                                            onChange={(e) => setFormData({ ...formData, product_type: e.target.value })}
                                            className="hidden"
                                        />
                                        <span className={`text-sm ${formData.product_type === 'Libro' ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'}`}>Libro</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${formData.product_type === 'Accesorio' ? 'border-primary-500' : 'border-slate-500 group-hover:border-slate-400'}`}>
                                            {formData.product_type === 'Accesorio' && <div className="w-2.5 h-2.5 rounded-full bg-primary-500" />}
                                        </div>
                                        <input
                                            type="radio"
                                            name="product_type"
                                            value="Accesorio"
                                            checked={formData.product_type === 'Accesorio'}
                                            onChange={(e) => setFormData({ ...formData, product_type: e.target.value, page_count: '', page_color: 'Blanco y Negro' })}
                                            className="hidden"
                                        />
                                        <span className={`text-sm ${formData.product_type === 'Accesorio' ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'}`}>Accesorio</span>
                                    </label>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <CreatableSelect
                                            label="Editorial"
                                            value={formData.publisher}
                                            onChange={(val) => setFormData(prev => ({ ...prev, publisher: val }))}
                                            options={uniquePublishers}
                                            placeholder="Casa editora"
                                            required
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm text-slate-400 mb-1">Fecha Publicación</label>
                                            <input
                                                type="date"
                                                value={formData.publication_date}
                                                onChange={(e) => setFormData({ ...formData, publication_date: e.target.value })}
                                                className="input-glass"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-slate-400 mb-1">Idioma</label>
                                            <input
                                                type="text"
                                                value={formData.language}
                                                onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                                                className="input-glass"
                                                placeholder="Español, Inglés..."
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-4">
                                        <div>
                                            <label className={`block text-sm mb-1 ${formData.product_type === 'Accesorio' ? 'text-slate-600' : 'text-slate-400'}`}>Páginas</label>
                                            <input
                                                type="number"
                                                value={formData.page_count}
                                                onChange={(e) => setFormData({ ...formData, page_count: e.target.value.replace(/^0+/, '').replace(/\D/g, '') })}
                                                className={`input-glass ${formData.product_type === 'Accesorio' ? 'opacity-50 cursor-not-allowed bg-slate-800/50' : ''}`}
                                                placeholder="Num"
                                                min="1"
                                                disabled={formData.product_type === 'Accesorio'}
                                                required={formData.product_type === 'Libro'}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-slate-400 mb-1">Peso (g)</label>
                                            <input
                                                type="number"
                                                value={formData.weight}
                                                onChange={(e) => setFormData({ ...formData, weight: e.target.value.replace(/^0+/, '') })}
                                                className="input-glass"
                                                placeholder="Gramos"
                                                min="1"
                                                step="0.1"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className={`block text-sm mb-1 ${formData.product_type === 'Accesorio' ? 'text-slate-600' : 'text-slate-400'}`}>Color Páginas</label>
                                            <select
                                                value={formData.page_color}
                                                onChange={(e) => setFormData({ ...formData, page_color: e.target.value })}
                                                className={`input-glass ${formData.product_type === 'Accesorio' ? 'opacity-50 cursor-not-allowed bg-slate-800/50' : ''}`}
                                                required={formData.product_type === 'Libro'}
                                                disabled={formData.product_type === 'Accesorio'}
                                            >
                                                <option value="Blanco y Negro">B/N</option>
                                                <option value="Color">Color</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm text-slate-400 mb-1">Dimensiones (cm)</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            <input
                                                type="number"
                                                value={formData.dimensions.length}
                                                onChange={(e) => setFormData({ ...formData, dimensions: { ...formData.dimensions, length: e.target.value.replace(/^0+/, '') } })}
                                                className="input-glass"
                                                placeholder="Largo"
                                                min="0.1"
                                                step="0.1"
                                                required
                                            />
                                            <input
                                                type="number"
                                                value={formData.dimensions.width}
                                                onChange={(e) => setFormData({ ...formData, dimensions: { ...formData.dimensions, width: e.target.value.replace(/^0+/, '') } })}
                                                className="input-glass"
                                                placeholder="Ancho"
                                                min="0.1"
                                                step="0.1"
                                                required
                                            />
                                            <input
                                                type="number"
                                                value={formData.dimensions.height}
                                                onChange={(e) => setFormData({ ...formData, dimensions: { ...formData.dimensions, height: e.target.value.replace(/^0+/, '') } })}
                                                className="input-glass"
                                                placeholder="Alto"
                                                min="0.1"
                                                step="0.1"
                                                required
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {/* Extras Section */}
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Extras</label>
                                <button
                                    type="button"
                                    onClick={openExtrasModal}
                                    className="input-glass w-full text-left flex items-center justify-between hover:border-primary-500/50 transition-colors"
                                >
                                    <span className={formData.extras.length > 0 ? 'text-white' : 'text-slate-400'}>
                                        {formData.extras.length > 0
                                            ? `${formData.extras.length} extra${formData.extras.length > 1 ? 's' : ''} seleccionado${formData.extras.length > 1 ? 's' : ''}`
                                            : 'Seleccionar extras...'}
                                    </span>
                                    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                </button>
                                {formData.extras.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {formData.extras.map((extra, i) => (
                                            <span
                                                key={i}
                                                className="inline-flex items-center gap-1 px-2 py-1 bg-primary-500/20 text-primary-300 rounded-full text-sm"
                                            >
                                                {extra}
                                                <button
                                                    type="button"
                                                    onClick={() => removeExtraFromForm(extra)}
                                                    className="hover:text-white transition-colors"
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {/* Supplier Section */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Proveedor (Opcional)</label>
                                    <select
                                        value={formData.supplier_id}
                                        onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
                                        className="input-glass"
                                    >
                                        <option value="">Sin proveedor</option>
                                        {suppliers.map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>
                                {formData.supplier_id && (
                                    <div className="animate-fade-in">
                                        <label className="block text-sm text-slate-400 mb-1">Precio de Proveedor</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-2.5 text-slate-500">$</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={formData.supplier_price}
                                                onChange={(e) => setFormData({ ...formData, supplier_price: e.target.value })}
                                                className="input-glass pl-7"
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={closeForm}
                                    className="flex-1 btn-secondary"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    disabled={sbinStatus.isDuplicate || sbinStatus.checking || isSubmitting}
                                >
                                    {isSubmitting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                    {editingProduct ? 'Guardar Cambios' : 'Crear Producto'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Products Table */}
            <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-white/5">
                            <tr>
                                <th className="table-header w-16">Img</th>
                                <th
                                    className="table-header cursor-pointer hover:bg-white/10 transition-colors group"
                                    onClick={() => requestSort('name')}
                                >
                                    <div className="flex items-center gap-1">
                                        Producto
                                        {sortConfig.key === 'name' && (
                                            <span className="text-primary-400">
                                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th className="table-header">
                                    <div className="flex items-center gap-1">
                                        Código ISBN
                                    </div>
                                </th>
                                <th
                                    className="table-header cursor-pointer hover:bg-white/10 transition-colors group"
                                    onClick={() => requestSort('category')}
                                >
                                    <div className="flex items-center gap-1">
                                        Categoría
                                        {sortConfig.key === 'category' && (
                                            <span className="text-primary-400">
                                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th
                                    className="table-header cursor-pointer hover:bg-white/10 transition-colors group"
                                    onClick={() => requestSort('publisher')}
                                >
                                    <div className="flex items-center gap-1">
                                        Editorial
                                        {sortConfig.key === 'publisher' && (
                                            <span className="text-primary-400">
                                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th
                                    className="table-header text-right cursor-pointer hover:bg-white/10 transition-colors group"
                                    onClick={() => requestSort('price')}
                                >
                                    <div className="flex items-center justify-end gap-1">
                                        Precio
                                        {sortConfig.key === 'price' && (
                                            <span className="text-primary-400">
                                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th
                                    className="table-header text-right cursor-pointer hover:bg-white/10 transition-colors group"
                                    onClick={() => requestSort('stock')}
                                >
                                    <div className="flex items-center justify-end gap-1">
                                        Stock
                                        {sortConfig.key === 'stock' && (
                                            <span className="text-primary-400">
                                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th className="table-header text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {sortedProducts.map(product => (
                                <tr key={product.id} className="hover:bg-white/5 transition-colors">
                                    <td className="table-cell">
                                        <div
                                            className="w-10 h-10 rounded-lg bg-white/5 overflow-hidden border border-white/10 cursor-pointer hover:border-primary-500 transition-colors"
                                            onClick={() => product.image_url && setZoomImage(product.image_url)}
                                        >
                                            {product.image_url ? (
                                                <img
                                                    src={product.image_url}
                                                    alt={product.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-slate-600">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="table-cell font-medium">{product.name}</td>
                                    <td className="table-cell">
                                        {(product.barcode || product.sbin_code || product.isbn) ? (
                                            <span className="font-mono text-sm bg-slate-700/50 px-2 py-1 rounded">
                                                {product.barcode || product.sbin_code || product.isbn}
                                            </span>
                                        ) : (
                                            <span className="text-slate-500 text-sm">-</span>
                                        )}
                                    </td>
                                    <td className="table-cell">
                                        {product.category && (
                                            <span className="px-2 py-1 bg-primary-500/20 text-primary-400 rounded-lg text-xs">
                                                {product.category}
                                            </span>
                                        )}
                                    </td>
                                    <td className="table-cell">
                                        {product.publisher ? (
                                            <span className="text-slate-300 text-sm">
                                                {product.publisher}
                                            </span>
                                        ) : (
                                            <span className="text-slate-500 text-sm italic">-</span>
                                        )}
                                    </td>
                                    <td className="table-cell text-right">
                                        <div>
                                            <p className="font-semibold text-emerald-400">
                                                ${Number(product.sale_price || product.price || 0).toFixed(2)}
                                            </p>
                                            {product.cost_price && product.sale_price && (
                                                <p className="text-xs text-slate-400">
                                                    Margen: {(((product.sale_price - product.cost_price) / product.sale_price) * 100).toFixed(1)}%
                                                </p>
                                            )}
                                        </div>
                                    </td>
                                    <td className="table-cell text-right">
                                        <span className={`${product.stock > 10
                                            ? 'text-slate-300'
                                            : product.stock > 0
                                                ? 'text-amber-400'
                                                : 'text-red-400'
                                            }`}>
                                            {product.stock}
                                        </span>
                                    </td>
                                    <td className="table-cell text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => handleEdit(product)}
                                                className="p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white"
                                                title="Editar producto"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => generateProductLabel(product, token)}
                                                disabled={!product.isbn && !product.sbin_code && !product.barcode}
                                                className={`p-2 rounded-lg transition-colors ${(product.isbn || product.sbin_code || product.barcode)
                                                    ? 'hover:bg-white/10 text-slate-400 hover:text-white'
                                                    : 'text-slate-700 cursor-not-allowed'
                                                    }`}
                                                title={(product.isbn || product.sbin_code || product.barcode) ? "Imprimir etiqueta" : "Sin código para imprimir"}
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10v2H7V7zm0 4h10v2H7v-2zM7 15h10v2H7v-2zM20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4v4h8v-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H4V4h16v12z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => setDeleteConfirm(product)}
                                                className="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-slate-400 hover:text-red-400"
                                                title="Eliminar producto"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Delete Confirmation Modal - Moved outside glass-cards */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[90] p-4 animate-fade-in">
                    <div className="glass-card p-6 w-full max-w-md animate-slide-up bg-slate-900 border border-red-500/20 shadow-2xl">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="p-3 bg-red-500/20 rounded-full">
                                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">¿Eliminar producto?</h3>
                                <p className="text-slate-400 text-sm">
                                    Esta acción no se puede deshacer.
                                </p>
                            </div>
                        </div>
                        <div className="bg-white/5 rounded-xl p-4 mb-6 border border-white/5">
                            <p className="font-medium text-white">{deleteConfirm.name}</p>
                            {deleteConfirm.sbin_code && (
                                <p className="text-sm text-slate-400 font-mono">{deleteConfirm.sbin_code}</p>
                            )}
                            <p className="text-sm text-emerald-400 font-bold mt-1">${Number(deleteConfirm.sale_price || deleteConfirm.price || 0).toFixed(2)}</p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 btn-secondary"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDelete}
                                className="flex-1 btn-danger"
                            >
                                Eliminar Producto
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Force Delete Confirmation Modal - RED ALERT */}
            {forceDeleteConfirm && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-fade-in">
                    <div className="glass-card p-8 w-full max-w-lg animate-slide-up bg-red-900/40 border-2 border-red-500 shadow-[0_0_50px_rgba(239,68,68,0.5)]">
                        <div className="flex items-center gap-6 mb-6">
                            <div className="p-4 bg-red-600 rounded-full animate-pulse">
                                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-white uppercase tracking-wider">¡Advertencia Crítica!</h3>
                                <p className="text-red-200 mt-1 font-medium">
                                    Este producto tiene historial de ventas.
                                </p>
                            </div>
                        </div>

                        <div className="bg-black/40 rounded-xl p-6 mb-8 border border-red-500/30">
                            <p className="text-white text-lg mb-4">
                                Estás a punto de eliminar: <span className="font-bold text-red-400">{forceDeleteConfirm.name}</span>
                            </p>
                            <p className="text-gray-300 text-sm leading-relaxed">
                                Esta acción eliminará el producto <strong>Y TODAS LAS VENTAS PASADAS</strong> asociadas a él.
                                <br /><br />
                                <span className="text-red-300 italic">Los reportes financieros históricos cambiarán irreversiblemente.</span>
                            </p>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setForceDeleteConfirm(null)}
                                className="flex-1 py-4 bg-slate-700 text-white rounded-xl hover:bg-slate-600 font-bold transition-all"
                            >
                                Cancelar (Seguro)
                            </button>
                            <button
                                onClick={handleForceDelete}
                                className="flex-1 py-4 bg-red-600 text-white rounded-xl hover:bg-red-700 font-bold shadow-lg shadow-red-900/50 hover:shadow-red-500/30 transition-all border border-red-400"
                            >
                                SÍ, ELIMINAR TODO
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Image Zoom Modal */}
            {zoomImage && (
                <div
                    className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[80] p-4 animate-fade-in"
                    onClick={() => setZoomImage(null)}
                >
                    <div className="relative max-w-4xl max-h-[90vh] w-full flex items-center justify-center">
                        <img
                            src={zoomImage}
                            alt="Zoom"
                            className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl"
                        />
                        <button
                            className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-white/20 transition-colors"
                            onClick={() => setZoomImage(null)}
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
