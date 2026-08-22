import { useEffect, useRef, useState } from 'react';

// Alterna tema claro/oscuro. La preferencia se guarda en localStorage con la
// misma llave ('pos-theme') que lee el script de index.html al arrancar, para
// que el tema elegido persista entre recargas y no haya parpadeo inicial.
const LLAVE = 'pos-theme';

function temaInicial() {
    try {
        const guardado = localStorage.getItem(LLAVE);
        if (guardado) return guardado === 'dark';
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
        return false;
    }
}

export default function ThemeToggle() {
    const [oscuro, setOscuro] = useState(temaInicial);
    const primerRender = useRef(true);

    useEffect(() => {
        const raiz = document.documentElement;
        // Fundido de colores solo cuando el usuario alterna el tema, no en el
        // primer render (evita animar el arranque). La clase se retira tras la
        // transicion; ver .theme-anim en index.css.
        if (!primerRender.current) {
            raiz.classList.add('theme-anim');
            window.clearTimeout(raiz._temaAnim);
            raiz._temaAnim = window.setTimeout(() => raiz.classList.remove('theme-anim'), 450);
        }
        primerRender.current = false;

        if (oscuro) raiz.setAttribute('data-theme', 'dark');
        else raiz.removeAttribute('data-theme');
        try {
            localStorage.setItem(LLAVE, oscuro ? 'dark' : 'light');
        } catch {
            /* localStorage puede fallar en modo privado; el tema sigue aplicado. */
        }
    }, [oscuro]);

    return (
        <button
            type="button"
            onClick={() => setOscuro((v) => !v)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-control text-sm text-muted
                       hover:text-ink hover:bg-raised transition-colors font-medium cursor-pointer"
            aria-pressed={oscuro}
            title={oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
            <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                {oscuro ? (
                    // Sol: en oscuro, el botón lleva a claro.
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                ) : (
                    // Luna: en claro, el botón lleva a oscuro.
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                )}
            </span>
            {oscuro ? 'Modo claro' : 'Modo oscuro'}
        </button>
    );
}
