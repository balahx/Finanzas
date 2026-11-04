'use strict';
/* =========================================================
   Mis Finanzas — PWA de finanzas personales (v1, datos locales)
   Funciona en iPhone (Safari) y Windows (Edge/Chrome).
   Los datos se guardan en el dispositivo (localStorage).
   ========================================================= */

/* ---------- Utilidades ---------- */
const $ = (s, el = document) => el.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => toISO(new Date());
const addDays = (iso, n) => { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
const daysBetween = (a, b) => Math.round((fromISO(b) - fromISO(a)) / 86400000);
const monthKey = iso => iso.slice(0, 7);
const sum = (arr, f = x => x) => arr.reduce((a, x) => a + f(x), 0);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function addMonths(iso, n) {
  const d = fromISO(iso), day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISO(d);
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const mon3 = i => MONTHS[i].slice(0, 3);

function fmtDate(iso) {
  const d = fromISO(iso);
  const y = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${DAYS[d.getDay()]} ${d.getDate()} ${mon3(d.getMonth())}${y}`;
}
const fmtShort = iso => { const d = fromISO(iso); return `${d.getDate()} ${mon3(d.getMonth())}`; };
const fmtPct = p => `${p >= 0 ? '+' : ''}${p.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/* ---------- Estado y almacenamiento ---------- */
const KEY = 'finanzas.v1';
const APP_VERSION = '12'; // súbela junto con sw.js e index.html en cada actualización
const CURRENCIES = ['CLP', 'USD', 'EUR', 'ARS', 'PEN', 'COP', 'MXN', 'BRL', 'UYU'];
const DEFAULT_CATS = [
  { id: 'alimentacion', name: 'Alimentación', emoji: '🛒', type: 'expense' },
  { id: 'transporte', name: 'Transporte', emoji: '🚌', type: 'expense' },
  { id: 'vivienda', name: 'Vivienda', emoji: '🏠', type: 'expense' },
  { id: 'servicios', name: 'Cuentas y servicios', emoji: '💡', type: 'expense' },
  { id: 'salud', name: 'Salud', emoji: '🩺', type: 'expense' },
  { id: 'educacion', name: 'Educación', emoji: '📚', type: 'expense' },
  { id: 'ocio', name: 'Ocio', emoji: '🎬', type: 'expense' },
  { id: 'ropa', name: 'Ropa', emoji: '👕', type: 'expense' },
  { id: 'deudas', name: 'Deudas', emoji: '💳', type: 'expense' },
  { id: 'otros', name: 'Otros gastos', emoji: '📦', type: 'expense' },
  { id: 'sueldo', name: 'Sueldo', emoji: '💼', type: 'income' },
  { id: 'extra', name: 'Otros ingresos', emoji: '💰', type: 'income' },
  { id: 'prestamo', name: 'Préstamos recibidos', emoji: '', type: 'income' }
];
const INV_KINDS = ['Acciones', 'Fondos mutuos', 'ETF', 'Criptomonedas', 'Depósito a plazo', 'APV / AFP', 'Inmuebles', 'Otro'];

function defaults() {
  return {
    version: 1,
    profile: null,
    settings: { currency: 'CLP', periodMode: 'week', weekStart: 1, notify: { loans: true, debts: true, savings: true, birthday: true } },
    categories: DEFAULT_CATS.map(c => ({ ...c })),
    transactions: [], budgets: {}, goals: [], debts: [], investments: [], loans: []
  };
}
function migrate(data) {
  const d = defaults();
  const s = { ...d, ...data, settings: { ...d.settings, ...(data.settings || {}), notify: { ...d.settings.notify, ...((data.settings || {}).notify || {}) } } };
  for (const k of ['categories', 'transactions', 'goals', 'debts', 'investments', 'loans']) if (!Array.isArray(s[k])) s[k] = d[k];
  if (!s.budgets || typeof s.budgets !== 'object' || Array.isArray(s.budgets)) s.budgets = {};
  const p = s.profile;
  if (!p || typeof p.name !== 'string' || !p.name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(p.birthdate || '')) s.profile = null;
  s.goals.forEach(g => { if (!Array.isArray(g.contributions)) g.contributions = []; });
  s.debts.forEach(x => { if (!Array.isArray(x.payments)) x.payments = []; });
  s.loans.forEach(x => { if (!Array.isArray(x.payments)) x.payments = []; x.person = String(x.person || ''); x.dueDate = x.dueDate || ''; });
  s.investments.forEach(x => { if (!Array.isArray(x.history)) x.history = []; });
  return s;
}
let state = load();
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { console.warn('No se pudo leer el almacenamiento', e); }
  return defaults();
}
function persistLocal() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast('No se pudo guardar en este dispositivo'); }
}
function save() {
  persistLocal();
  if (cloud.engine) cloud.engine.notifyLocalChange(); // si hay sesión de sincronización, sube los cambios
}
const cloud = { cfg: window.FIREBASE_CONFIG || null, remote: null, engine: null, user: null, phase: 'off', error: '', status: { state: 'idle', last: 0, message: '' } };
/* Avisos cerrados / mostrados: se guardan solo en este dispositivo (no se sincronizan) */
const NOTICE_KEY = 'finanzas.notices';
function loadNotices() {
  try {
    const n = JSON.parse(localStorage.getItem(NOTICE_KEY) || '{}'), lim = toISO(new Date(Date.now() - 400 * 864e5));
    const clean = o => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => typeof v === 'string' && v >= lim)); // olvida avisos de hace más de ~13 meses
    return { dismissed: clean(n.dismissed), shown: clean(n.shown), intro: !!n.intro };
  } catch (e) { return { dismissed: {}, shown: {}, intro: false }; }
}
let N = loadNotices();
const saveNotices = () => { try { localStorage.setItem(NOTICE_KEY, JSON.stringify(N)); } catch (e) { /* sin almacenamiento: solo se pierde el registro */ } };
const ui = { refDate: today(), budgetDate: today(), year: new Date().getFullYear(), bdayClosed: false, day: today(), loanTab: 'persons', loanPerson: null };
const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

function money(n) {
  const c = state.settings.currency;
  const dec = ['CLP', 'COP', 'JPY', 'PYG'].includes(c) ? 0 : 2;
  const v = n || 0, sign = v < 0 ? '-' : '';
  try {
    return sign + new Intl.NumberFormat('es-CL', { style: 'currency', currency: c, minimumFractionDigits: dec, maximumFractionDigits: dec }).format(Math.abs(v));
  } catch (e) { return `${Math.round(v)} ${c}`; }
}

/* ---------- Periodos (semana / quincena / mes) ---------- */
const mkPeriod = (s, e) => ({ start: toISO(s), end: toISO(e) });
function periodOf(mode, iso) {
  const d = fromISO(iso), y = d.getFullYear(), m = d.getMonth();
  if (mode === 'month') return mkPeriod(new Date(y, m, 1), new Date(y, m + 1, 0));
  if (mode === 'fortnight') {
    return d.getDate() <= 15 ? mkPeriod(new Date(y, m, 1), new Date(y, m, 15)) : mkPeriod(new Date(y, m, 16), new Date(y, m + 1, 0));
  }
  const diff = (d.getDay() - Number(state.settings.weekStart) + 7) % 7;
  const s = new Date(y, m, d.getDate() - diff);
  const e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
  return mkPeriod(s, e);
}
function shiftPeriod(mode, p, dir) {
  if (mode === 'week') return periodOf(mode, addDays(p.start, 7 * dir));
  return periodOf(mode, dir > 0 ? addDays(p.end, 1) : addDays(p.start, -1));
}
function periodLabel(mode, p) {
  if (mode === 'month') { const d = fromISO(p.start); return `${cap(MONTHS[d.getMonth()])} ${d.getFullYear()}`; }
  const q = mode === 'fortnight' ? (fromISO(p.start).getDate() === 1 ? '1ª quincena' : '2ª quincena') : 'Semana';
  return `${q} · ${fmtShort(p.start)} – ${fmtShort(p.end)}`;
}
function shortLabel(mode, p) {
  const a = fromISO(p.start), b = fromISO(p.end);
  if (mode === 'month') return `${cap(mon3(a.getMonth()))} ${a.getFullYear()}`;
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${mon3(b.getMonth())}`
    : `${a.getDate()} ${mon3(a.getMonth())}–${b.getDate()} ${mon3(b.getMonth())}`;
}
const MODE_NAMES = { week: 'semanal', fortnight: 'quincenal', month: 'mensual' };

/* ---------- Cálculos ---------- */
const inRange = (iso, p) => iso >= p.start && iso <= p.end;
const txIn = p => state.transactions.filter(t => inRange(t.date, p));
const txSort = (a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0);
function sums(list) {
  let inc = 0, exp = 0; const byCat = {};
  for (const t of list) {
    if (t.type === 'income') inc += t.amount;
    else { exp += t.amount; byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount; }
  }
  return { inc, exp, bal: inc - exp, byCat };
}
/* Flujos de un periodo: ingresos − gastos − ahorros − préstamos entregados + cobros de préstamos */
function flows(p) {
  const s = sums(txIn(p));
  const borrowed = sum(txIn(p).filter(t => t.type === 'income' && t.debtId), t => t.amount); // préstamos solicitados (ya incluidos en ingresos)
  let sav = 0, lent = 0, back = 0;
  for (const g of state.goals) for (const c of g.contributions) if (inRange(c.date, p)) sav += c.amount;
  for (const l of state.loans) {
    if (inRange(l.startDate, p)) lent += l.amount;
    for (const x of l.payments) if (inRange(x.date, p)) back += x.amount;
  }
  const loanNet = lent - back;
  return { ...s, borrowed, sav, lent, back, loanNet, bal: s.inc - s.exp - sav - loanNet };
}
function movesIn(p) {
  const out = txIn(p).map(t => ({ k: 'tx', t, date: t.date, ts: t.createdAt || 0 }));
  for (const g of state.goals) for (const c of g.contributions) if (inRange(c.date, p)) out.push({ k: 'sav', g, c, date: c.date, ts: 0 });
  for (const l of state.loans) {
    if (inRange(l.startDate, p)) out.push({ k: 'loan', l, date: l.startDate, ts: l.createdAt || 0 });
    for (const x of l.payments) if (inRange(x.date, p)) out.push({ k: 'lpay', l, x, date: x.date, ts: 0 });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
}
/* ---------- Íconos de trazo y monogramas (sin emojis en la interfaz) ---------- */
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${extra}>${d}</svg>`;
const ICON = {
  home: svg('<path d="M4 11 L12 4 L20 11 V20 H14 V14 H10 V20 H4 Z"/>'),
  gastos: svg('<path d="M6 3 H18 V21 L15 19 L12 21 L9 19 L6 21 Z"/><path d="M9 8 H15 M9 12 H15"/>'),
  presupuesto: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>'),
  metas: svg('<path d="M6 21 V4"/><path d="M6 5 H18 L15 9 L18 13 H6"/>'),
  deudas: svg('<rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M3 10.5 H21"/><path d="M7 15 H10"/>'),
  inversiones: svg('<path d="M4 17 L10 11 L14 15 L20 7"/><path d="M15 7 H20 V12"/>'),
  anual: svg('<path d="M5 20 V11 M12 20 V5 M19 20 V14"/>'),
  ajustes: svg('<path d="M4 7 H20 M4 17 H20"/><circle cx="9" cy="7" r="2.5" fill="currentColor"/><circle cx="15" cy="17" r="2.5" fill="currentColor"/>'),
  mas: svg('<path d="M4 7 H20 M4 12 H20 M4 17 H20"/>'),
  prestamos: svg('<path d="M4 8 H17 L14 5"/><path d="M20 16 H7 L10 19"/>')
};
// Símbolo "Órbita + Sigma" (versión para fondo burdeos)
const LOGO = s => `<svg width="${s}" height="${s}" viewBox="-6 -6 112 112" aria-hidden="true"><circle cx="50" cy="50" r="40" fill="none" stroke="#F1E9DC" stroke-width="7.5" stroke-dasharray="190 61" transform="rotate(-40 50 50)"/><circle cx="54.18" cy="10.22" r="7.5" fill="#D9B26F"/><path d="M64 34 H36 L52 50 L36 66 H64" fill="none" stroke="#F1E9DC" stroke-width="7.5" stroke-linejoin="miter"/></svg>`;
const mono = (c, sm) => `<span class="mono${sm ? ' sm' : ''}" aria-hidden="true">${esc((c.name || '?').trim().charAt(0).toUpperCase())}</span>`;
const catById = id => state.categories.find(c => c.id === id) || { name: 'Sin categoría', emoji: '' };
const debtRemaining = d => Math.max(0, d.total - sum(d.payments, p => p.amount));
const goalSaved = g => sum(g.contributions, c => c.amount);
const invGain = i => i.current - i.invested;
const monthOf = iso => periodOf('month', iso);
const goalMonthSaved = (g, iso = today()) => { const p = monthOf(iso); return sum(g.contributions.filter(c => inRange(c.date, p)), c => c.amount); };
function savingsSummary(iso = today()) {
  const active = state.goals.filter(g => goalInfo(g).left > 0 && g.monthly > 0);
  return { total: sum(state.goals, goalSaved), month: sum(state.goals, g => goalMonthSaved(g, iso)), plan: sum(active, g => g.monthly), hasPlan: active.length > 0 };
}
/* Préstamos a otras personas */
const loanPaid = l => sum(l.payments, p => p.amount);
const loanRemaining = l => Math.max(0, l.amount - loanPaid(l));
const personKey = n => String(n || '').trim().toLowerCase();
function loanInfo(l) {
  if (loanRemaining(l) <= 0) return { cls: 'ok', text: 'Cobrado ✓' };
  if (!l.dueDate) return { cls: '', text: 'Sin fecha de cobro' };
  const n = daysBetween(today(), l.dueDate);
  if (n < 0) return { cls: 'bad', text: `Atrasado ${plural(-n, 'día', 'días')}` };
  if (n === 0) return { cls: 'warn', text: 'Cobrar hoy' };
  if (n <= 7) return { cls: 'warn', text: `Cobrar en ${plural(n, 'día', 'días')}` };
  return { cls: '', text: `Cobrar ${fmtShort(l.dueDate)}` };
}
function loanPeople() {
  const map = new Map();
  for (const l of state.loans) {
    const k = personKey(l.person);
    if (!map.has(k)) map.set(k, { key: k, name: l.person.trim(), loans: [] });
    map.get(k).loans.push(l);
  }
  return [...map.values()].map(p => {
    const open = p.loans.filter(l => loanRemaining(l) > 0);
    const dues = open.filter(l => l.dueDate).map(l => l.dueDate).sort();
    return { ...p, total: sum(p.loans, l => l.amount), paid: sum(p.loans, loanPaid), pending: sum(p.loans, loanRemaining), nextDue: dues[0] || '', overdue: open.filter(l => l.dueDate && l.dueDate < today()).length };
  }).sort((a, b) => (b.pending > 0) - (a.pending > 0) || b.pending - a.pending || a.name.localeCompare(b.name, 'es'));
}

function dueInfo(d) {
  if (debtRemaining(d) <= 0) return { cls: 'ok', text: 'Pagada ✓' };
  if (!d.nextDue) return { cls: '', text: 'Sin vencimiento' };
  const n = daysBetween(today(), d.nextDue);
  if (n < 0) return { cls: 'bad', text: `Vencida hace ${plural(-n, 'día', 'días')}` };
  if (n === 0) return { cls: 'warn', text: 'Vence hoy' };
  if (n <= 7) return { cls: 'warn', text: `Vence en ${plural(n, 'día', 'días')}` };
  return { cls: '', text: `Vence ${fmtShort(d.nextDue)}` };
}
function goalInfo(g) {
  const saved = goalSaved(g), open = !(g.target > 0), left = open ? Infinity : Math.max(0, g.target - saved), pct = open ? 0 : saved / g.target * 100;
  let plan = '';
  if (open) plan = '';
  else if (left <= 0) plan = '¡Meta cumplida! 🎉';
  else if (g.deadline) {
    const days = daysBetween(today(), g.deadline);
    if (days <= 0) plan = `Plazo vencido · faltan ${money(left)}`;
    else plan = `Para llegar a tiempo: ≈ ${money(left / (days / 30.44))} al mes (${money(left / (days / 7))} por semana)`;
  }
  return { saved, left, pct, plan, open };
}

/* ---------- Avisos (banners) ---------- */
/* Un aviso se muestra desde su fecha y se queda hasta que lo cierras con la ✕ (cobros, vencimientos y ahorros).
   Los de cumpleaños se muestran una sola vez: el día que corresponde o, si no entraste ese día, la primera vez que entres después. */
function noticeActive(key, persistent) {
  if (N.dismissed[key]) return false;
  if (!persistent) {
    const sh = N.shown[key], t = today();
    if (sh && sh !== t) return false;
    if (!sh) { N.shown[key] = t; saveNotices(); }
  }
  return true;
}
const bdayOn = (iso, y) => { const [, m, d] = iso.split('-').map(Number); return `${y}-${pad(m)}-${pad(m === 2 && d === 29 && !isLeap(y) ? 28 : d)}`; };
function birthdayNotice(t) {
  const b = state.profile.birthdate, by = Number(b.slice(0, 4)), y = Number(t.slice(0, 4)), thisY = bdayOn(b, y);
  const last = thisY <= t ? thisY : bdayOn(b, y - 1), next = thisY >= t ? thisY : bdayOn(b, y + 1);
  const ly = Number(last.slice(0, 4));
  if (t === thisY) return y > by && noticeActive(`bday:${y}`) ? { kind: 'today', key: `bday:${y}`, age: y - by } : null;
  if (ly > by && addMonths(last, 6) > t) return noticeActive(`bday:${ly}`) ? { kind: 'belated', key: `bday:${ly}`, date: last, age: ly - by } : null; // pasó hace menos de 6 meses
  const nd = daysBetween(t, next);
  if (nd <= 7 && noticeActive(`bdayup:${next.slice(0, 4)}`)) return { kind: 'soon', key: `bdayup:${next.slice(0, 4)}`, date: next, days: nd };
  if (N.intro && noticeActive('bdayreg')) return { kind: 'soon', key: 'bdayreg', date: next, days: nd }; // recién registrado y faltan menos de 6 meses
  return null;
}
function lastReminderDate(g, t) {
  const d = fromISO(t), y = d.getFullYear(), m = d.getMonth();
  const mk = (yy, mm) => toISO(new Date(yy, mm, Math.min(g.reminderDay, new Date(yy, mm + 1, 0).getDate())));
  const occ = mk(y, m);
  return occ <= t ? occ : mk(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1);
}
function computeNotices() {
  const t = today(), n = state.settings.notify || {}, out = [];
  if (n.birthday !== false && state.profile) { const b = birthdayNotice(t); if (b) out.push({ type: 'birthday', ...b }); }
  if (n.loans !== false) {
    state.loans.filter(l => loanRemaining(l) > 0 && l.dueDate && l.dueDate <= t).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).forEach(l => {
      const key = `loan:${l.id}:${l.dueDate}`; if (noticeActive(key, true)) out.push({ type: 'loan', key, l, late: daysBetween(l.dueDate, t) });
    });
  }
  if (n.debts !== false) {
    state.debts.filter(d => debtRemaining(d) > 0 && d.nextDue && d.nextDue <= t).sort((a, b) => a.nextDue.localeCompare(b.nextDue)).forEach(d => {
      const key = `debt:${d.id}:${d.nextDue}`; if (noticeActive(key, true)) out.push({ type: 'debt', key, d, late: daysBetween(d.nextDue, t) });
    });
  }
  if (n.savings !== false) {
    for (const g of state.goals) {
      if (!(g.reminderDay > 0) || goalInfo(g).left <= 0) continue;
      const occ = lastReminderDate(g, t);
      if (occ < (g.reminderSince || '0000-00-00')) continue;
      const done = goalMonthSaved(g, occ);
      if (g.monthly > 0 ? done >= g.monthly : done > 0) continue; // ya ahorraste lo de ese mes
      const key = `save:${g.id}:${occ.slice(0, 7)}`; if (noticeActive(key, true)) out.push({ type: 'save', key, g, occ, late: daysBetween(occ, t) });
    }
  }
  return out;
}
function noticeHTML(x) {
  const close = `<button class="n-x" data-act="dismissNotice" data-key="${esc(x.key)}" aria-label="Cerrar aviso">✕</button>`;
  const box = (tone, icon, title, text, actions) => `<div class="notice ${tone}" role="status"><span class="n-ic" aria-hidden="true">${icon}</span><div class="n-body"><b>${title}</b><p>${text}</p>${actions ? `<div class="n-actions">${actions}</div>` : ''}</div>${close}</div>`;
  if (x.type === 'birthday') {
    const nm = esc(state.profile.name);
    const [ttl, txt] = x.kind === 'today' ? [`¡Feliz cumpleaños, ${nm}!`, `Hoy cumples ${plural(x.age, 'año', 'años')}. Que tengas un día increíble 🎉`]
      : x.kind === 'belated' ? [`¡Feliz cumpleaños atrasado, ${nm}!`, `Tu cumpleaños fue el ${fmtBirthday(x.date)}${daysBetween(x.date, today()) > 0 ? ` (hace ${plural(daysBetween(x.date, today()), 'día', 'días')})` : ''} y cumpliste ${plural(x.age, 'año', 'años')}. ¡Que lo hayas pasado increíble! 🎉`]
      : [`¡Se acerca tu cumpleaños, ${nm}!`, `Será el ${fmtBirthday(x.date)}${x.days > 0 ? ` (en ${plural(x.days, 'día', 'días')})` : ''}. 🎂`];
    return `<div class="birthday" role="status"><span class="cake" aria-hidden="true">🎂</span><div><b>${ttl}</b><p>${txt}</p></div><button class="bday-x" data-act="dismissNotice" data-key="${esc(x.key)}" aria-label="Cerrar saludo">✕</button></div>`;
  }
  if (x.type === 'loan') {
    const l = x.l, ttl = x.late === 0 ? `Hoy vence el cobro a ${esc(l.person)}` : `Cobro vencido: ${esc(l.person)}`;
    const txt = `${x.late === 0 ? 'Te debe' : `Debía pagarte el ${esc(fmtDate(l.dueDate))} (hace ${plural(x.late, 'día', 'días')}). Pendiente:`} <b>${money(loanRemaining(l))}</b> · prestado el ${esc(fmtShort(l.startDate))}`;
    return box(x.late === 0 ? 'warn' : 'bad', ICON.prestamos, ttl, txt, `<button class="btn small" data-act="payLoan" data-id="${l.id}">Registrar cobro</button><a class="btn small" href="#/prestamos">Ver préstamos</a>`);
  }
  if (x.type === 'debt') {
    const d = x.d, ttl = x.late === 0 ? `Hoy vence: ${esc(d.name)}` : `Vencida: ${esc(d.name)}`;
    const txt = `${x.late === 0 ? 'A pagar' : `Venció el ${esc(fmtDate(d.nextDue))} (hace ${plural(x.late, 'día', 'días')}). A pagar:`} <b>${money(d.installment ? Math.min(d.installment, debtRemaining(d)) : debtRemaining(d))}</b>`;
    return box(x.late === 0 ? 'warn' : 'bad', ICON.deudas, ttl, txt, `<button class="btn small" data-act="payDebt" data-id="${d.id}">Registrar pago</button><a class="btn small" href="#/deudas">Ver deudas</a>`);
  }
  const g = x.g, saved = goalMonthSaved(g, x.occ);
  const ttl = x.late === 0 ? `Hoy toca ahorrar: ${esc(g.name)}` : `Aviso de ahorro pendiente: ${esc(g.name)}`;
  const txt = `${x.late === 0 ? '' : `Tu aviso era el ${esc(fmtDate(x.occ))}. `}${g.monthly > 0 ? `Plan del mes: ${money(g.monthly)} · llevas ${money(saved)}.` : 'Aún no registras ahorro este mes.'}`;
  return box('info', ICON.metas, ttl, txt, `<button class="btn small" data-act="addSaving" data-id="${g.id}">Registrar ahorro</button>`);
}
function noticesHTML() {
  const list = computeNotices(), MAX = 4;
  return list.slice(0, MAX).map(noticeHTML).join('') + (list.length > MAX ? `<p class="muted small notice-more">Tienes ${plural(list.length - MAX, 'aviso más', 'avisos más')}. Ciérralos para ver los siguientes.</p>` : '');
}

