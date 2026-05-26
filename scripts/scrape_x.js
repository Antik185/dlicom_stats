/**
 * Парсер X-статистики через SocialData API.
 * Эндпоинт: POST /twitter/tweets-by-ids — чанки по BATCH_SIZE, без параллелизма.
 *
 * Использование:
 *   set SOCIALDATA_KEY=ваш_ключ  (Windows)
 *   node scripts/scrape_x.js
 *   node scripts/scrape_x.js --resume
 *   node scripts/scrape_x.js --resume --retry-errors
 *   node scripts/scrape_x.js --limit=5   (тест — первые N постов)
 *
 * --resume         пропускает уже сохранённые твиты (errors НЕ перезапрашиваются)
 * --retry-errors   дополнительно ретраит записи с error:true
 * --batch          твитов в одном запросе (макс. 100, по умолч. 10)
 * --limit          обработать только первые N постов (для проверки)
 */

const fs   = require('fs');
const path = require('path');

const X_LINKS_FILE = path.join(__dirname, '..', 'data', 'x_links.json');
const OUT_FILE     = path.join(__dirname, '..', 'data', 'x_stats.json');

// ── Конфигурация ───────────────────────────────────────────────
const API_KEY = process.env.SOCIALDATA_KEY
  || process.argv.find(a => a.startsWith('--key='))?.split('=').slice(1).join('=')
  || '4948|CQ4cozl2G0GCVVLZhRhfXsv9DMHzjPHnL4aE7mK9d7093fab';

const BATCH_SIZE   = Math.min(100, parseInt(
  process.argv.find(a => a.startsWith('--batch='))?.split('=')[1] || '10'
));
const RESUME       = process.argv.includes('--resume');
const RETRY_ERRORS = process.argv.includes('--retry-errors');
const LIMIT        = parseInt(
  process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0'
);

const BASE_URL         = 'https://api.socialdata.tools';
const EXCLUDED_HANDLES = new Set(['dlicomapp']);
const RETRY_DELAY      = 5000;   // задержка при 429
const MAX_RETRIES      = 3;
const CHUNK_DELAY_MS   = 1000;   // пауза между батчами
const FETCH_TIMEOUT    = 30000;  // таймаут запроса (мс)

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── API-запрос батчем ──────────────────────────────────────────
async function fetchBatch(ids, attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  let res;
  try {
    res = await fetch(`${BASE_URL}/twitter/tweets-by-ids`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'Connection':    'close',
      },
      body: JSON.stringify({ ids }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error(`Timeout ${FETCH_TIMEOUT / 1000}s`);
    throw err;
  }
  clearTimeout(timer);

  if (res.status === 429) {
    const wait = RETRY_DELAY * attempt;
    console.warn(`\n  ⚠ Rate limit, ждём ${wait / 1000}с...`);
    await sleep(wait);
    if (attempt < MAX_RETRIES) return fetchBatch(ids, attempt + 1);
    throw new Error('Rate limit exceeded after retries');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${text.slice(0, 120)}`);
  }

  return res.json();
}

// ── Fallback: одиночный запрос GET /twitter/tweets/:id ─────────
// Батч-эндпоинт тихо игнорирует новые large-ID твиты (2025+).
// Для таких случаев используем single endpoint.
async function fetchSingle(id, attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  let res;
  try {
    res = await fetch(`${BASE_URL}/twitter/tweets/${id}`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Accept':        'application/json',
        'Connection':    'close',
      },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error(`Timeout single ${FETCH_TIMEOUT / 1000}s`);
    throw err;
  }
  clearTimeout(timer);

  if (res.status === 404) return null;   // твит удалён / приватный

  if (res.status === 429) {
    const wait = RETRY_DELAY * attempt;
    await sleep(wait);
    if (attempt < MAX_RETRIES) return fetchSingle(id, attempt + 1);
    throw new Error('Rate limit exceeded after retries (single)');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${text.slice(0, 120)}`);
  }

  return res.json();
}

