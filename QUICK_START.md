# 🚀 Guía de Inicio Rápido - Despliegue en Google Cloud

## ⚠ IMPORTANTE: Configuración de PowerShell

Si ves errores sobre "la ejecución de scripts está deshabilitada", ejecuta esto **UNA VEZ** en PowerShell como administrador:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

## 📝 Pre-requisitos

✅ **Ya instalaste:**
- Google Cloud SDK

✅ **Necesitas hacer:**
1. Configurar gcloud CLI
2. Crear servicios en Google Cloud
3. Desplegar la aplicación

---

## 🎯 Opción 1: Script Automatizado (Recomendado)

### 1. Verificar el estado actual

```powershell
cd "c:\Users\hable\Desktop\pos torlan"
.\verify-gcp.ps1
```

Este script verifica:
- ✓ Google Cloud SDK instalado
- ✓ Autenticación configurada
- ✓ Proyecto creado
- ✓ APIs habilitadas
- ✓ Cloud SQL creado
- ✓ Secretos configurados

### 2. Ejecutar configuración automatizada

```powershell
.\setup-gcp.ps1
```

Este script:
1. Te guiará para crear o seleccionar un proyecto
2. Habilitará las APIs necesarias
3. Creará Cloud SQL (MySQL)
4. Generará contraseñas seguras
5. Guardará secretos en Secret Manager
6. Actualizará app.yaml
7. Generará un archivo .credentials.txt con toda la info

**IMPORTANTE:** El script puede tardar 10-15 minutos (Cloud SQL es lento al crear).

### 3. Inicializar la base de datos

Después de que se cree Cloud SQL, necesitas crear las tablas:

```powershell
# 1. Conectar Cloud SQL Proxy
cloud-sql-proxy YOUR_CONNECTION_NAME --port=3307
# (Deja esta terminal abierta)

# 2. En otra terminal, ejecuta:
cd backend
node db/schema.js
# Opcional: cargar datos de prueba
node seed_bisonte_test.js
```

### 4. Desplegar el backend

```powershell
.\deploy-backend.ps1
```

### 5. Configurar y desplegar frontend

```powershell
# Instalar Firebase CLI
npm install -g firebase-tools

# Configurar
cd frontend
firebase login
firebase init hosting

# Actualizar .env.production con la URL del backend
# VITE_API_URL=https://tu-proyecto.uc.r.appspot.com

# Build y deploy
npm run build
firebase deploy --only hosting
```

---

## 🎯 Opción 2: Manual (Paso a Paso)

Si prefieres hacer todo manualmente o si los scripts dan problemas:

### Paso 1: Autenticar con Google Cloud

Abre **Command Prompt (CMD)** o **PowerShell** y ejecuta:

```cmd
gcloud auth login
```

Esto abrirá tu navegador para que inicies sesión.

### Paso 2: Crear o seleccionar proyecto

```cmd
# Ver proyectos existentes
gcloud projects list

# Crear nuevo proyecto
gcloud projects create torlan-pos-prod --name="Torlan POS Production"

# Seleccionar proyecto
gcloud config set project torlan-pos-prod
```

### Paso 3: Habilitar APIs

```cmd
gcloud services enable appengine.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable cloudbuild.googleapis.com
```

### Paso 4: Crear App Engine

```cmd
gcloud app create --region=us-central1
```

### Paso 5: Crear Cloud SQL

```cmd
# Crear instancia (esto tarda ~10 minutos)
gcloud sql instances create torlan-mysql --database-version=MYSQL_8_0 --tier=db-f1-micro --region=us-central1 --root-password=TU_PASSWORD_SEGURA

# Crear base de datos
gcloud sql databases create torlan_pos --instance=torlan-mysql

# Crear usuario
gcloud sql users create torlan_user --instance=torlan-mysql --password=TU_PASSWORD_USUARIO

# Obtener connection name (GUÁRDALO)
gcloud sql instances describe torlan-mysql --format="value(connectionName)"
```

### Paso 6: Configurar Secretos

Genera un JWT secret seguro con PowerShell:

```powershell
[Convert]::ToBase64String((New-Object Byte[] 32))
```

Luego guárdalo en Secret Manager:

```cmd
echo TU_JWT_SECRET | gcloud secrets create jwt-secret --data-file=-
echo TU_PASSWORD_USUARIO | gcloud secrets create db-password --data-file=-
```

Dar permisos:

