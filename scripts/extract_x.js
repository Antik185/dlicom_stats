/**
 * Извлекает X-ссылки из каналов creators и dlicom-creators.
 * Результат: data/x_links.json
 * Формат: { discordName: { nickname, avatarUrl, posts: [{id, url, handle}] } }
 */

const fs = require('fs');
const path = require('path');

const JSON_DIR = path.join(__dirname, '..', 'json');
const OUT_FILE = path.join(__dirname, '..', 'data', 'x_links.json');

// Каналы, где публикуют X-посты
const SOURCE_NAMES = new Set(['creators.json', 'dlicom-creators.json']);

// Рекурсивно находит все файлы из SOURCE_NAMES в папке dir
function findSourceFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findSourceFiles(full));
    else if (SOURCE_NAMES.has(entry.name)) results.push(full);
  }
  return results;
}

// Паттерн: x.com/HANDLE/status/ID или twitter.com/HANDLE/status/ID
const X_POST_RE = /https?:\/\/(?:x\.com|twitter\.com)\/([^\/\s\?]+)\/status\/(\d+)/gi;

function extractFromFile(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const users = {};

  for (const msg of data.messages) {
    if (msg.author.isBot) continue;
    const content = msg.content || '';
    const authorName = msg.author.name;

    X_POST_RE.lastIndex = 0;
    let m;
    while ((m = X_POST_RE.exec(content)) !== null) {
      const rawHandle = m[1];
      const postId    = m[2];

      // Пропускаем официальные/системные аккаунты
      const EXCLUDED = new Set(['dlicomapp', 'dlicom']);
      if (EXCLUDED.has(rawHandle.toLowerCase())) continue;

      // Анонимные ссылки x.com/i/status/... — handle неизвестен, получим его при scrape
      const handle = rawHandle === 'i' ? null : rawHandle;

      if (!users[authorName]) {
        users[authorName] = {
          nickname: msg.author.nickname || msg.author.name,
          avatarUrl: msg.author.avatarUrl || '',
          posts: [],
          seenIds: new Set(),
        };
      }

      if (!users[authorName].seenIds.has(postId)) {
        users[authorName].seenIds.add(postId);
        users[authorName].posts.push({ id: postId, handle, url: `https://x.com/${handle || 'i'}/status/${postId}` });
      }
    }
  }

  return users;
}

function main() {
  const merged = {};
  const sourceFiles = findSourceFiles(JSON_DIR);
  console.log(`Найдено ${sourceFiles.length} X-файлов`);

  for (const fp of sourceFiles) {
    const fname = path.relative(JSON_DIR, fp);
    console.log(`Читаем ${fname}...`);
    const users = extractFromFile(fp);

    for (const [discordName, data] of Object.entries(users)) {
      if (!merged[discordName]) {
        merged[discordName] = {
          nickname: data.nickname,
          avatarUrl: data.avatarUrl,
          posts: [],
          seenIds: new Set(),
        };
      }
      for (const post of data.posts) {
        if (!merged[discordName].seenIds.has(post.id)) {
          merged[discordName].seenIds.add(post.id);
          merged[discordName].posts.push(post);
        }
      }
    }
  }

  // Убираем вспомогательное поле seenIds перед сохранением
  const output = {};
  let totalPosts = 0;
  for (const [name, data] of Object.entries(merged)) {
    output[name] = {
      nickname: data.nickname,
      avatarUrl: data.avatarUrl,
      posts: data.posts,
    };
    totalPosts += data.posts.length;
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));

  console.log(`\n✅ Пользователей с X-постами: ${Object.keys(output).length}`);
  console.log(`   Всего уникальных постов: ${totalPosts}`);
  console.log(`Сохранено: ${OUT_FILE}`);
}

main();
