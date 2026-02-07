// Test script to verify critical functionalities after MySQL migration

const BASE_URL = 'http://localhost:3001';
let authToken = '';

// Test credentials - adjust based on your database
const TEST_USER = {
    username: 'TorlanAdmin',
    password: 'admin123'
};

// Color output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name) {
    log(`\n📋 Testing: ${name}`, 'blue');
}

function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}

function logError(message) {
    log(`❌ ${message}`, 'red');
}

function logWarning(message) {
    log(`⚠️  ${message}`, 'yellow');
}

async function testEndpoint(name, url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
                ...options.headers
            }
        });

        const data = await response.json();

        if (response.ok) {
            logSuccess(`${name} - Status: ${response.status}`);
            return { success: true, data, status: response.status };
        } else {
            logError(`${name} - Status: ${response.status}`);
            console.log('Response:', data);
            return { success: false, data, status: response.status };
        }
    } catch (error) {
        logError(`${name} - Error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function runTests() {
    log('\n🚀 TORLAN POS - MySQL Migration Verification Tests\n', 'blue');
    log('='.repeat(60), 'blue');

    // Test 1: Login
    logTest('1. Authentication (Login)');
    const loginResult = await testEndpoint(
        'POST /api/auth/login',
        `${BASE_URL}/api/auth/login`,
        {
            method: 'POST',
            body: JSON.stringify(TEST_USER)
        }
    );

    if (loginResult.success && loginResult.data.token) {
        authToken = loginResult.data.token;
        logSuccess(`Token received: ${authToken.substring(0, 20)}...`);
        logSuccess(`User: ${loginResult.data.user.username} (${loginResult.data.user.role})`);
    } else {
        logWarning('Login failed - some tests may not run');
    }

    // Test 2: Token Verification
    if (authToken) {
        logTest('2. Token Verification');
        const verifyResult = await testEndpoint(
            'GET /api/auth/verify',
            `${BASE_URL}/api/auth/verify`
        );
        if (verifyResult.success) {
            logSuccess(`Token is valid for user: ${verifyResult.data.user.username}`);
        }
    }

    // Test 3: Products (GET)
    logTest('3. Products - List');
    const productsResult = await testEndpoint(
        'GET /api/products',
        `${BASE_URL}/api/products`
    );
    if (productsResult.success) {
        logSuccess(`Retrieved ${productsResult.data.length || 0} products`);
    }

    // Test 4: Sales (GET recent)
    logTest('4. Sales - Recent');
    const salesResult = await testEndpoint(
        'GET /api/sales/recent',
        `${BASE_URL}/api/sales/recent?limit=5`
    );
    if (salesResult.success) {
        logSuccess(`Retrieved ${salesResult.data.sales?.length || 0} recent sales`);
    }

    // Test 5: Reports - Daily
    logTest('5. Reports - Daily');
    const reportsResult = await testEndpoint(
        'GET /api/reports/daily',
        `${BASE_URL}/api/reports/daily`
    );
    if (reportsResult.success) {
        logSuccess(`Daily report data retrieved`);
    }

    // Test 6: Empresas (for Global Admin)
    if (loginResult.data?.user?.role === 'global_admin') {
        logTest('6. Empresas - List (Global Admin)');
        const empresasResult = await testEndpoint(
            'GET /api/empresas',
            `${BASE_URL}/api/empresas`
        );
        if (empresasResult.success) {
            logSuccess(`Retrieved ${empresasResult.data.length || 0} empresas`);
        }
    } else {
        logWarning('Skipping Empresas test - not a global admin');
    }

    // Test 7: Features
    logTest('7. Features - User Features');
    const featuresResult = await testEndpoint(
        'GET /api/features',
        `${BASE_URL}/api/features`
    );
    if (featuresResult.success) {
        logSuccess(`Retrieved ${featuresResult.data.length || 0} features`);
    }

    // Test 8: Cash Sessions - Current
    logTest('8. Cash Sessions - Current');
    const cashSessionResult = await testEndpoint(
        'GET /api/cash-sessions/current',
        `${BASE_URL}/api/cash-sessions/current`
    );
    if (cashSessionResult.success) {
        logSuccess(`Cash session status retrieved`);
    }

    // Test 9: Business Settings
    logTest('9. Business Settings');
    const settingsResult = await testEndpoint(
        'GET /api/settings',
        `${BASE_URL}/api/settings`
    );
    if (settingsResult.success) {
        logSuccess(`Business settings retrieved`);
    }

    // Summary
    log('\n' + '='.repeat(60), 'blue');
    log('\n✨ Test Suite Completed\n', 'green');
}

// Run tests
runTests().catch(error => {
    logError(`Test suite error: ${error.message}`);
    process.exit(1);
});
