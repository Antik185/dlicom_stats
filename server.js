const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = 3000;

const MIME = {
  html: 'text/html',
  js:   'application/javascript',
  json: 'application/json',
  css:  'text/css',
  png:  'image/png',
  jpg:  'image/jpeg',
  webm: 'video/webm',
  webp: 'image/webp',
};

http.createServer((req, res) => {
  const filePath = path.join(ROOT, req.url === '/' ? 'index.html' : req.url);
  try {
    const data = fs.readFileSync(filePath);
    const ext  = filePath.split('.').pop();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT, () => {
  console.log(`Сайт доступен: http://localhost:${PORT}`);
});
