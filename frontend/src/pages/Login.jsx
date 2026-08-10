import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Login — vocabulario impreso "Bisonte".
 *
 * El resto del POS usa la direccion "Mostrador": neutra, de alto contraste y
 * sin adorno, porque se opera contra reloj. Aqui nadie esta cobrando, asi que
 * es donde la marca puede aparecer sin costar velocidad: tinta plana sobre
 * papel, trama de semitono y sombra desplazada como registro de impresion mal
 * alineado — el lenguaje del manga que la tienda vende.
 */
export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(username, password);
            navigate('/');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen paper-surface flex items-center justify-center p-4">
            <div className="w-full max-w-md">

                <header className="mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-paper-ink flex items-center justify-center flex-shrink-0">
                            <svg className="w-7 h-7 text-paper" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="paper-title text-3xl leading-none">Torlan POS</h1>
                            <p className="text-sm text-paper-ink/70 mt-1">Sistema de punto de venta</p>
                        </div>
                    </div>
                    <div className="halftone mt-5" aria-hidden="true" />
                </header>

                <div className="paper-panel p-7">
                    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                        {error && (
                            <div
                                role="alert"
                                className="p-3 border-2 border-paper-spot text-paper-spot text-sm font-medium"
                            >
                                {error}
                            </div>
                        )}

                        <div>
                            <label htmlFor="login-user" className="block text-micro font-bold uppercase text-paper-ink mb-2">
                                Usuario o No. de empleado
                            </label>
                            <input
                                id="login-user"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full min-h-touch px-4 py-3 bg-white text-paper-ink
                                           border-2 border-paper-rule rounded-none
                                           placeholder-paper-ink/40
                                           focus:outline-none focus:border-paper-spot"
                                placeholder="Ingresa tu usuario"
                                required
                                autoFocus
                                autoComplete="username"
                            />
                        </div>

                        <div>
                            <label htmlFor="login-pass" className="block text-micro font-bold uppercase text-paper-ink mb-2">
                                Contraseña
                            </label>
                            <input
                                id="login-pass"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full min-h-touch px-4 py-3 bg-white text-paper-ink
                                           border-2 border-paper-rule rounded-none
                                           placeholder-paper-ink/40
                                           focus:outline-none focus:border-paper-spot"
                                placeholder="••••••••"
                                required
                                autoComplete="current-password"
                            />
                        </div>

                        <button type="submit" disabled={loading} className="paper-btn w-full gap-2 disabled:opacity-50">
                            {loading ? 'Entrando…' : 'Entrar'}
                        </button>
                    </form>
                </div>

                <p className="text-center text-paper-ink/60 text-xs mt-6">
                    © 2026 Torlan POS
                </p>
            </div>
        </div>
    );
}
