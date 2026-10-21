'use strict';

/* =========================================================
   Считай с Филей — математическая игра для детей 7–12 лет
   ========================================================= */

const MAX_HEARTS = 10;
const CORRECT_PER_LEVEL = 5;   // сколько верных ответов до нового уровня
const BOSS_EVERY = 10;         // каждый N-й пример — супер-пример
const HINT_COST = 3;           // цена подсказки в монетах
const FAST_SECONDS = 7;        // ответ быстрее — бонус за скорость
const MAX_TIER = 8;
// секунд на пример для каждого уровня сложности (индекс = tier)
const TIME_LIMIT = [0, 15, 20, 20, 30, 35, 45, 60, 75];

const AGES = {
  young: { label: '7–8 лет', startTier: 1 },
  mid:   { label: '9–10 лет', startTier: 3 },
  old:   { label: '11–12 лет', startTier: 5 },
};

const RANKS = ['Новичок', 'Ученик', 'Счетовод', 'Знаток', 'Мастер', 'Профессор', 'Гений', 'Легенда'];

const OUTFITS = {
  2: 'Филя надел галстук-бабочку! 🎀',
  3: 'Филя надел умные очки! 👓',
  5: 'Филя получил шапку учёного! 🎓',
  8: 'Филя получил КОРОНУ! 👑',
};

const ACHIEVEMENTS = [
  { id: 'first',    ico: '🌱', name: 'Первый шаг',    desc: 'Первый верный ответ' },
  { id: 'streak5',  ico: '🔥', name: 'Огонёк',        desc: '5 верных ответов подряд' },
  { id: 'streak10', ico: '☄️', name: 'Пламя',         desc: '10 верных ответов подряд' },
  { id: 'streak25', ico: '🌋', name: 'Вулкан',        desc: '25 верных ответов подряд' },
  { id: 'fast',     ico: '⚡', name: 'Молния',        desc: 'Ответ быстрее 3 секунд' },
  { id: 'boss',     ico: '👑', name: 'Победитель',    desc: 'Решить супер-пример' },
  { id: 'level5',   ico: '🎓', name: 'Мастер',        desc: 'Дойти до 5 уровня' },
  { id: 'level8',   ico: '🏰', name: 'Легенда',       desc: 'Дойти до 8 уровня' },
  { id: 'score500', ico: '⭐', name: '500 очков',     desc: 'Набрать 500 очков за игру' },
  { id: 'score3000',ico: '🌟', name: '3000 очков',    desc: 'Набрать 3000 очков за игру' },
  { id: 'clean',    ico: '💎', name: 'Без ошибок',    desc: '20 верных ответов и все 10 сердечек целы' },
  { id: 'rich',     ico: '💰', name: 'Копилка',       desc: 'Накопить 30 монет' },
];

const PRAISE = ['Молодец!', 'Верно!', 'Супер!', 'Отлично!', 'Ты умница!', 'Так держать!', 'Здорово!', 'Ух ты, класс!', 'Правильно!'];
const COMFORT = ['Ой! Бывает.', 'Не сдавайся!', 'Почти!', 'Ничего, получится!', 'Попробуем дальше!'];
const OVER_MSG = [
  'Ничего страшного — каждый раз ты становишься сильнее!',
  'Хорошая игра! Попробуй побить свой рекорд.',
  'Филя тобой гордится! Давай ещё раз?',
];

/* ---------- хранилище (может быть недоступно — тогда просто не сохраняем) ---------- */
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

// Только умножение: от таблицы на 2–5 до двузначного на двузначное
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
let player = store.get('player', { name: '', age: '' });
let soundOn = store.get('sound', true);
let unlocked = new Set(store.get('badges', []));
let S = null;            // состояние текущей игры
let input = '';
let locked = false;
let nextTimer = null;
let tickTimer = null;
let newBadgesThisGame = [];

function newGameState() {
  return {
    score: 0, hearts: MAX_HEARTS, coins: 0,
    streak: 0, bestStreak: 0, correct: 0, mistakes: 0,
    level: 1, qCount: 0, problem: null, startedAt: 0, limit: 0, hintUsed: false,
  };
}

const tierFor = (level) => Math.min(MAX_TIER, AGES[player.age].startTier + Math.floor((level - 1) / 2));
const comboMult = (streak) => (streak >= 10 ? 3 : streak >= 5 ? 2 : 1);
const rankFor = (level) => RANKS[Math.min(level, RANKS.length) - 1];

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
};

/* =========================================================
   Экраны
   ========================================================= */
function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  if (id === 'screen-records') renderRecords();
  if (id === 'screen-badges') renderBadges();
  window.scrollTo(0, 0);
}

