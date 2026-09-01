/**
 * Запускает весь пайплайн:
 *   1. count_dc.js              — считает DC-сообщения
 *   2. extract_x.js             — извлекает X-ссылки
 *   3. scrape_x.js              — парсит X-статистику (можно пропустить с --skip-x)
 *   3b. scrape_x_posts.js       — тексты X-постов → x_posts.json (только новые, --resume)
 *   4. calc_scores.js           — all-time очки
 *   5. calc_period_scores.js    — weekly и monthly очки
 *   6. save_rank_snapshot.js    — снепшот рангов
 *   7. calc_badges.js           — бейджи
 *   8. calc_analytics.js        — community-аналитика (overview/channels/heatmap)
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
const skipX     = process.argv.includes('--skip-x');
const skipTexts = process.argv.includes('--skip-texts');   // пропустить только scrape_x_posts (тексты)
const batchArg  = process.argv.find(a => a.startsWith('--batch=')) || '--batch=10';
const fromDateArg = process.argv.find(a => a.startsWith('--from-date=')) || '';
const toDateArg   = process.argv.find(a => a.startsWith('--to-date=')) || '';
const dateRangeArgs = [fromDateArg, toDateArg].filter(Boolean).join(' ');

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

function run(script, extraArgs = '', nodeFlags = '') {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`▶ ${script}${extraArgs ? ' ' + extraArgs : ''}`);
  console.log('═'.repeat(60));
  execSync(`node ${nodeFlags} ${path.join(SCRIPTS, script)} ${extraArgs}`, { stdio: 'inherit' });
}

const start = Date.now();

run('count_dc.js');
run('extract_x.js');
if (!skipX) {
  run('scrape_x.js', `${batchArg} --resume ${dateRangeArgs}`.trim());
  if (!skipTexts) run('scrape_x_posts.js', `${batchArg} --resume`);   // тексты постов (только новые)
  else console.log('\n⚠ Пропускаем scrape_x_posts.js (--skip-texts)');
} else {
  console.log('\n⚠ Пропускаем scrape_x.js + scrape_x_posts.js (--skip-x)');
}
run('calc_scores.js', `--ref-date=${refDate}`);
run('calc_period_scores.js', `--period=weekly  --ref-date=${refDate}`);
run('calc_period_scores.js', `--period=monthly --ref-date=${refDate}`);
run('save_rank_snapshot.js', `--ref-date=${refDate}`);
run('extract_current_roles.js');
run('calc_badges.js');
run('build_suspicious_x.js');
run('build_user_regions.js');
run('calc_analytics.js', `--ref-date=${refDate}`, '--max-old-space-size=8192');
run('extract_spotlight.js');
run('scrape_spotlight_media.js', '--add-stats');
run('build_spotlight_data.js');

const elapsed = ((Date.now() - start) / 1000).toFixed(0);
console.log(`\n${'═'.repeat(60)}`);
console.log(`✅ Всё готово за ${elapsed}с. Данные в папке data/`);
