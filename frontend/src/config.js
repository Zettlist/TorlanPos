// API Configuration
// Centralize API URL logic to ensure consistency across the application
//
// VITE_API_URL permite apuntar el frontend a otro backend sin tocar el codigo:
// hace falta cuando ya hay un servidor ocupando el 3001 y se levanta un segundo
// en otro puerto contra una base local. Solo aplica en desarrollo.
// El proyecto viejo pos-torlan murio en jun 2026; produccion ahora es
// torlan-pro. VITE_API_URL puede sobreescribir en cualquier modo.
export const API_URL = import.meta.env.PROD
    ? (import.meta.env.VITE_API_URL || 'https://torlan-pro.uc.r.appspot.com/api')
    : (import.meta.env.VITE_API_URL || 'http://localhost:3001/api');
