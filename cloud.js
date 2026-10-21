/* =========================================================
   Работа с Firebase: аккаунты игроков, статистика, онлайн, настройки.
   Тот же набор функций есть в cloud-mock.js (для проверки без интернета).
   ========================================================= */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, initializeAuth, inMemoryPersistence, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup, updatePassword,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc, collection, query, where,
  orderBy, limit, getDocs, onSnapshot, serverTimestamp, increment, arrayUnion,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { mergeConfig, emptyProfile, normalizeProfile, toMillis } from './settings.js';

const fc = window.FIREBASE_CONFIG;
const appConfig = {
  apiKey: fc.apiKey,
  authDomain: fc.authDomain || `${fc.projectId}.firebaseapp.com`,
  projectId: fc.projectId,
};
const app = initializeApp(appConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// второй, временный вход — чтобы админ мог сменить PIN ребёнка, не выходя из своего аккаунта
let helperAuth = null;
const getHelperAuth = () =>
  (helperAuth ||= initializeAuth(initializeApp(appConfig, 'pin-helper'), { persistence: inMemoryPersistence }));

/* Firebase умеет входить только по почте и паролю (от 6 символов),
   поэтому логин превращается в служебную «почту», а PIN — в пароль.
   Настоящая почта ребёнку не нужна, писем никто не получает. */
const EMAIL_DOMAIN = 'players.filya.game';
const hex = (s) => [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, '0')).join('');
const loginToEmail = (login) => `u${hex(login.trim().toLowerCase())}@${EMAIL_DOMAIN}`;
const pinToPassword = (pin) => `filya-${pin}-pin`;

const player = (uid) => doc(db, 'players', uid);
const docs = (snap) => snap.docs.map((d) => ({ uid: d.id, ...d.data() }));

export const cloud = {
  mode: 'firebase',

  /* ---------- аккаунт игрока ---------- */
  onAuth(cb) {
    return onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: u.email } : null));
  },
  async register(login, pin, age) {
    const cred = await createUserWithEmailAndPassword(auth, loginToEmail(login), pinToPassword(pin));
    const profile = await this.createProfile(cred.user.uid, login.trim(), age);
    // PIN хранится отдельно: его видят только сам игрок и администратор
    await setDoc(doc(db, 'secrets', cred.user.uid), { login: login.trim(), pin });
    return profile;
  },
  async signIn(login, pin) {
    await signInWithEmailAndPassword(auth, loginToEmail(login), pinToPassword(pin));
  },
  signOut() { return signOut(auth); },
  loginFromEmail(email) {
    const m = /^u([0-9a-f]+)@/.exec(email || '');
    if (!m) return 'Игрок';
    const bytes = new Uint8Array(m[1].match(/../g).map((h) => parseInt(h, 16)));
    return new TextDecoder().decode(bytes);
  },
  async createProfile(uid, login, age) {
    const p = emptyProfile(login, age);
    await setDoc(player(uid), { ...p, createdAt: serverTimestamp() });
    return normalizeProfile({ ...p, createdAt: Date.now() });
  },
  async getProfile(uid) {
    const snap = await getDoc(player(uid));
    return snap.exists() ? normalizeProfile(snap.data()) : null;
  },
  updateAge(uid, age) { return updateDoc(player(uid), { age }); },
  addBadge(uid, id) { return updateDoc(player(uid), { badges: arrayUnion(id) }); },
  // нарушение записывается сразу, а не в конце игры
  addViolation(uid) { return updateDoc(player(uid), { violations: increment(1) }); },

  // p — профиль, уже обновлённый в игре; g — итог игры (нарушения уже учтены addViolation)
  async recordGame(uid, p, g, device) {
    await updateDoc(player(uid), {
      games: increment(1),
      playSeconds: increment(g.seconds),
      correct: increment(g.correct),
      wrong: increment(g.wrong),
      [g.result === 'win' ? 'wins' : 'losses']: increment(1),
      totalScore: increment(g.score),
      bestScore: p.bestScore,
      bestLevel: p.bestLevel,
      recent: p.recent,
      lastPlayed: serverTimestamp(),
    });
    await addDoc(collection(db, 'games'), {
      uid, login: p.login, age: p.age, ...g, device, endedAt: serverTimestamp(),
    });
  },

  async listPlayers(age) {
    const q = age ? query(collection(db, 'players'), where('age', '==', age)) : collection(db, 'players');
    return docs(await getDocs(q)).map((p) => ({ ...normalizeProfile(p), uid: p.uid }));
  },

  setPresence(uid, data) {
    return setDoc(doc(db, 'presence', uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });
  },

  /* ---------- настройки ---------- */
  async loadConfig() {
    try {
      const snap = await getDoc(doc(db, 'config', 'game'));
      return mergeConfig(snap.exists() ? snap.data() : null);
    } catch {
      return mergeConfig(null);
    }
  },
  saveConfig(cfg) { return setDoc(doc(db, 'config', 'game'), cfg); },

  /* ---------- администратор ---------- */
  async adminSignIn() { await signInWithPopup(auth, new GoogleAuthProvider()); },
  // админ тот, кому правила базы разрешают читать список «кто онлайн»
  async isAdmin() {
    try {
      await getDocs(query(collection(db, 'presence'), limit(1)));
      return true;
    } catch {
      return false;
    }
  },
  watchPresence(cb) {
    return onSnapshot(collection(db, 'presence'), (snap) =>
      cb(docs(snap).map((p) => ({ ...p, updatedAt: toMillis(p.updatedAt) }))));
  },
  watchPlayers(cb) {
    return onSnapshot(collection(db, 'players'), (snap) =>
      cb(docs(snap).map((p) => ({ ...normalizeProfile(p), uid: p.uid }))));
  },
  async listGames(n = 200) {
    const snap = await getDocs(query(collection(db, 'games'), orderBy('endedAt', 'desc'), limit(n)));
    return docs(snap).map((g) => ({ ...g, endedAt: toMillis(g.endedAt) }));
  },
  async deletePlayer(uid) {
    await deleteDoc(player(uid));
    await deleteDoc(doc(db, 'presence', uid)).catch(() => {});
  },

  // PIN-коды всех игроков: { uid: pin }
  watchPins(cb) {
    return onSnapshot(collection(db, 'secrets'), (snap) =>
      cb(Object.fromEntries(snap.docs.map((d) => [d.id, d.data().pin]))));
  },
  // меняет PIN: входит временно под ребёнком со старым PIN и ставит новый
  async changePin(uid, newPin) {
    const snap = await getDoc(doc(db, 'secrets', uid));
    if (!snap.exists()) throw Object.assign(new Error('no-pin'), { code: 'no-pin' });
    const { login, pin } = snap.data();
    const ha = getHelperAuth();
    const cred = await signInWithEmailAndPassword(ha, loginToEmail(login), pinToPassword(pin));
    try {
      await updatePassword(cred.user, pinToPassword(newPin));
    } finally {
      await signOut(ha);
    }
    await updateDoc(doc(db, 'secrets', uid), { pin: newPin });
  },
};
