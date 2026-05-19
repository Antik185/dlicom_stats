/**
 * Генерирует ретроспективные снапшоты рангов за прошлые недели.
 * Запускать один раз для заполнения истории.
 *
 * Использование:
 *   node scripts/backfill_snapshots.js
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DATA_DIR       = path.join(__dirname, '..', 'data');
const RANK_HIST_FILE = path.join(DATA_DIR, 'rank_history.json');
const SCRIPTS        = __dirname;

// Даты для ретроспективы (воскресенья — концы недель)
const BACKFILL_DATES = [
  '2026-04-28',
  '2026-05-05',
  '2026-05-12',
];

function readRanks(filename) {
  const p = path.join(DATA_DIR, filename);
  if (!fs.existsSync(p)) return {};
  const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
  const ranks = {};
  for (const u of (data.users || [])) ranks[u.username] = u.rank;
  return ranks;
}

function runPeriod(period, refDate) {
  execSync(
    `node ${path.join(SCRIPTS, 'calc_period_scores.js')} --period=${period} --ref-date=${refDate}`,
    { stdio: 'pipe' }
  );
}

function main() {
  let history = { snapshots: [] };
  if (fs.existsSync(RANK_HIST_FILE)) {
    history = JSON.parse(fs.readFileSync(RANK_HIST_FILE, 'utf-8'));
  }

  // Бэкапим оригинальные файлы
  const origWeekly  = fs.existsSync(path.join(DATA_DIR,'scores_weekly.json'))
    ? fs.readFileSync(path.join(DATA_DIR,'scores_weekly.json'))  : null;
  const origMonthly = fs.existsSync(path.join(DATA_DIR,'scores_monthly.json'))
    ? fs.readFileSync(path.join(DATA_DIR,'scores_monthly.json')) : null;

  for (const date of BACKFILL_DATES) {
    // Пропускаем если снапшот уже есть
    if (history.snapshots.find(s => s.date === date)) {
      console.log(`⏭  ${date} — уже есть, пропускаем`);
      continue;
    }

    console.log(`\n📅 Считаем снапшот для ${date}...`);

    // Считаем weekly и monthly для этой даты
    runPeriod('weekly',  date);
    runPeriod('monthly', date);

    const snapshot = {
      date,
      all:     readRanks('scores.json'),        // all-time ранги не меняются сильно
      monthly: readRanks('scores_monthly.json'),
      weekly:  readRanks('scores_weekly.json'),
    };

    history.snapshots.push(snapshot);
    console.log(`  ✓ weekly: ${Object.keys(snapshot.weekly).length} users, monthly: ${Object.keys(snapshot.monthly).length} users`);
  }

  // Восстанавливаем оригинальные файлы
  if (origWeekly)  fs.writeFileSync(path.join(DATA_DIR,'scores_weekly.json'),  origWeekly);
  if (origMonthly) fs.writeFileSync(path.join(DATA_DIR,'scores_monthly.json'), origMonthly);

  // Сортируем и обрезаем
  history.snapshots.sort((a, b) => a.date.localeCompare(b.date));
  if (history.snapshots.length > 16) history.snapshots = history.snapshots.slice(-16);

  fs.writeFileSync(RANK_HIST_FILE, JSON.stringify(history, null, 2));

  const jsOut = path.join(DATA_DIR, 'rank_history_data.js');
  fs.writeFileSync(jsOut, `window.RANK_HISTORY_DATA = ${JSON.stringify(history)};`);

  console.log(`\n✅ Готово! Снапшотов: ${history.snapshots.length}`);
  console.log('   Даты:', history.snapshots.map(s => s.date).join(', '));
}

main();
