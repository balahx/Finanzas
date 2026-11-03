# Activar la sincronización iPhone ↔ PC (gratis)

La app ya trae la sincronización lista. Solo falta crear **tu propio proyecto gratuito de Firebase** (Google) y pegar su configuración. Toma unos 10 minutos. No pide tarjeta de crédito (plan *Spark*).

> Importante: la sincronización **no funciona abriendo `index.html` con doble clic** (dirección `file://`). Necesita `https://` o `http://localhost`. Para el iPhone igualmente necesitas publicar la app en `https` (ver README).

## 1. Crear el proyecto
1. Entra a https://console.firebase.google.com con tu cuenta Google.
2. **Crear un proyecto** → ponle un nombre (ej. `mis-finanzas`). Puedes desactivar Google Analytics.

## 2. Registrar la app web y copiar la configuración
1. En la página del proyecto, pulsa el ícono **`</>` (Web)** → ponle un apodo → *Registrar app* (no marques Hosting).
2. Te mostrará un bloque `firebaseConfig = { apiKey: ..., authDomain: ..., projectId: ... }`.
3. Abre `firebase-config.js` y reemplaza `window.FIREBASE_CONFIG = null;` por:

```js
window.FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```
Estos valores no son secretos; la seguridad la dan las reglas del paso 4.

## 3. Activar el inicio de sesión con correo
**Compilación → Authentication → Comenzar → Método de acceso → Correo electrónico/contraseña → Habilitar → Guardar.**

## 4. Crear la base de datos y las reglas
1. **Compilación → Firestore Database → Crear base de datos.** Elige una ubicación cercana (por ejemplo `southamerica-east1`, São Paulo) y el modo *producción*.
2. Pestaña **Reglas** → pega el contenido de `firestore.rules` (cada persona solo accede a sus datos) → **Publicar**.

## 5. Autorizar la dirección donde publiques la app
**Authentication → Configuración → Dominios autorizados → Agregar dominio** y pon el dominio de tu hosting (ej. `tuusuario.github.io`). `localhost` ya viene autorizado.

## 6. Usarla
1. Publica la carpeta (con `firebase-config.js` ya completado) en tu hosting https y vuelve a cargarla.
2. En el primer dispositivo: **Ajustes → Sincronización → Crear cuenta**.
3. En el otro dispositivo: **Iniciar sesión** con el mismo correo (o “Ya tengo cuenta” en la pantalla de bienvenida). Los datos se traen solos.

## Cómo funciona (resumen)
- Primero se guarda en el dispositivo (funciona sin internet); cuando hay conexión se sube cada registro (gasto, meta, deuda, etc.).
- Si editas lo mismo en dos dispositivos, **gana el cambio más reciente**. Los borrados también se sincronizan.
- “Borrar todos los datos”, importar un respaldo o cargar datos de ejemplo **también se aplican en la nube** y en tus otros dispositivos; la app te lo advierte.
- Al cerrar sesión los datos quedan en el dispositivo. Si luego entras con **otra** cuenta, se combinarán con ella.
- Sigue haciendo respaldos `.json` de vez en cuando.

## Límites del plan gratuito
Firestore (Spark) incluye una cuota diaria de lecturas y escrituras muy superior al uso personal de esta app (que solo lee lo que cambió). Si algún día se superara, el servicio se pausa hasta el mes siguiente, sin cobros. Revisa las cuotas vigentes en la documentación de Firebase.
