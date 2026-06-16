'use strict';

// ── Data sources ──────────────────────────────────────────────────────────────
const ALL_DATA     = window.SCORES_DATA;
const MONTHLY_DATA = window.SCORES_MONTHLY_DATA;
const WEEKLY_DATA  = window.SCORES_WEEKLY_DATA;
const RANK_HISTORY = window.RANK_HISTORY_DATA;
const ANALYTICS    = window.ANALYTICS_DATA;

if (!ALL_DATA) {
  document.body.innerHTML = '<div style="color:#f87171;padding:60px;text-align:center">Failed to load scores_data.js</div>';
  throw new Error('No scores data');
}

const scoreUsers   = ALL_DATA.users || [];
const monthlySet   = new Set((MONTHLY_DATA?.users || []).map(u => u.username));
const weeklySet    = new Set((WEEKLY_DATA?.users  || []).map(u => u.username));
const cMeta        = ANALYTICS?.contributors || {};   // username -> discord behavioral meta

// ── Normalisation maxima (from analytics behavioral data) ──────────────────────
const metaVals    = Object.values(cMeta);
const maxMessages = Math.max(1, ...metaVals.map(m => m.messages));
const maxReplies  = Math.max(1, ...metaVals.map(m => m.repliesGiven));
const maxReacts   = Math.max(1, ...metaVals.map(m => m.reactionsReceived));
const maxXScore   = Math.max(1, ...scoreUsers.map(u => u.xScore));

const logNorm = (v, max) => Math.max(0, Math.min(100, Math.log1p(v) / Math.log1p(max) * 100));

// ── Contributor Score v2 ───────────────────────────────────────────────────────
//   Helpful     (25%) — replies given (answering / supporting others)
//   Engagement  (30%) — message volume
//   Influence   (25%) — reactions received (community appreciation) + X reach
//   Consistency (20%) — share of days active + weekly/monthly presence
function computeComponents(u) {
  const m = cMeta[u.username] || { messages: 0, repliesGiven: 0, reactionsReceived: 0, activeDayPct: 0 };

  const helpful = logNorm(m.repliesGiven, maxReplies);
  const engage  = logNorm(Math.max(m.messages, u.dcMessages || 0), maxMessages);
  const influence = 0.6 * logNorm(m.reactionsReceived, maxReacts)
                  + 0.4 * logNorm(u.xScore, maxXScore);

  const presence = (weeklySet.has(u.username) ? 25 : 0) + (monthlySet.has(u.username) ? 25 : 0);
  const consistency = Math.min(m.activeDayPct * 1.4 + presence, 100);

  const composite = Math.round(helpful * 0.25 + engage * 0.30 + influence * 0.25 + consistency * 0.20);
  return { helpful, engage, influence, consistency, composite };
}

const enriched = scoreUsers
  .map(u => ({ ...u, meta: cMeta[u.username] || null, comp: computeComponents(u) }))
  .sort((a, b) => b.comp.composite - a.comp.composite);
// фиксируем глобальный ранг ОДИН раз — чтобы поиск/фильтры не сбивали позицию
enriched.forEach((u, i) => { u.composRank = i + 1; });

// ── Top Contributors список: только юзеры из reviews.json, отсортированы по ручному score ──
const REVIEWS = window.REVIEWS_DATA || {};
const topContribs = scoreUsers
  .filter(u => REVIEWS[u.username] && typeof REVIEWS[u.username].score === 'number')
  .map(u => ({ ...u, meta: cMeta[u.username] || null, review: REVIEWS[u.username] }))
  .sort((a, b) => b.review.score - a.review.score);
topContribs.forEach((u, i) => { u.topRank = i + 1; });

// ── Rank history ────────────────────────────────────────────────────────────────
const rankField = s => s.monthly || s.weekly || s.ranks || null;

function getRankTrend(username) {
  if (!RANK_HISTORY?.snapshots) return null;
  const ranks = RANK_HISTORY.snapshots.map(s => rankField(s)?.[username]).filter(r => r != null);
  if (ranks.length < 2) return null;
  return ranks[ranks.length - 2] - ranks[ranks.length - 1];
}
function getRankHistory(username) {
  if (!RANK_HISTORY?.snapshots) return [];
  return RANK_HISTORY.snapshots
    .filter(s => s.type === 'monthly')
    .map(s => ({ date: s.date, rank: rankField(s)?.[username] ?? null }))
    .filter(s => s.rank !== null);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n) {
  n = n || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}
