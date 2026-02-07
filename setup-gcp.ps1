# Script de Configuración Automatizada para Google Cloud
# Este script ayuda a configurar los servicios necesarios para desplegar Torlan POS

Write-Host "====================================" -ForegroundColor Cyan
Write-Host "  Torlan POS - Setup Google Cloud  " -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# Colores para mensajes
function Write-Success { param($msg) Write-Host "✓ $msg" -ForegroundColor Green }
function Write-Error { param($msg) Write-Host "✗ $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "ℹ $msg" -ForegroundColor Yellow }
function Write-Step { param($msg) Write-Host "`n→ $msg" -ForegroundColor Cyan }

# Verificar que gcloud esté instalado
Write-Step "Verificando Google Cloud SDK..."
try {
    $gcloudVersion = gcloud --version 2>&1 | Select-Object -First 1
    Write-Success "Google Cloud SDK instalado: $gcloudVersion"
} catch {
    Write-Error "Google Cloud SDK no está instalado"
    Write-Info "Descárgalo desde: https://cloud.google.com/sdk/docs/install"
    exit 1
}

# Verificar autenticación
Write-Step "Verificando autenticación..."
$currentAccount = gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>&1
if ($LASTEXITCODE -eq 0 -and $currentAccount) {
    Write-Success "Autenticado como: $currentAccount"
} else {
    Write-Info "No estás autenticado. Ejecutando 'gcloud auth login'..."
    gcloud auth login
}

# Obtener o configurar proyecto
Write-Step "Configurando proyecto..."
$currentProject = gcloud config get-value project 2>$null
if ($currentProject -and $currentProject -ne "None") {
    Write-Host "Proyecto actual: $currentProject" -ForegroundColor White
    $useCurrentProject = Read-Host "¿Deseas usar este proyecto? (s/n)"
    if ($useCurrentProject -eq "n") {
        $currentProject = $null
    }
}

if (-not $currentProject) {
    Write-Host "`nProyectos disponibles:" -ForegroundColor White
    gcloud projects list
    Write-Host ""
    
    $createNew = Read-Host "¿Deseas crear un nuevo proyecto? (s/n)"
    if ($createNew -eq "s") {
        $projectId = Read-Host "ID del nuevo proyecto (ej: torlan-pos-prod)"
        $projectName = Read-Host "Nombre del proyecto (ej: Torlan POS Production)"
        
        Write-Info "Creando proyecto..."
        gcloud projects create $projectId --name="$projectName"
        $currentProject = $projectId
    } else {
        $currentProject = Read-Host "ID del proyecto a usar"
    }
    
    gcloud config set project $currentProject
}

Write-Success "Usando proyecto: $currentProject"

# Preguntar configuraciones
Write-Step "Configuración de servicios..."
$region = Read-Host "Región para App Engine (default: us-central1)"
if (-not $region) { $region = "us-central1" }

$instanceName = Read-Host "Nombre de instancia Cloud SQL (default: torlan-mysql)"
if (-not $instanceName) { $instanceName = "torlan-mysql" }

$dbName = Read-Host "Nombre de base de datos (default: torlan_pos)"
if (-not $dbName) { $dbName = "torlan_pos" }

$dbUser = Read-Host "Usuario de base de datos (default: torlan_user)"
if (-not $dbUser) { $dbUser = "torlan_user" }

# Habilitar APIs
Write-Step "Habilitando APIs necesarias..."
$apis = @(
    "appengine.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudbuild.googleapis.com"
)

foreach ($api in $apis) {
    Write-Info "Habilitando $api..."
    gcloud services enable $api --project=$currentProject
}
Write-Success "APIs habilitadas"

# Verificar si App Engine ya está creado
Write-Step "Configurando App Engine..."
$appExists = gcloud app describe --project=$currentProject 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Info "Creando App Engine en región $region..."
    gcloud app create --region=$region --project=$currentProject
    Write-Success "App Engine creado"
} else {
    Write-Success "App Engine ya existe"
}

