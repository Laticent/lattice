import http from 'node:http';
import { expect, gotoStudio, livePreview, setEditorContent, shareExport, test } from './studio-fixture';

// ── A deck's web images stay blocked until the reader loads them (trio follow-up 11) ──────
//
// The owner's rule (2026-09-25): a deck you did not write shows placeholders until you choose
// to load its web images, because each one tells its server who opened the deck and when; the
// exports follow the same choice. Driven on the REAL Studio (HARD RULE #23), against a REAL
// local server standing in for the tracker, so every assertion about "no request" is a network
// log, not a claim about a string:
//
//   1. BLOCKED — the preview shows the placeholder, the strip names the site, and the server
//      sees nothing. A PDF exported now sees nothing either: the Studio's capture frame used to
//      pass `csp: false` and fetch every web image at export, on the author's machine.
//   2. CONTROL — after "Load them" the preview DOES fetch from that server, so the empty log
//      above is a refusal, not a probe that could not see. The export fetches too.
//   3. The choice is remembered for this deck across a reload, and "Block again" takes it back.
//
// A loopback server, not a routed `.invalid` host: the export's capture frame and the preview
// are both same-origin srcdoc frames of the page, so `page.route` would see them too, but a
// real listener also proves the request left the browser.

test.describe.configure({ timeout: 300_000 });

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('a deck’s web images stay blocked until the reader loads them, in the preview and the PDF', async ({ page }) => {
	const hits: string[] = [];
	const server = http.createServer((req, res) => {
		hits.push(req.url || '');
		res.writeHead(200, { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' });
		res.end(PNG);
	});
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
	const { port } = server.address() as { port: number };
	const origin = `http://127.0.0.1:${port}`;
	// Plus two spellings the markup rewrite cannot reach, a CSS escape (`\\68` is `h`) and an
	// image-set(): only the frame's policy (in the preview) and the capture sweep (in the export)
	// stand between them and this server.
	const deck = `<!-- _class: content -->\n\n# A photo from the web\n\n![team photo](${origin}/team.png)\n\n<div style="width:160px;height:40px;background-image:url(\\68ttp://127.0.0.1:${port}/escaped.png)"></div>\n<div style="width:160px;height:40px;background-image:image-set('${origin}/set.png' 1x)"></div>\n\nThe copy around it still renders.`;

	try {
		await gotoStudio(page);
		await setEditorContent(page, deck);
		const notice = page.locator('[data-slot="web-images"]');
		const preview = livePreview(page);

		// 1. BLOCKED.
		await expect(notice).toHaveAttribute('data-state', 'blocked', { timeout: 30_000 });
		await expect(notice).toContainText(`from 127.0.0.1:${port}.`);
		const placeholder = preview.locator(`img[data-lattice-web-src="${origin}/team.png"]`);
		await expect(placeholder).toHaveCount(1, { timeout: 30_000 });
		await expect(preview.locator(`img[src^="${origin}"]`)).toHaveCount(0);
		await expect(preview.locator('meta[http-equiv="Content-Security-Policy"]').first()).toHaveAttribute('content', /img-src 'self' data: blob:;/);
		expect(hits, `the blocked preview fetched: ${hits.join(', ')}`).toEqual([]);

		await page.getByRole('button', { name: 'Share', exact: true }).click();
		let download = page.waitForEvent('download', { timeout: 180_000 });
		await shareExport(page, 'pdf');
		await (await download).path();
		expect(hits, `the blocked PDF export fetched: ${hits.join(', ')}`).toEqual([]);
		await page.keyboard.press('Escape');

		// 2. CONTROL.
		await notice.getByRole('button', { name: /^Load \d+ images? from/ }).click();
		await expect(notice).toHaveAttribute('data-state', 'loaded');
		await expect(preview.locator(`img[src="${origin}/team.png"]`)).toHaveCount(1, { timeout: 30_000 });
		await expect.poll(() => hits.length, { timeout: 30_000 }).toBeGreaterThan(0);
		await expect(preview.locator('meta[http-equiv="Content-Security-Policy"]').first()).toHaveAttribute('content', new RegExp(`img-src 'self' data: blob: ${origin.replace(/[.:/]/g, '\\$&')};`));
		const previewHits = hits.length;

		await page.getByRole('button', { name: 'Share', exact: true }).click();
		download = page.waitForEvent('download', { timeout: 180_000 });
		await shareExport(page, 'pdf');
		await (await download).path();
		expect(hits.length, 'the export of an allowed deck loads its image').toBeGreaterThan(previewHits);
		await page.keyboard.press('Escape');

		// 3. Remembered, and reversible.
		await page.reload();
		await expect(notice).toHaveAttribute('data-state', 'loaded', { timeout: 60_000 });
		await notice.getByRole('button', { name: /Block this deck's web images again/ }).click();
		await expect(notice).toHaveAttribute('data-state', 'blocked');
		await expect(preview.locator(`img[data-lattice-web-src="${origin}/team.png"]`)).toHaveCount(1, { timeout: 30_000 });
	} finally {
		await new Promise((r) => server.close(() => r(null)));
	}
});
