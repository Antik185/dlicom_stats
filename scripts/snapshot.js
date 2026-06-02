/**
 * Менеджер снепшотов для периодического лидерборда.
 *
 * Использование:
 *   node scripts/snapshot.js --init              # Первый запуск: инит обоих периодов
 *   node scripts/snapshot.js --save=monthly      # Сохранить базовый снепшот начала месяца
 *   node scripts/snapshot.js --save=weekly       # Сохранить базовый снепшот начала недели
 *   node scripts/snapshot.js --calc=monthly      # Посчитать дельту от базы → scores_monthly.json
 *   node scripts/snapshot.js --calc=weekly       # Посчитать дельту от базы → scores_weekly.json
 *
 * Рекомендуемое расписание:
 *   Каждый понедельник:    --save=weekly   потом в конце недели --calc=weekly
 *   Первого числа месяца:  --save=monthly  потом в конце месяца --calc=monthly
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR    = path.join(__dirname, '..', 'data');
const SNAP_DIR    = path.join(DATA_DIR, 'snapshots');
const SCORES_FILE = path.join(DATA_DIR, 'scores.json');

// ── Утилиты ───────────────────────────────────────────────────
function getISOWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function periodKey(period) {
  const now = new Date();
  if (period === 'monthly') {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  const wk = getISOWeek(now);
  return `${now.getFullYear()}-W${String(wk).padStart(2, '0')}`;
}

function snapPath(period) {
  return path.join(SNAP_DIR, `${period}_${periodKey(period)}.json`);
}

// ── Найти самый свежий снепшот для периода ─────────────────────
function latestSnapPath(period) {
  if (!fs.existsSync(SNAP_DIR)) return null;
  const files = fs.readdirSync(SNAP_DIR)
    .filter(f => f.startsWith(period + '_') && f.endsWith('.json'))
    .sort()
    .reverse();
  return files.length ? path.join(SNAP_DIR, files[0]) : null;
}

// ── Сохранить снепшот ────────────────────────────────────────
function saveSnapshot(period) {
  fs.mkdirSync(SNAP_DIR, { recursive: true });
  const current = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf-8'));
  const sp = snapPath(period);

  const snap = {
    period,
    key: periodKey(period),
    savedAt: new Date().toISOString(),
    users: Object.fromEntries(
      current.users.map(u => [u.username, {
        dcScore:    u.dcScore    || 0,
        xScore:     u.xScore     || 0,
        dcMessages: u.dcMessages || 0,
        posts:      u.posts      || 0,
        views:      u.views      || 0,
        likes:      u.likes      || 0,
        comments:   u.comments   || 0,
        reposts:    u.reposts    || 0,
      }])
    ),
  };

  fs.writeFileSync(sp, JSON.stringify(snap, null, 2));
  console.log(`✅ Снепшот сохранён: ${sp}`);
  return sp;
}

// ── Посчитать дельту ─────────────────────────────────────────
function calcDelta(period, opts = {}) {
  const current = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf-8'));

  // Ищем базовый снепшот
  const sp = opts.latestSnap ? latestSnapPath(period) : snapPath(period);
  let baseline = {};
  let snapSavedAt = null;

  if (sp && fs.existsSync(sp)) {
    const snapData = JSON.parse(fs.readFileSync(sp, 'utf-8'));
    baseline   = snapData.users || {};
    snapSavedAt = snapData.savedAt;
    console.log(`Используем снепшот: ${sp} (${snapSavedAt})`);
  } else {
    console.warn(`⚠ Снепшот не найден для ${period}. Будет использован текущий скор как база (дельта = 0).`);
    // Если снепшота нет — показываем всё как дельту от нуля (= all-time)
  }

  const ZERO = { dcScore: 0, xScore: 0, dcMessages: 0 };

  const deltaUsers = current.users.map(u => {
    const b = baseline[u.username] || ZERO;
    const dcScore    = Math.max(0, Math.round(((u.dcScore    || 0) - (b.dcScore    || 0)) * 10) / 10);
    const xScore     = Math.max(0, Math.round(((u.xScore     || 0) - (b.xScore     || 0)) * 10) / 10);
    const totalScore = Math.round((dcScore + xScore) * 10) / 10;
    return {
      ...u,
      dcScore,
      xScore,
      totalScore,
      dcMessages: Math.max(0, (u.dcMessages || 0) - (b.dcMessages || 0)),
    };
  }).filter(u => u.totalScore > 0 || u.dcMessages > 0);

  // Пересортировка и тиры
  deltaUsers.sort((a, b) => b.totalScore - a.totalScore);
  const n = deltaUsers.length;
  const p90 = n > 0 ? (deltaUsers[Math.floor(n * 0.10)]?.totalScore || 0) : 0;
  const p99 = n > 0 ? (deltaUsers[Math.floor(n * 0.01)]?.totalScore || 0) : 0;

  deltaUsers.forEach((u, i) => {
    u.rank       = i + 1;
    u.percentile = Math.round(((n - i - 1) / n) * 100);
    u.tier       = u.totalScore >= p99 ? 't5' : u.totalScore >= p90 ? 't3' : 't1';
  });

  const output = {
    generatedAt: new Date().toISOString(),
    period,
    snapshotFrom: snapSavedAt,
    totalUsers: n,
    thresholds: { myth: Math.round(p90), legendary: Math.round(p99) },
    users: deltaUsers,
  };

  const outFile = path.join(DATA_DIR, `scores_${period}.json`);
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2));

  // JS-файл для прямого открытия без сервера
  const jsOut = path.join(DATA_DIR, `scores_${period}_data.js`);
  fs.writeFileSync(jsOut, `window.SCORES_${period.toUpperCase()}_DATA = ${JSON.stringify(output)};`);

  console.log(`✅ Дельта сохранена: ${outFile}`);
  console.log(`   Активных пользователей: ${n}`);
  if (n > 0) console.log(`   Топ-1 (${deltaUsers[0].nickname}): ${deltaUsers[0].totalScore} pts`);

  return outFile;
}

// ── Init: первый запуск ───────────────────────────────────────
function init() {
  console.log('Инициализация снепшотов...\n');
  console.log('— Monthly —');
  saveSnapshot('monthly');
  calcDelta('monthly', { latestSnap: true });
  console.log('\n— Weekly —');
  saveSnapshot('weekly');
  calcDelta('weekly', { latestSnap: true });

  console.log('\n✅ Готово! Файлы scores_monthly.json и scores_weekly.json созданы.');
  console.log('\nРасписание обновлений:');
  console.log('  Каждый понедельник:   node scripts/snapshot.js --save=weekly');
  console.log('  В конце недели:       node scripts/snapshot.js --calc=weekly');
  console.log('  1-го числа месяца:    node scripts/snapshot.js --save=monthly');
  console.log('  В конце месяца:       node scripts/snapshot.js --calc=monthly');
}

// ── CLI ───────────────────────────────────────────────────────
const arg = process.argv[2];
if (!arg || arg === '--init') {
  init();
} else if (arg.startsWith('--save=')) {
  saveSnapshot(arg.slice(7));
} else if (arg.startsWith('--calc=')) {
  calcDelta(arg.slice(7), { latestSnap: true });
} else {
  console.log('Usage: node scripts/snapshot.js [--init | --save=monthly | --save=weekly | --calc=monthly | --calc=weekly]');
}
