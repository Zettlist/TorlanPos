import { useState, useEffect } from 'react';
import { API_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';

export default function CouponsManager() {
    const { token } = useAuth();
    const [coupons, setCoupons] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingCoupon, setEditingCoupon] = useState(null);
    const [formData, setFormData] = useState({
        code: '',
        discount_type: 'percentage',
        discount_value: '',
        status: 'active',
        expiration_date: '',
        usage_limit: ''
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    useEffect(() => {
        fetchCoupons();
    }, []);

    const fetchCoupons = async () => {
        try {
            const response = await fetch(`${API_URL}/coupons`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setCoupons(data);
            }
        } catch (error) {
            console.error('Error fetching coupons:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        const url = editingCoupon ? `${API_URL}/coupons/${editingCoupon.id}` : `${API_URL}/coupons`;
        const method = editingCoupon ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Error al guardar cupón');
            }

            setSuccess(editingCoupon ? 'Cupón actualizado exitosamente' : 'Cupón creado exitosamente');
            resetForm();
            fetchCoupons();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleDelete = async (couponId) => {
        try {
            const response = await fetch(`${API_URL}/coupons/${couponId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Error al eliminar cupón');
            }

            setSuccess('Cupón eliminado exitosamente');
            setDeleteConfirm(null);
            fetchCoupons();
        } catch (err) {
            setError(err.message);
            setDeleteConfirm(null);
        }
    };

    const resetForm = () => {
        setFormData({
            code: '',
            discount_type: 'percentage',
            discount_value: '',
            status: 'active',
            expiration_date: '',
            usage_limit: ''
        });
        setEditingCoupon(null);
        setShowForm(false);
    };

    const openEdit = (coupon) => {
        setEditingCoupon(coupon);
        setFormData({
            code: coupon.code,
            discount_type: coupon.discount_type,
            discount_value: coupon.discount_value,
            status: coupon.status,
            expiration_date: coupon.expiration_date ? coupon.expiration_date.split('T')[0] : '',
            usage_limit: coupon.usage_limit || ''
        });
        setShowForm(true);
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
                    <h1 className="text-2xl font-bold text-white">Gestión de Cupones</h1>
                    <p className="text-slate-400">{coupons.length} cupones activos/inactivos</p>
                </div>
                <button
                    onClick={() => {
                        resetForm();
                        setShowForm(true);
                        setError('');
                        setSuccess('');
                    }}
                    className="btn-primary flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Nuevo Cupón
                </button>
            </div>

            {/* Success/Error Alerts */}
            {success && (
                <div className="p-4 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-300 animate-fade-in flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {success}
                </div>
            )}
            {error && (
                <div className="p-4 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 animate-fade-in flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                </div>
            )}

            {/* Coupons Table */}
            <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-white/5">
                            <tr>
                                <th className="table-header">Código</th>
                                <th className="table-header">Descuento</th>
                                <th className="table-header">Estado</th>
                                <th className="table-header">Usos</th>
                                <th className="table-header">Expiración</th>
                                <th className="table-header text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {coupons.map(c => (
                                <tr key={c.id} className="hover:bg-white/5 transition-colors">
                                    <td className="table-cell">
                                        <span className="font-mono font-bold text-primary-400 bg-primary-500/10 px-2 py-1 rounded border border-primary-500/20">
                                            {c.code}
                                        </span>
                                    </td>
                                    <td className="table-cell text-white">
                                        {c.discount_type === 'percentage' 
                                            ? `${parseFloat(c.discount_value)}%` 
                                            : `$${parseFloat(c.discount_value)} MXN`}
                                    </td>
                                    <td className="table-cell">
                                        {c.status === 'active' ? (
                                            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-xs font-medium">Activo</span>
                                        ) : (
                                            <span className="px-3 py-1 bg-slate-500/20 text-slate-400 rounded-full text-xs font-medium">Inactivo</span>
                                        )}
                                    </td>
                                    <td className="table-cell text-slate-300">
                                        {c.usage_count} / {c.usage_limit || '∞'}
                                    </td>
                                    <td className="table-cell text-slate-400 text-sm">
                                        {c.expiration_date ? new Date(c.expiration_date).toLocaleDateString() : 'Nunca'}
                                    </td>
                                    <td className="table-cell text-right">
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => openEdit(c)} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white">
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                </svg>
                                            </button>
                                            <button onClick={() => setDeleteConfirm(c)} className="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-slate-400 hover:text-red-400">
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

            {/* Form Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="glass-card p-6 w-full max-w-md animate-slide-up">
                        <h2 className="text-xl font-semibold mb-6">{editingCoupon ? 'Editar Cupón' : 'Nuevo Cupón'}</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Código del Cupón</label>
                                <input
                                    type="text"
                                    value={formData.code}
                                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                    className="input-glass"
                                    placeholder="Ej. BISONTE10"
                                    required
                                    autoComplete="off"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Tipo</label>
                                    <select
                                        value={formData.discount_type}
                                        onChange={(e) => setFormData({ ...formData, discount_type: e.target.value })}
                                        className="input-glass"
                                    >
                                        <option value="percentage">Porcentaje (%)</option>
                                        <option value="fixed">Fijo ($)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Valor</label>
                                    <input
                                        type="number"
                                        value={formData.discount_value}
                                        onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                                        className="input-glass"
                                        placeholder={formData.discount_type === 'percentage' ? '10' : '50.00'}
                                        required
                                        min="0"
                                        step="any"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Estado</label>
                                    <select
                                        value={formData.status}
                                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                        className="input-glass"
                                    >
                                        <option value="active">Activo</option>
                                        <option value="inactive">Inactivo</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Límite de Usos (Opcional)</label>
                                    <input
                                        type="number"
                                        value={formData.usage_limit}
                                        onChange={(e) => setFormData({ ...formData, usage_limit: e.target.value })}
                                        className="input-glass"
                                        placeholder="∞"
                                        min="1"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Fecha de Expiración (Opcional)</label>
                                <input
                                    type="date"
                                    value={formData.expiration_date}
                                    onChange={(e) => setFormData({ ...formData, expiration_date: e.target.value })}
                                    className="input-glass"
                                />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={resetForm} className="flex-1 btn-secondary">Cancelar</button>
                                <button type="submit" className="flex-1 btn-primary">Guardar Cupón</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="glass-card p-6 w-full max-w-md animate-slide-up">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="p-3 bg-red-500/20 rounded-full">
                                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-semibold text-white">¿Eliminar cupón?</h3>
                        </div>
                        <p className="text-slate-300 mb-6">Estás a punto de eliminar el cupón <span className="font-bold text-white">"{deleteConfirm.code}"</span>. Esta acción no se puede deshacer.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleteConfirm(null)} className="flex-1 btn-secondary">No, cancelar</button>
                            <button onClick={() => handleDelete(deleteConfirm.id)} className="flex-1 btn-danger">Sí, eliminar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