/* ---------- Componentes ---------- */
const bar = (pct, cls = '') => `<div class="bar ${cls}"><span style="width:${Math.max(0, Math.min(100, pct || 0))}%"></span></div>`;
const card = (title, body, extra = '') => `<section class="card">${title ? `<div class="card-head"><h2>${title}</h2>${extra}</div>` : ''}${body}</section>`;
const emptyMsg = msg => `<p class="empty">${msg}</p>`;
const budgetCls = pct => (pct >= 100 ? 'bad' : pct >= 80 ? 'warn' : '');
function head(title, sub = '', right = '') {
  return `<header class="page-head"><div><h1>${title}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div><div class="head-right">${right}</div></header>`;
}
function segmented(mode) {
  return `<div class="seg" role="group" aria-label="Tipo de periodo">${[['week', 'Semana'], ['fortnight', 'Quincena'], ['month', 'Mes']]
    .map(([v, l]) => `<button class="${mode === v ? 'on' : ''}" data-act="setMode" data-mode="${v}">${l}</button>`).join('')}</div>`;
}
const fab = (act, data = '') => `<button class="fab" data-act="${act}" ${data} aria-label="Agregar">＋</button>`;

/* ---------- Toast y modal ---------- */
let toastTimer;
function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}
let modalLocked = false; // ventana que no se puede cerrar sin completarla (bienvenida)
function closeModal() {
  const m = $('#modal'); m.classList.add('hidden'); m.innerHTML = '';
  document.body.classList.remove('noscroll');
  modalLocked = false;
}
const tryClose = () => { if (modalLocked) return; closeModal(); if (!state.profile) render(true); };
function fieldHTML(f, val) {
  const id = 'f_' + f.name, v = val ?? f.default ?? '';
  if (f.type === 'checkbox') return `<label class="check"><input type="checkbox" id="${id}" name="${f.name}" ${v ? 'checked' : ''}> ${esc(f.label)}</label>`;
  let input;
  if (f.type === 'select') {
    input = `<select id="${id}" name="${f.name}">${f.options.map(o => `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  } else if (f.type === 'number') {
    input = `<input id="${id}" name="${f.name}" type="number" inputmode="decimal" step="any" ${f.min !== undefined ? `min="${f.min}"` : ''} value="${esc(v)}" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}>`;
  } else {
    input = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}" ${f.min ? `min="${f.min}"` : ''} ${f.max ? `max="${f.max}"` : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} autocomplete="${f.autocomplete || 'off'}"${f.type === 'email' ? ' autocapitalize="none" spellcheck="false"' : ''}${f.datalist ? ` list="dl_${f.name}"` : ''}>`;
    if (f.datalist) input += `<datalist id="dl_${f.name}">${f.datalist.map(o => `<option value="${esc(o)}"></option>`).join('')}</datalist>`;
  }
  return `<div class="field"><label for="${id}">${esc(f.label)}${f.required ? ' *' : ''}</label>${input}</div>`;
}
function openForm({ title, fields, values = {}, submitLabel = 'Guardar', onSubmit, onDelete, note, extra, focus, locked = false, validate }) {
  const m = $('#modal');
  modalLocked = !!locked;
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="sheet-head"><h2>${esc(title)}</h2>${locked ? '' : '<button class="icon-btn" type="button" data-act="closeModal" aria-label="Cerrar">✕</button>'}</div>
    <form id="form" novalidate>
      ${note ? `<p class="muted" style="margin-bottom:12px">${note}</p>` : ''}
      ${fields.map(f => fieldHTML(f, values[f.name])).join('')}
      ${extra || ''}
      <div class="form-actions">
        ${onDelete ? '<button type="button" class="btn danger" id="btnDelete">Eliminar</button>' : ''}
        <button type="submit" class="btn primary">${esc(submitLabel)}</button>
      </div>
    </form></div>`;
  m.classList.remove('hidden');
  document.body.classList.add('noscroll');
  const form = $('#form');
  form.addEventListener('submit', ev => {
    ev.preventDefault();
    const data = {};
    for (const f of fields) {
      const el = form.elements[f.name];
      let v;
      if (f.type === 'checkbox') v = el.checked;
      else if (f.type === 'number') { v = el.value === '' ? null : Number(el.value); if (v !== null && !isFinite(v)) v = null; }
      else v = f.type === 'password' ? el.value : el.value.trim();
      const isEmpty = v === null || v === '';
      if ((f.required && isEmpty) || (f.type === 'number' && v !== null && f.min !== undefined && v < f.min)) {
        toast(`Revisa el campo: ${f.label}`); el.focus(); return;
      }
      data[f.name] = v;
    }
    const problem = validate ? validate(data) : null;
    if (problem) { toast(problem); return; }
    const res = onSubmit(data);
    if (res && typeof res.then === 'function') { // acción asíncrona (por ejemplo iniciar sesión): se cierra solo si salió bien
      const btn = form.querySelector('button[type=submit]'), label = btn.textContent;
      btn.disabled = true; btn.textContent = 'Un momento…';
      res.then(ok => { if (form.isConnected) { if (ok === false) { btn.disabled = false; btn.textContent = label; } else closeModal(); } });
    } else closeModal();
  });
  if (onDelete) $('#btnDelete').addEventListener('click', onDelete);
  if (focus && form.elements[focus]) setTimeout(() => form.elements[focus].focus(), 60);
}

/* =========================================================
   VISTAS
   ========================================================= */

/* ----- Inicio ----- */
function viewHome() {
  const now = today(), mode = state.settings.periodMode;
  const pm = periodOf('month', now), sm = flows(pm);
  const pp = periodOf(mode, now), sp = flows(pp);
  const budget = state.budgets[monthKey(now)] || {};
  const budTotal = sum(Object.values(budget));
  const topCats = Object.entries(sp.byCat).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const dues = state.debts.filter(d => debtRemaining(d) > 0 && d.nextDue)
    .map(d => ({ d, n: daysBetween(now, d.nextDue) })).filter(x => x.n <= 30).sort((a, b) => a.n - b.n).slice(0, 4);
  const goals = state.goals.slice().sort((a, b) => goalInfo(b).pct - goalInfo(a).pct).slice(0, 3);
  const invCur = sum(state.investments, i => i.current), invIn = sum(state.investments, i => i.invested);
  const sv = savingsSummary(now);
  const people = loanPeople(), pending = sum(state.loans, loanRemaining);
  const overdueLoans = state.loans.filter(l => loanRemaining(l) > 0 && l.dueDate && l.dueDate < now).length;
  const collect = state.loans.filter(l => loanRemaining(l) > 0 && l.dueDate && daysBetween(now, l.dueDate) <= 30)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 3);

  const c1 = card(`Este mes · ${esc(cap(MONTHS[fromISO(now).getMonth()]))}`, `
    <div class="stats two">
      <div class="stat"><small>Ingresos</small><b class="pos">${money(sm.inc)}</b></div>
      <div class="stat"><small>Gastos</small><b>${money(sm.exp)}</b></div>
      <div class="stat"><small>Ahorros</small><b>${money(sm.sav)}</b></div>
      ${sm.loanNet ? `<div class="stat"><small>Préstamos (neto)</small><b>${money(sm.loanNet)}</b></div>` : ''}
      <div class="stat ${sm.loanNet ? 'span2' : ''}"><small>Saldo del mes</small><b class="${sm.bal < 0 ? 'neg' : 'pos'}">${money(sm.bal)}</b></div>
    </div>
    <p class="muted small" style="margin-top:8px">Saldo = ingresos − gastos − ahorros${sm.loanNet ? ' − préstamos' : ''}.${sm.borrowed ? ` Los ingresos incluyen ${money(sm.borrowed)} de préstamos solicitados (los ves en Deudas).` : ''}</p>
    <div class="btn-row"><button class="btn primary small" data-act="addTx" data-type="expense">＋ Gasto</button><button class="btn small" data-act="addTx" data-type="income">＋ Ingreso</button><button class="btn small" data-act="addSavingQuick">＋ Ahorro</button><button class="btn small" data-act="addLoan">＋ Préstamo</button></div>`);

  const cS = card('Ahorro', `
    <div class="stats ${sv.hasPlan ? '' : 'two'}">
      <div class="stat"><small>Total ahorrado</small><b class="pos">${money(sv.total)}</b></div>
      <div class="stat"><small>Este mes</small><b>${money(sv.month)}</b></div>
      ${sv.hasPlan ? `<div class="stat"><small>Plan mensual</small><b>${money(sv.plan)}</b></div>` : ''}
    </div>
    ${sv.hasPlan ? `<div style="margin-top:10px"><div class="kv"><span>Ahorro mensual</span><b>${money(sv.month)} de ${money(sv.plan)}</b></div>${bar(sv.plan ? sv.month / sv.plan * 100 : 0, sv.month >= sv.plan ? 'ok' : '')}<p class="muted small">${sv.month >= sv.plan ? '¡Plan del mes cumplido!' : `Te faltan ${money(sv.plan - sv.month)} este mes`}</p></div>` : ''}
    ${goals.length ? `<div style="margin-top:10px">${goals.map(g => { const i = goalInfo(g); return i.open ? `<div class="catrow"><div class="top"><span>${esc(g.name)}</span><b>${money(i.saved)}</b></div></div>` : `<div class="catrow"><div class="top"><span>${esc(g.name)}</span><b>${Math.round(i.pct)}%</b></div>${bar(i.pct, i.pct >= 100 ? 'ok' : '')}</div>`; }).join('')}</div>` : emptyMsg('Aún no tienes metas ni ahorros.')}
    <div class="btn-row"><button class="btn primary small" data-act="addSavingQuick">＋ Ahorro</button>${sv.hasPlan ? '' : '<button class="btn small" data-act="addMonthly">Crear ahorro mensual</button>'}<button class="btn small" data-act="addGoal">Nueva meta</button></div>`,
    '<a class="link" href="#/metas">Metas</a>');

  const cL = card('Préstamos', state.loans.length ? `
    <div class="stats">
      <div class="stat"><small>Por cobrar</small><b class="${pending ? '' : 'pos'}">${money(pending)}</b></div>
      <div class="stat"><small>Personas</small><b>${people.filter(x => x.pending > 0).length}</b></div>
      <div class="stat"><small>Atrasados</small><b class="${overdueLoans ? 'neg' : ''}">${overdueLoans}</b></div>
    </div>
    ${collect.length ? `<div style="margin-top:6px">${collect.map(l => { const i = loanInfo(l); return `<div class="row" style="cursor:default"><span class="emo">${ICON.prestamos}</span><span class="grow"><b>${esc(l.person)}</b><small>Cobrar ${fmtDate(l.dueDate)}</small></span><span style="text-align:right"><b>${money(loanRemaining(l))}</b><br><span class="badge ${i.cls}">${esc(i.text)}</span></span></div>`; }).join('')}</div>` : ''}
    <div class="btn-row"><button class="btn small" data-act="addLoan">＋ Préstamo</button></div>` : `${emptyMsg('Aún no has prestado dinero a nadie.')}<div class="btn-row"><button class="btn small" data-act="addLoan">＋ Registrar préstamo</button></div>`,
    '<a class="link" href="#/prestamos">Ver</a>');

  const c2 = card(`Resumen ${MODE_NAMES[mode]}`, `
    ${segmented(mode)}
    <p class="muted" style="margin-top:10px">${esc(periodLabel(mode, pp))}</p>
    <div class="stats two" style="margin-top:8px">
      <div class="stat"><small>Gastos</small><b>${money(sp.exp)}</b></div>
      <div class="stat"><small>Ingresos</small><b class="pos">${money(sp.inc)}</b></div>
      <div class="stat"><small>Ahorros</small><b>${money(sp.sav)}</b></div>
      <div class="stat"><small>Balance</small><b class="${sp.bal < 0 ? 'neg' : 'pos'}">${money(sp.bal)}</b></div>
    </div>
    ${sp.loanNet ? `<p class="muted small" style="margin-top:6px">Incluye préstamos netos: ${money(sp.loanNet)} (entregado ${money(sp.lent)}, cobrado ${money(sp.back)}).</p>` : ''}
    ${sp.borrowed ? `<p class="muted small" style="margin-top:6px">Los ingresos incluyen ${money(sp.borrowed)} de préstamos solicitados.</p>` : ''}
    ${topCats.length ? `<div style="margin-top:10px">${topCats.map(([id, v]) => `<div class="catrow"><div class="top"><span class="catname">${mono(catById(id), true)}${esc(catById(id).name)}</span><b>${money(v)}</b></div>${bar(sp.exp ? v / sp.exp * 100 : 0)}</div>`).join('')}</div>` : emptyMsg('Sin gastos en este periodo.')}`,
    '<a class="link" href="#/gastos">Ver detalle</a>');

  const c3 = budTotal > 0 ? card('Presupuesto del mes', `
    <div class="kv"><span>Gastado</span><b>${money(sm.exp)} de ${money(budTotal)}</b></div>
    ${bar(sm.exp / budTotal * 100, budgetCls(sm.exp / budTotal * 100))}
    <p class="muted small">${budTotal - sm.exp >= 0 ? `Te quedan ${money(budTotal - sm.exp)}` : `Te pasaste por ${money(sm.exp - budTotal)}`}</p>`,
    '<a class="link" href="#/presupuesto">Ver</a>') : '';

  const c4 = card('Próximos vencimientos', dues.length ? dues.map(({ d, n }) => {
    const info = dueInfo(d);
    return `<div class="row" style="cursor:default"><span class="emo">${ICON.deudas}</span><span class="grow"><b>${esc(d.name)}</b><small>${n < 0 ? 'Venció' : 'Vence'} ${fmtDate(d.nextDue)}</small></span><span style="text-align:right"><b>${money(d.installment || debtRemaining(d))}</b><br><span class="badge ${info.cls}">${esc(info.text)}</span></span></div>`;
  }).join('') + `<div class="btn-row"><button class="btn small" data-act="addBorrowed">＋ Préstamo solicitado</button></div>` : emptyMsg('No hay vencimientos en los próximos 30 días.') + `<div class="btn-row"><button class="btn small" data-act="addBorrowed">＋ Préstamo solicitado</button></div>`, '<a class="link" href="#/deudas">Deudas</a>');

  const c6 = card('Inversiones', state.investments.length ? `
    <div class="stats">
      <div class="stat"><small>Invertido</small><b>${money(invIn)}</b></div>
      <div class="stat"><small>Valor actual</small><b>${money(invCur)}</b></div>
      <div class="stat"><small>Ganancia</small><b class="${invCur - invIn < 0 ? 'neg' : 'pos'}">${money(invCur - invIn)}</b></div>
    </div>` : emptyMsg('Aún no registras inversiones.'), '<a class="link" href="#/inversiones">Ver</a>');

  const yr = Number(now.slice(0, 4)), yd = yearData(yr);
  const cY = card(`Resumen ${yr}`, yd.hasData ? `
    <div class="stats">
      <div class="stat"><small>Ingresos</small><b class="pos">${money(yd.inc)}</b></div>
      <div class="stat"><small>Gastos</small><b>${money(yd.exp)}</b></div>
      <div class="stat"><small>Ahorrado</small><b class="pos">${money(yd.sav)}</b></div>
    </div>` : emptyMsg('Aún no hay movimientos este año.'), '<a class="link" href="#/anual">Ver año</a>');
  const nm = state.profile ? esc(state.profile.name) : '';
  return head(nm ? `Hola, ${nm} 👋` : 'Hola 👋', 'Así van tus finanzas hoy', `<span class="logo-tile only-mobile">${LOGO(32)}</span>`) + c1 + cS + cL + c3 + c4 + c6 + c2 + cY; // los resúmenes (periodo y año) van al final
}

/* ----- Gastos ----- */
function viewTx() {
  const mode = state.settings.periodMode, p = periodOf(mode, ui.refDate);
  const list = movesIn(p), s = flows(p);
  const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
  const isCurrent = inRange(today(), p);
  const lastDay = p.end < today() ? p.end : today();
  const elapsed = p.start > today() ? 1 : daysBetween(p.start, lastDay) + 1;

  const groups = [];
  for (const t of list) {
    let g = groups[groups.length - 1];
    if (!g || g.date !== t.date) { g = { date: t.date, items: [] }; groups.push(g); }
    g.items.push(t);
  }
  const hist = []; let hp = p;
  for (let i = 0; i < 6; i++) { hist.push(hp); hp = shiftPeriod(mode, hp, -1); }
  const histSums = hist.map(h => sums(txIn(h)).exp);
  const maxExp = Math.max(...histSums, 1);

  const flowRow = (icon, title, sub, amt, t, pos) => {
    const tag = `<span class="emo">${icon}</span><span class="grow"><b>${esc(title)}</b><small>${esc(sub)}</small></span><span class="amt ${pos ? 'pos' : ''}">${pos ? '+' : '−'}${money(amt)}</span>`;
    return `<button class="row" data-act="${t.act}" data-id="${t.id}" data-cid="${t.cid || ''}">${tag}</button>`;
  };
  const txRow = m => {
    if (m.k === 'sav') return flowRow(ICON.metas, `Ahorro · ${m.g.name}`, m.c.note || 'Meta de ahorro', m.c.amount, { act: 'editSaving', id: m.g.id, cid: m.c.id }, false);
    if (m.k === 'loan') return flowRow(ICON.prestamos, `Préstamo a ${m.l.person}`, m.l.note || 'Préstamo', m.l.amount, { act: 'editLoan', id: m.l.id }, false);
    if (m.k === 'lpay') return flowRow(ICON.prestamos, `Cobro de ${m.l.person}`, m.x.note || 'Cobro de préstamo', m.x.amount, { act: 'editLoanPay', id: m.l.id, cid: m.x.id }, true);
    const t = m.t, c = catById(t.categoryId), inc = t.type === 'income';
    return `<button class="row" data-act="editTx" data-id="${t.id}"><span class="emo">${mono(c)}</span><span class="grow"><b>${esc(t.note || c.name)}</b><small>${esc(c.name)}</small></span><span class="amt ${inc ? 'pos' : ''}">${inc ? '+' : '−'}${money(t.amount)}</span></button>`;
  };

  return head('Gastos', `Vista ${MODE_NAMES[mode]}`) +
    card('', `
      ${segmented(mode)}
      <div class="period-nav">
        <button class="icon-btn" data-act="shift" data-dir="-1" aria-label="Periodo anterior">‹</button>
        <div class="period-label"><b>${esc(periodLabel(mode, p))}</b>${!isCurrent ? '<button class="link" data-act="goToday">Ir a hoy</button>' : '<span class="muted small">Periodo actual</span>'}</div>
        <button class="icon-btn" data-act="shift" data-dir="1" aria-label="Periodo siguiente">›</button>
      </div>`) +
    card(`Resumen ${MODE_NAMES[mode]}`, `
      <div class="stats two">
        <div class="stat"><small>Gastos</small><b>${money(s.exp)}</b></div>
        <div class="stat"><small>Ingresos</small><b class="pos">${money(s.inc)}</b></div>
        <div class="stat"><small>Ahorros</small><b>${money(s.sav)}</b></div>
        <div class="stat"><small>Balance</small><b class="${s.bal < 0 ? 'neg' : 'pos'}">${money(s.bal)}</b></div>
      </div>
      ${s.loanNet ? `<p class="muted small" style="margin-top:6px">Incluye préstamos netos: ${money(s.loanNet)} (entregado ${money(s.lent)}, cobrado ${money(s.back)}).</p>` : ''}
      ${s.borrowed ? `<p class="muted small" style="margin-top:6px">Los ingresos incluyen ${money(s.borrowed)} de préstamos solicitados.</p>` : ''}
      <p class="muted small" style="margin-top:8px">Promedio diario de gasto: <b>${money(s.exp / elapsed)}</b></p>
      ${cats.length ? `<div style="margin-top:8px">${cats.map(([id, v]) => `<div class="catrow"><div class="top"><span class="catname">${mono(catById(id), true)}${esc(catById(id).name)}</span><span><b>${money(v)}</b> · ${Math.round(s.exp ? v / s.exp * 100 : 0)}%</span></div>${bar(s.exp ? v / s.exp * 100 : 0)}</div>`).join('')}</div>` : ''}`) +
    card(`Movimientos (${list.length})`, groups.length
      ? groups.map(g => `<div class="dayhead"><span>${fmtDate(g.date)}</span><span>${money(sum(g.items.filter(m => m.k === 'tx' && m.t.type === 'expense'), m => m.t.amount))}</span></div>${g.items.map(txRow).join('')}`).join('')
      : emptyMsg('No hay movimientos en este periodo.<br>Toca ＋ para agregar uno.')) +
    card(`Últimos ${hist.length} periodos`, hist.map((h, i) => `
      <button class="hist ${h.start === p.start ? 'cur' : ''}" data-act="goPeriod" data-date="${h.start}"><span>${esc(shortLabel(mode, h))}</span>${bar(histSums[i] / maxExp * 100)}<b>${money(histSums[i])}</b></button>`).join('')) +
    fab('addTx', 'data-type="expense"');
}

/* ----- Presupuesto ----- */
function viewBudget() {
  const p = periodOf('month', ui.budgetDate), key = monthKey(p.start);
  const budget = state.budgets[key] || {};
  const s = sums(txIn(p));
  const total = sum(Object.values(budget));
  const dim = fromISO(p.end).getDate();
  const cats = state.categories.filter(c => c.type === 'expense');
  const unbudgetedSpent = Object.entries(s.byCat).filter(([id]) => !cats.some(c => c.id === id)).reduce((a, [, v]) => a + v, 0);
  const rows = cats.map(c => ({ c, b: budget[c.id] || 0, spent: s.byCat[c.id] || 0 }))
    .sort((a, b) => (b.b > 0) - (a.b > 0) || b.spent - a.spent);
  const pctTotal = total ? s.exp / total * 100 : 0;

  return head('Presupuesto', 'Define cuánto gastar por categoría cada mes') +
    card('', `
      <div class="period-nav" style="margin-top:0">
        <button class="icon-btn" data-act="budgetShift" data-dir="-1" aria-label="Mes anterior">‹</button>
        <div class="period-label"><b>${esc(periodLabel('month', p))}</b></div>
        <button class="icon-btn" data-act="budgetShift" data-dir="1" aria-label="Mes siguiente">›</button>
      </div>
      <div class="stats" style="margin-top:12px">
        <div class="stat"><small>Presupuesto</small><b>${money(total)}</b></div>
        <div class="stat"><small>Gastado</small><b>${money(s.exp)}</b></div>
        <div class="stat"><small>Disponible</small><b class="${total - s.exp < 0 ? 'neg' : 'pos'}">${money(total - s.exp)}</b></div>
      </div>
      ${total ? bar(pctTotal, budgetCls(pctTotal)) : ''}
      ${total ? `<p class="muted small">Equivale a ≈ ${money(total / 2)} por quincena · ${money(total * 7 / dim)} por semana.</p>` : ''}
      <p class="muted small" style="margin-top:6px">Ingresos del mes: <b>${money(s.inc)}</b>${s.sav ? ` · Ahorrado: <b>${money(s.sav)}</b>` : ''}${s.inc ? ` · Sin asignar: <b class="${s.inc - total - s.sav < 0 ? 'neg' : 'pos'}">${money(s.inc - total - s.sav)}</b>` : ''}</p>
      <div class="btn-row"><button class="btn small" data-act="copyBudget">Copiar del mes anterior</button></div>`) +
    card('Por categoría', rows.map(({ c, b, spent }) => {
      const pct = b ? spent / b * 100 : 0;
      return `<button class="row" data-act="editBudget" data-id="${esc(c.id)}" style="flex-wrap:wrap">
        <span class="emo">${mono(c)}</span>
        <span class="grow"><b>${esc(c.name)}</b><small>${b ? `${money(spent)} de ${money(b)}` : (spent ? `${money(spent)} gastado · sin presupuesto` : 'Toca para fijar un presupuesto')}</small></span>
        <span class="amt ${b && b - spent < 0 ? 'neg' : ''}">${b ? money(b - spent) : '＋'}</span>
        ${b ? `<span style="flex-basis:100%">${bar(pct, budgetCls(pct))}</span>` : ''}
      </button>`;
    }).join('') + (unbudgetedSpent ? `<p class="muted small" style="margin-top:8px">Además hay ${money(unbudgetedSpent)} en categorías eliminadas.</p>` : ''));
}

/* ----- Metas y ahorros ----- */
function viewGoals() {
  const goals = state.goals.slice().sort((a, b) => (goalInfo(a).left <= 0) - (goalInfo(b).left <= 0) || (a.deadline || '9999').localeCompare(b.deadline || '9999'));
  const totalTarget = sum(state.goals, g => g.target), sv = savingsSummary();
  const goalCard = g => {
    const i = goalInfo(g), done = i.left <= 0;
    const dl = g.deadline ? daysBetween(today(), g.deadline) : null;
    const ms = goalMonthSaved(g);
    return `<section class="card">
      <div class="card-head"><h2>${esc(g.name)}</h2>${done ? '<span class="badge ok">Cumplida</span>' : dl !== null ? `<span class="badge ${dl < 0 ? 'bad' : dl <= 30 ? 'warn' : ''}">${dl < 0 ? 'Plazo vencido' : `Faltan ${plural(dl, 'día', 'días')}`}</span>` : ''}</div>
      ${i.open
        ? `<div class="kv"><span>Total ahorrado</span><b>${money(i.saved)}</b></div>${g.deadline ? `<p class="muted small">Fecha objetivo: ${fmtDate(g.deadline)}</p>` : ''}`
        : `<div class="kv"><span>Ahorrado</span><b>${money(i.saved)} de ${money(g.target)}</b></div>
      ${bar(i.pct, done ? 'ok' : '')}
      <p class="muted small">${Math.round(i.pct)}% completado${g.deadline ? ` · Fecha objetivo: ${fmtDate(g.deadline)}` : ''}</p>`}
      ${g.reminderDay > 0 && !done ? `<p class="muted small" style="margin-top:6px">Aviso de ahorro: el día ${g.reminderDay} de cada mes.</p>` : ''}
      ${g.monthly > 0 && !done ? `<div class="kv" style="margin-top:8px"><span>Ahorro mensual</span><b>${money(ms)} de ${money(g.monthly)}</b></div>${bar(ms / g.monthly * 100, ms >= g.monthly ? 'ok' : '')}` : ''}
      ${i.plan ? `<p class="muted small" style="margin-top:6px">${esc(i.plan)}</p>` : ''}
      <div class="btn-row"><button class="btn primary small" data-act="addSaving" data-id="${g.id}">＋ Registrar ahorro</button><button class="btn small" data-act="editGoal" data-id="${g.id}">Editar</button></div>
      ${g.contributions.length ? `<details><summary>Historial de ahorros (${g.contributions.length})</summary>${g.contributions.slice().sort((a, b) => b.date.localeCompare(a.date)).map(c => `<div class="mini"><button class="mini-edit" data-act="editSaving" data-id="${g.id}" data-cid="${c.id}" aria-label="Editar ahorro"><span>${fmtDate(c.date)}${c.note ? ' · ' + esc(c.note) : ''}</span><b>${money(c.amount)}</b><i class="pen">✎</i></button><button class="x" data-act="delSaving" data-id="${g.id}" data-cid="${c.id}" aria-label="Eliminar ahorro">✕</button></div>`).join('')}</details>` : ''}
    </section>`;
  };
  const monthly = sv.hasPlan
    ? card('Ahorro mensual', `
        <div class="kv"><span>Este mes</span><b>${money(sv.month)} de ${money(sv.plan)}</b></div>
        ${bar(sv.plan ? sv.month / sv.plan * 100 : 0, sv.month >= sv.plan ? 'ok' : '')}
        <p class="muted small">${sv.month >= sv.plan ? '¡Plan del mes cumplido!' : `Te faltan ${money(sv.plan - sv.month)} para cumplir el plan de ${esc(cap(MONTHS[new Date().getMonth()]))}.`}</p>
        <div class="btn-row"><button class="btn primary small" data-act="addSavingQuick">＋ Registrar ahorro</button><button class="btn small" data-act="addMonthly">Otro ahorro mensual</button></div>`)
    : card('Ahorro mensual', `<p class="muted">Define cuánto quieres ahorrar cada mes. Se descuenta de tu saldo y se ve en Inicio.</p><div class="btn-row"><button class="btn primary small" data-act="addMonthly">Crear ahorro mensual</button></div>`);
  return head('Metas y ahorros', 'Planifica y registra lo que vas ahorrando') +
    (state.goals.length ? card('', `<div class="stats two"><div class="stat"><small>Total ahorrado</small><b class="pos">${money(sv.total)}</b></div><div class="stat"><small>Total de metas</small><b>${totalTarget > 0 ? money(totalTarget) : '—'}</b></div><div class="stat"><small>Ahorrado este mes</small><b>${money(sv.month)}</b></div><div class="stat"><small>Plan mensual</small><b>${sv.hasPlan ? money(sv.plan) : '—'}</b></div></div>`) : '') +
    monthly +
    (goals.length ? goals.map(goalCard).join('') : card('', emptyMsg('Crea tu primera meta: fondo de emergencia, vacaciones, un auto…'))) +
    fab('addGoal');
}

/* ----- Deudas ----- */
function viewDebts() {
  const list = state.debts.slice().sort((a, b) => {
    const ra = debtRemaining(a) > 0, rb = debtRemaining(b) > 0;
    if (ra !== rb) return ra ? -1 : 1;
    return (a.nextDue || '9999').localeCompare(b.nextDue || '9999');
  });
  const active = state.debts.filter(d => debtRemaining(d) > 0);
  const owed = sum(active, debtRemaining), monthly = sum(active.filter(d => d.recurring), d => d.installment || 0);
  const debtCard = d => {
    const rem = debtRemaining(d), paid = sum(d.payments, p => p.amount), info = dueInfo(d);
    const pct = d.total > 0 ? Math.min(100, paid / d.total * 100) : 0;
    return `<section class="card">
      <div class="card-head"><h2>${esc(d.name)}</h2><span class="badge ${info.cls}">${esc(info.text)}</span></div>
      ${d.kind === 'loan' ? `<p class="muted" style="margin-top:-6px;margin-bottom:6px"><span class="badge">Préstamo solicitado</span> ${esc(d.creditor || '')}</p>` : d.creditor ? `<p class="muted" style="margin-top:-6px;margin-bottom:6px">${esc(d.creditor)}</p>` : ''}
      ${d.kind === 'loan' && d.receivedDate ? `<div class="kv"><span>Recibido el ${esc(fmtDate(d.receivedDate))}</span><b>${money(d.receivedAmount || d.total)}</b></div>` : ''}
      <div class="kv"><span>Saldo pendiente</span><b>${money(rem)}</b></div>
      ${d.installment ? `<div class="kv"><span>Cuota</span><b>${money(d.installment)}${d.recurring ? ' / mes' : ''}</b></div>` : ''}
      ${d.nextDue && rem > 0 ? `<div class="kv"><span>Próximo vencimiento</span><b>${fmtDate(d.nextDue)}</b></div>` : ''}
      ${bar(pct, 'ok')}
      <p class="muted small">Pagado ${money(paid)} de ${money(d.total)} (${Math.round(pct)}%)</p>
      <div class="btn-row">${rem > 0 ? `<button class="btn primary small" data-act="payDebt" data-id="${d.id}">Registrar pago</button>` : ''}<button class="btn small" data-act="editDebt" data-id="${d.id}">Editar</button></div>
      ${d.payments.length ? `<details><summary>Pagos realizados (${d.payments.length})</summary>${d.payments.slice().sort((a, b) => b.date.localeCompare(a.date)).map(p => `<div class="mini"><button class="mini-edit" data-act="editPayment" data-id="${d.id}" data-pid="${p.id}" aria-label="Editar pago"><span>${fmtDate(p.date)}</span><b>${money(p.amount)}</b><i class="pen">✎</i></button><button class="x" data-act="delPayment" data-id="${d.id}" data-pid="${p.id}" aria-label="Eliminar pago">✕</button></div>`).join('')}</details>` : ''}
    </section>`;
  };
  const borrowedOpen = sum(active.filter(d => d.kind === 'loan'), debtRemaining);
  return head('Deudas', 'Saldos, cuotas, vencimientos y préstamos solicitados') +
    card('', `<div class="btn-row" style="margin-top:0"><button class="btn primary small" data-act="addDebt">＋ Deuda</button><button class="btn small" data-act="addBorrowed">＋ Préstamo solicitado</button></div>`) +
    (state.debts.length ? card('', `<div class="stats"><div class="stat"><small>Total que debes</small><b class="${owed ? 'neg' : 'pos'}">${money(owed)}</b></div><div class="stat"><small>Cuotas mensuales</small><b>${money(monthly)}</b></div><div class="stat"><small>Préstamos solicitados</small><b>${money(borrowedOpen)}</b></div></div>`) : '') +
    (list.length ? list.map(debtCard).join('') : card('', emptyMsg('No tienes deudas registradas. 🎉<br>Si tienes alguna o pediste un préstamo, agrégalo arriba.'))) +
    fab('addDebt');
}

/* ----- Préstamos a otras personas ----- */
function viewLoans() {
  const people = loanPeople(), pend = sum(state.loans, loanRemaining), tot = sum(state.loans, l => l.amount), paid = sum(state.loans, loanPaid);
  if (ui.loanPerson && !people.some(x => x.key === ui.loanPerson)) ui.loanPerson = null;
  const person = ui.loanPerson ? people.find(x => x.key === ui.loanPerson) : null;
  const loanCard = (l, showPerson) => {
    const rem = loanRemaining(l), paid = loanPaid(l), info = loanInfo(l), pct = l.amount > 0 ? Math.min(100, paid / l.amount * 100) : 0;
    return `<section class="card">
      <div class="card-head"><h2>${showPerson ? esc(l.person) : `Préstamo del ${esc(fmtShort(l.startDate))}`}</h2><span class="badge ${info.cls}">${esc(info.text)}</span></div>
      <div class="kv"><span>Monto prestado</span><b>${money(l.amount)}</b></div>
      <div class="kv"><span>Por cobrar</span><b class="${rem ? '' : 'pos'}">${money(rem)}</b></div>
      <div class="kv"><span>Fecha del préstamo</span><b>${fmtDate(l.startDate)}</b></div>
      ${l.dueDate ? `<div class="kv"><span>Fecha de cobro</span><b>${fmtDate(l.dueDate)}</b></div>` : ''}
      ${bar(pct, 'ok')}
      <p class="muted small">Cobrado ${money(paid)} de ${money(l.amount)} (${Math.round(pct)}%)${l.note ? ' · ' + esc(l.note) : ''}</p>
      <div class="btn-row">${rem > 0 ? `<button class="btn primary small" data-act="payLoan" data-id="${l.id}">Registrar cobro</button>` : ''}<button class="btn small" data-act="editLoan" data-id="${l.id}">Editar</button></div>
      ${l.payments.length ? `<details><summary>Cobros recibidos (${l.payments.length})</summary>${l.payments.slice().sort((a, b) => b.date.localeCompare(a.date)).map(x => `<div class="mini"><button class="mini-edit" data-act="editLoanPay" data-id="${l.id}" data-cid="${x.id}" aria-label="Editar cobro"><span>${fmtDate(x.date)}${x.note ? ' · ' + esc(x.note) : ''}</span><b>${money(x.amount)}</b><i class="pen">✎</i></button><button class="x" data-act="delLoanPay" data-id="${l.id}" data-pid="${x.id}" aria-label="Eliminar cobro">✕</button></div>`).join('')}</details>` : ''}
    </section>`;
  };
  const sortLoans = arr => arr.slice().sort((a, b) => (loanRemaining(b) > 0) - (loanRemaining(a) > 0) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || b.startDate.localeCompare(a.startDate));
  const personRow = x => {
    const cls = x.pending <= 0 ? 'ok' : x.overdue ? 'bad' : '';
    const txt = x.pending <= 0 ? 'Al día ✓' : x.overdue ? `${plural(x.overdue, 'atrasado', 'atrasados')}` : x.nextDue ? `Cobrar ${fmtShort(x.nextDue)}` : 'Sin fecha';
    return `<button class="row" data-act="openPerson" data-key="${esc(x.key)}"><span class="emo">${mono({ name: x.name })}</span><span class="grow"><b>${esc(x.name)}</b><small>${plural(x.loans.length, 'préstamo', 'préstamos')} · prestado ${money(x.total)}</small></span><span style="text-align:right"><b>${money(x.pending)}</b><br><span class="badge ${cls}">${esc(txt)}</span></span></button>`;
  };
  let body;
  if (!state.loans.length) body = card('', emptyMsg('Aún no has prestado dinero.<br>Toca ＋ para registrar un préstamo a alguien.'));
  else if (person) {
    body = card('', `<button class="link" data-act="closePerson">‹ Todas las personas</button>`) +
      card(esc(person.name), `
        <div class="stats">
          <div class="stat"><small>Prestado</small><b>${money(person.total)}</b></div>
          <div class="stat"><small>Cobrado</small><b class="pos">${money(person.paid)}</b></div>
          <div class="stat"><small>Por cobrar</small><b class="${person.pending ? '' : 'pos'}">${money(person.pending)}</b></div>
        </div>
        <div class="btn-row"><button class="btn primary small" data-act="addLoan" data-person="${esc(person.name)}">＋ Nuevo préstamo a ${esc(person.name)}</button></div>`) +
      sortLoans(person.loans).map(l => loanCard(l, false)).join('');
  } else {
    body = card('', `<div class="seg" role="group" aria-label="Vista">${[['persons', 'Personas'], ['loans', 'Préstamos']].map(([v, l]) => `<button class="${ui.loanTab === v ? 'on' : ''}" data-act="loanTab" data-tab="${v}">${l}</button>`).join('')}</div>`) +
      (ui.loanTab === 'persons' ? card(`Personas (${people.length})`, people.map(personRow).join('')) : sortLoans(state.loans).map(l => loanCard(l, true)).join(''));
  }
  return head('Préstamos', 'Dinero que has prestado y a quién') +
    (state.loans.length ? card('', `<div class="stats">
      <div class="stat"><small>Por cobrar</small><b class="${pend ? '' : 'pos'}">${money(pend)}</b></div>
      <div class="stat"><small>Prestado</small><b>${money(tot)}</b></div>
      <div class="stat"><small>Cobrado</small><b class="pos">${money(paid)}</b></div></div>`) : '') +
    body + fab('addLoan', person ? `data-person="${esc(person.name)}"` : '');
}

/* ----- Inversiones ----- */
function viewInv() {
  const list = state.investments.slice().sort((a, b) => b.current - a.current);
  const cur = sum(list, i => i.current), inv = sum(list, i => i.invested), gain = cur - inv;
  const byKind = {}; list.forEach(i => { byKind[i.kind] = (byKind[i.kind] || 0) + i.current; });
  const invCard = i => {
    const g = invGain(i), pct = i.invested ? g / i.invested * 100 : 0, last = i.history.length ? i.history[i.history.length - 1].date : i.date;
    return `<section class="card">
      <div class="card-head"><h2>${esc(i.name)}</h2><span class="badge">${esc(i.kind)}</span></div>
      <div class="kv"><span>Invertido</span><b>${money(i.invested)}</b></div>
      <div class="kv"><span>Valor actual</span><b>${money(i.current)}</b></div>
      <div class="kv"><span>Resultado</span><b class="${g < 0 ? 'neg' : 'pos'}">${g >= 0 ? '+' : ''}${money(g)} (${fmtPct(pct)})</b></div>
      <p class="muted small">${i.date ? `Desde ${fmtDate(i.date)} · ` : ''}Valor actualizado ${last ? fmtDate(last) : '—'}${i.note ? ' · ' + esc(i.note) : ''}</p>
      <div class="btn-row"><button class="btn primary small" data-act="updInv" data-id="${i.id}">Actualizar valor</button><button class="btn small" data-act="editInv" data-id="${i.id}">Editar</button></div>
    </section>`;
  };
  return head('Inversiones', 'Registro de lo que has invertido') +
    (list.length ? card('Portafolio', `
      <div class="stats">
        <div class="stat"><small>Invertido</small><b>${money(inv)}</b></div>
        <div class="stat"><small>Valor actual</small><b>${money(cur)}</b></div>
        <div class="stat"><small>Resultado</small><b class="${gain < 0 ? 'neg' : 'pos'}">${gain >= 0 ? '+' : ''}${money(gain)}</b></div>
      </div>
      <div style="margin-top:10px">${Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="catrow"><div class="top"><span>${esc(k)}</span><span><b>${money(v)}</b> · ${Math.round(cur ? v / cur * 100 : 0)}%</span></div>${bar(cur ? v / cur * 100 : 0)}</div>`).join('')}</div>`) : '') +
    (list.length ? list.map(invCard).join('') : card('', emptyMsg('Aún no registras inversiones.<br>Toca ＋ para agregar la primera.'))) +
    fab('addInv');
}

