/**
 * Парсер X-статистики через SocialData API.
 * Эндпоинт: POST /twitter/tweets  — до 100 твитов за запрос.
 *
 * Использование:
 *   set SOCIALDATA_KEY=ваш_ключ  (Windows)
 *   node scripts/scrape_x.js
 *   node scripts/scrape_x.js --concurrency=5 --batch=100 --resume
 *
 * --resume      пропускает уже сохранённые твиты
 * --concurrency кол-во параллельных запросов (по умолч. 5)
 * --batch       твитов в одном запросе (макс. 100, по умолч. 100)
 */

const fs   = require('fs');
const path = require('path');

const X_LINKS_FILE = path.join(__dirname, '..', 'data', 'x_links.json');
const OUT_FILE     = path.join(__dirname, '..', 'data', 'x_stats.json');

// ── Конфигурация ───────────────────────────────────────────────
const API_KEY = process.env.SOCIALDATA_KEY
  || process.argv.find(a => a.startsWith('--key='))?.split('=').slice(1).join('=')
  || '8101|7WAkxO5sFiRsL8gRlXybAM9SXjDRXYeL8LOQg8BW21860fd5';

const CONCURRENCY = parseInt(
  process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '5'
);
const BATCH_SIZE  = Math.min(100, parseInt(
  process.argv.find(a => a.startsWith('--batch='))?.split('=')[1] || '100'
));
const RESUME      = process.argv.includes('--resume');

const BASE_URL    = 'https://api.socialdata.tools';
const EXCLUDED_HANDLES = new Set(['dlicomapp']); // X-аккаунты которые не считаем
const RETRY_DELAY = 3000;
const MAX_RETRIES = 3;

// ── Семафор ────────────────────────────────────────────────────
class Semaphore {
  constructor(n) { this.n = n; this.queue = []; }
  acquire() { return new Promise(r => this.n > 0 ? (this.n--, r()) : this.queue.push(r)); }
  release() { this.queue.length > 0 ? this.queue.shift()() : this.n++; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── API-запрос ─────────────────────────────────────────────────
async function fetchBatch(ids, attempt = 1) {
  const res = await fetch(`${BASE_URL}/twitter/tweets-by-ids`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ ids }),
  });

  if (res.status === 429) {
    const wait = RETRY_DELAY * attempt;
    console.warn(`\n  ⚠ Rate limit, ждём ${wait/1000}с...`);
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

// ── Парсинг ответа ─────────────────────────────────────────────
// SocialData возвращает объекты в Twitter API v1.1 формате
function parseTweet(tweet) {
  if (!tweet) return null;

  // Метрики могут быть в разных полях в зависимости от версии API
  const views =
    parseInt(tweet.views?.count || tweet.views_count || tweet.impression_count || tweet.view_count || 0);
  const likes    = tweet.favorite_count    || tweet.like_count    || 0;
  const reposts  = (tweet.retweet_count    || 0) + (tweet.quote_count || 0);
  const comments = tweet.reply_count       || tweet.replies_count  || 0;

  return { views, likes, reposts, comments };
}

// ── Прогресс-бар ───────────────────────────────────────────────
function bar(done, total, errors) {
  const pct    = total > 0 ? Math.round((done / total) * 100) : 0;
  const filled = Math.round(pct / 2);
  const b      = '█'.repeat(filled) + '░'.repeat(50 - filled);
  process.stdout.write(`\r  [${b}] ${pct}% — батч ${done}/${total}, ошибок: ${errors}`);
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  if (!API_KEY) {
    console.error('❌ Укажи API-ключ: set SOCIALDATA_KEY=xxxxxxx  или  --key=xxxxxxx');
    process.exit(1);
  }

  const xLinks = JSON.parse(fs.readFileSync(X_LINKS_FILE, 'utf-8'));

  // Собираем все уникальные ID
  const allPostsMap = {}; // id -> { handle, discordName }
  for (const [discordName, data] of Object.entries(xLinks)) {
    for (const post of data.posts) {
      if (EXCLUDED_HANDLES.has(post.handle.toLowerCase())) continue;
      if (!allPostsMap[post.id]) {
        allPostsMap[post.id] = { handle: post.handle, discordName };
      }
    }
  }

  // Загружаем уже сохранённые (--resume)
  let existing = {};
  if (RESUME && fs.existsSync(OUT_FILE)) {
    existing = JSON.parse(fs.readFileSync(OUT_FILE, 'utf-8'));
    console.log(`↩ Resume: уже сохранено ${Object.keys(existing).length} твитов`);
  }

  const allIds    = Object.keys(allPostsMap);
  const toFetchIds = RESUME ? allIds.filter(id => !existing[id]) : allIds;

  // Разбиваем на батчи по BATCH_SIZE
  const batches = [];
  for (let i = 0; i < toFetchIds.length; i += BATCH_SIZE) {
    batches.push(toFetchIds.slice(i, i + BATCH_SIZE));
  }

  console.log(`SocialData API | ключ: ${API_KEY.slice(0,8)}...`);
  console.log(`Твитов всего: ${allIds.length} | Загружаем: ${toFetchIds.length}`);
  console.log(`Батчей: ${batches.length} × до ${BATCH_SIZE} | Параллельность: ${CONCURRENCY}\n`);

  const stats  = { ...existing };
  const sem    = new Semaphore(CONCURRENCY);
  let doneBatches = 0;
  let errors      = 0;

  const tasks = batches.map((batchIds) => async () => {
    await sem.acquire();
    try {
      let json;
      try {
        json = await fetchBatch(batchIds);
      } catch (err) {
        console.warn(`\n  ✗ Батч из ${batchIds.length} твитов: ${err.message}`);
        errors++;
        // Записываем как ошибки, чтобы --resume их пропустил при следующем запуске
        for (const id of batchIds) {
          stats[id] = { views:0, likes:0, reposts:0, comments:0, handle: allPostsMap[id].handle, id, error: true };
        }
        return;
      }

      // Ответ может быть массивом или объектом { data: [...] }
      const tweets = Array.isArray(json) ? json
        : Array.isArray(json?.data) ? json.data
        : Array.isArray(json?.tweets) ? json.tweets
        : [];

      // Индексируем по id
      const byId = {};
      for (const t of tweets) {
        const id = t.id_str || t.id || String(t.rest_id);
        byId[id] = t;
      }

      for (const id of batchIds) {
        const parsed = parseTweet(byId[id]);
        if (parsed) {
          stats[id] = { ...parsed, handle: allPostsMap[id].handle, id };
        } else {
          stats[id] = { views:0, likes:0, reposts:0, comments:0, handle: allPostsMap[id].handle, id, notFound: true };
        }
      }
    } finally {
      doneBatches++;
      bar(doneBatches, batches.length, errors);
      sem.release();
    }
  });

  await Promise.all(tasks.map(t => t()));
  console.log('\n');

  // Сохраняем
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(stats, null, 2));

  const ok      = Object.values(stats).filter(s => !s.error && !s.notFound).length;
  const errored = Object.values(stats).filter(s => s.error).length;
  const missing = Object.values(stats).filter(s => s.notFound).length;

  console.log(`✅ Готово!`);
  console.log(`   Успешно  : ${ok}`);
  console.log(`   Не найдено: ${missing}`);
  console.log(`   Ошибки   : ${errored}`);
  console.log(`Сохранено: ${OUT_FILE}`);
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });
