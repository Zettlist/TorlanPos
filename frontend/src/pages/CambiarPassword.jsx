import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function CambiarPassword() {
    const { changePassword, user } = useAuth();
    const navigate = useNavigate();

    const [actual, setActual] = useState('');
    const [nueva, setNueva] = useState('');
    const [confirmar, setConfirmar] = useState('');
    const [error, setError] = useState('');
    const [ok, setOk] = useState(false);
    const [loading, setLoading] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        setOk(false);

        if (!actual) {
            setError('Ingresa tu contraseña actual');
            return;
        }
        if (nueva.length < 6) {
            setError('La nueva contraseña debe tener al menos 6 caracteres');
            return;
        }
        if (nueva !== confirmar) {
            setError('Las contraseñas nuevas no coinciden');
            return;
        }
        if (nueva === actual) {
            setError('La nueva contraseña debe ser distinta a la actual');
            return;
        }

        setLoading(true);
        try {
            await changePassword(actual, nueva);
            setOk(true);
            setActual('');
            setNueva('');
            setConfirmar('');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-lg mx-auto">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-ink">Cambiar contraseña</h1>
                <p className="text-muted text-sm mt-1">
                    Cuenta: <span className="text-accent font-medium">{user?.username}</span>
                </p>
            </div>

            <div className="panel p-6">
                <form onSubmit={submit} className="space-y-5">
                    {error && (
                        <div className="p-3 bg-bad-soft border border-bad/30 rounded-control text-bad text-sm">
                            {error}
                        </div>
                    )}
                    {ok && (
                        <div className="p-3 bg-ok-soft border border-ok/30 rounded-control text-ok text-sm">
                            Contraseña actualizada. Úsala la próxima vez que inicies sesión.
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-ink mb-2">Contraseña actual</label>
                        <input
                            type="password"
                            value={actual}
                            onChange={(e) => setActual(e.target.value)}
                            className="field w-full"
                            autoComplete="current-password"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-ink mb-2">Nueva contraseña</label>
                        <input
                            type="password"
                            value={nueva}
                            onChange={(e) => setNueva(e.target.value)}
                            className="field w-full"
                            autoComplete="new-password"
                        />
                        <p className="text-xs text-muted mt-1">Mínimo 6 caracteres.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-ink mb-2">Confirmar nueva contraseña</label>
                        <input
                            type="password"
                            value={confirmar}
                            onChange={(e) => setConfirmar(e.target.value)}
                            className="field w-full"
                            autoComplete="new-password"
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button type="submit" disabled={loading} className="btn-primary flex-1">
                            {loading ? 'Guardando…' : 'Guardar contraseña'}
                        </button>
                        <button type="button" onClick={() => navigate(-1)} className="btn-secondary">
                            Volver
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
