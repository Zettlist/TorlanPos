# Migraciones

**Nada de este directorio se ejecuta.** `server.js` ya no llama a
`runSchemaMigrations()`.

## Que hacian

Catorce funciones que, en cada arranque del servidor, comprobaban si existia una
columna o una tabla y la creaban con `ALTER` si faltaba: `migrate_employee_number`,
`migrate_product_image`, `migrate_tags`, `migrate_adult_content`,
`migrate_web_orders`, `migratePerformanceIndexes`…

Era la forma de evolucionar el esquema cuando no habia uno escrito en ningun
sitio: la estructura de la base era la suma de estos archivos aplicados en orden,
y para saber que columnas tenia `products` habia que leerlos todos.

## Por que se apagaron

`db/schema.sql` (repositorio Bisonteshop) es ahora la fuente unica y se carga
antes de levantar el servidor. Con eso, estas funciones no tienen nada que
crear.

Y ya no podian correr aunque se quisiera: `migrate_web_orders` indexa
`sales.web_status` y `migratePerformanceIndexes` indexa `products.sbin_code`, dos
columnas que el esquema nuevo no tiene — la primera porque el estado del pedido
web vive en `bisonte_orders`, la segunda porque `sbin_code` se unifico en `isbn`.
Ambas fallaban en cada arranque; el error se capturaba y solo se escribia al log,
asi que el POS parecia arrancar bien.

## Si hace falta cambiar el esquema

Se edita `db/schema.sql` y se anaden pruebas en `db/tests/`. Para una base ya en
produccion, el `ALTER` se escribe a mano y se aplica una vez — no en el arranque
de la aplicacion, donde se ejecuta por cada instancia y en paralelo.

Los archivos se conservan como registro de que columna aparecio cuando.
