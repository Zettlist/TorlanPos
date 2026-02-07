# Script de Despliegue Rápido - Torlan POS Backend

Write-Host "====================================" -ForegroundColor Cyan
Write-Host "  Despliegue de Backend a GCP  " -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

function Write-Success { param($msg) Write-Host "✓ $msg" -ForegroundColor Green }
function Write-Error { param($msg) Write-Host "✗ $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "ℹ $msg" -ForegroundColor Yellow }
function Write-Step { param($msg) Write-Host "`n→ $msg" -ForegroundColor Cyan }

# Verificaciones previas
Write-Step "Verificando prerrequisitos..."

# 1. Verificar que estamos en el directorio correcto
$backendPath = Join-Path $PSScriptRoot "backend"
if (-not (Test-Path $backendPath)) {
    Write-Error "No se encuentra el directorio backend"
    exit 1
}

# 2. Verificar app.yaml
$appYamlPath = Join-Path $backendPath "app.yaml"
if (-not (Test-Path $appYamlPath)) {
    Write-Error "No se encuentra backend/app.yaml"
    exit 1
}

# 3. Verificar que app.yaml esté configurado
$appYamlContent = Get-Content $appYamlPath -Raw
if ($appYamlContent -match 'YOUR_PROJECT_ID|YOUR_REGION|YOUR_INSTANCE_NAME') {
    Write-Error "app.yaml contiene valores de placeholder. Ejecuta setup-gcp.ps1 primero."
    Write-Info "O actualiza manualmente el connection name en app.yaml"
    exit 1
}

Write-Success "Prerrequisitos OK"

# 4. Verificar proyecto configurado
Write-Step "Verificando proyecto GCP..."
$project = gcloud config get-value project 2>$null
if (-not $project -or $project -eq "None") {
    Write-Error "No hay proyecto configurado"
    Write-Info "Ejecuta: gcloud config set project YOUR_PROJECT_ID"
    exit 1
}
Write-Success "Proyecto: $project"

# 5. Verificar autenticación
$account = gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>&1
if ($LASTEXITCODE -ne 0 -or -not $account) {
    Write-Error "No estás autenticado"
    Write-Info "Ejecuta: gcloud auth login"
    exit 1
}
Write-Success "Autenticado como: $account"

# 6. Instalar dependencias
Write-Step "Instalando dependencias..."
Push-Location $backendPath
try {
    Write-Info "Ejecutando npm install..."
    npm install 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Dependencias instaladas"
    } else {
        Write-Error "Error al instalar dependencias"
        exit 1
    }
} finally {
    Pop-Location
}

# 7. Mostrar resumen de configuración
Write-Step "Configuración actual:"
$connectionName = $appYamlContent | Select-String -Pattern 'cloud_sql_instances:\s*(.+)' | ForEach-Object { $_.Matches.Groups[1].Value.Trim() }
Write-Host "  Cloud SQL: $connectionName" -ForegroundColor White

$instanceClass = $appYamlContent | Select-String -Pattern 'instance_class:\s*(.+)' | ForEach-Object { $_.Matches.Groups[1].Value.Trim() }
Write-Host "  Instance: $instanceClass" -ForegroundColor White

# 8. Confirmar despliegue
Write-Host ""
Write-Host "⚠ IMPORTANTE:" -ForegroundColor Yellow
Write-Host "  - Esto desplegará el backend a Google Cloud App Engine" -ForegroundColor White
Write-Host "  - El proceso puede tomar varios minutos" -ForegroundColor White
Write-Host "  - Se generarán costos en tu cuenta de Google Cloud" -ForegroundColor White
Write-Host ""

$confirm = Read-Host "¿Deseas continuar con el despliegue? (s/n)"
if ($confirm -ne "s") {
    Write-Info "Despliegue cancelado"
    exit 0
}

# 9. Desplegar
Write-Step "Desplegando a App Engine..."
Write-Info "Esto puede tomar 5-10 minutos..."

Push-Location $backendPath
try {
    gcloud app deploy --quiet --project=$project
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Despliegue completado exitosamente!"
        
        # Obtener URL
        Write-Step "Información del despliegue:"
        $url = "https://$project.uc.r.appspot.com"
        Write-Host "  URL: $url" -ForegroundColor Green
        
        # Mostrar versión
        $version = gcloud app versions list --service=default --sort-by=~version.createTime --limit=1 --format="value(version.id)" 2>$null
        if ($version) {
            Write-Host "  Versión: $version" -ForegroundColor White
        }
        
        Write-Host "`n¿Deseas abrir la aplicación en el navegador? (s/n)" -ForegroundColor Cyan
        $openBrowser = Read-Host
        if ($openBrowser -eq "s") {
            Start-Process $url
        }
        
        Write-Host "`n¿Deseas ver los logs en tiempo real? (s/n)" -ForegroundColor Cyan
        $showLogs = Read-Host
        if ($showLogs -eq "s") {
            Write-Info "Presiona Ctrl+C para salir de los logs"
            Start-Sleep -Seconds 2
            gcloud app logs tail -s default
        }
        
    } else {
        Write-Error "Error durante el despliegue"
        Write-Info "Revisa los errores arriba para más detalles"
        exit 1
    }
} finally {
    Pop-Location
}

Write-Host "`n====================================" -ForegroundColor Green
Write-Host "  DESPLIEGUE COMPLETADO  " -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green
Write-Host ""
Write-Host "Comandos útiles:" -ForegroundColor Cyan
Write-Host "  gcloud app browse              # Abrir en navegador" -ForegroundColor Gray
Write-Host "  gcloud app logs tail           # Ver logs en vivo" -ForegroundColor Gray
Write-Host "  gcloud app versions list       # Listar versiones" -ForegroundColor Gray
Write-Host ""
