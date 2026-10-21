'use strict';

/* =========================================================
   Считай с Филей — игра на умножение для детей 7–12 лет
   Настройки (таймер, возраст, награды…) приходят из админ-панели.
   ========================================================= */

const MAX_TIER = 8;
const RANKS = ['Новичок', 'Ученик', 'Счетовод', 'Знаток', 'Мастер', 'Профессор', 'Гений', 'Легенда'];
const OUTFITS = {
  2: 'надел галстук-бабочку! 🎀',
  3: 'надел умные очки! 👓',
  5: 'получил шапку учёного! 🎓',
  8: 'получил КОРОНУ! 👑',
};
const PRAISE = ['Молодец!', 'Верно!', 'Супер!', 'Отлично!', 'Ты умница!', 'Так держать!', 'Здорово!', 'Ух ты, класс!', 'Правильно!'];
const COMFORT = ['Ой! Бывает.', 'Не сдавайся!', 'Почти!', 'Ничего, получится!', 'Попробуем дальше!'];
const OVER_MSG = [
  () => 'Ничего страшного — каждый раз ты становишься сильнее!',
  () => 'Хорошая игра! Попробуй побить свой рекорд.',
  () => `${CONFIG.heroName} тобой гордится! Давай ещё раз?`,
];
const RESULT_ICO = { win: '🏆', loss: '💔' };
const HEARTBEAT_MS = 25000;   // как часто игра сообщает «я онлайн»

/* ---------- хранилище браузера: только настройка звука ---------- */
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('filya.' + key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('filya.' + key, JSON.stringify(value)); } catch { /* приватный режим */ }
  },
};

/* ---------- утилиты ---------- */
const $ = (sel) => document.querySelector(sel);
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* =========================================================
   Генератор примеров по уровню сложности (tier 1…8) — только умножение
   ========================================================= */
function mul(minA, maxA, minB, maxB) {
  let a = rnd(minA, maxA), b = rnd(minB, maxB);
  if (chance(0.5)) [a, b] = [b, a];
  return { text: `${a} × ${b}`, answer: a * b };
}
function mul3(min, max) {
  const a = rnd(min, max), b = rnd(min, max), c = rnd(min, max);
  return { text: `${a} × ${b} × ${c}`, answer: a * b * c };
}

function generate(tier) {
  switch (tier) {
    case 1: return mul(2, 5, 1, 5);                       // 3 × 4
    case 2: return mul(2, 5, 2, 10);                      // 4 × 9
    case 3: return mul(2, 10, 2, 10);                     // вся таблица
    case 4: return chance(0.7) ? mul(11, 20, 2, 9) : mul(2, 10, 2, 10); // 14 × 6
    case 5: return chance(0.8) ? mul(12, 99, 2, 9) : mul3(2, 5);        // 47 × 8, 3 × 4 × 5
    case 6: return chance(0.75) ? mul(11, 30, 11, 30) : mul(101, 300, 2, 9); // 11 × 23
    case 7: return pick([
      () => mul(11, 60, 11, 40),
      () => mul(101, 999, 2, 9),
      () => mul3(2, 9),
    ])();
    default: return chance(0.75) ? mul(21, 99, 11, 99) : mul3(3, 12); // 8: 67 × 48
  }
}

/* =========================================================
   Состояние
   ========================================================= */
let cloud = null;        // cloud.js (Firebase) или cloud-mock.js (демо)
let shared = null;       // settings.js
let CONFIG = null;       // настройки из админ-панели
let uid = null;
let profile = null;      // аккаунт игрока: статистика, награды
let soundOn = store.get('sound', true);
let S = null;            // состояние текущей игры
let input = '';
let locked = false;
let nextTimer = null;
let tickTimer = null;
let newBadgesThisGame = [];
let authBusy = false;

function newGameState() {
  return {
    score: 0, hearts: CONFIG.maxHearts, coins: 0,
    streak: 0, bestStreak: 0, correct: 0, mistakes: 0, bosses: 0,
    violations: 0, violationReasons: [], paused: false,
    level: 1, qCount: 0, problem: null, startedAt: 0, limit: 0, hintUsed: false,
    gameStart: performance.now(), gameStartWall: Date.now(),
  };
}

const ageInfo = (id) => CONFIG.ages.find((a) => a.id === id) || CONFIG.ages[0];
const tierFor = (level) => Math.min(MAX_TIER, ageInfo(profile.age).startTier + Math.floor((level - 1) / 2));
const comboMult = (streak) => (streak >= 10 ? 3 : streak >= 5 ? 2 : 1);
const rankFor = (level) => RANKS[Math.min(level, RANKS.length) - 1];

