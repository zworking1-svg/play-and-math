/* =========================================================
   Демо-режим без Firebase: всё хранится в localStorage этого браузера.
   Включается адресом ?mock (или сам, если в config.js нет ключей).
   Нужен для проверки игры и админ-панели без интернета.
   ========================================================= */
import { mergeConfig, emptyProfile, normalizeProfile } from './settings.js';

const KEY = 'filya.mock.db';
const load = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
};
const db = () => load() || { users: {}, players: {}, games: [], presence: {}, config: null };
const save = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* приватный режим */ } };
const err = (code) => Object.assign(new Error(code), { code });
const id = () => Math.random().toString(36).slice(2, 12);

let user = null;
try { user = JSON.parse(sessionStorage.getItem('filya.mock.user')); } catch { /* нет */ }
const listeners = new Set();
const setUser = (u) => {
  user = u;
  try { sessionStorage.setItem('filya.mock.user', JSON.stringify(u)); } catch { /* нет */ }
  listeners.forEach((cb) => cb(u));
};

// живые подписки в демо-режиме: опрос раз в секунду
function watch(read, cb) {
  let last = '';
  const run = () => {
    const v = read();
    const s = JSON.stringify(v);
    if (s !== last) { last = s; cb(v); }
  };
  run();
  const t = setInterval(run, 1000);
  return () => clearInterval(t);
}

export const cloud = {
  mode: 'mock',

  onAuth(cb) {
    listeners.add(cb);
    setTimeout(() => cb(user), 0);
    return () => listeners.delete(cb);
  },
  async register(login, pin, age) {
    const d = db();
    const k = login.trim().toLowerCase();
    if (d.users[k]) throw err('auth/email-already-in-use');
    const uid = 'u' + id();
    d.users[k] = { uid, pin };
    save(d);
    const p = await this.createProfile(uid, login.trim(), age);
    setUser({ uid, email: k });
    return p;
  },
  async signIn(login, pin) {
    const u = db().users[login.trim().toLowerCase()];
    if (!u || u.pin !== pin) throw err('auth/invalid-credential');
    setUser({ uid: u.uid, email: login.trim().toLowerCase() });
  },
  async signOut() { setUser(null); },
  loginFromEmail(email) { return email || 'Игрок'; },
  async createProfile(uid, login, age) {
    const d = db();
    d.players[uid] = { ...emptyProfile(login, age), createdAt: Date.now() };
    save(d);
    return normalizeProfile(d.players[uid]);
  },
  async getProfile(uid) {
    const p = db().players[uid];
    return p ? normalizeProfile(p) : null;
  },
  async updateAge(uid, age) {
    const d = db();
    if (d.players[uid]) d.players[uid].age = age;
    save(d);
  },
  async addBadge(uid, badge) {
    const d = db();
    const p = d.players[uid];
    if (p && !p.badges.includes(badge)) p.badges.push(badge);
    save(d);
  },
  async addViolation(uid) {
    const d = db();
    if (d.players[uid]) d.players[uid].violations++;
    save(d);
  },
  async recordGame(uid, p, g, device) {
    const d = db();
    const s = d.players[uid];
    if (!s) return;
    s.games++;
    s.playSeconds += g.seconds;
    s.correct += g.correct;
    s.wrong += g.wrong;
    s[g.result === 'win' ? 'wins' : 'losses']++;
    s.totalScore += g.score;
    Object.assign(s, { bestScore: p.bestScore, bestLevel: p.bestLevel, recent: p.recent, lastPlayed: Date.now() });
    d.games.unshift({ id: id(), uid, login: p.login, age: p.age, ...g, device, endedAt: Date.now() });
    d.games = d.games.slice(0, 500);
    save(d);
  },
  async listPlayers(age) {
    return Object.entries(db().players)
      .map(([uid, p]) => ({ ...normalizeProfile(p), uid }))
      .filter((p) => !age || p.age === age);
  },
  async setPresence(uid, data) {
    const d = db();
    d.presence[uid] = { ...d.presence[uid], ...data, updatedAt: Date.now() };
    save(d);
  },

  async loadConfig() { return mergeConfig(db().config); },
  async saveConfig(cfg) {
    const d = db();
    d.config = cfg;
    save(d);
  },

  async adminSignIn() { setUser({ uid: 'mock-admin', email: 'admin' }); },
  async isAdmin(uid) { return uid === 'mock-admin'; },
  watchPresence(cb) {
    return watch(() => Object.entries(db().presence).map(([uid, p]) => ({ uid, ...p })), cb);
  },
  watchPlayers(cb) { return watch(() => Object.entries(db().players).map(([uid, p]) => ({ ...normalizeProfile(p), uid })), cb); },
  async listGames(n = 200) { return db().games.slice(0, n); },
  async deletePlayer(uid) {
    const d = db();
    delete d.players[uid];
    delete d.presence[uid];
    save(d);
  },

  watchPins(cb) {
    return watch(() => Object.fromEntries(Object.values(db().users).map((u) => [u.uid, u.pin])), cb);
  },
  async changePin(uid, newPin) {
    const d = db();
    const u = Object.values(d.users).find((x) => x.uid === uid);
    if (!u) throw err('no-pin');
    u.pin = newPin;
    save(d);
  },
};
