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
            colors: {
                // Fondos y lineas
                base:    '#F4F5F7',   // fondo de pagina
                surface: '#FFFFFF',   // tarjetas, paneles, filas
                raised:  '#EDEFF2',   // hover de fila, celdas destacadas
                line:    '#D8DDE3',   // bordes y separadores
                'line-strong': '#B9C0C8',

                // Texto: solo dos niveles. Si hace falta un tercero, revisar la jerarquia.
                ink:   '#0E1216',     // 16.8:1 sobre surface
                muted: '#5C6672',     //  6.1:1 sobre surface

                // Accion. Un solo azul, saturado, reservado al boton primario
                // y al foco. No decorar con el.
                accent: {
                    DEFAULT: '#0B4FD1',
                    hover:   '#0942AE',
                    soft:    '#E8EFFC',   // fondo de estado seleccionado
                    ink:     '#FFFFFF',   // texto sobre accent
                },

                // Estado. Semantico, independiente del acento.
                ok:   { DEFAULT: '#15803D', soft: '#E7F5EC' },
                warn: { DEFAULT: '#B45309', soft: '#FDF2E3' },
                bad:  { DEFAULT: '#B91C1C', soft: '#FCEBEA' },

                // Vocabulario impreso ("Bisonte"): login, reportes, comprobante.
                paper: {
                    DEFAULT: '#F5F3EE',
                    ink:     '#12100E',
                    rule:    '#161310',
                    spot:    '#B3211A',
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
