#!/usr/bin/env node
/**
 * bench-preview-photo-memory — what a deck's photos cost a WebKit preview, and what the
 * preview-sized copies (docs/src/lib/preview-image-scale.ts) save.
 *
 * WHY THIS EXISTS. A preview frame decodes a background photo at its FULL size whatever box it is
 * drawn in, and WebKit — the engine an iPhone runs — keeps that bitmap after the slide is gone.
 * On a photo-heavy deck that, not the frame pools, is what got the tab discarded. This harness
 * reproduces the cost in isolation and measures the fix against it, on the real module:
 *
 *   original   N frames, each showing a distinct 12MP photo by its own address
 *   scaled     the same frames, the markup run through `preview-image-scale.ts` `rewrite` first,
 *              re-written when each copy lands (as DeckPreview does on READY_EVENT)
 *
 * It reports the WebKit web process's PSS above an empty page, 6s and 26s after the last photo
 * loaded — the second read is there because a worker's memory is only returned once it stops.
 *
 * Read the result as a RATIO between arms on one machine, not as a phone's absolute footprint:
 * this is Playwright's Linux WebKit, not iOS. Measured when the module landed (10 photos, 3x DPR):
 *   WebKit 26.0 (Playwright build 2215, the docs' pin): original 950MB, scaled 197MB at a 320px tile.
 *   An older WPE build (2370): original 582MB; scaled 191MB at a 320px tile (1280 tier), 132MB at a
 *   100px tile (640 tier).
 *
 * Needs Linux (/proc), ImageMagick (`convert`) for the fixture photos, and Playwright's WebKit
 * (`cd docs && npx playwright install webkit`).
 *
 * Usage:
 *   node tools/bench-preview-photo-memory.mjs [--frames=10] [--tile=320] [--dpr=3]
 */

import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, dflt) => Number(process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? dflt);
const FRAMES = arg('frames', 10);
const TILE = arg('tile', 320);
const DPR = arg('dpr', 3);

const { webkit } = createRequire(path.join(root, 'docs/package.json'))('playwright');
const esbuild = createRequire(path.join(root, 'package.json'))('esbuild');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-memory-'));
for (let i = 1; i <= FRAMES; i++) execFileSync('convert', ['-size', '4032x3024', 'plasma:', '-quality', '80', path.join(dir, `p${i}.jpg`)]);
await esbuild.build({ entryPoints: [path.join(root, 'docs/src/lib/preview-image-scale.ts')], bundle: true, format: 'iife', globalName: 'Scale', outfile: path.join(dir, 'scale.js'), logLevel: 'error' });
await esbuild.build({ entryPoints: [path.join(root, 'lib/core/remote-ref.js')], bundle: true, format: 'iife', globalName: 'RemoteRef', platform: 'browser', outfile: path.join(dir, 'remote-ref.js'), logLevel: 'error' });
fs.writeFileSync(
	path.join(dir, 'index.html'),
	`<!doctype html><body style="margin:0"><div id=g></div><script src="remote-ref.js"></script><script src="scale.js"></script><script>
const doc = (u) => '<!doctype html><body style=margin:0><section><div class="lattice-bg" style="width:1280px;height:720px;background-image:url(&quot;' + u + '&quot;);background-size:cover"></div></section>';
window.run = (n, scaled, tile, dpr) => new Promise((done) => {
	let left = n;
	for (let i = 0; i < n; i++) {
		const f = document.createElement('iframe');
		f.style.cssText = 'width:1280px;height:720px;border:0;transform:scale(.25);transform-origin:0 0;position:absolute;left:' + (i % 4) * 330 + 'px;top:' + Math.floor(i / 4) * 190 + 'px';
		document.getElementById('g').appendChild(f);
		const url = new URL('p' + (i + 1) + '.jpg', location.href).href;
		const paint = () => {
			const out = scaled ? Scale.rewrite(doc(url), Scale.tierFor(tile, dpr, true), f, location.href, RemoteRef, []) : { html: doc(url), pending: 0 };
			f.srcdoc = out.html;
			if (out.pending) return;
			const im = new Image();
			im.onload = im.onerror = () => { if (--left === 0) setTimeout(done, 1500); };
			im.src = out.html.match(/url\\((?:&quot;)?([^&)]+)/)[1];
		};
		f.addEventListener(Scale.READY_EVENT, paint);
		paint();
	}
});
</script>`,
);

const server = http
	.createServer((req, res) => {
		const file = path.join(dir, path.basename(req.url.split('?')[0]) || 'index.html');
		if (!fs.existsSync(file)) return res.writeHead(404).end();
		res.writeHead(200, { 'content-type': file.endsWith('.jpg') ? 'image/jpeg' : file.endsWith('.js') ? 'text/javascript' : 'text/html' });
		fs.createReadStream(file).pipe(res);
	})
	.listen(0);
const origin = `http://localhost:${server.address().port}/`;

const pssMB = () => {
	let kb = 0;
	for (const pid of execSync('pgrep -f WebProcess || true').toString().trim().split('\n').filter(Boolean)) {
		try {
			kb += Number(/Pss:\s+(\d+)/.exec(fs.readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8'))[1]);
		} catch {
			/* the process went away */
		}
	}
	return Math.round(kb / 1024);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function arm(scaled) {
	const browser = await webkit.launch();
	const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: DPR })).newPage();
	await page.goto(origin);
	await sleep(1500);
	const base = pssMB();
	const t = Date.now();
	await page.evaluate(([n, s, tile, dpr]) => window.run(n, s, tile, dpr), [FRAMES, scaled, TILE, DPR]);
	const settledMs = Date.now() - t;
	await sleep(6000);
	const after6s = pssMB() - base;
	await sleep(20000);
	const after26s = pssMB() - base;
	await browser.close();
	return { arm: scaled ? `scaled (tile ${TILE}px @${DPR}x)` : 'original', settledMs, after6s, after26s };
}

try {
	console.table([await arm(false), await arm(true)]);
} finally {
	server.close();
	fs.rmSync(dir, { recursive: true, force: true });
}
