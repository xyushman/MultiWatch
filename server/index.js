// Standalone server: serves the built SPA and the /api/state endpoint.
//
// Used by:
//   * `npm run serve` on your own machine
//   * Railway (connect the repo, build `npm run build`, start `npm run serve`)
//
// Vercel does not use this file; it uses api/state.js instead.

import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readState, writeState, backend } from './store.js';

const PORT = Number(process.env.PORT || 8787);
const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(here, '..', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req, limitBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

async function serveStatic(req, res, pathname) {
  // Resolve inside DIST and refuse anything that escapes it.
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const distRoot = path.resolve(DIST);
  const target = path.resolve(distRoot, `.${safePath}`);
  const relative = path.relative(distRoot, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return sendJson(res, 403, { error: 'forbidden' });
  }

  let filePath = target;
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
  } catch {
    // Unknown path: fall back to the SPA entry point.
    filePath = path.join(DIST, 'index.html');
  }

  let data;
  try {
    data = await fs.readFile(filePath);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found. Run `npm run build` first.');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const immutable = filePath.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'Content-Length': data.length,
  });
  // HEAD must not send a body.
  res.end(req.method === 'HEAD' ? undefined : data);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const { pathname } = url;

  try {
    if (pathname === '/api/state') {
      if (req.method === 'GET') {
        const state = await readState();
        return sendJson(res, 200, state ?? { empty: true });
      }
      if (req.method === 'PUT' || req.method === 'POST') {
        const body = await readBody(req);
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          return sendJson(res, 400, { error: 'body must be a JSON object' });
        }
        const saved = await writeState(body);
        return sendJson(res, 200, saved);
      }
      res.setHeader('Allow', 'GET, PUT, POST');
      return sendJson(res, 405, { error: 'method not allowed' });
    }

    if (pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, backend });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, { error: 'method not allowed' });
    }

    return serveStatic(req, res, pathname);
  } catch (error) {
    return sendJson(res, 500, { error: String(error?.message || error) });
  }
});

server.listen(PORT, () => {
  console.log(`Multiwatch on http://localhost:${PORT}  (state backend: ${backend})`);
});
