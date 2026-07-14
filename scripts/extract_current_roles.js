/** Extracts current Discord roles from the export folder with the latest end date. */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const JSON_DIR = path.join(__dirname, '..', 'json');
const OUT_FILE = path.join(__dirname, '..', 'data', 'current_roles.json');

function exportEndDate(dir) {
  const sample = fs.readdirSync(dir).find(name => name.endsWith('.json'));
  if (!sample) return 0;
  const fd = fs.openSync(path.join(dir, sample), 'r');
  const buffer = Buffer.alloc(16384);
  const size = fs.readSync(fd, buffer, 0, buffer.length, 0);
  fs.closeSync(fd);
  const match = buffer.toString('utf8', 0, size).match(/"before":\s*"([^"]+)"/);
  return match ? new Date(match[1]).getTime() : 0;
}

function latestExportDir() {
  const candidates = fs.readdirSync(JSON_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== 'spotlight')
    .map(entry => ({ dir: path.join(JSON_DIR, entry.name), end: exportEndDate(path.join(JSON_DIR, entry.name)) }))
    .filter(item => item.end > 0)
    .sort((a, b) => b.end - a.end);
  if (!candidates.length) throw new Error('No dated Discord export folders found');
  return candidates[0];
}

function scanFile(filePath) {
  return new Promise(resolve => {
    const rolesByUser = {};
    const rl = readline.createInterface({ input: fs.createReadStream(filePath, { encoding: 'utf8' }), crlfDelay: Infinity });
    let inAuthor = false, depth = 0, inRoles = false, name = null, isBot = false, pendingType = null, pendingTs = null;
    let roles = [];

    rl.on('line', line => {
      const text = line.trim();
      if (!inAuthor) {
        if (text.startsWith('"type":')) {
          const type = text.replace('"type":', '').trim().replace(/[",\s]/g, '');
          pendingType = type === 'Default' || type === 'Reply' ? type : null;
        }
        if (text.startsWith('"timestamp":')) {
          const match = text.match(/"timestamp":\s*"([^"]+)"/);
          if (match) pendingTs = new Date(match[1]).getTime();
        }
        if (text === '"author": {') {
          inAuthor = true; depth = 1; inRoles = false; name = null; isBot = false; roles = [];
        }
        return;
      }

      for (const char of text) {
        if (char === '{' || char === '[') depth++;
        else if (char === '}' || char === ']') depth--;
      }
      if (inRoles && depth < 2) inRoles = false;
      if (!inRoles && depth === 2 && text.includes('"roles"')) inRoles = true;
      if (inRoles && depth === 3 && text.startsWith('"name":')) {
        const match = text.match(/"name":\s*"((?:[^"\\]|\\.)*)"/);
        if (match) roles.push(JSON.parse(`"${match[1]}"`));
      }
      if (depth === 1) {
        const match = text.match(/^"name":\s*"((?:[^"\\]|\\.)*)"/);
        if (match) name = JSON.parse(`"${match[1]}"`);
        if (text.startsWith('"isBot":')) isBot = text.includes('true');
      }
      if (depth <= 0) {
        inAuthor = false;
        if (!isBot && name && pendingType && (!rolesByUser[name] || pendingTs >= rolesByUser[name].ts)) {
          rolesByUser[name] = { ts: pendingTs || 0, roles };
        }
        pendingType = pendingTs = null;
      }
    });
    rl.on('close', () => resolve(rolesByUser));
  });
}

async function main() {
  const latest = latestExportDir();
  const files = fs.readdirSync(latest.dir).filter(name => name.endsWith('.json')).map(name => path.join(latest.dir, name));
  console.log(`Current roles source: ${path.basename(latest.dir)} (${files.length} files)`);
  const scans = await Promise.all(files.map(scanFile));
  const latestByUser = {};
  for (const scan of scans) {
    for (const [user, snapshot] of Object.entries(scan)) {
      if (!latestByUser[user] || snapshot.ts >= latestByUser[user].ts) latestByUser[user] = snapshot;
    }
  }
  const output = Object.fromEntries(Object.entries(latestByUser).map(([user, snapshot]) => [user, snapshot.roles]));
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
  console.log(`Current roles: ${Object.keys(output).length} users`);
}

main().catch(error => { console.error(error); process.exit(1); });
