# 🚀 Guía de Despliegue - Torlan POS en Google Cloud Platform

Esta guía te llevará paso a paso para desplegar el sistema Torlan POS en Google Cloud Platform.

## 📋 Prerrequisitos

✅ Ya tienes instalado:
- Google Cloud SDK
- Node.js y npm

✅ Necesitarás:
- Una cuenta de Google Cloud Platform
- Un proyecto de Google Cloud creado
- Tarjeta de crédito/débito para activar la cuenta (Google ofrece $300 de crédito gratuito)

---

## 🎯 Paso 1: Configurar Google Cloud Project

### 1.1 Inicializar gcloud CLI

Primero, verifica que gcloud esté instalado correctamente:

```bash
gcloud --version
```

### 1.2 Autenticarse con Google Cloud

```bash
gcloud auth login
```

Este comando abrirá tu navegador para que inicies sesión con tu cuenta de Google.

### 1.3 Listar proyectos existentes

```bash
gcloud projects list
```

### 1.4 Crear un nuevo proyecto (o seleccionar uno existente)

**Opción A: Crear nuevo proyecto**
```bash
gcloud projects create torlan-pos-prod --name="Torlan POS Production"
```

**Opción B: Usar proyecto existente**
```bash
gcloud config set project YOUR_PROJECT_ID
```

### 1.5 Habilitar APIs necesarias

```bash
# App Engine API
gcloud services enable appengine.googleapis.com

# Cloud SQL Admin API
gcloud services enable sqladmin.googleapis.com

# Secret Manager API
gcloud services enable secretmanager.googleapis.com

# Cloud Build API
gcloud services enable cloudbuild.googleapis.com
```

### 1.6 Configurar región para App Engine

```bash
# Para México, usa us-central1
gcloud app create --region=us-central1
```

---

## 🗄️ Paso 2: Crear Instancia de Cloud SQL (MySQL)

### 2.1 Crear la instancia

```bash
gcloud sql instances create torlan-mysql \
  --database-version=MYSQL_8_0 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --root-password=YOUR_STRONG_ROOT_PASSWORD \
  --availability-type=zonal \
  --backup-start-time=03:00
```

**Nota:** Para producción, considera usar `db-n1-standard-1` o superior en lugar de `db-f1-micro`.

### 2.2 Crear la base de datos

```bash
gcloud sql databases create torlan_pos \
  --instance=torlan-mysql \
  --charset=utf8mb4 \
  --collation=utf8mb4_unicode_ci
```

### 2.3 Crear usuario de la aplicación

```bash
gcloud sql users create torlan_user \
  --instance=torlan-mysql \
  --password=YOUR_APP_DB_PASSWORD
```

### 2.4 Obtener el nombre de conexión

```bash
gcloud sql instances describe torlan-mysql --format="value(connectionName)"
```

**Guarda este valor**, lo necesitarás para configurar `app.yaml`.

Ejemplo de salida: `torlan-pos-prod:us-central1:torlan-mysql`

---

## 🔐 Paso 3: Configurar Secretos en Secret Manager

### 3.1 Generar JWT Secret

```bash
# En PowerShell (Windows)
$bytes = New-Object Byte[] 32
(New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

### 3.2 Crear secretos

```bash
# JWT Secret
echo -n "YOUR_GENERATED_JWT_SECRET" | gcloud secrets create jwt-secret --data-file=-

# Database Password
echo -n "YOUR_APP_DB_PASSWORD" | gcloud secrets create db-password --data-file=-

# Database Root Password
echo -n "YOUR_STRONG_ROOT_PASSWORD" | gcloud secrets create db-root-password --data-file=-
```

### 3.3 Dar permisos a App Engine para acceder a los secretos

```bash
# Obtener el email del servicio de App Engine
PROJECT_ID=$(gcloud config get-value project)
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")

