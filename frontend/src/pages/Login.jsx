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
        // Fondo igual al del video (#E8E8E8, el gris uniforme de sus margenes)
        // para que la animacion se integre sin bordes visibles.
        <div
            className="min-h-screen paper-surface flex items-center justify-center p-4"
            style={{ backgroundColor: '#E8E8E8' }}
        >
            <div className="w-full max-w-md">

                <header className="mb-8">
                    {/* La animacion ES la marca — sin icono, texto ni marco. Se
                        muestra a lo ancho (centrada) y el contenedor recorta la
                        parte de abajo del video: aspecto 960/560 deja ver el 78%
                        superior y clipa el resto. El fondo del video (#E8E8E8) es
                        el mismo que el del login, asi que no se ve borde. */}
                    <div className="w-full overflow-hidden" style={{ aspectRatio: '960 / 560' }}>
                        <video
                            className="block w-full"
                            src="/scene.mp4"
                            autoPlay
                            muted
                            playsInline
                            aria-label="Torlan POS"
                        />
                    </div>
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