function deviceInfo() {
  const ua = navigator.userAgent;
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const os = iPadOS ? 'iPadOS' : /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
    : /Windows/i.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Mac OS X/i.test(ua) ? 'macOS'
    : /Linux/i.test(ua) ? 'Linux' : 'Другая';
  const type = iPadOS || /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) ? 'Планшет'
    : /Mobi|iPhone|Android/i.test(ua) ? 'Телефон' : 'Компьютер';
  const browser = /YaBrowser/.test(ua) ? 'Яндекс' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS/.test(ua) ? 'Chrome'
    : /Safari/.test(ua) ? 'Safari' : 'Другой';
  return { type, os, browser };
}
const DEVICE = deviceInfo();

/* =========================================================
   Звук (WebAudio, без файлов)
   ========================================================= */
let audio = null;
function tone(freq, dur = 0.12, type = 'sine', delay = 0, vol = 0.15) {
  if (!soundOn) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime + delay;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audio.destination);
    o.start(t); o.stop(t + dur);
  } catch { /* звук не обязателен */ }
}
const sfx = {
  key:   () => tone(600, 0.04, 'triangle', 0, 0.06),
  ok:    () => { tone(660, 0.1); tone(880, 0.15, 'sine', 0.1); },
  bad:   () => { tone(220, 0.2, 'square', 0, 0.08); tone(160, 0.25, 'square', 0.15, 0.08); },
  level: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', i * 0.11)),
  heart: () => [784, 988, 1175].forEach((f, i) => tone(f, 0.12, 'sine', i * 0.08)),
  over:  () => [392, 330, 262].forEach((f, i) => tone(f, 0.25, 'triangle', i * 0.2)),
  win:   () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', i * 0.12)),
};

/* =========================================================
   Экраны
   ========================================================= */
function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  if (id === 'screen-menu') renderMenu();
  if (id === 'screen-records') renderRecords();
  if (id === 'screen-badges') renderBadges();
  if (id === 'screen-cabinet') renderCabinet();
  if (id === 'screen-rules') renderRules();
  window.scrollTo(0, 0);
}

function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2400);
}

function confetti(n = 60) {
  const box = $('#confetti');
  const colors = ['#ff7a45', '#ffc531', '#2ec27e', '#3d8bfd', '#c86bfa', '#ef4b5f'];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = pick(colors);
    c.style.animationDuration = 1.6 + Math.random() * 1.6 + 's';
    c.style.animationDelay = Math.random() * 0.4 + 's';
    box.appendChild(c);
    setTimeout(() => c.remove(), 3800);
  }
}

function floatScore(text) {
  const anchor = $('#score').getBoundingClientRect();
  const f = document.createElement('div');
  f.className = 'float-score';
  f.textContent = text;
  f.style.left = anchor.left + 'px';
  f.style.top = anchor.top + 'px';
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1000);
}

function animate(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // перезапуск анимации
  el.classList.add(cls);
}

function setOwl(svg, level, sad = false) {
  svg.setAttribute('class', `owl lvl-${Math.min(Math.max(level, 1), 8)}${sad ? ' sad' : ''}`);
}

// имя героя и название игры задаются в админ-панели
function applyBranding() {
  document.title = CONFIG.gameTitle;
  document.querySelectorAll('.js-title').forEach((el) => { el.textContent = CONFIG.gameTitle; });
  document.querySelectorAll('.js-hero').forEach((el) => { el.textContent = CONFIG.heroName; });
  store.set('title', CONFIG.gameTitle);   // чтобы при следующем запуске сразу показать своё название
}

/* =========================================================
   Запуск, вход и регистрация
   ========================================================= */
async function boot() {
  const lastTitle = store.get('title', '');
  if (lastTitle) document.querySelectorAll('.js-title').forEach((el) => { el.textContent = lastTitle; });
  initControls();
  Fair.init();
  Presence.init();
  try {
    const hasKeys = window.FIREBASE_CONFIG && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.apiKey;
    const useMock = new URLSearchParams(location.search).has('mock') || !hasKeys;
    shared = await import('./settings.js');
    ({ cloud } = await import(useMock ? './cloud-mock.js' : './cloud.js'));
    CONFIG = await cloud.loadConfig();
  } catch (e) {
    console.error(e);
    $('#loading-msg').textContent = 'Не получилось загрузить игру. Проверь интернет и обнови страницу 📶';
    return;
  }
  applyBranding();
  if (cloud.mode === 'mock') toast('Демо-режим: данные хранятся только в этом браузере');
  initAuth();
  cloud.onAuth(onAuthChange);
}

async function onAuthChange(user) {
  if (authBusy) return;               // регистрация сама откроет меню
  if (!user) {
    uid = null;
    profile = null;
    showAuth();
    return;
  }
  if (user.uid === uid && profile) return;
  try {
    uid = user.uid;
    profile = await cloud.getProfile(uid)
      || await cloud.createProfile(uid, cloud.loginFromEmail(user.email), CONFIG.ages[0].id);
    show('screen-menu');
  } catch (e) {
    console.error(e);
    $('#loading-msg').textContent = 'Нет связи с сервером. Проверь интернет и обнови страницу 📶';
    show('screen-loading');
  }
}

let authMode = 'login';
let authAge = null;

