// Extended test with empresa admin user

const BASE_URL = 'http://localhost:3001';

// Color output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m',
    magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testWithUser(username, password, userType) {
    log(`\n${'='.repeat(70)}`, 'blue');
    log(`Testing with ${userType}: ${username}`, 'magenta');
    log('='.repeat(70), 'blue');

    try {
        // Login
        const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!loginRes.ok) {
            log(`❌ Login failed for ${username}`, 'red');
            return;
        }

        const loginData = await loginRes.json();
        const token = loginData.token;
        log(`✅ Login successful - ${loginData.user.role}`, 'green');

        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        // Test Products
        log('\n📦 Testing Products...', 'blue');
        const productsRes = await fetch(`${BASE_URL}/api/products`, { headers });
        if (productsRes.ok) {
            const products = await productsRes.json();
            log(`✅ Products: ${products.length} items`, 'green');
        } else {
            const error = await productsRes.json();
            log(`❌ Products failed: ${error.error}`, 'yellow');
        }

        // Test creating a product
        log('\n➕ Testing Create Product...', 'blue');
        const newProduct = {
            name: 'Test Product',
            price: 100.00,
            cost_price: 50.00,
            stock: 10,
            category: 'Test'
        };
        const createProductRes = await fetch(`${BASE_URL}/api/products`, {
            method: 'POST',
            headers,
            body: JSON.stringify(newProduct)
        });
        if (createProductRes.ok) {
            const created = await createProductRes.json();
            log(`✅ Product created with ID: ${created.id}`, 'green');
        } else {
            const error = await createProductRes.json();
            log(`❌ Create product failed: ${error.error}`, 'yellow');
        }

        // Test Reports
        log('\n📊 Testing Reports...', 'blue');
        const reportsRes = await fetch(`${BASE_URL}/api/reports/daily`, { headers });
        if (reportsRes.ok) {
            const reports = await reportsRes.json();
            log(`✅ Reports working`, 'green');
        } else {
            const error = await reportsRes.json();
            log(`❌ Reports failed: ${error.error}`, 'yellow');
        }

        // Test Features
        log('\n🎯 Testing Features...', 'blue');
        const featuresRes = await fetch(`${BASE_URL}/api/features`, { headers });
        if (featuresRes.ok) {
            const features = await featuresRes.json();
            log(`✅ Features: ${features.length} features`, 'green');
        } else {
            log(`❌ Features failed`, 'yellow');
        }

        // Test Settings
        log('\n⚙️  Testing Business Settings...', 'blue');
        const settingsRes = await fetch(`${BASE_URL}/api/settings`, { headers });
        if (settingsRes.ok) {
            const settings = await settingsRes.json();
            log(`✅ Settings retrieved`, 'green');
        } else {
            const error = await settingsRes.json();
            log(`❌ Settings failed: ${error.error}`, 'yellow');
        }

    } catch (error) {
        log(`❌ Error testing ${username}: ${error.message}`, 'red');
    }
}

async function runTests() {
    log('\n🚀 TORLAN POS - Comprehensive MySQL Migration Tests', 'blue');

    // Test with both users
    await testWithUser('TorlanAdmin', 'admin123', 'Global Admin');
    await testWithUser('admin_test', 'admin123', 'Empresa Admin');

    log('\n' + '='.repeat(70), 'blue');
    log('✨ All tests completed!', 'green');
    log('='.repeat(70) + '\n', 'blue');
}

runTests();
