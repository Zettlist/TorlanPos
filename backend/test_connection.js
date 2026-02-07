// Test connection to backend API
// Run with: node test_connection.js

const API_URL = 'http://localhost:3000';

async function testLogin() {
    console.log('🧪 Testing Backend Connection...\n');
    console.log(`API URL: ${API_URL}`);
    console.log('Endpoint: POST /api/auth/login\n');

    try {
        const response = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: 'TorlanAdmin',
                password: 'admin123'
            })
        });

        console.log(`Status: ${response.status} ${response.statusText}`);

        const data = await response.json();

        if (response.ok) {
            console.log('\n✅ LOGIN EXITOSO!\n');
            console.log('Token recibido:', data.token?.substring(0, 30) + '...');
            console.log('Usuario:', data.user?.username);
            console.log('Role:', data.user?.role);
        } else {
            console.log('\n❌ LOGIN FALLÓ\n');
            console.log('Error:', data);
        }

    } catch (error) {
        console.log('\n💥 ERROR DE CONEXIÓN\n');
        console.log('Tipo:', error.name);
        console.log('Mensaje:', error.message);
        console.log('\n⚠️  Posibles causas:');
        console.log('  - El servidor backend NO está corriendo');
        console.log('  - El puerto es incorrecto (debe ser 3000)');
        console.log('  - Firewall bloqueando la conexión');
    }
}

async function testHealth() {
    console.log('\n📊 Testing Health Endpoint...\n');

    try {
        const response = await fetch(`${API_URL}/api/health`);
        const data = await response.json();

        console.log('✅ Health check:', data);
    } catch (error) {
        console.log('❌ Health check failed:', error.message);
    }
}

// Run tests
(async () => {
    await testHealth();
    await testLogin();
})();
