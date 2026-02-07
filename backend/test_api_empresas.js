// Quick API test script
console.log('Testing /api/empresas endpoint...\n');

const response = await fetch('http://localhost:3001/api/empresas', {
    headers: {
        'Authorization': `Bearer ${process.env.TOKEN || 'YOUR_TOKEN_HERE'}`
    }
});

if (!response.ok) {
    console.error(`❌ HTTP ${response.status}: ${response.statusText}`);
    process.exit(1);
}

const empresas = await response.json();
console.log(`✅ API returned ${empresas.length} empresa(s):\n`);

empresas.forEach(emp => {
    console.log(`ID: ${emp.id} - ${emp.nombre_empresa}`);
    console.log(`   Users: ${emp.total_usuarios}, Products: ${emp.total_productos}`);
});

if (empresas.find(e => e.id === 99)) {
    console.log('\n✅ Empresa ID 99 is in API response!');
} else {
    console.log('\n❌ Empresa ID 99 NOT in API response!');
}