# Agregar permisos
gcloud secrets add-iam-policy-binding jwt-secret \
  --member="serviceAccount:${PROJECT_ID}@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding db-password \
  --member="serviceAccount:${PROJECT_ID}@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## ⚙️ Paso 4: Configurar el Backend

### 4.1 Actualizar app.yaml

Edita `backend/app.yaml` y actualiza la línea 27 con tu connection name:

```yaml
beta_settings:
  cloud_sql_instances: torlan-pos-prod:us-central1:torlan-mysql
```

### 4.2 Agregar variables de entorno secretas a app.yaml

Agrega estas líneas después de `env_variables`:

```yaml
env_variables:
  NODE_ENV: "production"
  TZ: "America/Mexico_City"
  DB_HOST: "/cloudsql/torlan-pos-prod:us-central1:torlan-mysql"
  DB_USER: "torlan_user"
  DB_NAME: "torlan_pos"
  DB_PORT: "3306"

# Para acceder a secretos
# Nota: También puedes usar Secret Manager directamente en el código
```

### 4.3 Verificar que .gcloudignore existe

El archivo `backend/.gcloudignore` debe excluir:

```
node_modules/
.env
.env.local
*.log
.git/
.gitignore
test/
*.test.js
```

### 4.4 Actualizar CORS en server.js

Edita `backend/server.js` y cambia:

```javascript
// Antes
origin: '*'

// Después (reemplaza con tu dominio real)
origin: 'https://tu-dominio.com'
```

---

## 🚢 Paso 5: Desplegar el Backend

### 5.1 Navegar al directorio del backend

```bash
cd "c:\Users\hable\Desktop\pos torlan\backend"
```

### 5.2 Instalar dependencias localmente (para verificar)

```bash
npm install
```

### 5.3 Inicializar la base de datos

**Opción A: Conectarse localmente usando Cloud SQL Proxy**

```bash
# Descargar Cloud SQL Proxy
gcloud components install cloud-sql-proxy

# Ejecutar el proxy en una terminal separada
cloud-sql-proxy torlan-pos-prod:us-central1:torlan-mysql --port=3306
```

En otra terminal, ejecuta tus scripts de inicialización:

```bash
# Crear las tablas
node db/schema.js

# Opcional: Cargar datos de prueba
node seed_bisonte_test.js
```

**Opción B: Usar Cloud Shell**

También puedes usar Google Cloud Shell en el navegador para conectarte directamente.

### 5.4 Desplegar a App Engine

```bash
gcloud app deploy --project=torlan-pos-prod
```

Responde `Y` cuando pregunte si deseas continuar.

### 5.5 Verificar el despliegue

```bash
# Ver la URL de tu aplicación
gcloud app browse

# Ver logs en tiempo real
gcloud app logs tail -s default
```

La URL será algo como: `https://torlan-pos-prod.uc.r.appspot.com`

---

## 🌐 Paso 6: Desplegar el Frontend

### 6.1 Opción A: Firebase Hosting (Recomendado)

#### Instalar Firebase CLI

```bash
npm install -g firebase-tools
```

#### Iniciar sesión

```bash
firebase login
```

#### Inicializar Firebase en el proyecto

```bash
cd "c:\Users\hable\Desktop\pos torlan\frontend"
firebase init hosting
```

Selecciona:
- Use an existing project → Selecciona tu proyecto
- Public directory → `dist`
- Configure as SPA → `Yes`
- Set up automatic builds → `No`

#### Actualizar la variable de entorno del backend

Crea o edita `frontend/.env.production`:

```env
VITE_API_URL=https://torlan-pos-prod.uc.r.appspot.com
```

#### Construir el frontend

```bash
npm run build
```

#### Desplegar a Firebase

```bash
firebase deploy --only hosting
```

Tu frontend estará disponible en: `https://torlan-pos-prod.web.app`

### 6.2 Opción B: Cloud Storage + Load Balancer

Si prefieres usar Cloud Storage, puedo proporcionarte los pasos adicionales.

---

## 🔄 Paso 7: Actualizar CORS con la URL del Frontend

