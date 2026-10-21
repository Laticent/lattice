import dgram from 'node:dgram';
import fs from 'node:fs';
import http from 'node:http';
import { WORKER_NETWORK } from '../../lib/packages/code-shape.mjs';
import { ganttZip } from './plugin-fence-fixture';
import { expect, gotoStudio, livePreview, setEditorContent, shareExport, test, toastText } from './studio-fixture';

// ── A zip plugin draws its fence in the Studio only after the deck lists it AND the user approves its code,
//    sandboxed, and reaches nothing (plugin-system §9 decisions 10 to 15; HARD RULE #23) ──
//
// A stranger's plugin (a `render.js` that owns the ```` ```gantt ```` fence) is imported through the REAL
// Library, listed in a deck's `plugins:` front matter, approved from the notice above the preview, and
// drawn by the real engine in the real preview iframe. It is hostile: at load and on every fence it tries
// fetch, a WebSocket, `importScripts`, a dynamic import built at run time, an EventSource, a font load, a
// nested worker, WebRTC to a UDP port and a navigation, and the markup it returns names a local server
// six ways. A REAL loopback HTTP + WebSocket server and a UDP socket count what reaches them.
//
//   1. NOT LISTED   the deck does not name the plugin → a placeholder stands in the block and the strip offers
//                   it; nothing runs, no frame opens, the log is empty.
//   2. UNAPPROVED   listed, never approved → the block stays code with a note, the notice offers the
//                   code, no frame opens, the log is empty.
//   3. APPROVED     the fence draws inside the plugin's root; the foreign class, the handler and every
//                   address are gone; the frame was sandboxed with an opaque origin and closed again;
//                   the log is STILL empty.
//   4. SHARE → PDF  the export renders the same deck through the same door and downloads.
//   5. CONTROL      the same page reaches both listeners, so the empty logs above are refusals.

test.describe.configure({ timeout: 300_000 });

const RENDERER = (origin: string, udp: number) => `
try { fetch("${origin}/load-fetch").catch(function(){}); } catch (e) {}
try { importScripts("${origin}/load-import"); } catch (e) {}
function render(fence, kit) {
  try { fetch("${origin}/fetch").catch(function(){}); } catch (e) {}
  try { new WebSocket("${origin.replace('http', 'ws')}/websocket"); } catch (e) {}
  try { (0, eval)('import("${origin}/evalimport").catch(function(){})'); } catch (e) {}
  try { new EventSource("${origin}/eventsource"); } catch (e) {}
  try { var ff = new FontFace("x", "url(${origin}/fontface)"); ff.load().catch(function(){}); self.fonts.add(ff); } catch (e) {}
  try { new Worker(URL.createObjectURL(new Blob(["fetch('${origin}/nested').catch(function(){})"]))); } catch (e) {}
  try { var pc = new (self.RTCPeerConnection || self.webkitRTCPeerConnection)({ iceServers: [{ urls: "stun:127.0.0.1:${udp}" }] }); pc.createDataChannel("x"); pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }); } catch (e) {}
  try { self.location.href = "${origin}/navigate"; } catch (e) {}
  var reach = [];
  ${JSON.stringify(WORKER_NETWORK)}.forEach(function (k) {
    for (var o = self; o; o = Object.getPrototypeOf(o)) { var d = Object.getOwnPropertyDescriptor(o, k); if (d && (d.get || d.value != null)) { reach.push(k); break; } }
  });
  var rows = fence.body.trim().split("\\n").filter(Boolean);
  var bars = rows.map(function (l, i) {
    var parts = l.split(/\\s+/); var n = Number(parts[parts.length - 1]) || 1;
    return '<rect x="96" y="' + (i * 26 + 6) + '" width="' + n * 60 + '" height="16" rx="3" fill="var(--accent)"></rect><text x="0" y="' + (i * 26 + 19) + '" fill="var(--text-body)" font-size="13">' + parts.slice(0, -1).join(" ").replace(/&/g, "&amp;").replace(/</g, "&lt;") + '</text>';
  }).join("");
  return '<svg class="lp-gantt-plugin-chart foreign-class" id="' + fence.id + '" viewBox="0 0 520 ' + (rows.length * 26 + 8) + '" width="520" data-wall="' + (reach.join(" ") || "none") + '" data-rtc="' + typeof (self.RTCPeerConnection || self.webkitRTCPeerConnection) + '" data-measure="' + (kit.measure("Wide text", "16px sans-serif") > kit.measure("i", "16px sans-serif") ? "yes" : "no") + '" onclick="alert(1)">' + bars + '</svg>' +
    '<img src="${origin}/img" alt=""><img srcset="${origin}/srcset 1x" alt=""><video poster="${origin}/poster"></video>' +
    '<svg width="4" height="4"><image href="${origin}/svgimage" width="4" height="4"></image></svg>' +
    '<span style="background-image:url(${origin}/cssurl)">x</span><a href="${origin}/link">link</a>' +
    '<aside class="lattice-notes" hidden data-slide="1">FORGED-NOTE</aside>';
}
export { render as default };
`;

