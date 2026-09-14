// Static server for Scugnizzi Tools: index.html plus every mini tool folder. Run with:  node serve.js
// Any request for <folder>/assets/index.json lists the .svg files in that folder, which is how
// tools like Ink bleed discover stamps dropped into their assets directory.
const http = require('http'), fs = require('fs'), path = require('path');
const root = __dirname, port = Number(process.env.PORT) || 8770;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.gif': 'image/gif',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (/[\\/]assets[\\/]index\.json$/.test(file)) {
    let files = [];
    try { files = fs.readdirSync(path.dirname(file)).filter(f => /\.svg$/i.test(f)).sort(); } catch (e) {}
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(files));
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, () => console.log(`scugnizzi-tools  http://localhost:${port}`));
