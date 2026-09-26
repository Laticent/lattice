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
 *   · RASTER — pdf/pptx/png/imageset. Left fetching until 2026-09-24, on the reasoning that the
 *     exporting author chose every image. Portable packages broke that: a stranger's component
 *     can put its sample slide into the author's deck on Insert, and every bypass the package
 *     gate's reviews found reached the network here. So the render's own browsers are now kept
 *     off the network (lib/core/offline-chromium.js), and `--allow-remote` restores the old
 *     behavior for an author who wants a remote image baked in. The raster arms below assert
 *     both, against a real local server.
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
		// The address may sit in the attribute that fetches it, or, since trio follow-up 11, in the
		// `data-lattice-web-src` the drawn placeholder keeps it in. Either way it is in the file.
		const payload = await page.evaluate((host) =>
			document.querySelectorAll(`[src*="${host}"], [style*="${host}"], [data-lattice-web-src*="${host}"]`).length, ATTACKER);
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
		// `--allow-remote`: without it the export swaps each web image for the placeholder
		// (trio follow-up 11), so there would be no address left for a stripped policy to let
		// through. With it the raw addresses stay, and only the policy stands between them and
		// the network: remove it, and they must fire.
		const file = exportDeck('control.html', ['--allow-remote']);
		const stripped = path.join(dir, 'control-nocsp.html');
		const html = fs.readFileSync(file, 'utf8');
		const without = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/i, '');
		assert.notEqual(without, html, 'guard: the shipped artifact carries a policy to remove');
		fs.writeFileSync(stripped, without);
		const { hits } = await probe(stripped);
		assert.ok(hits.length > 0, 'the probe cannot see a beacon even when one fires, so every arm above is vacuous');
	});

	// THE PLACEHOLDER (trio follow-up 11). By default the export swaps each web image for the
	// drawn stand-in, keeps its address in `data-lattice-web-src`, rewrites a web background to
	// the hatch, and says once on stderr what was left out and how to load it. `--allow-remote`
	// keeps every address and says nothing.
	test('a web image exports as the placeholder, and the CLI says so once', { timeout: TIMEOUT }, async () => {
		const deck = path.join(dir, 'web.md');
		fs.writeFileSync(deck, `---\nmarp: true\ntheme: indaco\n---\n\n# One\n\n![pic](https://${ATTACKER}/one.png)\n\n---\n\n# Two\n\n<span style="background-image:url(https://${ATTACKER}/bg.png)">shaded</span>\n`);
		const run = (args, out) => spawnSync(process.execPath, [EMULATOR, deck, path.join(dir, out), ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT });
		const blocked = run([], 'web.html');
		assert.equal(blocked.status, 0, blocked.stderr);
		const notices = (blocked.stderr.match(/web images? from/g) || []).length;
		assert.equal(notices, 1, `expected one notice, got ${notices}: ${blocked.stderr}`);
		assert.match(blocked.stderr, /2 web images from https:\/\/attacker\.invalid were left out, and a drawn placeholder stands in\..*--allow-remote/);
		const html = fs.readFileSync(path.join(dir, 'web.html'), 'utf8');
		assert.match(html, /<img src="data:image\/svg\+xml[^"]*"[^>]*data-lattice-web-src="https:\/\/attacker\.invalid\/one\.png"/);
		assert.doesNotMatch(html, /(?:\ssrc="|url\()https:\/\/attacker\.invalid/, 'no web address is left where the browser would fetch it');
		const allowed = run(['--allow-remote'], 'web-allowed.html');
		assert.equal(allowed.status, 0, allowed.stderr);
		assert.doesNotMatch(allowed.stderr, /web images? from/);
		assert.match(fs.readFileSync(path.join(dir, 'web-allowed.html'), 'utf8'), /\ssrc="https:\/\/attacker\.invalid\/one\.png"/);
	});

	// THE RASTER CLASS, revised 2026-09-24. The render's own Chromium is kept off the network
	// (lib/core/offline-chromium.js) unless the author passes --allow-remote. A local server
	// rather than the interception probe: the request this asserts about is made by the EXPORT's
	// own Chromium, not by the page under test. The --allow-remote arm is the control: the same
	// server, the same deck, and the request DOES arrive, so an empty list above is a refusal
	// rather than a probe that could not see.
	async function rasterHits(args) {
		const hits = [];
		const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
		const server = http.createServer((req, res) => { hits.push(req.url); res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(png); });
		await new Promise((res) => server.listen(0, '127.0.0.1', res));
		const { port } = server.address();
		try {
			const deck = path.join(dir, 'raster.md');
			fs.writeFileSync(deck, `---\nmarp: true\ntheme: indaco\n---\n\n# Raster\n\n![pic](http://127.0.0.1:${port}/plain.png)\n\n<span style="background-image:url(http://127.0.0.1:${port}/bg.png)">shaded</span>\n`);
			const out = path.join(dir, 'raster.pdf');
			// `spawn`, NOT `spawnSync`: the image server is in THIS process, and a synchronous
			// spawn blocks the event loop, so the export's own Chromium waits 60 s for a
			// response that cannot be sent and the whole arm fails as a navigation timeout.
			const r = await new Promise((res, rej) => {
				const child = spawn(process.execPath, [EMULATOR, deck, out, '--quiet', ...args], {
					cwd: ROOT, env: { ...process.env },
				});
				let stderr = '';
				child.stderr.on('data', (b) => { stderr += b; });
				child.on('error', rej);
				child.on('close', (status) => res({ status, stderr }));
			});
			assert.equal(r.status, 0, `emulator failed on the raster deck: ${r.stderr}`);
			// The sidecar written beside it is a live document, so it carries the policy either way.
			assert.match(
				fs.readFileSync(path.join(dir, 'raster.html'), 'utf8'),
				/http-equiv="Content-Security-Policy"/i,
				'the .html sidecar beside a raster export is a live document and carries the policy'
			);
			return hits.sort();
		} finally {
			await new Promise((res) => server.close(res));
		}
	}

	test('the raster path fetches nothing by default, not even from loopback', { timeout: TIMEOUT }, async () => {
		assert.deepEqual(
			await rasterHits([]), [],
			'the PDF export reached the network — every browser the render starts must be kept off it '
			+ 'unless --allow-remote (lib/core/offline-chromium.js)'
		);
	});

	test('CONTROL — with --allow-remote the same export does fetch', { timeout: TIMEOUT }, async () => {
		assert.deepEqual(await rasterHits(['--allow-remote']), ['/bg.png', '/plain.png'], 'the opt-out does not reach the render, or the probe cannot see a fetch');
	});

	// WEBRTC, the traffic a proxy never sees. A deck's script can open an RTCPeerConnection whose
	// ICE gathering sends STUN over UDP straight past an http proxy. The render's browsers carry
	// Chromium's WebRTC policy that keeps it to proxied traffic (lib/core/offline-chromium.js);
	// a UDP listener on loopback is the oracle, and --allow-remote is the control.
	async function stunHits(args) {
		const dgram = require('node:dgram');
		const sock = dgram.createSocket('udp4');
		const hits = [];
		sock.on('message', (msg) => hits.push(msg.length));
		await new Promise((res) => sock.bind(0, '127.0.0.1', res));
		const { port } = sock.address();
		try {
			const deck = path.join(dir, 'stun.md');
			fs.writeFileSync(deck, `---\nmarp: true\ntheme: indaco\n---\n\n# Stun\n\n<script>\nconst pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:127.0.0.1:${port}' }] });\npc.createDataChannel('x'); pc.createOffer().then((o) => pc.setLocalDescription(o));\nwindow.__pc = pc;\n</script>\n`);
			const r = await new Promise((res, rej) => {
				const child = spawn(process.execPath, [EMULATOR, deck, path.join(dir, 'stun.pdf'), '--quiet', ...args], { cwd: ROOT, env: { ...process.env } });
				let stderr = '';
				child.stderr.on('data', (b) => { stderr += b; });
				child.on('error', rej);
				child.on('close', (status) => res({ status, stderr }));
			});
			assert.equal(r.status, 0, `emulator failed on the STUN deck: ${r.stderr}`);
			return hits.length;
		} finally {
			sock.close();
		}
	}

	test('a deck script cannot reach the network over WebRTC by default', { timeout: TIMEOUT }, async () => {
		assert.equal(await stunHits([]), 0, 'a STUN packet left the render — the WebRTC policy is missing from the launch arguments');
	});

	test('CONTROL — with --allow-remote the same script does send STUN', { timeout: TIMEOUT }, async () => {
		assert.ok((await stunHits(['--allow-remote'])) > 0, 'the probe cannot see a STUN packet, so the arm above is vacuous');
	});

	// THE RESOLVER RULE, pinned (followups.d/2336-p3-packages-trio-followups.md item 13). The
	// arms above pass with it deleted, because the dead proxy alone already refuses their
	// requests. What the rule adds is only visible when the proxy is NOT dead: something listening
	// on the proxy's port. `MAP * ~NOTFOUND` maps every host, the proxy's own 127.0.0.1
	// included, so no request reaches that listener at all; without the rule, every request goes
	// to it as an http proxy request naming the target host. So this arm launches a browser with
	// the SHIPPED arguments, moving only the proxy to a live loopback listener (port 9 needs
	// root), and counts what arrives. The control drops the resolver rule and nothing else.
	async function proxyHits(dropResolverRule) {
		const { OFFLINE_CHROMIUM_ARGS } = require(path.join(ROOT, 'lib/core/offline-chromium.js'));
		const seen = [];
		const listener = require('node:net').createServer((sock) => {
			// Answer every request with a refusal, so a page waiting on one finishes loading.
			sock.once('data', (b) => { seen.push(String(b).split('\r\n')[0]); sock.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n'); });
			sock.on('error', () => {});
		});
		await new Promise((res) => listener.listen(0, '127.0.0.1', res));
		const { port } = listener.address();
		const args = OFFLINE_CHROMIUM_ARGS
			.filter((a) => !(dropResolverRule && a.startsWith('--host-resolver-rules=')))
			.map((a) => (a.startsWith('--proxy-server=') ? `--proxy-server=http://127.0.0.1:${port}` : a));
		assert.equal(args.length, OFFLINE_CHROMIUM_ARGS.length - (dropResolverRule ? 1 : 0), 'the shipped arguments changed shape; re-read this arm');
		const puppeteer = require('puppeteer');
		const offline = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage', ...args] });
		try {
			const page = await offline.newPage();
			await page.setContent(
				'<img src="https://img-probe.lattice-e2e.invalid/a.png"><img src="http://10.9.9.9/b.png">'
				+ '<script>fetch("https://fetch-probe.lattice-e2e.invalid/").catch(() => {});</script>',
				{ waitUntil: 'domcontentloaded' },
			);
			await page.waitForFunction(() => [...document.images].every((i) => i.complete), { timeout: 20000 }).catch(() => {});
			// A request the listener accepted is written at once; give a late one a moment to land.
			await new Promise((r) => setTimeout(r, 1000));
		} finally {
			await offline.close();
			listener.close();
		}
		return seen.filter((line) => /probe|10\.9\.9\.9/.test(line));
	}

	test('the resolver rule keeps even a LIVE listener on the proxy port from seeing a request', { timeout: TIMEOUT }, async () => {
		assert.deepEqual(await proxyHits(false), [], 'a request reached the proxy port — --host-resolver-rules is missing from lib/core/offline-chromium.js');
	});

	test('CONTROL — without the resolver rule, the same page reaches that listener by host name', { timeout: TIMEOUT }, async () => {
		const hits = await proxyHits(true);
		assert.ok(hits.some((l) => l.includes('img-probe.lattice-e2e.invalid')), `the listener saw no host-name request, so the arm above is vacuous: ${JSON.stringify(hits)}`);
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
		// And it behaves: opened for real, the beacons do not fire — with the payload guard every
		// other arm here carries. Without it a fallback render that lost the deck body entirely
		// satisfies both the `<head><meta>` match above and an empty hit list.
		const { hits, payload } = await probe(out);
		assert.ok(payload > 0, 'the fallback render does not carry the deck’s remote refs, so this arm proves nothing');
		assert.deepEqual(hits, [], 'the fallback sidecar beaconed when opened');
	});
});
