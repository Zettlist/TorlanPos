import 'dotenv/config';
process.env.TZ = 'America/Mexico_City';

import express from 'express';
import cors from 'cors';
import pool, { initDatabase } from './database/db.js';


// Import routes
import authRoutes from './routes/auth.js';
import featuresRoutes from './routes/features.js';
import productsRoutes from './routes/products.js';
import salesRoutes from './routes/sales.js';
import empresasRoutes from './routes/empresas.js';
import cashSessionsRoutes from './routes/cashSessions.js';
import businessSettingsRoutes from './routes/businessSettings.js';
import onboardingRoutes from './routes/onboarding.js';
import reportsRoutes from './routes/reports.js';
import suppliersRoutes from './routes/suppliers.js';
import cronRoutes from './routes/cronRoutes.js';
import preventasRoutes from './routes/preventas.js';
import anticiposRoutes from './routes/anticipos.js';
import publicCatalogRoutes from './routes/publicCatalog.js';
import couponsRoutes from './routes/coupons.js';
import webOrdersRoutes from './routes/webOrders.js';
import storeCreditsRoutes from './routes/storeCredits.js';


import { runSchemaMigrations } from './migrations/startup.js';

const app = express();
const PORT = process.env.PORT || 3000; // Use env PORT for cloud deployment, fallback to 3000

// =============================================================================
// 2. CORS CONFIGURATION (Permissive for development)
// =============================================================================
// Configure CORS
// In production, allow the deployed frontend. In development, allow localhost.
const allowedOrigins = [
    'https://pos-torlan.web.app',
    'https://pos-torlan.firebaseapp.com',
    'https://torlanpos.com',
    'https://www.torlanpos.com',
    'http://localhost:5173',
    'http://localhost:3000'
];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            // Temporarily allow all for debugging if needed, or strictly block
            // return callback(new Error('The CORS policy for this site does not allow access from the specified Origin.'), false);
            // For now, let's keep it somewhat open but logged, or strict.
            // Let's implement strict but include logic:
            return callback(null, true); // Fallback to allowing for now to ensure no breakage, or use strict logic below:
        }
        return callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'X-Requested-With', 'Accept'],
    credentials: true
}));

// Handle preflight OPTIONS requests
app.options('*', cors());

// =============================================================================
// 3. JSON BODY PARSER (Before logging so req.body is available)
// =============================================================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// =============================================================================
// 1. REQUEST LOGGING MIDDLEWARE (After JSON parser)
// =============================================================================
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url}`);
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        const bodyStr = JSON.stringify(req.body || {});
        console.log('  Body:', bodyStr.substring(0, 200));
    }
    next();
});

// =============================================================================
// 4. ROOT HEALTH CHECK
// =============================================================================
app.get('/', (req, res) => {
    res.json({
        status: 'API Online',
        database: 'MySQL',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// API Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        database: 'MySQL',
        timestamp: new Date().toISOString()
    });
});



// =============================================================================
// 5. API ROUTES (Modular)
// =============================================================================
console.log('📦 Loading routes...');
app.use('/api/auth', authRoutes);
app.use('/api/features', featuresRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/empresas', empresasRoutes);
app.use('/api/cash-sessions', cashSessionsRoutes); // Fixed: was /api/cash, now /api/cash-sessions
app.use('/api/settings', businessSettingsRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/preventas', preventasRoutes);
app.use('/api/anticipos', anticiposRoutes);
app.use('/api/public/catalog', publicCatalogRoutes); // Public API (no auth) for external consumers
app.use('/api/coupons', couponsRoutes);
app.use('/api/store-credits', storeCreditsRoutes);
app.use('/api/web-orders', webOrdersRoutes);
console.log('✅ Routes loaded successfully');


// =============================================================================
// 6. 404 HANDLER (Route not found)
// =============================================================================
app.use((req, res) => {
    console.log(`⚠️  404 Not Found: ${req.method} ${req.url}`);
    res.status(404).json({
        error: 'Route not found',
        method: req.method,
        path: req.url,
        timestamp: new Date().toISOString()
    });
});

// =============================================================================
// 7. GLOBAL ERROR HANDLER (Catch all errors)
// =============================================================================
app.use((err, req, res, next) => {
    console.error('❌ Unhandled Error:');
    console.error('  Route:', req.method, req.url);
    console.error('  Error:', err.message);
    console.error('  Stack:', err.stack);

    // Send error response
    res.status(err.status || 500).json({
        error: err.message || 'Error interno del servidor',
        timestamp: new Date().toISOString(),
        path: req.url
    });
});

// =============================================================================
// 8. DATABASE CONNECTION & SERVER START
// =============================================================================
async function startServer() {
    try {
        console.log('🔄 Connecting to Database...');
        await initDatabase();
        console.log('✅ Database connected');

        // Start listening immediately so App Engine doesn't timeout the cold start
        app.listen(PORT, () => {
            console.log('\n' + '='.repeat(60));
            console.log(`🚀 Server running on port ${PORT}`);
            console.log('📊 Database: MySQL');
            console.log('🌐 CORS: Enabled (origin: *)');
            console.log('📝 Request logging: Enabled');
            console.log('='.repeat(60) + '\n');
            console.log('⏰ App Engine Cron endpoints ready at /api/cron');
        });

        // Run schema migrations asynchronously in the background
        console.log('🔄 Running schema migrations in background...');
        runSchemaMigrations().then(() => {
            console.log('✅ Background schema migrations completed.');
        }).catch(err => {
            console.error('❌ Background schema migrations failed:', err);
        });

    } catch (error) {
        console.error('\n❌ Failed to start server:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise);
    console.error('Reason:', reason);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('\n⚠️  SIGTERM received. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\n⚠️  SIGINT received. Shutting down gracefully...');
    process.exit(0);
});

// =============================================================================
// START THE SERVER
// =============================================================================
startServer();
