/**
 * Забирает ТЕКСТ X-постов (full_text) через SocialData API.
 * Статы (views/likes/...) уже лежат в x_stats.json — здесь только текст.
 *
 * Результат: data/x_posts.json
 *   { tweetId: { text, handle, discordName } }
 *
 * Использование:
 *   node scripts/scrape_x_posts.js                 — полный проход
 *   node scripts/scrape_x_posts.js --resume        — пропустить уже забранные
 *   node scripts/scrape_x_posts.js --limit=20      — тест на первых N
 *   node scripts/scrape_x_posts.js --batch=10      — размер батча
 */

const fs   = require('fs');
const path = require('path');

const X_LINKS_FILE = path.join(__dirname, '..', 'data', 'x_links.json');
const OUT_FILE     = path.join(__dirname, '..', 'data', 'x_posts.json');

const API_KEY = process.env.SOCIALDATA_KEY
  || process.argv.find(a => a.startsWith('--key='))?.split('=').slice(1).join('=')
  || '4948|CQ4cozl2G0GCVVLZhRhfXsv9DMHzjPHnL4aE7mK9d7093fab';

const BATCH_SIZE = Math.min(100, parseInt(process.argv.find(a => a.startsWith('--batch='))?.split('=')[1] || '10'));
const RESUME     = process.argv.includes('--resume');
const LIMIT      = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0');

const BASE_URL       = 'https://api.socialdata.tools';
const EXCLUDED       = new Set(['dlicomapp', 'dlicom']);
const RETRY_DELAY    = 5000;
const MAX_RETRIES    = 3;
const CHUNK_DELAY_MS = 1000;
const FETCH_TIMEOUT  = 30000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function getText(t) {
  if (!t) return null;
  return t.full_text || t.text || t.tweet?.full_text || null;
}

async function fetchBatch(ids, attempt = 1) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  let res;
  try {
    res = await fetch(`${BASE_URL}/twitter/tweets-by-ids`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json', 'Accept': 'application/json', 'Connection': 'close' },
      body: JSON.stringify({ ids }),
      signal: ctrl.signal,
    });
  } catch (err) { clearTimeout(timer); if (err.name === 'AbortError') throw new Error('Timeout'); throw err; }
  clearTimeout(timer);
  if (res.status === 429) { await sleep(RETRY_DELAY * attempt); if (attempt < MAX_RETRIES) return fetchBatch(ids, attempt + 1); throw new Error('Rate limit'); }
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

async function fetchSingle(id) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  let res;
  try {
    res = await fetch(`${BASE_URL}/twitter/tweets/${id}`, {
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json', 'Connection': 'close' },
      signal: ctrl.signal,
    });
  } catch (err) { clearTimeout(timer); if (err.name === 'AbortError') throw new Error('Timeout single'); throw err; }
  clearTimeout(timer);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

async function main() {
  const xLinks = JSON.parse(fs.readFileSync(X_LINKS_FILE, 'utf-8'));

  // собираем все посты: id -> { handle, discordName }
  const allPosts = {};
  for (const [discordName, data] of Object.entries(xLinks)) {
    for (const p of (data.posts || [])) {
      if (p.handle && EXCLUDED.has(p.handle.toLowerCase())) continue;
      if (!allPosts[p.id]) allPosts[p.id] = { handle: p.handle || null, discordName };
    }
  }

  let existing = {};
  if (RESUME && fs.existsSync(OUT_FILE)) {
    existing = JSON.parse(fs.readFileSync(OUT_FILE, 'utf-8'));
    console.log(`↩ Resume: уже сохранено ${Object.keys(existing).length} текстов`);
  }

  const allIds = Object.keys(allPosts);
  let toFetch = RESUME ? allIds.filter(id => !existing[id]) : allIds;
  if (LIMIT > 0) { toFetch = toFetch.slice(0, LIMIT); console.log(`🧪 Тест: первые ${LIMIT}`); }

  const batches = [];
  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) batches.push(toFetch.slice(i, i + BATCH_SIZE));

  console.log(`Постов всего: ${allIds.length} | забираем текст: ${toFetch.length} | батчей: ${batches.length}`);

  const out = { ...existing };
  let ok = 0, empty = 0, errors = 0;

  for (let i = 0; i < batches.length; i++) {
    const ids = batches[i];
    process.stdout.write(`  Батч ${i + 1}/${batches.length}...`);
    try {
      const json = await fetchBatch(ids);
      const tweets = Array.isArray(json) ? json : Array.isArray(json?.tweets) ? json.tweets : Array.isArray(json?.data) ? json.data : [];
      const byId = {};
      for (const t of tweets) byId[t.id_str || String(t.id)] = t;

      const missed = [];
      for (const id of ids) {
        const txt = getText(byId[id]);
        if (txt != null) { out[id] = { text: txt, handle: allPosts[id].handle, discordName: allPosts[id].discordName }; ok++; }
        else missed.push(id);
      }
      // single fallback
      let sOk = 0;
      for (const id of missed) {
        try {
          await sleep(300);
          const txt = getText(await fetchSingle(id));
          if (txt != null) { out[id] = { text: txt, handle: allPosts[id].handle, discordName: allPosts[id].discordName }; ok++; sOk++; }
          else empty++;
        } catch { errors++; }
      }
      process.stdout.write(` ✓ batch:${ids.length - missed.length}${missed.length ? ` +single:${sOk}/${missed.length}` : ''}\n`);
    } catch (err) {
      process.stdout.write(` ✗ ${err.message}\n`);
      errors += ids.length;
    }
    if (i < batches.length - 1) await sleep(CHUNK_DELAY_MS);
    // периодически сохраняем прогресс
    if (i % 25 === 24) fs.writeFileSync(OUT_FILE, JSON.stringify(out));
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
  console.log(`\n✅ Готово! Текстов: ${ok} | пустых: ${empty} | ошибок: ${errors}`);
  console.log(`Сохранено: ${OUT_FILE}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
