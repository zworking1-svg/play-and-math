/* =========================================================
   Админ-панель «Считай с Филей»
   ========================================================= */
import { DEFAULT_CONFIG, ACH_TYPES, TIER_EXAMPLES, mergeConfig, fmtDuration, rankOf, isPin } from './settings.js';

const hasKeys = window.FIREBASE_CONFIG && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.apiKey;
const useMock = new URLSearchParams(location.search).has('mock') || !hasKeys;
const { cloud } = await import(useMock ? './cloud-mock.js' : './cloud.js');

const ONLINE_MS = 75 * 1000;     // игра шлёт сигнал раз в 25 секунд
const RESULT_LABEL = { win: '🏆 Победа', loss: '💔 Поражение', violation: '🚫 Нарушение' };
const STATE_LABEL = { playing: '🎮 Играет', paused: '⏸️ Пауза: нарушение', menu: '📋 В меню', offline: 'Не в сети' };

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let CONFIG = await cloud.loadConfig();
let players = [];
let presence = [];
let games = [];
let pins = {};           // PIN-коды игроков: { uid: pin }
let unsub = [];

/* ---------- мелочи ---------- */
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
}

function ago(ms) {
  if (!ms) return '—';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 10) return 'только что';
  if (s < 60) return `${s} сек назад`;
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
  return new Date(ms).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
const dateTime = (ms) => (ms ? new Date(ms).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const ageLabel = (id) => CONFIG.ages.find((a) => a.id === id)?.label || id || '—';
const device = (d) => (d ? `${d.type} · ${d.os} · ${d.browser}` : '—');
const isOnline = (p) => p.state !== 'offline' && Date.now() - p.updatedAt < ONLINE_MS;
const kpi = (label, value) => `<div class="kpi"><small>${label}</small><b>${value}</b></div>`;

/* =========================================================
   Вход администратора
   ========================================================= */
cloud.onAuth(async (user) => {
  unsub.forEach((f) => f());
  unsub = [];
  if (!user) return showLogin();
  if (!(await cloud.isAdmin(user.uid))) return showLogin(user.uid, user.email);
  startApp();
});

function showLogin(deniedUid, email) {
  $('#view-app').hidden = true;
  $('#view-login').hidden = false;
  $('#btn-google').hidden = !!deniedUid;
  $('#login-denied').hidden = !deniedUid;
  $('#my-uid').textContent = deniedUid || '';
  $('#my-email').textContent = email || '—';
}

$('#btn-google').addEventListener('click', async () => {
  $('#login-error').textContent = '';
  try {
    await cloud.adminSignIn();
  } catch (e) {
    console.error(e);
    $('#login-error').textContent = e.code === 'auth/operation-not-allowed'
      ? 'Вход через Google не включён в Firebase (см. README).'
      : e.code === 'auth/unauthorized-domain'
        ? 'Этот адрес сайта не добавлен в Firebase → Authentication → Settings → Authorized domains.'
        : 'Не получилось войти. Попробуйте ещё раз.';
  }
});
$('#btn-copy-uid').addEventListener('click', () => {
  navigator.clipboard?.writeText($('#my-uid').textContent).then(() => toast('UID скопирован'));
});
$('#btn-logout-denied').addEventListener('click', () => cloud.signOut());
$('#btn-logout').addEventListener('click', () => cloud.signOut());

function applyBranding() {
  document.title = `${CONFIG.gameTitle} — админ-панель`;
  $('#brand-title').textContent = CONFIG.gameTitle;
}
applyBranding();

function startApp() {
  $('#view-login').hidden = true;
  $('#view-app').hidden = false;
  $('#mode-badge').hidden = cloud.mode !== 'mock';
  unsub.push(cloud.watchPresence((list) => { presence = list; renderOnline(); }));
  unsub.push(cloud.watchPins((map) => {
    pins = map;
    renderPlayers();
    if (!$('#modal').hidden && openUid) openPlayer(openUid);
  }));
  unsub.push(cloud.watchPlayers((list) => {
    players = list;
    renderPlayers();
    if (!$('#modal').hidden && openUid) openPlayer(openUid);
  }));
  loadGames();
  renderSettings();
}

/* ---------- вкладки ---------- */
document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `view-${b.dataset.view}`; });
  if (b.dataset.view === 'games') loadGames();
}));

/* =========================================================
   Онлайн
   ========================================================= */
function renderOnline() {
  const inGame = (p) => p.state === 'playing' || p.state === 'paused';
  const online = presence.filter(isOnline).sort((a, b) =>
    (inGame(a) ? 0 : 1) - (inGame(b) ? 0 : 1) || String(a.login).localeCompare(String(b.login)));
  const playing = online.filter(inGame);
  $('#online-count').textContent = online.length;
  $('#online-kpis').innerHTML = [
    kpi('Сейчас онлайн', online.length),
    kpi('Играют прямо сейчас', playing.length),
    kpi('В меню', online.length - playing.length),
    kpi('Заходили за сутки', presence.filter((p) => Date.now() - p.updatedAt < 86400000).length),
  ].join('');

  $('#online-cards').innerHTML = online.length ? online.map((p) => {
    const st = inGame(p) ? p.state : 'menu';
    const body = st !== 'menu' ? `
      <div class="pcard-stats">
        <div><small>Уровень</small><b>${p.level ?? '—'}</b></div>
        <div><small>Рейтинг</small><b>${p.score ?? '—'}</b></div>
        <div><small>Сердечки</small><b>${p.hearts ?? '—'} ❤️</b></div>
      </div>
      <div class="pcard-foot"><span>⏱️ играет ${fmtDuration((Date.now() - p.gameStartedAt) / 1000)}</span><span>${ago(p.updatedAt)}</span></div>`
      : `<div class="pcard-foot" style="margin-top:10px"><span>Выбирает, что делать</span><span>${ago(p.updatedAt)}</span></div>`;
    return `<div class="pcard ${st}" data-uid="${esc(p.uid)}">
      <div class="pcard-head"><b>${esc(p.login)}</b><span class="pill ${st}">${STATE_LABEL[st]}</span></div>
      <div class="muted" style="font-size:13px">${esc(ageLabel(p.age))} · 📱 ${esc(device(p.device))}</div>
      ${body}
    </div>`;
  }).join('') : '<div class="empty-box">Сейчас никто не играет 💤</div>';

  const recent = presence.filter((p) => !isOnline(p)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30);
  $('#recent-table').innerHTML = `<thead><tr><th>Игрок</th><th>Возраст</th><th>Устройство</th><th>Был в сети</th></tr></thead><tbody>` +
    (recent.length ? recent.map((p) => `<tr><td><b>${esc(p.login)}</b></td><td>${esc(ageLabel(p.age))}</td>
      <td>${esc(device(p.device))}</td><td>${ago(p.updatedAt)}</td></tr>`).join('')
      : '<tr><td colspan="4" class="empty">Пока никого</td></tr>') + '</tbody>';
}
setInterval(() => { if (!$('#view-app').hidden) renderOnline(); }, 5000);
$('#online-cards').addEventListener('click', (e) => {
  const card = e.target.closest('.pcard');
  if (card) openPlayer(card.dataset.uid);
});

/* =========================================================
   Игроки
   ========================================================= */
function withRanks(list) {
  const byAge = {};
  list.forEach((p) => { (byAge[p.age] ||= []).push(p); });
  return list.map((p) => ({ ...p, place: rankOf(byAge[p.age], p.uid).place }));
}

