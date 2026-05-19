/**
 * Генерирует ретроспективные месячные снапшоты (конец каждого месяца).
 * Используется для Monthly chart на странице лидерборда.
 *
 * Использование:
 *   node scripts/backfill_monthly_snapshots.js
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DATA_DIR       = path.join(__dirname, '..', 'data');
const RANK_HIST_FILE = path.join(DATA_DIR, 'rank_history.json');
const SCRIPTS        = __dirname;

// Конечные даты месяцев для ретроспективы
const MONTHLY_DATES = [
  '2026-03-31',
  '2026-04-30',
];

function readRanks(filename) {
  const p = path.join(DATA_DIR, filename);
  if (!fs.existsSync(p)) return {};
  const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
  const ranks = {};
  for (const u of (data.users || [])) ranks[u.username] = u.rank;
  return ranks;
}

function runMonthly(refDate) {
  execSync(
    `node ${path.join(SCRIPTS, 'calc_period_scores.js')} --period=monthly --ref-date=${refDate}`,
    { stdio: 'pipe' }
  );
}

function main() {
  let history = { snapshots: [] };
  if (fs.existsSync(RANK_HIST_FILE)) {
    history = JSON.parse(fs.readFileSync(RANK_HIST_FILE, 'utf-8'));
  }

  // Бэкапим оригинальный monthly файл
  const origMonthly = fs.existsSync(path.join(DATA_DIR,'scores_monthly.json'))
    ? fs.readFileSync(path.join(DATA_DIR,'scores_monthly.json')) : null;

  for (const date of MONTHLY_DATES) {
    // Пропускаем если снапшот уже есть
    if (history.snapshots.find(s => s.date === date && s.type === 'monthly')) {
      console.log(`⏭  ${date} — monthly снапшот уже есть, пропускаем`);
      continue;
    }

    console.log(`\n📅 Считаем monthly снапшот для ${date}...`);
    runMonthly(date);

    const snapshot = {
      date,
      type: 'monthly',
      monthly: readRanks('scores_monthly.json'),
    };

    history.snapshots.push(snapshot);
    console.log(`  ✓ monthly: ${Object.keys(snapshot.monthly).length} users`);
  }

  // Восстанавливаем оригинальный файл
  if (origMonthly) fs.writeFileSync(path.join(DATA_DIR,'scores_monthly.json'), origMonthly);

  // Сортируем
  history.snapshots.sort((a, b) => a.date.localeCompare(b.date));

  fs.writeFileSync(RANK_HIST_FILE, JSON.stringify(history, null, 2));

  const jsOut = path.join(DATA_DIR, 'rank_history_data.js');
  fs.writeFileSync(jsOut, `window.RANK_HISTORY_DATA = ${JSON.stringify(history)};`);

  const monthly = history.snapshots.filter(s => s.type === 'monthly');
  const weekly  = history.snapshots.filter(s => s.type !== 'monthly');
  console.log(`\n✅ Готово!`);
  console.log(`   Weekly снапшотов: ${weekly.length}  (${weekly.map(s=>s.date).join(', ')})`);
  console.log(`   Monthly снапшотов: ${monthly.length} (${monthly.map(s=>s.date).join(', ')})`);
}

main();
