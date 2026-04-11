// API Configuration
// Centralize API URL logic to ensure consistency across the application
export const API_URL = import.meta.env.PROD
    ? 'https://pos-torlan.uc.r.appspot.com/api'
    : 'http://localhost:3001/api';
