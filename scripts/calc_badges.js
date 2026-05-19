/**
 * Вычисляет и накапливает бейджи для всех пользователей.
 * Бейджи НЕ пропадают — только добавляются.
 *
 * Использование:
 *   node scripts/calc_badges.js
 *
 * Источники данных:
 *   - data/scores.json          → очки, ранги, DC-сообщения, посты
 *   - json/*.json               → Discord-роли, первое сообщение
 *   - data/rank_history.json    → исторические ранги (#1, Podium, Top10)
 *   - data/badges.json          → существующие бейджи (накопленные)
 */

const fs       = require('fs');
const readline = require('readline');
const path     = require('path');

const DATA_DIR       = path.join(__dirname, '..', 'data');
const JSON_DIR       = path.join(__dirname, '..', 'json');
const SCORES_FILE    = path.join(DATA_DIR, 'scores.json');
const BADGES_FILE    = path.join(DATA_DIR, 'badges.json');
const RANK_HIST_FILE = path.join(DATA_DIR, 'rank_history.json');

// Discord роли → ID бейджа
const ROLE_BADGE_MAP = {
  'Community Team':  'community-team',
  'Regional Lead':   'regional-lead',
  'Regional Helper': 'regional-helper',
  'Ambassador':      'ambassador',
  'DCO':             'dco',
  'Dcoded':          'dcoded',
  'Dliever':         'dliever',
  'OG':              'og',
};

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

