const fs = require('fs');
const readline = require('readline');
const path = require('path');

async function processFile(filePath) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: fs.createReadStream(filePath, {encoding:'utf8'}), crlfDelay: Infinity });
    const counts = {};
    const nicknames = {};
    const avatars = {};

    // State machine
    let inMessages = false;
    let inAuthor = false;
    let authorDepth = 0;
    let msgType = null;
    let authorName = null;
    let authorNickname = null;
    let authorAvatar = null;
    let authorIsBot = false;
    let pendingMsgType = null;

    rl.on('line', (line) => {
      const trimmed = line.trim();

      // Detect message type (comes before author block)
      if (!inAuthor && trimmed.startsWith('"type":')) {
        const val = trimmed.replace('"type":', '').trim().replace(/[",\s]/g, '');
        if (val === 'Default' || val === 'Reply') pendingMsgType = val;
        else pendingMsgType = null;
      }

      // Detect start of author block at depth 0 (direct property of message object)
      if (!inAuthor && trimmed === '"author": {') {
        inAuthor = true;
        authorDepth = 1;
        msgType = pendingMsgType;
        authorName = null;
        authorNickname = null;
        authorAvatar = null;
        authorIsBot = false;
        return;
      }

      if (inAuthor) {
        // Track depth
        for (const ch of trimmed) {
          if (ch === '{' || ch === '[') authorDepth++;
          else if (ch === '}' || ch === ']') authorDepth--;
        }

        // Only read direct properties of author (depth was 1 before any nested open)
        if (authorDepth === 1) {
          if (trimmed.startsWith('"name":')) {
            const m = trimmed.match(/"name":\s*"((?:[^"\\]|\\.)*)"/);
            if (m) authorName = m[1].replace(/\\(.)/g, '$1');
          }
          if (trimmed.startsWith('"nickname":')) {
            const m = trimmed.match(/"nickname":\s*"((?:[^"\\]|\\.)*)"/);
            if (m) authorNickname = m[1].replace(/\\(.)/g, '$1');
          }
          if (trimmed.startsWith('"avatarUrl":')) {
            const m = trimmed.match(/"avatarUrl":\s*"((?:[^"\\]|\\.)*)"/);
            if (m) authorAvatar = m[1].replace(/\\(.)/g, '$1');
          }
          if (trimmed.startsWith('"isBot":')) {
            authorIsBot = trimmed.includes('true');
          }
        }

        // Exit author block
        if (authorDepth <= 0) {
          inAuthor = false;
          if (!authorIsBot && authorName && msgType) {
            counts[authorName] = (counts[authorName] || 0) + 1;
            if (!nicknames[authorName] && authorNickname) nicknames[authorName] = authorNickname;
            if (!avatars[authorName] && authorAvatar) avatars[authorName] = authorAvatar;
          }
          pendingMsgType = null;
        }
      }
    });

    rl.on('close', () => resolve({counts, nicknames, avatars}));
  });
}

const jsonFiles = fs.readdirSync('json').filter(f => f.endsWith('.json'));

async function main() {
  const totalCounts = {};
  const allNicknames = {};
  const allAvatars = {};

  for (const file of jsonFiles) {
    process.stdout.write('Processing ' + file + '... ');
    const {counts, nicknames, avatars} = await processFile(path.join('json', file));
    let fileTotal = 0;
    for (const [user, count] of Object.entries(counts)) {
      totalCounts[user] = (totalCounts[user] || 0) + count;
      fileTotal += count;
      if (!allNicknames[user] && nicknames[user]) allNicknames[user] = nicknames[user];
      if (!allAvatars[user] && avatars[user]) allAvatars[user] = avatars[user];
    }
    console.log(fileTotal + ' msgs, ' + Object.keys(counts).length + ' users');
  }

  const sorted = Object.entries(totalCounts).sort((a,b) => b[1]-a[1]);
  console.log('\nTotal unique users:', sorted.length);
  console.log('Top 20 by DC messages:');
  sorted.slice(0,20).forEach(([name, count]) => {
    console.log(count, name, '|', allNicknames[name] || '');
  });

  const result = {};
  for (const [name, count] of Object.entries(totalCounts)) {
    result[name] = {
      dcMessages: count,
      nickname: allNicknames[name] || name,
      avatarUrl: allAvatars[name] || ''
    };
  }
  fs.writeFileSync('dc_stats.json', JSON.stringify(result, null, 2));
  console.log('\nSaved dc_stats.json with', Object.keys(result).length, 'users');
}

main().catch(console.error);
