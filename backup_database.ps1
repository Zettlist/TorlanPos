# Script de Respaldo para Base de Datos Torlan POS
# Este script exporta la base de datos completa a un archivo SQL

# Configuración
$PROJECT_ID = "pos-torlan"
$INSTANCE_NAME = "torlan-mysql"
$DATABASE_NAME = "torlan_pos"
$BACKUP_DIR = ".\database_backups"
$TIMESTAMP = Get-Date -Format "yyyyMMdd_HHmmss"
$BUCKET_NAME = "pos-torlan-backups"

# Crear directorio de respaldos si no existe
if (-not (Test-Path $BACKUP_DIR)) {
    New-Item -ItemType Directory -Path $BACKUP_DIR | Out-Null
}

Write-Host "🔄 Iniciando respaldo de base de datos..." -ForegroundColor Cyan
Write-Host "📅 Timestamp: $TIMESTAMP" -ForegroundColor Gray
Write-Host ""

# IMPORTANTE: Primero debes crear el bucket de Cloud Storage
Write-Host "Verificando que el bucket de Cloud Storage existe..." -ForegroundColor Yellow
$bucketExists = gcloud storage buckets list --filter="name:$BUCKET_NAME" --format="value(name)" 2>$null

if (-not $bucketExists) {
    Write-Host "⚠️  El bucket no existe. Creándolo..." -ForegroundColor Yellow
    gcloud storage buckets create "gs://$BUCKET_NAME" `
        --project=$PROJECT_ID `
        --location=us-central1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Bucket creado exitosamente!" -ForegroundColor Green
    }
    else {
        Write-Host "❌ Error al crear el bucket. Abortando..." -ForegroundColor Red
        exit 1
    }
}

# Exportar base de datos a Cloud Storage
Write-Host "Exportando base de datos desde Cloud SQL..." -ForegroundColor Cyan
$BACKUP_URI = "gs://$BUCKET_NAME/backup_$TIMESTAMP.sql"

gcloud sql export sql $INSTANCE_NAME $BACKUP_URI `
    --database=$DATABASE_NAME `
    --project=$PROJECT_ID

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Respaldo en la nube creado exitosamente!" -ForegroundColor Green
    Write-Host "📦 Ubicación: $BACKUP_URI" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Para descargar localmente, ejecuta:" -ForegroundColor Yellow
    Write-Host "gcloud storage cp $BACKUP_URI $BACKUP_DIR\backup_$TIMESTAMP.sql" -ForegroundColor White
    Write-Host ""
    Write-Host "Para listar todos los respaldos:" -ForegroundColor Yellow
    Write-Host "gcloud storage ls gs://$BUCKET_NAME/" -ForegroundColor White
}
else {
    Write-Host ""
    Write-Host "❌ Error al crear el respaldo!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🎉 Proceso de respaldo completado!" -ForegroundColor Green
Write-Host ""
Write-Host "💡 NOTA IMPORTANTE:" -ForegroundColor Cyan
Write-Host "   - Los respaldos se guardan en Google Cloud Storage" -ForegroundColor Gray
Write-Host "   - Puedes restaurar desde cualquier respaldo usando:" -ForegroundColor Gray
Write-Host "     gcloud sql import sql $INSTANCE_NAME [BACKUP_URI] --database=$DATABASE_NAME" -ForegroundColor White