// ── Парсинг ответа ─────────────────────────────────────────────
function parseTweet(tweet) {
  if (!tweet) return null;

  const views =
    parseInt(tweet.views?.count || tweet.views_count || tweet.impression_count || tweet.view_count || 0);
  const likes    = tweet.favorite_count || tweet.like_count    || 0;
  const reposts  = (tweet.retweet_count || 0) + (tweet.quote_count || 0);
  const comments = tweet.reply_count    || tweet.replies_count || 0;

  const twitterHandle =
    tweet.user?.screen_name   ||
    tweet.author?.userName    ||
    tweet.author?.screen_name ||
    null;

  return { views, likes, reposts, comments, twitterHandle };
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  if (!API_KEY) {
    console.error('❌ Укажи API-ключ: set SOCIALDATA_KEY=xxxxxxx  или  --key=xxxxxxx');
    process.exit(1);
  }

  const xLinks = JSON.parse(fs.readFileSync(X_LINKS_FILE, 'utf-8'));

  // Собираем все уникальные посты
  const allPostsMap = {};
  for (const [discordName, data] of Object.entries(xLinks)) {
    for (const post of data.posts) {
      if (post.handle && EXCLUDED_HANDLES.has(post.handle.toLowerCase())) continue;
      if (!allPostsMap[post.id]) {
        allPostsMap[post.id] = { handle: post.handle || null, discordName };
      }
    }
  }

  // --resume: загружаем существующие
  let existing = {};
  if (RESUME && fs.existsSync(OUT_FILE)) {
    existing = JSON.parse(fs.readFileSync(OUT_FILE, 'utf-8'));
    const errored   = Object.values(existing).filter(v => v.error).length;
    const notFoundC = Object.values(existing).filter(v => v.notFound).length;
    console.log(`↩ Resume: уже сохранено ${Object.keys(existing).length} записей`);
    console.log(`   OK: ${Object.keys(existing).length - errored - notFoundC} | NotFound: ${notFoundC} | Error: ${errored}${RETRY_ERRORS ? ' (ретраим)' : ' (пропускаем)'}`);
  }

  const allIds = Object.keys(allPostsMap);

  // Фильтруем: пропускаем уже успешные (и notFound); errors — только при --retry-errors
  let toFetchIds;
  if (RESUME) {
    toFetchIds = allIds.filter(id => {
      const e = existing[id];
      if (!e) return true;            // новый — берём
      if (e.error && RETRY_ERRORS) return true;  // error + явный ретрай
      return false;                   // всё остальное — пропускаем
    });
  } else {
    toFetchIds = allIds;
  }

  if (LIMIT > 0) {
    toFetchIds = toFetchIds.slice(0, LIMIT);
    console.log(`🧪 Тест-режим: берём первые ${LIMIT} постов`);
  }

  // Разбиваем на батчи
  const batches = [];
  for (let i = 0; i < toFetchIds.length; i += BATCH_SIZE) {
    batches.push(toFetchIds.slice(i, i + BATCH_SIZE));
  }

  console.log(`SocialData API | ключ: ${API_KEY.slice(0, 8)}...`);
  console.log(`Твитов всего: ${allIds.length} | Загружаем: ${toFetchIds.length}`);
  console.log(`Батчей: ${batches.length} × до ${BATCH_SIZE} | Последовательно (пауза ${CHUNK_DELAY_MS}мс, таймаут ${FETCH_TIMEOUT / 1000}с)\n`);

  const stats  = { ...existing };
  let errors   = 0;
  let notFound = 0;
  let success  = 0;

  for (let i = 0; i < batches.length; i++) {
    const batchIds = batches[i];
    process.stdout.write(`  Батч ${i + 1}/${batches.length} (${batchIds.length} твитов)...`);

    try {
      const json = await fetchBatch(batchIds);

      // Ответ: массив, { data: [] } или { tweets: [] }
      const tweets = Array.isArray(json)        ? json
        : Array.isArray(json?.data)   ? json.data
        : Array.isArray(json?.tweets) ? json.tweets
        : [];

      const byId = {};
      for (const t of tweets) {
        const id = t.id_str || t.id || String(t.rest_id);
        byId[id] = t;
      }

      let batchOk = 0;
      const missedByBatch = [];

      for (const id of batchIds) {
        const parsed         = parseTweet(byId[id]);
        const resolvedHandle = allPostsMap[id].handle || parsed?.twitterHandle || null;
        if (parsed) {
          const { twitterHandle, ...metrics } = parsed;
          stats[id] = { ...metrics, handle: resolvedHandle, id };
          batchOk++;
          success++;
        } else {
          missedByBatch.push(id);
        }
      }

      // Fallback: пробуем single-endpoint для пропущенных батчем
      let singleOk = 0;
      for (const id of missedByBatch) {
        const resolvedHandle = allPostsMap[id].handle || null;
        try {
          await sleep(300);
          const tweet  = await fetchSingle(id);
          const parsed = parseTweet(tweet);
          if (parsed) {
            const { twitterHandle, ...metrics } = parsed;
            stats[id] = { ...metrics, handle: resolvedHandle || parsed.twitterHandle || null, id };
            singleOk++;
            success++;
          } else {
            stats[id] = { views: 0, likes: 0, reposts: 0, comments: 0, handle: resolvedHandle, id, notFound: true };
            notFound++;
          }
        } catch (err) {
          stats[id] = { views: 0, likes: 0, reposts: 0, comments: 0, handle: resolvedHandle, id, error: true, errorMsg: err.message };
          errors++;
        }
      }

      const fallbackNote = missedByBatch.length ? ` +single:${singleOk}/${missedByBatch.length}` : '';
      process.stdout.write(` ✓ batch:${batchOk}/${batchIds.length}${fallbackNote}\n`);
    } catch (err) {
      process.stdout.write(` ✗ ${err.message}\n`);
      errors++;
      for (const id of batchIds) {
        stats[id] = { views: 0, likes: 0, reposts: 0, comments: 0, handle: allPostsMap[id].handle || null, id, error: true };
      }
    }

    // Пауза между батчами (кроме последнего)
    if (i < batches.length - 1) await sleep(CHUNK_DELAY_MS);
  }

  // Сохраняем
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(stats, null, 2));

  console.log(`\n✅ Готово!`);
  console.log(`   Успешно    : ${success}`);
  console.log(`   Не найдено : ${notFound}`);
  console.log(`   Ошибки     : ${errors}`);
  if (LIMIT > 0) {
    console.log(`\n⚠ Тест-режим: загружено только ${toFetchIds.length} постов.`);
    console.log(`  Для полного прохода: node scripts/scrape_x.js --resume`);
  }
  console.log(`Сохранено: ${OUT_FILE}`);
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });
