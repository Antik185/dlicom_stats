/**
 * Извлекает X-посты из канала content-spotlight.
 * Результат: data/spotlight.json
 * Формат: [{ id, handle, postedAt }]
 *
 * postedAt — когда админ добавил пост в spotlight-канал
 */

const fs = require('fs');
const path = require('path');

const SRC_FILE = path.join(__dirname, '..', 'json', 'spotlight', 'content-spotlight.json');
const OUT_FILE = path.join(__dirname, '..', 'data', 'spotlight.json');

const X_RE = /https?:\/\/(?:x\.com|twitter\.com)\/([^\/\s\?]+)\/status\/(\d+)/gi;

const data = JSON.parse(fs.readFileSync(SRC_FILE, 'utf-8'));
const seen = new Set();
const out  = [];

for (const m of data.messages) {
  if (m.author?.isBot) continue;
  const content = m.content || '';
  X_RE.lastIndex = 0;
  let match;
  while ((match = X_RE.exec(content)) !== null) {
    const handle = match[1] === 'i' ? null : match[1];
    const id     = match[2];
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, handle, postedAt: m.timestamp });
  }
}

// сортируем по дате добавления (новые первые)
out.sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));

console.log(`✅ Spotlight: ${out.length} уникальных постов сохранено в ${OUT_FILE}`);
