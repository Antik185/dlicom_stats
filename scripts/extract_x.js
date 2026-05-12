/**
 * Извлекает X-ссылки из каналов creators и dlicom-creators.
 * Результат: data/x_links.json
 * Формат: { discordName: { nickname, avatarUrl, posts: [{id, url, handle}] } }
 */

const fs = require('fs');
const path = require('path');

const JSON_DIR = path.join(__dirname, '..', 'json');
const OUT_FILE = path.join(__dirname, '..', 'data', 'x_links.json');

// Оба канала, где публикуют X-посты
const SOURCE_FILES = ['creators.json', 'dlicom-creators.json'];

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
      const handle = m[1];
      const postId = m[2];

      // Пропускаем анонимные ссылки x.com/i/status/...
      if (handle === 'i') continue;
      // Пропускаем официальные/системные аккаунты
      const EXCLUDED = new Set(['dlicomapp', 'dlicom']);
      if (EXCLUDED.has(handle.toLowerCase())) continue;

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
        users[authorName].posts.push({ id: postId, handle, url: `https://x.com/${handle}/status/${postId}` });
      }
    }
  }

  return users;
}

function main() {
  const merged = {};

  for (const fname of SOURCE_FILES) {
    const fp = path.join(JSON_DIR, fname);
    if (!fs.existsSync(fp)) { console.warn(`Файл не найден: ${fname}`); continue; }

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
