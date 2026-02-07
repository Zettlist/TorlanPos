import { useState, useEffect } from 'react';
import { API_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';
import { Navigate } from 'react-router-dom';

export default function UserManager() {
    const { user, token, isGlobalAdmin } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ username: '', password: '', confirmPassword: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    // Redirect non-admins
    if (!user?.is_admin) {
        return <Navigate to="/" replace />;
    }

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const response = await fetch(`${API_URL}/features/users`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setUsers(data.users);
            }
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (formData.password !== formData.confirmPassword) {
            setError('Las contraseñas no coinciden');
            return;
        }

        if (formData.password.length < 4) {
            setError('La contraseña debe tener al menos 4 caracteres');
            return;
        }

        if (formData.username.length < 3) {
            setError('El nombre de usuario debe tener al menos 3 caracteres');
            return;
        }

        try {
            const response = await fetch(`${API_URL}/features/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    username: formData.username,
                    employee_number: formData.employee_number,
                    password: formData.password
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Error al crear usuario');
            }

            setSuccess(`Usuario "${formData.username}" creado exitosamente`);
            setFormData({ username: '', password: '', confirmPassword: '' });
            setShowForm(false);
            setShowPassword(false);
            setShowConfirmPassword(false);
            fetchUsers();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleDelete = async (userId, username) => {
        try {
            const response = await fetch(`${API_URL}/features/users/${userId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Error al eliminar usuario');
            }

            setSuccess(data.message);
            setDeleteConfirm(null);
            fetchUsers();
        } catch (err) {
            setError(err.message);
            setDeleteConfirm(null);
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
                    <h1 className="text-2xl font-bold">Gestión de Usuarios</h1>
                    <p className="text-slate-400">{users.length} usuarios registrados</p>
                </div>
                <button
                    onClick={() => {
                        setShowForm(true);
                        setError('');
                        setSuccess('');
                    }}
                    className="btn-primary flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    Nuevo Empleado
                </button>
            </div>

            {/* Success Message */}
            {success && (
                <div className="p-4 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-300 animate-fade-in">
                    <div className="flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {success}
                    </div>
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div className="p-4 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 animate-fade-in">
                    <div className="flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {error}
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="glass-card p-6 w-full max-w-md animate-slide-up">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="p-3 bg-red-500/20 rounded-full">
                                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold">¿Eliminar usuario?</h3>
                                <p className="text-slate-400 text-sm">
                                    Esta acción no se puede deshacer.
                                </p>
                            </div>
                        </div>
                        <p className="text-slate-300 mb-6">
                            Estás a punto de eliminar al usuario <span className="font-semibold text-white">"{deleteConfirm.username}"</span>.
                            Se eliminarán todos sus datos y permisos.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 btn-secondary"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleDelete(deleteConfirm.id, deleteConfirm.username)}
                                className="flex-1 btn-danger"
                            >
                                Eliminar Usuario
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* New User Form Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="glass-card p-6 w-full max-w-md animate-slide-up">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-semibold">Registrar nuevo empleado</h2>
                            <button
                                onClick={() => {
                                    setShowForm(false);
                                    setShowPassword(false);
                                    setShowConfirmPassword(false);
                                }}
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {error && (
                            <div className="mb-4 p-4 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 text-sm">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">
                                    Nombre de empleado
                                </label>
                                <input
                                    type="text"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    className="input-glass"
                                    placeholder=""
                                    required
                                    autoFocus
                                    autoComplete="off"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-slate-400 mb-1">
                                    Número de Empleado (Opcional - Auto si vacío)
                                </label>
                                <input
                                    type="text"
                                    value={formData.employee_number || ''}
                                    onChange={(e) => setFormData({ ...formData, employee_number: e.target.value })}
                                    className="input-glass"
                                    placeholder="Ej. 84920 (5 dígitos)"
                                    autoComplete="off"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-slate-400 mb-1">
                                    Contraseña
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        className="input-glass pr-12"
                                        placeholder="••••••••"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white transition-colors"
                                        title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                                    >
                                        {showPassword ? (
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                            </svg>
                                        ) : (
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-slate-400 mb-1">
                                    Confirmar Contraseña
                                </label>
                                <div className="relative">
                                    <input
                                        type={showConfirmPassword ? "text" : "password"}
                                        value={formData.confirmPassword}
                                        onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                        className="input-glass pr-12"
                                        placeholder="••••••••"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white transition-colors"
                                        title={showConfirmPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                                    >
                                        {showConfirmPassword ? (
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                            </svg>
                                        ) : (
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>

                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mt-4">
                                <div className="flex items-start gap-3">
                                    <svg className="w-5 h-5 text-amber-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <div className="text-sm text-amber-200">
                                        <p className="font-medium">Nota:</p>
                                        <p className="text-amber-300/80">El usuario deberá cambiar su contraseña en el primer inicio de sesión.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowForm(false);
                                        setShowPassword(false);
                                        setShowConfirmPassword(false);
                                    }}
                                    className="flex-1 btn-secondary"
                                >
                                    Cancelar
                                </button>
                                <button type="submit" className="flex-1 btn-primary">
                                    Crear nuevo empleado
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Users Table */}
            <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-white/5">
                            <tr>
                                <th className="table-header">Usuario</th>
                                <th className="table-header">No. Empleado</th>
                                <th className="table-header">Rol</th>
                                <th className="table-header">Estado</th>
                                <th className="table-header">Fecha de Registro</th>
                                <th className="table-header text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {users.map(u => (
                                <tr key={u.id} className="hover:bg-white/5 transition-colors">
                                    <td className="table-cell">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${u.is_admin
                                                ? 'bg-gradient-to-br from-amber-500 to-orange-500'
                                                : 'bg-gradient-to-br from-primary-500 to-accent-500'
                                                }`}>
                                                {u.username.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-medium flex items-center gap-2">
                                                    {u.username}
                                                </p>
                                                {u.nombre_empresa && (
                                                    <span className="text-[10px] uppercase tracking-wider bg-slate-700/50 text-slate-300 px-1.5 py-0.5 rounded border border-slate-600/50">
                                                        {u.nombre_empresa}
                                                    </span>
                                                )}
                                                {u.id === user.id && (
                                                    <p className="text-xs text-primary-400">(Tú)</p>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="table-cell font-mono text-slate-300">
                                        {u.employee_number || '-'}
                                    </td>
                                    <td className="table-cell">
                                        {u.is_admin ? (
                                            <span className="px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-xs font-medium">
                                                Gerente de Empresa
                                            </span>
                                        ) : (
                                            <span className="px-3 py-1 bg-primary-500/20 text-primary-400 rounded-full text-xs font-medium">
                                                Empleado
                                            </span>
                                        )}
                                    </td>
                                    <td className="table-cell">
                                        {u.first_login ? (
                                            <span className="flex items-center gap-2 text-amber-400">
                                                <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
                                                Pendiente (primer login)
                                            </span>
                                        ) : u.has_setup_complete ? (
                                            <span className="flex items-center gap-2 text-emerald-400">
                                                <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
                                                Activo
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-2 text-blue-400">
                                                <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                                                Setup pendiente
                                            </span>
                                        )}
                                    </td>
                                    <td className="table-cell text-slate-400">
                                        {u.created_at ? new Date(u.created_at).toLocaleDateString('es-MX') : '-'}
                                    </td>
                                    <td className="table-cell text-right">
                                        {/* Show delete button based on hierarchy:
                                            - TorlanAdmin can delete anyone except global_admin
                                            - Gerente can only delete employees (role check in backend)
                                            - Never show delete for self or global_admin users
                                        */}
                                        {u.id !== user.id && u.role !== 'global_admin' && (
                                            (isGlobalAdmin() || (!u.is_admin && u.role === 'employee')) && (
                                                <button
                                                    onClick={() => setDeleteConfirm({ id: u.id, username: u.username, role: u.role })}
                                                    className="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-slate-400 hover:text-red-400"
                                                    title="Eliminar usuario"
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            )
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