function renderPlayers() {
  const sel = $('#pl-age');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Все возрасты</option>' +
    CONFIG.ages.map((a) => `<option value="${esc(a.id)}">${esc(a.label)}</option>`).join('');
  sel.value = cur;

  const sum = (k) => players.reduce((s, p) => s + (p[k] || 0), 0);
  $('#players-kpis').innerHTML = [
    kpi('Игроков', players.length),
    kpi('Сыграно игр', sum('games')),
    kpi('Побед', sum('wins')),
    kpi('Поражений', sum('losses')),
    kpi('Нарушений', sum('violations')),
    kpi('Общее время в игре', fmtDuration(sum('playSeconds'))),
  ].join('');

  const q = $('#pl-search').value.trim().toLowerCase();
  const age = sel.value;
  const sortKey = $('#pl-sort').value;
  const val = (p) => (sortKey === 'badges' ? p.badges.length : p[sortKey] || 0);
  const onlineUids = new Set(presence.filter(isOnline).map((p) => p.uid));
  const rows = withRanks(players)
    .filter((p) => (!age || p.age === age) && (!q || p.login.toLowerCase().includes(q)))
    .sort((a, b) => val(b) - val(a));

  $('#players-table').innerHTML = `<thead><tr>
      <th>Место</th><th>Логин</th><th>PIN</th><th>Возраст</th><th class="num">Лучший</th><th class="num">Игр</th>
      <th class="num">Побед</th><th class="num">Пораж.</th><th class="num">Наруш.</th><th class="num">Время</th>
      <th class="num">Награды</th><th>Последняя игра</th></tr></thead><tbody>` +
    (rows.length ? rows.map((p) => `<tr data-uid="${esc(p.uid)}">
      <td>${p.place ? `<span class="place p${p.place}">${p.place}</span>` : '—'}</td>
      <td>${onlineUids.has(p.uid) ? '<span class="dot" title="Онлайн"></span>' : ''}<b>${esc(p.login)}</b></td>
      <td><code>${esc(pins[p.uid] ?? '—')}</code></td>
      <td>${esc(ageLabel(p.age))}</td>
      <td class="num"><b>${p.bestScore}</b></td>
      <td class="num">${p.games}</td>
      <td class="num">${p.wins}</td>
      <td class="num">${p.losses}</td>
      <td class="num">${p.violations ? `<b style="color:var(--bad)">${p.violations}</b>` : 0}</td>
      <td class="num">${fmtDuration(p.playSeconds)}</td>
      <td class="num">${p.badges.length} / ${CONFIG.achievements.length}</td>
      <td>${ago(p.lastPlayed)}</td></tr>`).join('')
      : '<tr><td colspan="12" class="empty">Игроков пока нет</td></tr>') + '</tbody>';
}
['#pl-search', '#pl-age', '#pl-sort'].forEach((s) => $(s).addEventListener('input', renderPlayers));
$('#players-table').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-uid]');
  if (tr) openPlayer(tr.dataset.uid);
});

/* ---------- карточка игрока ---------- */
let openUid = null;