/* ----- Resumen anual ----- */
function sumTx(startISO, endISO) {
  let inc = 0, exp = 0;
  for (const t of state.transactions) {
    if (t.date < startISO || t.date > endISO) continue;
    if (t.type === 'income') inc += t.amount; else exp += t.amount;
  }
  return { inc, exp };
}
function yearData(y) {
  const months = Array.from({ length: 12 }, () => ({ inc: 0, exp: 0, sav: 0, lent: 0, back: 0 }));
  const byCat = {}, Y = String(y), mi = iso => Number(iso.slice(5, 7)) - 1;
  let borrowed = 0;
  for (const t of state.transactions) {
    if (t.date.slice(0, 4) !== Y) continue;
    const m = mi(t.date);
    if (t.type === 'income') { months[m].inc += t.amount; if (t.debtId) borrowed += t.amount; }
    else { months[m].exp += t.amount; byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount; }
  }
  for (const g of state.goals) for (const c of g.contributions) if (c.date.slice(0, 4) === Y) months[mi(c.date)].sav += c.amount;
  for (const l of state.loans) {
    if (l.startDate.slice(0, 4) === Y) months[mi(l.startDate)].lent += l.amount;
    for (const x of l.payments) if (x.date.slice(0, 4) === Y) months[mi(x.date)].back += x.amount;
  }
  const now = new Date(), cy = now.getFullYear();
  const daysInYear = isLeap(y) ? 366 : 365;
  const elapsedDays = y < cy ? daysInYear : y === cy ? daysBetween(`${y}-01-01`, today()) + 1 : 0;
  const inc = sum(months, m => m.inc), exp = sum(months, m => m.exp), sav = sum(months, m => m.sav), lent = sum(months, m => m.lent), back = sum(months, m => m.back);
  return { y, months, byCat, inc, exp, sav, lent, back, borrowed, loanNet: lent - back, net: inc - exp, bal: inc - exp - sav - lent + back,
    rate: inc - borrowed > 0 ? sav / (inc - borrowed) : null, elapsedDays, daysInYear, hasData: inc > 0 || exp > 0 || sav > 0 || lent > 0 || back > 0 };
}
const pctChange = (now, before) => (before ? (now - before) / before * 100 : null);