function initAuth() {
  document.querySelectorAll('#auth-tabs button').forEach((b) =>
    b.addEventListener('click', () => setAuthMode(b.dataset.mode)));
  $('#auth-form').addEventListener('submit', (e) => { e.preventDefault(); submitAuth(); });
  $('#auth-pin').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, ''); });
}

function showAuth() {
  const pickBox = $('#auth-age-pick');
  pickBox.innerHTML = '';
  CONFIG.ages.forEach((a) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.age = a.id;
    b.textContent = a.label.replace(/\s*лет$/, '');
    b.addEventListener('click', () => {
      authAge = a.id;
      pickBox.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    });
    pickBox.appendChild(b);
  });
  pickBox.style.gridTemplateColumns = `repeat(${Math.min(CONFIG.ages.length, 3)}, 1fr)`;
  setAuthMode(authMode);
  show('screen-auth');
}

function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll('#auth-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  $('#auth-age-field').hidden = mode !== 'register';
  $('#btn-auth').textContent = mode === 'register' ? 'Создать аккаунт ▶' : 'Войти ▶';
  $('#auth-pin').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  $('#auth-error').textContent = '';
}

const AUTH_ERRORS = {
  'auth/email-already-in-use': 'Такой логин уже занят. Придумай другой 🙂',
  'auth/invalid-credential': 'Неверный логин или PIN-код',
  'auth/wrong-password': 'Неверный логин или PIN-код',
  'auth/user-not-found': 'Неверный логин или PIN-код',
  'auth/invalid-login-credentials': 'Неверный логин или PIN-код',
  'auth/too-many-requests': 'Слишком много попыток. Подожди пару минут',
  'auth/network-request-failed': 'Нет интернета 📶',
  'auth/operation-not-allowed': 'Вход по логину ещё не включён. Попроси взрослого (см. README)',
};

async function submitAuth() {
  const login = $('#auth-login').value.trim();
  const pin = $('#auth-pin').value;
  const errBox = $('#auth-error');
  if (!/^[a-zA-Zа-яА-ЯёЁ0-9_]{3,12}$/.test(login)) {
    errBox.textContent = 'Логин: от 3 до 12 букв или цифр, без пробелов';
    return;
  }
  if (!/^\d{4,6}$/.test(pin)) { errBox.textContent = 'PIN-код: от 4 до 6 цифр'; return; }
  if (authMode === 'register' && !authAge) { errBox.textContent = 'Выбери свой возраст 🙂'; return; }

  const btn = $('#btn-auth');
  btn.disabled = true;
  errBox.textContent = '';
  try {
    if (authMode === 'register') {
      authBusy = true;
      profile = await cloud.register(login, pin, authAge);
      uid = await currentUid();
      authBusy = false;
      toast(`Аккаунт создан! Добро пожаловать, ${login}!`);
      show('screen-menu');
    } else {
      await cloud.signIn(login, pin);   // дальше меню откроет onAuthChange
    }
    $('#auth-pin').value = '';
  } catch (e) {
    authBusy = false;
    console.error(e);
    errBox.textContent = AUTH_ERRORS[e.code] || 'Что-то пошло не так. Попробуй ещё раз';
  } finally {
    btn.disabled = false;
  }
}

// uid текущего пользователя сразу после регистрации
function currentUid() {
  return new Promise((resolve) => {
    let off = null;
    off = cloud.onAuth((u) => {
      if (!u) return;
      resolve(u.uid);
      setTimeout(() => off && off(), 0);
    });
  });
}

async function logout() {
  Presence.offline();
  await cloud.signOut();
}

/* =========================================================
   Меню
   ========================================================= */
function renderMenu() {
  if (!profile) return;
  $('#menu-hello').textContent = `Привет, ${profile.login}! Готов считать?`;
  setOwl($('#menu-owl svg'), profile.bestLevel);
  $('#menu-goal').innerHTML = `🏆 Цель: набери <b>${CONFIG.winScore}</b> очков за игру` +
    (profile.bestScore ? ` · твой рекорд: <b>${profile.bestScore}</b>` : '');
  $('#fair-note').hidden = !CONFIG.antiCheat;
  Presence.set('menu');
  // подтягиваем свежие настройки из админ-панели к следующей игре
  cloud.loadConfig().then((c) => { CONFIG = c; applyBranding(); }).catch(() => {});
}

/* =========================================================
   Честная игра: свернул, переключился, уменьшил окно — пауза и новый пример
   ========================================================= */