function openPlayer(uid) {
  const p = withRanks(players).find((x) => x.uid === uid);
  if (!p) return;
  openUid = uid;
  const pr = presence.find((x) => x.uid === uid);
  const sameAge = players.filter((x) => x.age === p.age && x.bestScore > 0).length;
  const stat = (label, value) => `<div><small>${label}</small><b>${value}</b></div>`;
  const avg = p.games - p.violations > 0 ? Math.round(p.totalScore / (p.games - p.violations)) : 0;
  $('#modal-body').innerHTML = `
    <h2>${esc(p.login)}</h2>
    <p class="muted">${esc(ageLabel(p.age))} · зарегистрирован ${dateTime(p.createdAt)} ·
      ${pr && isOnline(pr) ? `<b style="color:var(--ok)">● онлайн (${STATE_LABEL[pr.state]})</b>` : `был в сети ${ago(pr?.updatedAt || p.lastPlayed)}`}
      ${pr?.device ? ` · 📱 ${esc(device(pr.device))}` : ''}</p>
    <div class="pin-box">
      <div>🔑 Логин: <b>${esc(p.login)}</b> · PIN: <code class="pin">${esc(pins[uid] ?? 'неизвестен')}</code></div>
      <form id="pin-form" class="pin-form">
        <input id="pin-new" type="text" inputmode="numeric" maxlength="6" placeholder="Новый PIN (4–6 цифр)" autocomplete="off">
        <button class="btn small primary" type="submit">Сменить PIN</button>
      </form>
    </div>
    <div class="stat-grid">
      ${stat('Место в рейтинге', p.place ? `${p.place} из ${sameAge}` : '—')}
      ${stat('Лучший рейтинг', p.bestScore)}
      ${stat('Лучший уровень', p.bestLevel)}
      ${stat('Средний рейтинг', avg)}
      ${stat('Сыграно игр', p.games)}
      ${stat('Побед', p.wins)}
      ${stat('Поражений', p.losses)}
      ${stat('Нарушений правил', p.violations)}
      ${stat('Время в игре', fmtDuration(p.playSeconds))}
      ${stat('Верных ответов', p.correct)}
      ${stat('Ошибок', p.wrong)}
      ${stat('Точность', p.correct + p.wrong ? Math.round((p.correct / (p.correct + p.wrong)) * 100) + '%' : '—')}
    </div>
    <h3>Награды: ${CONFIG.achievements.filter((a) => p.badges.includes(a.id)).length} из ${CONFIG.achievements.length}</h3>
    <div class="chips">${CONFIG.achievements.map((a) =>
      `<span class="chip ${p.badges.includes(a.id) ? '' : 'off'}" title="${esc(a.desc)}">${esc(a.ico)} ${esc(a.name)}</span>`).join('')}</div>
    <h3>Последние игры</h3>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Когда</th><th>Результат</th><th>Причина</th><th class="num">Нарушений</th><th class="num">Рейтинг</th><th class="num">Уровень</th><th class="num">Время</th></tr></thead>
      <tbody>${p.recent.length ? p.recent.map((g) => `<tr>
        <td>${dateTime(g.at)}</td><td><span class="pill ${esc(g.result)}">${RESULT_LABEL[g.result] || esc(g.result)}</span></td>
        <td>${esc(g.reason)}</td><td class="num">${g.violations ? `<b style="color:var(--bad)">${g.violations}</b>` : 0}</td>
        <td class="num">${g.score}</td><td class="num">${g.level}</td><td class="num">${fmtDuration(g.seconds)}</td></tr>`).join('')
        : '<tr><td colspan="7" class="empty">Ещё не играл</td></tr>'}</tbody>
    </table></div>
    <p style="margin-top:20px"><button class="btn danger small" id="btn-del-player">Удалить игрока из рейтинга</button></p>`;
  $('#pin-new').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, ''); });
  $('#pin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = $('#pin-new').value;
    if (!isPin(pin)) return toast('PIN — от 4 до 6 цифр');
    const btn = $('#pin-form button');
    btn.disabled = true;
    try {
      await cloud.changePin(uid, pin);
      toast(`PIN для «${p.login}» изменён на ${pin}`);
    } catch (err) {
      console.error(err);
      toast(err.code === 'no-pin' ? 'Для этого игрока PIN не сохранён — пусть создаст новый аккаунт'
        : 'Не получилось сменить PIN. Проверьте интернет и попробуйте ещё раз');
    } finally {
      btn.disabled = false;
    }
  });
  $('#btn-del-player').addEventListener('click', async () => {
    if (!confirm(`Удалить игрока «${p.login}» со всей статистикой? Это нельзя отменить.`)) return;
    try {
      await cloud.deletePlayer(uid);
      closeModal();
      toast('Игрок удалён');
    } catch (e) {
      console.error(e);
      toast('Не получилось удалить');
    }
  });
  $('#modal').hidden = false;
}
function closeModal() { $('#modal').hidden = true; openUid = null; }
$('#modal-close').addEventListener('click', closeModal);
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

/* =========================================================
   Журнал игр
   ========================================================= */