# Generar contraseñas seguras
Write-Step "Generando contraseñas seguras..."
function New-SecurePassword {
    param([int]$Length = 20)
    $bytes = New-Object Byte[] $Length
    (New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($bytes)
    return [Convert]::ToBase64String($bytes).Substring(0, $Length)
}

$dbRootPassword = New-SecurePassword -Length 24
$dbPassword = New-SecurePassword -Length 24
$jwtSecret = [Convert]::ToBase64String((New-Object Byte[] 32))
(New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes((New-Object Byte[] 32))

Write-Success "Contraseñas generadas"

# Crear Cloud SQL
Write-Step "Creando instancia de Cloud SQL..."
$sqlExists = gcloud sql instances describe $instanceName --project=$currentProject 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Info "Esto puede tomar varios minutos..."
    gcloud sql instances create $instanceName `
        --database-version=MYSQL_8_0 `
        --tier=db-f1-micro `
        --region=$region `
        --root-password=$dbRootPassword `
        --availability-type=zonal `
        --backup-start-time=03:00 `
        --project=$currentProject
    Write-Success "Instancia Cloud SQL creada"
} else {
    Write-Success "Instancia Cloud SQL ya existe"
}

# Crear base de datos
Write-Step "Creando base de datos..."
gcloud sql databases create $dbName `
    --instance=$instanceName `
    --charset=utf8mb4 `
    --collation=utf8mb4_unicode_ci `
    --project=$currentProject 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Success "Base de datos '$dbName' creada"
} else {
    Write-Info "La base de datos puede que ya exista"
}

# Crear usuario
Write-Step "Creando usuario de base de datos..."
gcloud sql users create $dbUser `
    --instance=$instanceName `
    --password=$dbPassword `
    --project=$currentProject 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Success "Usuario '$dbUser' creado"
} else {
    Write-Info "El usuario puede que ya exista"
}

# Obtener connection name
Write-Step "Obteniendo información de conexión..."
$connectionName = gcloud sql instances describe $instanceName --format="value(connectionName)" --project=$currentProject
Write-Success "Connection Name: $connectionName"

# Crear secretos en Secret Manager
Write-Step "Guardando secretos en Secret Manager..."

function New-Secret {
    param($name, $value)
    $exists = gcloud secrets describe $name --project=$currentProject 2>&1
    if ($LASTEXITCODE -ne 0) {
        echo $value | gcloud secrets create $name --data-file=- --project=$currentProject
        Write-Success "Secreto '$name' creado"
    } else {
        Write-Info "Secreto '$name' ya existe"
    }
}

New-Secret "jwt-secret" $jwtSecret
New-Secret "db-password" $dbPassword
New-Secret "db-root-password" $dbRootPassword

# Dar permisos a App Engine
Write-Step "Configurando permisos..."
$serviceAccount = "${currentProject}@appspot.gserviceaccount.com"

foreach ($secret in @("jwt-secret", "db-password")) {
    gcloud secrets add-iam-policy-binding $secret `
        --member="serviceAccount:$serviceAccount" `
        --role="roles/secretmanager.secretAccessor" `
        --project=$currentProject 2>&1 | Out-Null
}
Write-Success "Permisos configurados"

# Actualizar app.yaml
Write-Step "Actualizando app.yaml..."
$appYamlPath = Join-Path $PSScriptRoot "backend\app.yaml"
if (Test-Path $appYamlPath) {
    $content = Get-Content $appYamlPath -Raw
    $content = $content -replace 'cloud_sql_instances: .*', "cloud_sql_instances: $connectionName"
    
    # Agregar variables de entorno si no existen
    if ($content -notmatch "DB_HOST:") {
        $envVars = @"

  DB_HOST: "/cloudsql/$connectionName"
  DB_USER: "$dbUser"
  DB_NAME: "$dbName"
  DB_PORT: "3306"
"@
        $content = $content -replace '(env_variables:.*?TZ:.*?)"', "`$1`"$envVars"
    }
    
    Set-Content $appYamlPath $content
    Write-Success "app.yaml actualizado"
} else {
    Write-Error "No se encontró backend/app.yaml"
}

# Guardar credenciales en archivo
Write-Step "Guardando credenciales..."
$credentialsPath = Join-Path $PSScriptRoot ".credentials.txt"
$credentials = @"
===================================
TORLAN POS - Credenciales GCP
===================================
Fecha: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

PROYECTO: $currentProject
REGIÓN: $region

CLOUD SQL:
  Instance: $instanceName
  Connection Name: $connectionName
  Database: $dbName
  User: $dbUser
  Password: $dbPassword
  Root Password: $dbRootPassword

SECRETOS:
  JWT Secret: $jwtSecret

URLS:
  Backend (después de deploy): https://$currentProject.uc.r.appspot.com
  
IMPORTANTE: Guarda este archivo en un lugar seguro y NO lo subas a Git
===================================
"@

Set-Content $credentialsPath $credentials
Write-Success "Credenciales guardadas en: $credentialsPath"

# Resumen final
Write-Host "`n====================================" -ForegroundColor Green
Write-Host "  CONFIGURACIÓN COMPLETADA  " -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green
Write-Host ""
Write-Host "✓ Proyecto configurado: $currentProject" -ForegroundColor Green
Write-Host "✓ Cloud SQL creado: $instanceName" -ForegroundColor Green
Write-Host "✓ Base de datos creada: $dbName" -ForegroundColor Green
Write-Host "✓ Secretos guardados en Secret Manager" -ForegroundColor Green
Write-Host "✓ app.yaml actualizado" -ForegroundColor Green
Write-Host ""
Write-Host "PRÓXIMOS PASOS:" -ForegroundColor Cyan
Write-Host "1. Revisa el archivo .credentials.txt (¡NO lo subas a Git!)" -ForegroundColor White
Write-Host "2. Conecta Cloud SQL Proxy para inicializar la base de datos:" -ForegroundColor White
Write-Host "   cloud-sql-proxy $connectionName --port=3307" -ForegroundColor Yellow
Write-Host "3. Ejecuta los scripts de inicialización de DB" -ForegroundColor White
Write-Host "4. Actualiza CORS en backend/server.js" -ForegroundColor White
Write-Host "5. Despliega el backend:" -ForegroundColor White
Write-Host "   cd backend && gcloud app deploy" -ForegroundColor Yellow
Write-Host "6. Configura y despliega el frontend" -ForegroundColor White
Write-Host ""
Write-Host "Para más detalles, consulta DEPLOYMENT_GUIDE.md" -ForegroundColor Cyan
Write-Host ""