function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
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

/* =========================================================
   Меню
   ========================================================= */
function initMenu() {
  $('#player-name').value = player.name;
  setAge(player.age);
  document.querySelectorAll('#age-pick button').forEach((b) =>
    b.addEventListener('click', () => setAge(b.dataset.age)));
  $('#btn-play').addEventListener('click', () => {
    const name = $('#player-name').value.trim();
    if (!name) return showMenuError('Напиши своё имя 🙂');
    if (!AGES[player.age]) return showMenuError('Выбери свой возраст 🙂');
    player.name = name;
    store.set('player', player);
    startGame();
  });
  $('#player-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-play').click(); });
  document.querySelectorAll('[data-open]').forEach((b) =>
    b.addEventListener('click', () => show(b.dataset.open)));
}
function setAge(age) {
  player.age = age;
  document.querySelectorAll('#age-pick button').forEach((b) => b.classList.toggle('on', b.dataset.age === age));
}
function showMenuError(msg) { $('#menu-error').textContent = msg; }

/* =========================================================
   Честная игра: свернул, переключился, уменьшил окно — проигрыш
   ========================================================= */
const Fair = {
  active: false,
  fullscreen: false,   // удалось ли включить полноэкранный режим
  base: null,          // размер окна, от которого считаем «уменьшение»
  calmUntil: 0,        // короткая пауза на старте, пока браузер разворачивает экран

  start() {
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
      return cheat('Окно игры стало меньше');
    }
    this.base.w = Math.max(this.base.w, w);
    this.base.h = Math.max(this.base.h, h);
  },

  init() {
    document.addEventListener('visibilitychange', () => {
      if (this.active && document.hidden) cheat('Ты свернул игру или открыл другое приложение');
    });
    window.addEventListener('blur', () => {
      if (this.active) cheat('Ты переключился на другое окно');
    });
    window.addEventListener('pagehide', () => {
      if (this.active) cheat('Ты ушёл со страницы игры');
    });
    window.addEventListener('resize', () => this.onResize());
    const onFs = () => {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (this.active && this.fullscreen && !fsEl) cheat('Ты вышел из полноэкранного режима');
    };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    // во время игры нельзя выделить и скопировать пример (например, чтобы вставить в ИИ)
    ['copy', 'cut', 'contextmenu', 'selectstart', 'dragstart'].forEach((ev) =>
      document.addEventListener(ev, (e) => { if (this.active) e.preventDefault(); }));
  },
};

/* =========================================================
   Игра
   ========================================================= */
function startGame() {
  $('#menu-error').textContent = '';
  S = newGameState();
  newBadgesThisGame = [];
  show('screen-game');
  renderHearts();
  renderStats();
  say(`Привет, ${player.name}! Реши пример!`);
  Fair.start();
  nextProblem();
}

function stopTimers() {
  clearTimeout(nextTimer);
  clearInterval(tickTimer);
}