async function loadGames() {
  try {
    games = await cloud.listGames(200);
    renderGames();
  } catch (e) {
    console.error(e);
    $('#games-table').innerHTML = '<tbody><tr><td class="empty">Не получилось загрузить журнал</td></tr></tbody>';
  }
}
function renderGames() {
  const f = $('#gm-result').value;
  const rows = games.filter((g) => !f || (f === 'violations' ? g.violations > 0 || g.result === 'violation' : g.result === f));
  $('#games-table').innerHTML = `<thead><tr><th>Когда</th><th>Игрок</th><th>Возраст</th><th>Результат</th><th>Причина</th><th>Нарушения</th>
      <th class="num">Рейтинг</th><th class="num">Уровень</th><th class="num">Верно / ошибок</th><th class="num">Время</th><th>Устройство</th></tr></thead><tbody>` +
    (rows.length ? rows.map((g) => `<tr>
      <td>${dateTime(g.endedAt)}</td><td><b>${esc(g.login)}</b></td><td>${esc(ageLabel(g.age))}</td>
      <td><span class="pill ${esc(g.result)}">${RESULT_LABEL[g.result] || esc(g.result)}</span></td>
      <td>${esc(g.reason)}</td>
      <td>${g.violations ? `<b style="color:var(--bad)">${g.violations}</b> <span class="muted">${esc((g.violationReasons || []).join('; '))}</span>` : '—'}</td>
      <td class="num">${g.score}</td>
      <td class="num">${g.level}</td><td class="num">${g.correct} / ${g.wrong}</td>
      <td class="num">${fmtDuration(g.seconds)}</td><td>${esc(device(g.device))}</td></tr>`).join('')
      : '<tr><td colspan="11" class="empty">Игр пока нет</td></tr>') + '</tbody>';
}
$('#gm-result').addEventListener('input', renderGames);
$('#btn-reload-games').addEventListener('click', loadGames);

/* =========================================================
   Настройки
   ========================================================= */
const TEXT_FIELDS = [
  ['heroName', '🦉 Имя героя'],
  ['gameTitle', '🏷️ Название игры'],
];
const MAIN_FIELDS = [
  ['winScore', '🏆 Очков для победы'],
  ['maxHearts', '❤️ Сердечек в начале игры'],
  ['correctPerLevel', '📈 Верных ответов до нового уровня'],
  ['bossEvery', '👑 Супер-пример: каждый N-й'],
  ['hintCost', '💡 Цена подсказки (монет)'],
  ['fastSeconds', '⚡ Бонус за ответ быстрее (сек)'],
];
const newId = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
let draft = null;   // редактируемая копия настроек

function renderSettings(cfg = CONFIG) {
  draft = structuredClone(cfg);
  $('#main-fields').innerHTML =
    TEXT_FIELDS.map(([k, label]) =>
      `<label>${label}<input type="text" maxlength="40" data-text="${k}" value="${esc(draft[k])}"></label>`).join('') +
    MAIN_FIELDS.map(([k, label]) =>
      `<label>${label}<input type="number" min="0" data-main="${k}" value="${draft[k]}"></label>`).join('');
  $('#f-antiCheat').checked = draft.antiCheat;
  $('#timer-fields').innerHTML = draft.timeLimits.map((t, i) =>
    `<label>Уровень ${i + 1} (${TIER_EXAMPLES[i + 1]})<input type="number" min="3" data-timer="${i}" value="${t}"></label>`).join('');
  renderAges();
  renderAch();
  $('#save-status').textContent = '';
}

function renderAges() {
  const tierOpts = (v) => TIER_EXAMPLES.slice(1).map((ex, i) =>
    `<option value="${i + 1}" ${v === i + 1 ? 'selected' : ''}>Начинать с уровня ${i + 1} (${ex})</option>`).join('');
  $('#ages-list').innerHTML = `<div class="row age row-head"><span>Название группы</span><span>Стартовая сложность</span><span></span></div>` +
    draft.ages.map((a, i) => `<div class="row age">
      <input type="text" maxlength="20" data-age-label="${i}" value="${esc(a.label)}">
      <select data-age-tier="${i}">${tierOpts(a.startTier)}</select>
      <button type="button" class="row-del" data-age-del="${i}" title="Удалить">✕</button>
    </div>`).join('');
}

