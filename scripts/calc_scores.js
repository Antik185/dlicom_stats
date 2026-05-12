/**
 * Считает итоговые очки для каждого пользователя.
 * Читает: data/dc_stats.json + data/x_links.json + data/x_stats.json
 * Пишет:  data/scores.json
 *
 * Формула:
 *   DC_score  = messages × 1
 *   rawScore  = posts×10 + views×0.1 + likes×1 + comments×3 + reposts×3
 *   ER%       = (likes + reposts + comments) / views × 100
 *   erMult    = min(1 + ER% × 0.1, 1.5)
 *   X_score   = rawScore × erMult
 *   total     = DC_score + X_score
 */

const fs   = require('fs');
const path = require('path');

const DC_FILE     = path.join(__dirname, '..', 'data', 'dc_stats.json');
const X_LINKS     = path.join(__dirname, '..', 'data', 'x_links.json');
const X_STATS     = path.join(__dirname, '..', 'data', 'x_stats.json');
const OUT_FILE    = path.join(__dirname, '..', 'data', 'scores.json');

function calcXScore(posts, tweetStats) {
  let totalViews = 0, totalLikes = 0, totalComments = 0, totalReposts = 0;
  let postCount = 0;

  for (const post of posts) {
    const s = tweetStats[post.id];
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
  if (totalViews > 0) {
    erPct = ((totalLikes + totalReposts + totalComments) / totalViews) * 100;
  }

  const erMult = Math.min(1 + erPct * 0.1, 1.5);
  const xScore = rawScore * erMult;

  return {
    posts:         postCount,
    views:         totalViews,
    likes:         totalLikes,
    comments:      totalComments,
    reposts:       totalReposts,
    erPct:         Math.round(erPct * 100) / 100,
    erMult:        Math.round(erMult * 1000) / 1000,
    rawScore:      Math.round(rawScore * 10) / 10,
    xScore:        Math.round(xScore * 10) / 10,
  };
}

function determineTier(total, p25, p75) {
  // Тиры определяются по распределению:
  //   t1 (Rare)      — нижние 75%
  //   t3 (Myth)      — 25–75%  → топ 25% → нет, нижние 75% = t1
  // Пока не известны пороги, используем перцентили:
  //   t1 if total >= p25
  //   t3 if total >= p75
  //   t5 if total >= top5%
  // Заглушка: вернём null, заполним после подсчёта всех
  return null;
}

function main() {
  const dcStats  = JSON.parse(fs.readFileSync(DC_FILE, 'utf-8'));
  const xLinks   = JSON.parse(fs.readFileSync(X_LINKS, 'utf-8'));
  const xStats   = fs.existsSync(X_STATS)
    ? JSON.parse(fs.readFileSync(X_STATS, 'utf-8'))
    : {};

  // Объединяем всех пользователей (есть в DC или X)
  const allUsers = new Set([...Object.keys(dcStats), ...Object.keys(xLinks)]);

  const scores = [];

  for (const username of allUsers) {
    const dc = dcStats[username] || { dcMessages: 0, nickname: username, avatarUrl: '' };
    const xData = xLinks[username];

    const dcScore = dc.dcMessages * 1;

    let xResult = { posts:0, views:0, likes:0, comments:0, reposts:0, erPct:0, erMult:1, rawScore:0, xScore:0 };
    if (xData?.posts?.length) {
      xResult = calcXScore(xData.posts, xStats);
    }

    const total = dcScore + xResult.xScore;

    scores.push({
      username,
      nickname:   dc.nickname || xData?.nickname || username,
      avatarUrl:  dc.avatarUrl || xData?.avatarUrl || '',
      xHandle:    xData?.posts?.[0]?.handle || null,
      dcMessages: dc.dcMessages,
      dcScore:    Math.round(dcScore * 10) / 10,
      ...xResult,
      totalScore: Math.round(total * 10) / 10,
      tier:       null, // заполним ниже
    });
  }

  // Сортируем по убыванию totalScore
  scores.sort((a, b) => b.totalScore - a.totalScore);

  // Определяем тиры на основе реального распределения
  const totals = scores.map(s => s.totalScore);
  const n = totals.length;
  const p90 = totals[Math.floor(n * 0.10)] || 0; // топ-10% → Tier A (Mythic)
  const p99 = totals[Math.floor(n * 0.01)] || 0; // топ-1%  → Tier S (Legendary)

  for (const s of scores) {
    if (s.totalScore >= p99)      s.tier = 't5'; // S — Legendary
    else if (s.totalScore >= p90) s.tier = 't3'; // A — Mythic
    else                          s.tier = 't1'; // B — Rare
  }

  // Добавляем ранг и процентиль
  scores.forEach((s, i) => {
    s.rank = i + 1;
    s.percentile = Math.round(((n - i - 1) / n) * 100);
  });

  const output = {
    generatedAt: new Date().toISOString(),
    totalUsers: n,
    thresholds: { myth: Math.round(p90), legendary: Math.round(p99) },
    users: scores,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));

  // JS-файл для прямого открытия index.html без веб-сервера
  const jsOut = path.join(path.dirname(OUT_FILE), 'scores_data.js');
  fs.writeFileSync(jsOut, `window.SCORES_DATA = ${JSON.stringify(output)};`);

  // Статистика
  const tiers = { t1:0, t3:0, t5:0 };
  scores.forEach(s => tiers[s.tier]++);
  const withX = scores.filter(s => s.posts > 0).length;

  console.log(`✅ Scores посчитаны!`);
  console.log(`   Всего пользователей : ${n}`);
  console.log(`   С X-постами         : ${withX}`);
  console.log(`   Rare  (t1)          : ${tiers.t1}`);
  console.log(`   Myth  (t3)          : ${tiers.t3}`);
  console.log(`   Legendary (t5)      : ${tiers.t5}`);
  console.log(`   Порог Tier A (Myth) : ${Math.round(p90)} очков`);
  console.log(`   Порог Tier S (Leg.) : ${Math.round(p99)} очков`);
  console.log(`   Топ-1 (${scores[0].nickname}): ${scores[0].totalScore} очков`);
  console.log(`Сохранено: ${OUT_FILE}`);
}

main();
