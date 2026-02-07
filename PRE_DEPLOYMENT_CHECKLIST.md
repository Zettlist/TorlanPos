# ✅ Checklist de Pre-Despliegue - Torlan POS

Usa este checklist antes de desplegar a producción en Google Cloud Platform.

---

## 📝 1. Configuración de Google Cloud

- [ ] **Google Cloud SDK instalado y configurado**
  ```bash
  gcloud --version
  ```

- [ ] **Autenticado con cuenta de Google Cloud**
  ```bash
  gcloud auth login
  gcloud auth list
  ```

- [ ] **Proyecto de GCP creado/seleccionado**
  ```bash
  gcloud config get-value project
  ```

- [ ] **APIs habilitadas**
  ```bash
  gcloud services list --enabled
  ```
  Verifica que estén habilitadas:
  - `appengine.googleapis.com`
  - `sqladmin.googleapis.com`
  - `secretmanager.googleapis.com`
  - `cloudbuild.googleapis.com`

- [ ] **App Engine inicializado**
  ```bash
  gcloud app describe
  ```

---

## 🗄️ 2. Cloud SQL

- [ ] **Instancia de MySQL creada**
  ```bash
  gcloud sql instances list
  ```

- [ ] **Base de datos 'torlan_pos' creada**
  ```bash
  gcloud sql databases list --instance=torlan-mysql
  ```

- [ ] **Usuario de aplicación creado**
  ```bash
  gcloud sql users list --instance=torlan-mysql
  ```

- [ ] **Connection name obtenido**
  ```bash
  gcloud sql instances describe torlan-mysql --format="value(connectionName)"
  ```
  Formato esperado: `PROJECT_ID:REGION:INSTANCE_NAME`

- [ ] **Cloud SQL Proxy probado localmente** (opcional pero recomendado)
  ```bash
  cloud-sql-proxy YOUR_CONNECTION_NAME --port=3307
  ```

---

## 🔐 3. Secretos y Seguridad

- [ ] **JWT Secret generado y guardado en Secret Manager**
  ```bash
  gcloud secrets list | grep jwt-secret
  ```

- [ ] **Password de base de datos guardado en Secret Manager**
  ```bash
  gcloud secrets list | grep db-password
  ```

- [ ] **Permisos de Secret Manager configurados para App Engine**
  ```bash
  gcloud secrets get-iam-policy jwt-secret
  ```

- [ ] **Contraseñas fuertes usadas** (mínimo 16 caracteres, mezcla de mayúsculas, minúsculas, números y símbolos)

---

## ⚙️ 4. Configuración del Backend

- [ ] **app.yaml actualizado con connection name de Cloud SQL**
  ```yaml
  cloud_sql_instances: YOUR_PROJECT_ID:YOUR_REGION:YOUR_INSTANCE_NAME
  ```

- [ ] **Variables de entorno configuradas en app.yaml**
  - `NODE_ENV: "production"`
  - `TZ: "America/Mexico_City"`
  - `DB_HOST`
  - `DB_USER`
  - `DB_NAME`
  - `DB_PORT`

- [ ] **CORS configurado con dominio correcto** (no usar `*` en producción)
  Archivo: `backend/server.js`
  ```javascript
  origin: 'https://tu-dominio.com'
  ```

- [ ] **.gcloudignore configurado correctamente**
  Debe excluir:
  - `node_modules/`
  - `.env`
  - `*.log`
  - `.git/`

- [ ] **Puerto configurado dinámicamente**
  Archivo: `backend/server.js`
  ```javascript
  const PORT = process.env.PORT || 3000;
  ```

- [ ] **Dependencias actualizadas**
  ```bash
  cd backend
  npm install
  npm audit fix
  ```

---

## 🗃️ 5. Base de Datos

- [ ] **Schema de base de datos revisado**
  - Tablas necesarias definidas
  - Índices creados para optimización
  - Relaciones correctas entre tablas

- [ ] **Script de inicialización probado**
  ```bash
  node db/schema.js
  ```

- [ ] **Datos iniciales preparados** (si aplica)
  - Usuario admin inicial
  - Roles y permisos
  - Configuración base

- [ ] **Backup strategy definida**
  - Cloud SQL hace backups automáticos
  - Verifica configuración: `gcloud sql instances describe torlan-mysql`

---

## 🌐 6. Frontend

- [ ] **Variables de entorno de producción configuradas**
  Archivo: `frontend/.env.production`
  ```env
  VITE_API_URL=https://YOUR_BACKEND_URL
  ```

