import { useState, useEffect, useMemo } from 'react';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';

const DEFAULT_EVENT = { active: false, type: 'until_stock', end_date: '' };

// DB event keys per tab — adult rotation stored under separate keys
const TAB_KEYS = {
    general: { nov: 'novedad',       liq: 'liquidacion' },
    adult:   { nov: 'novedad_adult', liq: 'liquidacion_adult' },
};

function parseEvents(raw) {
    try {
        const ev = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
        return {
            ...ev,                                                                        // preserve any unknown keys
            novedad:           { ...DEFAULT_EVENT, ...(ev.novedad           || {}) },
            liquidacion:       { ...DEFAULT_EVENT, ...(ev.liquidacion       || {}) },
            novedad_adult:     { ...DEFAULT_EVENT, ...(ev.novedad_adult     || {}) },
            liquidacion_adult: { ...DEFAULT_EVENT, ...(ev.liquidacion_adult || {}) },
        };
    } catch {
        return {
            novedad:           { ...DEFAULT_EVENT },
            liquidacion:       { ...DEFAULT_EVENT },
            novedad_adult:     { ...DEFAULT_EVENT },
            liquidacion_adult: { ...DEFAULT_EVENT },
        };
    }
}

export default function RotacionSemanal({ onClose }) {
    const { token } = useAuth();

    const [products, setProducts]           = useState([]);
    const [loading, setLoading]             = useState(true);
    const [saving, setSaving]               = useState(false);
    const [activeCol, setActiveCol]         = useState(null);     // actual DB key or null
    const [activeTab, setActiveTab]         = useState('general');
    const [search, setSearch]               = useState('');
    const [pendingEvents, setPendingEvents] = useState({});

    const keys = TAB_KEYS[activeTab]; // { nov, liq }

    /* ── Switch tab: reset col + search ── */
    function switchTab(tab) {
        setActiveTab(tab);
        setActiveCol(null);
        setSearch('');
    }

    /* ── Load products ── */
    useEffect(() => {
        fetch(`${API_URL}/products`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(data => { setProducts(Array.isArray(data) ? data : []); setLoading(false); })
            .catch(() => setLoading(false));
    }, [token]);

    /* ── Effective events (base + pending overrides) ── */
    function effectiveEvents(product) {
        const base = parseEvents(product.events);
        return pendingEvents[product.id]
            ? { ...base, ...pendingEvents[product.id] }
            : base;
    }

    /* ── Filter helper ── */
    function isAdultProduct(p) { return p.is_adult === 1 || p.is_adult === true; }

    /* ── Filtered product list (left panel) ── */
    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            const tabOk = activeTab === 'adult' ? isAdultProduct(p) : !isAdultProduct(p);
            if (!tabOk) return false;
            if (!search) return true;
            const q = search.toLowerCase();
            return (p.name || '').toLowerCase().includes(q) ||
                   (p.isbn || '').toLowerCase().includes(q);
        });
    }, [products, activeTab, search]);

    /* ── Column contents: tab-scoped ── */
    function columnProducts(key) {
        return products.filter(p => {
            const tabOk = activeTab === 'adult' ? isAdultProduct(p) : !isAdultProduct(p);
            return tabOk && effectiveEvents(p)[key]?.active;
        });
    }
    const novProducts = useMemo(() => columnProducts(keys.nov), [products, pendingEvents, activeTab]);
    const liqProducts = useMemo(() => columnProducts(keys.liq), [products, pendingEvents, activeTab]);

    /* ── Toggle product in active column ── */
    function toggleProduct(product) {
        if (!activeCol) return;
        const ev  = effectiveEvents(product);
        const cur = ev[activeCol]?.active;
        setPendingEvents(prev => ({
            ...prev,
            [product.id]: {
                ...(prev[product.id] || parseEvents(product.events)),
                [activeCol]: { ...ev[activeCol], active: !cur },
            },
        }));
    }

    /* ── Clear single column ── */
    function clearColumn(key) {
        const updated = {};
        products.forEach(p => {
            if (effectiveEvents(p)[key]?.active) {
                const ev = effectiveEvents(p);
                updated[p.id] = {
                    ...(pendingEvents[p.id] || parseEvents(p.events)),
                    [key]: { ...ev[key], active: false },
                };
            }
        });
        setPendingEvents(prev => ({ ...prev, ...updated }));
    }

    /* ── Nueva Rotación: clear only current tab's columns ── */
    function clearAll() {
        const tabLabel = activeTab === 'adult' ? 'Adultos (18+)' : 'General';
        if (!window.confirm(`¿Limpiar rotación de ${tabLabel}? Novedad y Liquidación de este catálogo quedarán vacías. Los cambios se guardarán al presionar "Guardar Rotación".`)) return;
        const { nov, liq } = keys;
        const updated = {};
        products.forEach(p => {
            const tabOk = activeTab === 'adult' ? isAdultProduct(p) : !isAdultProduct(p);
            if (!tabOk) return;
            const ev = effectiveEvents(p);
            if (ev[nov]?.active || ev[liq]?.active) {
                updated[p.id] = {
                    ...(pendingEvents[p.id] || parseEvents(p.events)),
                    [nov]: { ...ev[nov], active: false },
                    [liq]: { ...ev[liq], active: false },
                };
            }
        });
        setPendingEvents(prev => ({ ...prev, ...updated }));
        setActiveCol(null);
    }

    /* ── Save rotation ── */
    async function saveRotation() {
        if (Object.keys(pendingEvents).length === 0) { onClose(); return; }
        setSaving(true);
        try {
            const updates = Object.entries(pendingEvents).map(([id, events]) => ({
                id: Number(id), events,
            }));
            const res = await fetch(`${API_URL}/products/rotation`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ updates }),
            });
            if (!res.ok) throw new Error('Error al guardar');
            onClose();
        } catch (err) {
            alert(err.message);
        } finally {
            setSaving(false);
        }
    }

    /* ── Row color: tab-scoped keys ── */
    function rowColor(product) {
        const ev = effectiveEvents(product);
        if (ev[keys.nov]?.active) return 'bg-emerald-500/10 border-l-2 border-emerald-500';
        if (ev[keys.liq]?.active) return 'bg-amber-500/10 border-l-2 border-amber-500';
        return '';
    }

    /* ── Column panel ── */
    function ColumnPanel({ colKey, label, color, products: colProds }) {
        const isSelected  = activeCol === colKey;
        const borderClass = color === 'emerald'
            ? (isSelected ? 'border-emerald-500' : 'border-white/10')
            : (isSelected ? 'border-amber-500'   : 'border-white/10');
        const headerClass = color === 'emerald' ? 'text-emerald-400' : 'text-amber-400';
        const badgeClass  = color === 'emerald'
            ? 'bg-emerald-500/20 text-emerald-300'
            : 'bg-amber-500/20 text-amber-300';

        return (
            <div
                className={`flex flex-col border-2 rounded-xl transition-all cursor-pointer ${borderClass} ${isSelected ? 'shadow-lg' : ''}`}
                style={{ minHeight: 0 }}
                onClick={() => setActiveCol(prev => prev === colKey ? null : colKey)}
            >
                <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className={`font-bold text-sm uppercase tracking-wide ${headerClass}`}>{label}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badgeClass}`}>{colProds.length}</span>
                    </div>
                    {isSelected && <span className="text-xs text-slate-400 animate-pulse">● Columna activa</span>}
                </div>

                {colProds.length > 0 && (
                    <div className="px-3 py-2 border-b border-white/5">
                        <button
                            onClick={e => { e.stopPropagation(); clearColumn(colKey); }}
                            className="text-xs text-slate-400 hover:text-red-400 transition-colors flex items-center gap-1"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Limpiar selección
                        </button>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {colProds.length === 0 ? (
                        <p className="text-center text-slate-500 text-xs py-6">
                            {isSelected ? 'Selecciona productos de la lista' : 'Sin productos'}
                        </p>
                    ) : (
                        colProds.map(p => (
                            <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/4 hover:bg-white/8 transition-colors group">
                                {p.image_url
                                    ? <img src={p.image_url} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" />
                                    : <div className="w-7 h-7 rounded bg-white/10 flex items-center justify-center text-xs flex-shrink-0">📚</div>
                                }
                                <span className="text-xs text-slate-200 truncate flex-1">{p.name}</span>
                                <button
                                    onClick={e => { e.stopPropagation(); toggleProduct(p); }}
                                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    }

    const pendingCount = Object.keys(pendingEvents).length;
    const isAdultTab   = activeTab === 'adult';

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex flex-col">
            {/* Top bar */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900/95 border-b border-white/8">
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            Rotación Semanal
                            {isAdultTab && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold">18+</span>
                            )}
                        </h2>
                        <p className="text-xs text-slate-400">
                            Selecciona una columna y luego los productos ·
                            <span className="text-emerald-400 mx-1">■ Novedad</span>
                            <span className="text-amber-400">■ Liquidación</span>
                            {isAdultTab && <span className="text-rose-400 ml-1">· rotación independiente</span>}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {pendingCount > 0 && (
                        <span className="text-xs text-slate-400">
                            {pendingCount} producto{pendingCount > 1 ? 's' : ''} con cambios
                        </span>
                    )}
                    <button
                        onClick={clearAll}
                        className="btn-secondary text-sm flex items-center gap-2 text-rose-400 hover:text-rose-300 border-rose-500/30 hover:border-rose-400/50"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Nueva Rotación
                    </button>
                    <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
                    <button
                        onClick={saveRotation}
                        disabled={saving || pendingCount === 0}
                        className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        Guardar Rotación {pendingCount > 0 && `(${pendingCount})`}
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="flex flex-1 overflow-hidden">
                {/* ── Left: product list ── */}
                <div className="flex flex-col w-1/2 border-r border-white/8 overflow-hidden">
                    <div className="px-4 pt-3 pb-0 bg-slate-900/60 space-y-3">
                        <div className="flex border-b border-white/10">
                            {[
                                { key: 'general', label: 'Catálogo General' },
                                { key: 'adult',   label: 'Adultos (18+)' },
                            ].map(t => (
                                <button
                                    key={t.key}
                                    onClick={() => switchTab(t.key)}
                                    className={`px-4 py-2.5 text-sm font-medium transition-colors relative flex items-center gap-1.5 ${
                                        activeTab === t.key
                                            ? (t.key === 'adult' ? 'text-rose-400' : 'text-primary-400')
                                            : 'text-slate-400 hover:text-slate-200'
                                    }`}
                                >
                                    {t.label}
                                    {t.key === 'adult' && (
                                        <span className="text-[10px] px-1 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">18+</span>
                                    )}
                                    {activeTab === t.key && (
                                        <span className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-t ${t.key === 'adult' ? 'bg-rose-400' : 'bg-primary-400'}`} />
                                    )}
                                </button>
                            ))}
                        </div>
                        <input
                            type="text"
                            placeholder="Buscar producto..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="input-glass w-full text-sm mb-3"
                        />
                    </div>

                    {/* Hint */}
                    {!activeCol && (
                        <div className="mx-4 mb-2 mt-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                            <p className="text-xs text-blue-300">
                                👈 Selecciona una columna de la derecha para empezar a asignar productos
                            </p>
                        </div>
                    )}
                    {activeCol && (
                        <div className={`mx-4 mb-2 mt-2 px-3 py-2 rounded-lg border ${
                            activeCol === keys.nov
                                ? 'bg-emerald-500/10 border-emerald-500/30'
                                : 'bg-amber-500/10 border-amber-500/30'
                        }`}>
                            <p className={`text-xs font-medium ${activeCol === keys.nov ? 'text-emerald-300' : 'text-amber-300'}`}>
                                {activeCol === keys.nov ? '✦ Columna Novedad activa' : '⬇ Columna Liquidación activa'} — toca un producto para asignarlo
                            </p>
                        </div>
                    )}

                    {/* Product rows */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4 space-y-1">
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="w-6 h-6 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
                            </div>
                        ) : filteredProducts.length === 0 ? (
                            <p className="text-center text-slate-500 text-sm py-8">Sin productos</p>
                        ) : (
                            filteredProducts.map(product => {
                                const ev           = effectiveEvents(product);
                                const isNov        = ev[keys.nov]?.active;
                                const isLiq        = ev[keys.liq]?.active;
                                const isInActiveCol = activeCol ? ev[activeCol]?.active : false;

                                return (
                                    <div
                                        key={product.id}
                                        onClick={() => toggleProduct(product)}
                                        className={`
                                            flex items-center gap-3 px-3 py-2 rounded-lg transition-all
                                            ${activeCol ? 'cursor-pointer hover:bg-white/8' : 'cursor-default'}
                                            ${rowColor(product)}
                                        `}
                                    >
                                        {product.image_url
                                            ? <img src={product.image_url} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />
                                            : <div className="w-9 h-9 rounded bg-white/10 flex items-center justify-center text-base flex-shrink-0">📚</div>
                                        }
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-slate-100 truncate">{product.name}</p>
                                            <p className="text-xs text-slate-500 truncate">{product.category} · Stock: {product.stock}</p>
                                        </div>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            {isNov && <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">N</span>}
                                            {isLiq && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">L</span>}
                                            {activeCol && (
                                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                                                    isInActiveCol
                                                        ? (activeCol === keys.nov ? 'bg-emerald-500 border-emerald-500' : 'bg-amber-500 border-amber-500')
                                                        : 'border-slate-600'
                                                }`}>
                                                    {isInActiveCol && (
                                                        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* ── Right: columns ── */}
                <div className="flex flex-col w-1/2 p-4 gap-4 overflow-hidden">
                    <ColumnPanel colKey={keys.nov} label="Novedad"     color="emerald" products={novProducts} />
                    <ColumnPanel colKey={keys.liq} label="Liquidación" color="amber"   products={liqProducts} />
                </div>
            </div>
        </div>
    );
}
