/**
 * Запускает весь пайплайн:
 *   1. count_dc.js              — считает DC-сообщения
 *   2. extract_x.js             — извлекает X-ссылки
 *   3. scrape_x.js              — парсит X-статистику (можно пропустить с --skip-x)
 *   4. calc_scores.js           — all-time очки
 *   5. calc_period_scores.js    — weekly и monthly очки
 *   6. save_rank_snapshot.js    — снепшот рангов
 *
 * Использование:
 *   node scripts/build_all.js --ref-date=2026-05-17
 *   node scripts/build_all.js --ref-date=2026-05-17 --skip-x
 *
 * --ref-date  последний день данных (конец недели/месяца).
 *             Если не указан — используется вчерашняя дата.
 *             Weekly  = ref-date минус 7 дней.
 *             Monthly = 1-е число месяца ref-date по ref-date.
 */

const { execSync } = require('child_process');
const path = require('path');

const SCRIPTS = path.join(__dirname);
const skipX   = process.argv.includes('--skip-x');
const concurrencyArg = process.argv.find(a => a.startsWith('--concurrency=')) || '--concurrency=5';

// Определяем ref-date: явный аргумент или вчера
const refArg  = process.argv.find(a => a.startsWith('--ref-date='));
let refDate;
if (refArg) {
  refDate = refArg.slice(11);
} else {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  refDate = d.toISOString().slice(0, 10);
}
console.log(`📅 Ref-date: ${refDate}`);

function run(script, extraArgs = '') {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`▶ ${script}${extraArgs ? ' ' + extraArgs : ''}`);
  console.log('═'.repeat(60));
  execSync(`node ${path.join(SCRIPTS, script)} ${extraArgs}`, { stdio: 'inherit' });
}

const start = Date.now();

run('count_dc.js');
run('extract_x.js');
if (!skipX) {
  run('scrape_x.js', `${concurrencyArg} --resume`);
} else {
  console.log('\n⚠ Пропускаем scrape_x.js (--skip-x)');
}
run('calc_scores.js', `--ref-date=${refDate}`);
run('calc_period_scores.js', `--period=weekly  --ref-date=${refDate}`);
run('calc_period_scores.js', `--period=monthly --ref-date=${refDate}`);
run('save_rank_snapshot.js', `--ref-date=${refDate}`);
run('calc_badges.js');

const elapsed = ((Date.now() - start) / 1000).toFixed(0);
console.log(`\n${'═'.repeat(60)}`);
console.log(`✅ Всё готово за ${elapsed}с. Данные в папке data/`);