function viewYear() {
  const now = new Date(), cy = now.getFullYear(), curM = now.getMonth();
  const txYears = state.transactions.map(t => Number(t.date.slice(0, 4)));
  const minY = Math.min(cy, ...txYears), maxY = Math.max(cy, ...txYears);
  const y = Math.max(minY, Math.min(maxY, ui.year)); ui.year = y;
  const d = yearData(y), cur = y === cy;

  // comparación con el mismo periodo del año anterior
  const a = sumTx(`${y}-01-01`, cur ? today() : `${y}-12-31`);
  const b = sumTx(`${y - 1}-01-01`, cur ? `${y - 1}-${pad(curM + 1)}-${pad(now.getDate())}` : `${y - 1}-12-31`);
  const chg = (v, goodWhenDown) => (v === null ? '—' : `<b class="${(goodWhenDown ? v <= 0 : v >= 0) ? 'pos' : 'neg'}">${fmtPct(v)}</b>`);

  const done = y < cy ? 12 : cur ? curM : 0; // meses completos
  const budgetMonths = [];
  for (let i = 0; i < done; i++) { const bt = sum(Object.values(state.budgets[`${y}-${pad(i + 1)}`] || {})); if (bt > 0) budgetMonths.push({ i, bt }); }
  const met = budgetMonths.filter(x => d.months[x.i].exp <= x.bt).length;
  const withExp = d.months.map((m, i) => ({ m, i })).filter(x => x.m.exp > 0);
  const worst = withExp.length ? withExp.reduce((p, c) => (c.m.exp > p.m.exp ? c : p)) : null;
  const doneExp = withExp.filter(x => x.i < done);
  const best = doneExp.length > 1 ? doneExp.reduce((p, c) => (c.m.exp < p.m.exp ? c : p)) : null;
  const perDay = d.elapsedDays ? d.exp / d.elapsedDays : 0, perMonth = perDay * d.daysInYear / 12;
  const saved = d.sav;
  const debtPaid = sum(state.debts, x => sum(x.payments.filter(p => p.date.slice(0, 4) === String(y)), p => p.amount));
  const cats = Object.entries(d.byCat).sort((p, q) => q[1] - p[1]).slice(0, 8);

  const maxV = Math.max(...d.months.map(m => Math.max(m.inc, m.exp)), 1);
  const chart = `<div class="ychart" role="img" aria-label="Gastos e ingresos por mes de ${y}">${d.months.map((m, i) => `
    <div class="ycol ${cur && i === curM ? 'cur' : ''}" title="${cap(MONTHS[i])}: gastos ${money(m.exp)} · ingresos ${money(m.inc)}">
      <div class="ybars"><i class="yexp" style="height:${m.exp / maxV * 100}%"></i>${m.inc ? `<i class="yinc" style="bottom:${m.inc / maxV * 100}%"></i>` : ''}</div>
      <span>${mon3(i)}</span></div>`).join('')}</div>
    <div class="legend"><span><i class="sw exp"></i>Gastos</span><span><i class="sw inc"></i>Ingresos</span></div>`;

  const shown = y < cy ? 12 : cur ? curM + 1 : 0;
  const rows = d.months.map((m, i) => ({ m, i })).filter(x => x.i < shown || x.m.inc || x.m.exp || x.m.sav || x.m.lent || x.m.back).map(({ m, i }) => {
    const empty = !m.inc && !m.exp && !m.sav && !m.lent && !m.back, net = m.inc - m.exp - m.sav - m.lent + m.back;
    return `<div class="yrow"><span>${cap(mon3(i))}</span><span>${empty ? '—' : money(m.inc)}</span><span>${empty ? '—' : money(m.exp)}</span><span class="${empty ? '' : net < 0 ? 'neg' : 'pos'}">${empty ? '—' : money(net)}</span></div>`;
  }).join('');
  const table = `<div class="ytable"><div class="yrow head"><span>Mes</span><span>Ingresos</span><span>Gastos</span><span>Balance</span></div>${rows}
    <div class="yrow tot"><span>Total</span><span>${money(d.inc)}</span><span>${money(d.exp)}</span><span class="${d.bal < 0 ? 'neg' : 'pos'}">${money(d.bal)}</span></div></div>`;

  const goalsTotal = sum(state.goals, goalSaved), invCur = sum(state.investments, i => i.current), invIn = sum(state.investments, i => i.invested), owed = sum(state.debts, debtRemaining);
  const receivable = sum(state.loans, loanRemaining), net = goalsTotal + invCur + receivable - owed;

  return head('Resumen anual', 'Indicadores clave del año') +
    card('', `
      <div class="period-nav" style="margin-top:0">
        <button class="icon-btn" data-act="yearShift" data-dir="-1" ${y <= minY ? 'disabled' : ''} aria-label="Año anterior">‹</button>
        <div class="period-label"><b style="font-size:22px">${y}</b><span class="muted small">${cur ? `Del 1 ene al ${fmtShort(today())}` : 'Año completo'}</span></div>
        <button class="icon-btn" data-act="yearShift" data-dir="1" ${y >= maxY ? 'disabled' : ''} aria-label="Año siguiente">›</button>
      </div>
      ${d.hasData ? `<div class="stats two" style="margin-top:12px">
        <div class="stat"><small>Ingresos</small><b class="pos">${money(d.inc)}</b></div>
        <div class="stat"><small>Gastos</small><b>${money(d.exp)}</b></div>
        <div class="stat"><small>Ahorrado en metas</small><b class="pos">${money(d.sav)}</b></div>
        <div class="stat"><small>Tasa de ahorro</small><b>${d.rate === null ? '—' : `${(d.rate * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`}</b></div>
        <div class="stat"><small>Préstamos (neto)</small><b>${money(d.loanNet)}</b></div>
        <div class="stat"><small>Balance del año</small><b class="${d.bal < 0 ? 'neg' : 'pos'}">${money(d.bal)}</b></div>
      </div>
      <p class="muted small" style="margin-top:8px">Balance = ingresos − gastos − ahorros − préstamos netos. Tasa de ahorro = ahorrado ÷ ingresos${d.borrowed ? ' (sin contar los préstamos solicitados)' : ''}.${d.borrowed ? ` Los ingresos incluyen ${money(d.borrowed)} de préstamos solicitados.` : ''}</p>` : ''}`) +
    (!d.hasData ? card('', emptyMsg(`No hay movimientos registrados en ${y}.`)) : `
    ${card('Gastos e ingresos por mes', chart + table)}
    ${card('Indicadores', `
      <div class="kv"><span>Gasto promedio por mes</span><b>${money(perMonth)}</b></div>
      <div class="kv"><span>Gasto promedio por quincena</span><b>${money(perMonth / 2)}</b></div>
      <div class="kv"><span>Gasto promedio por semana</span><b>${money(perDay * 7)}</b></div>
      <div class="kv"><span>Gasto promedio por día</span><b>${money(perDay)}</b></div>
      ${worst ? `<div class="kv"><span>Mes de mayor gasto</span><b>${cap(MONTHS[worst.i])} · ${money(worst.m.exp)}</b></div>` : ''}
      ${best ? `<div class="kv"><span>Mes de menor gasto</span><b>${cap(MONTHS[best.i])} · ${money(best.m.exp)}</b></div>` : ''}
      ${budgetMonths.length ? `<div class="kv"><span>Presupuesto cumplido</span><b>${met} de ${plural(budgetMonths.length, 'mes', 'meses')}</b></div>` : ''}
      ${b.exp > 0 ? `<div class="kv"><span>Gastos vs ${y - 1}${cur ? ' (mismo periodo)' : ''}</span>${chg(pctChange(a.exp, b.exp), true)}</div>` : ''}
      ${b.inc > 0 ? `<div class="kv"><span>Ingresos vs ${y - 1}${cur ? ' (mismo periodo)' : ''}</span>${chg(pctChange(a.inc, b.inc), false)}</div>` : ''}`)}
    ${cats.length ? card('Dónde se fue el dinero', cats.map(([id, v]) => `<div class="catrow"><div class="top"><span class="catname">${mono(catById(id), true)}${esc(catById(id).name)}</span><span><b>${money(v)}</b> · ${Math.round(d.exp ? v / d.exp * 100 : 0)}%</span></div>${bar(d.exp ? v / d.exp * 100 : 0)}</div>`).join('')) : ''}
    ${card(`Ahorro y deudas en ${y}`, `
      <div class="kv"><span>Ahorrado en metas</span><b class="pos">${money(saved)}</b></div>
      <div class="kv"><span>Pagos de deudas</span><b>${money(debtPaid)}</b></div>
      ${d.borrowed ? `<div class="kv"><span>Préstamos solicitados recibidos</span><b>${money(d.borrowed)}</b></div>` : ''}
      ${d.lent || d.back ? `<div class="kv"><span>Préstamos entregados</span><b>${money(d.lent)}</b></div><div class="kv"><span>Cobros recibidos</span><b class="pos">${money(d.back)}</b></div>` : ''}`)}`) +
    (cur ? card('Situación actual', `
      <div class="kv"><span>Ahorrado en metas</span><b>${money(goalsTotal)}</b></div>
      <div class="kv"><span>Inversiones (valor actual)</span><b>${money(invCur)}${invIn ? ` · ${fmtPct(pctChange(invCur, invIn))}` : ''}</b></div>
      ${receivable ? `<div class="kv"><span>Préstamos por cobrar</span><b>${money(receivable)}</b></div>` : ''}
      <div class="kv"><span>Deudas pendientes</span><b class="${owed ? 'neg' : ''}">${money(owed)}</b></div>
      <div class="kv"><span>Posición neta registrada</span><b class="${net < 0 ? 'neg' : 'pos'}">${money(net)}</b></div>
      <p class="muted small" style="margin-top:6px">Ahorros en metas + inversiones + préstamos por cobrar − deudas, según lo que has registrado en la app.</p>`) : '');
}

