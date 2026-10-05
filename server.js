// Zero-dependency dev server for Bees Wrapped.
// Serves ./public with caching off and reloads open tabs when a file in it changes.
// Pass --lan to also listen on your local network so you can open the page on a phone. That mode serves https
// (phones only allow sharing on secure pages) with a self-signed certificate made for this machine.
const http = require('node:http');
const https = require('node:https');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.join(__dirname, 'public');
const LAN = process.argv.includes('--lan');
const HOST = LAN ? '0.0.0.0' : '127.0.0.1';
const FIRST_PORT = Number(process.env.PORT) || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
};

const RELOAD_SNIPPET = '<script>new EventSource("/__reload").onmessage = () => location.reload();</script>';
const clients = new Set();

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(body);
}

async function resolveFile(urlPath) {
  const file = path.join(ROOT, urlPath);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return null;   // no ../ escapes
  try {
    const stat = await fsp.stat(file);
    if (stat.isFile()) return { file, stat };
    if (stat.isDirectory()) {
      const index = path.join(file, 'index.html');
      return { file: index, stat: await fsp.stat(index) };
    }
  } catch {}
  return null;
}

async function serveHtml(req, res, file) {
  const html = await fsp.readFile(file, 'utf8');
  const body = html.includes('</body>') ? html.replace('</body>', RELOAD_SNIPPET + '\n</body>') : html + RELOAD_SNIPPET;
  res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function serveStatic(req, res, file, stat) {
  const headers = {
    'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store',
    'Accept-Ranges': 'bytes',
  };
  let start = 0, end = stat.size - 1, status = 200;

  // Byte ranges: Safari (including iOS) won't play <video> without them.
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (m && (m[1] || m[2])) {
    start = m[1] ? Number(m[1]) : Math.max(0, stat.size - Number(m[2]));
    end = m[1] && m[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
  }

  headers['Content-Length'] = stat.size ? end - start + 1 : 0;
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || !stat.size) return res.end();
  fs.createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
}

async function handle(req, res) {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (pathname === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
    res.write(': connected\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');

  let urlPath;
  try { urlPath = decodeURIComponent(pathname); } catch { return send(res, 400, 'Bad request'); }

  const found = await resolveFile(urlPath);
  if (!found) return send(res, 404, 'Not found');
  if (found.file.endsWith('.html')) await serveHtml(req, res, found.file);
  else serveStatic(req, res, found.file, found.stat);
}

const lanIPs = () => Object.values(os.networkInterfaces()).flat()
  .filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address);

// A self-signed certificate for localhost and this machine's network addresses, kept in .certs/ and remade
// whenever those addresses change. Phones show a warning for it once; after that, sharing works.
function lanCert() {
  const dir = path.join(__dirname, '.certs');
  const names = ['localhost', '127.0.0.1', ...lanIPs()];
  const key = path.join(dir, 'key.pem'), cert = path.join(dir, 'cert.pem'), tag = path.join(dir, 'names.txt');
  if (!fs.existsSync(tag) || fs.readFileSync(tag, 'utf8') !== names.join(',')) {
    fs.mkdirSync(dir, { recursive: true });
    const san = names.map(n => (/^[\d.]+$/.test(n) ? 'IP:' : 'DNS:') + n).join(',');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '365',
      '-keyout', key, '-out', cert, '-subj', '/CN=Bees Wrapped dev server',
      '-addext', `subjectAltName=${san}`, '-addext', 'extendedKeyUsage=serverAuth'], { stdio: 'ignore' });
    fs.writeFileSync(tag, names.join(','));
  }
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

const onRequest = (req, res) => {
  handle(req, res).catch(err => {
    console.error(err);
    if (!res.headersSent) send(res, 500, 'Server error');
    else res.destroy();
  });
};
let SECURE = false, server;
if (LAN) {
  try { server = https.createServer(lanCert(), onRequest); SECURE = true; }
  catch (err) { console.warn('  Could not make an https certificate (is openssl installed?), so serving plain http:', err.message); }
}
server ||= http.createServer(onRequest);

// Reload every open tab shortly after anything in public/ changes
let reloadTimer;
fs.watch(ROOT, { recursive: true }, (_, filename) => {
  // hidden files (.DS_Store, editor swap files, scratch copies) aren't part of the site
  if (filename && filename.split(path.sep).some(part => part.startsWith('.'))) return;
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    for (const c of clients) c.write('data: reload\n\n');
    console.log(`  ↻ ${filename || 'public/'} changed, reloading`);
  }, 80);
});

function listen(port) {
  const onError = err => {
    if (err.code === 'EADDRINUSE' && port < FIRST_PORT + 20) return listen(port + 1);
    console.error(err.message);
    process.exit(1);
  };
  server.once('error', onError);
  server.listen(port, HOST, () => {
    server.off('error', onError);
    const scheme = SECURE ? 'https' : 'http';
    console.log(`\n  Bees Wrapped dev server\n\n  Local:   ${scheme}://localhost:${port}`);
    if (LAN) {
      for (const ip of lanIPs()) console.log(`  Network: ${scheme}://${ip}:${port}   (phone on the same Wi-Fi)`);
      if (SECURE) console.log('\n  The first visit shows a certificate warning (it\'s this machine\'s own certificate):\n' +
        '  on iPhone tap Show Details, then "visit this website"; on Android tap Advanced, then Proceed.');
    } else {
      console.log('  Phone:   run `npm run dev:lan` to open it from a phone on the same Wi-Fi');
    }
    console.log('\n  Saving a file in public/ reloads the page. Ctrl+C to stop.\n');
  });
}

listen(FIRST_PORT);
