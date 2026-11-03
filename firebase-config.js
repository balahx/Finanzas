/* Configuración de la sincronización (Firebase).
   Si FIREBASE_CONFIG es null, la app funciona igual pero sin sincronizar.
   Estos valores NO son secretos (van en cualquier app web). La seguridad la dan las reglas de
   Firestore (firestore.rules): cada persona solo puede leer y escribir sus propios datos. */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBF7Vm46s7ULgJumGS7QjGPn7RPdgzmY9A",
  authDomain: "finanzas-47d94.firebaseapp.com",
  projectId: "finanzas-47d94",
  storageBucket: "finanzas-47d94.firebasestorage.app",
  messagingSenderId: "252350504065",
  appId: "1:252350504065:web:55ae39b29f441dafab8180"
};