/* ----- Más ----- */
function viewMore() {
  const items = [['deudas', ICON.deudas, 'Deudas', 'Saldos, cuotas y vencimientos'], ['prestamos', ICON.prestamos, 'Préstamos', 'Lo que has prestado y a quién'], ['inversiones', ICON.inversiones, 'Inversiones', 'Lo que has invertido y su resultado'],
    ['anual', ICON.anual, 'Resumen anual', 'Indicadores clave del año'], ['ajustes', ICON.ajustes, 'Ajustes', 'Perfil, preferencias y respaldo']];
  return head('Más', 'Otras secciones') +
    card('', items.map(([k, i, t, s]) => `<a class="row" href="#/${k}"><span class="emo">${i}</span><span class="grow"><b>${t}</b><small>${s}</small></span><span class="muted" aria-hidden="true">›</span></a>`).join(''));
}

/* ----- Ajustes ----- */
function viewSettings() {
  const st = state.settings, pr = state.profile;
  const profileCard = card('Perfil', pr
    ? `<div class="kv"><span>Nombre</span><b>${esc(pr.name)}</b></div><div class="kv"><span>Cumpleaños</span><b>${fmtBirthday(pr.birthdate)}</b></div><div class="btn-row"><button class="btn small" data-act="editProfile">Editar perfil</button></div>`
    : '<div class="btn-row"><button class="btn primary small" data-act="editProfile">Completar perfil</button></div>');
  const opt = (arr, cur) => arr.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const catRow = c => `<div class="mini"><span class="catname" style="color:var(--text)">${mono(c, true)}${esc(c.name)}</span><span class="badge">${c.type === 'income' ? 'Ingreso' : 'Gasto'}</span><button class="x" data-act="delCat" data-id="${esc(c.id)}" aria-label="Eliminar categoría">✕</button></div>`;
  return head('Ajustes', 'Perfil, sincronización y respaldo') + profileCard +
    card('Sincronización', `<div id="syncBody">${syncCardInner()}</div>`) +
    card('Preferencias', `
      <div class="field"><label>Moneda</label><select data-setting="currency">${opt(CURRENCIES.map(c => [c, c]), st.currency)}</select></div>
      <div class="field"><label>Vista por defecto de gastos y resumen</label><select data-setting="periodMode">${opt([['week', 'Semanal'], ['fortnight', 'Quincenal (1–15 y 16–fin de mes)'], ['month', 'Mensual']], st.periodMode)}</select></div>
      <div class="field"><label>La semana empieza el</label><select data-setting="weekStart">${opt([[1, 'Lunes'], [0, 'Domingo']], st.weekStart)}</select></div>`) +
    card('Avisos', `
      <p class="muted">Los avisos aparecen arriba al abrir la app. Los de cobros, vencimientos y ahorro se quedan hasta que los cierres con la ✕.</p>
      ${[['loans', 'Cobros de préstamos'], ['debts', 'Vencimientos de deudas'], ['savings', 'Avisos de ahorro'], ['birthday', 'Cumpleaños']].map(([k, l]) => `<label class="check"><input type="checkbox" data-notify="${k}" ${(st.notify || {})[k] !== false ? 'checked' : ''}> ${l}</label>`).join('')}
      <div class="btn-row"><button class="btn small" data-act="resetNotices">Volver a mostrar avisos cerrados</button></div>`) +
    card('Categorías', state.categories.map(catRow).join('') + '<div class="btn-row"><button class="btn small" data-act="addCat">＋ Nueva categoría</button></div>') +
    card('Respaldo de datos', `
      <p class="muted">Tus datos se guardan en este dispositivo. Un respaldo en archivo sirve de copia de seguridad (y para pasar datos si no usas la sincronización).</p>
      <div class="btn-row">
        <button class="btn primary small" data-act="exportData">Exportar respaldo</button>
        <button class="btn small" data-act="importPick">Importar respaldo</button>
      </div>
      <input type="file" id="importFile" accept="application/json,.json" hidden>
      <div class="btn-row">
        <button class="btn small" data-act="demo">Cargar datos de ejemplo</button>
        <button class="btn small danger" data-act="wipe">Borrar todos los datos</button>
      </div>`) +
    card('Acerca de', `<div class="kv"><span>Versión de la app</span><b>${APP_VERSION}</b></div><p class="muted small">Si hiciste cambios y no los ves, revisa que aquí aparezca la versión nueva.</p>`) +
    card('Instalar como app', `<div class="install">
      <b>iPhone</b>
      <ol><li>Abre la dirección de la app en <b>Safari</b>.</li><li>Toca el botón Compartir y elige <b>Agregar a pantalla de inicio</b>.</li></ol>
      <b style="display:block;margin-top:10px">Windows</b>
      <ol><li>Abre la app en <b>Edge</b> o <b>Chrome</b>.</li><li>Usa el ícono de instalar en la barra de direcciones (o menú ⋯ → Aplicaciones → Instalar).</li></ol></div>`);
}

/* =========================================================
   FORMULARIOS Y ACCIONES
   ========================================================= */
function openTxForm(tx, type = 'expense') {
  const isEdit = !!tx; type = tx ? tx.type : type;
  const catOpts = t => state.categories.filter(c => c.type === t).map(c => ({ value: c.id, label: c.name }));
  openForm({
    title: isEdit ? 'Editar movimiento' : type === 'income' ? 'Nuevo ingreso' : 'Nuevo gasto',
    fields: [
      { name: 'type', label: 'Tipo', type: 'select', options: [{ value: 'expense', label: 'Gasto' }, { value: 'income', label: 'Ingreso' }] },
      { name: 'amount', label: 'Monto', type: 'number', required: true, min: 0.01 },
      { name: 'categoryId', label: 'Categoría', type: 'select', options: catOpts(type) },
      { name: 'date', label: 'Fecha', type: 'date', required: true },
      { name: 'note', label: 'Nota (opcional)', type: 'text', placeholder: 'Ej: supermercado' }
    ],
    values: tx ? tx : { type, date: today() },
    focus: isEdit ? '' : 'amount',
    onSubmit: data => {
      const rec = { type: data.type, amount: data.amount, categoryId: data.categoryId, date: data.date, note: data.note };
      if (isEdit) Object.assign(tx, rec); else state.transactions.push({ id: uid(), createdAt: Date.now(), ...rec });
      if (!inRange(rec.date, periodOf(state.settings.periodMode, ui.refDate))) ui.refDate = rec.date;
      save(); render(true); toast(isEdit ? 'Cambios guardados' : 'Movimiento guardado');
    },
    onDelete: isEdit ? () => {
      if (!confirm('¿Eliminar este movimiento?')) return;
      state.transactions = state.transactions.filter(x => x.id !== tx.id);
      save(); closeModal(); render(true);
    } : null
  });
  $('#f_type').addEventListener('change', e => {
    $('#f_categoryId').innerHTML = catOpts(e.target.value).map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
  });
}