const initials = n => (n || '?').slice(0, 2).toUpperCase();
const tierLabel = t => t === 't5' ? 'LEGENDARY' : t === 't3' ? 'MYTH' : 'RARE';
function fmtDate(iso) { const [y,m,d] = (iso||'').split('-'); return d ? `${d}.${m}.${y.slice(2)}` : iso; }
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ════════════════════════════════════════════════════════════════════════════════
//  OVERVIEW TAB
// ════════════════════════════════════════════════════════════════════════════════
function renderOverview() {
  const date = ANALYTICS?.refDate || ALL_DATA.refDate;
  document.getElementById('updated-label').textContent = 'Live · updated ' + (date ? fmtDate(date) : '');

  const ov = ANALYTICS?.overview;
  document.getElementById('s-members').textContent  = fmt(ALL_DATA.totalUsers);
  if (!ov) {
    document.getElementById('s-messages').textContent = '—';
    return;
  }
  document.getElementById('s-messages').textContent = fmt(ov.totalMessages);
  document.getElementById('s-mau').textContent = fmt(ov.mau);
  document.getElementById('s-wau').textContent = fmt(ov.wau);
  document.getElementById('s-dau').textContent = fmt(ov.dau);
  document.getElementById('s-mau-sub').textContent = ov.totalUsers ? Math.round(ov.mau/ov.totalUsers*100)+'% engaged' : '';
  document.getElementById('s-wau-sub').textContent = ov.mau ? Math.round(ov.wau/ov.mau*100)+'% of MAU' : '';

  const gEl = document.getElementById('s-growth');
  gEl.textContent = (ov.growthPct >= 0 ? '+' : '') + ov.growthPct + '%';
  gEl.style.color = ov.growthPct >= 0 ? '#4ade80' : '#f87171';
  document.getElementById('growth-card').querySelector('.stat-icon').style.color = ov.growthPct >= 0 ? '#4ade80' : '#f87171';
  document.getElementById('s-retention').textContent = ov.retentionPct + '% retention';

  renderGrowthChart(ANALYTICS.timeline);
  renderHeatmap(ANALYTICS.heatmap);
  renderBreakdown('class-breakdown', ANALYTICS.classification, CLASS_COLORS);
  renderBreakdown('sent-breakdown',  ANALYTICS.sentiment,      SENT_COLORS);
}

const CLASS_COLORS = {
  support:'#4ade80', chat:'#5a608a', question:'#4ad6ff', meme:'#f5b80a',
  link:'#8890b0', alpha:'#b566ff', technical:'#f87171', educational:'#4a90e2',
  governance:'#c8cacc', spam:'#7a3d3d',
};
const SENT_COLORS = {
  bullish:'#4ade80', excitement:'#f5b80a', neutral:'#5a608a',
  confusion:'#4a90e2', frustration:'#f87171',
};

