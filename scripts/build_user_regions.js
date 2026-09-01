/**
 * Assigns one region to each user from their message counts in regional channels.
 * Also writes a review report for the all-time top 500.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const JSON_DIR = path.join(__dirname, '..', 'json');
const DATA_DIR = path.join(__dirname, '..', 'data');
const OUT_FILE = path.join(DATA_DIR, 'user_regions.json');
const REVIEW_FILE = path.join(DATA_DIR, 'region_review_top500.json');
const ALIASES_FILE = path.join(__dirname, 'aliases.json');
const OVERRIDES_FILE = path.join(__dirname, 'region_overrides.json');

const REGION_RULES = [
  { region: 'Bangladesh', pattern: /bangladesh/i },
  { region: 'India', pattern: /\bindia(?:n)?\b/i },
  { region: 'Nigeria', pattern: /nigeria/i },
  { region: 'Vietnam', pattern: /vietnam/i },
  { region: 'Indonesia', pattern: /indonesia/i },
  { region: 'Ukraine', pattern: /ukraine/i },
  { region: 'Russia', pattern: /russian/i },
  { region: 'Arabic', pattern: /arabic/i },
  { region: 'China', pattern: /chinese|china|chines|中文/i },
  { region: 'Turkey', pattern: /turkey/i },
];
const VALID_REGIONS = new Set(REGION_RULES.map(rule => rule.region));

const rawAliases = JSON.parse(fs.readFileSync(ALIASES_FILE, 'utf8'));
const aliases = Object.fromEntries(Object.entries(rawAliases).filter(([key]) => !key.startsWith('_')));
const resolveAlias = username => aliases[username] || username;

let overrides = {};
if (fs.existsSync(OVERRIDES_FILE)) {
  const rawOverrides = JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8'));
  overrides = Object.fromEntries(Object.entries(rawOverrides).filter(([key]) => !key.startsWith('_')));
  for (const [username, region] of Object.entries(overrides)) {
    if (!VALID_REGIONS.has(region)) throw new Error(`Invalid region override for ${username}: ${region}`);
  }
}

function decodeJsonString(value) {
  try { return JSON.parse(`"${value}"`); }
  catch { return value; }
}

function readChannelLabel(file) {
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.alloc(32768);
  const size = fs.readSync(fd, buffer, 0, buffer.length, 0);
  fs.closeSync(fd);
  const header = buffer.toString('utf8', 0, size);
  const channel = header.match(/"channel"\s*:\s*\{([\s\S]*?)\}\s*,\s*"messages"/i)?.[1] || header;
  const category = channel.match(/"category"\s*:\s*"((?:[^"\\]|\\.)*)"/i)?.[1] || '';
  const name = channel.match(/"name"\s*:\s*"((?:[^"\\]|\\.)*)"/i)?.[1] || '';
  return `${decodeJsonString(category)} ${decodeJsonString(name)} ${path.basename(file)}`;
}

function classifyRegion(file) {
  const label = readChannelLabel(file);
  return REGION_RULES.find(rule => rule.pattern.test(label))?.region || null;
}

function findRegionalFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findRegionalFiles(full, out);
    else if (entry.name.endsWith('.json')) {
      const region = classifyRegion(full);
      if (region) out.push({ file: full, region });
    }
  }
  return out;
}

function scanFile(file, region) {
  return new Promise(resolve => {
    const counts = {};
    const input = fs.createReadStream(file, { encoding: 'utf8' });
    const rl = readline.createInterface({ input, crlfDelay: Infinity });
    let inAuthor = false;
    let depth = 0;
    let pendingType = null;
    let messageType = null;
    let username = null;
    let isBot = false;

    rl.on('line', line => {
      const text = line.trim();
      if (!inAuthor) {
        if (text.startsWith('"type":')) {
          const type = text.replace('"type":', '').trim().replace(/[",\s]/g, '');
          pendingType = type === 'Default' || type === 'Reply' ? type : null;
        }
        if (text === '"author": {') {
          inAuthor = true;
          depth = 1;
          messageType = pendingType;
          username = null;
          isBot = false;
        }
        return;
      }

      for (const char of text) {
        if (char === '{' || char === '[') depth++;
        else if (char === '}' || char === ']') depth--;
      }
      if (depth === 1) {
        const nameMatch = text.match(/^"name":\s*"((?:[^"\\]|\\.)*)"/);
        if (nameMatch) username = decodeJsonString(nameMatch[1]);
        if (text.startsWith('"isBot":')) isBot = text.includes('true');
      }
      if (depth <= 0) {
        inAuthor = false;
        if (!isBot && username && messageType) {
          const canonical = resolveAlias(username);
          counts[canonical] = (counts[canonical] || 0) + 1;
        }
        pendingType = null;
      }
    });
    rl.on('close', () => resolve({ region, counts }));
  });
}

async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runWorker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runWorker));
  return results;
}

function rankRegions(counts) {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function mainUserRecord(username, counts) {
  const ranked = rankRegions(counts);
  if (!ranked.length) return null;
  const [primaryRegion, primaryMessages] = ranked[0];
  const [secondRegion, secondMessages] = ranked[1] || [null, 0];
  const totalMessages = ranked.reduce((sum, [, count]) => sum + count, 0);
  const override = overrides[username];
  return {
    region: override || primaryRegion,
    source: override ? 'override' : 'messages',
    messages: primaryMessages,
    totalRegionalMessages: totalMessages,
    sharePct: Math.round(primaryMessages / totalMessages * 1000) / 10,
    runnerUp: secondRegion ? { region: secondRegion, messages: secondMessages } : null,
    counts: Object.fromEntries(ranked),
  };
}

async function main() {
  const files = findRegionalFiles(JSON_DIR);
  const filesByRegion = {};
  for (const item of files) filesByRegion[item.region] = (filesByRegion[item.region] || 0) + 1;
  console.log(`Regional files: ${files.length} ${JSON.stringify(filesByRegion)}`);
  if (process.argv.includes('--list-only')) {
    for (const item of files) console.log(`${item.region}\t${path.relative(JSON_DIR, item.file)}`);
    return;
  }

  const startedAt = Date.now();
  const scans = await runPool(files, 8, async ({ file, region }, index) => {
    const result = await scanFile(file, region);
    const total = Object.values(result.counts).reduce((sum, count) => sum + count, 0);
    console.log(`  ${index + 1}/${files.length} ${region}: ${path.relative(JSON_DIR, file)} (${total})`);
    return result;
  });

  const countsByUser = {};
  for (const { region, counts } of scans) {
    for (const [username, count] of Object.entries(counts)) {
      const userCounts = countsByUser[username] || (countsByUser[username] = {});
      userCounts[region] = (userCounts[region] || 0) + count;
    }
  }

  const users = {};
  for (const [username, counts] of Object.entries(countsByUser)) {
    const record = mainUserRecord(username, counts);
    if (record) users[username] = record;
  }

  const scores = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'scores.json'), 'utf8'));
  const currentRoles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'current_roles.json'), 'utf8'));
  const currentMembers = new Set(
    Object.entries(currentRoles)
      .filter(([, roles]) => Array.isArray(roles) && roles.length > 0)
      .map(([username]) => username.toLowerCase()),
  );
  const top500 = (scores.users || [])
    .filter(user => !user.team && currentMembers.has(user.username.toLowerCase()))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 500);

  const closeSplit = [];
  const lowEvidence = [];
  const noData = [];
  for (const user of top500) {
    const regional = users[user.username];
    const base = { rank: user.rank, username: user.username, nickname: user.nickname };
    if (!regional) { noData.push(base); continue; }
    const runnerUpMessages = regional.runnerUp?.messages || 0;
    const ratio = regional.messages ? runnerUpMessages / regional.messages : 0;
    const detail = { ...base, ...regional, runnerUpRatioPct: Math.round(ratio * 1000) / 10 };
    if (regional.totalRegionalMessages < 10) lowEvidence.push(detail);
    if (regional.runnerUp && ratio >= 0.8) closeSplit.push(detail);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    method: 'Region with the most messages across all regional Discord channels',
    regions: REGION_RULES.map(rule => rule.region),
    users,
  };
  const review = {
    generatedAt: output.generatedAt,
    topLimit: 500,
    reviewedUsers: top500.length,
    rules: {
      closeSplit: 'Runner-up region has at least 80% of primary region messages',
      lowEvidence: 'Fewer than 10 total messages in regional channels',
    },
    closeSplit,
    lowEvidence,
    noData,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
  fs.writeFileSync(REVIEW_FILE, JSON.stringify(review, null, 2));
  console.log(`Assigned users: ${Object.keys(users).length}`);
  console.log(`Top 500 review: close=${closeSplit.length}, low=${lowEvidence.length}, noData=${noData.length}`);
  console.log(`Done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

main().catch(error => { console.error(error); process.exit(1); });
