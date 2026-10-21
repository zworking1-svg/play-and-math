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
   Генератор примеров по уровню сложности (tier 1…8)
   ========================================================= */
function add(maxA, maxB, minA = 1, minB = 1) {
  const a = rnd(minA, maxA), b = rnd(minB, maxB);
  return { text: `${a} + ${b}`, answer: a + b };
}
function sub(minA, maxA, minB = 1) {
  const a = rnd(minA, maxA), b = rnd(minB, a);
  return { text: `${a} − ${b}`, answer: a - b };
}
function mul(minA, maxA, minB, maxB) {
  let a = rnd(minA, maxA), b = rnd(minB, maxB);
  if (chance(0.5)) [a, b] = [b, a];
  return { text: `${a} × ${b}`, answer: a * b };
}
function div(minD, maxD, minQ, maxQ) {
  const d = rnd(minD, maxD), q = rnd(minQ, maxQ);
  return { text: `${d * q} ÷ ${d}`, answer: q };
}

function generate(tier) {
  switch (tier) {
    case 1:
      return chance(0.55) ? add(10, 10) : sub(5, 20);
    case 2:
      return chance(0.5) ? add(60, 39, 10, 5) : sub(20, 99, 5);
    case 3:
      return pick([
        () => mul(2, 5, 2, 10),
        () => div(2, 5, 2, 10),
        () => generate(2),
      ])();
    case 4:
      return pick([
        () => mul(2, 10, 2, 10),
        () => mul(2, 10, 2, 10),
        () => div(2, 10, 2, 10),
        () => chance(0.5) ? add(99, 99, 20, 20) : sub(30, 150, 10),
      ])();
    case 5:
      return pick([
        () => chance(0.5) ? add(899, 899, 100, 100) : sub(200, 999, 50),
        () => mul(12, 99, 2, 9),
        () => div(2, 9, 11, 30),
      ])();
    case 6:
      return pick([
        () => mul(11, 30, 11, 30),
        () => div(2, 9, 20, 111),
        () => mul(101, 300, 2, 9),
        () => chance(0.5) ? add(4999, 4999, 1000, 100) : sub(1000, 9999, 100),
      ])();
    case 7:
      return pick([
        () => { const a = rnd(2, 20), b = rnd(2, 20), c = rnd(2, 9);
                return { text: `(${a} + ${b}) × ${c}`, answer: (a + b) * c }; },
        () => { const a = rnd(10, 30), b = rnd(1, a - 1), c = rnd(2, 9);
                return { text: `(${a} − ${b}) × ${c}`, answer: (a - b) * c }; },
        () => { const a = rnd(3, 12), b = rnd(3, 12), c = rnd(5, 60);
                return { text: `${a} × ${b} + ${c}`, answer: a * b + c }; },
        () => mul(11, 60, 11, 40),
        () => div(11, 19, 3, 20),
      ])();
    default: // 8
      return pick([
        () => mul(21, 99, 11, 99),
        () => div(11, 25, 5, 40),
        () => { const a = rnd(3, 12), b = rnd(3, 12), c = rnd(3, 12), d = rnd(3, 12);
                return { text: `${a} × ${b} + ${c} × ${d}`, answer: a * b + c * d }; },
        () => { const a = rnd(5, 9), b = rnd(5, 9), c = rnd(2, 9), d = rnd(2, a * b / c | 0 || 1);
                return { text: `${a} × ${b} − ${c} × ${d}`, answer: a * b - c * d }; },
        () => { const a = rnd(10, 50), b = rnd(10, 50), c = rnd(11, 19);
                return { text: `(${a} + ${b}) × ${c}`, answer: (a + b) * c }; },
      ])();
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
let newBadgesThisGame = [];

function newGameState() {
  return {
    score: 0, hearts: MAX_HEARTS, coins: 0,
    streak: 0, bestStreak: 0, correct: 0, mistakes: 0,
    level: 1, qCount: 0, problem: null, startedAt: 0, hintUsed: false,
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
  if (id === 'screen-menu') clearTimeout(nextTimer);
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
  nextProblem();
}

function nextProblem() {
  S.qCount++;
  const boss = S.qCount % BOSS_EVERY === 0;
  const tier = Math.min(MAX_TIER, tierFor(S.level) + (boss ? 1 : 0));
  let p;
  do { p = generate(tier); } while (S.problem && p.text === S.problem.text);
  S.problem = { ...p, boss, tier };
  S.startedAt = performance.now();
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
}

function renderInput() { $('#answer').textContent = input; }

function pressKey(k) {
  if (locked || !S) return;
  if (k === 'ok') return submit();
  if (k === 'back') input = input.slice(0, -1);
  else if (/^\d$/.test(k) && input.length < 6) input = input === '0' ? k : input + k;
  else return;
  sfx.key();
  renderInput();
}

function submit(value = input) {
  if (locked || value === '') return;
  locked = true;
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

function onWrong() {
  S.streak = 0;
  S.mistakes++;
  S.hearts--;
  renderHearts();
  $('#problem-card').classList.add('bad');
  animate($('#game-owl'), 'shake');
  sfx.bad();
  say(`${pick(COMFORT)} Правильно: ${S.problem.text} = ${S.problem.answer}`, true);
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

function gameOver() {
  sfx.over();
  saveRecord();
  $('#over-score').textContent = S.score;
  $('#over-level').textContent = S.level;
  $('#over-correct').textContent = S.correct;
  $('#over-streak').textContent = S.bestStreak;
  const best = store.get('records', [])[0];
  const isTop = best && best.score === S.score && S.score > 0;
  $('#over-msg').textContent = isTop ? '🏆 Это новый рекорд! Ура!' : pick(OVER_MSG);
  if (isTop) confetti(90);
  $('#over-badges').innerHTML = newBadgesThisGame.length
    ? '<p class="sub">Новые награды:</p>' + newBadgesThisGame
        .map((a) => `<span class="badge-chip">${a.ico} ${a.name}</span>`).join('')
    : '';
  show('screen-over');
  S = null;
}

function exitGame() {
  if (!S) return show('screen-menu');
  if (S.correct > 0 && !confirm('Выйти в меню? Рейтинг этой игры сохранится в рекордах.')) return;
  clearTimeout(nextTimer);
  if (S.score > 0) saveRecord();
  S = null;
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
   Награды и рекорды
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

function saveRecord() {
  if (S.score <= 0) return;
  const records = store.get('records', []);
  records.push({
    name: player.name, age: player.age, score: S.score, level: S.level,
    date: new Date().toLocaleDateString('ru-RU'),
  });
  records.sort((a, b) => b.score - a.score);
  store.set('records', records.slice(0, 10));
}

function renderRecords() {
  const list = $('#records-list');
  const records = store.get('records', []);
  if (!records.length) {
    list.innerHTML = '<li class="empty">Пока пусто. Сыграй и стань первым!</li>';
    return;
  }
  list.innerHTML = '';
  records.forEach((r) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'r-name';
    name.textContent = r.name;
    const meta = document.createElement('small');
    meta.textContent = `${AGES[r.age]?.label ?? ''} · уровень ${r.level} · ${r.date}`;
    name.appendChild(meta);
    const score = document.createElement('b');
    score.className = 'r-score';
    score.textContent = r.score;
    li.append(name, score);
    list.appendChild(li);
  });
}

function renderBadges() {
  $('#badges-grid').innerHTML = ACHIEVEMENTS.map((a) => `
    <div class="badge ${unlocked.has(a.id) ? '' : 'locked'}">
      <span class="ico">${a.ico}</span><b>${a.name}</b><small>${a.desc}</small>
    </div>`).join('');
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
    else if (e.key === 'Escape') exitGame();
  });
  $('#btn-hint').addEventListener('click', useHint);
  $('#btn-exit').addEventListener('click', exitGame);
  $('#btn-again').addEventListener('click', startGame);
  const sb = $('#btn-sound');
  const paintSound = () => { sb.textContent = soundOn ? '🔊' : '🔇'; };
  paintSound();
  sb.addEventListener('click', () => { soundOn = !soundOn; store.set('sound', soundOn); paintSound(); });
}

initMenu();
initControls();
