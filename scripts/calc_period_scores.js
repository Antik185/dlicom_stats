/**
 * Считает скоры за период (monthly / weekly) через фильтрацию по дате.
 * - Discord: читает JSON-выгрузки, фильтрует сообщения по timestamp
 * - X/Twitter: декодирует дату из snowflake-ID твита
 *
 * Использование:
 *   node scripts/calc_period_scores.js --period=monthly
 *     → с 1-го числа текущего календарного месяца по текущую дату
 *
 *   node scripts/calc_period_scores.js --period=weekly
 *     → последние 7 дней от текущей даты
 *
 *   node scripts/calc_period_scores.js --period=monthly --ref-date=2026-05-12
 *     → с 1 мая 2026 по 12 мая 2026
 *
 *   node scripts/calc_period_scores.js --period=weekly --ref-date=2026-05-12
 *     → 5–12 мая 2026 (7 дней до 12-го включительно)
 */

const fs       = require('fs');
const readline = require('readline');
const path     = require('path');

const JSON_DIR    = path.join(__dirname, '..', 'json');
const DATA_DIR    = path.join(__dirname, '..', 'data');
const X_LINKS     = path.join(DATA_DIR, 'x_links.json');
const X_STATS     = path.join(DATA_DIR, 'x_stats.json');

// ── CLI ───────────────────────────────────────────────────────
const arg = process.argv.find(a => a.startsWith('--period='));
const period = arg ? arg.slice(9) : 'monthly';

// Опциональная дата конца периода (последняя дата выгрузки).
// Если не указана — используется текущая дата.
const refArg  = process.argv.find(a => a.startsWith('--ref-date='));
const refDate = refArg ? new Date(refArg.slice(11) + 'T23:59:59.999') : new Date();
const refMs   = refDate.getTime();

// Граница начала периода
let cutoff, cutoffDate, periodDesc;

if (period === 'monthly') {
  // Календарный месяц: с 1-го числа того же месяца, что и refDate
  cutoffDate  = new Date(refDate.getFullYear(), refDate.getMonth(), 1, 0, 0, 0, 0);
  cutoff      = cutoffDate.getTime();
  periodDesc  = `${cutoffDate.toISOString().slice(0, 10)} – ${refDate.toISOString().slice(0, 10)}`;
} else {
  // Неделя: последние 7 дней (или --days=N) от refDate
  const daysArg = process.argv.find(a => a.startsWith('--days='));
  const DAYS    = daysArg ? parseInt(daysArg.slice(7)) : 7;
  cutoff        = refMs - DAYS * 24 * 60 * 60 * 1000;
  cutoffDate    = new Date(cutoff);
  periodDesc    = `${cutoffDate.toISOString().slice(0, 10)} – ${refDate.toISOString().slice(0, 10)} (${DAYS} дней)`;
}

console.log(`Период: ${period} (${periodDesc})\n`);

// ── Twitter snowflake → дата ──────────────────────────────────
const TWITTER_EPOCH = 1288834974657;
function tweetIdToMs(id) {
  try { return Number(BigInt(id) >> 22n) + TWITTER_EPOCH; }
  catch { return 0; }
}

