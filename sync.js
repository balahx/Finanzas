'use strict';
/* =========================================================
   Sincronización entre dispositivos (Firebase Auth + Firestore)

   - SyncEngine: lógica de sincronización por registro. No depende de Firebase,
     así se puede probar con una "nube" simulada.
   - FirebaseRemote: adaptador que usa el SDK de Firebase (se descarga solo si
     la sincronización está configurada).

   Cada registro (gasto, categoría, meta, deuda, inversión, presupuesto de un mes,
   ajustes y perfil) es un documento en  users/{uid}/records/{tipo__id}.
   Si dos dispositivos editan lo mismo, gana el cambio más reciente.
   Los borrados se propagan con una "lápida" (deleted: true).
   ========================================================= */
(function (root) {
  const ARRAY_KINDS = ['transactions', 'categories', 'goals', 'debts', 'investments', 'loans', 'notices', 'recurring'];
  const FB_VERSION = '13.1.0'; // versión del SDK que usa la documentación oficial de Firebase

  /* ---------- Utilidades ---------- */
  // Hash rápido (cyrb53) para detectar si un registro cambió sin guardar copias completas.
  function hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }

  // Convierte el estado de la app en un mapa  clave → {tipo, id, json}
  function listRecords(state) {
    const out = new Map();
    for (const kind of ARRAY_KINDS) {
      for (const r of state[kind] || []) {
        if (r && r.id != null) out.set(`${kind}__${r.id}`, { kind, id: String(r.id), json: JSON.stringify(r) });
      }
    }
    for (const [month, v] of Object.entries(state.budgets || {})) out.set(`budgets__${month}`, { kind: 'budgets', id: month, json: JSON.stringify(v) });
    out.set('settings__settings', { kind: 'settings', id: 'settings', json: JSON.stringify(state.settings || {}) });
    if (state.profile) out.set('profile__profile', { kind: 'profile', id: 'profile', json: JSON.stringify(state.profile) });
    return out;
  }

  // Aplica un registro remoto (o su borrado, obj = null) sobre el estado local.
  function applyRecord(state, kind, id, obj) {
    if (ARRAY_KINDS.includes(kind)) {
      const arr = state[kind] || (state[kind] = []);
      const i = arr.findIndex(r => String(r.id) === id);
      if (obj === null) { if (i >= 0) arr.splice(i, 1); }
      else if (i >= 0) arr[i] = obj;
      else arr.push(obj);
    } else if (kind === 'budgets') {
      state.budgets = state.budgets || {};
      if (obj === null) delete state.budgets[id]; else state.budgets[id] = obj;
    } else if (kind === 'settings') {
      if (obj) state.settings = { ...state.settings, ...obj };
    } else if (kind === 'profile') {
      state.profile = obj;
    }
  }

  /* =========================================================
     Motor de sincronización
     ========================================================= */
  class SyncEngine {
    constructor({ getState, remote, storage, now, debounceMs = 1500, onRemoteChange, onInitialPull, onStatus, prefix = 'finanzas.sync.' }) {
      this.getState = getState; this.remote = remote; this.storage = storage;
      this.now = now || (() => Date.now());
      this.debounceMs = debounceMs; this.prefix = prefix;
      this.onRemoteChange = onRemoteChange; this.onInitialPull = onInitialPull; this.onStatus = onStatus;
      this.uid = null; this.meta = null; this.initialPulled = false;
      this.pushing = false; this.again = false; this.timer = null; this.retryTimer = null; this.retryMs = 10000;
      this.unsub = null; this.last = 0;
    }

    /* ---- almacenamiento local de la "libreta" de sincronización ---- */
    _load(uid) {
      try { const raw = this.storage.getItem(this.prefix + uid); if (raw) { const m = JSON.parse(raw); return { base: m.base || {}, dirty: m.dirty || {}, cursor: m.cursor || 0 }; } } catch (e) { /* empieza de cero */ }
      return { base: {}, dirty: {}, cursor: 0 };
    }
    _persist() { try { this.storage.setItem(this.prefix + this.uid, JSON.stringify(this.meta)); } catch (e) { /* sin espacio: se recalcula la próxima vez */ } }
    _status(state, message) {
      if (state === 'ok') this.last = this.now();
      if (this.onStatus) this.onStatus({ state, last: this.last, message: message ? String(message.message || message) : '', code: (message && message.code) || '' });
    }

    stats() {
      if (!this.meta) return { known: 0, pending: 0 };
      return { known: Object.values(this.meta.base).filter(b => b.h !== null).length, pending: Object.keys(this.meta.dirty).length };
    }

    /* ---- ciclo de vida ---- */
    start(uid) {
      this.stop();
      this.uid = uid; this.meta = this._load(uid); this.initialPulled = false;
      this._status('syncing');
      if (this.remote.bind) this.remote.bind(uid);
      // Importante: no se sube nada hasta recibir la primera respuesta real del servidor,
      // para que un dispositivo nuevo no pise datos de la nube con valores por defecto.
      this.unsub = this.remote.subscribe(this.meta.cursor, (docs, info) => {
        this._applyRemote(docs);
        if (!(info && info.fromCache) && !this.initialPulled) {
          this.initialPulled = true;
          if (this.onInitialPull) this.onInitialPull();
          this.pushNow();
        }
      }, err => this._status('error', err));
    }
    stop() {
      if (this.unsub) { try { this.unsub(); } catch (e) { /* nada */ } this.unsub = null; }
      clearTimeout(this.timer); clearTimeout(this.retryTimer);
      this.uid = null; this.initialPulled = false; this.pushing = false;
    }

    /* ---- detectar cambios locales ---- */
    _scan() {
      const local = listRecords(this.getState()), t = this.now(), { base, dirty } = this.meta;
      for (const [key, l] of local) {
        const h = hash(l.json), b = base[key];
        if (!b || b.h !== h) { if (!dirty[key] || dirty[key].h !== h) dirty[key] = { t, h }; }
        else delete dirty[key];
      }
      for (const key of Object.keys(base)) {
        if (local.has(key)) continue;
        if (base[key].h !== null) { if (!dirty[key] || dirty[key].h !== null) dirty[key] = { t, h: null }; }
        else delete dirty[key];
      }
      return local;
    }
    notifyLocalChange() {
      if (!this.uid || !this.initialPulled) return;
      this._scan(); this._persist();
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.pushNow(), this.debounceMs);
    }

    /* ---- subir cambios ---- */
    async pushNow() {
      if (!this.uid || !this.initialPulled) return;
      if (this.pushing) { this.again = true; return; }
      this.pushing = true; clearTimeout(this.retryTimer);
      const uid = this.uid;
      try {
        do {
          this.again = false;
          const local = this._scan(), { base, dirty } = this.meta, ops = [];
          for (const [key, l] of local) {
            const h = hash(l.json), b = base[key];
            if (!b || b.h !== h) ops.push({ key, kind: l.kind, id: l.id, json: l.json, deleted: false, u: (dirty[key] && dirty[key].t) || this.now(), h });
          }
          for (const [key, b] of Object.entries(base)) {
            if (b.h !== null && !local.has(key)) {
              const kind = key.split('__')[0];
              ops.push({ key, kind, id: key.slice(kind.length + 2), json: '', deleted: true, u: (dirty[key] && dirty[key].t) || this.now(), h: null });
            }
          }
          if (!ops.length) break;
          this._status('syncing');
          await this.remote.push(ops);
          if (this.uid !== uid) return; // se cerró la sesión mientras se subía
          for (const op of ops) {
            base[op.key] = { h: op.h, u: op.u };
            if (dirty[op.key] && dirty[op.key].h === op.h) delete dirty[op.key];
          }
          this._persist();
        } while (this.again);
        this.retryMs = 10000;
        this._status('ok');
      } catch (e) {
        this._status('error', e);
        this._scheduleRetry();
      } finally { this.pushing = false; }
    }
    _scheduleRetry() {
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => this.pushNow(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, 300000);
    }

    /* ---- recibir cambios de la nube ---- */
    _applyRemote(docs) {
      if (!docs || !docs.length || !this.uid) return false;
      const state = this.getState(), local = listRecords(state), { base, dirty } = this.meta;
      let changed = false;
      for (const d of docs) {
        this.meta.cursor = Math.max(this.meta.cursor, d.ts || 0);
        const key = d.key, b = base[key], l = local.get(key);
        const lh = l ? hash(l.json) : null, bh = b ? b.h : null, rh = d.deleted ? null : hash(d.json);
        if (lh === rh) { base[key] = { h: rh, u: d.u }; delete dirty[key]; continue; } // ya es igual (por ejemplo, eco de lo que subimos)
        if (lh !== bh) { // hay cambio local pendiente: gana el más reciente
          const lu = (dirty[key] && dirty[key].t) || 0;
          if (lu > d.u) continue;
        }
        let obj = null;
        if (!d.deleted) { try { obj = JSON.parse(d.json); } catch (e) { continue; } }
        applyRecord(state, d.kind, d.id, obj);
        if (obj === null) local.delete(key); else local.set(key, { kind: d.kind, id: d.id, json: d.json });
        base[key] = { h: rh, u: d.u }; delete dirty[key]; changed = true;
      }
      this._persist();
      if (changed && this.onRemoteChange) this.onRemoteChange();
      if (this.initialPulled) this._status('ok');
      return changed;
    }
  }

  /* =========================================================
     Adaptador de Firebase (Auth con correo/contraseña + Firestore)
     ========================================================= */
  class FirebaseRemote {
    constructor(config) { this.config = config; this.m = null; }
    async init() {
      if (this.m) return;
      const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}/`;
      const [app, auth, fs] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
      this.m = { app, auth, fs };
      this.app = app.initializeApp(this.config);
      this.auth = auth.getAuth(this.app);
      this.db = fs.getFirestore(this.app);
    }
    onAuth(cb) { return this.m.auth.onAuthStateChanged(this.auth, u => cb(u ? { uid: u.uid, email: u.email } : null)); }
    signIn(email, password) { return this.m.auth.signInWithEmailAndPassword(this.auth, email, password); }
    signUp(email, password) { return this.m.auth.createUserWithEmailAndPassword(this.auth, email, password); }
    resetPassword(email) { return this.m.auth.sendPasswordResetEmail(this.auth, email); }
    signOut() { return this.m.auth.signOut(this.auth); }
    bind(uid) { this.col = this.m.fs.collection(this.db, 'users', uid, 'records'); }
    async push(ops) {
      const { writeBatch, doc, serverTimestamp } = this.m.fs;
      for (let i = 0; i < ops.length; i += 400) { // Firestore admite hasta 500 operaciones por lote
        const batch = writeBatch(this.db);
        for (const op of ops.slice(i, i + 400)) {
          batch.set(doc(this.col, op.key), { kind: op.kind, id: op.id, json: op.json, deleted: op.deleted, u: op.u, ts: serverTimestamp() });
        }
        await batch.commit();
      }
    }
    // Escucha solo lo cambiado desde la última vez (ahorra lecturas del plan gratuito).
    subscribe(cursor, onDocs, onError) {
      const { query, where, onSnapshot, Timestamp } = this.m.fs;
      // Se retrocede 60 s por seguridad: si llega algo ya conocido, el motor lo ignora (es idéntico).
      const q = query(this.col, where('ts', '>=', Timestamp.fromMillis(Math.max(0, cursor - 60000))));
      return onSnapshot(q, snap => {
        const docs = [];
        snap.docChanges().forEach(ch => {
          if (ch.type === 'removed') return;
          const d = ch.doc;
          if (d.metadata.hasPendingWrites) return; // escritura propia aún sin confirmar por el servidor
          const x = d.data();
          if (!x.ts) return;
          docs.push({ key: d.id, kind: x.kind, id: x.id, json: x.json, deleted: !!x.deleted, u: x.u, ts: x.ts.toMillis() });
        });
        onDocs(docs, { fromCache: snap.metadata.fromCache });
      }, onError);
    }
  }

  const api = { SyncEngine, FirebaseRemote, listRecords, applyRecord, hash, ARRAY_KINDS, FB_VERSION, remoteFactory: cfg => new FirebaseRemote(cfg) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FinanzasSync = api;
})(typeof window !== 'undefined' ? window : globalThis);
