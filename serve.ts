// Local static HTTP server for Tailwind: Archipelago Flight (`node serve.ts`).
// Serves files strictly inside ./game on http://localhost:8080 (or --port N).

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const argv = process.argv.slice(2);
const portFlag = argv.indexOf('--port');
const parsedPort = portFlag >= 0 ? Number(argv[portFlag + 1]) : 8080;
const port = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65536 ? parsedPort : 8080;

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.wasm': 'application/wasm',
};

const server = createServer((req, res) => {
  const parsed = new URL(req.url ?? '/', 'http://127.0.0.1');
  let reqPath: string;
  try {
    reqPath = decodeURIComponent(parsed.pathname);
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('Bad request');
    return;
  }

  if (reqPath.endsWith('/')) {
    reqPath += 'index.html';
  }
  const safePath = resolve(join(gameRoot, normalize(reqPath)));
  if (safePath !== gameRoot && !safePath.startsWith(gameRoot + sep)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end('Forbidden');
    return;
  }

  let fileSize = 0;
  try {
    const info = statSync(safePath);
    if (!info.isFile()) throw new Error('not file');
    fileSize = info.size;
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }

  const mime = CONTENT_TYPES[extname(safePath).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, {
    'content-type': mime,
    'content-length': fileSize,
    'cache-control': 'no-store',
  });
  createReadStream(safePath).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Tailwind: Archipelago Flight running at http://localhost:${port}`);
});
