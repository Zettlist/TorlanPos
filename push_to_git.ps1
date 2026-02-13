# Script para Configurar Git y Subir el Proyecto

Write-Host "🚧 Inicializando Repositorio Git..." -ForegroundColor Cyan

# 1. Verificar si git está instalado
if (!(Get-Command "git" -ErrorAction SilentlyContinue)) {
    Write-Error "❌ Git no está instalado o no está en el PATH."
    Write-Host "👉 Por favor instala Git desde: https://git-scm.com/downloads" -ForegroundColor Yellow
    exit 1
}

# 2. Inicializar repositorio si no existe
if (!(Test-Path ".git")) {
    git init
    Write-Host "✅ Repositorio inicializado." -ForegroundColor Green
}
else {
    Write-Host "ℹ️ El repositorio ya existe." -ForegroundColor Yellow
}

# 3. Agregar archivos
Write-Host "📦 Agregando archivos..." -ForegroundColor Cyan
git add .

# 4. Hacer commit
Write-Host "💾 Guardando cambios (Commit)..." -ForegroundColor Cyan
git commit -m "Respaldo completo del proyecto POS Torlan"

# 5. Configurar remoto
Write-Host "`n⚠️  ATENCIÓN:" -ForegroundColor Yellow
Write-Host "Para subir esto a internet, necesitas crear un repositorio VACÍO en GitHub, GitLab o Bitbucket."
$repoUrl = Read-Host "👉 Pega aquí el link de tu repositorio (ej: https://github.com/usuario/pos-torlan.git)"

if (![string]::IsNullOrWhiteSpace($repoUrl)) {
    # Remover origen anterior si existe
    git remote remove origin 2>$null
    
    # Agregar nuevo origen
    git remote add origin $repoUrl
    
    Write-Host "🚀 Subiendo archivos..." -ForegroundColor Cyan
    git push -u origin master
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✅ ¡PROYECTO SUBIDO CON ÉXITO!" -ForegroundColor Green
        Write-Host "🔗 Lo puedes ver en: $repoUrl" -ForegroundColor Green
    }
    else {
        Write-Error "❌ Hubo un error al subir. Verifica tus credenciales o el link del repositorio."
        Write-Host "Si es la primera vez, es posible que la rama principal se llame 'main' en lugar de 'master'. Intentando con main..." -ForegroundColor Yellow
        git push -u origin main
    }
}
else {
    Write-Host "❌ No ingresaste un link. Los archivos se guardaron localmente pero no se subieron." -ForegroundColor Red
}

Pause
