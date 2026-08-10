// API Configuration
// Centralize API URL logic to ensure consistency across the application
//
// VITE_API_URL permite apuntar el frontend a otro backend sin tocar el codigo:
// hace falta cuando ya hay un servidor ocupando el 3001 y se levanta un segundo
// en otro puerto contra una base local. Solo aplica en desarrollo.
export const API_URL = import.meta.env.PROD
    ? 'https://pos-torlan.uc.r.appspot.com/api'
    : (import.meta.env.VITE_API_URL || 'http://localhost:3001/api');