const Fair = {
  active: false,
  fullscreen: false,   // удалось ли включить полноэкранный режим
  base: null,          // размер окна, от которого считаем «уменьшение»
  calmUntil: 0,        // короткая пауза на старте, пока браузер разворачивает экран

  start() {
    if (!CONFIG.antiCheat) return;
    this.active = true;
    this.fullscreen = false;
    this.calmUntil = performance.now() + 1500;
    this.remember();
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) {
      Promise.resolve(req.call(el, { navigationUI: 'hide' }))
        .then(() => { this.fullscreen = true; this.remember(); })
        .catch(() => { /* iPhone и некоторые браузеры не умеют — не страшно */ });
    }
  },

  stop() {
    this.active = false;
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (fsEl && exit) Promise.resolve(exit.call(document)).catch(() => {});
  },

  remember() {
    this.base = { w: innerWidth, h: innerHeight, landscape: innerWidth > innerHeight };
  },

  onResize() {
    if (!this.active || !this.base) return;
    const w = innerWidth, h = innerHeight, landscape = w > h;
    // поворот телефона — не нарушение, просто запоминаем новый размер
    if (landscape !== this.base.landscape) return this.remember();
    if (performance.now() > this.calmUntil && (w < this.base.w * 0.85 || h < this.base.h * 0.7)) {
      return violation('Окно игры стало меньше');
    }
    this.base.w = Math.max(this.base.w, w);
    this.base.h = Math.max(this.base.h, h);
  },

  init() {
    document.addEventListener('visibilitychange', () => {
      if (this.active && document.hidden) violation('Ты свернул игру или открыл другое приложение');
    });
    window.addEventListener('blur', () => {
      if (this.active) violation('Ты переключился на другое окно');
    });
    // закрыл страницу посреди игры — игра заканчивается, набранное сохраняется
    window.addEventListener('pagehide', () => {
      if (S) endGame('loss', 'Закрыл игру');
    });
    window.addEventListener('resize', () => this.onResize());
    const onFs = () => {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (this.active && this.fullscreen && !fsEl) violation('Ты вышел из полноэкранного режима');
    };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    // во время игры нельзя выделить и скопировать пример (например, чтобы вставить в ИИ)
    ['copy', 'cut', 'contextmenu', 'selectstart', 'dragstart'].forEach((ev) =>
      document.addEventListener(ev, (e) => { if (this.active) e.preventDefault(); }));
  },
};

/* =========================================================
   Онлайн: администратор видит, кто сейчас играет и что делает
   ========================================================= */
const Presence = {
  state: 'offline',
  timer: null,

  init() {
    document.addEventListener('visibilitychange', () => {
      if (!uid) return;
      if (document.hidden) this.send('offline');
      else this.send(this.state);
    });
    window.addEventListener('pagehide', () => this.offline());
  },

  set(state) {
    this.state = state;
    this.send(state);
    clearInterval(this.timer);
    this.timer = setInterval(() => { if (!document.hidden) this.send(this.state); }, HEARTBEAT_MS);
  },

  send(state) {
    if (!uid || !profile || !cloud) return;
    const playing = (state === 'playing' || state === 'paused') && S;
    cloud.setPresence(uid, {
      login: profile.login,
      age: profile.age,
      state,
      level: playing ? S.level : null,
      score: playing ? S.score : null,
      hearts: playing ? S.hearts : null,
      gameStartedAt: playing ? S.gameStartWall : null,
      device: DEVICE,
    }).catch(() => {});
  },

  offline() {
    clearInterval(this.timer);
    this.send('offline');
  },
};

/* =========================================================
   Игра
   ========================================================= */
function startGame() {
  if (!profile) return;
  $('#menu-error').textContent = '';
  S = newGameState();
  newBadgesThisGame = [];
  show('screen-game');
  renderHearts();
  renderStats();
  $('#btn-hint').textContent = `💡 Подсказка (${CONFIG.hintCost} 💰)`;
  say(`Привет, ${profile.login}! Реши пример!`);
  Fair.start();
  Presence.set('playing');
  nextProblem();
}

function stopTimers() {
  clearTimeout(nextTimer);
  clearInterval(tickTimer);
}

function nextProblem() {
  S.qCount++;
  const boss = S.qCount % CONFIG.bossEvery === 0;
  const tier = Math.min(MAX_TIER, tierFor(S.level) + (boss ? 1 : 0));
  let p;
  do { p = generate(tier); } while (S.problem && p.text === S.problem.text);
  S.problem = { ...p, boss, tier };
  S.startedAt = performance.now();
  S.limit = CONFIG.timeLimits[tier - 1];
  S.hintUsed = false;
  input = '';
  locked = false;

  const card = $('#problem-card');
  card.classList.remove('ok', 'bad');
  card.classList.toggle('boss', boss);
  const pt = $('#problem-text');
  pt.textContent = p.text;
  const len = p.text.length;
  const prob = pt.parentElement;
  prob.classList.toggle('long', len > 9 && len <= 13);
  prob.classList.toggle('xlong', len > 13);
  $('#options').classList.remove('show');
  $('#options').innerHTML = '';
  $('#keypad').classList.remove('locked');
  if (boss) say('Ого, супер-пример! За него очков вдвое больше!');
  renderInput();
  renderStats();
  clearInterval(tickTimer);
  tickTimer = setInterval(tick, 100);
  tick();
}

