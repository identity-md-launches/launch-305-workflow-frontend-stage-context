import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve } from 'node:path';

const root = fileURLToPath(new URL('../../dist/', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (!path.startsWith('/preview/')) { response.writeHead(404); response.end('Use /preview/'); return; }
  const file = resolve(root, path.slice('/preview/'.length) || 'index.html');
  if (!file.startsWith(root)) { response.writeHead(403); response.end(); return; }
  try { const body = await readFile(file); response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(body); }
  catch { response.writeHead(404); response.end('Not found'); }
});
server.listen(4173, '0.0.0.0', () => console.log('Production export: http://localhost:4173/preview/'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
