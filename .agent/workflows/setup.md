---
description: Instalar dependencias y ejecutar el sistema Torlan POS
---

# Setup Torlan POS

Este workflow instala las dependencias del proyecto y ejecuta el sistema.

## Pasos:

// turbo-all

1. Instalar dependencias del backend:
```bash
cd torlan-pos/backend && npm install
```

2. Instalar dependencias del frontend:
```bash
cd torlan-pos/frontend && npm install
```

3. Iniciar el backend:
```bash
cd torlan-pos/backend && npm start
```

4. Iniciar el frontend:
```bash
cd torlan-pos/frontend && npm run dev
```

5. Abrir el navegador en http://localhost:5173
