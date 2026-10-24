// Serve a built `dist/` over HTTP/2 with gzip, the way production (GitHub Pages, Cloudflare) does.
//
// WHY THIS EXISTS. `docs/scripts/preview-e2e.mjs` (astro preview) speaks HTTP/1.1, where a browser opens 6 connections per host
// and every extra request queues behind them. On the phone profile (80 ms latency added to each request) that makes the REQUEST COUNT
// the cost: cutting 24 requests moved the first slide by 0.41 s over HTTP/1.1 and by 0.08 s over HTTP/2, and the build a month
// earlier looked 1.0 s faster than the regressed one on HTTP/1.1 and 0.1 s faster on HTTP/2 (engineering/decisions/
// 2026-10-23-startup-bake-off.md E0). A start-up number measured on the wrong protocol rewards the wrong change. Use this server for
// any first-slide comparison; `npm run perf:startup` accepts its https://localhost URLs (the self-signed certificate is trusted for
// localhost only).
//
// Usage:  node scripts/serve-h2.mjs [dist-dir=dist] [port=4430]
//         URL=https://localhost:4430/studio/ npm run perf:startup
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http2 from 'node:http2';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve(process.argv[2] || 'dist');
const port = Number(process.argv[3] || 4430);
if (!fs.existsSync(root)) {
	console.error(`serve-h2: ${root} does not exist; build the docs first`);
	process.exit(1);
}

// A throwaway self-signed certificate for localhost, made fresh each run: nothing is stored in the repo.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-h2-'));
const key = path.join(tmp, 'key.pem');
const cert = path.join(tmp, 'cert.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.wasm': 'application/wasm', '.md': 'text/markdown', '.txt': 'text/plain', '.xml': 'application/xml', '.ico': 'image/x-icon' };
const COMPRESSIBLE = /text|json|svg|javascript|markdown|wasm|xml/;
const cache = new Map();

const server = http2.createSecureServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert), allowHTTP1: false }, (req, res) => {
	const url = new URL(req.url, 'https://localhost');
	let file = path.join(root, path.normalize(decodeURIComponent(url.pathname)));
	if (!file.startsWith(root)) {
		res.writeHead(403).end();
		return;
	}
	try {
		if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
	} catch {
		if (fs.existsSync(`${file}.html`)) file += '.html';
	}
	if (!fs.existsSync(file)) {
		res.writeHead(404).end();
		return;
	}
	const type = TYPES[path.extname(file)] || 'application/octet-stream';
	let body = cache.get(file);
	if (!body) {
		const raw = fs.readFileSync(file);
		body = COMPRESSIBLE.test(type) ? { gz: true, bytes: zlib.gzipSync(raw) } : { gz: false, bytes: raw };
		cache.set(file, body);
	}
	res.writeHead(200, { 'content-type': type, 'content-length': body.bytes.length, ...(body.gz ? { 'content-encoding': 'gzip' } : {}) });
	res.end(body.bytes);
});
server.listen(port, () => console.log(`serve-h2: ${root} on https://localhost:${port}/ (HTTP/2, gzip)`));
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0));