function renderGrowthChart(timeline) {
  if (!timeline || !timeline.length) return;
  const W = 1100, H = 220, PADL = 40, PADR = 40, PADT = 14, PADB = 24;
  const n = timeline.length;
  const maxMsg = Math.max(...timeline.map(d => d.messages), 1);
  const maxUsr = Math.max(...timeline.map(d => d.activeUsers), 1);

  const xAt = i => PADL + i * (W - PADL - PADR) / Math.max(n - 1, 1);
  const yMsg = v => PADT + (1 - v / maxMsg) * (H - PADT - PADB);
  const yUsr = v => PADT + (1 - v / maxUsr) * (H - PADT - PADB);

  const lineMsg = timeline.map((d, i) => `${i?'L':'M'}${xAt(i).toFixed(1)},${yMsg(d.messages).toFixed(1)}`).join('');
  const lineUsr = timeline.map((d, i) => `${i?'L':'M'}${xAt(i).toFixed(1)},${yUsr(d.activeUsers).toFixed(1)}`).join('');
  const areaMsg = lineMsg + `L${xAt(n-1).toFixed(1)},${H-PADB} L${PADL},${H-PADB} Z`;

  // x labels: ~6 evenly spaced
  const step = Math.max(1, Math.floor(n / 6));
  let xlabels = '';
  for (let i = 0; i < n; i += step) {
    xlabels += `<text class="gc-axis" x="${xAt(i).toFixed(1)}" y="${H-6}" text-anchor="middle">${fmtDate(timeline[i].date)}</text>`;
  }

  document.getElementById('growth-chart').innerHTML = `
    <div class="gc-wrap">
      <svg viewBox="0 0 ${W} ${H}" id="gc-svg" preserveAspectRatio="none">
        <defs><linearGradient id="gcg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#4ad6ff" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#4ad6ff" stop-opacity="0"/>
        </linearGradient></defs>
        <path d="${areaMsg}" fill="url(#gcg)"/>
        <path d="${lineMsg}" fill="none" stroke="#4ad6ff" stroke-width="2"/>
        <path d="${lineUsr}" fill="none" stroke="#b566ff" stroke-width="2"/>
        <text class="gc-axis" x="${PADL}" y="${PADT+4}" text-anchor="end">${fmt(maxMsg)}</text>
        ${xlabels}
        <line id="gc-guide" x1="0" y1="${PADT}" x2="0" y2="${H-PADB}" stroke="#4ad6ff" stroke-width="1" stroke-dasharray="3 3" opacity="0"/>
        <circle id="gc-dot-msg" r="4" fill="#4ad6ff" opacity="0"/>
        <circle id="gc-dot-usr" r="4" fill="#b566ff" opacity="0"/>
      </svg>
      <div class="gc-tooltip" id="gc-tooltip"></div>
    </div>`;

  // ── интерактивный hover ──
  const wrap = document.querySelector('.gc-wrap');
  const svg  = document.getElementById('gc-svg');
  const guide = document.getElementById('gc-guide');
  const dotM = document.getElementById('gc-dot-msg');
  const dotU = document.getElementById('gc-dot-usr');
  const tip  = document.getElementById('gc-tooltip');

  function onMove(ev) {
    const rect = svg.getBoundingClientRect();
    const px = (ev.clientX - rect.left) / rect.width * W;       // в координатах viewBox
    let i = Math.round((px - PADL) / ((W - PADL - PADR) / Math.max(n - 1, 1)));
    i = Math.max(0, Math.min(n - 1, i));
    const d = timeline[i];
    const x = xAt(i), ym = yMsg(d.messages), yu = yUsr(d.activeUsers);
    guide.setAttribute('x1', x); guide.setAttribute('x2', x); guide.setAttribute('opacity', '0.5');
    dotM.setAttribute('cx', x); dotM.setAttribute('cy', ym); dotM.setAttribute('opacity', '1');
    dotU.setAttribute('cx', x); dotU.setAttribute('cy', yu); dotU.setAttribute('opacity', '1');
    tip.style.opacity = '1';
    tip.innerHTML = `<div class="gc-tt-date">${fmtDate(d.date)}</div>
      <div class="gc-tt-row"><span class="gc-tt-dot" style="background:#4ad6ff"></span>${d.messages.toLocaleString()} msgs</div>
      <div class="gc-tt-row"><span class="gc-tt-dot" style="background:#b566ff"></span>${d.activeUsers.toLocaleString()} users</div>`;
    const leftPx = x / W * rect.width;
    tip.style.left = Math.min(Math.max(leftPx, 50), rect.width - 50) + 'px';
  }
  function onLeave() {
    guide.setAttribute('opacity', '0');
    dotM.setAttribute('opacity', '0'); dotU.setAttribute('opacity', '0');
    tip.style.opacity = '0';
  }
  wrap.addEventListener('mousemove', onMove);
  wrap.addEventListener('mouseleave', onLeave);
}

// GitHub-style дискретная палитра (5 уровней)
const HM_PALETTE = ['#0e1124', '#16384a', '#1d6985', '#2ba0c8', '#4ad6ff'];
function hmLevel(v, max) {
  if (v <= 0) return 0;
  const t = v / max;
  if (t <= 0.25) return 1;
  if (t <= 0.50) return 2;
  if (t <= 0.75) return 3;
  return 4;
}