function nextProblem() {
  S.qCount++;
  const boss = S.qCount % BOSS_EVERY === 0;
  const tier = Math.min(MAX_TIER, tierFor(S.level) + (boss ? 1 : 0));
  let p;
  do { p = generate(tier); } while (S.problem && p.text === S.problem.text);
  S.problem = { ...p, boss, tier };
  S.startedAt = performance.now();
  S.limit = TIME_LIMIT[tier];
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
  if (locked || value === '') return;
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
  S.bestStreak = Math.max(S.bestStreak, S.streak);

  const mult = comboMult(S.streak);
  let gain = 10 * p.tier * mult;
  const fast = seconds < FAST_SECONDS && !S.hintUsed;
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
  if (S.streak % 10 === 0 && S.hearts < MAX_HEARTS) {
    S.hearts++;
    renderHearts(S.hearts - 1);
    setTimeout(sfx.heart, 250);
    msg = `${S.streak} подряд! Держи сердечко 💖`;
  }

  // новый уровень
  if (S.correct % CORRECT_PER_LEVEL === 0) {
    S.level++;
    setTimeout(sfx.level, 300);
    confetti();
    msg = `Уровень ${S.level}! Ты теперь ${rankFor(S.level)}!`;
    const outfit = OUTFITS[Math.min(S.level, 8)];
    if (outfit && S.level <= 8) setTimeout(() => toast(outfit), 400);
  }

  say(msg);
  if (seconds < 3 && !S.hintUsed) award('fast');
  checkAchievements();
  renderStats();
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
  if (S.coins < HINT_COST) return toast(`Нужно ${HINT_COST} монеты. Отвечай верно — и они появятся!`);
  S.coins -= HINT_COST;
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

// останавливает текущую игру и возвращает её итог
function finish() {
  stopTimers();
  Fair.stop();
  const result = S;
  S = null;
  locked = true;
  return result;
}

function gameOver() {
  const g = finish();
  sfx.over();
  const isTop = saveRecord(g);
  $('#over-title').textContent = 'Сердечки закончились';
  $('#over-msg').textContent = isTop ? '🏆 Это твой новый рекорд! Ура!' : pick(OVER_MSG);
  if (isTop) confetti(90);
  showOver(g, false);
}

// нарушение правил честной игры: результат сгорает и в рекорды не попадает
function cheat(reason) {
  if (!S) return;
  const g = finish();
  sfx.bad();
  $('#over-title').textContent = '🚫 Игра остановлена';
  $('#over-msg').textContent = `${reason}. По правилам честной игры результат сгорел.`;
  showOver(g, true);
}

function showOver(g, burned) {
  $('#over-score').textContent = burned ? 0 : g.score;
  $('#over-level').textContent = g.level;
  $('#over-correct').textContent = g.correct;
  $('#over-streak').textContent = g.bestStreak;
  $('#screen-over').classList.toggle('burned', burned);
  $('#over-badges').innerHTML = !burned && newBadgesThisGame.length
    ? '<p class="sub">Новые награды:</p>' + newBadgesThisGame
        .map((a) => `<span class="badge-chip">${a.ico} ${a.name}</span>`).join('')
    : '';
  show('screen-over');
}

function exitGame() {
  if (!S) return show('screen-menu');
  const g = finish();
  saveRecord(g);
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
  for (let i = 0; i < MAX_HEARTS; i++) {
    const h = document.createElement('span');
    h.className = 'heart' + (i >= S.hearts ? ' lost' : '') + (i === popIndex ? ' pop' : '');
    h.textContent = '❤️';
    box.appendChild(h);
  }
}

function renderStats() {
  $('#score').textContent = S.score;
  $('#level').textContent = S.level;
  $('#coins').textContent = '💰 ' + S.coins;
  const progress = (S.correct % CORRECT_PER_LEVEL) / CORRECT_PER_LEVEL;
  $('#level-fill').style.width = progress * 100 + '%';
  $('#rank-name').textContent = `${rankFor(S.level)} · до уровня ${S.level + 1}: ${CORRECT_PER_LEVEL - (S.correct % CORRECT_PER_LEVEL)}`;
  const mult = comboMult(S.streak);
  $('#combo').textContent = mult > 1 ? `🔥 ×${mult}` : (S.streak >= 2 ? `🔥 ${S.streak}` : '');
  $('#btn-hint').disabled = S.hintUsed || S.coins < HINT_COST;
  $('#game-owl .owl').setAttribute('class', `owl lvl-${Math.min(S.level, 8)}`);
}

/* =========================================================
   Награды
   ========================================================= */
function award(id) {
  if (unlocked.has(id)) return;
  unlocked.add(id);
  store.set('badges', [...unlocked]);
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  newBadgesThisGame.push(a);
  setTimeout(() => toast(`Новая награда: ${a.ico} ${a.name}!`), 900);
}

function checkAchievements() {
  if (S.correct >= 1) award('first');
  if (S.streak >= 5) award('streak5');
  if (S.streak >= 10) award('streak10');
  if (S.streak >= 25) award('streak25');
  if (S.problem.boss) award('boss');
  if (S.level >= 5) award('level5');
  if (S.level >= 8) award('level8');
  if (S.score >= 500) award('score500');
  if (S.score >= 3000) award('score3000');
  if (S.correct >= 20 && S.mistakes === 0) award('clean');
  if (S.coins >= 30) award('rich');
}

function renderBadges() {
  $('#badges-grid').innerHTML = ACHIEVEMENTS.map((a) => `
    <div class="badge ${unlocked.has(a.id) ? '' : 'locked'}">
      <span class="ico">${a.ico}</span><b>${a.name}</b><small>${a.desc}</small>
    </div>`).join('');
}

/* =========================================================
   Рекорды: на этом устройстве + общий онлайн-рейтинг (Firebase Firestore)
   ========================================================= */
const Online = {
  get enabled() {
    const c = window.FIREBASE_CONFIG;
    return !!(c && c.projectId && c.apiKey);
  },
  url(path) {
    const c = window.FIREBASE_CONFIG;
    return `https://firestore.googleapis.com/v1/projects/${c.projectId}/databases/(default)/documents${path}?key=${c.apiKey}`;
  },
  async submit(rec) {
    if (!this.enabled) return;
    const res = await fetch(this.url('/scores'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: {
        name: { stringValue: rec.name },
        age: { stringValue: rec.age },
        score: { integerValue: String(rec.score) },
        level: { integerValue: String(rec.level) },
        createdAt: { timestampValue: new Date().toISOString() },
      } }),
    });
    if (!res.ok) throw new Error('submit ' + res.status);
  },
  async top(age, limit = 20) {
    const res = await fetch(this.url(':runQuery'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: 'scores' }],
        where: { fieldFilter: { field: { fieldPath: 'age' }, op: 'EQUAL', value: { stringValue: age } } },
        orderBy: [{ field: { fieldPath: 'score' }, direction: 'DESCENDING' }],
        limit,
      } }),
    });
    if (!res.ok) throw new Error('top ' + res.status);
    const rows = await res.json();
    return rows.filter((r) => r.document).map(({ document: { fields: f } }) => ({
      name: f.name?.stringValue ?? '?',
      age: f.age?.stringValue,
      score: Number(f.score?.integerValue ?? 0),
      level: Number(f.level?.integerValue ?? 1),
      date: f.createdAt ? new Date(f.createdAt.timestampValue).toLocaleDateString('ru-RU') : '',
    }));
  },
};