```cmd
gcloud secrets add-iam-policy-binding jwt-secret --member="serviceAccount:torlan-pos-prod@appspot.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding db-password --member="serviceAccount:torlan-pos-prod@appspot.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"
```

### Paso 7: Actualizar app.yaml

Edita `backend/app.yaml` y actualiza la línea 27:

```yaml
beta_settings:
  cloud_sql_instances: TU_PROJECT_ID:us-central1:torlan-mysql
```

También agrega variables de entorno en la sección `env_variables`:

```yaml
env_variables:
  NODE_ENV: "production"
  TZ: "America/Mexico_City"
  DB_HOST: "/cloudsql/TU_PROJECT_ID:us-central1:torlan-mysql"
  DB_USER: "torlan_user"
  DB_NAME: "torlan_pos"
  DB_PORT: "3306"
```

### Paso 8: Inicializar Base de Datos

```cmd
# Descargar Cloud SQL Proxy
gcloud components install cloud-sql-proxy

# Ejecutar proxy
cloud-sql-proxy TU_CONNECTION_NAME --port=3307
```

En otra terminal:

```cmd
cd backend
node db/schema.js
```

### Paso 9: Desplegar Backend

```cmd
cd backend
gcloud app deploy
```

### Paso 10: Desplegar Frontend

```cmd
# Instalar Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Configurar
cd frontend
firebase init hosting

# Actualizar .env.production
# VITE_API_URL=https://torlan-pos-prod.uc.r.appspot.com

# Build y deploy
npm run build
firebase deploy --only hosting
```

---

## 🔍 Verificación y Diagnóstico

### Ver logs del backend desplegado

```cmd
gcloud app logs tail -s default
```

### Abrir app en navegador

```cmd
gcloud app browse
```

### Verificar estado de Cloud SQL

```cmd
gcloud sql instances list
```

### Ver versiones desplegadas

```cmd
gcloud app versions list
```

---

## 🆘 Solución de Problemas

### Problema: comando `gcloud` no encontrado en PowerShell

**Solución:** Usa Command Prompt (CMD) en lugar de PowerShell, o reinicia PowerShell.

### Problema: Error de permisos al ejecutar scripts

**Solución:** 
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Problema: No se puede conectar a Cloud SQL

**Solución:**
1. Verifica que la instancia esté corriendo: `gcloud sql instances list`
2. Verifica el connection name en app.yaml
3. Asegúrate de que Cloud SQL Proxy esté corriendo

### Problema: Backend desplegado pero da error 500

**Solución:**
1. Revisa los logs: `gcloud app logs tail -s default`
2. Verifica que las variables de entorno estén correctas en app.yaml
3. Verifica que los secretos estén creados: `gcloud secrets list`

---

## 📚 Documentación Completa

Para más detalles, consulta:

- **DEPLOYMENT_GUIDE.md** - Guía completa paso a paso
- **PRE_DEPLOYMENT_CHECKLIST.md** - Checklist de verificación
- **.credentials.txt** - Credenciales generadas (si usaste setup-gcp.ps1)

---

## ⏱ Tiempo Estimado

- **Configuración inicial:** 20-30 minutos
- **Creación de Cloud SQL:** 10-15 minutos
- **Despliegue de backend:** 5-10 minutos
- **Despliegue de frontend:** 5 minutos

**Total:** ~40-60 minutos

---

## 💰 Costos Estimados

Con el plan gratuito de Google Cloud ($300 de crédito):

- **App Engine F2:** ~$50-100/mes
- **Cloud SQL db-f1-micro:** ~$15-25/mes
- **Firebase Hosting:** Gratis (tier básico)

**Total:** ~$65-125/mes (DESPUÉS de que se acabe el crédito gratuito)

---

## ✅ Checklist Rápido

- [ ] Google Cloud SDK instalado
- [ ] Autenticado con `gcloud auth login`
- [ ] Proyecto creado/seleccionado
- [ ] APIs habilitadas
- [ ] App Engine creado
- [ ] Cloud SQL creado y configurado
- [ ] Secretos guardados en Secret Manager
- [ ] app.yaml actualizado con connection name
- [ ] Base de datos inicializada
- [ ] Backend desplegado
- [ ] Frontend configurado y desplegado
- [ ] CORS actualizado en server.js con dominio real

---

## 🎉 ¡Listo!

Una vez completados todos los pasos, tu aplicación Torlan POS estará corriendo en producción en Google Cloud Platform.

**URL del backend:** https://tu-proyecto.uc.r.appspot.com
**URL del frontend:** https://tu-proyecto.web.app (o .firebaseapp.com)
