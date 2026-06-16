/**
 * Извлекает X-посты из всех content-spotlight.json файлов в json/ (рекурсивно).
 * Результат: data/spotlight.json
 * Формат: [{ id, handle, postedAt }]
 *
 * postedAt — когда админ добавил пост в spotlight-канал
 */

const fs = require('fs');
const path = require('path');

const JSON_DIR = path.join(__dirname, '..', 'json');
const OUT_FILE = path.join(__dirname, '..', 'data', 'spotlight.json');

const X_RE = /https?:\/\/(?:x\.com|twitter\.com)\/([^\/\s\?]+)\/status\/(\d+)/gi;

function findSpotlightFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) findSpotlightFiles(full, out);
    else if (/content-spotlight\.json$/i.test(e.name)) out.push(full);
  }
  return out;
}

const files = findSpotlightFiles(JSON_DIR);
console.log(`Найдено spotlight-файлов: ${files.length}`);
files.forEach(f => console.log('  ' + path.relative(JSON_DIR, f)));

const seen = new Map();   // id → {id, handle, postedAt}

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  for (const m of data.messages) {
    if (m.author?.isBot) continue;
    const content = m.content || '';
    X_RE.lastIndex = 0;
    let match;
    while ((match = X_RE.exec(content)) !== null) {
      const handle = match[1] === 'i' ? null : match[1];
      const id     = match[2];
      // если уже есть — оставляем самую раннюю запись
      const prev = seen.get(id);
      if (!prev || new Date(m.timestamp) < new Date(prev.postedAt)) {
        seen.set(id, { id, handle, postedAt: m.timestamp });
      }
    }
  }
}

const out = [...seen.values()].sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));

console.log(`✅ Spotlight: ${out.length} уникальных постов сохранено в ${OUT_FILE}`);
