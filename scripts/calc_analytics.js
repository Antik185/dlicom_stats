/**
 * Считает community-аналитику из сырых Discord-выгрузок.
 *
 * Результат:
 *   data/analytics.json       — полная аналитика (pretty)
 *   data/analytics_data.js    — window.ANALYTICS_DATA для фронта
 *
 * Содержит:
 *   overview       — totalMessages, totalUsers, DAU/WAU/MAU, growth, retention
 *   timeline       — по дням: сообщения + активные юзеры
 *   heatmap        — 7×24 (день недели × час UTC)
 *   channels       — по каналам: статус (alive/growing/dead/spam-heavy), метрики
 *   classification — разбивка типов сообщений (правила)
 *   sentiment      — разбивка настроения (правила + эмодзи)
 *   contributors   — per-user: reactionsReceived, repliesGiven, mentions, activeDays…
 *
 * Файлы >512MB (лимит строки V8) парсятся потоково построчно.
 *
 * Запуск:
 *   node --max-old-space-size=8192 scripts/calc_analytics.js [--ref-date=YYYY-MM-DD]
 */

const fs       = require('fs');
const readline = require('readline');
const path     = require('path');

const JSON_DIR     = path.join(__dirname, '..', 'json');
const DATA_DIR     = path.join(__dirname, '..', 'data');
const ALIASES_FILE = path.join(__dirname, 'aliases.json');
const X_POSTS_FILE = path.join(DATA_DIR, 'x_posts.json');

const STRING_LIMIT = 0x1fffffe8; // макс. длина строки в V8 (~512MB)

// ── Алиасы ────────────────────────────────────────────────────
const _rawAliases = JSON.parse(fs.readFileSync(ALIASES_FILE, 'utf-8'));
const ALIASES = {};
for (const [k, v] of Object.entries(_rawAliases)) if (!k.startsWith('_')) ALIASES[k] = v;
const resolveAlias = n => ALIASES[n] || n;

