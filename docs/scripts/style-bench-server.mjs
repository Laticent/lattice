#!/usr/bin/env node
/**
 * A static server for the built docs site (docs/dist) that can speak HTTP/1.1 or HTTP/2 over TLS, compresses with
 * brotli the way the production host does, and implements the one endpoint a host needs for the Playground style
 * loader's `?styles=bundle` mode:
 *
 *   GET /playground/v/<hash>/styles/bundle?m=0,5,9   ->  those style modules, in lattice.css order, as one CSS body,
 *                                                       each behind a `/*@lat-module N*\/` line
 *
 * It exists so `docs/scripts/style-loader-bench.mjs` can compare the loader's request strategies on both protocols;
 * `astro preview` is HTTP/1.1 only, so it cannot say what 60 requests cost over h2. Self-signed certificate, made
 * with the `openssl` CLI into a temp folder; clients must ignore certificate errors (Playwright's
 * `ignoreHTTPSErrors`). Not a production server: no range requests, no streaming, everything cached in memory.
 *
 * Usage:  node scripts/style-bench-server.mjs --port 4443 --proto h2|h1|http1 [--dist dist]
 *   h2     HTTP/2 over TLS          h1     HTTP/1.1 over TLS          http1   HTTP/1.1, no TLS (what `astro preview` speaks)
 * Prints `listening <proto> <origin> spki <base64>` once ready; pass the SPKI hash to the bench as `--spki` so Chromium treats the
 * certificate as valid and CACHES (a page loaded over an ignored certificate error is never cached, which would make every warm number a lie). Stop it with SIGTERM.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import http2 from 'node:http2';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const port = Number(opt('--port', '4443'));
const proto = opt('--proto', 'h2');
const docsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.resolve(docsRoot, opt('--dist', 'dist'));
if (!fs.existsSync(dist)) {
  console.error(`style-bench-server: ${dist} is missing; run \`npm run build:e2e\` in docs/`);
  process.exit(2);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.wasm': 'application/wasm', '.ico': 'image/x-icon' };
const COMPRESSIBLE = /^(text\/|application\/json|image\/svg|text\/javascript)/;
const cache = new Map();

/** `{ body, headers }` for a file or composed body, brotli-compressed when the client accepts it. */
function respond(key, bytes, type, immutable, acceptsBr) {
  const ck = `${key}|${acceptsBr}`;
  let hit = cache.get(ck);
  if (!hit) {
    const br = acceptsBr && COMPRESSIBLE.test(type) && bytes.length > 256;
    const body = br ? zlib.brotliCompressSync(bytes, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 } }) : bytes;
    hit = {
      body,
      headers: {
        'content-type': type,
        'content-length': body.length,
        ...(br ? { 'content-encoding': 'br' } : {}),
        vary: 'accept-encoding',
        etag: `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`,
        'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
      },
    };
    cache.set(ck, hit);
  }
  return hit;
}

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath).replace(/\.\.+/g, '.');
  let file = path.join(dist, clean);
  if (!file.startsWith(dist)) return null;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  else if (!path.extname(file) && fs.existsSync(`${file}/index.html`)) file = `${file}/index.html`;
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}

const needsCache = new Map();
/** The module files of one hashed Playground folder, in lattice.css order. */
function modulesOf(hash) {
  if (!needsCache.has(hash)) {
    const dir = path.join(dist, 'playground', 'v', hash, 'styles');
    const needs = JSON.parse(fs.readFileSync(path.join(dir, 'needs.json'), 'utf8'));
    needsCache.set(hash, needs.modules.map((m) => path.join(dir, m.file)));
  }
  return needsCache.get(hash);
}

function handle(req, res) {
  const url = new URL(req.url, 'https://localhost');
  const acceptsBr = /\bbr\b/.test(String(req.headers['accept-encoding'] || ''));
  const bundle = /^\/playground\/v\/([^/]+)\/styles\/bundle$/.exec(url.pathname);
  let out;
  if (bundle) {
    try {
      const files = modulesOf(bundle[1]);
      const ids = [...new Set((url.searchParams.get('m') || '').split(',').filter(Boolean).map(Number))].sort((a, b) => a - b);
      if (!ids.length || ids.some((i) => !Number.isInteger(i) || i < 0 || i >= files.length)) throw new Error('bad module list');
      const text = ids.map((i) => `/*@lat-module ${i}*/\n${fs.readFileSync(files[i], 'utf8')}`).join('');
      out = respond(`bundle:${bundle[1]}:${ids.join(',')}`, Buffer.from(text), TYPES['.css'], true, acceptsBr);
    } catch (e) {
      res.writeHead(400, { 'content-type': 'text/plain' });
      res.end(String(e.message));
      return;
    }
  } else {
    const file = resolveFile(url.pathname);
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    out = respond(file, fs.readFileSync(file), type, url.pathname.startsWith('/playground/v/'), acceptsBr);
  }
  if (req.headers['if-none-match'] === out.headers.etag) {
    res.writeHead(304, { etag: out.headers.etag, 'cache-control': out.headers['cache-control'] });
    res.end();
    return;
  }
  res.writeHead(200, out.headers);
  res.end(req.method === 'HEAD' ? undefined : out.body);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'style-bench-tls-'));
let server;
let spki = '';
if (proto === 'http1') {
  server = http.createServer(handle);
} else {
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(tmp, 'k.pem'), '-out', path.join(tmp, 'c.pem'), '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  const tls = { key: fs.readFileSync(path.join(tmp, 'k.pem')), cert: fs.readFileSync(path.join(tmp, 'c.pem')) };
  const pub = execFileSync('openssl', ['x509', '-in', path.join(tmp, 'c.pem'), '-pubkey', '-noout']);
  const der = execFileSync('openssl', ['pkey', '-pubin', '-outform', 'der'], { input: pub });
  spki = createHash('sha256').update(der).digest('base64');
  server = proto === 'h2' ? http2.createSecureServer({ ...tls, allowHTTP1: true }, handle) : https.createServer(tls, handle);
}
server.listen(port, () => console.log(`listening ${proto} ${proto === 'http1' ? 'http' : 'https'}://localhost:${port}${spki ? ` spki ${spki}` : ''}`));
const stop = () => {
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
