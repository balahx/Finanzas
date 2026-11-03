# Mis Finanzas

App de finanzas personales que funciona en **iPhone** y **Windows** con el mismo código (PWA: app web instalable, también funciona sin conexión).

## Qué incluye (versión 1)

- **Gastos e ingresos**, con categorías y notas.
- **Vista semanal, quincenal o mensual** (la eliges tú): resumen, desglose por categoría, promedio diario y comparación con los últimos 6 periodos. Quincena = días 1–15 y 16–fin de mes. La semana puede empezar en lunes o domingo.
- **Presupuesto mensual** por categoría, con equivalente por quincena y por semana, y opción de copiar el del mes anterior.
- **Metas y ahorros**: monto objetivo, fecha, historial de ahorros y cuánto necesitas ahorrar por mes/semana para llegar a tiempo.
- **Ahorro desde Inicio**: botón ＋ Ahorro junto a Gasto e Ingreso. El ahorro se descuenta del saldo (saldo = ingresos − gastos − ahorros − préstamos). Si no tienes metas, te ofrece crear un **ahorro mensual** (monto a ahorrar cada mes) y registra el primer ahorro. Inicio y Metas muestran el total ahorrado, lo ahorrado en el mes y el avance del plan mensual.
- **Préstamos a otras personas**: nombre, fecha del préstamo y fecha de cobro (opcional). Se descuenta de tu saldo al prestar y vuelve al registrar cobros. Sección **Préstamos** (menú lateral; en el celular dentro de “Más”) con vista por persona y por préstamo, alertas de cobros atrasados y por vencer. Accesos rápidos en Inicio.
- Ahorros, préstamos y cobros aparecen en la lista de movimientos y en el balance semanal/quincenal/mensual/anual.
- **Deudas y vencimientos**: saldo, cuota, próximo vencimiento, alertas de vencida / por vencer, registro de pagos (avanza el vencimiento y puede registrar el pago como gasto).
- **Inversiones**: monto invertido, valor actual, resultado en $ y %, distribución por tipo.
- **Resumen anual**: ingresos, gastos, ahorro neto y tasa de ahorro del año; gráfico y tabla mes a mes; promedios por mes/quincena/semana/día; mes de mayor y menor gasto; cumplimiento del presupuesto; comparación con el mismo periodo del año anterior; categorías donde más gastaste; ahorro en metas, pagos de deudas y situación actual (ahorros + inversiones − deudas). También hay un resumen del año en Inicio.
- **Perfil y cumpleaños**: al abrir la app por primera vez pide tu nombre y fecha de nacimiento (se pueden editar en Ajustes). El día de tu cumpleaños aparece un banner de saludo al entrar.
- **Modo claro y oscuro**: sigue automáticamente el modo de tu teléfono o computador.
- **Respaldo**: exportar / importar todos los datos en un archivo `.json`.

En el celular la barra inferior tiene 5 pestañas (Inicio, Gastos, Presupuesto, Metas y **Más**, que agrupa Deudas, Inversiones, Resumen anual y Ajustes). En el computador todas las secciones están en el menú lateral.

## Probarla en Windows (ahora mismo)

Haz doble clic en `index.html`. Se abre en el navegador y ya funciona. Los datos quedan guardados en ese navegador.

> Para instalarla como app, el navegador necesita servirla desde `https://` o `localhost` (ver abajo).

## Probarla con un servidor local

Si tienes Python instalado, en esta carpeta:

```
python -m http.server 8123
```

y abre http://localhost:8123. Desde ahí Edge/Chrome ofrecen **Instalar app**.

## Usarla en el iPhone

iPhone solo instala PWAs servidas por **HTTPS**, así que hay que publicar la carpeta en un hosting estático (gratis). Opciones: GitHub Pages, Netlify, Cloudflare Pages o Vercel. Una vez publicada:

1. Abre la dirección en **Safari**.
2. Compartir → **Agregar a pantalla de inicio**.

En Windows: Edge/Chrome → ícono de instalar en la barra de direcciones.

## Sincronización entre iPhone y PC

Incluida y gratuita (Firebase, plan Spark, sin tarjeta). Hasta que la configures, la app funciona igual pero solo en el dispositivo. Pasos en **SINCRONIZACION.md**.

## Datos y privacidad

Los datos se guardan primero en el dispositivo (almacenamiento del navegador). Si activas la sincronización, se copian a **tu propio** proyecto de Firebase, protegido por tu cuenta (reglas en `firestore.rules`). Si borras los datos del navegador sin sincronización, se pierden: haz respaldos `.json` de vez en cuando.

## Próximos pasos sugeridos

1. Gastos recurrentes y recordatorios de vencimientos.
2. Gráficos de evolución (gasto por periodo, patrimonio).
3. Para publicar en App Store / Google Play: empaquetar la PWA (por ejemplo con Capacitor).

## Archivos

| Archivo | Función |
|---|---|
| `index.html` | Página principal |
| `app.js` | Toda la lógica de la app |
| `sync.js` | Motor de sincronización + conexión con Firebase |
| `firebase-config.js` | Aquí pegas la configuración de tu proyecto Firebase |
| `firestore.rules` | Reglas de seguridad para pegar en Firestore |
| `SINCRONIZACION.md` | Guía paso a paso para activar la sincronización |
| `styles.css` | Estilos (modo claro/oscuro, móvil y escritorio) |
| `manifest.webmanifest` | Datos para instalar como app |
| `sw.js` | Funcionamiento sin conexión |
| `icon.svg`, `icon-*.png` | Íconos |
