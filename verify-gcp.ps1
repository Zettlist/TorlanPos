# Script de Verificación Rápida - Estado del Despliegue en GCP

Write-Host "====================================" -ForegroundColor Cyan
Write-Host "  Verificación de Estado GCP  " -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

function Write-Check {
    param($msg, $status)
    if ($status) {
        Write-Host "V $msg" -ForegroundColor Green
    }
    else {
        Write-Host "X $msg" -ForegroundColor Red
    }
}

function Write-Info { param($msg) Write-Host "  $msg" -ForegroundColor White }

# 1. Verificar gcloud CLI
Write-Host "`n1. Google Cloud SDK" -ForegroundColor Yellow
try {
    $version = gcloud --version 2>&1 | Select-Object -First 1
    Write-Check "Google Cloud SDK instalado" $true
    Write-Info $version
}
catch {
    Write-Check "Google Cloud SDK instalado" $false
    Write-Info "gcloud no encontrado. Continuando con otras verificaciones..."
}

# 2. Verificar autenticación
Write-Host "`n2. Autenticación" -ForegroundColor Yellow
$account = gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>&1
if ($LASTEXITCODE -eq 0 -and $account) {
    Write-Check "Autenticado" $true
    Write-Info "Cuenta: $account"
}
else {
    Write-Check "Autenticado" $false
    Write-Info "Ejecuta: gcloud auth login"
}

# 3. Verificar proyecto
Write-Host "`n3. Proyecto" -ForegroundColor Yellow
$project = gcloud config get-value project 2>$null
if ($project -and $project -ne "None") {
    Write-Check "Proyecto configurado" $true
    Write-Info "Proyecto: $project"
}
else {
    Write-Check "Proyecto configurado" $false
    Write-Info "Ejecuta: gcloud config set project YOUR_PROJECT_ID"
}

# 4. Verificar APIs habilitadas
Write-Host "`n4. APIs Habilitadas" -ForegroundColor Yellow
$requiredApis = @(
    "appengine.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudbuild.googleapis.com"
)

foreach ($api in $requiredApis) {
    $enabled = gcloud services list --enabled --filter="name:$api" --format="value(name)" 2>&1
    $apiName = $api -replace '\.googleapis\.com$', ''
    Write-Check "$apiName" ($LASTEXITCODE -eq 0 -and $enabled)
}

# 5. Verificar App Engine
Write-Host "`n5. App Engine" -ForegroundColor Yellow
$appEngine = gcloud app describe 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Check "App Engine inicializado" $true
    $region = gcloud app describe --format="value(locationId)" 2>$null
    Write-Info "Región: $region"
    
    # Listar versiones
    $versions = gcloud app versions list --format="value(id)" 2>&1
    if ($LASTEXITCODE -eq 0 -and $versions) {
        Write-Info "Versiones desplegadas: $($versions -split "`n" | Measure-Object | Select-Object -ExpandProperty Count)"
    }
}
else {
    Write-Check "App Engine inicializado" $false
    Write-Info "Ejecuta: gcloud app create --region=us-central1"
}

# 6. Verificar Cloud SQL
Write-Host "`n6. Cloud SQL" -ForegroundColor Yellow
$instances = gcloud sql instances list --format="value(name)" 2>&1
if ($LASTEXITCODE -eq 0 -and $instances) {
    Write-Check "Instancia Cloud SQL creada" $true
    foreach ($instance in $instances -split "`n") {
        if ($instance) {
            Write-Info "Instancia: $instance"
            $status = gcloud sql instances describe $instance --format="value(state)" 2>$null
            Write-Info "  Estado: $status"
            $connectionName = gcloud sql instances describe $instance --format="value(connectionName)" 2>$null
            Write-Info "  Connection: $connectionName"
        }
    }
}
else {
    Write-Check "Instancia Cloud SQL creada" $false
}

# 7. Verificar Secretos
Write-Host "`n7. Secret Manager" -ForegroundColor Yellow
$secrets = @("jwt-secret", "db-password", "db-root-password")
foreach ($secret in $secrets) {
    $exists = gcloud secrets describe $secret 2>&1
    Write-Check $secret ($LASTEXITCODE -eq 0)
}

# 8. Verificar archivos de configuración local
Write-Host "`n8. Archivos de Configuración" -ForegroundColor Yellow
$files = @{
    "backend/app.yaml"            = "Configuración de App Engine"
    "backend/.gcloudignore"       = "Exclusiones de despliegue"
    "DEPLOYMENT_GUIDE.md"         = "Guía de despliegue"
    "PRE_DEPLOYMENT_CHECKLIST.md" = "Checklist de pre-despliegue"
}

foreach ($file in $files.Keys) {
    $path = Join-Path $PSScriptRoot $file
    $exists = Test-Path $path
    Write-Check $files[$file] $exists
    if ($exists -and $file -eq "backend/app.yaml") {
        # Verificar si app.yaml tiene connection name configurado
        $content = Get-Content $path -Raw
        if ($content -match 'cloud_sql_instances:\s*YOUR_PROJECT') {
            Write-Info "  ⚠ app.yaml necesita actualización (cloud_sql_instances)" -ForegroundColor Yellow
        }
    }
}

# 9. Verificar dependencias del proyecto
Write-Host "`n9. Dependencias del Proyecto" -ForegroundColor Yellow
$backendNodeModules = Test-Path (Join-Path $PSScriptRoot "backend/node_modules")
Write-Check "Backend dependencies instaladas" $backendNodeModules

$frontendNodeModules = Test-Path (Join-Path $PSScriptRoot "frontend/node_modules")
Write-Check "Frontend dependencies instaladas" $frontendNodeModules

# 10. Verificar Firebase CLI (para frontend)
Write-Host "`n10. Firebase CLI (Frontend)" -ForegroundColor Yellow
try {
    $firebaseVersion = firebase --version 2>&1
    Write-Check "Firebase CLI instalada" $true
    Write-Info "Versión: $firebaseVersion"
}
catch {
    Write-Check "Firebase CLI instalada" $false
    Write-Info "Para instalar: npm install -g firebase-tools"
}

# Resumen final
Write-Host "`n====================================" -ForegroundColor Cyan
Write-Host "  RESUMEN  " -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

if ($project -and $project -ne "None") {
    Write-Host "`nPara ver el estado en la consola web:" -ForegroundColor White
    Write-Host "https://console.cloud.google.com/home/dashboard?project=$project" -ForegroundColor Cyan
    
    Write-Host "`nComandos útiles:" -ForegroundColor White
    Write-Host "gcloud app browse                    # Ver app desplegada" -ForegroundColor Gray
    Write-Host "gcloud app logs tail -s default      # Ver logs en vivo" -ForegroundColor Gray
    Write-Host "gcloud sql instances list            # Listar instancias SQL" -ForegroundColor Gray
    Write-Host "gcloud app versions list             # Listar versiones" -ForegroundColor Gray
}

Write-Host ""
