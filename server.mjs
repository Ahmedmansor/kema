import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve('public');
const qa = process.argv.includes('--qa');
const mime = { '.js':'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.wasm':'application/wasm' };
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if(!/^((127\.0\.0\.1)|(localhost)):(5173|5174)$/.test(req.headers.host||'')){res.writeHead(403);return res.end();}
    if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/api/initial-data') {
      res.setHeader('Content-Type', mime['.json']);
      if (qa) return res.end(JSON.stringify({schemaVersion:1,profile:{name:'مساحة اختبار منفصلة'},results:[],medications:[]}));
      return res.end(await readFile(resolve('data/initial-results.json')));
    }
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(root + sep)) { res.writeHead(403); return res.end(); }
    const content = await readFile(path);
    res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream');
    res.end(content);
  } catch { res.writeHead(404); res.end('Not found'); }
});
const port = qa ? 5174 : 5173;
server.listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}${qa?' (isolated QA data)':''}`));
