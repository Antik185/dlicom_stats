/**
 * Сохраняет снепшот текущих рангов в data/rank_history.json
 * Запускать при каждом обновлении данных.
 *
 * Использование:
 *   node scripts/save_rank_snapshot.js
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR       = path.join(__dirname, '..', 'data');
const RANK_HIST_FILE = path.join(DATA_DIR, 'rank_history.json');

const PERIOD_FILES = {
  all:     'scores.json',
  monthly: 'scores_monthly.json',
  weekly:  'scores_weekly.json',
};

function readRanks(filename) {
  const p = path.join(DATA_DIR, filename);
  if (!fs.existsSync(p)) return {};
  const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
  const ranks = {};
  for (const u of (data.users || [])) ranks[u.username] = u.rank;
  return ranks;
}

function main() {
  let history = { snapshots: [] };
  if (fs.existsSync(RANK_HIST_FILE)) {
    history = JSON.parse(fs.readFileSync(RANK_HIST_FILE, 'utf-8'));
  }

  // Используем --ref-date если передан, иначе сегодня
  const refArg = process.argv.find(a => a.startsWith('--ref-date='));
  const today  = refArg ? refArg.slice(11) : new Date().toISOString().slice(0, 10);

  // Remove existing weekly snapshot for this date if any (idempotent); keep monthly snapshots
  history.snapshots = history.snapshots.filter(s => !(s.date === today && s.type !== 'monthly'));

  const snapshot = {
    date:    today,
    type:    'weekly',
    all:     readRanks(PERIOD_FILES.all),
    monthly: readRanks(PERIOD_FILES.monthly),
    weekly:  readRanks(PERIOD_FILES.weekly),
  };

  history.snapshots.push(snapshot);
  history.snapshots.sort((a, b) => a.date.localeCompare(b.date) || (a.type === 'monthly' ? 1 : -1));

  // Keep last 16 weekly snapshots (~4 months), preserve all monthly snapshots
  const weeklies = history.snapshots.filter(s => s.type !== 'monthly');
  const monthlies = history.snapshots.filter(s => s.type === 'monthly');
  const keptWeeklies = weeklies.length > 16 ? weeklies.slice(-16) : weeklies;
  history.snapshots = [...keptWeeklies, ...monthlies]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.type === 'monthly' ? 1 : -1));

  fs.writeFileSync(RANK_HIST_FILE, JSON.stringify(history, null, 2));

  // Also write _data.js for browser (no server required)
  const jsOut = path.join(DATA_DIR, 'rank_history_data.js');
  fs.writeFileSync(jsOut, `window.RANK_HISTORY_DATA = ${JSON.stringify(history)};`);

  console.log(`✅ Снепшот ранков сохранён: ${today}`);
  console.log(`   All-time пользователей: ${Object.keys(snapshot.all).length}`);
  console.log(`   Monthly:  ${Object.keys(snapshot.monthly).length}`);
  console.log(`   Weekly:   ${Object.keys(snapshot.weekly).length}`);
  console.log(`   Всего снепшотов: ${history.snapshots.length}`);
}

main();