function renderAch() {
  const typeOpts = (v) => Object.entries(ACH_TYPES).map(([k, label]) =>
    `<option value="${k}" ${v === k ? 'selected' : ''}>${label}</option>`).join('');
  $('#ach-list').innerHTML = `<div class="row ach row-head"><span>Значок</span><span>Название</span><span class="ach-desc">Описание для детей</span><span class="ach-type">Условие</span><span>Значение</span><span></span></div>` +
    draft.achievements.map((a, i) => `<div class="row ach">
      <input type="text" class="ico-input" maxlength="4" data-ach="${i}" data-f="ico" value="${esc(a.ico)}">
      <input type="text" maxlength="30" data-ach="${i}" data-f="name" value="${esc(a.name)}">
      <input type="text" class="ach-desc" maxlength="80" data-ach="${i}" data-f="desc" value="${esc(a.desc)}">
      <select class="ach-type" data-ach="${i}" data-f="type">${typeOpts(a.type)}</select>
      <input type="number" min="1" data-ach="${i}" data-f="value" value="${a.value}">
      <button type="button" class="row-del" data-ach-del="${i}" title="Удалить">✕</button>
    </div>`).join('');
}

$('#settings-form').addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.text) draft[t.dataset.text] = t.value;
  else if (t.dataset.main) draft[t.dataset.main] = Number(t.value);
  else if (t.dataset.timer) draft.timeLimits[t.dataset.timer] = Number(t.value);
  else if (t.dataset.ageLabel) draft.ages[t.dataset.ageLabel].label = t.value;
  else if (t.dataset.ageTier) draft.ages[t.dataset.ageTier].startTier = Number(t.value);
  else if (t.dataset.ach) {
    const a = draft.achievements[t.dataset.ach];
    a[t.dataset.f] = t.dataset.f === 'value' ? Number(t.value) : t.value;
  } else if (t.id === 'f-antiCheat') draft.antiCheat = t.checked;
  $('#save-status').textContent = 'Есть несохранённые изменения';
});

$('#settings-form').addEventListener('click', (e) => {
  const t = e.target;
  if (t.dataset.ageDel !== undefined) {
    if (draft.ages.length <= 1) return toast('Должна остаться хотя бы одна группа');
    draft.ages.splice(Number(t.dataset.ageDel), 1);
    renderAges();
  } else if (t.dataset.achDel !== undefined) {
    draft.achievements.splice(Number(t.dataset.achDel), 1);
    renderAch();
  } else return;
  $('#save-status').textContent = 'Есть несохранённые изменения';
});

$('#btn-add-age').addEventListener('click', () => {
  draft.ages.push({ id: newId('age'), label: 'Новая группа', startTier: 1 });
  renderAges();
});
$('#btn-add-ach').addEventListener('click', () => {
  draft.achievements.push({ id: newId('ach'), ico: '🏅', name: 'Новая награда', desc: '', type: 'correct', value: 10 });
  renderAch();
});
$('#btn-defaults').addEventListener('click', () => {
  if (!confirm('Вернуть все настройки к стандартным? Изменения применятся после «Сохранить».')) return;
  renderSettings(DEFAULT_CONFIG);
  $('#save-status').textContent = 'Стандартные настройки — нажмите «Сохранить»';
});

$('#settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (draft.ages.some((a) => !a.label.trim())) return toast('У каждой возрастной группы должно быть название');
  if (draft.achievements.some((a) => !a.name.trim())) return toast('У каждой награды должно быть название');
  const clean = mergeConfig(draft);
  try {
    await cloud.saveConfig(clean);
    CONFIG = clean;
    applyBranding();
    renderSettings(clean);
    renderPlayers();
    $('#save-status').textContent = '✅ Сохранено ' + new Date().toLocaleTimeString('ru-RU');
    toast('Настройки сохранены');
  } catch (err) {
    console.error(err);
    toast('Не получилось сохранить. Есть ли у вас права администратора?');
  }
});
