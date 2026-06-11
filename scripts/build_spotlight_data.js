/**
 * Собирает финальный spotlight_data.js для фронта.
 * Мёржит:
 *   spotlight.json       → список постов (id, handle, postedAt)
 *   spotlight_media.json → медиа (картинки/видео)
 *   x_stats.json         → likes/views/reposts
 *   x_posts.json         → текст твита
 *   x_links.json         → находим discord-юзера по tweet id
 *   dc_stats.json        → nickname/avatar юзера
 *
 * Результат: data/spotlight_data.js (window.SPOTLIGHT_DATA = {...})
 */

const fs   = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');

const spotlight = JSON.parse(fs.readFileSync(path.join(DATA, 'spotlight.json'), 'utf-8'));
const media     = fs.existsSync(path.join(DATA, 'spotlight_media.json'))
  ? JSON.parse(fs.readFileSync(path.join(DATA, 'spotlight_media.json'), 'utf-8'))
  : {};
const xStats    = JSON.parse(fs.readFileSync(path.join(DATA, 'x_stats.json'), 'utf-8'));
const xPosts    = JSON.parse(fs.readFileSync(path.join(DATA, 'x_posts.json'), 'utf-8'));
const xLinks    = JSON.parse(fs.readFileSync(path.join(DATA, 'x_links.json'), 'utf-8'));
const dcStats   = JSON.parse(fs.readFileSync(path.join(DATA, 'dc_stats.json'), 'utf-8'));

// загружаем алиасы (на случай переименованных юзеров)
let aliases = {};
try {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'aliases.json'), 'utf-8'));
  for (const [k, v] of Object.entries(raw)) if (!k.startsWith('_')) aliases[k] = v;
} catch (_) {}
const resolveAlias = n => aliases[n] || n;

// банлист — забаненных юзеров не показываем в спотлайте
let banned = new Set();
try {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'excluded_users.json'), 'utf-8'));
  banned = new Set(Object.keys(raw).filter(k => !k.startsWith('_')));
} catch (_) {}

// Индекс: tweet id → discord username
const tweetToUser = {};
for (const [discordName, data] of Object.entries(xLinks)) {
  for (const p of (data.posts || [])) {
    if (!tweetToUser[p.id]) tweetToUser[p.id] = discordName;
  }
}

// дедупаем медиа по url (в существующих данных API частенько дублирует фото)
function dedupMedia(arr) {
  const seen = new Set();
  return (arr || []).filter(m => m && m.url && (seen.has(m.url) ? false : (seen.add(m.url), true)));
}

const posts = [];
for (const sp of spotlight) {
  const m  = dedupMedia(media[sp.id]?.media);
  const ss = media[sp.id]?.stats;             // первичный источник статов — из spotlight-фетча
  const xs = xStats[sp.id];                    // fallback
  const s  = ss || xs || {};
  const t  = xPosts[sp.id]?.text || ss?.text || '';
  const rawDiscord = tweetToUser[sp.id];
  const discordName = rawDiscord ? resolveAlias(rawDiscord) : null;
  if (discordName && banned.has(discordName)) continue;   // забаненный автор
  const dc = discordName ? dcStats[discordName] : null;

  posts.push({
    id:          sp.id,
    handle:      sp.handle || s.handle || null,
    postedAt:    sp.postedAt,
    media:       m,
    likes:       s.likes    || 0,
    views:       s.views    || 0,
    reposts:     s.reposts  || 0,
    comments:    s.comments || 0,
    text:        t,
    discordName: discordName || null,
    nickname:    dc?.nickname || null,
    avatarUrl:   dc?.avatarUrl || null,
  });
}

const out = { generatedAt: new Date().toISOString(), total: posts.length, posts };
const outJson = path.join(DATA, 'spotlight_data.json');
const outJs   = path.join(DATA, 'spotlight_data.js');
fs.writeFileSync(outJson, JSON.stringify(out, null, 2));
fs.writeFileSync(outJs,   `window.SPOTLIGHT_DATA = ${JSON.stringify(out)};`);

console.log(`✅ spotlight_data: ${posts.length} постов`);
console.log(`   с медиа:  ${posts.filter(p => p.media.length).length}`);
console.log(`   с автором (DC): ${posts.filter(p => p.discordName).length}`);
console.log(`Файл: ${outJs} (${(fs.statSync(outJs).size/1024).toFixed(0)}KB)`);