function openGoalForm(g, opts = {}) {
  const isEdit = !!g, monthlyMode = (!isEdit && opts.mode === 'monthly') || (isEdit && !(g.target > 0));
  const fields = monthlyMode ? [
    { name: 'name', label: 'Nombre del ahorro', required: true, placeholder: 'Ej: Ahorro mensual' },
    { name: 'monthly', label: 'Monto a ahorrar cada mes', type: 'number', required: true, min: 1 },
    { name: 'target', label: 'Monto objetivo (opcional · déjalo vacío si solo quieres ahorrar cada mes)', type: 'number', min: 1 },
    { name: 'deadline', label: 'Fecha objetivo (opcional)', type: 'date' },
    { name: 'reminderDay', label: 'Aviso de ahorro: día del mes (opcional, 1 a 31)', type: 'number', min: 1 }
  ] : [
    { name: 'name', label: 'Nombre de la meta', required: true, placeholder: 'Ej: Fondo de emergencia' },
    { name: 'target', label: isEdit ? 'Monto objetivo (opcional si tienes ahorro mensual)' : 'Monto objetivo', type: 'number', required: !isEdit, min: 1 },
    { name: 'monthly', label: 'Ahorro mensual planificado (opcional)', type: 'number', min: 0 },
    { name: 'deadline', label: 'Fecha objetivo (opcional)', type: 'date' },
    { name: 'reminderDay', label: 'Aviso de ahorro: día del mes (opcional, 1 a 31)', type: 'number', min: 1 }
  ];
  openForm({
    title: isEdit ? (monthlyMode ? 'Editar ahorro mensual' : 'Editar meta') : monthlyMode ? 'Nuevo ahorro mensual' : 'Nueva meta',
    note: monthlyMode ? 'Cada ahorro que registres se descuenta de tu saldo del mes y cuenta para este plan. Solo necesitas el monto mensual.' : '',
    fields, values: g ? { ...g, reminderDay: g.reminderDay || '', target: g.target || '', monthly: g.monthly || '' } : (monthlyMode ? { name: 'Ahorro mensual' } : {}), focus: isEdit ? '' : monthlyMode ? 'monthly' : 'name',
    validate: d => (d.reminderDay !== null && (!Number.isInteger(d.reminderDay) || d.reminderDay < 1 || d.reminderDay > 31) ? 'El día del aviso debe ser un número entre 1 y 31' : !d.target && !(d.monthly > 0) ? 'Indica un monto objetivo o un ahorro mensual' : null),
    onSubmit: d => {
      const target = d.target || 0, monthly = d.monthly || 0, reminderDay = d.reminderDay || 0;
      let goal = g;
      if (isEdit) {
        const changed = reminderDay !== (g.reminderDay || 0);
        Object.assign(g, { name: d.name, target, monthly, deadline: d.deadline, reminderDay });
        if (changed) g.reminderSince = today(); // el aviso vale desde el día en que lo configuras
      } else { goal = { id: uid(), name: d.name, target, monthly, deadline: d.deadline, reminderDay, reminderSince: reminderDay ? today() : '', contributions: [] }; state.goals.push(goal); }
      save(); render(true); toast(monthlyMode ? 'Ahorro mensual creado' : 'Meta guardada');
      if (opts.thenSave && !isEdit) setTimeout(() => openSavingForm(goal), 0); // al terminar de crear, registra el primer ahorro
    },
    onDelete: isEdit ? () => {
      if (!confirm(`¿Eliminar la meta "${g.name}" y su historial de ahorros? Esto también cambia tu saldo y tus resúmenes.`)) return;
      state.goals = state.goals.filter(x => x.id !== g.id); save(); closeModal(); render(true);
    } : null
  });
}
/* Registrar un ahorro. Con g=null se elige la meta; si no hay ninguna, se ofrece crearla. */
function openSavingForm(g) {
  if (!g) {
    if (!state.goals.length) { openGoalForm(null, { mode: 'monthly', thenSave: true }); return; }
    const open = state.goals.filter(x => goalInfo(x).left > 0);
    const pick = (open.find(x => x.monthly > 0 && goalMonthSaved(x) < x.monthly) || open[0] || state.goals[0]);
    return openSavingFormFor(null, pick);
  }
  openSavingFormFor(g, g);
}
function openSavingFormFor(fixed, pick) {
  const monthly = pick.monthly > 0 ? Math.max(0, pick.monthly - goalMonthSaved(pick)) : 0;
  const fields = [];
  if (!fixed) fields.push({ name: 'goalId', label: 'Meta o ahorro', type: 'select', options: state.goals.map(x => ({ value: x.id, label: x.name })) });
  fields.push({ name: 'amount', label: 'Monto ahorrado', type: 'number', required: true, min: 0.01 }, { name: 'date', label: 'Fecha', type: 'date', required: true }, { name: 'note', label: 'Nota (opcional)', type: 'text' });
  openForm({
    title: fixed ? `Registrar ahorro · ${fixed.name}` : 'Nuevo ahorro',
    note: 'El ahorro se descuenta de tu saldo del mes.',
    fields, values: { goalId: pick.id, date: today(), amount: monthly || '' }, focus: 'amount', submitLabel: 'Registrar',
    onSubmit: d => {
      const g = fixed || state.goals.find(x => x.id === d.goalId);
      if (!g) return;
      g.contributions.push({ id: uid(), date: d.date, amount: d.amount, note: d.note });
      save(); render(true); toast('Ahorro registrado');
    }
  });
}

/* Editar un ahorro ya registrado (monto, fecha, nota o a qué meta pertenece) */
function openSavingEditForm(g, c) {
  const fields = [];
  if (state.goals.length > 1) fields.push({ name: 'goalId', label: 'Meta o ahorro', type: 'select', options: state.goals.map(x => ({ value: x.id, label: x.name })) });
  fields.push({ name: 'amount', label: 'Monto ahorrado', type: 'number', required: true, min: 0.01 }, { name: 'date', label: 'Fecha', type: 'date', required: true }, { name: 'note', label: 'Nota (opcional)', type: 'text' });
  openForm({
    title: `Editar ahorro · ${g.name}`, note: 'Si te equivocaste, corrígelo aquí. Tu saldo y los resúmenes se actualizan solos.',
    fields, values: { goalId: g.id, amount: c.amount, date: c.date, note: c.note || '' }, submitLabel: 'Guardar',
    onSubmit: d => {
      Object.assign(c, { amount: d.amount, date: d.date, note: d.note });
      const to = d.goalId && d.goalId !== g.id ? state.goals.find(x => x.id === d.goalId) : null;
      if (to) { g.contributions = g.contributions.filter(x => x.id !== c.id); to.contributions.push(c); }
      save(); render(true); toast('Ahorro corregido');
    },
    onDelete: () => {
      if (!confirm('¿Eliminar este ahorro? Volverá a sumarse a tu saldo del mes.')) return;
      g.contributions = g.contributions.filter(x => x.id !== c.id); save(); closeModal(); render(true);
    }
  });
}
/* Editar un cobro de préstamo ya registrado */
function openLoanPayEditForm(l, x) {
  const maxAmt = loanRemaining(l) + x.amount;
  openForm({
    title: `Editar cobro · ${l.person}`, note: 'Corrige el monto, la fecha o la nota del cobro.',
    fields: [
      { name: 'amount', label: 'Monto cobrado', type: 'number', required: true, min: 0.01 },
      { name: 'date', label: 'Fecha del cobro', type: 'date', required: true },
      { name: 'note', label: 'Nota (opcional)', type: 'text' }
    ],
    values: { amount: x.amount, date: x.date, note: x.note || '' }, submitLabel: 'Guardar',
    validate: d => (d.amount > maxAmt + 0.001 ? `No puede superar lo que falta por cobrar (${money(maxAmt)})` : d.date < l.startDate ? 'El cobro no puede ser anterior al préstamo' : null),
    onSubmit: d => { Object.assign(x, { amount: d.amount, date: d.date, note: d.note }); save(); render(true); toast('Cobro corregido'); },
    onDelete: () => {
      if (!confirm('¿Eliminar este cobro? El monto volverá a figurar como pendiente.')) return;
      l.payments = l.payments.filter(p => p.id !== x.id); save(); closeModal(); render(true);
    }
  });
}
/* Editar un pago de deuda ya registrado */
function openPayEditForm(d, p) {
  const maxAmt = debtRemaining(d) + p.amount;
  openForm({
    title: `Editar pago · ${d.name}`, note: 'Corrige el monto o la fecha. El gasto asociado y el vencimiento no se modifican (edítalos en Gastos o en la deuda si hace falta).',
    fields: [
      { name: 'amount', label: 'Monto pagado', type: 'number', required: true, min: 0.01 },
      { name: 'date', label: 'Fecha de pago', type: 'date', required: true }
    ],
    values: { amount: p.amount, date: p.date }, submitLabel: 'Guardar',
    validate: v => (v.amount > maxAmt + 0.001 ? `No puede superar el saldo de la deuda (${money(maxAmt)})` : null),
    onSubmit: v => { Object.assign(p, { amount: v.amount, date: v.date }); save(); render(true); toast('Pago corregido'); },
    onDelete: () => {
      if (!confirm('¿Eliminar este pago? (No se modifica el vencimiento ni el gasto asociado)')) return;
      d.payments = d.payments.filter(x => x.id !== p.id); save(); closeModal(); render(true);
    }
  });
}

/* ----- Préstamos ----- */
function openLoanForm(l, person = '') {
  const isEdit = !!l, paid = isEdit ? loanPaid(l) : 0;
  openForm({
    title: isEdit ? 'Editar préstamo' : 'Nuevo préstamo',
    note: isEdit ? `Cobrado hasta ahora: ${money(paid)}.` : 'El dinero prestado se descuenta de tu saldo en la fecha del préstamo y vuelve cuando registres los cobros.',
    fields: [
      { name: 'person', label: 'Nombre de la persona', required: true, placeholder: 'Ej: Pedro', datalist: loanPeople().map(x => x.name) },
      { name: 'amount', label: 'Monto prestado', type: 'number', required: true, min: 1 },
      { name: 'startDate', label: 'Fecha del préstamo', type: 'date', required: true },
      { name: 'dueDate', label: 'Fecha de cobro (opcional)', type: 'date' },
      { name: 'note', label: 'Nota (opcional)', type: 'text', placeholder: 'Ej: para el arriendo' }
    ],
    values: l || { person, startDate: today() }, focus: isEdit ? '' : person ? 'amount' : 'person', submitLabel: isEdit ? 'Guardar' : 'Registrar',
    validate: d => {
      if (d.person.length > 40) return 'El nombre es demasiado largo (máx. 40 letras)';
      if (d.dueDate && d.dueDate < d.startDate) return 'La fecha de cobro no puede ser anterior a la del préstamo';
      if (isEdit && d.amount < paid) return `El monto no puede ser menor a lo ya cobrado (${money(paid)})`;
      return null;
    },
    onSubmit: d => {
      const rec = { person: d.person, amount: d.amount, startDate: d.startDate, dueDate: d.dueDate || '', note: d.note };
      if (isEdit) Object.assign(l, rec); else state.loans.push({ id: uid(), createdAt: Date.now(), payments: [], ...rec });
      save(); render(true); toast(isEdit ? 'Préstamo guardado' : 'Préstamo registrado');
    },
    onDelete: isEdit ? () => {
      if (!confirm(`¿Eliminar el préstamo a ${l.person} y sus cobros? Esto también cambia tu saldo y tus resúmenes.`)) return;
      state.loans = state.loans.filter(x => x.id !== l.id); save(); closeModal(); render(true);
    } : null
  });
}
function openLoanPayForm(l) {
  const rem = loanRemaining(l);
  openForm({
    title: `Cobro · ${l.person}`, note: `Por cobrar: ${money(rem)}. El cobro suma a tu saldo en la fecha indicada.`,
    fields: [
      { name: 'amount', label: 'Monto cobrado', type: 'number', required: true, min: 0.01 },
      { name: 'date', label: 'Fecha del cobro', type: 'date', required: true },
      { name: 'note', label: 'Nota (opcional)', type: 'text' }
    ],
    values: { amount: rem, date: today() }, focus: 'amount', submitLabel: 'Registrar cobro',
    validate: d => (d.amount > rem + 0.001 ? `No puede superar lo que falta por cobrar (${money(rem)})` : d.date < l.startDate ? 'El cobro no puede ser anterior al préstamo' : null),
    onSubmit: d => { l.payments.push({ id: uid(), date: d.date, amount: d.amount, note: d.note }); save(); render(true); toast('Cobro registrado'); }
  });
}

function openDebtForm(d) {
  const isEdit = !!d;
  openForm({
    title: isEdit ? 'Editar deuda' : 'Nueva deuda',
    note: isEdit ? `Pagado hasta ahora: ${money(sum(d.payments, p => p.amount))}. El saldo pendiente = monto total − pagos.` : 'Ingresa lo que debes hoy. Los pagos que registres irán descontando el saldo.',
    fields: [
      { name: 'name', label: 'Nombre', required: true, placeholder: 'Ej: Tarjeta de crédito' },
      { name: 'creditor', label: 'Acreedor / banco (opcional)' },
      { name: 'total', label: 'Monto total adeudado', type: 'number', required: true, min: 0 },
      { name: 'installment', label: 'Cuota (opcional)', type: 'number', min: 0 },
      { name: 'nextDue', label: 'Próximo vencimiento', type: 'date' },
      { name: 'recurring', label: 'La cuota se repite cada mes', type: 'checkbox', default: true }
    ],
    values: d || {}, focus: isEdit ? '' : 'name',
    onSubmit: v => {
      const rec = { name: v.name, creditor: v.creditor, total: v.total, installment: v.installment || 0, nextDue: v.nextDue, recurring: v.recurring };
      if (isEdit) Object.assign(d, rec); else state.debts.push({ id: uid(), payments: [], ...rec });
      save(); render(true); toast('Deuda guardada');
    },
    onDelete: isEdit ? () => {
      if (!confirm(`¿Eliminar la deuda "${d.name}"?`)) return;
      state.debts = state.debts.filter(x => x.id !== d.id); save(); closeModal(); render(true);
    } : null
  });
}
function openPayForm(d) {
  const rem = debtRemaining(d);
  const fields = [
    { name: 'amount', label: 'Monto pagado', type: 'number', required: true, min: 0.01 },
    { name: 'date', label: 'Fecha de pago', type: 'date', required: true }
  ];
  if (d.recurring && d.nextDue) fields.push({ name: 'advance', label: 'Mover el vencimiento al mes siguiente', type: 'checkbox', default: true });
  fields.push({ name: 'asExpense', label: 'Registrar también como gasto (categoría Deudas)', type: 'checkbox', default: true });
  openForm({
    title: `Pago · ${d.name}`, note: `Saldo pendiente: ${money(rem)}`, fields, submitLabel: 'Registrar pago',
    values: { amount: d.installment ? Math.min(d.installment, rem) : rem, date: today() }, focus: 'amount',
    onSubmit: v => {
      d.payments.push({ id: uid(), date: v.date, amount: v.amount });
      if (v.advance && d.nextDue) d.nextDue = addMonths(d.nextDue, 1);
      if (v.asExpense) {
        const catId = state.categories.some(c => c.id === 'deudas') ? 'deudas' : (state.categories.find(c => c.type === 'expense') || {}).id || '';
        state.transactions.push({ id: uid(), createdAt: Date.now(), type: 'expense', amount: v.amount, categoryId: catId, date: v.date, note: `Pago: ${d.name}` });
      }
      save(); render(true); toast('Pago registrado');
    }
  });
}

/* ----- Préstamos solicitados (dinero que te prestaron: queda como deuda y suma a tus ingresos) ----- */
function ensureLoanCat() {
  if (!state.categories.some(c => c.id === 'prestamo')) state.categories.push({ id: 'prestamo', name: 'Préstamos recibidos', emoji: '', type: 'income' });
  return 'prestamo';
}
function syncBorrowedIncome(debt, on) {
  const tx = state.transactions.find(t => t.id === debt.incomeTxId);
  if (!on) { if (tx) state.transactions = state.transactions.filter(t => t !== tx); debt.incomeTxId = ''; return; }
  const rec = { type: 'income', amount: debt.receivedAmount, categoryId: ensureLoanCat(), date: debt.receivedDate, note: debt.name, debtId: debt.id };
  if (tx) Object.assign(tx, rec);
  else { const nt = { id: uid(), createdAt: Date.now(), ...rec }; state.transactions.push(nt); debt.incomeTxId = nt.id; }
}
function openBorrowedForm(d) {
  const isEdit = !!d, hasTx = isEdit && state.transactions.some(t => t.id === d.incomeTxId), paid = isEdit ? sum(d.payments, p => p.amount) : 0;
  openForm({
    title: isEdit ? 'Editar préstamo solicitado' : 'Nuevo préstamo solicitado',
    note: isEdit ? `Pagado hasta ahora: ${money(paid)}.` : 'Se guarda como deuda (con su cuota y vencimiento). Si lo dejas marcado, el dinero recibido suma a tus ingresos en la fecha en que lo recibiste.',
    fields: [
      { name: 'creditor', label: 'Quién te prestó', required: true, placeholder: 'Ej: Carlos o Banco', datalist: [...new Set(state.debts.map(x => x.creditor).filter(Boolean))] },
      { name: 'received', label: 'Monto recibido', type: 'number', required: true, min: 1 },
      { name: 'total', label: 'Total a devolver (opcional · por defecto el monto recibido)', type: 'number', min: 0 },
      { name: 'receivedDate', label: 'Fecha en que lo recibiste', type: 'date', required: true },
      { name: 'installment', label: 'Cuota (opcional)', type: 'number', min: 0 },
      { name: 'nextDue', label: 'Fecha de pago / próximo vencimiento (opcional)', type: 'date' },
      { name: 'recurring', label: 'La cuota se repite cada mes', type: 'checkbox' },
      { name: 'addIncome', label: 'Sumar el monto recibido a mis ingresos', type: 'checkbox', default: isEdit ? hasTx : true }
    ],
    values: isEdit ? { ...d, received: d.receivedAmount || d.total, addIncome: hasTx } : { receivedDate: today() }, focus: isEdit ? '' : 'creditor', submitLabel: isEdit ? 'Guardar' : 'Registrar',
    validate: v => {
      const total = v.total || v.received;
      if (total < v.received) return 'El total a devolver no puede ser menor al monto recibido';
      if (isEdit && total < paid) return `El total no puede ser menor a lo ya pagado (${money(paid)})`;
      if (v.nextDue && v.nextDue < v.receivedDate) return 'El vencimiento no puede ser anterior a la fecha en que lo recibiste';
      return null;
    },
    onSubmit: v => {
      const rec = { kind: 'loan', name: `Préstamo de ${v.creditor}`, creditor: v.creditor, total: v.total || v.received, receivedAmount: v.received, receivedDate: v.receivedDate, installment: v.installment || 0, nextDue: v.nextDue, recurring: v.recurring };
      let debt = d;
      if (isEdit) Object.assign(d, rec); else { debt = { id: uid(), payments: [], incomeTxId: '', ...rec }; state.debts.push(debt); }
      syncBorrowedIncome(debt, v.addIncome);
      save(); render(true); toast(isEdit ? 'Préstamo guardado' : v.addIncome ? 'Préstamo registrado: suma a tus ingresos' : 'Préstamo registrado');
    },
    onDelete: isEdit ? () => {
      if (!confirm(`¿Eliminar el préstamo de ${d.creditor}?${hasTx ? ' También se eliminará el ingreso asociado (el dinero recibido).' : ''} Esto cambia tu saldo y tus resúmenes.`)) return;
      state.transactions = state.transactions.filter(t => t.id !== d.incomeTxId); state.debts = state.debts.filter(x => x.id !== d.id); save(); closeModal(); render(true);
    } : null
  });
}

