import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

// Use hardcoded URL for production to avoid env var issues
const API_URL = import.meta.env.PROD
    ? 'https://pos-torlan.uc.r.appspot.com/api'
    : 'http://localhost:3000/api';

export default function EmpresaManager() {
    const { token, user, isGlobalAdmin } = useAuth();
    const [empresas, setEmpresas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [selectedEmpresa, setSelectedEmpresa] = useState(null);
    const [filter, setFilter] = useState({ estado: '', plan: '' });
    const [activeMenu, setActiveMenu] = useState(null);
    const [adminData, setAdminData] = useState({ username: '', password: '' });
    const [showAdminModal, setShowAdminModal] = useState(false);
    const [showPurgeModal, setShowPurgeModal] = useState(false);
    const [purgeConfirmName, setPurgeConfirmName] = useState('');

    const [formData, setFormData] = useState({
        nombre_empresa: '',
        plan_contratado: 'Basico',
        max_usuarios: 5,
        max_productos: 100,
        billing_cycle_date: '',
        notas: ''
    });

    useEffect(() => {
        fetchEmpresas();

        // Close menu when clicking outside
        const handleClickOutside = (event) => {
            if (activeMenu && !event.target.closest('.action-menu-container')) {
                setActiveMenu(null);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeMenu]);

    const fetchEmpresas = async () => {
        try {
            const response = await fetch(`${API_URL}/empresas`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setEmpresas(data);
            }
        } catch (error) {
            console.error('Error fetching empresas:', error);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setSelectedEmpresa(null);
        setFormData({
            nombre_empresa: '',
            plan_contratado: 'Basico',
            max_usuarios: 5,
            max_productos: 100,
            billing_cycle_date: '',
            notas: ''
        });
        setError('');
        setSuccess('');
    };

    const openEditModal = (empresa) => {
        setSelectedEmpresa(empresa);
        setFormData({
            nombre_empresa: empresa.nombre_empresa,
            plan_contratado: empresa.plan_contratado,
            max_usuarios: empresa.max_usuarios,
            max_productos: empresa.max_productos,
            billing_cycle_date: empresa.billing_cycle_date || '',
            notas: empresa.notas || ''
        });
        setShowModal(true);
    };

    const handlePlanChange = (e) => {
        const plan = e.target.value;
        const defaults = {
            'Basico': { users: 5, products: 100 },
            'Prueba': { users: 5, products: 100 },
            'Premium': { users: 15, products: 1000 },
            'Empresarial': { users: 50, products: 5000 }
        };

        setFormData(prev => ({
            ...prev,
            plan_contratado: plan,
            max_usuarios: defaults[plan]?.users || prev.max_usuarios,
            max_productos: defaults[plan]?.products || prev.max_productos
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSubmitting(true);

        try {
            const url = selectedEmpresa
                ? `${API_URL}/empresas/${selectedEmpresa.id}`
                : `${API_URL}/empresas`;

            const response = await fetch(url, {
                method: selectedEmpresa ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.ok) {
                setSuccess(data.message);
                setShowModal(false);
                resetForm();
                fetchEmpresas();
                setTimeout(() => setSuccess(''), 3000);
            } else {
                setError(data.error || `Error del servidor: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            console.error('Submit error:', error);
            setError(`Error de conexión: ${error.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    // ... (keep existing functions)



    const handleSuspend = async (empresa) => {
        if (!confirm(`¿Suspender la empresa "${empresa.nombre_empresa}"? Los usuarios no podrán acceder al sistema.`)) {
            return;
        }

        try {
            const response = await fetch(`${API_URL}/empresas/${empresa.id}/suspend`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ motivo: 'Suspensión manual desde panel admin' })
            });

            const data = await response.json();

            if (response.ok) {
                setSuccess(data.message);
                fetchEmpresas();
                setTimeout(() => setSuccess(''), 3000);
            } else {
                setError(data.error);
            }
        } catch (error) {
            setError('Error al suspender empresa');
        }
    };

    const handleActivate = async (empresa) => {
        try {
            const response = await fetch(`${API_URL}/empresas/${empresa.id}/activate`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();

            if (response.ok) {
                setSuccess(data.message);
                fetchEmpresas();
                setTimeout(() => setSuccess(''), 3000);
            } else {
                setError(data.error);
            }
        } catch (error) {
            setError('Error al activar empresa');
        }
    };

    const handlePurge = async (e) => {
        e.preventDefault();

        if (purgeConfirmName !== selectedEmpresa.nombre_empresa) {
            setError('El nombre de la empresa no coincide');
            return;
        }

        try {
            const response = await fetch(`${API_URL}/empresas/${selectedEmpresa.id}/purge`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ confirmName: purgeConfirmName })
            });

            const data = await response.json();

            if (response.ok) {
                setSuccess(data.message);
                setShowPurgeModal(false);
                setPurgeConfirmName('');
                setSelectedEmpresa(null);
                fetchEmpresas();
                setTimeout(() => setSuccess(''), 3000);
            } else {
                setError(data.error);
            }
        } catch (error) {
            setError('Error al eliminar empresa permanentemente');
        }
    };

    const handleCreateAdmin = async (e) => {
        e.preventDefault();
        setError('');

        try {
            const response = await fetch(`${API_URL}/empresas/${selectedEmpresa.id}/admin`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(adminData)
            });

            const data = await response.json();

            if (response.ok) {
                setSuccess(data.message);
                setShowAdminModal(false);
                setAdminData({ username: '', password: '' });
                fetchEmpresas();
                setTimeout(() => setSuccess(''), 3000);
            } else {
                setError(data.error);
            }
        } catch (error) {
            setError('Error al crear administrador');
        }
    };

    const openAdminModal = (empresa) => {
        setSelectedEmpresa(empresa);
        setAdminData({ username: '', password: '' });
        setShowAdminModal(true);
    };

    const openPurgeModal = (empresa) => {
        setSelectedEmpresa(empresa);
        setPurgeConfirmName('');
        setShowPurgeModal(true);
    };

    const getEstadoBadge = (estado) => {
        const colors = {
            'Activo': 'bg-green-500/20 text-green-300 border border-green-500/30',
            'Suspendido': 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',
            'Baja': 'bg-red-500/20 text-red-300 border border-red-500/30'
        };
        return colors[estado] || 'bg-slate-700 text-slate-300';
    };

    const getPlanBadge = (plan) => {
        const colors = {
            'Basico': 'bg-slate-700 text-slate-300',
            'Premium': 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
            'Empresarial': 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
        };
        return colors[plan] || 'bg-slate-700 text-slate-300';
    };

    if (!isGlobalAdmin()) {
        return (
            <div className="p-6">
                <div className="bg-red-500/20 text-red-300 border border-red-500/30 p-4 rounded-lg">
                    Acceso denegado. Solo TorlanAdmin puede acceder a esta sección.
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 h-full overflow-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">Gestión de Empresas</h1>
                    <p className="text-slate-400">Panel de administración de clientes SaaS</p>
                </div>
                <button
                    onClick={() => { resetForm(); setShowModal(true); }}
                    className="btn-primary flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Nueva Empresa
                </button>
            </div>

            {/* Alerts */}
            {error && (
                <div className="bg-red-500/20 text-red-300 border border-red-500/30 p-4 rounded-lg mb-4">
                    {error}
                    <button onClick={() => setError('')} className="float-right hover:text-white">&times;</button>
                </div>
            )}
            {success && (
                <div className="bg-green-500/20 text-green-300 border border-green-500/30 p-4 rounded-lg mb-4">
                    {success}
                </div>
            )}

            {/* Filters */}
            <div className="glass-card-dark p-4 mb-6 flex gap-4">
                <select
                    value={filter.estado}
                    onChange={(e) => setFilter({ ...filter, estado: e.target.value })}
                    className="input-dark w-48"
                >
                    <option value="">Todos los estados</option>
                    <option value="Activo">Activo</option>
                    <option value="Suspendido">Suspendido</option>
                    <option value="Baja">Baja</option>
                </select>
                <select
                    value={filter.plan}
                    onChange={(e) => setFilter({ ...filter, plan: e.target.value })}
                    className="input-dark w-48"
                >
                    <option value="">Todos los planes</option>
                    <option value="Basico">Básico</option>
                    <option value="Prueba">Prueba</option>
                    <option value="Premium">Premium</option>
                    <option value="Empresarial">Empresarial</option>
                </select>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="glass-card-dark p-4">
                    <p className="text-slate-400 text-sm">Total Empresas</p>
                    <p className="text-2xl font-bold text-white">{empresas.length}</p>
                </div>
                <div className="glass-card-dark p-4">
                    <p className="text-slate-400 text-sm">Activas</p>
                    <p className="text-2xl font-bold text-green-400">
                        {empresas.filter(e => e.estado === 'Activo').length}
                    </p>
                </div>
                <div className="glass-card-dark p-4">
                    <p className="text-slate-400 text-sm">Suspendidas</p>
                    <p className="text-2xl font-bold text-yellow-400">
                        {empresas.filter(e => e.estado === 'Suspendido').length}
                    </p>
                </div>
                <div className="glass-card-dark p-4">
                    <p className="text-slate-400 text-sm">Premium+</p>
                    <p className="text-2xl font-bold text-blue-400">
                        {empresas.filter(e => e.plan_contratado !== 'Basico').length}
                    </p>
                </div>
            </div>

            {/* Table */}
            <div className="glass-card-dark overflow-hidden min-h-[400px]">
                <table className="w-full">
                    <thead className="bg-white/5">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Empresa</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Plan</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Estado</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Usuarios</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Productos</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Registro</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {loading ? (
                            <tr>
                                <td colSpan="7" className="px-6 py-4 text-center text-slate-400">Cargando...</td>
                            </tr>
                        ) : empresas.length === 0 ? (
                            <tr>
                                <td colSpan="7" className="px-6 py-4 text-center text-slate-500">
                                    No hay empresas registradas
                                </td>
                            </tr>
                        ) : empresas.map(empresa => (
                            <tr key={empresa.id} className="hover:bg-white/5 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="font-medium text-white">{empresa.nombre_empresa}</div>
                                    <div className="text-sm text-slate-500">ID: {empresa.id}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 text-xs rounded-full ${getPlanBadge(empresa.plan_contratado)}`}>
                                        {empresa.plan_contratado}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 text-xs rounded-full ${getEstadoBadge(empresa.estado)}`}>
                                        {empresa.estado}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-sm text-slate-300">
                                        {empresa.total_usuarios || 0} / {empresa.max_usuarios}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-sm text-slate-300">
                                        {empresa.total_productos || 0} / {empresa.max_productos}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-slate-400">
                                    {new Date(empresa.fecha_registro).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="relative action-menu-container">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveMenu(activeMenu === empresa.id ? null : empresa.id);
                                            }}
                                            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"
                                        >
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                            </svg>
                                        </button>

                                        {activeMenu === empresa.id && (
                                            <div className="absolute right-0 mt-2 w-56 glass-card-dark border border-slate-700 rounded-lg shadow-xl z-10 animate-fade-in overflow-hidden">
                                                <button
                                                    onClick={() => openEditModal(empresa)}
                                                    className="w-full text-left px-4 py-3 hover:bg-white/10 flex items-center gap-3 text-sm text-slate-300 hover:text-white"
                                                >
                                                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                    Editar Empresa
                                                </button>
                                                <button
                                                    onClick={() => openAdminModal(empresa)}
                                                    className="w-full text-left px-4 py-3 hover:bg-white/10 flex items-center gap-3 text-sm text-slate-300 hover:text-white"
                                                >
                                                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                                    </svg>
                                                    Crear Admin
                                                </button>
                                                {empresa.estado === 'Activo' ? (
                                                    <button
                                                        onClick={() => handleSuspend(empresa)}
                                                        className="w-full text-left px-4 py-3 hover:bg-white/10 flex items-center gap-3 text-sm text-slate-300 hover:text-white"
                                                    >
                                                        <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        Suspender
                                                    </button>
                                                ) : empresa.estado === 'Suspendido' ? (
                                                    <button
                                                        onClick={() => handleActivate(empresa)}
                                                        className="w-full text-left px-4 py-3 hover:bg-white/10 flex items-center gap-3 text-sm text-slate-300 hover:text-white"
                                                    >
                                                        <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        Reactivar
                                                    </button>
                                                ) : null}
                                                <div className="border-t border-slate-700 my-1"></div>
                                                <button
                                                    onClick={() => openPurgeModal(empresa)}
                                                    className="w-full text-left px-4 py-3 hover:bg-red-500/10 flex items-center gap-3 text-sm text-red-400 hover:text-red-300"
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                    Eliminar Permanentemente
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="glass-card-dark w-full max-w-md p-6 border border-slate-700">
                        <h2 className="text-xl font-bold mb-4 text-white">
                            {selectedEmpresa ? 'Editar Empresa' : 'Nueva Empresa'}
                        </h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">
                                    Nombre de Empresa
                                </label>
                                <input
                                    type="text"
                                    value={formData.nombre_empresa}
                                    onChange={(e) => setFormData({ ...formData, nombre_empresa: e.target.value })}
                                    required
                                    className="input-dark"
                                    placeholder="Ej. Mi Tienda"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">
                                    Plan
                                </label>
                                <select
                                    value={formData.plan_contratado}
                                    onChange={handlePlanChange}
                                    className="input-dark"
                                >
                                    <option value="Basico">Básico</option>
                                    <option value="Prueba">Prueba</option>
                                    <option value="Premium">Premium</option>
                                    <option value="Empresarial">Empresarial</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">
                                    Fecha de Facturación (Día del mes)
                                </label>
                                <input
                                    type="date"
                                    value={formData.billing_cycle_date}
                                    onChange={(e) => setFormData({ ...formData, billing_cycle_date: e.target.value })}
                                    className="input-dark"
                                    placeholder="Seleccionar fecha"
                                />
                                <p className="text-xs text-slate-500 mt-1">Se usará el día del mes para el ciclo de cobro.</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">
                                        Máx. Usuarios
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.max_usuarios}
                                        onChange={(e) => setFormData({ ...formData, max_usuarios: parseInt(e.target.value) })}
                                        min="1"
                                        className="input-dark"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">
                                        Máx. Productos
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.max_productos}
                                        onChange={(e) => setFormData({ ...formData, max_productos: parseInt(e.target.value) })}
                                        min="1"
                                        className="input-dark"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">
                                    Notas
                                </label>
                                <textarea
                                    value={formData.notas}
                                    onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                                    rows="3"
                                    className="input-dark"
                                    placeholder="Notas opcionales..."
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    disabled={submitting}
                                    className="px-4 py-2 text-slate-300 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {submitting && (
                                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    )}
                                    {selectedEmpresa ? 'Guardar Cambios' : 'Crear Empresa'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Create Admin Modal */}
            {showAdminModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="glass-card-dark w-full max-w-md p-6 border border-slate-700">
                        <h2 className="text-xl font-bold mb-4 text-white">
                            Crear Administrador para {selectedEmpresa?.nombre_empresa}
                        </h2>
                        <form onSubmit={handleCreateAdmin} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">
                                    Nombre de Usuario
                                </label>
                                <input
                                    type="text"
                                    value={adminData.username}
                                    onChange={(e) => setAdminData({ ...adminData, username: e.target.value })}
                                    required
                                    className="input-dark"
                                    placeholder="Usuario admin"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">
                                    Contraseña
                                </label>
                                <input
                                    type="password"
                                    value={adminData.password}
                                    onChange={(e) => setAdminData({ ...adminData, password: e.target.value })}
                                    required
                                    minLength="4"
                                    className="input-dark"
                                    placeholder="••••••••"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowAdminModal(false)}
                                    className="px-4 py-2 text-slate-300 hover:bg-white/10 rounded-lg transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 shadow-lg shadow-green-600/20"
                                >
                                    Crear Administrador
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Purge Confirmation Modal */}
            {showPurgeModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="glass-card-dark w-full max-w-md p-6 border border-red-500/30 shadow-2xl shadow-red-500/10">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="p-3 bg-red-500/20 rounded-full">
                                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">¿Eliminar Permanentemente?</h2>
                                <p className="text-red-400 text-sm font-medium">ESTA ACCIÓN ES IRREVERSIBLE</p>
                            </div>
                        </div>

                        <p className="text-slate-300 mb-4">
                            Estás a punto de eliminar la empresa <span className="font-bold text-white">"{selectedEmpresa?.nombre_empresa}"</span>.
                        </p>

                        <div className="bg-red-500/10 p-4 rounded-lg border border-red-500/20 mb-6">
                            <p className="text-sm text-red-200 mb-2 font-medium">Se eliminarán permanentemente:</p>
                            <ul className="list-disc list-inside text-sm text-red-300/80 space-y-1">
                                <li>Todos los usuarios y permisos</li>
                                <li>Todo el inventario y productos</li>
                                <li>Historial completo de ventas</li>
                                <li>Configuraciones y sesiones de caja</li>
                            </ul>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm text-slate-400 mb-2">
                                Escribe el nombre de la empresa para confirmar:
                            </label>
                            <input
                                type="text"
                                value={purgeConfirmName}
                                onChange={(e) => setPurgeConfirmName(e.target.value)}
                                className="input-dark w-full border-red-500/30 focus:border-red-500"
                                placeholder={selectedEmpresa?.nombre_empresa}
                            />
                        </div>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowPurgeModal(false)}
                                className="px-4 py-2 text-slate-300 hover:bg-white/10 rounded-lg transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handlePurge}
                                disabled={purgeConfirmName !== selectedEmpresa?.nombre_empresa}
                                className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 shadow-lg shadow-red-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Confirmar Eliminación
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
