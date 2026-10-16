import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import vitePublicEsmDev from './vite-public-esm-dev.mjs';

/**
 * `vite-public-esm-dev.mjs` drops Vite's `?import` marker from a request for a real JS file under
 * `public/`, so the public-file middleware serves the engine to the site's runtime `import()`
 * instead of the transform middleware refusing it with a 500. These pin what it rewrites and,
 * just as much, what it leaves alone.
 */

const pub = fs.mkdtempSync(path.join(os.tmpdir(), 'public-esm-dev-'));
fs.mkdirSync(path.join(pub, 'playground', 'esm'), { recursive: true });
fs.writeFileSync(path.join(pub, 'playground', 'esm', 'engine.js'), 'export {};\n');
afterAll(() => fs.rmSync(pub, { recursive: true, force: true }));

type Mw = (req: { url?: string }, res: unknown, next: () => void) => void;

function middleware(publicDir: string | false = pub): Mw {
	let mw: Mw | undefined;
	const plugin = vitePublicEsmDev();
	plugin.configureServer({ config: { publicDir }, middlewares: { use: (fn: Mw) => (mw = fn) } });
	if (!mw) throw new Error('plugin registered no middleware');
	return mw;
}

function run(url: string): string | undefined {
	const req = { url };
	let called = false;
	middleware()(req, {}, () => (called = true));
	expect(called).toBe(true);
	return req.url;
}

describe('vite-public-esm-dev', () => {
	it('is scoped to the dev server', () => {
		expect(vitePublicEsmDev().apply).toBe('serve');
	});

	it('drops the import marker from a public JS file', () => {
		expect(run('/playground/esm/engine.js?import')).toBe('/playground/esm/engine.js');
	});

	it('keeps the other query params', () => {
		expect(run('/playground/esm/engine.js?import&t=123')).toBe('/playground/esm/engine.js?t=123');
	});

	it('leaves a source module alone', () => {
		expect(run('/src/lib/load-engine.ts?import')).toBe('/src/lib/load-engine.ts?import');
		expect(run('/src/missing.js?import')).toBe('/src/missing.js?import');
	});

	it('leaves a path that escapes the public directory alone', () => {
		expect(run('/../outside.js?import')).toBe('/../outside.js?import');
	});

	it('leaves a request without the marker alone', () => {
		expect(run('/playground/esm/engine.js')).toBe('/playground/esm/engine.js');
		expect(run('/playground/esm/engine.js?t=1')).toBe('/playground/esm/engine.js?t=1');
	});

	it('registers nothing when there is no public directory', () => {
		const plugin = vitePublicEsmDev();
		let used = false;
		plugin.configureServer({ config: { publicDir: false }, middlewares: { use: () => (used = true) } });
		expect(used).toBe(false);
	});
});