// ── Unicode decode ────────────────────────────────────────────
function decodeJsonStr(s) {
  return s.replace(/\\u([0-9a-fA-F]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// ── Потоковый парсер Discord-файла с фильтром по дате ─────────
function countDcPeriod(filePath) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    const counts    = {};
    const nicknames = {};
    const avatars   = {};

    let inAuthor      = false;
    let authorDepth   = 0;
    let pendingType   = null;
    let pendingTs     = null;   // timestamp текущего сообщения
    let msgType       = null;
    let msgTs         = null;
    let name = null, nickname = null, avatar = null, isBot = false;

    rl.on('line', (line) => {
      const t = line.trim();

      if (!inAuthor) {
        // Тип сообщения
        if (t.startsWith('"type":')) {
          const v = t.replace('"type":', '').trim().replace(/[",\s]/g, '');
          pendingType = (v === 'Default' || v === 'Reply') ? v : null;
        }
        // Timestamp сообщения
        if (t.startsWith('"timestamp":')) {
          const m = t.match(/"timestamp":\s*"([^"]+)"/);
          if (m) pendingTs = m[1];
        }
        // Начало блока author
        if (t === '"author": {') {
          inAuthor    = true;
          authorDepth = 1;
          msgType     = pendingType;
          msgTs       = pendingTs;
          name = nickname = avatar = null;
          isBot = false;
          return;
        }
        return;
      }

      // Вложенность внутри author
      for (const ch of t) {
        if (ch === '{' || ch === '[') authorDepth++;
        else if (ch === '}' || ch === ']') authorDepth--;
      }

      if (authorDepth === 1) {
        if (t.startsWith('"name":')) {
          const m = t.match(/"name":\s*"((?:[^"\\]|\\.)*)"/);
          if (m) name = decodeJsonStr(m[1]);
        }
        if (t.startsWith('"nickname":')) {
          const m = t.match(/"nickname":\s*"((?:[^"\\]|\\.)*)"/);
          if (m) nickname = decodeJsonStr(m[1]);
        }
        if (t.startsWith('"avatarUrl":')) {
          const m = t.match(/"avatarUrl":\s*"((?:[^"\\]|\\.)*)"/);
          if (m) avatar = decodeJsonStr(m[1]);
        }
        if (t.startsWith('"isBot":')) {
          isBot = t.includes('true');
        }
      }

      if (authorDepth <= 0) {
        inAuthor = false;
        // Применяем date-фильтр
        if (!isBot && name && msgType && msgTs) {
          const ts = new Date(msgTs).getTime();
          if (ts >= cutoff) {
            counts[name] = (counts[name] || 0) + 1;
            if (!nicknames[name] && nickname) nicknames[name] = nickname;
            if (!avatars[name]   && avatar)   avatars[name]   = avatar;
          }
        }
        pendingType = pendingTs = null;
      }
    });

    rl.on('close', () => resolve({ counts, nicknames, avatars }));
  });
}

// Хэндлы X-аккаунтов проекта — их посты не считаются
const X_BLACKLIST = new Set(['dlicomapp', 'dlicom']);

// ── X-скор за период ─────────────────────────────────────────
function calcXPeriod(xLinks, xStats) {
  const result = {};

  for (const [discordName, data] of Object.entries(xLinks)) {
    const filtered = (data.posts || []).filter(p => {
      const ms = tweetIdToMs(p.id);
      if (ms < cutoff) return false;
      // Исключаем посты аккаунтов проекта
      const resolvedHandle = (p.handle || xStats[p.id]?.handle || '').toLowerCase();
      if (X_BLACKLIST.has(resolvedHandle)) return false;
      return true;
    });

    if (!filtered.length) continue;

    let totalViews = 0, totalLikes = 0, totalComments = 0, totalReposts = 0;
    let postCount  = 0;

    for (const post of filtered) {
      const s = xStats[post.id];
      if (!s) continue;
      totalViews    += s.views    || 0;
      totalLikes    += s.likes    || 0;
      totalComments += s.comments || 0;
      totalReposts  += s.reposts  || 0;
      postCount++;
    }

    const rawScore = postCount * 10
      + totalViews    * 0.1
      + totalLikes    * 1
      + totalComments * 3
      + totalReposts  * 3;

    let erPct = 0;
    if (totalViews > 0)
      erPct = ((totalLikes + totalReposts + totalComments) / totalViews) * 100;

    const erMult = Math.min(1 + erPct * 0.1, 1.5);
    const xScore = Math.round(rawScore * erMult * 10) / 10;

    result[discordName] = {
      posts:    postCount,
      views:    totalViews,
      likes:    totalLikes,
      comments: totalComments,
      reposts:  totalReposts,
      erPct:    Math.round(erPct * 100) / 100,
      erMult:   Math.round(erMult * 1000) / 1000,
      rawScore: Math.round(rawScore * 10) / 10,
      xScore,
      xHandle:  (() => {
        for (const p of (data.posts || [])) {
          const h = p.handle || xStats[p.id]?.handle;
          if (h) return h;
        }
        return null;
      })(),
      nickname: data.nickname,
      avatarUrl: data.avatarUrl,
    };
  }
  return result;
}

function findJsonFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findJsonFiles(full));
    else if (entry.name.endsWith('.json')) results.push(full);
  }
  return results;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  // 1. Discord
  const files = findJsonFiles(JSON_DIR);
  console.log(`Читаем ${files.length} Discord-файлов...`);

  const start = Date.now();
  const dcResults = await Promise.all(
    files.map(fp => countDcPeriod(fp)
      .then(r => {
        const n = Object.values(r.counts).reduce((a, b) => a + b, 0);
        console.log(`  ✓ ${path.relative(JSON_DIR, fp)}: ${n} сообщений за период`);
        return r;
      })
    )
  );

  const dcCounts = {}, dcNicks = {}, dcAvatars = {};
  for (const { counts, nicknames, avatars } of dcResults) {
    for (const [u, c] of Object.entries(counts)) {
      dcCounts[u]   = (dcCounts[u] || 0) + c;
      if (!dcNicks[u]   && nicknames[u]) dcNicks[u]   = nicknames[u];
      if (!dcAvatars[u] && avatars[u])   dcAvatars[u] = avatars[u];
    }
  }

  console.log(`  DC итого: ${Object.values(dcCounts).reduce((a,b)=>a+b,0)} сообщений, ${Object.keys(dcCounts).length} юзеров\n`);

  // 2. X
  const xLinks = JSON.parse(fs.readFileSync(X_LINKS, 'utf-8'));
  const xStats = fs.existsSync(path.join(DATA_DIR,'x_stats.json'))
    ? JSON.parse(fs.readFileSync(path.join(DATA_DIR,'x_stats.json'), 'utf-8'))
    : {};

  console.log('Фильтруем X-посты по дате...');
  const xPeriod = calcXPeriod(xLinks, xStats);
  const withX = Object.keys(xPeriod).length;
  console.log(`  X итого: ${withX} пользователей с постами за период\n`);

  // 3. Объединяем
  const allUsers = new Set([...Object.keys(dcCounts), ...Object.keys(xPeriod)]);
  const scores = [];

  for (const username of allUsers) {
    const dcMsg   = dcCounts[username] || 0;
    const dcScore = Math.round(dcMsg * 1 * 10) / 10;
    const xData   = xPeriod[username];
    const xScore  = xData?.xScore || 0;
    const total   = Math.round((dcScore + xScore) * 10) / 10;

    if (total === 0) continue;

    // Мета-данные: предпочитаем X-данные если есть
    const nickname  = xData?.nickname  || dcNicks[username]   || username;
    const avatarUrl = xData?.avatarUrl || dcAvatars[username] || '';
    const xHandle   = xData?.xHandle   || null;

    scores.push({
      username,
      nickname,
      avatarUrl,
      xHandle,
      dcMessages: dcMsg,
      dcScore,
      posts:      xData?.posts    || 0,
      views:      xData?.views    || 0,
      likes:      xData?.likes    || 0,
      comments:   xData?.comments || 0,
      reposts:    xData?.reposts  || 0,
      erPct:      xData?.erPct    || 0,
      erMult:     xData?.erMult   || 1,
      rawScore:   xData?.rawScore || 0,
      xScore,
      totalScore: total,
      tier: null,
    });
  }

  scores.sort((a, b) => b.totalScore - a.totalScore);

  const n   = scores.length;
  const p90 = scores[Math.floor(n * 0.10)]?.totalScore || 0;
  const p99 = scores[Math.floor(n * 0.01)]?.totalScore || 0;

  scores.forEach((s, i) => {
    s.rank       = i + 1;
    s.percentile = Math.round(((n - i - 1) / n) * 100);
    s.tier       = s.totalScore >= p99 ? 't5' : s.totalScore >= p90 ? 't3' : 't1';
  });

  const periodDays = Math.round((refMs - cutoff) / (24 * 60 * 60 * 1000));

  const output = {
    generatedAt: new Date().toISOString(),
    refDate:     refDate.toISOString().slice(0, 10),   // дата последних данных (не дата запуска)
    period,
    days: periodDays,
    cutoffDate: cutoffDate.toISOString(),
    totalUsers: n,
    thresholds: { myth: Math.round(p90), legendary: Math.round(p99) },
    users: scores,
  };

  const outFile = path.join(DATA_DIR, `scores_${period}.json`);
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2));

  const jsOut = path.join(DATA_DIR, `scores_${period}_data.js`);
  fs.writeFileSync(jsOut, `window.SCORES_${period.toUpperCase()}_DATA = ${JSON.stringify(output)};`);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`✅ Готово за ${elapsed}с!`);
  console.log(`   Пользователей за период : ${n}`);
  if (n > 0) console.log(`   Топ-1 (${scores[0].nickname}): ${scores[0].totalScore} pts`);
  console.log(`   Порог Tier A: ${Math.round(p90)}, Tier S: ${Math.round(p99)}`);
  console.log(`Сохранено: ${outFile}`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
