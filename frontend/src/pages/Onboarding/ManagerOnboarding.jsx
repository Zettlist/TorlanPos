import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
// Copia desincronizada de la URL del API: apuntaba al 3000 y el backend
// escucha en el 3001. Ver src/config.js.
import { API_URL } from '../../config';

export default function ManagerOnboarding() {
    const { token, user, refreshUser } = useAuth();
    const navigate = useNavigate();
    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [formData, setFormData] = useState({
        weekly_sales_goal: '',
        monthly_sales_goal: ''
    });

    const steps = [
        { id: 1, title: 'Bienvenida', icon: '👋' },
        { id: 2, title: 'Metas', icon: '🎯' },
        { id: 3, title: 'Configuración', icon: '⚙️' },
        { id: 4, title: '¡Listo!', icon: '🚀' }
    ];

    useEffect(() => {
        fetchOnboardingStatus();
    }, []);

    const fetchOnboardingStatus = async () => {
        try {
            const response = await fetch(`${API_URL}/onboarding/status`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();

            if (data.completed) {
                navigate('/');
            }
        } catch (err) {
            console.error('Error fetching onboarding status:', err);
        }
    };

    const handleSaveGoals = async () => {
        setLoading(true);
        setError('');

        try {
            // Save goals logic...
            const response = await fetch(`${API_URL}/settings`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    weekly_sales_goal: formData.weekly_sales_goal || null,
                    monthly_sales_goal: formData.monthly_sales_goal || null
                })
            });

            if (response.ok) {
                setCurrentStep(3); // Go to Configuration
            } else {
                const data = await response.json();
                setError(data.error);
            }
        } catch (err) {
            setError('Error al guardar metas');
        } finally {
            setLoading(false);
        }
    };

    const handleComplete = async () => {
        setLoading(true);
        setError('');

        try {
            const response = await fetch(`${API_URL}/onboarding/complete`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                await refreshUser();
                setCurrentStep(4);
                setTimeout(() => window.location.href = '/', 2000);
            } else {
                const data = await response.json();
                setError(data.error || 'Error al completar configuración');
            }
        } catch (err) {
            setError('Error al completar configuración');
        } finally {
            setLoading(false);
        }
    };

    const handleSkip = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/onboarding/skip`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                await refreshUser();
                navigate('/');
            }
        } catch (err) {
            setError('Error al omitir');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            {/* Background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 -left-20 w-96 h-96 bg-accent/20 rounded-full blur-3xl"></div>
                <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-accent-500/20 rounded-full blur-3xl"></div>
            </div>

            <div className="w-full max-w-3xl relative">
                {/* Progress Steps - Improved CSS */}
                <div className="mb-10 relative">
                    {/* Connector Line - Perfectly Centered */}
                    <div className="absolute top-6 left-0 right-0 h-0.5 bg-raised -z-10 translate-y-[-1px]"></div>

                    {/* Active Line Progress */}
                    <div className="absolute top-6 left-0 h-0.5 bg-accent -z-10 translate-y-[-1px] transition-all duration-500 ease-out"
                        style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}></div>

                    <div className="flex justify-between items-start w-full">
                        {steps.map((step) => (
                            <div key={step.id} className="flex flex-col items-center z-10">
                                <div className={`
                                    w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-lg border-4 
                                    ${currentStep >= step.id
                                        ? 'bg-surface border-accent text-white'
                                        : 'bg-surface border-line text-muted'}
                                    transition-all duration-300
                                `}>
                                    {step.id < currentStep ? '✓' : step.icon}
                                </div>
                                <span className={`text-xs font-semibold mt-2 tracking-wide uppercase ${currentStep >= step.id ? 'text-accent' : 'text-muted'
                                    }`}>
                                    {step.title}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Content Card */}
                <div className="glass-card p-8 animate-fade-in shadow-2xl border border-line">
                    {error && (
                        <div className="bg-bad-soft text-bad border border-bad/30 p-4 rounded-lg mb-6 flex items-center gap-3">
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {error}
                        </div>
                    )}

                    {/* Step 1: Welcome */}
                    {currentStep === 1 && (
                        <div className="text-center animate-slide-up">
                            <h1 className="text-4xl font-bold text-white mb-4 text-ink">
                                ¡Bienvenido a Torlan POS!
                            </h1>
                            <p className="text-muted mb-8 text-lg">
                                Configura tu negocio en minutos y empieza a vender.
                            </p>
                            <div className="bg-raised border border-line rounded-panel p-6 mb-8 text-left max-w-lg mx-auto">
                                <h3 className="text-md font-semibold text-ink mb-4 border-b border-line pb-2">Tu Checklist de Inicio:</h3>
                                <ul className="space-y-4 text-ink">
                                    <li className="flex items-center gap-3">
                                        <div className="w-6 h-6 rounded-full bg-ok-soft flex items-center justify-center text-ok text-sm">1</div>
                                        Definir metas de ventas
                                    </li>
                                    <li className="flex items-center gap-3">
                                        <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-700 text-sm">2</div>
                                        Revisión final
                                    </li>
                                </ul>
                            </div>
                            <div className="flex gap-4 justify-center">
                                <button onClick={handleSkip} className="px-6 py-3 text-muted hover:text-ink transition-colors">
                                    Omitir configuración
                                </button>
                                <button onClick={() => setCurrentStep(2)} className="btn-primary px-8 text-lg shadow-lg shadow-primary-500/20">
                                    ¡Vamos! →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Sales Goals */}
                    {currentStep === 2 && (
                        <div className="animate-slide-up">
                            <div className="text-center mb-8">
                                <h2 className="text-2xl font-bold text-ink mb-2">Metas de Ventas</h2>
                                <p className="text-muted">Motiva a tu equipo con objetivos claros.</p>
                            </div>

                            <div className="grid grid-cols-2 gap-6 mb-8">
                                <div className="bg-surface p-4 rounded-control border border-line">
                                    <label className="block text-sm font-medium text-accent mb-2">Meta Semanal</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
                                        <input
                                            type="number"
                                            value={formData.weekly_sales_goal}
                                            onChange={(e) => setFormData({ ...formData, weekly_sales_goal: e.target.value.replace(/^0+/, '') })}
                                            className="input-dark pl-8 text-lg font-semibold"
                                            placeholder="10000"
                                        />
                                    </div>
                                </div>
                                <div className="bg-surface p-4 rounded-control border border-line">
                                    <label className="block text-sm font-medium text-accent-400 mb-2">Meta Mensual</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
                                        <input
                                            type="number"
                                            value={formData.monthly_sales_goal}
                                            onChange={(e) => setFormData({ ...formData, monthly_sales_goal: e.target.value.replace(/^0+/, '') })}
                                            className="input-dark pl-8 text-lg font-semibold"
                                            placeholder="40000"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-between border-t border-line pt-6">
                                <button onClick={() => setCurrentStep(1)} className="text-muted hover:text-ink">← Volver</button>
                                <button onClick={handleSaveGoals} disabled={loading} className="btn-primary">
                                    {loading ? 'Guardando...' : 'Siguiente Paso →'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Final Config (Was 4) */}
                    {currentStep === 3 && (
                        <div className="animate-slide-up">
                            <h2 className="text-2xl font-bold text-ink mb-2 text-center">Confirmar Configuración</h2>
                            <p className="text-muted mb-8 text-center">Todo listo para lanzar tu sistema.</p>

                            <div className="grid grid-cols-1 gap-4 mb-8">
                                <div className="glass-card-dark p-4 rounded-control">
                                    <p className="text-xs text-muted uppercase tracking-wider mb-1">Metas Financieras</p>
                                    <div className="flex justify-between gap-8">
                                        <p className="text-ink font-medium flex justify-between w-full">
                                            <span>Semanal:</span> <span className="text-ok">${formData.weekly_sales_goal || 0}</span>
                                        </p>
                                        <p className="text-ink font-medium flex justify-between w-full">
                                            <span>Mensual:</span> <span className="text-ok">${formData.monthly_sales_goal || 0}</span>
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-between border-t border-line pt-6">
                                <button onClick={() => setCurrentStep(2)} className="text-muted hover:text-ink">← Volver</button>
                                <button onClick={handleComplete} disabled={loading} className="btn-primary px-8 shadow-lg shadow-green-500/20 bg-gradient-to-r from-green-600 to-green-500 border-green-400">
                                    {loading ? 'Finalizando...' : '🚀 Finalizar Configuración'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 4: Done (Was 5) */}
                    {currentStep === 4 && (
                        <div className="text-center py-10 animate-scale-in">
                            <div className="w-20 h-20 bg-ok-soft rounded-full flex items-center justify-center mx-auto mb-6">
                                <span className="text-4xl text-ok">✓</span>
                            </div>
                            <h2 className="text-3xl font-bold text-ink mb-4">
                                ¡Todo Listo!
                            </h2>
                            <p className="text-ink text-lg">
                                Tu sistema POS está configurado y listo para usarse.
                            </p>
                            <p className="text-muted mt-2 text-sm animate-pulse">
                                Redirigiendo al Dashboard...
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
