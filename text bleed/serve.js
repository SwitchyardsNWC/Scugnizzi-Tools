// Static server for ink-bleed.html. Also lists the assets folder at /assets/index.json so
// any .svg dropped in there shows up as a stamp. Run with:  node serve.js
const http = require('http'), fs = require('fs'), path = require('path');
const root = __dirname, port = 8765;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/ink-bleed.html';
  if (p === '/assets/index.json') {
    let files = [];
    try { files = fs.readdirSync(path.join(root, 'assets')).filter(f => /\.svg$/i.test(f)).sort(); } catch (e) {}
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(files));
  }
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, () => console.log(`Ink Bleed: http://localhost:${port}`));