function openInvForm(i) {
  const isEdit = !!i;
  openForm({
    title: isEdit ? 'Editar inversión' : 'Nueva inversión',
    fields: [
      { name: 'name', label: 'Nombre', required: true, placeholder: 'Ej: Fondo mutuo renta variable' },
      { name: 'kind', label: 'Tipo', type: 'select', options: INV_KINDS.map(k => ({ value: k, label: k })) },
      { name: 'invested', label: 'Monto invertido', type: 'number', required: true, min: 0 },
      { name: 'current', label: 'Valor actual', type: 'number', required: true, min: 0 },
      { name: 'date', label: 'Fecha de inversión', type: 'date' },
      { name: 'note', label: 'Nota (opcional)', type: 'text' }
    ],
    values: i || { date: today() }, focus: isEdit ? '' : 'name',
    onSubmit: v => {
      if (isEdit) {
        const changed = v.current !== i.current;
        Object.assign(i, { name: v.name, kind: v.kind, invested: v.invested, current: v.current, date: v.date, note: v.note });
        if (changed) i.history.push({ date: today(), value: v.current });
      } else state.investments.push({ id: uid(), name: v.name, kind: v.kind, invested: v.invested, current: v.current, date: v.date, note: v.note, history: [{ date: today(), value: v.current }] });
      save(); render(true); toast('Inversión guardada');
    },
    onDelete: isEdit ? () => {
      if (!confirm(`¿Eliminar "${i.name}"?`)) return;
      state.investments = state.investments.filter(x => x.id !== i.id); save(); closeModal(); render(true);
    } : null
  });
}
function openUpdInvForm(i) {
  openForm({
    title: `Actualizar valor · ${i.name}`, note: `Valor registrado: ${money(i.current)}`,
    fields: [
      { name: 'current', label: 'Nuevo valor actual', type: 'number', required: true, min: 0 },
      { name: 'date', label: 'Fecha', type: 'date', required: true }
    ],
    values: { current: i.current, date: today() }, focus: 'current', submitLabel: 'Actualizar',
    onSubmit: v => { i.current = v.current; i.history.push({ date: v.date, value: v.current }); save(); render(true); toast('Valor actualizado'); }
  });
}

function openBudgetForm(catId) {
  const p = periodOf('month', ui.budgetDate), key = monthKey(p.start), c = catById(catId);
  openForm({
    title: `Presupuesto · ${c.name}`, note: `Monto máximo a gastar en ${periodLabel('month', p)}. Déjalo vacío o en 0 para quitarlo.`,
    fields: [{ name: 'amount', label: 'Monto del mes', type: 'number', min: 0 }],
    values: { amount: (state.budgets[key] || {})[catId] || '' }, focus: 'amount',
    onSubmit: v => {
      state.budgets[key] = state.budgets[key] || {};
      if (v.amount) state.budgets[key][catId] = v.amount; else delete state.budgets[key][catId];
      save(); render(true);
    }
  });
}

function openCatForm() {
  openForm({
    title: 'Nueva categoría',
    fields: [
      { name: 'name', label: 'Nombre', required: true },
      { name: 'type', label: 'Tipo', type: 'select', options: [{ value: 'expense', label: 'Gasto' }, { value: 'income', label: 'Ingreso' }] }
    ],
    focus: 'name',
    onSubmit: v => { state.categories.push({ id: uid(), name: v.name, emoji: '', type: v.type }); save(); render(true); }
  });
}

