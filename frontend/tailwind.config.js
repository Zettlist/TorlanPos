/** @type {import('tailwindcss').Config} */

// ─────────────────────────────────────────────────────────────────────────────
//  Direccion "Mostrador"
//
//  El POS se opera ocho horas seguidas detras de un mostrador, bajo luz de
//  tienda y con reflejos en la pantalla. El tema anterior (glassmorphism:
//  superficies translucidas, gradiente azul->fucsia, texto slate-300 sobre
//  fondo difuso) venia de plantillas de landing page y fallaba en lo unico que
//  importa aqui: leer una cifra rapido y sin dudar.
//
//  Reglas de este sistema:
//   · Un solo acento (accent) y solo para la accion principal.
//   · Los colores de estado (ok/warn/bad) son semanticos y NO son el acento.
//     Nunca van solos: siempre acompañados de forma o texto.
//   · `ink` y `muted` son los unicos colores de texto. Nada de grises claros.
//   · `paper` y su tinta son el vocabulario impreso de la direccion "Bisonte",
//     reservado a login, encabezados de reporte y comprobante -- pantallas
//     donde nadie esta cobrando contra reloj.
// ─────────────────────────────────────────────────────────────────────────────

export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            // Los valores viven como canales RGB en variables CSS (ver index.css:
            // :root para el tema claro, [data-theme="dark"] para el oscuro). El
            // patron rgb(var(--x) / <alpha-value>) conserva los modificadores de
            // opacidad de Tailwind (bg-accent/25, bg-ink/40) al cambiar de tema.
            colors: {
                // Fondos y lineas
                base:    'rgb(var(--base) / <alpha-value>)',      // fondo de pagina
                surface: 'rgb(var(--surface) / <alpha-value>)',   // tarjetas, paneles, filas
                raised:  'rgb(var(--raised) / <alpha-value>)',    // hover de fila, celdas destacadas
                line:    'rgb(var(--line) / <alpha-value>)',      // bordes y separadores
                'line-strong': 'rgb(var(--line-strong) / <alpha-value>)',

                // Texto: solo dos niveles. Si hace falta un tercero, revisar la jerarquia.
                ink:   'rgb(var(--ink) / <alpha-value>)',
                muted: 'rgb(var(--muted) / <alpha-value>)',

                // Accion. Un solo azul, saturado, reservado al boton primario
                // y al foco. No decorar con el.
                accent: {
                    DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
                    hover:   'rgb(var(--accent-hover) / <alpha-value>)',
                    soft:    'rgb(var(--accent-soft) / <alpha-value>)',   // fondo de estado seleccionado
                    ink:     'rgb(var(--accent-ink) / <alpha-value>)',    // texto sobre accent
                },

                // Estado. Semantico, independiente del acento.
                ok:   { DEFAULT: 'rgb(var(--ok) / <alpha-value>)',   soft: 'rgb(var(--ok-soft) / <alpha-value>)' },
                warn: { DEFAULT: 'rgb(var(--warn) / <alpha-value>)', soft: 'rgb(var(--warn-soft) / <alpha-value>)' },
                bad:  { DEFAULT: 'rgb(var(--bad) / <alpha-value>)',  soft: 'rgb(var(--bad-soft) / <alpha-value>)' },

                // Vocabulario impreso ("Bisonte"): login, reportes, comprobante.
                // No cambia con el tema: la impresion es siempre sobre papel claro.
                paper: {
                    DEFAULT: 'rgb(var(--paper) / <alpha-value>)',
                    ink:     'rgb(var(--paper-ink) / <alpha-value>)',
                    rule:    'rgb(var(--paper-rule) / <alpha-value>)',
                    spot:    'rgb(var(--paper-spot) / <alpha-value>)',
                },
            },

            fontFamily: {
                sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
                mono: ['ui-monospace', 'SF Mono', 'Cascadia Mono', 'Consolas', 'monospace'],
            },

            fontSize: {
                // Escala fija. El total a cobrar usa `amount`, y nada mas lo usa.
                'micro':  ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.06em' }],
                'amount': ['2rem',      { lineHeight: '1.1',  letterSpacing: '-0.02em', fontWeight: '700' }],
            },

            borderRadius: {
                DEFAULT: '6px',
                'control': '6px',
                'panel':   '8px',
            },

            spacing: {
                // Altura minima de control tactil. El staff cobra de pie y con prisa.
                'touch': '52px',
            },

            boxShadow: {
                // Elevacion discreta: separa planos sin competir con el contenido.
                'panel': '0 1px 2px rgba(14,18,22,.06), 0 1px 3px rgba(14,18,22,.04)',
                'pop':   '0 4px 12px rgba(14,18,22,.10), 0 1px 3px rgba(14,18,22,.06)',
                // Registro de impresion desalineado -- solo vocabulario "paper".
                'print': '3px 3px 0 #161310',
            },

            animation: {
                'fade-in': 'fadeIn 0.2s ease-out',
                'slide-up': 'slideUp 0.2s ease-out',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { transform: 'translateY(6px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                },
            },
        },
    },
    plugins: [],
}