function renderHeatmap(hm) {
  if (!hm) return;
  const grid = hm.grid, dow = hm.dow;
  const order = [1,2,3,4,5,6,0]; // Mon..Sun
  let max = 0;
  for (const row of grid) for (const v of row) max = Math.max(max, v);

  let rows = '';
  for (const di of order) {
    let cells = '';
    for (let h = 0; h < 24; h++) {
      const v = grid[di][h];
      const lvl = hmLevel(v, max);
      cells += `<div class="hm-cell" style="background:${HM_PALETTE[lvl]}" title="${dow[di]} ${h}:00 UTC — ${v.toLocaleString()} msg"></div>`;
    }
    rows += `<div class="hm-row"><span class="hm-daylabel">${dow[di]}</span>${cells}</div>`;
  }
  let hours = '';
  for (let h = 0; h < 24; h++) hours += `<span class="hm-hour">${h % 6 === 0 ? h : ''}</span>`;

  // легенда Less → More
  const legend = `<div class="hm-legend"><span>Less</span>${HM_PALETTE.map(c => `<span class="hm-leg-cell" style="background:${c}"></span>`).join('')}<span>More</span></div>`;

  document.getElementById('heatmap').innerHTML =
    `<div class="hm-grid">${rows}</div><div class="hm-hours">${hours}</div>${legend}`;
}

