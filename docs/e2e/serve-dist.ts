import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

// A throwaway static server over the built site, for specs that need a REAL network cut.
// Playwright's context.setOffline() does not stop a controlling service worker's fetches, so
// it passes while the network keeps serving; closing this server is a real connection
// failure the worker must absorb. Shared by pwa.spec.ts and studio-warm-offline.spec.ts.

const DIST = fileURLToPath(new URL('../dist', import.meta.url));

const MIME: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript',
	'.mjs': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.webmanifest': 'application/manifest+json',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ico': 'image/x-icon',
	'.woff2': 'font/woff2',
	'.wasm': 'application/wasm',
};

/** Minimal static server over the built site — just enough for the worker to install.
 *  `hits` records every request path so a test can PROVE a strategy (cache-first serves
 *  with zero server hits; SWR fires a background revalidation that DOES hit). Responses
 *  are `no-store` so the browser's own HTTP cache can't mask a real network fetch —
 *  Cache Storage ignores Cache-Control, so the service worker still caches + serves. */
export function serveDist(): Promise<{ server: Server; origin: string; hits: string[] }> {
	const hits: string[] = [];
	const server = createServer(async (req, res) => {
		try {
			const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
			hits.push(pathname);
			const rel = normalize(pathname).replace(/^([/\\.])+/, '');
			let file = join(DIST, rel);
			if (pathname.endsWith('/')) file = join(file, 'index.html');
			let body: Buffer;
			try {
				body = await readFile(file);
			} catch {
				body = await readFile(join(DIST, rel, 'index.html')); // extensionless route
				file = 'index.html';
			}
			res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
			res.end(body);
		} catch {
			res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
		}
	});
	// Ephemeral port: no collision with the shared preview server or a future
	// second server-spawning spec; reject (not hang) if listen itself fails.
	return new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (typeof address === 'string' || address === null) return reject(new Error('no port assigned'));
			resolve({ server, origin: `http://127.0.0.1:${address.port}`, hits });
		});
	});
}