// таймер на пример: не успел — теряешь сердечко
function tick() {
  if (!S || locked) return;
  const left = S.limit - (performance.now() - S.startedAt) / 1000;
  const fill = $('#timer-fill');
  fill.style.width = Math.max(0, left / S.limit) * 100 + '%';
  fill.classList.toggle('low', left < Math.min(5, S.limit * 0.3));
  $('#timer-sec').textContent = Math.max(0, Math.ceil(left));
  if (left <= 0) {
    clearInterval(tickTimer);
    locked = true;
    $('#keypad').classList.add('locked');
    onWrong('⏰ Время вышло!');
  }
}

function renderInput() { $('#answer').textContent = input; }

function pressKey(k) {
  if (locked || !S) return;
  if (k === 'ok') return submit();
  if (k === 'back') input = input.slice(0, -1);
  else if (/^\d$/.test(k) && input.length < 7) input = input === '0' ? k : input + k;
  else return;
  sfx.key();
  renderInput();
}

function submit(value = input) {
  if (locked || value === '' || !S) return;
  locked = true;
  clearInterval(tickTimer);
  input = String(value);
  renderInput();
  $('#keypad').classList.add('locked');
  if (Number(value) === S.problem.answer) onCorrect(); else onWrong();
}

function onCorrect() {
  const p = S.problem;
  const seconds = (performance.now() - S.startedAt) / 1000;
  S.streak++;
  S.correct++;
  if (p.boss) S.bosses++;
  S.bestStreak = Math.max(S.bestStreak, S.streak);

  const mult = comboMult(S.streak);
  let gain = 10 * p.tier * mult;
  const fast = seconds < CONFIG.fastSeconds && !S.hintUsed;
  if (fast) gain += 5 * p.tier;
  if (p.boss) gain *= 2;
  if (S.hintUsed) gain = Math.ceil(gain / 2);
  S.score += gain;
  S.coins += p.boss ? 3 : 1;

  $('#problem-card').classList.add('ok');
  animate($('#game-owl'), 'jump');
  animate($('#score'), 'bump');
  floatScore('+' + gain);
  sfx.ok();

  let msg = pick(PRAISE);
  if (fast) msg += ' ⚡ Быстро!';
  if (mult > 1) msg += ` 🔥 Комбо ×${mult}`;

  // каждые 10 подряд — новое сердечко
  if (S.streak % 10 === 0 && S.hearts < CONFIG.maxHearts) {
    S.hearts++;
    renderHearts(S.hearts - 1);
    setTimeout(sfx.heart, 250);
    msg = `${S.streak} подряд! Держи сердечко 💖`;
  }

  // новый уровень
  if (S.correct % CONFIG.correctPerLevel === 0) {
    S.level++;
    setTimeout(sfx.level, 300);
    confetti();
    msg = `Уровень ${S.level}! Ты теперь ${rankFor(S.level)}!`;
    const outfit = OUTFITS[S.level];
    if (outfit) setTimeout(() => toast(`${CONFIG.heroName} ${outfit}`), 400);
  }

  checkAchievements(S, S.hintUsed ? null : seconds);
  renderStats();

  // победа: набрал нужное количество очков
  if (S.score >= CONFIG.winScore) {
    say(`🏆 ${CONFIG.winScore} очков! Это ПОБЕДА!`);
    confetti(120);
    nextTimer = setTimeout(winGame, 1600);
    return;
  }
  say(msg);
  nextTimer = setTimeout(nextProblem, 1300);
}

function onWrong(reason = pick(COMFORT)) {
  S.streak = 0;
  S.mistakes++;
  S.hearts--;
  renderHearts();
  $('#problem-card').classList.add('bad');
  animate($('#game-owl'), 'shake');
  sfx.bad();
  say(`${reason} Правильно: ${S.problem.text} = ${S.problem.answer}`, true);
  renderStats();
  if (S.hearts <= 0) nextTimer = setTimeout(gameOver, 2200);
  else nextTimer = setTimeout(nextProblem, 2600);
}

function useHint() {
  if (locked || !S || S.hintUsed) return;
  if (S.coins < CONFIG.hintCost) return toast(`Нужно ${CONFIG.hintCost} монеты. Отвечай верно — и они появятся!`);
  S.coins -= CONFIG.hintCost;
  S.hintUsed = true;
  const ans = S.problem.answer;
  // похожие неверные ответы: ±1, ±2, ±10 — чтобы нельзя было угадать «на глаз»
  const near = [1, -1, 2, -2, 10, -10].map((d) => ans + d).filter((v) => v >= 0);
  const opts = new Set([ans]);
  while (opts.size < 3) opts.add(pick(near));
  const box = $('#options');
  box.innerHTML = '';
  [...opts].sort(() => Math.random() - 0.5).forEach((v) => {
    const b = document.createElement('button');
    b.textContent = v;
    b.addEventListener('click', () => submit(v));
    box.appendChild(b);
  });
  box.classList.add('show');
  say('Один из этих ответов верный. Подумай!');
  renderStats();
}

