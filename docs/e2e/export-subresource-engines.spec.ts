import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test } from '@playwright/test';

// The export subresource policy, in the OTHER two engine families. @gecko @webkit-tablet
//
// WHY THIS LIVES IN docs/e2e AND NOT BESIDE ITS OWN INTEGRATION TEST. The Chromium arms are
// `test/integration/export/export-remote-subresource.test.js`, which drives Puppeteer's bundled
// Chromium — the only browser the integration tier has. Gecko and WebKit builds exist HERE,
// because `playwright.config.ts` already defines `gecko` and `webkit-tablet` projects and
// `studio-e2e-nightly.yml` installs them. So this spec rides a tier that already pays for those
// browsers rather than asking a second tier to start.
//
// WHAT IT IS FOR. `file://` origin rules are engine-specific, and `img-src 'self'` on a
// downloaded deck rests on them twice over:
//   · the CONTROL — a remote subresource must be refused, which is the whole feature;
//   · the COST — the deck's OWN files must still load, or a policy meant to protect the reader
//     blanks the pictures instead. Two cases, and they are different questions: a
//     same-directory image is the easy reading of `'self'`, while KaTeX's stylesheet and its 20
//     faces sit in ANOTHER directory, so a stricter reading drops every math glyph to a
//     fallback and nothing about the page looks broken enough to notice.
//
// THE COST HALF IS CARRIED BY WEBKIT ALONE, and the gecko run is a CONTROL-ONLY run. Firefox
// applies neither `img-src` NOR `font-src` to a same-document `file://` subresource: measured,
// `font-src 'none'` and `img-src data:` both leave Gecko rendering the image and loading all 20
// faces, while WebKit detects each (`loaded=0`, and `local 0/1`). Both are asserted on both
// projects anyway — they are cheap, and an engine changing its mind is worth catching — but do
// not read a green gecko run as evidence about cost. Read it as evidence about the beacon,
// which IS enforced there and which the control on the same run proves.
//
// COUNTED AT A REAL SOCKET, not through a devtools hook, and that distinction is load-bearing —
// more so than an earlier draft of this comment said. Automation layers disagree with each other
// about a CSP-refused load: Puppeteer's Fetch-domain interception never sees one; Playwright's
// Network events see it IN CHROMIUM and report `requestfailed … csp`, and in Gecko and WebKit —
// the two engines this spec actually runs on — emit nothing at all. So a hook-based count means
// three different things in three engines and none of them is "did bytes leave the machine".
// A server counting its own hits means exactly that, everywhere.
//
// The CSP-stripped CONTROL is what makes a 0 mean absent rather than unlooked-for.
//
// THE TWO ENGINES ARE NOT EQUALLY STRICT, and knowing which is which is the point of running
// both. Narrow the policy to `img-src data:` — so the deck's own `file://` image should be
// refused — and WebKit blanks it while GECKO RENDERS IT ANYWAY. Firefox does not subject a
// same-document `file://` image load to `img-src`; it does enforce the directive for the http
// beacon, which the control on this same run proves. So the cost half of this spec is carried by
// WebKit alone, and that is the useful asymmetry: WebKit is the strict engine, WebKit is the one
// Safari is built on, and WebKit renders the deck's own files under the policy we actually ship.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64',
);

