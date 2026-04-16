import { useState, useEffect } from 'react';
import { API_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';

const STATUS_CONFIG = {
    active:   { label: 'Activo',    bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
    used:     { label: 'Agotado',   bg: 'bg-slate-500/20',   text: 'text-slate-400',   border: 'border-slate-500/30' },
    expired:  { label: 'Expirado',  bg: 'bg-amber-500/20',   text: 'text-amber-400',   border: 'border-amber-500/30' },
    disabled: { label: 'Inactivo',  bg: 'bg-red-500/20',     text: 'text-red-400',     border: 'border-red-500/30' },
};

function StatusBadge({ status }) {
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.disabled;
    return (
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
            {cfg.label}
        </span>
    );
}

function UsesModal({ credit, token, onClose }) {
    const [uses, setUses] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`${API_URL}/store-credits/${credit.id}/uses`, {
            headers: { Authorization: `Bearer ${token}` },
        }).then(r => r.json()).then(d => { setUses(d); setLoading(false); }).catch(() => setLoading(false));
    }, [credit.id]);

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="glass-card p-6 w-full max-w-lg animate-slide-up" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <h3 className="text-lg font-bold">Historial de uso</h3>
                        <p className="text-sm text-slate-400 font-mono">{credit.code}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                {loading ? (
                    <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500" /></div>
                ) : uses.length === 0 ? (
                    <p className="text-center text-slate-400 py-8">Sin usos registrados</p>
                ) : (
                    <div className="space-y-2">
                        {uses.map(u => (
                            <div key={u.id} className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
                                <div>
                                    <p className="text-sm font-semibold text-red-400">−${Number(u.amount_used).toFixed(2)} MXN</p>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Saldo: ${Number(u.balance_before).toFixed(2)} → ${Number(u.balance_after).toFixed(2)}
                                        {u.sale_id && <span className="ml-2">· Venta #{u.sale_id}</span>}
                                    </p>
                                </div>
                                <p className="text-xs text-slate-400">
                                    {new Date(u.used_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

const EMPTY_FORM = { code: '', balance: '', cliente_search: '', cliente_id: null, cliente_label: '', expiration_date: '', notes: '', status: 'active' };

export default function StoreCreditsManager() {
    const { token } = useAuth();
    const [credits, setCredits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [clienteLookup, setClienteLookup] = useState(null); // { nombre, apellido, email } encontrado
    const [clienteLookupError, setClienteLookupError] = useState('');
    const [usesModal, setUsesModal] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const fetchCredits = async () => {
        try {
            const res = await fetch(`${API_URL}/store-credits`, { headers: { Authorization: `Bearer ${token}` } });
            setCredits(await res.json());
        } catch { setCredits([]); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchCredits(); }, []);

    const resetForm = () => {
        setForm(EMPTY_FORM); setEditing(null); setShowForm(false);
        setError(''); setClienteLookup(null); setClienteLookupError('');
    };

    const lookupCliente = async (code) => {
        if (!code.trim()) { setClienteLookup(null); setClienteLookupError(''); return; }
        try {
            const res = await fetch(`${API_URL}/store-credits/search-clientes?q=${encodeURIComponent(code.trim())}&limit=1`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            const found = data[0];
            if (found && found.client_code?.toLowerCase() === code.trim().toLowerCase()) {
                setClienteLookup(found);
                setClienteLookupError('');
                setForm(f => ({ ...f, cliente_id: found.id }));
            } else {
                setClienteLookup(null);
                setClienteLookupError('No se encontró ningún cliente con ese número');
                setForm(f => ({ ...f, cliente_id: null }));
            }
        } catch {
            setClienteLookupError('Error al buscar cliente');
        }
    };

    const openEdit = (c) => {
        setEditing(c);
        setForm({
            code: c.code,
            balance: c.balance,
            cliente_email: c.cliente_email || '',
            expiration_date: c.expiration_date ? c.expiration_date.split('T')[0] : '',
            notes: c.notes || '',
            status: c.status,
        });
        setShowForm(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(''); setSuccess('');
        try {
            const url = editing ? `${API_URL}/store-credits/${editing.id}` : `${API_URL}/store-credits`;
            const method = editing ? 'PUT' : 'POST';
            const body = editing
                ? { status: form.status, notes: form.notes, expiration_date: form.expiration_date, balance: form.balance }
                : { code: form.code || undefined, balance: form.balance, cliente_id: form.cliente_id || undefined, expiration_date: form.expiration_date || undefined, notes: form.notes || undefined };

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error');

            setSuccess(editing ? 'Crédito actualizado' : `Crédito creado: ${data.code}`);
            resetForm();
            fetchCredits();
        } catch (err) { setError(err.message); }
    };

    const handleDelete = async (id) => {
        try {
            const res = await fetch(`${API_URL}/store-credits/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
            setSuccess('Crédito eliminado');
            setDeleteConfirm(null);
            fetchCredits();
        } catch (err) { setError(err.message); setDeleteConfirm(null); }
    };

    const totalActive = credits.filter(c => c.status === 'active').reduce((s, c) => s + Number(c.balance), 0);

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500" />
        </div>
    );

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                            </svg>
                        </span>
                        Créditos de Tienda
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">{credits.length} códigos · ${totalActive.toFixed(2)} MXN en circulación</p>
                </div>
                <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Nuevo Crédito
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: 'Activos',   count: credits.filter(c => c.status === 'active').length,   color: 'from-emerald-400 to-teal-400' },
                    { label: 'Agotados',  count: credits.filter(c => c.status === 'used').length,     color: 'from-slate-400 to-slate-500' },
                    { label: 'Expirados', count: credits.filter(c => c.status === 'expired').length,  color: 'from-amber-400 to-orange-400' },
                    { label: 'Inactivos', count: credits.filter(c => c.status === 'disabled').length, color: 'from-red-400 to-pink-400' },
                ].map(({ label, count, color }) => (
                    <div key={label} className="glass-card-dark rounded-xl p-4 text-center">
                        <p className={`text-2xl font-bold bg-gradient-to-r ${color} bg-clip-text text-transparent`}>{count}</p>
                        <p className="text-xs text-slate-400 mt-1">{label}</p>
                    </div>
                ))}
            </div>

            {/* Alerts */}
            {success && <div className="p-4 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-300 text-sm">{success}</div>}
            {error && <div className="p-4 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 text-sm">{error}</div>}

            {/* Table */}
            <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-white/5">
                            <tr>
                                <th className="table-header">Código</th>
                                <th className="table-header">Saldo</th>
                                <th className="table-header">Original</th>
                                <th className="table-header">Estado</th>
                                <th className="table-header">Cliente</th>
                                <th className="table-header">Expiración</th>
                                <th className="table-header">Notas</th>
                                <th className="table-header text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {credits.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="table-cell text-center text-slate-400 py-12">
                                        No hay códigos de crédito creados aún
                                    </td>
                                </tr>
                            ) : credits.map(c => (
                                <tr key={c.id} className="hover:bg-white/5 transition-colors">
                                    <td className="table-cell">
                                        <span className="font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 text-xs">
                                            {c.code}
                                        </span>
                                    </td>
                                    <td className="table-cell font-bold text-white">
                                        ${Number(c.balance).toFixed(2)}
                                    </td>
                                    <td className="table-cell text-slate-400 text-sm">
                                        ${Number(c.original_balance).toFixed(2)}
                                    </td>
                                    <td className="table-cell">
                                        <StatusBadge status={c.status} />
                                    </td>
                                    <td className="table-cell text-slate-300 text-sm">
                                        {c.cliente_nombre ? `${c.cliente_nombre} ${c.cliente_apellido}` : <span className="text-slate-500">—</span>}
                                    </td>
                                    <td className="table-cell text-slate-400 text-sm">
                                        {c.expiration_date ? new Date(c.expiration_date).toLocaleDateString('es-MX') : <span className="text-slate-500">Nunca</span>}
                                    </td>
                                    <td className="table-cell text-slate-400 text-sm max-w-[140px] truncate">
                                        {c.notes || <span className="text-slate-600">—</span>}
                                    </td>
                                    <td className="table-cell text-right">
                                        <div className="flex justify-end gap-1">
                                            <button
                                                onClick={() => setUsesModal(c)}
                                                title="Ver historial"
                                                className="p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => openEdit(c)}
                                                title="Editar"
                                                className="p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => setDeleteConfirm(c)}
                                                title="Eliminar"
                                                className="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-slate-400 hover:text-red-400"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

            {/* Form Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={resetForm}>
                    <div className="glass-card p-6 w-full max-w-md animate-slide-up" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-semibold mb-6">{editing ? 'Editar Crédito' : 'Nuevo Crédito de Tienda'}</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {!editing && (
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Código (opcional — se genera automáticamente)</label>
                                    <input
                                        type="text"
                                        value={form.code}
                                        onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                                        className="input-glass"
                                        placeholder="CR-XXXX-XXXX"
                                        autoComplete="off"
                                    />
                                </div>
                            )}
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Saldo (MXN)</label>
                                <input
                                    type="number"
                                    value={form.balance}
                                    onChange={e => setForm({ ...form, balance: e.target.value })}
                                    className="input-glass"
                                    placeholder="500.00"
                                    required
                                    min="1"
                                    step="0.01"
                                />
                            </div>
                            {editing && (
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Estado</label>
                                    <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="input-glass">
                                        <option value="active">Activo</option>
                                        <option value="disabled">Inactivo</option>
                                        <option value="expired">Expirado</option>
                                    </select>
                                </div>
                            )}
                            {/* Asignar a cliente por número */}
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Número de Cliente (Opcional)</label>
                                <input
                                    type="text"
                                    value={form.cliente_search}
                                    onChange={e => {
                                        setForm({ ...form, cliente_search: e.target.value, cliente_id: null });
                                        setClienteLookup(null);
                                        setClienteLookupError('');
                                    }}
                                    onBlur={e => lookupCliente(e.target.value)}
                                    className="input-glass"
                                    placeholder="Ej. BS-4921"
                                    autoComplete="off"
                                />
                                {clienteLookup && (
                                    <div className="mt-2 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2">
                                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                            {clienteLookup.nombre.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-white">{clienteLookup.nombre} {clienteLookup.apellido}</p>
                                            <p className="text-xs text-slate-400">{clienteLookup.email}</p>
                                        </div>
                                    </div>
                                )}
                                {clienteLookupError && (
                                    <p className="mt-1.5 text-xs text-red-400">{clienteLookupError}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Fecha de Expiración (Opcional)</label>
                                <input
                                    type="date"
                                    value={form.expiration_date}
                                    onChange={e => setForm({ ...form, expiration_date: e.target.value })}
                                    className="input-glass"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Notas (Opcional)</label>
                                <input
                                    type="text"
                                    value={form.notes}
                                    onChange={e => setForm({ ...form, notes: e.target.value })}
                                    className="input-glass"
                                    placeholder="Ej. Regalo para cliente VIP"
                                />
                            </div>
                            {error && <p className="text-red-400 text-sm">{error}</p>}
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={resetForm} className="flex-1 btn-secondary">Cancelar</button>
                                <button type="submit" className="flex-1 btn-primary">{editing ? 'Guardar Cambios' : 'Crear Crédito'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirm */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="glass-card p-6 w-full max-w-md animate-slide-up">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="p-3 bg-red-500/20 rounded-full">
                                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-semibold">¿Eliminar crédito?</h3>
                        </div>
                        <p className="text-slate-300 mb-6">
                            Vas a eliminar el código <span className="font-mono font-bold text-white">{deleteConfirm.code}</span> con saldo de <span className="font-bold text-emerald-400">${Number(deleteConfirm.balance).toFixed(2)} MXN</span>. Esta acción no se puede deshacer.
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleteConfirm(null)} className="flex-1 btn-secondary">Cancelar</button>
                            <button onClick={() => handleDelete(deleteConfirm.id)} className="flex-1 btn-danger">Eliminar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Uses Modal */}
            {usesModal && <UsesModal credit={usesModal} token={token} onClose={() => setUsesModal(null)} />}
        </div>
    );
}
