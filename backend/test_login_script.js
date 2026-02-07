
// Removed import fetch from 'node-fetch'; // Native in Node 24

async function testLogin() {
    console.log('Testing login...');
    console.log('Target: http://localhost:3000/api/auth/login');
    try {
        const response = await fetch('http://localhost:3000/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: 'test_admin',
                password: '123456'
            })
        });

        const data = await response.json();
        console.log('Status:', response.status);
        console.log('Data:', JSON.stringify(data, null, 2));

        if (response.ok) {
            console.log('✅ Login successful!');
        } else {
            console.log('❌ Login failed.');
        }

    } catch (error) {
        console.error('❌ Connection error:', error.message);
        if (error.cause) console.error('Cause:', error.cause);
    }
}

testLogin();
