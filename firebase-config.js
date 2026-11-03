/* Configuración de la sincronización (Firebase).
   Mientras esto sea null, la app funciona igual pero sin sincronizar (solo en este dispositivo).
   Para activarla sigue SINCRONIZACION.md y pega aquí la configuración de tu proyecto, por ejemplo:

   window.FIREBASE_CONFIG = {
     apiKey: "...",
     authDomain: "tu-proyecto.firebaseapp.com",
     projectId: "tu-proyecto",
     storageBucket: "tu-proyecto.firebasestorage.app",
     messagingSenderId: "...",
     appId: "..."
   };

   Estos valores NO son secretos (van en cualquier app web). La seguridad la dan las reglas de
   Firestore (firestore.rules): cada persona solo puede leer y escribir sus propios datos. */
window.FIREBASE_CONFIG = null;