/* ----- Respaldo ----- */
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `finanzas-respaldo-${today()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  toast('Respaldo exportado');
}
async function importFile(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!data || !Array.isArray(data.transactions)) throw new Error('formato');
    if (!confirm('Esto reemplazará los datos actuales por los del respaldo.' + syncWarn() + ' ¿Continuar?')) return;
    state = migrate(data); save(); render(true); toast('Respaldo importado');
  } catch (err) { toast('El archivo no es un respaldo válido'); }
}
function demoData() {
  const s = defaults(), t = today();
  s.settings = { ...state.settings }; s.profile = state.profile; // conserva tus preferencias y tu perfil
  const add =(type, categoryId, amount, ago, note) => s.transactions.push({ id: uid(), createdAt: Date.now() - ago * 1000, type, categoryId, amount, date: addDays(t, -ago), note });
  [['alimentacion', 42500, 0, 'Supermercado'], ['transporte', 12000, 1, 'Carga tarjeta transporte'], ['ocio', 18000, 2, 'Cine y cena'],
   ['alimentacion', 27800, 4, 'Feria'], ['servicios', 35900, 5, 'Internet'], ['salud', 15400, 7, 'Farmacia'],
   ['alimentacion', 51200, 9, 'Supermercado'], ['transporte', 24000, 10, 'Bencina'], ['ropa', 39990, 12, 'Zapatillas'],
   ['alimentacion', 33100, 14, 'Supermercado'], ['servicios', 28700, 16, 'Luz'], ['ocio', 22000, 18, 'Salida con amigos'],
   ['transporte', 12000, 20, 'Carga tarjeta transporte'], ['vivienda', 290000, 21, 'Arriendo'], ['alimentacion', 46800, 23, 'Supermercado'],
   ['salud', 32000, 26, 'Consulta médica'], ['educacion', 45000, 28, 'Curso online'], ['alimentacion', 38900, 31, 'Supermercado'],
   ['servicios', 19900, 34, 'Agua'], ['ocio', 15000, 37, 'Streaming y juegos']].forEach(x => add('expense', ...x));
  add('income', 'sueldo', 1200000, 20, 'Sueldo'); add('income', 'extra', 85000, 6, 'Trabajo freelance'); add('income', 'sueldo', 1200000, 50, 'Sueldo');
  s.budgets[monthKey(t)] = { alimentacion: 250000, transporte: 60000, vivienda: 300000, servicios: 90000, salud: 40000, ocio: 80000, deudas: 120000 };
  s.goals.push(
    { id: uid(), name: 'Fondo de emergencia', target: 1500000, deadline: addMonths(t, 8), contributions: [{ id: uid(), date: addDays(t, -30), amount: 100000, note: '' }, { id: uid(), date: addDays(t, -10), amount: 150000, note: '' }] },
    { id: uid(), name: 'Vacaciones', target: 600000, deadline: addMonths(t, 5), contributions: [{ id: uid(), date: addDays(t, -15), amount: 80000, note: '' }] });
  s.debts.push(
    { id: uid(), name: 'Tarjeta de crédito', creditor: 'Banco', total: 480000, installment: 80000, nextDue: addDays(t, 4), recurring: true, payments: [] },
    { id: uid(), name: 'Crédito de consumo', creditor: 'Banco', total: 900000, installment: 75000, nextDue: addDays(t, -2), recurring: true, payments: [{ id: uid(), date: addDays(t, -32), amount: 75000 }] });
  s.goals[0].monthly = 100000;
  s.goals[0].contributions.push({ id: uid(), date: t, amount: 60000, note: 'Ahorro del mes' });
  s.loans.push(
    { id: uid(), createdAt: Date.now(), person: 'Pedro', amount: 150000, startDate: addDays(t, -20), dueDate: addDays(t, 10), note: 'Para el arriendo', payments: [{ id: uid(), date: addDays(t, -5), amount: 50000, note: '' }] },
    { id: uid(), createdAt: Date.now(), person: 'Ana', amount: 40000, startDate: addDays(t, -45), dueDate: addDays(t, -5), note: '', payments: [] });
  const bid = uid(), btx = uid();
  s.debts.push({ id: bid, kind: 'loan', name: 'Préstamo de Carlos', creditor: 'Carlos', total: 200000, receivedAmount: 200000, receivedDate: addDays(t, -3), installment: 50000, nextDue: addDays(t, 25), recurring: true, payments: [], incomeTxId: btx });
  s.transactions.push({ id: btx, createdAt: Date.now(), type: 'income', amount: 200000, categoryId: 'prestamo', date: addDays(t, -3), note: 'Préstamo de Carlos', debtId: bid });
  s.investments.push(
    { id: uid(), name: 'Fondo mutuo balanceado', kind: 'Fondos mutuos', invested: 500000, current: 534000, date: addDays(t, -200), note: '', history: [] },
    { id: uid(), name: 'Acciones', kind: 'Acciones', invested: 300000, current: 289500, date: addDays(t, -120), note: '', history: [] },
    { id: uid(), name: 'Depósito a plazo', kind: 'Depósito a plazo', invested: 400000, current: 405000, date: addDays(t, -60), note: '', history: [] });
  return s;
}

/* ----- Perfil y cumpleaños ----- */
const fmtBirthday = iso => { const [, m, d] = iso.split('-').map(Number); return `${d} de ${MONTHS[m - 1]}`; };
function isBirthdayToday() {
  const b = state.profile && state.profile.birthdate;
  if (!b) return false;
  const [, bm, bd0] = b.split('-').map(Number), n = new Date(), y = n.getFullYear();
  const bd = (bm === 2 && bd0 === 29 && !isLeap(y)) ? 28 : bd0; // 29 de febrero → 28 en años no bisiestos
  return n.getMonth() + 1 === bm && n.getDate() === bd;
}
function openProfileForm(first = false) {
  openForm({
    title: first ? '¡Bienvenido/a! 👋' : 'Editar perfil',
    note: first ? 'Cuéntanos quién eres para personalizar la app. Estos datos se guardan en tu dispositivo.' + (cloud.user ? `<br><br><b>Sesión iniciada como ${esc(cloud.user.email || '')}.</b> Esta cuenta todavía no tiene datos guardados en la nube. Si ya usas la app en otro dispositivo, abre Ajustes → Sincronización allá y revisa el estado.` : '') : '',
    fields: [
      { name: 'name', label: 'Tu nombre', required: true, placeholder: 'Ej: Felipe' },
      { name: 'birthdate', label: 'Fecha de nacimiento', type: 'date', required: true, min: '1900-01-01', max: today() }
    ],
    extra: first && cloud.phase !== 'nocfg' && cloud.phase !== 'file' ? '<p class="muted" style="margin:4px 0 12px">¿Ya usas la app en otro dispositivo? <a href="#" data-act="welcomeLogin">Inicia sesión para traer tus datos</a></p>' : '',
    values: state.profile || {}, submitLabel: first ? 'Comenzar' : 'Guardar', locked: first, focus: 'name',
    validate: d => {
      if (d.name.length > 40) return 'El nombre es demasiado largo (máx. 40 letras)';
      if (d.birthdate < '1900-01-01' || d.birthdate > today()) return 'Revisa la fecha de nacimiento';
      return null;
    },
    onSubmit: d => { state.profile = { name: d.name, birthdate: d.birthdate }; if (first) { N.intro = true; saveNotices(); } save(); render(true); toast(first ? `¡Hola, ${d.name}!` : 'Perfil actualizado'); }
  });
}


/* =========================================================
   SINCRONIZACIÓN (Firebase). Si no está configurada, la app funciona igual, solo en este dispositivo.
   ========================================================= */
const syncWarn = () => cloud.user ? ' Como la sincronización está activa, el cambio también se aplicará en tus otros dispositivos y en la nube.' : '';
function authErr(e) {
  const m = {
    'auth/invalid-credential': 'Correo o contraseña incorrectos', 'auth/wrong-password': 'Correo o contraseña incorrectos', 'auth/user-not-found': 'Correo o contraseña incorrectos',
    'auth/email-already-in-use': 'Ya existe una cuenta con ese correo. Prueba iniciar sesión.', 'auth/weak-password': 'La contraseña es muy débil (mínimo 6 caracteres)',
    'auth/invalid-email': 'El correo no es válido', 'auth/network-request-failed': 'Sin conexión. Revisa tu internet e inténtalo otra vez.',
    'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.', 'auth/operation-not-allowed': 'Falta activar “Correo y contraseña” en Firebase (ver SINCRONIZACION.md)',
    'auth/unauthorized-domain': 'Esta dirección no está autorizada en Firebase (ver SINCRONIZACION.md)'
  };
  return m[e && e.code] || `No se pudo completar (${(e && (e.code || e.message)) || 'error'})`;
}
function syncStatusText() {
  const s = cloud.status;
  if (s.state === 'syncing') return 'Sincronizando…';
  if (s.state === 'error') {
    if (s.code === 'permission-denied') return 'Firestore rechazó el acceso: revisa las reglas (SINCRONIZACION.md)';
    return 'Sin conexión o con error; se reintentará solo' + (s.code || s.message ? ` (${s.code || s.message})` : '');
  }
  if (s.state === 'ok' && s.last) return 'Sincronizado a las ' + new Date(s.last).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  return 'Conectando…';
}
function syncCardInner() {
  const intro = '<p class="muted">Mantén tus datos iguales en el iPhone y el PC con una cuenta gratuita (correo y contraseña).</p>';
  if (cloud.phase === 'nocfg') return intro + '<p class="muted">La sincronización aún no está configurada. Sigue la guía <b>SINCRONIZACION.md</b> (unos 10 minutos) y pega tu configuración en <b>firebase-config.js</b>.</p>';
  if (cloud.phase === 'file') return intro + '<p class="muted">Para sincronizar, abre la app desde una dirección <b>https://</b> o <b>localhost</b> (no haciendo doble clic en el archivo). Ver <b>SINCRONIZACION.md</b>.</p>';
  if (cloud.phase === 'failed') return intro + `<p class="muted">No se pudo cargar el servicio de sincronización (${esc(cloud.error || 'sin conexión')}). Se reintentará al volver la conexión.</p>`;
  if (cloud.phase === 'loading') return intro + '<p class="muted">Conectando…</p>';
  if (!cloud.user) return intro + '<div class="btn-row"><button class="btn primary small" data-act="syncLogin">Iniciar sesión</button><button class="btn small" data-act="syncSignup">Crear cuenta</button><button class="btn small" data-act="syncReset">Olvidé mi contraseña</button></div>';
  const bad = cloud.status.state === 'error';
  return `<div class="kv"><span>Cuenta</span><b>${esc(cloud.user.email || '')}</b></div><div class="kv"><span>Registros en la nube</span><b>${cloud.engine ? cloud.engine.stats().known : 0}</b></div><div class="kv"><span>Pendientes por subir</span><b>${cloud.engine ? cloud.engine.stats().pending : 0}</b></div><div class="kv"><span>Estado</span><b><span class="badge ${bad ? 'warn' : cloud.status.state === 'ok' ? 'ok' : ''}">${esc(syncStatusText())}</span></b></div>` +
    '<div class="btn-row"><button class="btn small" data-act="syncNow">Sincronizar ahora</button><button class="btn small" data-act="syncLogout">Cerrar sesión</button></div>';
}
function updateSyncCard() {
  const el = $('#syncBody'); if (el) el.innerHTML = syncCardInner();
  const b = $('#syncBanner'); if (b) b.innerHTML = syncBannerHTML();
}
// Aviso visible en todas las pantallas cuando la sincronización está fallando
function syncBannerHTML() {
  if (!cloud.user || cloud.status.state !== 'error') return '';
  return `<a class="sync-warn" href="#/ajustes"><b>La sincronización no está funcionando.</b> ${esc(syncStatusText())}. Toca para ver detalles.</a>`;
}
// Mientras se confirma si hay una cuenta con datos, no se pide el perfil (evita pedir nombre y fecha dos veces)
function waitingForCloud() {
  if (cloud.waitDone) return false;
  if (cloud.phase === 'loading') return true;
  if (cloud.phase === 'ready' && cloud.user && cloud.engine && !cloud.engine.initialPulled && cloud.status.state !== 'error') return true;
  return false;
}

function openAuthForm(mode) {
  const email = { name: 'email', label: 'Correo electrónico', type: 'email', required: true, autocomplete: 'username', placeholder: 'tu@correo.com' };
  const pass = (label, auto) => ({ name: 'password', label, type: 'password', required: true, autocomplete: auto });
  const cfg = {
    login: { title: 'Iniciar sesión', submit: 'Entrar', fields: [email, pass('Contraseña', 'current-password')], note: 'Entra con la misma cuenta en todos tus dispositivos.' },
    signup: { title: 'Crear cuenta', submit: 'Crear cuenta', fields: [email, pass('Contraseña (mínimo 6 caracteres)', 'new-password'), { ...pass('Repite la contraseña', 'new-password'), name: 'password2' }], note: 'Crea la cuenta una sola vez y luego usa “Iniciar sesión” en los demás dispositivos.' },
    reset: { title: 'Restablecer contraseña', submit: 'Enviar correo', fields: [email], note: 'Te enviaremos un correo con un enlace para elegir una contraseña nueva.' }
  }[mode];
  openForm({
    title: cfg.title, note: cfg.note, fields: cfg.fields, submitLabel: cfg.submit, focus: 'email',
    extra: '<p id="formError" class="form-error" role="alert"></p>' + (mode === 'reset' ? '' : '<p style="margin:0 0 10px"><button type="button" class="link" data-act="togglePass">Mostrar contraseña</button></p>'),
    validate: d => mode === 'signup' ? (d.password.length < 6 ? 'La contraseña debe tener al menos 6 caracteres' : d.password !== d.password2 ? 'Las contraseñas no coinciden' : null) : null,
    onSubmit: async d => {
      const fe = $('#formError'); if (fe) fe.textContent = '';
      try {
        if (mode === 'login') await cloud.remote.signIn(d.email, d.password);
        else if (mode === 'signup') await cloud.remote.signUp(d.email, d.password);
        else { await cloud.remote.resetPassword(d.email); toast('Listo: revisa tu correo (y la carpeta de spam)'); }
        return true;
      } catch (e) {
        const msg = authErr(e), code = (e && e.code) ? ` [${e.code}]` : '';
        if (fe) fe.textContent = msg + (msg.startsWith('No se pudo') ? '' : code); else toast(msg);
        return false;
      }
    }
  });
}

function initSync() {
  const factory = window.__FINANZAS_REMOTE_FACTORY; // solo para pruebas automáticas
  if (!window.FinanzasSync || (!factory && !cloud.cfg)) { cloud.phase = 'nocfg'; return; }
  if (!factory && !/^https?:$/.test(location.protocol)) { cloud.phase = 'file'; return; }
  cloud.phase = 'loading';
  const remote = cloud.remote = factory ? factory(cloud.cfg) : window.FinanzasSync.remoteFactory(cloud.cfg);
  remote.init().then(() => {
    cloud.engine = new window.FinanzasSync.SyncEngine({
      getState: () => state, remote, storage: localStorage,
      onRemoteChange: () => { persistLocal(); render(true); },
      onInitialPull: () => { persistLocal(); if (state.profile && modalLocked) closeModal(); render(true); },
      onStatus: st => { cloud.status = st; updateSyncCard(); if (st.state === 'error' && !state.profile && !modalLocked) render(true); }
    });
    cloud.phase = 'ready';
    remote.onAuth(user => {
      cloud.user = user;
      cloud.status = { state: 'syncing', last: 0, message: '' };
      if (user) cloud.engine.start(user.uid); else { cloud.engine.stop(); if (!state.profile && !modalLocked) render(true); }
      updateSyncCard();
    });
    updateSyncCard();
  }).catch(e => { cloud.phase = 'failed'; cloud.error = (e && e.message) || ''; cloud.remote = null; updateSyncCard(); if (!state.profile && !modalLocked) render(true); });
  setTimeout(() => { cloud.waitDone = true; if (!state.profile && !modalLocked) render(true); }, 8000); // si la nube no responde, se sigue sin ella
}
window.addEventListener('online', () => { if (cloud.phase === 'failed') initSync(); else if (cloud.engine) cloud.engine.pushNow(); });

const actions = {
  go: d => { location.hash = '#/' + d.to; },
  closeModal: () => tryClose(),
  welcomeLogin: () => { if (cloud.phase === 'ready') openAuthForm('login'); else toast('Conectando con el servicio… inténtalo en un momento'); },
  togglePass: (d, el) => {
    const f = ['f_password', 'f_password2'].map(id => document.getElementById(id)).filter(Boolean);
    const show = f[0] && f[0].type === 'password';
    f.forEach(i => { i.type = show ? 'text' : 'password'; });
    if (el) el.textContent = show ? 'Ocultar contraseña' : 'Mostrar contraseña';
  },
  syncLogin: () => openAuthForm('login'),
  syncSignup: () => openAuthForm('signup'),
  syncReset: () => openAuthForm('reset'),
  syncNow: () => { if (cloud.engine) { cloud.engine.pushNow(); toast('Sincronizando…'); } },
  syncLogout: () => { if (cloud.remote && confirm('¿Cerrar sesión? Tus datos seguirán en este dispositivo, pero dejarán de sincronizarse.\n\nSi después entras con OTRA cuenta, los datos de este dispositivo se combinarán con ella.')) cloud.remote.signOut(); },
  yearShift: d => { ui.year += Number(d.dir); render(true); },
  dismissNotice: d => { N.dismissed[d.key] = today(); saveNotices(); render(true); },
  resetNotices: () => { N = { dismissed: {}, shown: {}, intro: false }; saveNotices(); render(true); toast('Los avisos cerrados volverán a mostrarse si corresponden'); },
  editProfile: () => openProfileForm(false),
  setMode: d => { state.settings.periodMode = d.mode; save(); render(true); },
  shift: d => { const mode = state.settings.periodMode; ui.refDate = shiftPeriod(mode, periodOf(mode, ui.refDate), Number(d.dir)).start; render(true); },
  goToday: () => { ui.refDate = today(); render(true); },
  goPeriod: d => { ui.refDate = d.date; render(); },
  addTx: d => openTxForm(null, d.type || 'expense'),
  editTx: d => { const t = state.transactions.find(x => x.id === d.id); if (t) openTxForm(t); },
  budgetShift: d => { ui.budgetDate = shiftPeriod('month', periodOf('month', ui.budgetDate), Number(d.dir)).start; render(true); },
  editBudget: d => openBudgetForm(d.id),
  copyBudget: () => {
    const p = periodOf('month', ui.budgetDate), key = monthKey(p.start), prev = monthKey(shiftPeriod('month', p, -1).start);
    const src = state.budgets[prev];
    if (!src || !Object.keys(src).length) return toast('El mes anterior no tiene presupuesto');
    if (Object.keys(state.budgets[key] || {}).length && !confirm('Este mes ya tiene presupuesto. ¿Reemplazarlo por el del mes anterior?')) return;
    state.budgets[key] = { ...src }; save(); render(true); toast('Presupuesto copiado');
  },
  addGoal: () => openGoalForm(null),
  addMonthly: () => openGoalForm(null, { mode: 'monthly' }),
  addSavingQuick: () => openSavingForm(null),
  addLoan: d => openLoanForm(null, d.person || ''),
  editLoan: d => { const l = state.loans.find(x => x.id === d.id); if (l) openLoanForm(l); },
  payLoan: d => { const l = state.loans.find(x => x.id === d.id); if (l) openLoanPayForm(l); },
  delLoanPay: d => { const l = state.loans.find(x => x.id === d.id); if (l && confirm('¿Eliminar este cobro? El monto volverá a figurar como pendiente.')) { l.payments = l.payments.filter(p => p.id !== d.pid); save(); render(true); } },
  loanTab: d => { ui.loanTab = d.tab; ui.loanPerson = null; render(true); },
  openPerson: d => { ui.loanPerson = d.key; render(); },
  closePerson: () => { ui.loanPerson = null; render(); },
  editGoal: d => { const g = state.goals.find(x => x.id === d.id); if (g) openGoalForm(g); },
  addSaving: d => { const g = state.goals.find(x => x.id === d.id); if (g) openSavingForm(g); },
  editSaving: d => { const g = state.goals.find(x => x.id === d.id), c = g && g.contributions.find(x => x.id === d.cid); if (c) openSavingEditForm(g, c); },
  editLoanPay: d => { const l = state.loans.find(x => x.id === d.id), x = l && l.payments.find(y => y.id === (d.cid || d.pid)); if (x) openLoanPayEditForm(l, x); },
  editPayment: d => { const x = state.debts.find(y => y.id === d.id), p = x && x.payments.find(q => q.id === d.pid); if (p) openPayEditForm(x, p); },
  delSaving: d => { const g = state.goals.find(x => x.id === d.id); if (g && confirm('¿Eliminar este ahorro? Volverá a sumarse a tu saldo del mes.')) { g.contributions = g.contributions.filter(c => c.id !== d.cid); save(); render(true); } },
  addDebt: () => openDebtForm(null),
  editDebt: d => { const x = state.debts.find(y => y.id === d.id); if (x) (x.kind === 'loan' ? openBorrowedForm(x) : openDebtForm(x)); },
  addBorrowed: () => openBorrowedForm(null),
  payDebt: d => { const x = state.debts.find(y => y.id === d.id); if (x) openPayForm(x); },
  delPayment: d => { const x = state.debts.find(y => y.id === d.id); if (x && confirm('¿Eliminar este pago? (No se modifica el vencimiento ni el gasto asociado)')) { x.payments = x.payments.filter(p => p.id !== d.pid); save(); render(true); } },
  addInv: () => openInvForm(null),
  editInv: d => { const x = state.investments.find(y => y.id === d.id); if (x) openInvForm(x); },
  updInv: d => { const x = state.investments.find(y => y.id === d.id); if (x) openUpdInvForm(x); },
  addCat: () => openCatForm(),
  delCat: d => { if (confirm('¿Eliminar la categoría? Los movimientos existentes quedarán como "Sin categoría".')) { state.categories = state.categories.filter(c => c.id !== d.id); save(); render(true); } },
  exportData: () => exportData(),
  importPick: () => { const f = $('#importFile'); if (f) f.click(); },
  demo: () => { if (confirm('Esto reemplazará tus datos actuales por datos de ejemplo.' + syncWarn() + ' ¿Continuar?')) { state = demoData(); save(); render(true); toast('Datos de ejemplo cargados'); } },
  wipe: () => { if (confirm((cloud.user ? '¿Borrar TODOS tus datos?' + syncWarn() : '¿Borrar TODOS los datos de este dispositivo?') + ' Esta acción no se puede deshacer.') && confirm('Última confirmación: ¿borrar todo?')) { state = defaults(); save(); render(true); toast('Datos borrados'); } }
};

/* =========================================================
   ENRUTADOR Y ARRANQUE
   ========================================================= */
const routes = { home: viewHome, gastos: viewTx, presupuesto: viewBudget, metas: viewGoals, deudas: viewDebts, prestamos: viewLoans, inversiones: viewInv, anual: viewYear, mas: viewMore, ajustes: viewSettings };
// [ruta, ícono, texto, clase]. En el celular se ven 5 pestañas (la última, "Más", agrupa el resto); en PC se ven todas.
const NAV = [
  ['home', ICON.home, 'Inicio', ''], ['gastos', ICON.gastos, 'Gastos', ''], ['presupuesto', ICON.presupuesto, 'Presupuesto', ''], ['metas', ICON.metas, 'Metas', ''],
  ['deudas', ICON.deudas, 'Deudas', 'only-desktop'], ['prestamos', ICON.prestamos, 'Préstamos', 'only-desktop'], ['inversiones', ICON.inversiones, 'Inversiones', 'only-desktop'], ['anual', ICON.anual, 'Resumen anual', 'only-desktop'], ['ajustes', ICON.ajustes, 'Ajustes', 'only-desktop'],
  ['mas', ICON.mas, 'Más', 'only-mobile']
];
const MORE = ['mas', 'deudas', 'prestamos', 'inversiones', 'anual', 'ajustes'];
function currentRoute() {
  const r = location.hash.replace(/^#\/?/, '') || 'home';
  return routes[r] ? r : 'home';
}
function render(keepScroll) {
  const r = currentRoute(), y = window.scrollY;
  $('#nav').innerHTML = '<div class="brand only-desktop"><span class="logo-tile">'+LOGO(30)+'</span><span>Mis Finanzas</span></div>' + NAV.map(([k, i, l, cls]) => {
    const on = k === r || (k === 'mas' && MORE.includes(r));
    return `<a href="#/${k}" class="${on ? 'active' : ''} ${cls}" ${on ? 'aria-current="page"' : ''}><span class="ico">${i}</span><span class="lbl">${l}</span></a>`;
  }).join('');
  const banner = noticesHTML();
  try { $('#view').innerHTML = banner + `<div id="syncBanner">${syncBannerHTML()}</div>` + routes[r](); }
  catch (e) { console.error(e); $('#view').innerHTML = card('Ocurrió un error', `<p class="muted">No se pudo mostrar esta pantalla (${esc(e.message)}).</p>`); }
  document.title = `${NAV.find(n => n[0] === r)[2]} · Mis Finanzas`;
  window.scrollTo(0, keepScroll === true ? y : 0);
  fitStats();
  if (!state.profile && !modalLocked && !waitingForCloud()) openProfileForm(true); // primer uso: pedir nombre y fecha de nacimiento
}

// Reacomoda las tarjetas de 3 cifras cuando un monto no cabe (pantallas angostas o montos muy grandes)
function fitStats() {
  const clipped = g => [...g.querySelectorAll('.stat b')].some(b => b.scrollWidth > b.clientWidth + 1);
  document.querySelectorAll('.stats').forEach(g => {
    g.classList.remove('wide', 'tight');
    if (clipped(g)) { g.classList.add('wide'); if (clipped(g)) g.classList.add('tight'); }
  });
}
window.addEventListener('resize', fitStats);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ui.day !== today()) { ui.day = today(); render(true); } });

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && actions[el.dataset.act]) { e.preventDefault(); actions[el.dataset.act](el.dataset, el); return; }
  if (e.target.id === 'modal') tryClose();
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'importFile' && t.files && t.files[0]) { importFile(t.files[0]); t.value = ''; return; }
  if (t.dataset && t.dataset.notify) { state.settings.notify = { ...(state.settings.notify || {}), [t.dataset.notify]: t.checked }; save(); render(true); return; }
  if (t.dataset && t.dataset.setting) {
    const k = t.dataset.setting;
    state.settings[k] = k === 'weekStart' ? Number(t.value) : t.value;
    save(); render(true);
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) tryClose(); });
window.addEventListener('hashchange', () => { tryClose(); render(); });

/* ---------- Actualización automática ----------
   Al abrir la app, al volver a ella y cada 30 minutos se compara la versión instalada con la publicada.
   Si hay una nueva, se limpia la memoria guardada y se recarga sola (tus datos no se tocan). */
const ONLINE_HTTP = /^https?:$/.test(location.protocol);
async function latestVersion() {
  const r = await fetch('index.html?_=' + Date.now(), { cache: 'no-store' });
  const m = (await r.text()).match(/app\.js\?v=([\w.-]+)/);
  return m ? m[1] : null;
}
async function updateNow() {
  try { if ('caches' in window) await Promise.all((await caches.keys()).map(k => caches.delete(k))); } catch (e) { /* sigue */ }
  try { if (navigator.serviceWorker) await Promise.all((await navigator.serviceWorker.getRegistrations()).map(r => r.unregister())); } catch (e) { /* sigue */ }
  location.replace(location.pathname + '?r=' + Date.now() + location.hash);
}
function showUpdateBar() {
  if ($('#updateBar')) return;
  const bar = document.createElement('div'); bar.id = 'updateBar'; bar.className = 'update-bar'; bar.setAttribute('role', 'status');
  bar.innerHTML = '<span>Hay una versión nueva de la app.</span><button type="button" class="btn small primary" data-act="updateNow">Actualizar ahora</button>';
  document.body.appendChild(bar);
}
actions.updateNow = () => updateNow();
async function checkForUpdate() {
  if (!ONLINE_HTTP || !navigator.onLine) return;
  try {
    const v = await latestVersion();
    if (!v || v === APP_VERSION) return;
    const last = Number(sessionStorage.getItem('finanzas.updTry') || 0);
    if (!$('#modal').classList.contains('hidden') || Date.now() - last < 60000) { showUpdateBar(); return; } // editando algo, o ya se intentó hace poco
    sessionStorage.setItem('finanzas.updTry', String(Date.now()));
    updateNow();
  } catch (e) { /* sin conexión: se reintenta luego */ }
}
if ('serviceWorker' in navigator && ONLINE_HTTP) {
  navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(() => { });
  setTimeout(checkForUpdate, 1500);
  setInterval(checkForUpdate, 30 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
}
initSync();
render();
