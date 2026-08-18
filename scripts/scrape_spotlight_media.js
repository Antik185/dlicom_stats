/**
 * Тянет медиа (картинки/видео-превью) для постов из spotlight.json.
 * Использует GET /twitter/tweets/:id (single endpoint возвращает entities.media).
 *
 * Результат: data/spotlight_media.json
 * Формат: { [id]: { media: [{type, url, previewUrl?}, ...] } }
 *
 * --resume — пропускает уже забранное (включено по умолчанию)
 */

const fs   = require('fs');
const path = require('path');

const IN_FILE  = path.join(__dirname, '..', 'data', 'spotlight.json');
const OUT_FILE = path.join(__dirname, '..', 'data', 'spotlight_media.json');

const API_KEY = process.env.SOCIALDATA_KEY
  || process.argv.find(a => a.startsWith('--key='))?.split('=').slice(1).join('=')
  || '4948|CQ4cozl2G0GCVVLZhRhfXsv9DMHzjPHnL4aE7mK9d7093fab';

const BASE_URL      = 'https://api.socialdata.tools';
const FETCH_TIMEOUT = 30000;
const DELAY_MS      = 250;
const RETRY_DELAY   = 5000;
const MAX_RETRIES   = 3;
const CONCURRENCY   = Math.max(1, parseInt(
  process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '6',
  10,
) || 6);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchTweet(id, attempt = 1) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  let res;
  try {
    res = await fetch(`${BASE_URL}/twitter/tweets/${id}`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Accept':        'application/json',
        'Connection':    'close',
      },
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('timeout');
    throw err;
  }
  clearTimeout(timer);
  if (res.status === 404) return null;
  if (res.status === 429) {
    await sleep(RETRY_DELAY * attempt);
    if (attempt < MAX_RETRIES) return fetchTweet(id, attempt + 1);
    throw new Error('rate limit');
  }
  if (!res.ok) throw new Error('http ' + res.status);
  return res.json();
}

function extractMedia(tweet) {
  if (!tweet) return null;
  const candidates = [
    tweet.extended_entities?.media,
    tweet.entities?.media,
    tweet.media,
    tweet.quoted_status?.extended_entities?.media,
    tweet.quoted_status?.entities?.media,
    tweet.retweeted_status?.extended_entities?.media,
    tweet.retweeted_status?.entities?.media,
  ];
  const list = candidates.find(c => Array.isArray(c) && c.length) || [];
  if (!list.length) return null;
  const mapped = list.map(m => ({
    type: m.type || 'photo',
    url: m.media_url_https || m.media_url || m.url,
    previewUrl: m.preview_image_url || null,
  })).filter(m => m.url);
  const seen = new Set();
  return mapped.filter(m => seen.has(m.url) ? false : (seen.add(m.url), true));
}

function extractStats(tweet) {
  if (!tweet) return null;
  return {
    views:    parseInt(tweet.views_count || tweet.views?.count || tweet.view_count || 0) || 0,
    likes:    tweet.favorite_count || tweet.like_count || 0,
    reposts:  (tweet.retweet_count || 0) + (tweet.quote_count || 0),
    comments: tweet.reply_count || tweet.replies_count || 0,
    text:     tweet.full_text || tweet.text || null,
    handle:   tweet.user?.screen_name || tweet.author?.userName || tweet.author?.screen_name || null,
  };
}

async function main() {
  const list = JSON.parse(fs.readFileSync(IN_FILE, 'utf-8'));
  let existing = {};
  if (fs.existsSync(OUT_FILE)) {
    existing = JSON.parse(fs.readFileSync(OUT_FILE, 'utf-8'));
    console.log(`↩ Resume: уже сохранено ${Object.keys(existing).length} медиа`);
  }
  const refreshEmpty = process.argv.includes('--refresh-empty');
  const addStats     = process.argv.includes('--add-stats');
  const todo = list.filter(p => {
    const e = existing[p.id];
    if (!e) return true;
    if (refreshEmpty && (e.error || !(e.media && e.media.length))) return true;
    if (addStats && !e.stats) return true;     // нет статов — добиваем
    return false;
  });
  console.log(`Spotlight: всего ${list.length}, нужно ${todo.length}${refreshEmpty ? ' (включая noMedia/error)' : ''}`);

  const out = { ...existing };
  let ok = 0, noMedia = 0, errors = 0;
  let cursor = 0;
  let completed = 0;

  async function worker() {
    while (cursor < todo.length) {
      const { id } = todo[cursor++];
      try {
        const tweet = await fetchTweet(id);
        const media = extractMedia(tweet);
        const stats = extractStats(tweet);
        if (media && media.length) { out[id] = { media, stats }; ok++; }
        else { out[id] = { media: [], stats }; noMedia++; }
      } catch (e) {
        out[id] = { error: e.message };
        errors++;
      }
      completed++;
      if (completed % 20 === 0) {
        process.stdout.write(`\r  ${completed}/${todo.length} ok=${ok} noMedia=${noMedia} err=${errors}`);
        fs.writeFileSync(OUT_FILE, JSON.stringify(out));
      }
      await sleep(DELAY_MS);
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(CONCURRENCY, todo.length) },
    () => worker(),
  ));

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
  console.log(`\n✅ Готово! С медиа: ${ok}, без медиа: ${noMedia}, ошибок: ${errors}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