// Забаненные юзеры (не попадают в contributors аналитики)
let EXCLUDED_USERS = new Set();
try {
  const exu = JSON.parse(fs.readFileSync(path.join(__dirname, 'excluded_users.json'), 'utf-8'));
  EXCLUDED_USERS = new Set(Object.keys(exu).filter(k => !k.startsWith('_')));
} catch (_) {}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function decodeJsonStr(s) {
  return s.replace(/\\u([0-9a-fA-F]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
          .replace(/\\n/g, '\n').replace(/\\t/g, ' ').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

// ── Rule-based классификатор типов сообщений ──────────────────
function classify(content, { attach, sticker, isReply }) {
  const c  = (content || '').trim();
  const lc = c.toLowerCase();

  if (c.length === 0 && !attach && !sticker) return 'spam';

  const hasUrl   = /https?:\/\//.test(lc);
  const hasXLink = /(x\.com|twitter\.com)\/[^/\s]+\/status/.test(lc);

  if (/\b(vote|voting|proposal|governance|roadmap|tokenomics|validator|staking|airdrop)\b/.test(lc)) return 'governance';
  if (/\b(bug|error|crash|wallet|transaction|tx|api|smart ?contract|gas fee|kyc|verification|login|node)\b/.test(lc)) return 'technical';
  if (hasXLink) return 'alpha';
  if (hasUrl)   return 'link';
  if (c.includes('?') || /^(how|what|why|when|where|who|can|does|is|are|should|could|will|do)\b/.test(lc)) return 'question';

  const emojiOnly = c.length > 0 && /^[\p{Extended_Pictographic}\p{Emoji_Component}\s‍️]+$/u.test(c);
  if (emojiOnly || sticker || (attach && c.length < 20)) return 'meme';
  if (c.length > 220) return 'educational';
  if (isReply && c.length > 8) return 'support';
  return 'chat';
}

// ── Rule-based сентимент (эмодзи работают для всех языков) ─────
function sentiment(content) {
  const c  = content || '';
  const lc = c.toLowerCase();

  const bull = /[\u{1F680}\u{1F525}\u{1F48E}\u{1F319}\u{1F4C8}\u{1F911}\u{1F4B0}]/u.test(c);
  const happy = /[\u{1F389}\u{1F973}\u{1F60D}\u{1F929}\u{2764}\u{1F44D}\u{2705}\u{1F60E}]/u.test(c);
  const sad  = /[\u{1F621}\u{1F624}\u{1F620}\u{1F622}\u{1F62D}\u{1F44E}\u{274C}\u{1F494}]/u.test(c);
  const conf = /[\u{1F914}\u{1F615}\u{2753}]/u.test(c);

  if (/\b(bullish|moon|lfg|pump|gem|huge|10x|100x|ath|wagmi|gm)\b/.test(lc) || bull) return 'bullish';
  if (/\b(scam|rug|broken|not working|doesn'?t work|error|fix this|failed|fail|problem|issue|angry|terrible|worst)\b/.test(lc) || sad) return 'frustration';
  if (/\b(confused|don'?t understand|how do|how to|what is|why is|unclear|help me)\b/.test(lc) || conf) return 'confusion';
  if (/\b(amazing|awesome|great|love|excited|can'?t wait|let'?s go|congrats|wow|nice|good|thanks)\b/.test(lc) || happy || /!{2,}/.test(c)) return 'excitement';
  return 'neutral';
}

// ── Извлечение тем из текстов X-постов ────────────────────────
const STOP = new Set(('the a an and or but to of in on at for with from by is are was were be been being this that these those it its we you your their them his her so as if then than too very just not no yes do does did has have had will would can could should may might must im dont cant wont gonna wanna get got like one all out up about into over here there what when where who why how rt amp via more now new join lets let make made take using use also they our them she he me my i us already trusted thousands meet every know become want need time good today going thing things really much many well even still back come look keep give getting around something everyone people world only your youre were also done dont your what your first best ever soon part way day days week weeks year').split(/\s+/));
const PROJECT_TERMS = new Set(['dlicom', 'dlicomapp', 'dlicom_vn', 'app', 'super', 'superapp', 'web', 'crypto']);

function extractThemes(texts) {
  const hash = {}, word = {};
  for (const txt of texts) {
    const t = txt || '';
    for (const m of t.matchAll(/[#$](\w{2,30})/g)) {
      const tag = m[1];
      if (/^\d+$/.test(tag)) continue;            // чисто числовые ($2000, #218) — мусор
      const low = tag.toLowerCase();
      if (PROJECT_TERMS.has(low)) continue;
      const key = m[0][0] + tag;
      hash[key] = (hash[key] || 0) + 1;
    }
    const clean = t.replace(/https?:\/\/\S+/g, ' ').replace(/[@#$]\w+/g, ' ').toLowerCase();
    for (const w of clean.split(/[^a-z]+/)) {
      if (w.length < 4 || STOP.has(w) || PROJECT_TERMS.has(w)) continue;
      word[w] = (word[w] || 0) + 1;
    }
  }
  // нормализуем регистр хэштегов (#web3/#Web3 → один), берём самый частый вариант
  const topHash = Object.entries(hash).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
  const topWord = Object.entries(word).sort((a, b) => b[1] - a[1]).filter(([, c]) => c >= 2).slice(0, 4).map(([k]) => k);
  const themes = [...topHash];
  for (const w of topWord) { if (themes.length >= 4) break; themes.push(w); }
  return themes;
}

function findJsonFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) findJsonFiles(full, out);
    else if (e.name.endsWith('.json')) out.push(full);
  }
  return out;
}

// ── Аккумуляторы ──────────────────────────────────────────────
const timeline    = {};                       // 'YYYY-MM-DD' -> { msgs, users:Set }
const heatmap     = Array.from({ length: 7 }, () => new Array(24).fill(0));
const channels    = {};
const classCounts = {};                        // all-time
const sentCounts  = {};
const classByDay  = {};                        // 'YYYY-MM-DD' -> { type: count }
const sentByDay   = {};                        // 'YYYY-MM-DD' -> { sent: count }
const userMeta    = {};
const allUsers    = new Set();

let totalMessages = 0;
let maxTs = 0, minTs = Infinity;

function umeta(name) {
  if (!userMeta[name]) userMeta[name] = {
    messages: 0, reactionsReceived: 0, repliesGiven: 0,
    mentionsMade: 0, questions: 0, alpha: 0,
    activeDays: new Set(), channels: new Set(),
    byType: {},      // тип сообщения -> count
    chanCount: {},   // канал -> count (для топ-каналов)
    sentPos: 0, sentNeg: 0,  // позитив/негатив для общего настроя
  };
  return userMeta[name];
}

function getChannel(name, cat, type) {
  if (!channels[name]) channels[name] = {
    name, category: cat || '—',
    type: type || 'GuildTextChat',
    messages: 0, users: new Set(),
    replies: 0, reactions: 0, spam: 0,
    byDay: {},
    byDayReplies: {}, // 'YYYY-MM-DD' -> кол-во реплаев (для недельного reply%)
    byDaySpam: {},    // 'YYYY-MM-DD' -> кол-во спама (для недельного spam%)
    dayUsers: {},     // 'YYYY-MM-DD' -> Set(users) — для подсчёта активных за период
  };
  return channels[name];
}

// Единая обработка одного сообщения (для обоих путей)
function emit(rec) {
  const { type, timestamp, content, name, reactions, mentions, attach, sticker, chName, chCat, chType } = rec;
  if (type !== 'Default' && type !== 'Reply') return;
  if (!name) return;

  const canon = resolveAlias(name);
  const tsMs  = new Date(timestamp).getTime();
  if (isNaN(tsMs)) return;
  const day = timestamp.slice(0, 10);
  const d   = new Date(timestamp);

  totalMessages++;
  maxTs = Math.max(maxTs, tsMs);
  minTs = Math.min(minTs, tsMs);
  allUsers.add(canon);

  if (!timeline[day]) timeline[day] = { msgs: 0, users: new Set() };
  timeline[day].msgs++;
  timeline[day].users.add(canon);

  heatmap[d.getUTCDay()][d.getUTCHours()]++;

  const ch = getChannel(chName, chCat, chType);
  ch.messages++;
  ch.users.add(canon);
  ch.byDay[day] = (ch.byDay[day] || 0) + 1;
  (ch.dayUsers[day] || (ch.dayUsers[day] = new Set())).add(canon);

  const isReply = type === 'Reply';
  if (isReply) { ch.replies++; ch.byDayReplies[day] = (ch.byDayReplies[day] || 0) + 1; }
  ch.reactions += reactions;

  const cls = classify(content, { attach, sticker, isReply });
  const snt = sentiment(content);
  classCounts[cls] = (classCounts[cls] || 0) + 1;
  sentCounts[snt]  = (sentCounts[snt]  || 0) + 1;
  (classByDay[day] || (classByDay[day] = {}))[cls] = ((classByDay[day] || {})[cls] || 0) + 1;
  (sentByDay[day]  || (sentByDay[day]  = {}))[snt] = ((sentByDay[day]  || {})[snt] || 0) + 1;
  if (cls === 'spam') { ch.spam++; ch.byDaySpam[day] = (ch.byDaySpam[day] || 0) + 1; }

  const um = umeta(canon);
  um.messages++;
  um.reactionsReceived += reactions;
  if (isReply) um.repliesGiven++;
  um.mentionsMade += mentions;
  if (cls === 'question') um.questions++;
  if (cls === 'alpha')    um.alpha++;
  um.activeDays.add(day);
  um.channels.add(chName);
  um.byType[cls] = (um.byType[cls] || 0) + 1;
  um.chanCount[chName] = (um.chanCount[chName] || 0) + 1;
  if (snt === 'bullish' || snt === 'excitement') um.sentPos++;
  else if (snt === 'frustration') um.sentNeg++;
}

// ── Путь 1: JSON.parse (файлы < лимита) ───────────────────────
function processFileParsed(file) {
  const data   = JSON.parse(fs.readFileSync(file));
  const chName = data.channel?.name || path.basename(file);
  const chCat  = data.channel?.category || '—';
  const chType = data.channel?.type || 'GuildTextChat';
  for (const m of data.messages) {
    if (m.author?.isBot) continue;
    emit({
      type: m.type,
      timestamp: m.timestamp,
      content: m.content,
      name: m.author?.name,
      reactions: (m.reactions || []).reduce((a, r) => a + (r.count || 0), 0),
      mentions: (m.mentions || []).length,
      attach: (m.attachments || []).length > 0,
      sticker: (m.stickers || []).length > 0,
      chName, chCat, chType,
    });
  }
}

// ── Путь 2: потоковый парсер (негабаритные файлы) ─────────────
function processFileStreaming(file) {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: fs.createReadStream(file, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    let depth = 0;
    let chName = path.basename(file), chCat = '—', chType = 'GuildTextChat';
    let inChannelBlock = false, gotChannelName = false, gotChannelType = false, inMessagesArray = false;

    // состояние сообщения
    let inMessage = false;
    let mType = null, mTs = null, mContent = null, mAuthor = null, mIsBot = false;
    let mReactions = 0, mMentions = 0, mAttach = false, mSticker = false;

    // секции внутри сообщения
    let inAuthor = false, inReactions = false, inMentions = false;

    function resetMsg() {
      mType = mTs = mContent = mAuthor = null; mIsBot = false;
      mReactions = 0; mMentions = 0; mAttach = false; mSticker = false;
      inAuthor = inReactions = inMentions = false;
    }

    function finalize() {
      if (!mIsBot) {
        emit({
          type: mType, timestamp: mTs, content: mContent, name: mAuthor,
          reactions: mReactions, mentions: mMentions,
          attach: mAttach, sticker: mSticker, chName, chCat, chType,
        });
      }
      resetMsg();
    }

    rl.on('line', (rawline) => {
      const t = rawline.trim();
      const startDepth = depth;

      if (!inMessagesArray) {
        // ── шапка файла: ловим имя/категорию канала ──
        // ВАЖНО: в channel-блоке порядок полей: id, type, categoryId, category, name, topic.
        // category идёт ПЕРЕД name — поэтому не закрываем блок на category.
        if (t.startsWith('"channel":')) inChannelBlock = true;
        else if (inChannelBlock && !gotChannelType && t.startsWith('"type":')) {
          const m = t.match(/"type":\s*"([^"]+)"/);
          if (m) { chType = m[1]; gotChannelType = true; }
        } else if (inChannelBlock && t.startsWith('"category":')) {
          const m = t.match(/"category":\s*"((?:[^"\\]|\\.)*)"/);
          if (m) chCat = decodeJsonStr(m[1]);
        } else if (inChannelBlock && !gotChannelName && t.startsWith('"name":')) {
          const m = t.match(/"name":\s*"((?:[^"\\]|\\.)*)"/);
          if (m) { chName = decodeJsonStr(m[1]); gotChannelName = true; inChannelBlock = false; }
        }
        if (t.startsWith('"messages":')) inMessagesArray = true;
      } else {
        // ── внутри messages[] ──
        if (startDepth === 2 && t.startsWith('{')) inMessage = true;

        if (inMessage) {
          if (inAuthor) {
            if (!mAuthor && t.startsWith('"name":')) {
              const m = t.match(/"name":\s*"((?:[^"\\]|\\.)*)"/);
              if (m) mAuthor = decodeJsonStr(m[1]);
            } else if (t.startsWith('"isBot":')) {
              mIsBot = t.includes('true');
            }
          } else if (inReactions) {
            if (t.startsWith('"count":')) {
              const m = t.match(/"count":\s*(\d+)/);
              if (m) mReactions += parseInt(m[1]);
            }
          } else if (inMentions) {
            if (startDepth === 4 && t.startsWith('{')) mMentions++;
          } else if (startDepth === 3) {
            // поля уровня сообщения
            if (t.startsWith('"type":')) {
              mType = t.replace('"type":', '').replace(/[",\s]/g, '');
            } else if (t.startsWith('"timestamp":') && !mTs) {
              const m = t.match(/"timestamp":\s*"([^"]+)"/); if (m) mTs = m[1];
            } else if (t.startsWith('"content":')) {
              const m = t.match(/"content":\s*"((?:[^"\\]|\\.)*)"/); if (m) mContent = decodeJsonStr(m[1]);
            } else if (t.startsWith('"author":')) {
              inAuthor = true;
            } else if (t.startsWith('"reactions":')) {
              if (!t.includes('[]')) inReactions = true;
            } else if (t.startsWith('"mentions":')) {
              if (!t.includes('[]')) inMentions = true;
            } else if (t.startsWith('"stickers":')) {
              if (!t.includes('[]')) mSticker = true;
            } else if (t.startsWith('"attachments":')) {
              if (!t.includes('[]')) mAttach = true;
            }
          }
        }
      }

      // обновляем глубину по скобкам строки — НО игнорируем скобки внутри JSON-строк
      // (контент сообщений может содержать "{" и "}", которые сбивали depth и роняли счёт)
      {
        let inStr = false, esc = false;
        for (let i = 0; i < rawline.length; i++) {
          const ch = rawline[i];
          if (esc) { esc = false; continue; }
          if (ch === '\\') { esc = true; continue; }
          if (ch === '"') { inStr = !inStr; continue; }
          if (inStr) continue;
          if (ch === '{' || ch === '[') depth++;
          else if (ch === '}' || ch === ']') depth--;
        }
      }

      // закрытие секций (после обновления глубины)
      if (inAuthor    && depth <= 3) inAuthor    = false;
      if (inReactions && depth <= 3) inReactions = false;
      if (inMentions  && depth <= 3) inMentions  = false;

      // закрытие сообщения
      if (inMessage && depth === 2) { finalize(); inMessage = false; }
    });

    rl.on('close', resolve);
  });
}