function decodeJsonStr(s) {
  return s.replace(/\\u([0-9a-fA-F]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// ── Потоковое сканирование Discord-файлов ─────────────────────
// Собирает: роли пользователя, первое сообщение пользователя
function scanDiscordFile(filePath) {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    const userRoles    = {};  // username → Set<roleName>
    const firstMessage = {};  // username → earliest timestamp ms
    const roleColors   = {};  // roleName → hex color

    let inAuthor    = false;
    let authorDepth = 0;
    let inRoles     = false;
    let pendingType = null;
    let pendingTs   = null;
    let name        = null;
    let isBot       = false;
    const curRoles  = [];  // [{name, color}]
    let   pendingRoleName = null;

    rl.on('line', line => {
      const t = line.trim();

      if (!inAuthor) {
        if (t.startsWith('"type":')) {
          const v = t.replace('"type":', '').trim().replace(/[",\s]/g, '');
          pendingType = (v === 'Default' || v === 'Reply') ? v : null;
        }
        if (t.startsWith('"timestamp":')) {
          const m = t.match(/"timestamp":\s*"([^"]+)"/);
          if (m) pendingTs = m[1];
        }
        if (t === '"author": {') {
          inAuthor = true; authorDepth = 1; inRoles = false;
          name = null; isBot = false; curRoles.length = 0;
        }
        return;
      }

      // Count braces/brackets FIRST
      for (const ch of t) {
        if (ch === '{' || ch === '[') authorDepth++;
        else if (ch === '}' || ch === ']') authorDepth--;
      }

      // Exit roles mode if we dropped below depth 2
      if (inRoles && authorDepth < 2) inRoles = false;

      // Enter roles mode: after counting `[`, depth is 2 and line has "roles"
      if (!inRoles && authorDepth === 2 && t.includes('"roles"')) inRoles = true;

      // Role fields at depth 3 (inside a role object)
      if (inRoles && authorDepth === 3) {
        if (t.startsWith('"name":')) {
          const m = t.match(/"name":\s*"((?:[^"\\]|\\.)*)"/);
          if (m) { pendingRoleName = decodeJsonStr(m[1]); curRoles.push(pendingRoleName); }
        }
        if (t.startsWith('"color":') && pendingRoleName) {
          const m = t.match(/"color":\s*"([^"]+)"/);
          if (m && m[1] !== '#000000') roleColors[pendingRoleName] = m[1];
        }
        // depth goes back to 2 when role object closes → reset pending
        if (authorDepth === 2) pendingRoleName = null;
      }

      // Author properties at depth 1
      if (authorDepth === 1) {
        if (t.startsWith('"name":')) {
          const m = t.match(/"name":\s*"((?:[^"\\]|\\.)*)"/);
          if (m) name = decodeJsonStr(m[1]);
        }
        if (t.startsWith('"isBot":')) isBot = t.includes('true');
      }

      // Author block closed
      if (authorDepth <= 0) {
        inAuthor = false;
        if (!isBot && name && pendingType && pendingTs) {
          if (!userRoles[name]) userRoles[name] = new Set();
          for (const r of curRoles) userRoles[name].add(r);

          const ts = new Date(pendingTs).getTime();
          if (!firstMessage[name] || ts < firstMessage[name]) firstMessage[name] = ts;
        }
        pendingType = pendingTs = null;
      }
    });

    rl.on('close', () => resolve({ userRoles, firstMessage, roleColors }));
  });
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log('Вычисляем бейджи...\n');

  const scores     = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf-8'));
  const users      = scores.users || [];
  const totalUsers = users.length;

  // Existing badges (never lose them)
  let existing = {};
  if (fs.existsSync(BADGES_FILE)) {
    existing = JSON.parse(fs.readFileSync(BADGES_FILE, 'utf-8'));
  }

  // Rank history for Podium / #1 / Top10 badges
  let rankHistory = { snapshots: [] };
  if (fs.existsSync(RANK_HIST_FILE)) {
    rankHistory = JSON.parse(fs.readFileSync(RANK_HIST_FILE, 'utf-8'));
  }

  const everTop1  = new Set();
  const everTop3  = new Set();
  const everTop10 = new Set();
  for (const snap of rankHistory.snapshots) {
    // Check all-time, weekly, and monthly ranks
    for (const key of ['all', 'weekly', 'monthly']) {
      for (const [uname, rank] of Object.entries(snap[key] || {})) {
        if (rank === 1)  everTop1.add(uname);
        if (rank <= 3)   everTop3.add(uname);
        if (rank <= 10)  everTop10.add(uname);
      }
    }
  }
  // Current ranks also count
  for (const u of users) {
    if (u.rank === 1)  everTop1.add(u.username);
    if (u.rank <= 3)   everTop3.add(u.username);
    if (u.rank <= 10)  everTop10.add(u.username);
  }

  // Scan Discord files for roles + first message (recursive)
  function findJsonFiles(dir) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) results.push(...findJsonFiles(full));
      else if (entry.name.endsWith('.json')) results.push(full);
    }
    return results;
  }
  const files = findJsonFiles(JSON_DIR);
  console.log(`Сканируем ${files.length} Discord-файлов (роли + первое сообщение)...`);
  const start = Date.now();

  const scanResults = await Promise.all(
    files.map(f => scanDiscordFile(f)
      .then(r => { process.stdout.write('.'); return r; })
    )
  );
  console.log(`\n  ✓ Готово за ${((Date.now() - start) / 1000).toFixed(1)}с`);

  // Merge scan results
  const allRoles     = {};  // username → Set<roleName>
  const firstMsg     = {};  // username → min timestamp ms
  const globalColors = {};  // roleName → hex color

  for (const { userRoles, firstMessage, roleColors } of scanResults) {
    for (const [u, roles] of Object.entries(userRoles)) {
      if (!allRoles[u]) allRoles[u] = new Set();
      for (const r of roles) allRoles[u].add(r);
    }
    for (const [u, ts] of Object.entries(firstMessage)) {
      if (!firstMsg[u] || ts < firstMsg[u]) firstMsg[u] = ts;
    }
    for (const [role, color] of Object.entries(roleColors)) {
      if (!globalColors[role]) globalColors[role] = color;
    }
  }
  console.log(`  Цвета ролей: ${Object.keys(globalColors).length} → ${JSON.stringify(globalColors)}`);

  const now              = Date.now();
  const top01Threshold   = Math.max(1, Math.ceil(totalUsers * 0.001));
  const result           = { ...existing };  // start from existing

  let newCount = 0;

  for (const u of users) {
    const uname    = u.username;
    const pts      = u.totalScore || 0;
    const dcMsgs   = u.dcMessages || 0;
    const tweets   = u.posts      || 0;
    const roles    = allRoles[uname] || new Set();
    const firstTs  = firstMsg[uname] || now;
    const pctCalc  = totalUsers > 0 ? (u.rank / totalUsers) * 100 : 100;

    const prev     = new Set(result[uname]?.badges || []);
    const earned   = new Set(prev);

    // ── Role badges ──────────────────────────────────────────
    for (const [roleName, badgeId] of Object.entries(ROLE_BADGE_MAP)) {
      if (roles.has(roleName)) earned.add(badgeId);
    }

    // ── Points badges ────────────────────────────────────────
    if (pts >= 25000) earned.add('legend');
    if (pts >= 10000) earned.add('elite');
    if (pts >= 5000)  earned.add('grinder');
    if (pts >= 1000)  earned.add('rising');
    if (pts >= 100)   earned.add('first-steps');

    // ── Rank badges (historical) ─────────────────────────────
    if (everTop1.has(uname))  earned.add('rank-1');
    if (everTop3.has(uname))  earned.add('podium');
    if (everTop10.has(uname)) earned.add('top-10');

    // ── Discord activity ─────────────────────────────────────
    if (dcMsgs >= 500) earned.add('regular');
    if (dcMsgs >= 10)  earned.add('newcomer');

    // ── X activity ───────────────────────────────────────────
    if (tweets >= 1000) earned.add('tweet-1k');
    if (tweets >= 100)  earned.add('tweet-100');
    if (tweets >= 1)    earned.add('tweet-first');

    // ── Special ──────────────────────────────────────────────
    if (now - firstTs >= THREE_MONTHS_MS) earned.add('loyal');
    if (u.rank <= top01Threshold)         earned.add('top01pct');

    // Count new badges added this run
    newCount += [...earned].filter(b => !prev.has(b)).length;

    result[uname] = {
      badges:    Array.from(earned),
      updatedAt: new Date().toISOString(),
    };
  }

  fs.writeFileSync(BADGES_FILE, JSON.stringify(result, null, 2));

  // Save role colors separately for frontend
  const roleColorsFile = path.join(DATA_DIR, 'role_colors.json');
  fs.writeFileSync(roleColorsFile, JSON.stringify(globalColors, null, 2));

  const jsOut = path.join(DATA_DIR, 'badges_data.js');
  fs.writeFileSync(jsOut, `window.BADGES_DATA = ${JSON.stringify(result)};\nwindow.ROLE_COLORS = ${JSON.stringify(globalColors)};`);

  const total = Object.values(result).reduce((a, v) => a + v.badges.length, 0);
  console.log(`\n✅ Бейджи сохранены!`);
  console.log(`   Пользователей: ${Object.keys(result).length}`);
  console.log(`   Всего бейджей: ${total}`);
  console.log(`   Новых в этом запуске: ${newCount}`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