- [ ] **Build ejecutado sin errores**
  ```bash
  cd frontend
  npm run build
  ```

- [ ] **Tamaño del bundle verificado**
  - Revisar warnings sobre bundle size
  - Considerar code splitting si es muy grande

- [ ] **Firebase CLI instalado** (si usas Firebase Hosting)
  ```bash
  firebase --version
  ```

- [ ] **Firebase inicializado**
  ```bash
  firebase init hosting
  ```

- [ ] **Dominio personalizado configurado** (opcional)

---

## 🧪 7. Testing

- [ ] **Tests unitarios pasando**
  ```bash
  npm test
  ```

- [ ] **Funcionalidades críticas testeadas localmente**
  - Login/Logout
  - Registro de usuarios
  - Operaciones CRUD principales
  - Generación de reportes
  - Proceso de venta completo

- [ ] **Conexión a base de datos MySQL probada** (no SQLite)
  ```bash
  # Usando Cloud SQL Proxy
  cloud-sql-proxy YOUR_CONNECTION_NAME --port=3307
  # Luego conecta tu app local a localhost:3307
  ```

---

## 📊 8. Monitoreo y Logs

- [ ] **Cloud Logging configurado**
  ```bash
  gcloud logging logs list
  ```

- [ ] **Alertas configuradas** (opcional pero recomendado)
  - CPU alta
  - Errores frecuentes
  - Downtime

- [ ] **Conoces cómo ver logs en tiempo real**
  ```bash
  gcloud app logs tail -s default
  ```

---

## 💰 9. Costos y Facturación

- [ ] **Facturación habilitada en el proyecto**
  ```bash
  gcloud billing accounts list
  gcloud billing projects link YOUR_PROJECT_ID --billing-account=ACCOUNT_ID
  ```

- [ ] **Presupuesto configurado** (recomendado)
  - Configura alertas de presupuesto en la consola de GCP
  - Define límites de gasto

- [ ] **Tier de instancias apropiado seleccionado**
  - Desarrollo/Pruebas: `F1` (gratis) o `F2`
  - Producción pequeña: `F2` o `F4`
  - Producción mediana: `F4` o instancias escalables

---

## 🔄 10. Continuidad y Mantenimiento

- [ ] **Código versionado en Git**
  ```bash
  git status
  git log --oneline -5
  ```

- [ ] **README.md actualizado** con instrucciones de despliegue

- [ ] **Documentación de API actualizada** (si aplica)

- [ ] **Plan de rollback definido**
  - Sabes cómo revertir a versión anterior
  - Tienes backup de la base de datos

- [ ] **Contactos de emergencia definidos**
  - Acceso a cuenta de Google Cloud
  - Acceso a repositorio de código

---

## 🚀 11. Pre-Deploy Final

- [ ] **Última revisión de código**
  - No hay console.logs innecesarios
  - No hay credenciales hardcodeadas
  - No hay endpoints de debugging expuestos

- [ ] **Versión etiquetada en Git**
  ```bash
  git tag -a v1.0.0 -m "First production release"
  git push origin v1.0.0
  ```

- [ ] **Equipo notificado del despliegue**

- [ ] **Ventana de mantenimiento programada** (si aplica)

---

## ✅ Comando Final de Despliegue

Una vez que todo esté marcado:

### Backend:
```bash
cd backend
gcloud app deploy --project=YOUR_PROJECT_ID
```

### Frontend:
```bash
cd frontend
npm run build
firebase deploy --only hosting
```

---

## 📞 En Caso de Problemas

### Rollback Rápido

```bash
# Ver versiones anteriores
gcloud app versions list

# Rutear tráfico a versión anterior
gcloud app services set-traffic default --splits=VERSION_ID=1
```

### Verificar Estado de Servicios

```bash
# App Engine
gcloud app browse

# Cloud SQL
gcloud sql instances describe torlan-mysql

# Logs en vivo
gcloud app logs tail -s default
```

### Contactos de Soporte

- Google Cloud Support: https://cloud.google.com/support
- Documentación: https://cloud.google.com/docs

---

## 🎉 Post-Deployment

Una vez desplegado exitosamente:

- [ ] **Verificar que la aplicación carga correctamente**
- [ ] **Probar login con usuario de prueba**
- [ ] **Verificar funcionalidades críticas**
- [ ] **Monitorear logs por 24-48 horas**
- [ ] **Documentar cualquier issue encontrado**
- [ ] **Celebrar el despliegue exitoso! 🎊**

---

**Última actualización:** $(Get-Date -Format "yyyy-MM-dd")
**Versión del checklist:** 1.0.0