async function openLibrary(page: Parameters<typeof gotoStudio>[0]) {
	const docked = page.getByRole('button', { name: 'Open Library' });
	await ((await docked.count()) ? docked : page.getByRole('button', { name: 'Library', exact: true })).click();
}

const LISTED = '---\nplugins: [gantt-plugin]\n---\n\n## Plan\n\n```gantt\nDesign 2\nBuild 4\nShip 3\n```\n';
const UNLISTED = LISTED.replace('plugins: [gantt-plugin]\n', '');

for (const tag of [' @gecko', ' @webkit-tablet']) {
	test(`a zip plugin draws its fence only when listed and approved, sandboxed, and reaches nothing${tag}`, async ({ page, browserName }) => {
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
			await page.locator('[data-testid="library-import-input"]').setInputFiles({ name: 'gantt-plugin.zip', mimeType: 'application/zip', buffer: await ganttZip(RENDERER(origin, udpPort)) });
			await expect(page.locator('[data-sonner-toast]').first()).toContainText('1 plugin(s)');
			await page.keyboard.press('Escape');
			const preview = livePreview(page);
			const notice = page.locator('[data-slot="code-packages"]');

			// 1. NOT LISTED: installed, not named by the deck. A drawn placeholder stands in the block, the strip
			//    offers it, and nothing runs.
			await setEditorContent(page, UNLISTED);
			await expect(preview.locator('[data-lattice-plugin-off="gantt-plugin"]')).toHaveCount(1, { timeout: 30_000 });
			await expect(preview.locator('code.language-gantt')).toHaveCount(0);
			await expect(preview.locator('[data-lattice-plugin]')).toHaveCount(0);
			await expect(page.locator('iframe[data-lattice-code-sandbox]')).toHaveCount(0);
			await expect(notice).toHaveAttribute('data-state', 'offered');

			// 2. UNAPPROVED: listed, never approved.
			await setEditorContent(page, LISTED);
			await expect(notice).toHaveAttribute('data-state', 'unapproved', { timeout: 30_000 });
			await expect(notice).toContainText('This deck uses code from the plugin “gantt-plugin”, which has not run.');
			await notice.getByRole('button', { name: 'What it is' }).click();
			await expect(page.locator('[data-slot="code-packages-detail"]')).toContainText(/gantt-plugin\.render\.js \(the ```gantt fence\), [\d,]+ bytes, sha256 [0-9a-f]{64}/);
			await expect(preview.locator('[data-package-error="gantt-plugin"]')).toContainText('its code has not been approved in this browser');
			await expect(preview.locator('[data-lattice-plugin]')).toHaveCount(0);
			await expect(page.locator('iframe[data-lattice-code-sandbox]')).toHaveCount(0);
			await settle();
			expect(hits, `the unapproved plugin reached the server: ${hits.join(', ')}`).toEqual([]);
			expect(udpHits).toEqual([]);

			// 3. APPROVED.
			await page.evaluate(() => {
				const w = window as unknown as { __sandboxes: string[] };
				w.__sandboxes = [];
				new MutationObserver((records) => {
					for (const r of records) for (const n of r.addedNodes) if (n instanceof HTMLIFrameElement && n.hasAttribute('data-lattice-code-sandbox')) w.__sandboxes.push(String(n.getAttribute('sandbox')));
				}).observe(document.body, { childList: true, subtree: true });
			});
			await notice.getByRole('button', { name: 'Run the code of gantt-plugin' }).click();
			const chart = preview.locator('[data-lattice-plugin="gantt-plugin"] svg.lp-gantt-plugin-chart');
			await expect(chart).toHaveCount(1, { timeout: 30_000 });
			await expect(chart.locator('rect')).toHaveCount(3);
			await expect(notice).toHaveCount(0);
			await expect(chart).toHaveAttribute('data-rtc', 'undefined');
			await expect(chart).toHaveAttribute('data-wall', 'none');
			await expect(chart).toHaveAttribute('data-measure', 'yes');
			await expect(chart).not.toHaveAttribute('onclick', /.*/);
			const sandboxes = await page.evaluate(() => (window as unknown as { __sandboxes: string[] }).__sandboxes);
			expect(sandboxes.length, 'the plugin ran in a sandbox frame').toBeGreaterThan(0);
			expect(new Set(sandboxes)).toEqual(new Set(['allow-scripts']));
			await expect(page.locator('iframe[data-lattice-code-sandbox]')).toHaveCount(0);
			await settle();
			test.info().annotations.push({ type: 'log-server', description: `${test.info().project.name}: ${hits.length} requests, ${udpHits.length} UDP packets after the approved run` });
			expect(hits, `the approved plugin reached the server: ${hits.join(', ')}`).toEqual([]);
			expect(udpHits, 'the approved plugin reached the UDP socket (WebRTC)').toEqual([]);
			const shown = await preview.locator('section').first().evaluate((s) => s.outerHTML);
			expect(shown).not.toContain(origin.replace('http://', ''));
			expect(shown).not.toMatch(/class="lattice-notes"[^>]*>[^<]*FORGED-NOTE/);
			expect(shown).not.toMatch(/foreign-class|alert\(/);
			const evidence = process.env.LATTICE_EVIDENCE_DIR;
			if (evidence) await preview.locator('section').first().screenshot({ path: `${evidence}/plugin-fence-approved-${browserName}.png` });

			// 4. SHARE → PDF: the export goes through the same door and downloads a PDF.
			await page.getByRole('button', { name: 'Share', exact: true }).click();
			await expect(page.getByRole('dialog')).toBeVisible();
			const download = page.waitForEvent('download', { timeout: 90_000 });
			await shareExport(page, 'pdf');
			const d = await download;
			expect(d.suggestedFilename()).toMatch(/\.pdf$/);
			await expect(toastText(page)).toContainText('PDF ready.');
			const pdfPath = (await d.path()) as string;
			expect(fs.statSync(pdfPath).size).toBeGreaterThan(1000);
			if (evidence) fs.copyFileSync(pdfPath, `${evidence}/plugin-fence-share-${browserName}.pdf`);
			await settle();
			expect(hits, `the export reached the server: ${hits.join(', ')}`).toEqual([]);
			await page.keyboard.press('Escape');

			// 5. CONTROL: the same page reaches both listeners, so the empty logs above are refusals.
			if (browserName !== 'firefox') {
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
			await setEditorContent(page, `${LISTED}\n![control](${origin}/control.png)\n`);
			const web = page.locator('[data-slot="web-images"]');
			await expect(web).toHaveAttribute('data-state', 'blocked', { timeout: 30_000 });
			await web.getByRole('button', { name: /^Load \d+ images? from/ }).click();
			await expect.poll(() => hits.filter((h) => h === '/control.png').length, { timeout: 30_000 }).toBeGreaterThan(0);
			expect(hits.filter((h) => h !== '/control.png'), 'only the control reached the server').toEqual([]);
		} finally {
			server.closeAllConnections();
			await new Promise((r) => server.close(() => r(null)));
			udp.close();
		}
	});
}
