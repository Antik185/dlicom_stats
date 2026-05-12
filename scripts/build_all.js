/**
 * Запускает весь пайплайн:
 *   1. count_dc.js    — считает DC-сообщения
 *   2. extract_x.js   — извлекает X-ссылки
 *   3. scrape_x.js    — парсит X-статистику  (можно пропустить с --skip-x)
 *   4. calc_scores.js — считает итоговые очки
 *
 * Использование:
 *   node scripts/build_all.js
 *   node scripts/build_all.js --skip-x          # без парсинга X
 *   node scripts/build_all.js --concurrency=10  # передаётся в scrape_x
 */

const { execSync } = require('child_process');
const path = require('path');

const SCRIPTS = path.join(__dirname);
const skipX = process.argv.includes('--skip-x');
const concurrencyArg = process.argv.find(a => a.startsWith('--concurrency=')) || '--concurrency=5';

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
run('calc_scores.js');

const elapsed = ((Date.now() - start) / 1000).toFixed(0);
console.log(`\n${'═'.repeat(60)}`);
console.log(`✅ Всё готово за ${elapsed}с. Данные в папке data/`);
