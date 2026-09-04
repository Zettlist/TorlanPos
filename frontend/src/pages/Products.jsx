import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { generateProductLabel } from '../utils/labelGenerator';
import RotacionSemanal from './RotacionSemanal';

const PRESET_TAGS = [
    'Manga', 'Revistas', 'BL', 'Shonen', 'Seinen', 'Fantasía', 'GL', 'Manhwa',
    'Romance', 'Novela Ligera', 'Ciencia Ficción', 'Costumbrismo', 'Psicológico',
    'Comedia', 'Shojo', 'Terror', 'Preventa'
];

const ADULT_PRESET_TAGS = [
    'Furry', 'NTR', 'Milf', 'Shotacon', 'Futanari', 'Bara', 'Yaoi',
    'Vanilla', 'Tentaculos', 'Yuri', 'Parodias', 'Original', 'Maid',
    'Escolar', 'Mind Control', 'Pokemon', 'Fetish', 'Videojuegos'
];

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
            <label className="block text-sm text-muted mb-1">{label}</label>
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
                <div className="absolute z-50 w-full mt-1 bg-surface border border-line rounded-lg shadow-xl max-h-48 overflow-y-auto">
                    {filteredOptions.map((option, index) => (
                        <button
                            key={option}
                            type="button"
                            onClick={() => {
                                onChange(option);
                                setIsOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${index === highlightedIndex
                                ? 'bg-accent/20 text-accent'
                                : 'text-ink hover:bg-raised'
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

// Simple Modal Component
const Modal = ({ type, title, isOpen, onClose, children }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 animate-fade-in">
            <div className="bg-surface rounded-control shadow-2xl border border-line w-full max-w-2xl overflow-hidden animate-scale-in">
                <div className="flex justify-between items-center p-4 border-b border-line bg-surface">
                    <h3 className="text-xl font-bold text-ink">{title}</h3>
                    <button onClick={onClose} className="text-muted hover:text-ink transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="p-6 max-h-[70vh] overflow-y-auto">
                    {children}
                </div>
                <div className="p-4 border-t border-line bg-surface flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 bg-raised hover:bg-raised text-ink rounded-lg transition-colors">
                        Cerrar
                    </button>
                    {type === 'print' && (
                        <button className="ml-2 px-4 py-2 bg-accent hover:bg-accent text-white rounded-lg transition-colors flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                            Imprimir Etiqueta
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default function Products() {
    const { token } = useAuth();
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    // Llenar el alta de un producto toma varios minutos (ISBN, sinopsis, formato,
    // extras). Cerrar por accidente y perderlo todo era el reclamo mas repetido,
    // asi que cualquier salida con datos capturados pasa por confirmacion.
    const [confirmarSalida, setConfirmarSalida] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [forceDeleteConfirm, setForceDeleteConfirm] = useState(null);
    const [successData, setSuccessData] = useState(null);
    const [suppliers, setSuppliers] = useState([]);
    const [isbnStatus, setIsbnStatus] = useState({ checking: false, isDuplicate: false, existingProduct: null });
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    const [showRotacion, setShowRotacion] = useState(false);

    // Formatos de envio: medidas por edicion, se miden una vez y se eligen.
    const [formats, setFormats] = useState([]);
    const [showFormatForm, setShowFormatForm] = useState(false);
    const [newFormat, setNewFormat] = useState({ name: '', length_cm: '', width_cm: '', height_cm: '', weight_g: '' });

    // Continuar serie: buscar la serie y heredar lo que no cambia entre tomos.
    const [serieQuery, setSerieQuery] = useState('');
    const [serieResults, setSerieResults] = useState([]);
    const [serieAplicada, setSerieAplicada] = useState(null);

    // Sinopsis copiada de catalogos publicos. No la redacta ningun modelo.
    const [sinopsisEstado, setSinopsisEstado] = useState({ buscando: false, opciones: null, mensaje: null });

    const FORM_VACIO = {
        name: '',
        series: '',
        volume: '',
        cost_price: '',
        sale_price: '',
        stock: '',
        category: '',
        isbn: '',
        publication_date: '',
        publisher: '',
        page_count: '',
        format_id: '',
        dimensions: { length: '', width: '', height: '' },
        weight: '',
        page_color: 'Blanco y Negro',
        language: 'Español',
        supplier_id: '',
        supplier_price: '',
        extras: [],
        barcode: '',
        tags: [],
        is_adult: false,
        artist: '',
        group_name: '',
        sinopsis: '',
        sinopsis_fuente: '',
        events: {
            novedad: { active: false, type: 'until_stock', end_date: '' },
            liquidacion: { active: false, type: 'until_stock', end_date: '' }
        }
    };
    const [formData, setFormData] = useState(FORM_VACIO);

    const DEFAULT_EVENTS = { novedad: { active: false, type: 'until_stock', end_date: '' }, liquidacion: { active: false, type: 'until_stock', end_date: '' } };
    const updateEvent = (key, updates) => setFormData(prev => {
        const evs = prev.events || DEFAULT_EVENTS;
        return { ...prev, events: { ...evs, [key]: { ...(evs[key] || DEFAULT_EVENTS[key]), ...updates } } };
    });

    // Adult tab state
    const [activeTab, setActiveTab] = useState('general'); // 'general' | 'adult'

    // Extras modal state
    const [showExtrasModal, setShowExtrasModal] = useState(false);
    const [selectedExtras, setSelectedExtras] = useState([]);
    const [customExtra, setCustomExtra] = useState('');

    // Image state
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [zoomImage, setZoomImage] = useState(null);
    const [previewProduct, setPreviewProduct] = useState(null);

    // Tags state
    const [tagSuggestions, setTagSuggestions] = useState([]);
    const [tagInput, setTagInput] = useState('');
    const [showTagDropdown, setShowTagDropdown] = useState(false);

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Suggestions state
    const [suggestions, setSuggestions] = useState({
        categories: [], publishers: [], categorias: { regular: [], adultos: [] }
    });

    // Categorias de la rama activa. La base rechaza un producto cuya rama no
    // coincida con la de su categoria, asi que el formulario solo puede ofrecer
    // las de la rama elegida — el error se evita en vez de traducirse.
    const categoriasDeRama = useMemo(() => {
        const c = suggestions.categorias || { regular: [], adultos: [] };
        const lista = formData.is_adult ? c.adultos : c.regular;
        // Semilla para una empresa nueva: sin catalogo la rejilla sale vacia y
        // no hay forma de clasificar el primer producto.
        const base = formData.is_adult
            ? ['Doujinshi', 'Manga Hentai', 'Revista Hentai', 'Figura Hentai', 'Accesorio Adulto']
            : ['Manga', 'Shonen', 'Seinen', 'Shojo', 'Revista', 'Figuras', 'Accesorio',
                'Boxset', 'Calendario', 'Fanbook', 'Libro de Arte'];
        return Array.from(new Set([...(lista || []).map(x => x.name), ...base]));
    }, [suggestions.categorias, formData.is_adult]);

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
        fetchFormats();
    }, []);

    const fetchFormats = async () => {
        try {
            const r = await fetch(`${API_URL}/product-formats`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (r.ok) setFormats(await r.json());
        } catch (error) {
            console.error('Error fetching formats:', error);
        }
    };

    const crearFormato = async () => {
        try {
            const r = await fetch(`${API_URL}/product-formats`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(newFormat)
            });
            const d = await r.json();
            if (!r.ok) { alert(d.error || 'No se pudo crear el formato'); return; }
            setFormats(prev => [...prev, { ...d, productos: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
            setFormData(prev => ({ ...prev, format_id: String(d.id) }));
            setNewFormat({ name: '', length_cm: '', width_cm: '', height_cm: '', weight_g: '' });
            setShowFormatForm(false);
        } catch (e) {
            alert('No se pudo crear el formato: ' + e.message);
        }
    };

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

    const uniquePublishers = useMemo(() => {
        if (suggestions.publishers.length > 0) return suggestions.publishers;
        if (!products) return [];
        const pubs = new Set(products.map(p => p.publisher).filter(Boolean));
        return Array.from(pubs).sort();
    }, [products, suggestions.publishers]);

    // Aviso de ISBN repetido mientras se teclea. La unicidad la impone la base;
    // esto solo adelanta el error al momento de escanear y dice cual es el
    // producto que ya lo tiene — casi siempre el mismo tomo reingresado.
    useEffect(() => {
        if (!formData.isbn || formData.isbn.trim() === '') {
            setIsbnStatus({ checking: false, isDuplicate: false, existingProduct: null });
            return;
        }
        const timer = setTimeout(() => checkIsbnDuplicate(formData.isbn), 300);
        return () => clearTimeout(timer);
    }, [formData.isbn, editingProduct]);

    // Al cambiar de rama, la categoria elegida deja de ser valida: pertenece a
    // la otra. Se limpia en vez de dejarla puesta y que la base rechace el alta
    // al final del formulario.
    useEffect(() => {
        setFormData(prev => (prev.category ? { ...prev, category: '' } : prev));
    }, [formData.is_adult]);

    const checkIsbnDuplicate = async (isbn) => {
        setIsbnStatus(prev => ({ ...prev, checking: true }));
        try {
            const excludeId = editingProduct?.id || '';
            const response = await fetch(`${API_URL}/products/check-isbn?isbn=${encodeURIComponent(isbn)}&exclude_id=${excludeId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setIsbnStatus({
                    checking: false,
                    isDuplicate: data.isDuplicate,
                    existingProduct: data.existingProduct
                });
            }
        } catch (error) {
            console.error('Error checking ISBN:', error);
            setIsbnStatus({ checking: false, isDuplicate: false, existingProduct: null });
        }
    };

    // ── Continuar serie ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!showForm || serieQuery.trim().length < 2) { setSerieResults([]); return; }
        const timer = setTimeout(async () => {
            try {
                const r = await fetch(`${API_URL}/products/series?q=${encodeURIComponent(serieQuery)}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (r.ok) setSerieResults(await r.json());
            } catch { setSerieResults([]); }
        }, 300);
        return () => clearTimeout(timer);
    }, [serieQuery, showForm, token]);

    const continuarSerie = async (serie) => {
        try {
            const r = await fetch(`${API_URL}/products/series/plantilla?serie=${encodeURIComponent(serie)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!r.ok) return;
            const { plantilla, tomoBase } = await r.json();

            // Los NULL de la base tienen que llegar al formulario como cadena
            // vacia. Un null en un <input> lo vuelve no controlado, y al enviar
            // el FormData lo serializa como el texto "null".
            const vacio = Object.fromEntries(
                Object.entries(plantilla).map(([k, v]) => [k, v ?? '']));

            // Se hereda todo menos lo que es propio del tomo: existencias, ISBN,
            // portada y sinopsis. Esos quedan vacios a proposito.
            setFormData(prev => ({
                ...prev,
                ...vacio,
                is_adult: !!plantilla.is_adult,
                publisher: plantilla.publisher || '',
                stock: '',
                isbn: '',
                sinopsis: '',
                sinopsis_fuente: '',
            }));
            setSerieAplicada({ serie, desde: tomoBase });
            setSerieResults([]);
            setSerieQuery('');
        } catch (e) {
            console.error('Continuar serie:', e);
        }
    };

    // ── Sinopsis ────────────────────────────────────────────────────────────
    const buscarSinopsis = async () => {
        const p = new URLSearchParams();
        if (formData.isbn) p.set('isbn', formData.isbn);
        if (formData.name) p.set('titulo', formData.name);
        if (formData.series) p.set('serie', formData.series);
        if (![...p.keys()].length) return;

        setSinopsisEstado({ buscando: true, opciones: null, mensaje: null });
        try {
            const r = await fetch(`${API_URL}/products/sinopsis?${p}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const d = await r.json();
            setSinopsisEstado({ buscando: false, opciones: d.resultados || [], mensaje: d.mensaje });
        } catch (e) {
            setSinopsisEstado({ buscando: false, opciones: [], mensaje: 'No se pudo consultar. Revisa la conexión.' });
        }
    };

    // El texto entra al campo editable; no se guarda solo. `sinopsis_fuente`
    // conserva la URL para poder atribuirlo.
    const usarSinopsis = (op) => {
        setFormData(prev => ({ ...prev, sinopsis: op.texto, sinopsis_fuente: op.url || '' }));
        setSinopsisEstado({ buscando: false, opciones: null, mensaje: null });
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
            const [sugResponse, tagsResponse] = await Promise.all([
                fetch(`${API_URL}/products/suggestions`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                fetch(`${API_URL}/products/tags`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
            ]);
            if (sugResponse.ok) {
                const data = await sugResponse.json();
                setSuggestions(data);
            }
            if (tagsResponse.ok) {
                const tagsData = await tagsResponse.json();
                setTagSuggestions(tagsData);
            }
        } catch (error) {
            console.error('Error fetching suggestions:', error);
        }
    };

    // El boton «Generar» que rellenaba el ISBN con 13 digitos al azar ya no
    // esta. Inventaba un ISBN falso y lo guardaba en el campo del identificador
    // del editor, que es exactamente donde no debe haber un numero inventado.
    // El codigo para escanear es el de barras, y lo asigna el servidor solo.

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (isbnStatus.isDuplicate) {
            return; // Block submission
        }

        // Validate Image on Create
        if (!editingProduct && !imageFile) {
            alert('La imagen del producto es obligatoria.');
            return;
        }

        // El aviso de "cambiar categoria rompe el codigo" ya no aplica: el
        // codigo de barras no se deriva de la categoria desde el generador
        // nuevo, asi que cambiarla no lo invalida.

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
            formDataToSend.append('series', formData.series || '');
            formDataToSend.append('volume', formData.volume || '');
            formDataToSend.append('isbn', formData.isbn);
            formDataToSend.append('barcode', formData.barcode);
            formDataToSend.append('publication_date', formData.publication_date);
            // CreatableSelect trabaja con cadenas, no con {label, value}. La
            // linea anterior hacia `formData.publisher.value` sobre una cadena:
            // eso da undefined, y FormData lo convierte en el texto "undefined".
            // Cada producto dado de alta por este formulario guardaba
            // publisher = "undefined", que es lo que se mostraba en la tienda.
            formDataToSend.append('publisher', formData.publisher || '');

            // Si es un producto adulto, enviar campos extra. Si no, forzar string vacio.
            if (formData.is_adult) {
                formDataToSend.append('artist', formData.artist || '');
                formDataToSend.append('group_name', formData.group_name || '');
            } else {
                formDataToSend.append('artist', '');
                formDataToSend.append('group_name', '');
            }
            formDataToSend.append('page_count', formData.page_count);
            formDataToSend.append('weight', formData.format_id ? '' : formData.weight);
            formDataToSend.append('page_color', formData.page_color);
            formDataToSend.append('language', formData.language);
            formDataToSend.append('supplier_id', formData.supplier_id || '');
            formDataToSend.append('supplier_price', formData.supplier_price || '');

            formDataToSend.append('format_id', formData.format_id || '');
            // Las medidas sueltas solo viajan si el producto no tiene formato:
            // con formato son las de la edicion y mandarlas duplicaria el dato.
            const conFormato = !!formData.format_id;
            formDataToSend.append('dimensions', conFormato ? '' : JSON.stringify(formData.dimensions));
            formDataToSend.append('extras', JSON.stringify(formData.extras || []));
            formDataToSend.append('tags', JSON.stringify(formData.tags || []));
            formDataToSend.append('is_adult', formData.is_adult ? '1' : '0');
            formDataToSend.append('events', JSON.stringify(formData.events || {}));
            formDataToSend.append('sinopsis', formData.sinopsis || '');
            formDataToSend.append('sinopsis_fuente', formData.sinopsis_fuente || '');

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
                if (!editingProduct && !formData.barcode && data.barcode) {
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

    // Escape cierra el formulario, pero pasando por la misma confirmacion. Si el
    // dialogo ya esta abierto, Escape lo cancela en vez de encadenar cierres.
    useEffect(() => {
        if (!showForm) return;
        const alPresionar = (e) => {
            if (e.key !== 'Escape') return;
            if (confirmarSalida) { setConfirmarSalida(false); return; }
            intentarCerrarForm();
        };
        window.addEventListener('keydown', alPresionar);
        return () => window.removeEventListener('keydown', alPresionar);
    });

    // Compara el formulario contra el vacio para saber si hay captura que perder.
    // En edicion siempre se considera que hay datos: el producto ya trae valores y
    // no tenemos el original a mano para diferenciar campo por campo.
    const hayCambiosSinGuardar = () => {
        if (editingProduct) return true;
        if (imageFile || selectedExtras.length > 0 || serieAplicada) return true;
        return Object.entries(FORM_VACIO).some(([campo, vacio]) => {
            const actual = formData[campo];
            if (campo === 'dimensions') {
                return Object.values(actual || {}).some(v => v !== '' && v != null);
            }
            if (Array.isArray(vacio)) return (actual || []).length > 0;
            return actual !== vacio;
        });
    };

    // Unico camino de salida del formulario: pregunta si hay algo escrito.
    const intentarCerrarForm = () => {
        if (hayCambiosSinGuardar()) {
            setConfirmarSalida(true);
            return;
        }
        closeForm();
    };

    const closeForm = () => {
        setConfirmarSalida(false);
        setShowForm(false);
        setEditingProduct(null);
        setFormData(FORM_VACIO);
        setIsbnStatus({ checking: false, isDuplicate: false, existingProduct: null });
        setSelectedExtras([]);
        setShowExtrasModal(false);
        setImageFile(null);
        setImagePreview(null);
        setSerieQuery('');
        setSerieResults([]);
        setSerieAplicada(null);
        setSinopsisEstado({ buscando: false, opciones: null, mensaje: null });
        setShowFormatForm(false);
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
        // Filter by tab (General vs Adult)
        let sortableItems = products.filter(p => activeTab === 'adult' ? p.is_adult : !p.is_adult);

        // 1. Filter first
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            sortableItems = sortableItems.filter(product =>
                product.name.toLowerCase().includes(query) ||
                (product.series && product.series.toLowerCase().includes(query)) ||
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
                        aValue = a.isbn || a.barcode || '';
                        bValue = b.isbn || b.barcode || '';
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
    }, [products, sortConfig, searchQuery, activeTab]);

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
            series: product.series || '',
            volume: product.volume ?? '',
            cost_price: product.cost_price || '',
            sale_price: product.sale_price || '',
            stock: product.stock.toString(),
            category: product.category || '',
            isbn: product.isbn || '',
            publication_date: product.publication_date || '',
            publisher: product.publisher || '',
            page_count: product.page_count || '',
            format_id: product.format_id ? String(product.format_id) : '',
            dimensions: parsedDimensions,
            weight: product.weight || '',
            page_color: product.page_color || 'Blanco y Negro',
            language: product.language || '',
            supplier_id: product.supplier_id || '',
            supplier_price: product.supplier_price || '',
            extras: parsedExtras,
            barcode: product.barcode || '',
            tags: product.tags || [],
            is_adult: Boolean(product.is_adult),
            artist: product.artist || '',
            group_name: product.group_name || '',
            sinopsis: product.sinopsis || '',
            sinopsis_fuente: product.sinopsis_fuente || '',
            events: (() => {
                try { return product.events ? (typeof product.events === 'string' ? JSON.parse(product.events) : product.events) : { novedad: { active: false, type: 'until_stock', end_date: '' }, liquidacion: { active: false, type: 'until_stock', end_date: '' } }; } catch { return { novedad: { active: false, type: 'until_stock', end_date: '' }, liquidacion: { active: false, type: 'until_stock', end_date: '' } }; }
            })()
        });
        setSelectedExtras(parsedExtras);
        setIsbnStatus({ checking: false, isDuplicate: false, existingProduct: null });
        setSerieAplicada(null);
        setSinopsisEstado({ buscando: false, opciones: null, mensaje: null });
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
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Productos</h1>
                    <p className="text-muted">{products.length} productos en catálogo</p>
                </div>
                <div className="flex items-center gap-3">
                <button
                    onClick={() => setShowRotacion(true)}
                    className="btn-secondary flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Rotación Semanal
                </button>
                <button
                    onClick={() => {
                        setShowForm(true);
                        setEditingProduct(null);
                        // La rama arranca en la pestana en la que se esta: si se
                        // estaba viendo el catalogo de adultos, el alta tambien.
                        setFormData({ ...FORM_VACIO, is_adult: activeTab === 'adult' });
                        setSelectedExtras([]);
                        setImageFile(null);
                        setImagePreview(null);
                        setSerieQuery('');
                        setSerieResults([]);
                        setSerieAplicada(null);
                        setSinopsisEstado({ buscando: false, opciones: null, mensaje: null });
                    }}
                    className="btn-primary flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Nuevo Producto
                </button>
                </div>
            </div>

            {/* Rotación Semanal overlay — portal to body to escape stacking context */}
            {showRotacion && createPortal(
                <RotacionSemanal onClose={() => setShowRotacion(false)} />,
                document.body
            )}

            {/* Tabs for General / Adult */}
            {!showForm && (
                <div className="flex border-b border-line mb-6">
                    <button
                        onClick={() => setActiveTab('general')}
                        className={`px-4 py-3 text-sm font-medium transition-colors relative ${activeTab === 'general' ? 'text-accent' : 'text-muted hover:text-ink'}`}
                    >
                        Catálogo General
                        {activeTab === 'general' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-accent" />}
                    </button>
                    <button
                        onClick={() => setActiveTab('adult')}
                        className={`px-4 py-3 text-sm font-medium transition-colors relative flex items-center gap-2 ${activeTab === 'adult' ? 'text-rose-700' : 'text-muted hover:text-ink'}`}
                    >
                        Contenido Adulto
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-bad-soft text-bad">18+</span>
                        {activeTab === 'adult' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-rose-500" />}
                    </button>
                </div>
            )}

            {/* Search Bar - No changes */}
            <div className="relative">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-ink transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Success Barcode Modal */}
            {successData && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
                    <div className="glass-card p-6 w-full max-w-md animate-slide-up bg-surface border border-emerald-500/30">
                        <div className="flex flex-col items-center text-center mb-6">
                            <div className="p-4 bg-ok-soft rounded-full mb-4">
                                <svg className="w-10 h-10 text-ok" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-bold text-ink mb-2">{successData.title}</h3>
                            <p className="text-muted text-sm">
                                {successData.message}
                            </p>
                        </div>

                        <div className="bg-black/40 rounded-control p-6 mb-6 border border-line">
                            <p className="text-xs text-muted uppercase tracking-wider mb-2">Código Generado (EAN-13)</p>
                            <div className="flex items-center justify-center gap-3">
                                <span className="text-2xl font-mono text-ok tracking-widest font-bold">
                                    {successData.barcode}
                                </span>
                                <button
                                    onClick={() => navigator.clipboard.writeText(successData.barcode)}
                                    className="p-2 hover:bg-raised rounded-lg text-muted hover:text-ink transition-colors"
                                    title="Copiar al portapapeles"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                    </svg>
                                </button>
                            </div>
                            <p className="text-center text-sm text-muted mt-2">{successData.name}</p>
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
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
                    <div className="glass-card p-6 w-full max-w-md animate-slide-up">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold">Seleccionar Extras</h2>
                            <button
                                onClick={() => setShowExtrasModal(false)}
                                className="p-2 hover:bg-raised rounded-lg transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Predefined extras list */}
                        {AVAILABLE_EXTRAS.length > 0 && (
                            <div className="mb-4">
                                <label className="block text-sm text-muted mb-2">Extras disponibles</label>
                                <div className="max-h-48 overflow-y-auto space-y-2 bg-raised rounded-control p-3">
                                    {AVAILABLE_EXTRAS.map((extra) => (
                                        <button
                                            key={extra}
                                            type="button"
                                            onClick={() => toggleExtra(extra)}
                                            className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${selectedExtras.includes(extra)
                                                ? 'bg-accent/30 text-accent border border-accent/25'
                                                : 'hover:bg-raised border border-transparent'
                                                }`}
                                        >
                                            <span>{extra}</span>
                                            {selectedExtras.includes(extra) && (
                                                <svg className="w-5 h-5 text-accent" fill="currentColor" viewBox="0 0 20 20">
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
                            <label className="block text-sm text-muted mb-2">Agregar extra personalizado</label>
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
                            <div className="mb-4 p-3 bg-raised rounded-control">
                                <p className="text-sm text-muted mb-2">Seleccionados ({selectedExtras.length})</p>
                                <div className="flex flex-wrap gap-2">
                                    {selectedExtras.map((extra, i) => (
                                        <span
                                            key={i}
                                            className="inline-flex items-center gap-1 px-2 py-1 bg-accent/20 text-accent rounded-full text-sm"
                                        >
                                            {extra}
                                            <button
                                                type="button"
                                                onClick={() => toggleExtra(extra)}
                                                className="hover:text-ink"
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
                <div
                    className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
                    onClick={(e) => { if (e.target === e.currentTarget) intentarCerrarForm(); }}
                >
                    <div
                        className="bg-surface border border-line rounded-panel shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up custom-scrollbar"
                        onClick={(e) => e.stopPropagation()}
                    >

                        {/* Header */}
                        <div className="sticky top-0 z-10 bg-surface border-b border-line px-6 py-4 flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-ink">
                                {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
                            </h2>
                            <button type="button" onClick={intentarCerrarForm} className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-raised transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-6">

                            {/* ── Imagen ── */}
                            <div className="flex justify-center">
                                <div className="relative">
                                    <div className={`w-28 h-28 rounded-panel border-2 border-dashed flex items-center justify-center overflow-hidden transition-all ${imagePreview ? 'border-accent bg-black/40' : 'border-line hover:border-accent/25 bg-raised'}`}>
                                        {imagePreview
                                            ? <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                            : <div className="text-center p-3">
                                                <svg className="w-7 h-7 text-muted mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                <span className="text-xs text-muted">{editingProduct ? 'Cambiar' : 'Subir foto *'}</span>
                                            </div>
                                        }
                                        <input type="file" accept="image/*" onChange={(e) => { const file = e.target.files[0]; if (file) { if (file.size > 50 * 1024 * 1024) { alert('Máximo 50MB.'); e.target.value = null; return; } setImageFile(file); setImagePreview(URL.createObjectURL(file)); } }} className="absolute inset-0 opacity-0 cursor-pointer" required={!editingProduct && !imageFile} />
                                    </div>
                                    {imagePreview && (
                                        <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }} className="absolute -top-2 -right-2 w-6 h-6 bg-raised text-muted hover:bg-bad hover:text-white rounded-full flex items-center justify-center transition-colors shadow-panel cursor-pointer">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* ── 1 · Rama del catálogo ──
                                Primero, no al final: define qué categorías se
                                ofrecen después y dónde aparece en la tienda. */}
                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-muted uppercase tracking-wider">Tipo de contenido</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { adulto: false, etiqueta: 'Contenido Regular', pie: 'Shonen, Seinen, figuras…' },
                                        { adulto: true, etiqueta: 'Contenido de Adultos', pie: 'Doujinshi, hentai · 18+' },
                                    ].map(({ adulto, etiqueta, pie }) => {
                                        const activo = formData.is_adult === adulto;
                                        return (
                                            <button key={etiqueta} type="button"
                                                onClick={() => setFormData(prev => ({ ...prev, is_adult: adulto }))}
                                                className={`px-3 py-3 rounded-control border text-left transition-all ${activo
                                                    ? (adulto ? 'bg-rose-500/15 border-rose-500/60 text-rose-700' : 'bg-accent/15 border-accent/50 text-accent')
                                                    : 'bg-white/3 border-line text-muted hover:border-line-strong hover:text-ink'}`}>
                                                <span className="block text-sm font-semibold">{etiqueta}</span>
                                                <span className="block text-xs opacity-70 mt-0.5">{pie}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ── 2 · Continuar serie ──
                                Casi todo lo que entra es un tomo nuevo de algo
                                que ya se vende. Hereda las quince columnas que
                                no cambian entre tomos. */}
                            {!editingProduct && (
                                <div className="space-y-2">
                                    <p className="text-xs font-semibold text-muted uppercase tracking-wider">Continuar una serie</p>
                                    {serieAplicada ? (
                                        <div className="flex items-center gap-3 p-3 rounded-control bg-accent/10 border border-accent/25">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-ink truncate">{serieAplicada.serie}</p>
                                                <p className="text-xs text-muted">
                                                    Datos heredados de «{serieAplicada.desde?.name}». Faltan existencias, ISBN, portada y sinopsis.
                                                </p>
                                            </div>
                                            <button type="button" onClick={() => { setSerieAplicada(null); setFormData({ ...FORM_VACIO, is_adult: formData.is_adult }); }}
                                                className="text-xs text-muted hover:text-ink underline shrink-0">Deshacer</button>
                                        </div>
                                    ) : (
                                        <div className="relative">
                                            <input type="text" value={serieQuery} onChange={(e) => setSerieQuery(e.target.value)}
                                                className="input-glass" placeholder="Buscar serie del catálogo (ej. Berserk)…" />
                                            {serieResults.length > 0 && (
                                                <div className="absolute z-50 w-full mt-1 bg-surface border border-line rounded-lg shadow-xl max-h-56 overflow-y-auto custom-scrollbar">
                                                    {serieResults.map(s => (
                                                        <button key={s.series} type="button" onClick={() => continuarSerie(s.series)}
                                                            className="w-full text-left px-3 py-2.5 hover:bg-accent/15 transition-colors border-b border-line/50 last:border-0">
                                                            <span className="block text-sm font-medium text-ink">{s.series}</span>
                                                            <span className="block text-xs text-muted">
                                                                {s.tomos} tomo{s.tomos > 1 ? 's' : ''} · último #{s.ultimo_volumen ?? '—'}
                                                                {s.publisher ? ` · ${s.publisher}` : ''} · ${Number(s.sale_price || 0).toFixed(2)}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            <p className="text-xs text-muted mt-1">Hereda editorial, categoría, idioma, formato, proveedor y precio.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Información Básica ── */}
                            <div className="space-y-3">
                                <p className="text-xs font-semibold text-muted uppercase tracking-wider">Información básica</p>
                                <div>
                                    <label className="block text-sm text-muted mb-1">Nombre</label>
                                    <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input-glass" placeholder="Nombre del producto" required />
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="col-span-2">
                                        <label className="block text-xs text-muted mb-1">Serie</label>
                                        <input type="text" value={formData.series}
                                            onChange={(e) => setFormData({ ...formData, series: e.target.value })}
                                            className="input-glass" placeholder="Vacío si no es serie" list="series-existentes" />
                                        <datalist id="series-existentes">
                                            {Array.from(new Set(products.map(p => p.series).filter(Boolean))).map(s => <option key={s} value={s} />)}
                                        </datalist>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-muted mb-1">Tomo</label>
                                        <input type="number" value={formData.volume}
                                            onChange={(e) => setFormData({ ...formData, volume: e.target.value.replace(/\D/g, '') })}
                                            className="input-glass" placeholder="#" min="0" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm text-muted mb-1">ISBN</label>
                                    <input type="text" value={formData.isbn}
                                        onChange={(e) => setFormData({ ...formData, isbn: e.target.value.trim() })}
                                        className={`input-glass font-mono ${isbnStatus.isDuplicate ? 'border-bad' : ''}`}
                                        placeholder="Escanea o teclea el ISBN del editor" maxLength={100} />
                                    {/* Aviso de repetido: casi siempre es el mismo tomo reingresado. */}
                                    {isbnStatus.isDuplicate && isbnStatus.existingProduct && (
                                        <div className="mt-2 p-2.5 rounded-control bg-bad-soft border border-bad/25">
                                            <p className="text-xs font-semibold text-bad">Ese código ya está en el catálogo</p>
                                            <p className="text-xs text-ink mt-0.5">
                                                {isbnStatus.existingProduct.name}
                                                {isbnStatus.existingProduct.volume ? ` · tomo ${isbnStatus.existingProduct.volume}` : ''}
                                                {' · '}{isbnStatus.existingProduct.stock} en existencia
                                            </p>
                                            <p className="text-xs text-muted mt-1">
                                                Si querías sumar existencias, edita ese producto en vez de crear otro.
                                            </p>
                                        </div>
                                    )}
                                    {!isbnStatus.isDuplicate && (
                                        <p className="text-xs text-muted mt-1">
                                            Opcional. El código de barras para escanear se asigna solo al guardar.
                                        </p>
                                    )}
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-xs text-muted mb-1">Costo *</label>
                                        <input type="number" value={formData.cost_price} onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })} onKeyDown={(e) => ["e","E","+","-"].includes(e.key) && e.preventDefault()} className="input-glass" step="0.01" min="0" placeholder="0.00" required />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-muted mb-1">Venta *</label>
                                        <input type="number" value={formData.sale_price} onChange={(e) => setFormData({ ...formData, sale_price: e.target.value })} onKeyDown={(e) => ["e","E","+","-"].includes(e.key) && e.preventDefault()} className="input-glass" step="0.01" min="0" placeholder="0.00" required />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-muted mb-1">Stock</label>
                                        <input type="number" value={formData.stock} onChange={(e) => setFormData({ ...formData, stock: e.target.value })} className="input-glass" min="0" placeholder="0" />
                                    </div>
                                </div>
                            </div>

                            {/* ── Clasificación ── */}
                            <div className="space-y-3">
                                <p className="text-xs font-semibold text-muted uppercase tracking-wider">Clasificación</p>

                                {/* La casilla «Producto para adultos» vivia aqui, duplicando el
                                    selector de rama de arriba. Dos controles para el mismo dato
                                    es como se llegaba a category='Shonen' con is_adult=1. */}

                                {formData.is_adult && (
                                    <div className="grid grid-cols-2 gap-3 p-3 rounded-control bg-rose-500/5 border border-rose-500/15">
                                        <div>
                                            <label className="block text-xs text-rose-700/70 mb-1">Artista</label>
                                            <input type="text" value={formData.artist || ''} onChange={(e) => setFormData({ ...formData, artist: e.target.value })} className="input-glass border-rose-500/20" placeholder="Nombre del artista" />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-rose-700/70 mb-1">Grupo / Círculo</label>
                                            <input type="text" value={formData.group_name || ''} onChange={(e) => setFormData({ ...formData, group_name: e.target.value })} className="input-glass border-rose-500/20" placeholder="Círculo doujin" />
                                        </div>
                                    </div>
                                )}

                                {/* Category chips — solo las de la rama activa: la base rechaza
                                    un producto cuya categoria pertenezca a la otra. */}
                                <div>
                                    <label className="block text-xs text-muted mb-2">
                                        Categoría <span className="opacity-60">· dentro de {formData.is_adult ? 'Adultos' : 'Regular'}</span>
                                    </label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {categoriasDeRama.map(type => {
                                            const noPages = ['Figuras','Accesorio','Boxset','Calendario','Extra','Figura Hentai','Accesorio Adulto'].includes(type);
                                            return (
                                                <button key={type} type="button"
                                                    onClick={() => setFormData({ ...formData, category: type, ...(noPages ? { page_count: '', page_color: '' } : {}) })}
                                                    className={`px-2 py-2 rounded-lg text-xs font-medium text-center transition-all border ${formData.category === type ? (formData.is_adult ? 'bg-rose-500/20 border-rose-500/60 text-rose-700' : 'bg-accent/20 border-accent/25 text-accent') : 'bg-white/3 border-line text-muted hover:border-line-strong hover:text-ink'}`}
                                                >{type}</button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* ── Detalles Técnicos ── */}
                            <div className="space-y-3">
                                <p className="text-xs font-semibold text-muted uppercase tracking-wider">Detalles técnicos</p>
                                <CreatableSelect label="Editorial" value={formData.publisher} onChange={(val) => setFormData(prev => ({ ...prev, publisher: val }))} options={uniquePublishers} placeholder="Casa editora" required />
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs text-muted mb-1">Fecha publicación</label>
                                        <input type="date" value={formData.publication_date} onChange={(e) => setFormData({ ...formData, publication_date: e.target.value })} className="input-glass" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-muted mb-1">Idioma</label>
                                        <select value={formData.language} onChange={(e) => setFormData({ ...formData, language: e.target.value })} className="input-glass" required>
                                            <option value="">Seleccionar...</option>
                                            <option value="Español">Español</option>
                                            <option value="Inglés">Inglés</option>
                                            <option value="Japonés">Japonés</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className={`block text-xs mb-1 ${['Figuras','Accesorio','Boxset','Calendario','Extra'].includes(formData.category) ? 'text-ink' : 'text-muted'}`}>Páginas</label>
                                        <input type="number" value={formData.page_count} onChange={(e) => setFormData({ ...formData, page_count: e.target.value.replace(/^0+/,'').replace(/\D/g,'') })} className={`input-glass ${['Figuras','Accesorio','Boxset','Calendario','Extra'].includes(formData.category) ? 'opacity-40 cursor-not-allowed' : ''}`} placeholder="Núm" min="1" disabled={['Figuras','Accesorio','Boxset','Calendario','Extra'].includes(formData.category)} required={['Manga','Revista','Edición Especial','Fanbook','Libro de Arte'].includes(formData.category)} />
                                    </div>
                                    <div>
                                        <label className={`block text-xs mb-1 ${['Figuras','Accesorio','Boxset','Calendario','Extra'].includes(formData.category) ? 'text-ink' : 'text-muted'}`}>Color págs.</label>
                                        <select value={formData.page_color} onChange={(e) => setFormData({ ...formData, page_color: e.target.value })} className={`input-glass ${['Figuras','Accesorio','Boxset','Calendario','Extra'].includes(formData.category) ? 'opacity-40 cursor-not-allowed' : ''}`} required={['Manga','Revista','Edición Especial','Fanbook','Libro de Arte'].includes(formData.category)} disabled={['Figuras','Accesorio','Boxset','Calendario','Extra'].includes(formData.category)}>
                                            <option value="Blanco y Negro">B/N</option>
                                            <option value="Color">Color</option>
                                        </select>
                                    </div>
                                </div>
                                {/* ── Formato de envío ──
                                    Largo, ancho, alto y peso solo sirven para cotizar con
                                    Envia.com, y dentro de una edición son idénticos entre
                                    tomos. Se miden una vez por edición y se eligen. */}
                                <div>
                                    <label className="block text-xs text-muted mb-1">Formato de envío</label>
                                    <div className="flex gap-2">
                                        <select value={formData.format_id}
                                            onChange={(e) => setFormData({ ...formData, format_id: e.target.value })}
                                            className="input-glass flex-1">
                                            <option value="">Sin formato — medidas propias</option>
                                            {formats.map(f => (
                                                <option key={f.id} value={f.id}>
                                                    {f.name} · {Number(f.length_cm)}×{Number(f.width_cm)}×{Number(f.height_cm)} cm · {f.weight_g} g
                                                </option>
                                            ))}
                                        </select>
                                        <button type="button" onClick={() => setShowFormatForm(v => !v)}
                                            className="px-3 py-2 bg-accent/20 text-accent hover:bg-accent/30 rounded-lg text-sm font-medium transition-colors shrink-0">
                                            {showFormatForm ? 'Cerrar' : 'Nuevo'}
                                        </button>
                                    </div>

                                    {showFormatForm && (
                                        <div className="mt-2 p-3 rounded-control bg-white/3 border border-line space-y-2">
                                            <input type="text" value={newFormat.name}
                                                onChange={(e) => setNewFormat({ ...newFormat, name: e.target.value })}
                                                className="input-glass" placeholder="Nombre (ej. Tankōbon Panini)" />
                                            <div className="grid grid-cols-4 gap-2">
                                                {[['length_cm', 'Largo'], ['width_cm', 'Ancho'], ['height_cm', 'Alto'], ['weight_g', 'Peso g']].map(([k, etq]) => (
                                                    <input key={k} type="number" value={newFormat[k]}
                                                        onChange={(e) => setNewFormat({ ...newFormat, [k]: e.target.value })}
                                                        className="input-glass" placeholder={etq} min="0.1" step={k === 'weight_g' ? '1' : '0.1'} />
                                                ))}
                                            </div>
                                            <button type="button" onClick={crearFormato} className="btn-secondary w-full text-sm">
                                                Guardar formato y usarlo
                                            </button>
                                            <p className="text-xs text-muted">
                                                Se mide una vez. Todos los tomos de esa edición lo reutilizan.
                                            </p>
                                        </div>
                                    )}

                                    {/* Sin formato hay que medir este producto: es lo que ocurre
                                        con una figura suelta o un artículo importado. */}
                                    {!formData.format_id && (
                                        <div className="mt-2 space-y-2">
                                            <div className="grid grid-cols-4 gap-2">
                                                <input type="number" value={formData.dimensions.length} onChange={(e) => setFormData({ ...formData, dimensions: { ...formData.dimensions, length: e.target.value.replace(/^0+/, '') } })} className="input-glass" placeholder="Largo" min="0.1" step="0.1" required />
                                                <input type="number" value={formData.dimensions.width} onChange={(e) => setFormData({ ...formData, dimensions: { ...formData.dimensions, width: e.target.value.replace(/^0+/, '') } })} className="input-glass" placeholder="Ancho" min="0.1" step="0.1" required />
                                                <input type="number" value={formData.dimensions.height} onChange={(e) => setFormData({ ...formData, dimensions: { ...formData.dimensions, height: e.target.value.replace(/^0+/, '') } })} className="input-glass" placeholder="Alto" min="0.1" step="0.1" required />
                                                <input type="number" value={formData.weight} onChange={(e) => setFormData({ ...formData, weight: e.target.value.replace(/^0+/, '') })} className="input-glass" placeholder="Peso g" min="1" step="0.1" required />
                                            </div>
                                            <p className="text-xs text-muted">En centímetros y gramos. Necesarias para cotizar el envío.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ── Eventos ── */}
                            <div className="space-y-3">
                                <p className="text-xs font-semibold text-muted uppercase tracking-wider">Eventos</p>
                                <div className="space-y-3">
                                    {[
                                        { key: 'novedad', label: 'Novedad', color: 'emerald', icon: '✦' },
                                        { key: 'liquidacion', label: 'Liquidación', color: 'amber', icon: '⬇' }
                                    ].map(({ key, label, color, icon }) => {
                                        const ev = formData.events?.[key] || { active: false, type: 'until_stock', end_date: '' };
                                        const colorMap = {
                                            emerald: { badge: 'bg-ok-soft text-ok border-emerald-500/30', panel: 'bg-ok-soft border-emerald-500/15', track: 'bg-emerald-500', radio: 'text-ok' },
                                            amber: { badge: 'bg-warn-soft text-warn border-amber-500/30', panel: 'bg-warn-soft border-amber-500/15', track: 'bg-amber-500', radio: 'text-warn' }
                                        };
                                        const c = colorMap[color];
                                        return (
                                            <div key={key} className={`rounded-control border transition-all ${ev.active ? `${c.panel} border` : 'bg-white/3 border-line'}`}>
                                                <div className="flex items-center justify-between p-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.badge}`}>
                                                            <span className="text-[10px]">{icon}</span>{label}
                                                        </span>
                                                    </div>
                                                    {/* Toggle switch */}
                                                    <button type="button" onClick={() => updateEvent(key, { active: !ev.active })}
                                                        className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${ev.active ? c.track : 'bg-raised'}`}>
                                                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${ev.active ? 'translate-x-5' : 'translate-x-0'}`} />
                                                    </button>
                                                </div>
                                                {ev.active && (
                                                    <div className="px-3 pb-3 space-y-2.5">
                                                        <div className="flex gap-4">
                                                            <label className="flex items-center gap-2 cursor-pointer">
                                                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${ev.type === 'until_stock' ? `border-${color}-500 bg-${color}-500` : 'border-slate-500'}`}>
                                                                    {ev.type === 'until_stock' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                                                </div>
                                                                <input type="radio" checked={ev.type === 'until_stock'} onChange={() => updateEvent(key, { type: 'until_stock', end_date: '' })} className="hidden" />
                                                                <span className="text-xs text-ink">Hasta agotar stock</span>
                                                            </label>
                                                            <label className="flex items-center gap-2 cursor-pointer">
                                                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${ev.type === 'duration' ? `border-${color}-500 bg-${color}-500` : 'border-slate-500'}`}>
                                                                    {ev.type === 'duration' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                                                </div>
                                                                <input type="radio" checked={ev.type === 'duration'} onChange={() => updateEvent(key, { type: 'duration' })} className="hidden" />
                                                                <span className="text-xs text-ink">Por fecha</span>
                                                            </label>
                                                        </div>
                                                        {ev.type === 'duration' && (
                                                            <div className="flex items-center gap-2">
                                                                <div className="flex-1">
                                                                    <label className="block text-xs text-muted mb-1">Fecha fin</label>
                                                                    <input type="date" value={ev.end_date || ''} onChange={(e) => updateEvent(key, { end_date: e.target.value })} className="input-glass" min={new Date().toISOString().split('T')[0]} />
                                                                </div>
                                                                {ev.end_date && (
                                                                    <div className="flex-1">
                                                                        <label className="block text-xs text-muted mb-1">Vigencia</label>
                                                                        <p className="text-xs text-ink pt-2">
                                                                            {Math.ceil((new Date(ev.end_date) - new Date()) / (1000*60*60*24))} días restantes
                                                                        </p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ── Extras ── */}
                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-muted uppercase tracking-wider">Extras</p>
                                <button type="button" onClick={openExtrasModal} className="input-glass w-full text-left flex items-center justify-between hover:border-accent/25 transition-colors">
                                    <span className={formData.extras.length > 0 ? 'text-white text-sm' : 'text-muted text-sm'}>
                                        {formData.extras.length > 0 ? `${formData.extras.length} extra${formData.extras.length > 1 ? 's' : ''} seleccionado${formData.extras.length > 1 ? 's' : ''}` : 'Seleccionar extras...'}
                                    </span>
                                    <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                </button>
                                {formData.extras.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {formData.extras.map((extra, i) => (
                                            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent/20 text-accent rounded-full text-xs">
                                                {extra}
                                                <button type="button" onClick={() => removeExtraFromForm(extra)} className="hover:text-ink"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* ── Etiquetas ── */}
                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-muted uppercase tracking-wider">Etiquetas</p>
                                <div className="relative">
                                    <div className="input-glass flex flex-wrap items-center gap-1 min-h-[42px] p-2 focus-within:border-accent/25">
                                        {(formData.tags || []).map((tag, i) => (
                                            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-ok-soft text-ok rounded-full text-xs">
                                                {tag}
                                                <button type="button" onClick={() => setFormData(prev => ({ ...prev, tags: (prev.tags || []).filter((_,idx) => idx !== i) }))} className="hover:text-ink">
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                </button>
                                            </span>
                                        ))}
                                        <input type="text" value={tagInput} onChange={(e) => { setTagInput(e.target.value); setShowTagDropdown(true); }} onFocus={() => setShowTagDropdown(true)} onBlur={() => setTimeout(() => setShowTagDropdown(false), 200)}
                                            onKeyDown={(e) => { if (e.key === 'Enter' && tagInput.trim()) { e.preventDefault(); const t = tagInput.trim(); if (!(formData.tags||[]).includes(t)) setFormData(prev=>({...prev,tags:[...(prev.tags||[]),t]})); setTagInput(''); setShowTagDropdown(false); } }}
                                            className="flex-1 min-w-[100px] bg-transparent border-none outline-none text-ink text-sm placeholder-slate-600"
                                            placeholder={(formData.tags||[]).length === 0 ? 'Escribir etiqueta...' : '+'} />
                                    </div>
                                    {showTagDropdown && (() => { const filtered = tagSuggestions.filter(t => t.toLowerCase().includes(tagInput.toLowerCase()) && !(formData.tags||[]).includes(t)); return filtered.length > 0 ? (
                                        <div className="absolute z-50 w-full mt-1 bg-surface border border-line rounded-lg shadow-xl max-h-36 overflow-y-auto custom-scrollbar">
                                            {filtered.map((tag,i) => <button key={i} type="button" onMouseDown={(e)=>{ e.preventDefault(); if(!(formData.tags||[]).includes(tag)) setFormData(prev=>({...prev,tags:[...(prev.tags||[]),tag]})); setTagInput(''); setShowTagDropdown(false); }} className="w-full text-left px-3 py-2 text-sm text-ink hover:bg-accent/20 hover:text-white transition-colors">{tag}</button>)}
                                        </div>) : null; })()}
                                </div>
                                <p className="text-xs text-muted">Presiona Enter para crear nueva etiqueta</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {Array.from(new Set([...(formData.is_adult ? ADULT_PRESET_TAGS : PRESET_TAGS), ...tagSuggestions])).filter(tag => !(formData.tags||[]).includes(tag)).map((tag,i) => (
                                        <button key={`p-${i}`} type="button" onClick={() => setFormData(prev=>({...prev,tags:[...(prev.tags||[]),tag]}))}
                                            className="px-2 py-1 text-xs bg-surface hover:bg-ok-soft text-muted hover:text-ok border border-line/60 hover:border-emerald-500/30 rounded-full transition-all">
                                            + {tag}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* ── Proveedor ── */}
                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-muted uppercase tracking-wider">Proveedor</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs text-muted mb-1">Proveedor (opcional)</label>
                                        <select value={formData.supplier_id} onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })} className="input-glass">
                                            <option value="">Sin proveedor</option>
                                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </div>
                                    {formData.supplier_id && (
                                        <div className="animate-fade-in">
                                            <label className="block text-xs text-muted mb-1">Precio proveedor</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-2.5 text-muted text-sm">$</span>
                                                <input type="number" step="0.01" value={formData.supplier_price} onChange={(e) => setFormData({ ...formData, supplier_price: e.target.value })} className="input-glass pl-7" placeholder="0.00" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ── Sinopsis ──
                                El botón copia texto de catálogos públicos (Google Books,
                                Open Library, AniList) por ISBN o por serie. No lo redacta
                                ningún modelo: si ninguna fuente conoce el título, el campo
                                se queda vacío en vez de inventar la trama. */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold text-muted uppercase tracking-wider">Sinopsis</p>
                                    <button type="button" onClick={buscarSinopsis}
                                        disabled={sinopsisEstado.buscando || (!formData.isbn && !formData.name && !formData.series)}
                                        className="px-3 py-1.5 bg-accent/20 text-accent hover:bg-accent/30 rounded-lg text-xs font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5">
                                        {sinopsisEstado.buscando && <div className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />}
                                        {sinopsisEstado.buscando ? 'Buscando…' : 'Generar sinopsis'}
                                    </button>
                                </div>

                                {sinopsisEstado.mensaje && (
                                    <p className="text-xs text-warn bg-warn-soft border border-warn/25 rounded-control px-3 py-2">
                                        {sinopsisEstado.mensaje}
                                    </p>
                                )}

                                {/* Se muestran todas las que respondieron: elegir es más
                                    rápido que buscar, y ver dos versiones deja claro cuál
                                    corresponde a esta edición. */}
                                {sinopsisEstado.opciones?.length > 0 && (
                                    <div className="space-y-2">
                                        {sinopsisEstado.opciones.map((op, i) => (
                                            <div key={i} className="p-3 rounded-control bg-white/3 border border-line">
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <span className="px-2 py-0.5 rounded-full bg-accent/15 text-accent text-[10px] font-semibold uppercase tracking-wide">
                                                        {op.fuente}
                                                    </span>
                                                    {op.idioma && <span className="text-[10px] text-muted uppercase">{op.idioma}</span>}
                                                    <button type="button" onClick={() => usarSinopsis(op)}
                                                        className="ml-auto text-xs font-semibold text-accent hover:underline">
                                                        Usar este texto
                                                    </button>
                                                </div>
                                                {op.nota && <p className="text-xs text-warn mb-1.5">{op.nota}</p>}
                                                <p className="text-xs text-muted line-clamp-4 whitespace-pre-line">{op.texto}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <textarea
                                    value={formData.sinopsis}
                                    onChange={(e) => setFormData({ ...formData, sinopsis: e.target.value, sinopsis_fuente: '' })}
                                    className="input-glass w-full resize-none"
                                    rows={5}
                                    placeholder="Descripción o sinopsis del producto..."
                                    required
                                />
                                {formData.sinopsis_fuente && (
                                    <p className="text-xs text-muted">
                                        Copiada de <a href={formData.sinopsis_fuente} target="_blank" rel="noreferrer noopener" className="underline hover:text-ink">{formData.sinopsis_fuente}</a>.
                                        Conviene editarla antes de publicar.
                                    </p>
                                )}
                            </div>

                            {/* ── Botones ── */}
                            <div className="flex gap-3 pt-2 border-t border-line">
                                <button type="button" onClick={intentarCerrarForm} className="flex-1 btn-secondary">Cancelar</button>
                                <button type="submit" className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2" disabled={isbnStatus.isDuplicate || isbnStatus.checking || isSubmitting}>
                                    {isSubmitting && <div className="w-4 h-4 border-2 border-line border-t-white rounded-full animate-spin" />}
                                    {editingProduct ? 'Guardar Cambios' : 'Crear Producto'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Confirmacion de salida: evita perder la captura por un clic afuera */}
            {confirmarSalida && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[95] p-4 animate-fade-in">
                    <div className="bg-surface border border-line rounded-panel shadow-2xl w-full max-w-sm p-6">
                        <h3 className="text-lg font-semibold text-ink mb-2">¿Descartar los cambios?</h3>
                        <p className="text-sm text-muted mb-6">
                            {editingProduct
                                ? 'Las modificaciones que hiciste a este producto no se guardarán.'
                                : 'Lo que llevas capturado de este producto se perderá.'}
                        </p>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setConfirmarSalida(false)}
                                className="flex-1 btn-secondary"
                                autoFocus
                            >
                                Seguir editando
                            </button>
                            <button
                                type="button"
                                onClick={closeForm}
                                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                            >
                                Descartar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Products Table */}
            <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-raised">
                            <tr>
                                <th className="table-header w-16">Img</th>
                                <th
                                    className="table-header cursor-pointer hover:bg-raised transition-colors group"
                                    onClick={() => requestSort('name')}
                                >
                                    <div className="flex items-center gap-1">
                                        Producto
                                        {sortConfig.key === 'name' && (
                                            <span className="text-accent">
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
                                    className="table-header cursor-pointer hover:bg-raised transition-colors group"
                                    onClick={() => requestSort('category')}
                                >
                                    <div className="flex items-center gap-1">
                                        Categoría
                                        {sortConfig.key === 'category' && (
                                            <span className="text-accent">
                                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th
                                    className="table-header cursor-pointer hover:bg-raised transition-colors group"
                                    onClick={() => requestSort('publisher')}
                                >
                                    <div className="flex items-center gap-1">
                                        Editorial
                                        {sortConfig.key === 'publisher' && (
                                            <span className="text-accent">
                                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th
                                    className="table-header text-right cursor-pointer hover:bg-raised transition-colors group"
                                    onClick={() => requestSort('price')}
                                >
                                    <div className="flex items-center justify-end gap-1">
                                        Precio
                                        {sortConfig.key === 'price' && (
                                            <span className="text-accent">
                                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th
                                    className="table-header text-right cursor-pointer hover:bg-raised transition-colors group"
                                    onClick={() => requestSort('stock')}
                                >
                                    <div className="flex items-center justify-end gap-1">
                                        Stock
                                        {sortConfig.key === 'stock' && (
                                            <span className="text-accent">
                                                {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                                <th className="table-header text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                            {sortedProducts.map(product => (
                                <tr key={product.id} className="hover:bg-raised transition-colors">
                                    <td className="table-cell">
                                        <div
                                            className="w-10 h-10 rounded-lg bg-raised overflow-hidden border border-line cursor-pointer hover:border-accent transition-colors"
                                            onClick={() => setPreviewProduct(product)}
                                        >
                                            {product.image_url ? (
                                                <img
                                                    src={product.image_url}
                                                    alt={product.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-muted">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="table-cell font-medium">{product.name}</td>
                                    <td className="table-cell">
                                        {(product.barcode || product.isbn) ? (
                                            <span className="font-mono text-sm bg-raised/50 px-2 py-1 rounded">
                                                {product.barcode || product.isbn}
                                            </span>
                                        ) : (
                                            <span className="text-muted text-sm">-</span>
                                        )}
                                    </td>
                                    <td className="table-cell">
                                        {product.category && (
                                            <span className="px-2 py-1 bg-accent/20 text-accent rounded-lg text-xs">
                                                {product.category}
                                            </span>
                                        )}
                                    </td>
                                    <td className="table-cell">
                                        {product.publisher ? (
                                            <span className="text-ink text-sm">
                                                {product.publisher}
                                            </span>
                                        ) : (
                                            <span className="text-muted text-sm italic">-</span>
                                        )}
                                    </td>
                                    <td className="table-cell text-right">
                                        <div>
                                            <p className="font-semibold text-ok">
                                                ${Number(product.sale_price || product.price || 0).toFixed(2)}
                                            </p>
                                            {product.cost_price && product.sale_price && (
                                                <p className="text-xs text-muted">
                                                    Margen: {(((product.sale_price - product.cost_price) / product.sale_price) * 100).toFixed(1)}%
                                                </p>
                                            )}
                                        </div>
                                    </td>
                                    <td className="table-cell text-right">
                                        <span className={`${product.stock > 10
                                            ? 'text-ink'
                                            : product.stock > 0
                                                ? 'text-warn'
                                                : 'text-bad'
                                            }`}>
                                            {product.stock}
                                        </span>
                                    </td>
                                    <td className="table-cell text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => handleEdit(product)}
                                                className="p-2 hover:bg-raised rounded-lg transition-colors text-muted hover:text-ink"
                                                title="Editar producto"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => generateProductLabel(product, token)}
                                                disabled={!product.isbn && !product.barcode}
                                                className={`p-2 rounded-lg transition-colors ${(product.isbn || product.barcode)
                                                    ? 'hover:bg-raised text-muted hover:text-white'
                                                    : 'text-ink cursor-not-allowed'
                                                    }`}
                                                title={(product.isbn || product.barcode) ? "Imprimir etiqueta" : "Sin código para imprimir"}
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10v2H7V7zm0 4h10v2H7v-2zM7 15h10v2H7v-2zM20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4v4h8v-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H4V4h16v12z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => setDeleteConfirm(product)}
                                                className="p-2 hover:bg-bad-soft rounded-lg transition-colors text-muted hover:text-bad"
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
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[90] p-4 animate-fade-in">
                    <div className="glass-card p-6 w-full max-w-md animate-slide-up bg-surface border border-bad/30 shadow-2xl">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="p-3 bg-bad-soft rounded-full">
                                <svg className="w-8 h-8 text-bad" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-ink">¿Eliminar producto?</h3>
                                <p className="text-muted text-sm">
                                    Esta acción no se puede deshacer.
                                </p>
                            </div>
                        </div>
                        <div className="bg-raised rounded-control p-4 mb-6 border border-line">
                            <p className="font-medium text-ink">{deleteConfirm.name}</p>
                            {deleteConfirm.isbn && (
                                <p className="text-sm text-muted font-mono">{deleteConfirm.isbn}</p>
                            )}
                            <p className="text-sm text-ok font-bold mt-1">${Number(deleteConfirm.sale_price || deleteConfirm.price || 0).toFixed(2)}</p>
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
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4 animate-fade-in">
                    <div className="glass-card p-8 w-full max-w-lg animate-slide-up bg-red-900/40 border-2 border-red-500 shadow-[0_0_50px_rgba(239,68,68,0.5)]">
                        <div className="flex items-center gap-6 mb-6">
                            <div className="p-4 bg-red-600 rounded-full animate-pulse">
                                <svg className="w-10 h-10 text-ink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-ink uppercase tracking-wider">¡Advertencia Crítica!</h3>
                                <p className="text-red-200 mt-1 font-medium">
                                    Este producto tiene historial de ventas.
                                </p>
                            </div>
                        </div>

                        <div className="bg-black/40 rounded-control p-6 mb-8 border border-bad/30">
                            <p className="text-ink text-lg mb-4">
                                Estás a punto de eliminar: <span className="font-bold text-bad">{forceDeleteConfirm.name}</span>
                            </p>
                            <p className="text-ink text-sm leading-relaxed">
                                Esta acción eliminará el producto <strong>Y TODAS LAS VENTAS PASADAS</strong> asociadas a él.
                                <br /><br />
                                <span className="text-bad italic">Los reportes financieros históricos cambiarán irreversiblemente.</span>
                            </p>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setForceDeleteConfirm(null)}
                                className="flex-1 py-4 bg-raised text-ink rounded-control hover:bg-raised font-bold transition-all"
                            >
                                Cancelar (Seguro)
                            </button>
                            <button
                                onClick={handleForceDelete}
                                className="flex-1 py-4 bg-red-600 text-white rounded-control hover:bg-red-700 font-bold shadow-lg shadow-red-900/50 hover:shadow-red-500/30 transition-all border border-red-400"
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
                    className="fixed inset-0 bg-black/80 flex items-center justify-center z-[80] p-4 animate-fade-in"
                    onClick={() => setZoomImage(null)}
                >
                    <div className="relative max-w-4xl max-h-[90vh] w-full flex items-center justify-center">
                        <img
                            src={zoomImage}
                            alt="Zoom"
                            className="max-w-full max-h-[90vh] object-contain rounded-control shadow-2xl"
                        />
                        <button
                            className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-raised transition-colors"
                            onClick={() => setZoomImage(null)}
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* Product Preview Modal */}
            <Modal
                title={`Detalles del Producto: ${previewProduct?.name}`}
                isOpen={!!previewProduct}
                onClose={() => setPreviewProduct(null)}
            >
                {previewProduct && (
                    <div className="space-y-6 text-ink">
                        <div className="flex flex-col md:flex-row gap-6">
                            <div className="w-full md:w-1/3">
                                {previewProduct.image_url ? (
                                    <div className="relative group cursor-pointer" onClick={() => setZoomImage(previewProduct.image_url)}>
                                        <img
                                            src={previewProduct.image_url}
                                            alt={previewProduct.name}
                                            className="w-full h-auto rounded-lg shadow-lg border border-line transition-colors group-hover:border-accent"
                                        />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                                            <svg className="w-8 h-8 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                            </svg>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-full aspect-square bg-raised/50 rounded-lg flex items-center justify-center border border-line">
                                        <svg className="w-12 h-12 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    </div>
                                )}
                            </div>
                            <div className="w-full md:w-2/3 space-y-4">
                                <div>
                                    <h4 className="text-sm font-semibold text-accent mb-1">Título</h4>
                                    <p className="text-xl font-bold text-ink leading-tight">{previewProduct.name}</p>
                                </div>

                                <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 bg-surface rounded-control border border-line">
                                    <div>
                                        <span className="block text-xs text-muted uppercase">Clasificación</span>
                                        <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded font-medium ${previewProduct.is_adult ? 'bg-bad-soft text-bad border border-bad/30' : 'bg-accent/20 text-accent border border-accent/25'}`}>
                                            {previewProduct.is_adult ? 'Adultos (18+)' : 'General'}
                                        </span>
                                    </div>

                                    {!!previewProduct.is_adult && (
                                        <>
                                            <div>
                                                <span className="block text-xs text-muted uppercase">Artista</span>
                                                <span className="font-medium text-ink">{previewProduct.artist || 'N/A'}</span>
                                            </div>
                                            <div>
                                                <span className="block text-xs text-muted uppercase">Grupo / Círculo</span>
                                                <span className="font-medium text-ink">{previewProduct.group_name || 'N/A'}</span>
                                            </div>
                                        </>
                                    )}

                                    <div>
                                        <span className="block text-xs text-muted uppercase">Categoría</span>
                                        <span className="font-medium text-ink">{previewProduct.category || 'N/A'}</span>
                                    </div>
                                    <div>
                                        <span className="block text-xs text-muted uppercase">Editorial</span>
                                        <span className="font-medium text-ink">{previewProduct.publisher || 'N/A'}</span>
                                    </div>

                                    <div className="col-span-2 mt-2 pt-2 border-t border-line/50">
                                        <span className="block text-xs text-muted uppercase mb-2">Etiquetas</span>
                                        <div className="flex flex-wrap gap-1">
                                            {previewProduct.tags && previewProduct.tags.length > 0 ? (
                                                previewProduct.tags.map(tag => (
                                                    <span key={tag} className="bg-raised/50 border border-line text-ink px-2 py-0.5 rounded-md text-xs">
                                                        {tag}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="text-muted text-sm italic">Sin etiquetas</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-3 bg-surface rounded-lg border border-line">
                                        <span className="block text-xs text-muted uppercase mb-1">Stock Disponible</span>
                                        <span className={`text-2xl font-bold ${previewProduct.stock > 0 ? 'text-ok' : 'text-bad'}`}>
                                            {previewProduct.stock} uds.
                                        </span>
                                    </div>
                                    <div className="p-3 bg-surface rounded-lg border border-line">
                                        <span className="block text-xs text-muted uppercase mb-1">Precio de Venta</span>
                                        <span className="text-2xl font-bold text-ok">${parseFloat(previewProduct.sale_price).toFixed(2)}</span>
                                        <span className="block text-xs text-muted mt-1">Costo: ${parseFloat(previewProduct.cost_price).toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
