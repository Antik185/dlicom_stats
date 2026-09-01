/** Extracts the latest known Discord role snapshot for every user. */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const JSON_DIR = path.join(__dirname, '..', 'json');
const OUT_FILE = path.join(__dirname, '..', 'data', 'current_roles.json');
const ALIASES_FILE = path.join(__dirname, 'aliases.json');
const EXCLUDED_MEMBERS_FILE = path.join(__dirname, 'excluded_members.json');

const rawAliases = JSON.parse(fs.readFileSync(ALIASES_FILE, 'utf8'));
const aliases = Object.fromEntries(Object.entries(rawAliases).filter(([key]) => !key.startsWith('_')));
const resolveAlias = username => aliases[username] || username;
const excludedMembers = fs.existsSync(EXCLUDED_MEMBERS_FILE)
  ? new Set(JSON.parse(fs.readFileSync(EXCLUDED_MEMBERS_FILE, 'utf8')).users.map(resolveAlias))
  : new Set();

function findJsonFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findJsonFiles(full, out);
    else if (entry.name.endsWith('.json')) out.push(full);
  }
  return out;
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
  const files = findJsonFiles(JSON_DIR);
  console.log(`Latest known roles source: all exports (${files.length} files)`);
  const scans = await Promise.all(files.map(scanFile));
  const latestByUser = {};
  for (const scan of scans) {
    for (const [user, snapshot] of Object.entries(scan)) {
      const canonical = resolveAlias(user);
      if (!latestByUser[canonical] || snapshot.ts >= latestByUser[canonical].ts) latestByUser[canonical] = snapshot;
    }
  }
  for (const username of excludedMembers) latestByUser[username] = { ts: Number.MAX_SAFE_INTEGER, roles: [] };
  const output = Object.fromEntries(Object.entries(latestByUser).map(([user, snapshot]) => [user, snapshot.roles]));
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
  console.log(`Current roles: ${Object.keys(output).length} users`);
}

main().catch(error => { console.error(error); process.exit(1); });
