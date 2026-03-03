# ============================================================
# seed_preventas_api.ps1
# Inserta 15 pedidos de prueba en produccion via API REST
# Uso: .\seed_preventas_api.ps1
# ============================================================

$BASE_URL = "https://pos-torlan.uc.r.appspot.com/api"

# ---- Solicitar credenciales ----
Write-Host "`n🔑 Ingresa tus credenciales de administrador:" -ForegroundColor Cyan
$EMAIL    = Read-Host "   Email"
$PASSWORD = Read-Host "   Contraseña"

# ---- Login ----
Write-Host "`n🔐 Iniciando sesion..." -ForegroundColor Yellow
try {
    $loginBody = @{ email = $EMAIL; password = $PASSWORD } | ConvertTo-Json
    $loginResp = Invoke-RestMethod -Uri "$BASE_URL/auth/login" -Method POST `
        -ContentType "application/json" -Body $loginBody
    $TOKEN = $loginResp.token
    Write-Host "✅ Login exitoso. Token obtenido." -ForegroundColor Green
} catch {
    Write-Host "❌ Error al iniciar sesion: $_" -ForegroundColor Red
    exit 1
}

$HEADERS = @{ Authorization = "Bearer $TOKEN"; "Content-Type" = "application/json" }

# ---- Pedidos de prueba ----
$ORDERS = @(
    @{ orderNumber="PRE-2026-001"; clientNumber="CLI-001"; clientName="Ana Torres";      clientPhone="55-1234-5678"; title="Berserk Deluxe Vol. 3";          artist="Kentaro Miura";   groupName="Berserk";       language="Español"; categories=@("Manga");           totalPrice=890;  deposit=200; isPaidInFull=$false },
    @{ orderNumber="PRE-2026-002"; clientNumber="CLI-001"; clientName="Ana Torres";      clientPhone="55-1234-5678"; title="Chainsaw Man Vol. 5";             artist="Tatsuki Fujimoto"; groupName="Chainsaw Man";  language="Español"; categories=@("Manga");           totalPrice=149;  deposit=149; isPaidInFull=$true  },
    @{ orderNumber="PRE-2026-003"; clientNumber="CLI-002"; clientName="Carlos Ruiz";     clientPhone="33-9876-5432"; title="One Piece Vol. 105";              artist="Eiichiro Oda";    groupName="One Piece";     language="Español"; categories=@("Manga");           totalPrice=159;  deposit=100; isPaidInFull=$false },
    @{ orderNumber="PRE-2026-004"; clientNumber="CLI-002"; clientName="Carlos Ruiz";     clientPhone="33-9876-5432"; title="Jujutsu Kaisen Vol. 22";          artist="Gege Akutami";    groupName="Jujutsu Kaisen";language="Español"; categories=@("Manga");           totalPrice=149;  deposit=149; isPaidInFull=$true  },
    @{ orderNumber="PRE-2026-005"; clientNumber="CLI-003"; clientName="Maria Lopez";     clientPhone="81-5555-0001"; title="Sailor Moon Eternal 2";           artist="Naoko Takeuchi";  groupName="Sailor Moon";   language="Japones"; categories=@("Manga","Revista"); totalPrice=850;  deposit=300; isPaidInFull=$false; internationalOrder=$true; internationalCountry="Japon" },
    @{ orderNumber="PRE-2026-006"; clientNumber="CLI-003"; clientName="Maria Lopez";     clientPhone="81-5555-0001"; title="Evangelion 3.0+1.0 Artbook";      artist="Hideaki Anno";    groupName="EVA";           language="Japones"; categories=@("Revista");         totalPrice=1200; deposit=600; isPaidInFull=$false; internationalOrder=$true; internationalCountry="Japon" },
    @{ orderNumber="PRE-2026-007"; clientNumber="CLI-004"; clientName="Jorge Medina";    clientPhone="55-7777-3333"; title="Dragon Ball Super Vol. 4";         artist="Akira Toriyama";  groupName="Dragon Ball";   language="Español"; categories=@("Manga");           totalPrice=149;  deposit=50;  isPaidInFull=$false },
    @{ orderNumber="PRE-2026-008"; clientNumber="CLI-004"; clientName="Jorge Medina";    clientPhone="55-7777-3333"; title="Attack on Titan Vol. 34 Final";    artist="Hajime Isayama"; groupName="AoT";            language="Español"; categories=@("Manga");           totalPrice=159;  deposit=159; isPaidInFull=$true  },
    @{ orderNumber="PRE-2026-009"; clientNumber="CLI-005"; clientName="Sofia Ramirez";   clientPhone="55-2222-8888"; title="No Game No Life 1 (novela)";       artist="Yuu Kamiya";      groupName="NGNL";          language="Español"; categories=@("Revista");         totalPrice=380;  deposit=100; isPaidInFull=$false },
    @{ orderNumber="PRE-2026-010"; clientNumber="CLI-005"; clientName="Sofia Ramirez";   clientPhone="55-2222-8888"; title="Figura Rem - Re:Zero 1/8";         artist="Good Smile Co";   groupName="Re:Zero";       language="";        categories=@("Figura");          totalPrice=3200; deposit=1000;isPaidInFull=$false },
    @{ orderNumber="PRE-2026-011"; clientNumber="CLI-006"; clientName="Luis Fernandez";  clientPhone="55-4444-2121"; title="Spy x Family Vol. 10";             artist="Tatsuya Endo";    groupName="Spy x Family";  language="Español"; categories=@("Manga");           totalPrice=139;  deposit=139; isPaidInFull=$true  },
    @{ orderNumber="PRE-2026-012"; clientNumber="CLI-007"; clientName="Elena Vega";      clientPhone="44-6060-1010"; title="Oshi no Ko Vol. 1";                artist="Aka Akasaka";     groupName="Oshi no Ko";    language="Español"; categories=@("Manga");           totalPrice=149;  deposit=80;  isPaidInFull=$false; internationalOrder=$true; internationalCountry="Espana" },
    @{ orderNumber="PRE-2026-013"; clientNumber="CLI-007"; clientName="Elena Vega";      clientPhone="44-6060-1010"; title="Manga Smile Pack (coleccion)";     artist="Varios";          groupName="";              language="Español"; categories=@("Manga","Revista"); totalPrice=580;  deposit=200; isPaidInFull=$false; internationalOrder=$true; internationalCountry="Espana" },
    @{ orderNumber="PRE-2026-014"; clientNumber="CLI-008"; clientName="Roberto Diaz";    clientPhone="55-3333-7777"; title="Blue Lock Vol. 15";                artist="M. Kaneshiro";    groupName="Blue Lock";     language="Español"; categories=@("Manga");           totalPrice=159;  deposit=159; isPaidInFull=$true  },
    @{ orderNumber="PRE-2026-015"; clientNumber="CLI-009"; clientName="Valentina Cruz";  clientPhone="55-9999-1234"; title="Figura Miku Hatsune Concert";      artist="Max Factory";     groupName="Vocaloid";      language="";        categories=@("Figura");          totalPrice=2800; deposit=700; isPaidInFull=$false }
)

Write-Host "`n📦 Insertando $($ORDERS.Count) pedidos de prueba...`n" -ForegroundColor Cyan

$ok = 0; $fail = 0

foreach ($order in $ORDERS) {
    $body = $order | ConvertTo-Json -Depth 5
    try {
        $resp = Invoke-RestMethod -Uri "$BASE_URL/preventas" -Method POST `
            -Headers $HEADERS -Body $body -ContentType "application/json"
        Write-Host "  ✅ $($order.orderNumber) - $($order.title) [$($order.clientName)]" -ForegroundColor Green
        $ok++
    } catch {
        $errMsg = $_.Exception.Response | ForEach-Object { $_.StatusCode }
        Write-Host "  ❌ $($order.orderNumber) - Error: $($_.Exception.Message)" -ForegroundColor Red
        $fail++
    }
}

Write-Host "`n🎉 Listo! $ok insertados, $fail fallaron." -ForegroundColor Cyan
Write-Host "🌐 Abre https://pos-torlan.web.app > Preventas para ver los pedidos." -ForegroundColor White