// сохраняет результат; возвращает true, если это лучший результат на устройстве
function saveRecord(g) {
  if (g.score <= 0) return false;
  const rec = {
    name: player.name, age: player.age, score: g.score, level: g.level,
    date: new Date().toLocaleDateString('ru-RU'),
  };
  const records = store.get('records', []);
  const isTop = !records.length || g.score > records[0].score;
  records.push(rec);
  records.sort((a, b) => b.score - a.score);
  store.set('records', records.slice(0, 10));
  Online.submit(rec).catch(() => toast('Нет интернета — результат сохранён только на этом устройстве'));
  return isTop;
}

const recView = { src: Online.enabled ? 'online' : 'local', age: null };

async function renderRecords() {
  recView.age = recView.age || (AGES[player.age] ? player.age : 'young');
  document.querySelectorAll('#rec-src button').forEach((b) => b.classList.toggle('on', b.dataset.src === recView.src));
  document.querySelectorAll('#rec-age button').forEach((b) => b.classList.toggle('on', b.dataset.age === recView.age));
  const list = $('#records-list');
  const note = $('#rec-note');
  note.textContent = '';

  if (recView.src === 'local') {
    const local = store.get('records', []).filter((r) => r.age === recView.age);
    return fillRecords(local, 'Пока пусто. Сыграй и стань первым!');
  }
  if (!Online.enabled) {
    list.innerHTML = '';
    note.textContent = 'Общий рейтинг ещё не подключён (см. README → «Онлайн-рейтинг»).';
    return;
  }
  list.innerHTML = '<li class="empty">Загружаю… ⏳</li>';
  const want = { ...recView };
  try {
    const rows = await Online.top(want.age);
    if (want.src !== recView.src || want.age !== recView.age) return; // пока грузили, переключили вкладку
    fillRecords(rows, 'В этой группе ещё никто не играл. Будь первым!');
  } catch {
    list.innerHTML = '<li class="empty">Не получилось загрузить. Проверь интернет 📶</li>';
  }
}

function fillRecords(records, emptyText) {
  const list = $('#records-list');
  if (!records.length) {
    list.innerHTML = `<li class="empty">${emptyText}</li>`;
    return;
  }
  list.innerHTML = '';
  records.forEach((r) => {
    const li = document.createElement('li');
    if (r.name === player.name) li.classList.add('me');
    const name = document.createElement('span');
    name.className = 'r-name';
    name.textContent = r.name;
    const meta = document.createElement('small');
    meta.textContent = `уровень ${r.level} · ${r.date}`;
    name.appendChild(meta);
    const score = document.createElement('b');
    score.className = 'r-score';
    score.textContent = r.score;
    li.append(name, score);
    list.appendChild(li);
  });
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
  $('#btn-hint').addEventListener('click', useHint);
  $('#btn-exit').addEventListener('click', exitGame);
  $('#btn-again').addEventListener('click', startGame);
  document.querySelectorAll('#rec-src button').forEach((b) =>
    b.addEventListener('click', () => { recView.src = b.dataset.src; renderRecords(); }));
  document.querySelectorAll('#rec-age button').forEach((b) =>
    b.addEventListener('click', () => { recView.age = b.dataset.age; renderRecords(); }));
  const sb = $('#btn-sound');
  const paintSound = () => { sb.textContent = soundOn ? '🔊' : '🔇'; };
  paintSound();
  sb.addEventListener('click', () => { soundOn = !soundOn; store.set('sound', soundOn); paintSound(); });
}

initMenu();
initControls();
Fair.init();