// ── CLI ───────────────────────────────────────────────────────
const refArg = process.argv.find(a => a.startsWith('--ref-date='));

async function main() {
  const files = findJsonFiles(JSON_DIR);
  console.log(`Обрабатываем ${files.length} файлов...`);
  const start = Date.now();

  for (const f of files) {
    const rel = path.relative(JSON_DIR, f);
    const size = fs.statSync(f).size;
    try {
      if (size > STRING_LIMIT) {
        await processFileStreaming(f);
        console.log(`  ✓ ${rel} (поток, ${(size/1048576).toFixed(0)}MB)`);
      } else {
        processFileParsed(f);
        console.log(`  ✓ ${rel}`);
      }
    } catch (e) {
      // fallback на поток если JSON.parse упал
      try {
        await processFileStreaming(f);
        console.log(`  ✓ ${rel} (поток-fallback)`);
      } catch (e2) {
        console.warn(`  ✗ ${rel}: ${e2.message}`);
      }
    }
  }

  const refDate = refArg ? refArg.slice(11) : new Date(maxTs).toISOString().slice(0, 10);
  const refMs   = new Date(refDate + 'T23:59:59.999Z').getTime();
  const DAY = 86400000;

  console.log(`\nПериод данных: ${new Date(minTs).toISOString().slice(0,10)} → ${new Date(maxTs).toISOString().slice(0,10)}`);
  console.log(`refDate: ${refDate} | сообщений: ${totalMessages} | юзеров: ${allUsers.size}`);

  const days = Object.keys(timeline).sort();
  const timelineArr = days.map(d => ({
    date: d, messages: timeline[d].msgs, activeUsers: timeline[d].users.size,
  }));

  const setInWindow = (startMs, endMs) => {
    const s = new Set();
    for (const d of days) {
      const dms = new Date(d + 'T12:00:00Z').getTime();
      if (dms >= startMs && dms <= endMs) for (const u of timeline[d].users) s.add(u);
    }
    return s;
  };
  const msgsInWindow = (startMs, endMs) => {
    let n = 0;
    for (const d of days) {
      const dms = new Date(d + 'T12:00:00Z').getTime();
      if (dms >= startMs && dms <= endMs) n += timeline[d].msgs;
    }
    return n;
  };

  const dau = setInWindow(refMs - DAY,      refMs).size;
  const wau = setInWindow(refMs - 7  * DAY, refMs).size;
  const mau = setInWindow(refMs - 30 * DAY, refMs).size;

  const last7 = msgsInWindow(refMs - 7  * DAY, refMs);
  const prev7 = msgsInWindow(refMs - 14 * DAY, refMs - 7 * DAY);
  const growthPct = prev7 > 0 ? Math.round((last7 - prev7) / prev7 * 100) : 0;

  const prevSet = setInWindow(refMs - 14 * DAY, refMs - 7 * DAY);
  const lastSet = setInWindow(refMs - 7  * DAY, refMs);
  let retained = 0;
  for (const u of prevSet) if (lastSet.has(u)) retained++;
  const retentionPct = prevSet.size > 0 ? Math.round(retained / prevSet.size * 100) : 0;

  const inWeek = d  => { const x = new Date(d+'T12:00:00Z').getTime(); return x >= refMs - 7*DAY  && x <= refMs; };
  const inPrev = d  => { const x = new Date(d+'T12:00:00Z').getTime(); return x >= refMs - 14*DAY && x <  refMs - 7*DAY; };
  const sumBy  = (obj, pred) => Object.entries(obj).filter(([d]) => pred(d)).reduce((a, [,n]) => a + n, 0);

  const channelArr = Object.values(channels)
    .filter(ch => {
      const n = ch.name.toLowerCase();
      const cat = ch.category || '';
      if (/events/.test(n)) return false;          // 🎮╏events
      if (/dlicom-creators/.test(n)) return false; // 🧷╏dlicom-creators
      if (/app-feedback/.test(n)) return false;    // 🧪╏app-feedback
      if (/content-spotlight/.test(n)) return false;
      if (/中文|chinese/i.test(cat) || /中文|游戏频道/.test(ch.name)) return false; // 🇨🇳 китайский канал
      return true;
    })
    .map(ch => {
    // ── всё считаем за последнюю неделю (18–24.05) ──
    const msgWeek    = sumBy(ch.byDay, inWeek);
    const msgPrev    = sumBy(ch.byDay, inPrev);
    const replyWeek  = sumBy(ch.byDayReplies, inWeek);
    const spamWeek   = sumBy(ch.byDaySpam, inWeek);
    const growth     = msgPrev > 0 ? Math.round((msgWeek - msgPrev) / msgPrev * 100) : (msgWeek > 0 ? 100 : 0);
    const replyRatio = msgWeek > 0 ? Math.round(replyWeek / msgWeek * 100) : 0;
    const spamRatio  = msgWeek > 0 ? spamWeek / msgWeek : 0;

    // активные юзеры за неделю
    const weekUsers = new Set();
    for (const [d, set] of Object.entries(ch.dayUsers)) {
      if (inWeek(d)) for (const u of set) weekUsers.add(u);
    }
    const usersWeek = weekUsers.size;

    // ── Статус-модель (на основе недельной активности) ──
    //   dead       — почти нет активности (<30 сообщений за неделю)
    //   spam-heavy — >30% сообщений классифицированы как спам
    //   growing    — рост ≥20% к прошлой неделе при заметном объёме
    //   declining  — падение ≥50% (резкое; обычный фон периода ~-40%)
    //   alive      — стабильная здоровая активность
    let status;
    if (msgWeek < 30)            status = 'dead';
    else if (spamRatio > 0.30)   status = 'spam-heavy';
    else if (growth >= 20 && msgWeek >= 50) status = 'growing';
    else if (growth <= -50)      status = 'declining';
    else                         status = 'alive';

    return {
      name: ch.name, category: ch.category,
      isVoice: ch.type !== 'GuildTextChat',
      messagesWeek: msgWeek,
      messagesPrev: msgPrev,
      usersWeek,
      replyRatio,
      spamPct: Math.round(spamRatio * 100),
      growth,
      status,
      messagesAll: ch.messages,
      usersAll: ch.users.size,
    };
  }).sort((a, b) => b.messagesWeek - a.messagesWeek);

  // ── Недельные типы сообщений и сентимент (за последние 7 дней) ──
  const sumDayMaps = (byDay, pred) => {
    const acc = {};
    for (const [d, m] of Object.entries(byDay)) {
      if (!pred(d)) continue;
      for (const [k, v] of Object.entries(m)) acc[k] = (acc[k] || 0) + v;
    }
    return acc;
  };
  const classWeek = sumDayMaps(classByDay, inWeek);
  const sentWeek  = sumDayMaps(sentByDay,  inWeek);

  // ── X-темы по юзерам (из текстов постов) ──
  const xThemes = {};
  if (fs.existsSync(X_POSTS_FILE)) {
    const posts = JSON.parse(fs.readFileSync(X_POSTS_FILE, 'utf-8'));
    const byUser = {};
    for (const id of Object.keys(posts)) {
      const dn = resolveAlias(posts[id].discordName);
      (byUser[dn] || (byUser[dn] = [])).push(posts[id].text);
    }
    let withThemes = 0;
    for (const dn of Object.keys(byUser)) {
      const th = extractThemes(byUser[dn]);
      if (th.length) { xThemes[dn] = th; withThemes++; }
    }
    console.log(`X-темы извлечены для ${withThemes} юзеров (из ${Object.keys(posts).length} постов)`);
  } else {
    console.log('⚠ x_posts.json не найден — X-темы пропущены (запусти scrape_x_posts.js)');
  }

  const totalDays = days.length || 1;
  const contributors = {};
  for (const [name, m] of Object.entries(userMeta)) {
    if (EXCLUDED_USERS.has(name)) continue;   // забаненный
    // топ-3 канала по числу сообщений
    const topChannels = Object.entries(m.chanCount)
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([ch, c]) => ({ name: ch, count: c }));
    contributors[name] = {
      messages: m.messages,
      reactionsReceived: m.reactionsReceived,
      repliesGiven: m.repliesGiven,
      mentionsMade: m.mentionsMade,
      questions: m.questions,
      alpha: m.alpha,
      activeDays: m.activeDays.size,
      channels: m.channels.size,
      activeDayPct: Math.round(m.activeDays.size / totalDays * 100),
      byType: m.byType,
      topChannels,
      sentPos: m.sentPos,
      sentNeg: m.sentNeg,
    };
  }

  const output = {
    generatedAt: new Date().toISOString(),
    refDate,
    dataRange: { from: new Date(minTs).toISOString().slice(0,10), to: new Date(maxTs).toISOString().slice(0,10) },
    overview: { totalMessages, totalUsers: allUsers.size, dau, wau, mau, last7, prev7, growthPct, retentionPct, totalDays },
    timeline: timelineArr,
    heatmap: { dow: DOW, grid: heatmap },
    channels: channelArr,
    classification: classWeek,       // за последнюю неделю
    sentiment: sentWeek,             // за последнюю неделю
    classificationAll: classCounts,  // всё время (справочно)
    sentimentAll: sentCounts,
    contributors,
    xThemes,                         // username -> [темы из X-постов]
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, 'analytics.json'), JSON.stringify(output, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, 'analytics_data.js'), `window.ANALYTICS_DATA = ${JSON.stringify(output)};`);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n✅ Готово за ${elapsed}с!`);
  console.log(`   DAU ${dau} · WAU ${wau} · MAU ${mau} · рост ${growthPct}% · retention ${retentionPct}%`);
  console.log(`   Каналов: ${channelArr.length} | Контрибьюторов: ${Object.keys(contributors).length}`);
  console.log(`   Типы: ${Object.entries(classCounts).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+':'+v).join(', ')}`);
  console.log(`   Сентимент: ${Object.entries(sentCounts).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+':'+v).join(', ')}`);
  console.log(`Сохранено: ${path.join(DATA_DIR, 'analytics.json')}`);
}

main();
