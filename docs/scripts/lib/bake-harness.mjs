// The shared harness for the build-time BAKES: the Playground newcomer's frame
// (bake-newcomer-frame.mjs) and the Studio newcomer's first write (bake-studio-newcomer.mjs).
// Each one runs the page's own modules against the files the build just staged, in a jsdom window,
// so what it writes is what the page would have written. This file holds the parts they share:
// reading the build output, the jsdom window with the globals the page modules read, the engine
// import, and a Vite SSR loader that can evaluate the CommonJS kernels under `lib/`.

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

export const DOCS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ORIGIN = 'http://localhost';

/** The build output directory: `--dist <dir>`, else docs/dist. */
export function distDir(argv = process.argv) {
	const i = argv.indexOf('--dist');
	return i > 0 ? path.resolve(argv[i + 1]) : path.join(DOCS, 'dist');
}

/** Astro's island prop serialization: every value is `[type, payload]`; 0 is a plain value (an
 *  object's own values are serialized again), 1 is an array. Nothing else appears in pgData. */
export function deserialize(v) {
	if (!Array.isArray(v)) {
		if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deserialize(x)]));
		return v;
	}
	const [type, payload] = v;
	if (type === 1) return payload.map(deserialize);
	if (type === 0) return payload && typeof payload === 'object' ? deserialize(payload) : payload;
	throw new Error(`bake: unexpected island prop type ${type}`);
}


export function unescapeAttr(s) {
	return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** The pane's `--bg-alt` for a palette and mode, as the page's computed style would return it. */
export function paneBackground(palette, mode) {
	const sheet = fs.readFileSync(path.join(DOCS, 'src/styles/lattice-tokens.generated.css'), 'utf8');
	const rule = new RegExp(`html\\[data-palette="${palette}"\\]\\[data-mode="${mode}"\\]\\{([^}]*)\\}`).exec(sheet);
	const v = rule && /(?:^|;)--bg-alt:([^;]*)/.exec(rule[1]);
	if (!v) throw new Error(`bake: no --bg-alt for ${palette}/${mode}`);
	return v[1].trim();
}

/** A same-origin fetch served from the build output. */
export function distFetch(dist, origin = ORIGIN) {
	return async (input) => {
		const u = new URL(String(input), origin + '/');
		const file = path.join(dist, decodeURIComponent(u.pathname));
		if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response('', { status: 404 });
		return new Response(fs.readFileSync(file));
	};
}

/** A jsdom window at `pagePath`, with the globals the page modules read pointing at it. */
export function bakeWindow(dist, pagePath, palette) {
	const dom = new JSDOM(`<!doctype html><html data-palette="${palette}" data-mode="light"><head></head><body></body></html>`, {
		url: `${ORIGIN}${pagePath}`,
		pretendToBeVisual: true,
		runScripts: 'outside-only',
	});
	const win = dom.window;
	win.fetch = distFetch(dist);
	// The bridge and the modules under it read these as globals, the way they do in the page.
	for (const k of ['window', 'document', 'location', 'navigator', 'localStorage', 'getComputedStyle', 'HTMLElement', 'Element', 'Node', 'DOMParser', 'requestAnimationFrame']) {
		Object.defineProperty(globalThis, k, { value: k === 'window' ? win : win[k], configurable: true, writable: true });
	}
	globalThis.fetch = win.fetch;
	return win;
}

/**
 * The engine the browser runs: the staged ESM files, imported here with `window` pointing at the
 * jsdom window, so the engine registers itself there exactly as it does in the page. Every chart
 * kernel is imported up front, which leaves the bridge's on-demand chart load nothing to do (the
 * browser fetches them by URL; Node cannot fetch a site-relative URL).
 */
export async function importEngine(dist, engineUrl, win) {
	const engineFile = path.join(dist, new URL(engineUrl, ORIGIN + '/').pathname);
	await import(pathToFileURL(engineFile).href);
	for (const f of fs.readdirSync(path.dirname(engineFile)).filter((n) => /^chart-[a-z0-9-]+\.js$/.test(n))) {
		await import(pathToFileURL(path.join(path.dirname(engineFile), f)).href);
	}
	if (!win.LatticePlayground) throw new Error('bake: the engine did not register window.LatticePlayground');
}

/** The kernels under `lib/` mix CommonJS and ESM. Vite's SSR loader evaluates every source file
 *  as ESM, so a CommonJS one dies on `module`. Node loads CommonJS natively: each such file is
 *  served as a two-line ESM shim over Node's own `require`, with its exports re-exported by name. */
function nativeCjs() {
	const lib = path.join(DOCS, '..', 'lib') + path.sep;
	const req = createRequire(import.meta.url);
	return {
		name: 'bake:native-cjs',
		enforce: 'pre',
		load(id) {
			const file = id.split('?')[0];
			if (!file.startsWith(lib) || !/\.c?js$/.test(file)) return null;
			const src = fs.readFileSync(file, 'utf8');
			if (!file.endsWith('.cjs') && (/^\s*(?:export|import)\s/m.test(src) || !/\bmodule\.exports\b|\bexports\.\w+\s*=/.test(src))) return null;
			const names = Object.keys(req(file)).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k) && k !== 'default');
			return [
				`import { createRequire } from 'node:module';`,
				`const m = createRequire(${JSON.stringify(file)})(${JSON.stringify(file)});`,
				'export default m;',
				...names.map((k) => `export const ${k} = m[${JSON.stringify(k)}];`),
			].join('\n');
		},
	};
}

/** A Vite SSR loader rooted at docs/, for `ssrLoadModule` of the page's own modules. */
export function bakeVite() {
	return createServer({
		root: DOCS,
		configFile: false,
		logLevel: 'error',
		appType: 'custom',
		server: { middlewareMode: true, hmr: false, ws: false },
		resolve: { alias: { '@': path.join(DOCS, 'src') } },
		optimizeDeps: { noDiscovery: true, include: [] },
		plugins: [nativeCjs()],
	});
}