test('a downloaded deck refuses a remote fetch and still renders its own files @gecko @webkit-tablet', async ({ page }, testInfo) => {
	test.setTimeout(240_000);
	const dir = testInfo.outputDir;
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, 'local.png'), PNG);

	const hits: string[] = [];
	const server = http.createServer((req, res) => {
		hits.push(req.url || '');
		res.writeHead(200, { 'Content-Type': 'image/png' });
		res.end(PNG);
	});
	// Listen FIRST: the deck has to name the port, so it cannot be written until one exists.
	await new Promise<void>((res) => server.listen(0, '127.0.0.1', () => res()));
	const { port } = server.address() as { port: number };

	try {
		const deck = path.join(dir, 'deck.md');
		fs.writeFileSync(deck, [
			'---', 'marp: true', 'theme: indaco', 'math: katex', '---', '',
			'# Local, remote and math', '',
			'![](local.png)', '',
			`![](http://127.0.0.1:${port}/beacon.png)`, '',
			'$$ \\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2} $$', '',
		].join('\n'));

		const out = path.join(dir, 'live.html');
		// `spawn`, NOT `spawnSync`: the beacon server is in THIS process, so a synchronous spawn
		// blocks the event loop and the export's own Chromium waits for a response that cannot be
		// sent. The integration tier learned this the expensive way.
		// HAND THE EXPORT THE BROWSER THIS TIER ALREADY HAS. The emulator needs a Chrome binary,
		// and it looks for `PUPPETEER_EXECUTABLE_PATH`, then puppeteer's own download, then
		// `google-chrome`/`chromium` on PATH. The nightly runs root `npm ci` with
		// `PUPPETEER_SKIP_DOWNLOAD=1`, and it does NOT search `~/.cache/ms-playwright` — so
		// without this line the spec silently depends on the runner image happening to ship
		// Chrome on PATH, and goes red one day with "Browser was not found", a message that names
		// nothing about the export policy. Playwright's own chromium is installed by this tier,
		// so point at it and the dependency is declared rather than inherited.
		const { status, stderr } = await new Promise<{ status: number | null; stderr: string }>((res, rej) => {
			const child = spawn(process.execPath, [EMULATOR, deck, out, '--quiet'], {
				cwd: ROOT,
				env: { ...process.env, PUPPETEER_EXECUTABLE_PATH: chromium.executablePath() },
			});
			let err = '';
			child.stderr.on('data', (b) => { err += b; });
			child.on('error', rej);
			child.on('close', (code) => res({ status: code, stderr: err }));
		});
		// Carry stderr into the message: a nightly failure here otherwise reports "expected 0,
		// received 2" and nothing about why.
		expect(status, `the export itself succeeded — stderr: ${stderr.slice(-800)}`).toBe(0);

		const live = fs.readFileSync(out, 'utf8');
		expect(live, 'the export carries the policy at all').toMatch(/<meta http-equiv="Content-Security-Policy"/i);
		// The control: the SAME artifact with the policy taken back out.
		const stripped = path.join(dir, 'live-no-csp.html');
		fs.writeFileSync(stripped, live.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/i, ''));

		const open = async (file: string) => {
			hits.length = 0;
			await page.goto(`file://${file}`);
			await page.waitForLoadState('load').catch(() => {});
			// SETTLE ON THE LOCAL IMAGE, NOT ON EVERY IMAGE. "A refused load still completes" is
			// Chromium's behavior and an earlier draft of this spec assumed it everywhere: in
			// Firefox a CSP-refused image never sets `complete`, so waiting for ALL images turned
			// a poll into a swallowed 30-second timeout on every guarded gecko run — the exact
			// unbounded wait this repo has been removing. The deck's own `file://` image always
			// completes (it is the thing under test), so it is a signal that exists in every
			// engine and in both the guarded and stripped cases.
			await page
				.waitForFunction(
					() => [...document.images].filter((i) => (i.currentSrc || i.src).startsWith('file:')).every((i) => i.complete),
					null,
					{ timeout: 20_000 },
				)
				.catch(() => {});
			const local = await page.evaluate(() => {
				const l = [...document.images].filter((i) => (i.currentSrc || i.src).startsWith('file:'));
				return { total: l.length, rendered: l.filter((i) => i.naturalWidth > 0).length };
			});
			return { hits: [...hits], local };
		};

		const guarded = await open(out);
		expect(guarded.hits, 'the downloaded deck fetched a remote subresource despite the policy').toEqual([]);
		expect(guarded.local.total, 'the deck really does carry a local image to be judged on').toBeGreaterThan(0);
		expect(
			guarded.local.rendered,
			"the policy blanked the deck's OWN local image — this engine does not read a "
				+ "same-directory file:// image as 'self', so the cost of this feature is a broken picture",
		).toBe(guarded.local.total);

		// KaTeX is the harder case: its stylesheet and faces live in another directory, so a
		// stricter `'self'` drops every glyph to a fallback while the page still looks fine.
		// Measured on METRICS rather than on the font list, because a face can be "loaded" and
		// still not be what laid the math out.
		const katex = await page.evaluate(async () => {
			await (document.fonts?.ready ?? Promise.resolve());
			const probe = document.createElement('span');
			probe.style.cssText = 'position:absolute;visibility:hidden;font-size:100px;font-family:"KaTeX_Main",monospace';
			probe.textContent = 'MMMMM';
			document.body.appendChild(probe);
			const withFace = probe.getBoundingClientRect().width;
			probe.style.fontFamily = 'monospace';
			const fallback = probe.getBoundingClientRect().width;
			probe.remove();
			const faces = [...(document.fonts ?? [])].filter((f) => /KaTeX/i.test(f.family));
			return { withFace, fallback, faces: faces.length, loaded: faces.filter((f) => f.status === 'loaded').length };
		});
		expect(katex.faces, 'the deck declares KaTeX faces at all').toBeGreaterThan(0);
		expect(katex.loaded, 'font-src blocked KaTeX’s own faces — the math fell back').toBe(katex.faces);
		expect(
			Math.abs(katex.withFace - katex.fallback),
			'KaTeX_Main measures the same as the generic fallback, so the real face is not laying out the math',
		).toBeGreaterThan(50);

		// THE CONTROL. Without it a green run above means "no beacon seen", which is also what a
		// broken probe looks like.
		const bare = await open(stripped);
		expect(
			bare.hits.length,
			'the probe cannot see a beacon even when the policy is removed, so the arm above is vacuous',
		).toBeGreaterThan(0);
	} finally {
		await new Promise<void>((res) => server.close(() => res()));
	}
});
