import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function ChangePassword() {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { changePassword, user } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (newPassword !== confirmPassword) {
            setError('Las contraseñas no coinciden');
            return;
        }

        if (newPassword.length < 4) {
            setError('La contraseña debe tener al menos 4 caracteres');
            return;
        }

        setLoading(true);

        try {
            await changePassword(null, newPassword);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/3 -left-20 w-80 h-80 bg-amber-500/20 rounded-full blur-3xl"></div>
                <div className="absolute bottom-1/3 -right-20 w-80 h-80 bg-primary-500/20 rounded-full blur-3xl"></div>
            </div>

            <div className="w-full max-w-md relative">
                {/* Icon and Title */}
                <div className="text-center mb-8 animate-fade-in">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-2xl shadow-amber-500/30 mb-6">
                        <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-bold text-white">
                        Cambiar Contraseña
                    </h1>
                    <p className="text-slate-400 mt-2">
                        Bienvenido, <span className="text-primary-400 font-medium">{user?.username}</span>
                    </p>
                    <p className="text-amber-400 text-sm mt-1">
                        Por seguridad, debes cambiar tu contraseña inicial
                    </p>
                </div>

                {/* Form */}
                <div className="glass-card p-8 animate-slide-up">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div className="p-4 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 text-sm animate-fade-in">
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                Nueva Contraseña
                            </label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="input-glass"
                                placeholder="••••••••"
                                required
                                autoFocus
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                Confirmar Contraseña
                            </label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="input-glass"
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full btn-primary flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                                    Actualizando...
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Guardar Nueva Contraseña
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
