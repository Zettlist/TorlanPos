import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';

const EQUIPOS = {
    mexico: { nombre: 'México', bandera: '🇲🇽', color: 'bg-green-600', texto: 'text-green-400' },
    corea: { nombre: 'Corea del Sur', bandera: '🇰🇷', color: 'bg-blue-600', texto: 'text-blue-400' },
};

export default function EventoMundial() {
    const { token } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Publicar resultado
    const [ganador, setGanador] = useState('');
    const [codigo, setCodigo] = useState('');
    const [publicando, setPublicando] = useState(false);
    const [mensaje, setMensaje] = useState('');

    const fetchVotos = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/eventos/mundial/votos`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Error al cargar votos');
            setData(await res.json());
            setError('');
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        fetchVotos();
        const t = setInterval(() => {
            if (document.visibilityState === 'visible') fetchVotos();
        }, 10000);
        return () => clearInterval(t);
    }, [fetchVotos]);

    const publicarResultado = async () => {
        if (!ganador) return;
        setPublicando(true);
        setMensaje('');
        try {
            const res = await fetch(`${API_URL}/eventos/mundial/resultado`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ ganador, codigo: codigo.trim() || null }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Error al publicar');
            setMensaje('✅ Resultado publicado — los acertantes ya ven su código en la tienda');
            fetchVotos();
        } catch (e) {
            setMensaje(`❌ ${e.message}`);
        } finally {
            setPublicando(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
            </div>
        );
    }

    const conteos = data?.conteos || { mexico: 0, corea: 0 };
    const total = conteos.mexico + conteos.corea;
    const pctMx = total === 0 ? 50 : Math.round((conteos.mexico / total) * 100);
    const pctRsa = 100 - pctMx;
    const votantes = data?.votantes || [];
    const resultado = data?.resultado;

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto">
            <div className="mb-6">
                <h1 className="text-2xl md:text-3xl font-bold text-white">⚽ Mundial 2026 — 🇲🇽 México vs Corea del Sur 🇰🇷</h1>
                <p className="text-slate-400 mt-1">
                    Votación fase de grupos (cierra 18 jun 7:00 pm) — tienda Bisonte Manga
                </p>
            </div>

            {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/40 rounded-lg text-red-400">
                    {error}
                </div>
            )}

            {/* Tarjetas de conteo */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                {Object.entries(EQUIPOS).map(([key, eq]) => (
                    <div key={key} className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                        <div className="flex items-center gap-2 text-slate-300">
                            <span className="text-2xl">{eq.bandera}</span>
                            <span className="font-semibold">{eq.nombre}</span>
                        </div>
                        <div className={`text-4xl font-bold mt-2 ${eq.texto}`}>{conteos[key]}</div>
                        <div className="text-slate-500 text-sm">
                            {total === 0 ? '—' : `${key === 'mexico' ? pctMx : pctRsa}% de los votos`}
                        </div>
                    </div>
                ))}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                    <div className="text-slate-300 font-semibold">Total de votos</div>
                    <div className="text-4xl font-bold mt-2 text-white">{total}</div>
                    <div className="text-slate-500 text-sm">se actualiza cada 10s</div>
                </div>
            </div>

            {/* Barra de proporción */}
            <div className="mb-8">
                <div className="flex h-8 rounded-lg overflow-hidden border border-slate-700">
                    <div
                        className="bg-green-600 flex items-center pl-3 text-white text-sm font-bold transition-all duration-700"
                        style={{ width: `${Math.max(8, Math.min(92, pctMx))}%` }}
                    >
                        {total > 0 && `${pctMx}%`}
                    </div>
                    <div
                        className="bg-blue-600 flex items-center justify-end pr-3 text-white text-sm font-bold transition-all duration-700"
                        style={{ width: `${Math.min(92, Math.max(8, pctRsa))}%` }}
                    >
                        {total > 0 && `${pctRsa}%`}
                    </div>
                </div>
            </div>

            {/* Publicar resultado */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-8">
                <h2 className="text-lg font-bold text-white mb-1">Publicar resultado</h2>
                <p className="text-slate-400 text-sm mb-4">
                    Al terminar el partido, marca al ganador y define el código de descuento.
                    Quienes votaron por el ganador lo verán al instante en la tienda.
                </p>

                {resultado && (
                    <div className="mb-4 p-3 bg-green-500/10 border border-green-500/40 rounded-lg text-green-400 text-sm">
                        Resultado actual: ganó <strong>{EQUIPOS[resultado.ganador]?.nombre}</strong>
                        {resultado.codigo && <> — código <code className="font-mono bg-slate-900 px-2 py-0.5 rounded">{resultado.codigo}</code></>}
                    </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                    <select
                        value={ganador}
                        onChange={e => setGanador(e.target.value)}
                        className="bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white"
                    >
                        <option value="">— Ganador —</option>
                        <option value="mexico">🇲🇽 México</option>
                        <option value="corea">🇰🇷 Corea del Sur</option>
                    </select>
                    <input
                        type="text"
                        value={codigo}
                        onChange={e => setCodigo(e.target.value.toUpperCase())}
                        placeholder="Código de descuento (ej. MUNDIAL10)"
                        className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500"
                    />
                    <button
                        onClick={publicarResultado}
                        disabled={!ganador || publicando}
                        className="px-6 py-2 bg-gradient-to-r from-primary-500 to-accent-500 rounded-lg text-white font-semibold disabled:opacity-50"
                    >
                        {publicando ? 'Publicando…' : 'Publicar'}
                    </button>
                </div>
                {mensaje && <p className="mt-3 text-sm text-slate-300">{mensaje}</p>}
            </div>

            {/* Tabla de votantes */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="p-5 border-b border-slate-700">
                    <h2 className="text-lg font-bold text-white">Votantes ({votantes.length})</h2>
                </div>
                {votantes.length === 0 ? (
                    <p className="p-5 text-slate-500">Aún no hay votos.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-slate-400 border-b border-slate-700">
                                    <th className="px-5 py-3">Cliente</th>
                                    <th className="px-5 py-3">Email</th>
                                    <th className="px-5 py-3">Voto</th>
                                    <th className="px-5 py-3">Fecha</th>
                                </tr>
                            </thead>
                            <tbody>
                                {votantes.map(v => {
                                    const eq = EQUIPOS[v.opcion];
                                    return (
                                        <tr key={v.id} className="border-b border-slate-700/50 text-slate-300">
                                            <td className="px-5 py-3">
                                                {v.nombre ? `${v.nombre} ${v.apellido || ''}`.trim() : <span className="text-slate-500">Cliente #{v.cliente_id ?? '?'}</span>}
                                            </td>
                                            <td className="px-5 py-3 text-slate-400">{v.email || '—'}</td>
                                            <td className="px-5 py-3">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${v.opcion === 'mexico' ? 'bg-green-500/15 text-green-400' : 'bg-blue-500/15 text-blue-400'}`}>
                                                    {eq?.bandera} {eq?.nombre || v.opcion}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-slate-400">
                                                {new Date(v.created_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