function renderBreakdown(elId, counts, colors) {
  if (!counts) return;
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((a, [,v]) => a + v, 0) || 1;
  document.getElementById(elId).innerHTML = entries.map(([k, v]) => {
    const pct = (v / total * 100);
    const col = colors[k] || '#5a608a';
    return `<div class="bd-row">
      <div class="bd-head">
        <span class="bd-label">${k}</span>
        <span class="bd-val">${pct.toFixed(1)}% · ${fmt(v)}</span>
      </div>
      <div class="bd-track"><div class="bd-fill" style="width:${pct}%;background:${col}"></div></div>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════════════════════════
//  CONTRIBUTORS TAB
// ════════════════════════════════════════════════════════════════════════════════
let currentSearch = '', currentPage = 0;
const PAGE_SIZE = 25;

function filterUsers() {
  let list = topContribs;   // только топ-200 кураторских
  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    list = list.filter(u =>
      u.username.toLowerCase().includes(q) ||
      (u.nickname || '').toLowerCase().includes(q) ||
      (u.xHandle  || '').toLowerCase().includes(q));
  }
  return list;
}

function renderTable() {
  const filtered = filterUsers();
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  currentPage = Math.max(0, Math.min(currentPage, pages - 1));
  const slice = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const container = document.getElementById('rows');

  if (!slice.length) {
    container.innerHTML = '<div style="text-align:center;padding:48px;color:#3a4060">No contributors found</div>';
  } else {
    container.innerHTML = slice.map(u => {
      const avatarStyle = u.avatarUrl ? `background-image:url('${u.avatarUrl}');color:transparent` : '';
      const handle = u.xHandle ? `@${u.xHandle}` : `@${u.username}`;
      const score = u.review.score;
      const rank  = u.topRank;

      return `<div class="an-row an-row-simple" data-username="${escHtml(u.username)}">
        <div class="row-rank ${rank <= 3 ? 'top3' : ''}">${rank}</div>
        <div class="row-user">
          <div class="row-avatar" style="${avatarStyle}">${avatarStyle ? '' : initials(u.nickname || u.username)}</div>
          <div class="row-name-wrap">
            <div class="row-name">${escHtml(u.nickname || u.username)}</div>
            <div class="row-handle">${escHtml(u.review.role)}</div>
          </div>
        </div>
        <div class="row-cscore-big">
          <div class="cscore-big-bar"><div class="cscore-big-fill" style="width:${score}%"></div><div class="cscore-big-num">${score}</div></div>
        </div>
      </div>`;
    }).join('');
  }

  const pag = document.getElementById('pagination');
  if (pages <= 1) pag.style.display = 'none';
  else {
    pag.style.display = 'flex';
    const from = currentPage * PAGE_SIZE + 1, to = Math.min((currentPage + 1) * PAGE_SIZE, total);
    document.getElementById('page-info').textContent = `${from} – ${to}`;
    document.getElementById('prev-page').disabled = currentPage === 0;
    document.getElementById('next-page').disabled = currentPage >= pages - 1;
  }
  document.getElementById('footer-stats').textContent = `${total.toLocaleString()} contributors`;

  container.querySelectorAll('.an-row').forEach(row =>
    row.addEventListener('click', () => openModal(row.dataset.username)));
}

// ── Авто-ревью контрибьютора (анализ всех его сообщений + X) ───────────────────
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function chTag(name) { return `<span class="rv-ch">${escHtml(name)}</span>`; }

// детерминированный хэш имени → стабильная вариация формулировок per-user
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); }
const choose = (arr, seed) => arr[seed % arr.length];
function joinNicely(arr) {
  if (arr.length <= 1) return arr[0] || '';
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
  return `${arr.slice(0, -1).join(', ')}, and ${arr[arr.length - 1]}`;
}

// ── эталонные медианы по активным юзерам (для отклонений) ──
const _activeMetas = Object.values(cMeta).filter(m => m.messages >= 20);
function _median(vals) { const s = vals.filter(v => !isNaN(v) && isFinite(v)).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; }
const REF = {
  replyRatio:   _median(_activeMetas.map(m => m.repliesGiven / Math.max(m.messages, 1))) || 0.2,
  reactsPerMsg: _median(_activeMetas.map(m => m.reactionsReceived / Math.max(m.messages, 1))) || 0.05,
  perDay:       _median(_activeMetas.map(m => m.messages / Math.max(m.activeDays, 1))) || 5,
  channels:     _median(_activeMetas.map(m => m.channels)) || 2,
};
const _msgsSorted = _activeMetas.map(m => m.messages).sort((a, b) => a - b);
function msgPercentile(v) {
  if (!_msgsSorted.length) return 50;
  let lo = 0, hi = _msgsSorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (_msgsSorted[mid] < v) lo = mid + 1; else hi = mid; }
  return Math.round(lo / _msgsSorted.length * 100);
}

function generateReview(u) {
  const m = u.meta;
  const msgs  = m?.messages || 0;
  const posts = u.posts || 0;
  const seed  = hashStr(u.username);

  // ── почти нет Discord-активности ──
  if (msgs < 5) {
    if (posts > 0) return { role: 'X Creator', text: choose([
      `Builds presence mainly on <b>𝕏</b> — ${posts} post${posts>1?'s':''} pulling <b>${fmt(u.views)}</b> views. Barely shows up in Discord.`,
      `An <b>𝕏</b>-first voice: ${posts} post${posts>1?'s':''}, ${fmt(u.views)} views, ${fmt(u.likes)} likes — but quiet in the chat.`,
      `Most of their footprint is on <b>𝕏</b> (${fmt(u.views)} views across ${posts} post${posts>1?'s':''}), with little Discord presence so far.`,
    ], seed) };
    return { role: 'Newcomer', text: choose([
      'Still finding their footing — too few messages to read a pattern yet.',
      'A fresh face who has barely left any tracks so far.',
      'Just getting started; not enough activity to profile yet.',
    ], seed) };
  }

  const bt = m.byType || {};
  const share = k => msgs ? (bt[k] || 0) / msgs : 0;
  const replyRatio   = m.repliesGiven / msgs;
  const reacts       = m.reactionsReceived || 0;
  const reactsPerMsg = reacts / msgs;
  const perDay       = msgs / Math.max(m.activeDays, 1);
  const pct          = msgPercentile(msgs);
  const topCh        = m.topChannels && m.topChannels[0];
  const focus        = topCh ? topCh.count / msgs : 0;

  // ── роль ──
  let role;
  if (replyRatio >= 0.45 && reacts >= 100)       role = 'Trusted Helper';
  else if (replyRatio >= 0.45)                   role = 'Community Helper';
  else if (posts >= 5 || share('alpha') >= 0.12) role = 'Content Creator';
  else if (share('question') >= 0.28)            role = 'Curious Learner';
  else if (share('technical') >= 0.15)           role = 'Tech Contributor';
  else if (msgs >= 2000)                         role = 'Community Pillar';
  else if (msgs >= 200)                          role = 'Engaged Member';
  else                                           role = 'Casual Member';

  // ── черты-кандидаты (вес = насколько ярко выражено) ──
  const traits = [];
  if (replyRatio >= 0.4) traits.push({ w: replyRatio, t: choose([
    `answer constantly — ${Math.round(replyRatio*100)}% of their messages are replies to others`,
    `spend most of their time responding (${Math.round(replyRatio*100)}% replies)`,
    `act as a go-to responder, with ${Math.round(replyRatio*100)}% of messages aimed at helping others`,
  ], seed) });

  if (perDay >= REF.perDay * 1.8) traits.push({ w: perDay / REF.perDay, t: choose([
    `fire off ~${Math.round(perDay)} messages on the days they show up`,
    `go all-in when online — around ${Math.round(perDay)} messages per active day`,
  ], seed >> 1) });

  if (reactsPerMsg >= REF.reactsPerMsg * 1.6 && reacts >= 30) traits.push({ w: reactsPerMsg / (REF.reactsPerMsg || 0.01), t: choose([
    `clearly resonate — a reaction roughly every ${Math.max(1, Math.round(1/reactsPerMsg))} messages`,
    `get noticed: <b>${fmt(reacts)}</b> reactions collected from the community`,
  ], seed >> 2) });
  else if (reacts >= 200) traits.push({ w: 1.2, t: `have racked up <b>${fmt(reacts)}</b> community reactions` });

  if (focus >= 0.6 && topCh) traits.push({ w: focus + 0.5, t: choose([
    `practically live in ${chTag(topCh.name)}`,
    `call ${chTag(topCh.name)} home`,
  ], seed >> 3) });
  else if (m.channels >= Math.max(8, REF.channels * 4)) traits.push({ w: m.channels / REF.channels, t: `roam widely across <b>${m.channels}</b> channels` });
  else if (topCh) traits.push({ w: 0.4, t: `are most at home in ${chTag(topCh.name)}` });

  if (m.activeDayPct >= 40) traits.push({ w: m.activeDayPct / 40, t: choose([
    `show up almost every single day`,
    `are a near-daily regular`,
  ], seed >> 4) });
  else if (perDay >= REF.perDay * 2 && m.activeDayPct < 18) traits.push({ w: 0.7, t: `appear in intense bursts rather than daily` });

  if (share('question') >= 0.2) traits.push({ w: share('question') * 2, t: choose([
    `keep the conversation moving with lots of questions`,
    `are one of the chat's question-askers`,
  ], seed >> 5) });

  if (share('alpha') >= 0.06) traits.push({ w: share('alpha') * 3, t: `regularly drop alpha and 𝕏 links` });
  if (share('technical') >= 0.1) traits.push({ w: share('technical') * 2, t: `dig into technical and support topics` });
  if (share('meme') >= 0.22) traits.push({ w: share('meme'), t: `keep things light with memes and media` });

  if (m.sentPos > m.sentNeg * 3 && m.sentPos > 30) traits.push({ w: 0.5, t: choose([
    `bring an upbeat, bullish energy`, `keep the vibe positive`,
  ], seed >> 6) });
  else if (m.sentNeg > m.sentPos && m.sentNeg > 20) traits.push({ w: 0.5, t: `aren't shy about flagging problems and concerns` });

  // топ-2..3 ярких черты
  traits.sort((a, b) => b.w - a.w);
  const chosen = traits.slice(0, 3).map(x => x.t);

  // ── положение в комьюнити ──
  const standing = pct >= 99 ? 'one of the most active members in the entire server'
    : pct >= 90 ? `among the top ${Math.max(1, 100 - pct)}% most active`
    : pct >= 60 ? 'a solidly active regular'
    : pct >= 30 ? 'a steady participant'
    : 'an occasional contributor';

  const name = u.nickname || u.username;
  const openers = [
    `<b>${escHtml(name)}</b> is ${standing}.`,
    `${cap(standing)} of the community.`,
    `Stands out as ${standing}.`,
  ];
  let text = choose(openers, seed >> 7);

  if (chosen.length) text += ` They ${joinNicely(chosen)}.`;

  if (posts > 0) {
    const themes = (ANALYTICS?.xThemes || {})[u.username] || [];
    text += ` ${choose([
      `On <b>𝕏</b> they've posted ${posts} time${posts>1?'s':''} for ${fmt(u.views)} views`,
      `Off-platform, their ${posts} <b>𝕏</b> post${posts>1?'s':''} pulled ${fmt(u.views)} views and ${fmt(u.likes)} likes`,
    ], seed >> 8)}`;
    if (themes.length) {
      const tagged = themes.map(t => `<span class="rv-theme">${escHtml(t)}</span>`);
      text += `, mostly about ${joinNicely(tagged)}.`;
    } else {
      text += '.';
    }
  }

  return { role, text };
}

function openModal(username) {
  // в топ-200 берём из topContribs (с topRank + review), иначе из enriched
  const u = topContribs.find(x => x.username === username) || enriched.find(x => x.username === username);
  if (!u) return;
  const m = u.meta || {};

  // ревью: сначала кураторское (Claude), иначе авто-эвристика
  const curated = (window.REVIEWS_DATA || {})[u.username];
  const review = curated ? { role: curated.role, text: curated.text } : generateReview(u);
  // скор: ручной из reviews.json, либо алгоритмический composite если кураторского нет
  const displayScore = (curated && typeof curated.score === 'number') ? curated.score : u.comp.composite;
  document.getElementById('m-review-role').textContent = review.role;
  document.getElementById('m-review-text').innerHTML = review.text;
  document.getElementById('m-review-tag').innerHTML = curated
    ? '<i class="ti ti-sparkles"></i> reviewed'
    : '<i class="ti ti-sparkles"></i> auto-profile';

  const avatarEl = document.getElementById('m-avatar');
  if (u.avatarUrl) { avatarEl.style.backgroundImage = `url('${u.avatarUrl}')`; avatarEl.style.color = 'transparent'; avatarEl.textContent = ''; }
  else { avatarEl.style.backgroundImage = ''; avatarEl.style.color = ''; avatarEl.textContent = initials(u.nickname || u.username); }

  document.getElementById('m-name').textContent = u.nickname || u.username;
  document.getElementById('m-cscore-num').textContent = displayScore;   // ручной скор из reviews.json
  document.getElementById('m-rank-lbl').textContent = `#${u.topRank || u.rank} in Top Contributors`;
  document.getElementById('m-handles').textContent =
    [`@${u.username}`, u.xHandle ? `𝕏 @${u.xHandle}` : null].filter(Boolean).join('  ·  ');
  document.getElementById('m-tier').innerHTML = '';   // tier скрыт в Top Contributors

  // Score Breakdown скрыт в Top Contributors (алгоритмический не совпадает с ручным скором)
  const compsWrap = document.getElementById('m-components');
  const compsTitle = compsWrap?.previousElementSibling;
  if (compsWrap) compsWrap.style.display = 'none';
  if (compsTitle && compsTitle.classList.contains('modal-section-title')) compsTitle.style.display = 'none';

  document.getElementById('m-stats').innerHTML = [
    { label:'Messages', val: fmt(m.messages || u.dcMessages || 0) },
    { label:'Reactions', val: fmt(m.reactionsReceived || 0) },
    { label:'X Posts', val: fmt(u.posts) },
    { label:'X Views', val: fmt(u.views) },
  ].map(s => `<div class="m-stat"><div class="m-stat-val">${s.val}</div><div class="m-stat-lbl">${s.label}</div></div>`).join('');

  // Rank History скрыт в Top Contributors — не нужен здесь
  const histWrap = document.getElementById('m-history-wrap');
  if (histWrap) histWrap.style.display = 'none';

  document.getElementById('modal-overlay').classList.remove('hidden');
}

