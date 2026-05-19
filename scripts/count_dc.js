/**
 * Параллельный счётчик сообщений Discord.
 * Обрабатывает все JSON-файлы одновременно через Promise.all.
 * Результат сохраняется в data/dc_stats.json.
 */

const fs = require('fs');
const readline = require('readline');
const path = require('path');

// Декодирует \uXXXX escape-последовательности из JSON-строки
function decodeJsonStr(s) {
  return s.replace(/\\u([0-9a-fA-F]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

const JSON_DIR = path.join(__dirname, '..', 'json');
const OUT_FILE = path.join(__dirname, '..', 'data', 'dc_stats.json');

function processFile(filePath) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    const counts = {};
    const nicknames = {};
    const avatars = {};

    let inAuthor = false;
    let authorDepth = 0;
    let msgType = null;
    let pendingType = null;
    let name = null;
    let nickname = null;
    let avatar = null;
    let isBot = false;

    rl.on('line', (line) => {
      const t = line.trim();

      // Тип сообщения (до блока author)
      if (!inAuthor && t.startsWith('"type":')) {
        const v = t.replace('"type":', '').trim().replace(/[",\s]/g, '');
        pendingType = (v === 'Default' || v === 'Reply') ? v : null;
      }

      // Начало блока author
      if (!inAuthor && t === '"author": {') {
        inAuthor = true;
        authorDepth = 1;
        msgType = pendingType;
        name = nickname = avatar = null;
        isBot = false;
        return;
      }

      if (!inAuthor) return;

      // Отслеживаем вложенность
      for (const ch of t) {
        if (ch === '{' || ch === '[') authorDepth++;
        else if (ch === '}' || ch === ']') authorDepth--;
      }

      // Читаем только прямые свойства author (глубина 1)
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

      // Выход из блока author
      if (authorDepth <= 0) {
        inAuthor = false;
        if (!isBot && name && msgType) {
          counts[name] = (counts[name] || 0) + 1;
          if (!nicknames[name] && nickname) nicknames[name] = nickname;
          if (!avatars[name] && avatar) avatars[name] = avatar;
        }
        pendingType = null;
      }
    });

    rl.on('close', () => resolve({ counts, nicknames, avatars }));
  });
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

async function main() {
  const files = findJsonFiles(JSON_DIR);
  console.log(`Обрабатываем ${files.length} файлов параллельно...`);

  const start = Date.now();

  // Все файлы — одновременно
  const results = await Promise.all(
    files.map(fp => {
      const label = path.relative(JSON_DIR, fp);
      return processFile(fp).then(r => {
        let total = Object.values(r.counts).reduce((a, b) => a + b, 0);
        console.log(`  ✓ ${label}: ${total} сообщений, ${Object.keys(r.counts).length} пользователей`);
        return r;
      });
    })
  );

  // Объединяем
  const totalCounts = {};
  const allNicknames = {};
  const allAvatars = {};

  for (const { counts, nicknames, avatars } of results) {
    for (const [u, c] of Object.entries(counts)) {
      totalCounts[u] = (totalCounts[u] || 0) + c;
      if (!allNicknames[u] && nicknames[u]) allNicknames[u] = nicknames[u];
      if (!allAvatars[u] && avatars[u]) allAvatars[u] = avatars[u];
    }
  }

  const output = {};
  for (const [u, c] of Object.entries(totalCounts)) {
    output[u] = {
      dcMessages: c,
      nickname: allNicknames[u] || u,
      avatarUrl: allAvatars[u] || '',
    };
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n✅ Готово за ${elapsed}с. Пользователей: ${Object.keys(output).length}`);
  console.log(`Сохранено: ${OUT_FILE}`);
}

main().catch(console.error);