/* ---------- нарушение правил: пауза и новый пример ---------- */

// очки сохраняются, но текущий пример заменяется — подсмотреть ответ на калькуляторе не выйдет
function violation(reason) {
  if (!S || S.paused) return;
  S.paused = true;
  S.violations++;
  if (!S.violationReasons.includes(reason)) S.violationReasons.push(reason);
  stopTimers();
  locked = true;
  $('#keypad').classList.add('locked');
  profile.violations++;
  cloud.addViolation(uid).catch(() => {});
  sfx.bad();
  $('#pause-reason').textContent = reason + '.';
  $('#pause-count').textContent = S.violations > 1 ? `Нарушений в этой игре: ${S.violations}` : '';
  $('#pause').hidden = false;
  Presence.set('paused');
}

function resumeGame() {
  if (!S || !S.paused) return;
  S.paused = false;
  $('#pause').hidden = true;
  Fair.start();                 // снова полноэкранный режим (нужно нажатие кнопки)
  Presence.set('playing');
  // если пауза пришлась на конец игры — доводим его
  if (S.hearts <= 0) return gameOver();
  if (S.score >= CONFIG.winScore) return winGame();
  say('Продолжаем! Вот новый пример.');
  nextProblem();
}

/* ---------- конец игры ---------- */

// останавливает игру, записывает итог в аккаунт и возвращает его
function endGame(result, reason = '') {
  stopTimers();
  Fair.stop();
  $('#pause').hidden = true;
  const g = S;
  S = null;
  locked = true;
  const summary = {
    result,
    reason,
    score: g.score,
    level: g.level,
    correct: g.correct,
    wrong: g.mistakes,
    bestStreak: g.bestStreak,
    violations: g.violations,
    violationReasons: g.violationReasons,
    seconds: Math.round((performance.now() - g.gameStart) / 1000),
    at: Date.now(),
  };

  const wasBest = profile.bestScore;
  profile.games++;
  profile[result === 'win' ? 'wins' : 'losses']++;
  profile.playSeconds += summary.seconds;
  profile.correct += summary.correct;
  profile.wrong += summary.wrong;
  profile.totalScore += summary.score;
  profile.bestScore = Math.max(profile.bestScore, summary.score);
  profile.bestLevel = Math.max(profile.bestLevel, summary.level);
  profile.recent = [
    { result, reason, score: summary.score, level: summary.level, seconds: summary.seconds,
      violations: summary.violations, at: summary.at },
    ...profile.recent,
  ].slice(0, 10);

  checkAchievements(null, null);   // награды за победы, количество игр, время
  cloud.recordGame(uid, profile, summary, DEVICE)
    .catch((e) => { console.error(e); toast('Нет интернета — результат не сохранился 📶'); });
  Presence.set('menu');
  return { g, summary, isBest: summary.score > wasBest && summary.score > 0 };
}

function winGame() {
  const { g, summary } = endGame('win', `Набрано ${CONFIG.winScore}+ очков`);
  sfx.win();
  confetti(150);
  $('#over-title').textContent = '🏆 ПОБЕДА!';
  $('#over-msg').textContent = `Ты набрал ${g.score} очков — ${CONFIG.heroName} в восторге!`;
  showOver(g, summary, 'win');
}

function gameOver() {
  const { g, summary, isBest } = endGame('loss', 'Закончились сердечки');
  sfx.over();
  $('#over-title').textContent = 'Сердечки закончились';
  $('#over-msg').textContent = isBest ? '🏆 Это твой новый рекорд! Ура!' : pick(OVER_MSG)();
  if (isBest) confetti(90);
  showOver(g, summary, 'loss');
}

function showOver(g, summary, result) {
  $('#over-score').textContent = summary.score;
  $('#over-level').textContent = g.level;
  $('#over-correct').textContent = g.correct;
  $('#over-wrong').textContent = g.mistakes;
  $('#over-streak').textContent = g.bestStreak;
  $('#over-time').textContent = shared.fmtDuration(summary.seconds);
  $('#over-viol').textContent = g.violations
    ? `🚫 Нарушений правил в этой игре: ${g.violations}. Играй честно!` : '';
  $('#screen-over').classList.toggle('won', result === 'win');
  setOwl($('#over-owl svg'), g.level, result !== 'win');
  $('#over-badges').innerHTML = newBadgesThisGame.length
    ? '<p class="sub">Новые награды:</p>' + newBadgesThisGame
        .map((a) => `<span class="badge-chip">${esc(a.ico)} ${esc(a.name)}</span>`).join('')
    : '';
  show('screen-over');
}

// выход в меню посреди игры считается поражением, но результат сохраняется
function exitGame() {
  if (!S) return show('screen-menu');
  endGame('loss', 'Вышел в меню');
  show('screen-menu');
}

/* ---------- отрисовка ---------- */
function say(text, sad = false) {
  $('#owl-say').textContent = text;
  $('#game-owl .owl').classList.toggle('sad', sad);
}