Una vez que tengas la URL del frontend, actualiza el backend:

1. Edita `backend/server.js`
2. Cambia el CORS origin:

```javascript
origin: 'https://torlan-pos-prod.web.app'
```

3. Vuelve a desplegar:

```bash
cd backend
gcloud app deploy
```

---

## ✅ Paso 8: Verificación Final

### 8.1 Probar la aplicación

1. Abre tu frontend: `https://torlan-pos-prod.web.app`
2. Intenta hacer login con un usuario de prueba
3. Verifica las funcionalidades principales

### 8.2 Monitorear logs

```bash
# Logs del backend
gcloud app logs tail -s default

# Logs de Cloud SQL
gcloud sql operations list --instance=torlan-mysql

# Métricas de App Engine
gcloud app browse --logs
```

---

## 🔧 Comandos Útiles

### Ver estado de los servicios

```bash
# Listar versiones de App Engine
gcloud app versions list

# Ver instancias de Cloud SQL
gcloud sql instances list

# Ver secretos
gcloud secrets list
```

### Actualizar configuración

```bash
# Después de cambiar app.yaml
gcloud app deploy

# Después de cambiar el frontend
npm run build && firebase deploy
```

### Rollback a versión anterior

```bash
# Listar versiones
gcloud app versions list

# Cambiar el tráfico a una versión anterior
gcloud app services set-traffic default --splits=VERSION_ID=1
```

### Conectarse a Cloud SQL desde local

```bash
# Cloud SQL Proxy
cloud-sql-proxy torlan-pos-prod:us-central1:torlan-mysql --port=3307

# Ahora puedes conectarte con MySQL client
mysql -h 127.0.0.1 -P 3307 -u torlan_user -p torlan_pos
```

---

## 💰 Estimación de Costos

Para una pequeña aplicación con tráfico moderado:

- **App Engine F2 instance**: ~$50-100/mes
- **Cloud SQL db-f1-micro**: ~$15-25/mes
- **Firebase Hosting**: $0 (hasta 10GB/mes y 360MB/día)
- **Almacenamiento y transferencia**: ~$5-10/mes

**Total estimado**: ~$70-135/mes

Para minimizar costos:
- Usa el tier gratuito cuando sea posible
- Configura auto-scaling para reducir instancias en horarios de poco tráfico
- Monitorea el uso regularmente

---

## 🆘 Solución de Problemas Comunes

### Error: "The App Engine app does not exist"

```bash
gcloud app create --region=us-central1
```

### Error: "Permission denied" al desplegar

```bash
# Verificar permisos
gcloud projects get-iam-policy YOUR_PROJECT_ID

# Agregar rol de App Engine Admin
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="user:YOUR_EMAIL" \
  --role="roles/appengine.appAdmin"
```

### No se puede conectar a Cloud SQL

1. Verifica que el connection name sea correcto en `app.yaml`
2. Verifica que la instancia esté corriendo: `gcloud sql instances list`
3. Verifica los permisos de la cuenta de servicio de App Engine

### Frontend no se comunica con Backend

1. Verifica la URL en `.env.production`
2. Verifica la configuración de CORS en `server.js`
3. Revisa los logs del navegador (F12)
4. Revisa los logs de App Engine

---

## 📚 Recursos Adicionales

- [Documentación de App Engine](https://cloud.google.com/appengine/docs)
- [Documentación de Cloud SQL](https://cloud.google.com/sql/docs)
- [Firebase Hosting](https://firebase.google.com/docs/hosting)
- [Secret Manager](https://cloud.google.com/secret-manager/docs)

---

## 🎉 ¡Listo!

Tu aplicación Torlan POS debería estar corriendo en producción. Si encuentras algún problema, revisa los logs y la sección de solución de problemas.

Para actualizaciones futuras, simplemente:
1. Haz tus cambios en el código
2. Ejecuta `gcloud app deploy` (backend)
3. Ejecuta `npm run build && firebase deploy` (frontend)