function renderSparkline(history) {
  const W = 456, H = 72, PX = 10, PY = 16;
  const ranks = history.map(s => s.rank);
  const minR = Math.min(...ranks), maxR = Math.max(...ranks), range = maxR - minR || 1;
  const xStep = (W - PX * 2) / Math.max(history.length - 1, 1);
  const toX = i => PX + i * xStep;
  const toY = r => PY + ((r - minR) / range) * (H - PY * 2);
  const pts = history.map((s, i) => [toX(i), toY(s.rank)]);
  const d = pts.map((p, i) => `${i?'L':'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = d + ` L${pts[pts.length-1][0].toFixed(1)},${H} L${PX},${H} Z`;
  const dots = history.map((s, i) => {
    const [x, y] = pts[i], last = i === history.length - 1;
    return `<text x="${x.toFixed(1)}" y="${(y-6).toFixed(1)}" fill="${last?'#4ad6ff':'#3a4060'}" font-size="9" text-anchor="middle">#${s.rank}</text>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${last?4:3}" fill="${last?'#4ad6ff':'#2a3060'}"/>`;
  }).join('');
  return `<div class="sparkline-dates"><span>${fmtDate(history[0].date)}</span><span>${fmtDate(history[history.length-1].date)}</span></div>
    <svg class="sparkline-svg" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#4ad6ff" stop-opacity="0.15"/><stop offset="100%" stop-color="#4ad6ff" stop-opacity="0"/></linearGradient></defs>
      <path d="${area}" fill="url(#sg)"/>
      <path d="${d}" fill="none" stroke="#1a1d3a" stroke-width="2.5"/>
      <path d="${d}" fill="none" stroke="#4ad6ff" stroke-width="1.5" opacity="0.8"/>
      ${dots}
    </svg>`;
}