function renderHearts(popIndex = -1) {
  const box = $('#hearts');
  box.innerHTML = '';
  const n = Math.max(CONFIG.maxHearts, S.hearts);
  box.style.fontSize = n > 10 ? `${Math.max(9, 150 / n)}px` : '';
  for (let i = 0; i < n; i++) {
    const h = document.createElement('span');
    h.className = 'heart' + (i >= S.hearts ? ' lost' : '') + (i === popIndex ? ' pop' : '');
    h.textContent = '❤️';
    box.appendChild(h);
  }
}

function renderStats() {
  const per = CONFIG.correctPerLevel;
  $('#score').textContent = S.score;
  $('#level').textContent = S.level;
  $('#coins').textContent = '💰 ' + S.coins;
  $('#level-fill').style.width = ((S.correct % per) / per) * 100 + '%';
  $('#rank-name').textContent = `${rankFor(S.level)} · до уровня ${S.level + 1}: ${per - (S.correct % per)}`;
  $('#goal-fill').style.width = Math.min(1, S.score / CONFIG.winScore) * 100 + '%';
  $('#goal-text').textContent = `🏆 до победы: ${Math.max(0, CONFIG.winScore - S.score)} очков`;
  const mult = comboMult(S.streak);
  $('#combo').textContent = mult > 1 ? `🔥 ×${mult}` : (S.streak >= 2 ? `🔥 ${S.streak}` : '');
  $('#btn-hint').disabled = S.hintUsed || S.coins < CONFIG.hintCost;
  const owl = $('#game-owl .owl');
  setOwl(owl, S.level, owl.classList.contains('sad'));
}

/* =========================================================
   Награды (настраиваются в админ-панели)
   ========================================================= */
// st — состояние игры (null после её окончания), sec — время ответа
function achieved(a, st, sec) {
  const v = a.value;
  switch (a.type) {
    case 'correct': return !!st && st.correct >= v;
    case 'streak':  return !!st && st.streak >= v;
    case 'level':   return !!st && st.level >= v;
    case 'score':   return !!st && st.score >= v;
    case 'coins':   return !!st && st.coins >= v;
    case 'boss':    return !!st && st.bosses >= v;
    case 'clean':   return !!st && st.correct >= v && st.mistakes === 0;
    case 'fast':    return sec != null && sec < v;
    case 'wins':    return profile.wins >= v;
    case 'games':   return profile.games >= v;
    case 'time':    return profile.playSeconds >= v * 60;
    default:        return false;
  }
}

function checkAchievements(st, sec) {
  for (const a of CONFIG.achievements) {
    if (!profile.badges.includes(a.id) && achieved(a, st, sec)) award(a);
  }
}

function award(a) {
  profile.badges.push(a.id);
  newBadgesThisGame.push(a);
  cloud.addBadge(uid, a.id).catch(() => {});
  setTimeout(() => toast(`Новая награда: ${a.ico} ${a.name}!`), 900);
}

function renderBadges() {
  if (!profile) return;
  const list = CONFIG.achievements;
  const got = list.filter((a) => profile.badges.includes(a.id)).length;
  $('#badges-count').textContent = `Собрано ${got} из ${list.length}. Награды остаются у тебя навсегда.`;
  $('#badges-grid').innerHTML = list.map((a) => `
    <div class="badge ${profile.badges.includes(a.id) ? '' : 'locked'}">
      <span class="ico">${esc(a.ico)}</span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small>
    </div>`).join('');
}

function renderRules() {
  $('#rule-win').textContent = CONFIG.winScore;
  $('#rule-hearts').textContent = CONFIG.maxHearts;
  $('#rule-boss').textContent = CONFIG.bossEvery;
  $('#rule-fair').hidden = !CONFIG.antiCheat;
}

/* =========================================================
   Рекорды и личный кабинет
   ========================================================= */
let recAge = null;

async function renderRecords() {
  if (!profile) return;
  recAge = recAge || ageInfo(profile.age).id;
  const tabs = $('#rec-age');
  tabs.innerHTML = '';
  tabs.style.gridTemplateColumns = `repeat(${Math.min(CONFIG.ages.length, 3)}, 1fr)`;
  CONFIG.ages.forEach((a) => {
    const b = document.createElement('button');
    b.textContent = a.label;
    b.classList.toggle('on', a.id === recAge);
    b.addEventListener('click', () => { recAge = a.id; renderRecords(); });
    tabs.appendChild(b);
  });

  const list = $('#records-list');
  list.innerHTML = '<li class="empty">Загружаю… ⏳</li>';
  const want = recAge;
  try {
    const players = (await cloud.listPlayers(want))
      .filter((p) => p.bestScore > 0)
      .sort((a, b) => b.bestScore - a.bestScore)
      .slice(0, 20);
    if (want !== recAge) return;   // пока грузили, переключили вкладку
    if (!players.length) {
      list.innerHTML = '<li class="empty">В этой группе ещё никто не играл. Будь первым!</li>';
      return;
    }
    list.innerHTML = '';
    players.forEach((p) => {
      const li = document.createElement('li');
      if (p.uid === uid) li.classList.add('me');
      li.innerHTML = `<span class="r-name">${esc(p.login)}<small>уровень ${p.bestLevel} · побед ${p.wins}</small></span>
        <b class="r-score">${p.bestScore}</b>`;
      list.appendChild(li);
    });
  } catch (e) {
    console.error(e);
    list.innerHTML = '<li class="empty">Не получилось загрузить. Проверь интернет 📶</li>';
  }
}

