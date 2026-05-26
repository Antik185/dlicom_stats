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
  svg:  'image/svg+xml',
  webm: 'video/webm',
  webp: 'image/webp',
};

http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // Redirects — browser must land on the correct base URL
  if (urlPath === '/' || urlPath === '/lb') {
    res.writeHead(302, { Location: '/lb/' });
    return res.end();
  }
  if (urlPath === '/cards') {
    res.writeHead(302, { Location: '/cards/' });
    return res.end();
  }

  // Serve actual files
  let filePath;
  if (urlPath === '/lb/')         filePath = path.join(ROOT, 'lb/index.html');
  else if (urlPath === '/cards/') filePath = path.join(ROOT, 'index.html');
  else                            filePath = path.join(ROOT, urlPath);

  try {
    const data = fs.readFileSync(filePath);
    const ext  = filePath.split('.').pop().toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found: ' + urlPath);
  }
}).listen(PORT, () => {
  console.log(`Сайт: http://localhost:${PORT}`);
});