function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }

// ════════════════════════════════════════════════════════════════════════════════
//  CHANNELS TAB
// ════════════════════════════════════════════════════════════════════════════════
let chStatusFilter = 'all';
let chKindFilter = 'text';
const STATUS_ICON = { growing:'ti-trending-up', alive:'ti-activity', declining:'ti-trending-down', dead:'ti-zzz', 'spam-heavy':'ti-trash' };
const HIDDEN_CHANNEL_MARKERS = ['中文', 'дё­ж'];

function isHiddenChannel(c) {
  const text = `${c.name || ''} ${c.category || ''}`;
  return HIDDEN_CHANNEL_MARKERS.some(marker => text.includes(marker));
}

function renderChannels() {
  // подпись периода
  const noteEl = document.getElementById('ch-period-note');
  if (noteEl && ANALYTICS?.refDate) {
    const ref = new Date(ANALYTICS.refDate + 'T00:00:00Z');
    const from = new Date(ref.getTime() - 6 * 86400000);
    noteEl.textContent = `Last 7 days · ${fmtDate(from.toISOString().slice(0,10))} – ${fmtDate(ANALYTICS.refDate)}`;
  }

  const list = (ANALYTICS?.channels || []).filter(c =>
    !isHiddenChannel(c) &&
    (chStatusFilter === 'all' || c.status === chStatusFilter) &&
    (chKindFilter === 'all' || (chKindFilter === 'voice' ? c.isVoice : !c.isVoice)));
  const container = document.getElementById('channel-rows');
  if (!list.length) {
    container.innerHTML = '<div style="text-align:center;padding:48px;color:#3a4060">No channels</div>';
    return;
  }
  container.innerHTML = list.map(c => {
    const gcol = c.growth > 0 ? '#4ade80' : c.growth < 0 ? '#f87171' : '#5a608a';
    const gtxt = (c.growth > 0 ? '+' : '') + c.growth + '%';
    const voiceTag = c.isVoice ? '<i class="ti ti-microphone chn-voice-ic"></i> ' : '';
    return `<div class="chn-row">
      <div class="chn-name-wrap">
        <div class="chn-name">${voiceTag}${escHtml(c.name)}</div>
        <div class="chn-cat">${escHtml(c.category)}</div>
      </div>
      <div class="chn-num">${fmt(c.messagesWeek)}</div>
      <div class="chn-num">${fmt(c.usersWeek)}</div>
      <div class="chn-num">${c.replyRatio}%</div>
      <div class="chn-growth" style="color:${gcol}">${gtxt}</div>
      <div class="chn-status"><span class="status-badge status-${c.status}"><i class="ti ${STATUS_ICON[c.status]}"></i>${c.status}</span></div>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════════════════════════
(function init() {
  renderOverview();
  renderTable();
  renderChannels();

  // Tab switching (с поддержкой hash в URL)
  function selectTab(name) {
    const btn = document.querySelector(`[data-tab="${name}"]`);
    if (!btn) return false;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + name).classList.add('active');
    return true;
  }
  document.getElementById('tab-bar').addEventListener('click', e => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    selectTab(btn.dataset.tab);
    history.replaceState(null, '', '#' + btn.dataset.tab);
  });
  // hash-роутинг: /analytics/#spotlight → сразу открываем Spotlight
  const initialHash = (location.hash || '').replace(/^#/, '');
  if (initialHash) selectTab(initialHash);
  window.addEventListener('hashchange', () => {
    const h = (location.hash || '').replace(/^#/, '');
    if (h) selectTab(h);
  });

  document.getElementById('an-search').addEventListener('input', e => {
    currentSearch = e.target.value.trim(); currentPage = 0; renderTable();
  });

  document.getElementById('prev-page').addEventListener('click', () => { currentPage--; renderTable(); });
  document.getElementById('next-page').addEventListener('click', () => { currentPage++; renderTable(); });

  // Channel status filter
  document.getElementById('ch-filter').addEventListener('click', e => {
    const btn = e.target.closest('[data-chstatus]');
    if (!btn) return;
    chStatusFilter = btn.dataset.chstatus;
    document.querySelectorAll('#ch-filter .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderChannels();
  });

  // Channel kind filter (text / voice / all)
  document.getElementById('ch-kind').addEventListener('click', e => {
    const btn = e.target.closest('[data-chkind]');
    if (!btn) return;
    chKindFilter = btn.dataset.chkind;
    document.querySelectorAll('#ch-kind .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderChannels();
  });

  // Modal
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target.id === 'modal-overlay') closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
})();