async function renderCabinet() {
  if (!profile) return;
  const p = profile;
  $('#cab-login').textContent = p.login;
  setOwl($('#cab-owl svg'), p.bestLevel);
  const sel = $('#cab-age');
  sel.innerHTML = CONFIG.ages.map((a) => `<option value="${esc(a.id)}">${esc(a.label)}</option>`).join('');
  sel.value = ageInfo(p.age).id;

  const stat = (ico, label, value) => `<div class="cab-stat"><span>${ico}</span><b>${value}</b><small>${label}</small></div>`;
  const badges = CONFIG.achievements.filter((a) => p.badges.includes(a.id)).length;
  $('#cab-stats').innerHTML = [
    stat('⭐', 'Лучший рейтинг', p.bestScore),
    stat('📈', 'Лучший уровень', p.bestLevel),
    stat('🎮', 'Сыграно игр', p.games),
    stat('🏆', 'Побед', p.wins),
    stat('💔', 'Поражений', p.losses),
    stat('🚫', 'Нарушений правил', p.violations),
    stat('⏱️', 'Время в игре', shared.fmtDuration(p.playSeconds)),
    stat('🎖️', 'Наград', `${badges} из ${CONFIG.achievements.length}`),
    stat('✅', 'Верных ответов', p.correct),
    stat('❌', 'Ошибок', p.wrong),
  ].join('');

  $('#cab-games').innerHTML = p.recent.length ? p.recent.map((g) => `
    <li class="g-${esc(g.result)}">
      <span class="g-ico">${RESULT_ICO[g.result] || '🎮'}</span>
      <span class="g-main">${g.result === 'win' ? 'Победа' : 'Поражение'}${g.violations ? ` <em class="g-viol">🚫 ${g.violations}</em>` : ''}
        <small>${esc(g.reason || '')} · уровень ${g.level} · ${shared.fmtDuration(g.seconds)} · ${new Date(g.at).toLocaleDateString('ru-RU')}</small></span>
      <b>${g.score}</b>
    </li>`).join('') : '<li class="empty">Ты ещё не играл. Нажми «Играть»!</li>';

  const rankBox = $('#cab-rank');
  rankBox.textContent = 'Считаю твоё место… ⏳';
  try {
    const players = await cloud.listPlayers(ageInfo(p.age).id);
    const { place, total } = shared.rankOf(players, uid);
    rankBox.innerHTML = place
      ? `🥇 Твоё место: <b>${place}</b> из ${total} <small>среди игроков ${esc(ageInfo(p.age).label)}</small>`
      : `Сыграй, чтобы попасть в рейтинг игроков ${esc(ageInfo(p.age).label)}!`;
  } catch {
    rankBox.textContent = 'Не получилось узнать место. Проверь интернет 📶';
  }
}

/* =========================================================
   Управление
   ========================================================= */
function initControls() {
  $('#keypad').addEventListener('click', (e) => {
    const k = e.target.closest('button')?.dataset.k;
    if (k) pressKey(k);
  });
  document.addEventListener('keydown', (e) => {
    if (!$('#screen-game').classList.contains('active')) return;
    if (/^\d$/.test(e.key)) pressKey(e.key);
    else if (e.key === 'Backspace') { e.preventDefault(); pressKey('back'); }
    else if (e.key === 'Enter') pressKey('ok');
  });
  $('#btn-play').addEventListener('click', startGame);
  $('#btn-hint').addEventListener('click', useHint);
  $('#btn-exit').addEventListener('click', exitGame);
  $('#btn-again').addEventListener('click', startGame);
  $('#btn-resume').addEventListener('click', resumeGame);
  $('#btn-logout').addEventListener('click', logout);
  $('#cab-age').addEventListener('change', (e) => {
    profile.age = e.target.value;
    recAge = null;
    cloud.updateAge(uid, profile.age).catch(() => toast('Не получилось сохранить 📶'));
    renderCabinet();
  });
  document.querySelectorAll('[data-open]').forEach((b) =>
    b.addEventListener('click', () => show(b.dataset.open)));
  const sb = $('#btn-sound');
  const paintSound = () => { sb.textContent = soundOn ? '🔊' : '🔇'; };
  paintSound();
  sb.addEventListener('click', () => { soundOn = !soundOn; store.set('sound', soundOn); paintSound(); });
}

boot();
