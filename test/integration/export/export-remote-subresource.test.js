/**
 * Integration: a deck cannot beacon out of a LIVE exported document, and the raster path still
 * fetches.
 *
 * #1753 contained the docs-site preview frames. Exports were left open and written up as an
 * open question; measuring them split it in three, and the split is what this file pins:
 *
 *   · CONTAINED — `--player` (and the Studio's Webpage export). Its own CSP has carried
 *     `default-src 'none'; img-src data:` all along. Nothing to decide.
 *   · LIVE DOCUMENT — the `.html` deliverable, the `--fluid` viewer ("a single emailable file",
 *     its own `--help`), and the `.html` sidecar written beside a pdf/pptx/png. Someone OPENS
 *     these, so a deck's remote image beacons on the RECIPIENT's machine, on every open —
 *     measured at 2 requests each before this change. Contained.
 *   · RASTER — pdf/pptx/png/imageset. The fetch happens on the EXPORTING author's machine and
 *     the recipient receives baked pixels, so containing it would blank a picture the author
 *     asked for and buy the recipient nothing. Deliberately still fetches.
 *
 * WHY THE RASTER ARM IS HERE AT ALL, and it is the load-bearing one: the whole boundary rests
 * on WHERE the meta is injected — after rasterization, into whatever HTML the run leaves
 * behind. Move that one step earlier and every PDF, PPTX and PNG silently loses its remote
 * images, with the live arms below still green. Nothing else in the tree can see that, so this
 * asserts the author's own request DOES reach a real server.
 *
 * DRIVEN ON THE ARTIFACT, not on the emission (HARD RULE #23). A grep for the meta tag says
 * the string is in the file; it says nothing about whether the browser then refuses the fetch.
 * Every arm opens the real exported file from `file://` in Chromium.
 *
 * THE PAYLOAD MUST STILL BE IN THE DOM — that is what separates "the fetch was refused" from
 * "the markup was rewritten", and it is the arm that would catch a future change quietly
 * stripping the attribute and passing for the wrong reason.
 *
 * THE CONTROL strips the meta back out of a shipped artifact and asserts the requests DO fire.
 * Without it, a probe that could never see a beacon would pass every claim below.
 *
 * Slow tier: four CLI exports and a Chromium launch. See engineering/pipeline.md.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const { pathToFileURL } = require('node:url');

describe('export: a deck cannot beacon out of a live exported document', () => {
	const ROOT = path.join(__dirname, '..', '..', '..');
	const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
	const TIMEOUT = 180000;
	/** Routed, never resolved: `.invalid` fails at DNS by definition, so without interception a
	 *  live vector and a blocked one look identical. */
	const ATTACKER = 'attacker.invalid';
	const DECK = `---
marp: true
theme: indaco
---

# Beacon

![pic](https://${ATTACKER}/plain.png)

<span style="background-image:url(https://${ATTACKER}/bg.png)">shaded</span>
`;

	let dir;
	let browser;
	test.before(async () => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-subresource-'));
		fs.writeFileSync(path.join(dir, 'beacon.md'), DECK);
		const puppeteer = require('puppeteer');
		browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
	});
	test.after(async () => { if (browser) await browser.close(); });

	function exportDeck(name, args) {
		const out = path.join(dir, name);
		const r = spawnSync(process.execPath, [EMULATOR, path.join(dir, 'beacon.md'), out, '--quiet', ...args], {
			cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
		});
		assert.equal(r.status, 0, `emulator failed for ${name}: ${r.stderr}`);
		return out;
	}

	/** Open a file:// artifact and record every request reaching the attacker host. */
	async function probe(file) {
		const page = await browser.newPage();
		const hits = [];
		await page.setRequestInterception(true);
		page.on('request', (r) => {
			if (r.url().includes(ATTACKER)) { hits.push(r.url()); return r.respond({ status: 200, contentType: 'image/png', body: '' }); }
			return r.continue();
		});
		await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
		// A refused load still completes, so poll the images rather than sleeping.
		await page.waitForFunction(() => [...document.images].every((i) => i.complete), { timeout: 20000 }).catch(() => {});
		const payload = await page.evaluate((host) =>
			document.querySelectorAll(`[src*="${host}"], [style*="${host}"]`).length, ATTACKER);
		await page.close();
		return { hits, payload };
	}

	test('the .html deliverable, the --fluid viewer and the player all refuse the fetch', { timeout: TIMEOUT }, async () => {
		for (const [label, args] of [['plain', []], ['fluid', ['--fluid']], ['player', ['--player']]]) {
			const file = exportDeck(`${label}.html`, args);
			const { hits, payload } = await probe(file);
			assert.ok(payload > 0, `${label}: the payload is not in the DOM, so this arm proves nothing`);
			assert.deepEqual(hits, [], `${label}: the exported artifact fetched ${hits.length} remote subresource(s): ${hits.join(', ')}`);
		}
	});

	// THE DECK MUST NOT BE ABLE TO SWITCH THE POLICY OFF. The skip that spares the assembled
	// player used to be a text match against the WHOLE rendered file, deck body included —
	// so the one actor this control defends against could disable it, in two measured ways.
	// A `<head>`-scoped text match would still fall to the second, because a deck's `style:`
	// lands in a `<style>` inside <head>; the skip is a FLAG for that reason, and this arm is
	// what stops it drifting back into a content test.
	test('a deck cannot suppress its own policy', { timeout: TIMEOUT }, async () => {
		const cases = {
			// Deliberate: a CSP meta in the BODY. Browsers ignore one outside <head>, so before
			// the fix the artifact carried no effective policy at all.
			'rawmeta': '# Raw meta\n\n<meta http-equiv="Content-Security-Policy" content="img-src *">\n',
			// Accidental, and the worse of the two: markdown-it's escapeHtml does NOT escape
			// `'`, so an inline code span or a front-matter `style:` comment carrying the
			// string suppressed the policy on a deck whose author was documenting the feature.
			'codespan': "# Opt out\n\nA code span: `http-equiv='Content-Security-Policy'`\n",
		};
		for (const [name, body] of Object.entries(cases)) {
			const deck = path.join(dir, `${name}.md`);
			fs.writeFileSync(deck, `---\nmarp: true\ntheme: indaco\nstyle: |\n  /* http-equiv='Content-Security-Policy' */\n---\n\n${body}\n![pic](https://${ATTACKER}/plain.png)\n`);
			const r = spawnSync(process.execPath, [EMULATOR, deck, path.join(dir, `${name}.html`), '--quiet'], {
				cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
			});
			assert.equal(r.status, 0, `emulator failed for ${name}: ${r.stderr}`);
			const file = path.join(dir, `${name}.html`);
			// In <head>, where it governs — not merely present somewhere in the file.
			const html = fs.readFileSync(file, 'utf8');
			const head = html.slice(0, html.toLowerCase().indexOf('</head>'));
			assert.ok(
				/http-equiv="Content-Security-Policy"/i.test(head),
				`${name}: the deck suppressed its own policy — the skip is matching deck CONTENT again`
			);
			const { hits } = await probe(file);
			assert.deepEqual(hits, [], `${name}: the deck beaconed despite the policy`);
		}
	});

	test('CONTROL — with the policy removed, the same artifact does beacon', { timeout: TIMEOUT }, async () => {
		const file = exportDeck('control.html', []);
		const stripped = path.join(dir, 'control-nocsp.html');
		const html = fs.readFileSync(file, 'utf8');
		const without = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/i, '');
		assert.notEqual(without, html, 'guard: the shipped artifact carries a policy to remove');
		fs.writeFileSync(stripped, without);
		const { hits } = await probe(stripped);
		assert.ok(hits.length > 0, 'the probe cannot see a beacon even when one fires, so every arm above is vacuous');
	});

	// The DECIDED BOUNDARY, and the only arm that can catch the injection moving one step
	// earlier. A local server rather than the interception probe: the request this asserts is
	// made by the EXPORT's own Chromium, not by the page under test.
	test('the raster path still fetches, on the author’s machine', { timeout: TIMEOUT }, async () => {
		const hits = [];
		const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
		const server = http.createServer((req, res) => { hits.push(req.url); res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(png); });
		await new Promise((res) => server.listen(0, '127.0.0.1', res));
		const { port } = server.address();
		try {
			const deck = path.join(dir, 'raster.md');
			fs.writeFileSync(deck, `---\nmarp: true\ntheme: indaco\n---\n\n# Raster\n\n![pic](http://127.0.0.1:${port}/plain.png)\n`);
			const out = path.join(dir, 'raster.pdf');
			// `spawn`, NOT `spawnSync`: the image server is in THIS process, and a synchronous
			// spawn blocks the event loop, so the export's own Chromium waits 60 s for a
			// response that cannot be sent and the whole arm fails as a navigation timeout.
			const r = await new Promise((res, rej) => {
				const child = spawn(process.execPath, [EMULATOR, deck, out, '--quiet'], {
					cwd: ROOT, env: { ...process.env },
				});
				let stderr = '';
				child.stderr.on('data', (b) => { stderr += b; });
				child.on('error', rej);
				child.on('close', (status) => res({ status, stderr }));
			});
			assert.equal(r.status, 0, `emulator failed on the raster deck: ${r.stderr}`);
			assert.deepEqual(
				hits, ['/plain.png'],
				'the PDF export did not fetch the deck’s remote image — the policy is being injected '
				+ 'BEFORE rasterization, so every raster artifact silently loses its remote images'
			);
			// And the sidecar written beside it is a live document, so it IS contained.
			assert.match(
				fs.readFileSync(path.join(dir, 'raster.html'), 'utf8'),
				/http-equiv="Content-Security-Policy"/i,
				'the .html sidecar beside a raster export is a live document and carries the policy'
			);
		} finally {
			await new Promise((res) => server.close(res));
		}
	});

	// THE FAILURE PATH, EXECUTED — not argued.
	//
	// The skip that spares the player is a FLAG set where the player is actually written, and
	// the reason it is a flag rather than a text match is that a DECK could otherwise switch its
	// own policy off. But a flag has a second edge the text match did not: when player assembly
	// THROWS, the emulator warns and keeps the clean static render it wrote before rasterizing —
	// and that render is a live document, so it must get the policy. `playerOwnsOutHtml` stays
	// false on that path, which is the whole argument, and until now the argument was all there
	// was: nothing drove it.
	//
	// Forced deterministically by poisoning the module cache in a `--require` preload, because
	// `buildPlayerHtml` is required lazily INSIDE the try. That is the only way to reach this
	// branch without breaking shipped code, and it makes the branch a gate rather than a note.
	test('a player-assembly failure leaves a contained sidecar, not a bare one', { timeout: TIMEOUT }, async () => {
		const preload = path.join(dir, 'break-player.cjs');
		fs.writeFileSync(preload, [
			"const path = require('node:path');",
			`const target = require.resolve(path.join(${JSON.stringify(ROOT)}, 'lib/export/html-player.js'));`,
			'require.cache[target] = { id: target, filename: target, loaded: true, exports: {',
			"  buildPlayerHtml: async () => { throw new Error('forced player assembly failure'); },",
			'} };',
			'',
		].join('\n'));

		const out = path.join(dir, 'player-broke.html');
		const r = spawnSync(
			process.execPath,
			['--require', preload, EMULATOR, path.join(dir, 'beacon.md'), out, '--player'],
			{ cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT },
		);

		assert.equal(r.status, 0, `a player-assembly failure must not fail the run: ${r.stderr}`);
		// The forced failure really happened. Without this the arm would pass on a run where
		// assembly SUCCEEDED and the preload silently did nothing — certifying the opposite path.
		assert.match(
			`${r.stdout}${r.stderr}`,
			/--player assembly failed \(forced player assembly failure\)/,
			'the preload did not actually break player assembly, so this arm proves nothing',
		);
		const html = fs.readFileSync(out, 'utf8');
		// It really IS the fallback, not a player: a player carries its own stricter policy and
		// its inline kernel. Without this the arm would pass on a run where assembly succeeded.
		assert.doesNotMatch(html, /default-src 'none'/, 'this is the clean render, not an assembled player');
		assert.match(
			html,
			/<head[^>]*><meta http-equiv="Content-Security-Policy"/i,
			'the clean sidecar left by a failed player assembly shipped WITHOUT the policy — a '
			+ 'live document a recipient opens, uncontained, on the one path nobody drives',
		);
		// And it behaves: opened for real, the beacons do not fire.
		const { hits } = await probe(out);
		assert.deepEqual(hits, [], 'the fallback sidecar beaconed when opened');
	});
});
