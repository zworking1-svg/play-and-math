/* =========================================================
   Настройки игры по умолчанию. Администратор меняет их в админ-панели,
   они хранятся в Firestore (config/game) и подмешиваются поверх этих.
   ========================================================= */

export const MAX_TIER = 8;

// пример задачи для каждого уровня сложности — подсказка в админ-панели
export const TIER_EXAMPLES = ['', '3 × 4', '4 × 9', '7 × 8', '14 × 6', '47 × 8', '11 × 23', '26 × 59', '67 × 48'];

// типы наград: по какому показателю выдаётся награда
export const ACH_TYPES = {
  correct: 'Верных ответов за игру',
  streak:  'Верных ответов подряд',
  level:   'Дойти до уровня',
  score:   'Очков за одну игру',
  coins:   'Монет за игру',
  fast:    'Ответ быстрее (секунд)',
  boss:    'Супер-примеров за игру',
  clean:   'Верных ответов без единой ошибки',
  wins:    'Побед всего',
  games:   'Сыграно игр всего',
  time:    'Минут в игре всего',
};

export const DEFAULT_CONFIG = {
  heroName: 'Филя',                 // имя героя-совёнка
  gameTitle: 'Считай с Филей',      // название игры на экранах и во вкладке браузера
  winScore: 2000,        // столько очков за игру — победа
  maxHearts: 10,
  correctPerLevel: 5,    // верных ответов до нового уровня
  bossEvery: 10,         // каждый N-й пример — супер-пример
  hintCost: 3,           // цена подсказки в монетах
  fastSeconds: 7,        // ответ быстрее — бонус за скорость
  timeLimits: [15, 20, 20, 30, 35, 45, 60, 75], // секунд на пример, уровни сложности 1…8
  antiCheat: true,       // честная игра: свернул / переключился / уменьшил окно — пауза и новый пример
  ages: [
    { id: 'young', label: '7–8 лет',   startTier: 1 },
    { id: 'mid',   label: '9–10 лет',  startTier: 3 },
    { id: 'old',   label: '11–12 лет', startTier: 5 },
  ],
  achievements: [
    { id: 'first',    ico: '🌱', name: 'Первый шаг', desc: 'Первый верный ответ',                 type: 'correct', value: 1 },
    { id: 'streak5',  ico: '🔥', name: 'Огонёк',     desc: '5 верных ответов подряд',             type: 'streak',  value: 5 },
    { id: 'streak10', ico: '☄️', name: 'Пламя',      desc: '10 верных ответов подряд',            type: 'streak',  value: 10 },
    { id: 'streak25', ico: '🌋', name: 'Вулкан',     desc: '25 верных ответов подряд',            type: 'streak',  value: 25 },
    { id: 'fast',     ico: '⚡', name: 'Молния',     desc: 'Ответ быстрее 3 секунд',              type: 'fast',    value: 3 },
    { id: 'boss',     ico: '👑', name: 'Победитель', desc: 'Решить супер-пример',                 type: 'boss',    value: 1 },
    { id: 'level5',   ico: '🎓', name: 'Мастер',     desc: 'Дойти до 5 уровня',                   type: 'level',   value: 5 },
    { id: 'level8',   ico: '🏰', name: 'Легенда',    desc: 'Дойти до 8 уровня',                   type: 'level',   value: 8 },
    { id: 'score500', ico: '⭐', name: '500 очков',  desc: 'Набрать 500 очков за игру',           type: 'score',   value: 500 },
    { id: 'win1',     ico: '🏆', name: 'Чемпион',    desc: 'Первая победа',                       type: 'wins',    value: 1 },
    { id: 'clean',    ico: '💎', name: 'Без ошибок', desc: '20 верных ответов без единой ошибки', type: 'clean',   value: 20 },
    { id: 'rich',     ico: '💰', name: 'Копилка',    desc: 'Накопить 30 монет',                   type: 'coins',   value: 30 },
    { id: 'games10',  ico: '🎮', name: 'Упорство',   desc: 'Сыграть 10 игр',                      type: 'games',   value: 10 },
    { id: 'time60',   ico: '⏳', name: 'Час математики', desc: 'Провести в игре 60 минут',        type: 'time',    value: 60 },
  ],
};

const num = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

// настройки из базы поверх стандартных; всё непонятное заменяется стандартным
export function mergeConfig(raw) {
  const d = DEFAULT_CONFIG;
  const r = raw || {};
  const ages = Array.isArray(r.ages) ? r.ages
    .filter((a) => a && a.id && a.label)
    .map((a) => ({ id: String(a.id), label: String(a.label), startTier: num(a.startTier, 1, MAX_TIER, 1) })) : [];
  const achievements = Array.isArray(r.achievements) ? r.achievements
    .filter((a) => a && a.id && a.name && ACH_TYPES[a.type])
    .map((a) => ({ id: String(a.id), ico: String(a.ico || '🏅'), name: String(a.name), desc: String(a.desc || ''),
                   type: a.type, value: num(a.value, 1, 1000000, 1) })) : null;
  const text = (v, fallback) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : fallback);
  return {
    heroName: text(r.heroName, d.heroName),
    gameTitle: text(r.gameTitle, d.gameTitle),
    winScore: num(r.winScore, 10, 1000000, d.winScore),
    maxHearts: num(r.maxHearts, 1, 30, d.maxHearts),
    correctPerLevel: num(r.correctPerLevel, 1, 50, d.correctPerLevel),
    bossEvery: num(r.bossEvery, 2, 100, d.bossEvery),
    hintCost: num(r.hintCost, 0, 100, d.hintCost),
    fastSeconds: num(r.fastSeconds, 1, 120, d.fastSeconds),
    timeLimits: d.timeLimits.map((t, i) => num(r.timeLimits?.[i], 3, 600, t)),
    antiCheat: typeof r.antiCheat === 'boolean' ? r.antiCheat : d.antiCheat,
    ages: ages.length ? ages : structuredClone(d.ages),
    achievements: achievements ?? structuredClone(d.achievements),
  };
}

export function emptyProfile(login, age) {
  return {
    login, age,
    games: 0, wins: 0, losses: 0, violations: 0,
    playSeconds: 0, correct: 0, wrong: 0,
    bestScore: 0, bestLevel: 1, totalScore: 0,
    badges: [], recent: [],
  };
}

export const isPin = (pin) => /^\d{4,6}$/.test(String(pin));

// дополняет запись игрока из базы недостающими полями
export function normalizeProfile(data) {
  const p = { ...emptyProfile(data.login || '?', data.age || ''), ...data };
  p.badges = Array.isArray(p.badges) ? p.badges : [];
  p.recent = Array.isArray(p.recent) ? p.recent : [];
  for (const k of ['createdAt', 'lastPlayed']) p[k] = toMillis(p[k]);
  return p;
}

export function toMillis(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
}

export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  if (sec < 60) return `${sec} сек`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} мин`;
  return `${Math.floor(m / 60)} ч ${m % 60} мин`;
}

// место игрока среди игроков его возраста по лучшему результату
export function rankOf(players, uid) {
  const sorted = players.filter((p) => p.bestScore > 0).sort((a, b) => b.bestScore - a.bestScore);
  const i = sorted.findIndex((p) => p.uid === uid);
  return { place: i < 0 ? null : i + 1, total: sorted.length };
}
