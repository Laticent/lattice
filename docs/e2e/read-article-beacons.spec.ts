import http from 'node:http';
import { createRequire } from 'node:module';
import { CHROME, expect, gotoStudio, livePreview, setEditorContent, test } from './studio-fixture';

// ── The Reading view loads nothing from the web the reader did not allow (HARD RULE #22) ─────
//
// Read · Article renders the deck in the Studio's OWN page, which has no content-security policy,
// so `blockWebImages` and `blockWebCss` (lib/core/remote-ref.js) are the only wall there. Every
// spelling in test/fixtures/web-ref-beacons.js once fetched past them; the integration tier
// proves the functions' output in a bare page, and this spec proves the real surface, with a real
// loopback server standing in for the tracker (a network log, not a claim about a string):
//
//   1. BLOCKED: the reader has allowed nothing, and the server sees no request.
//   2. CONTROL: after "Load … from 127.0.0.1", the same Reading view DOES fetch, so the empty log
//      above is a refusal, not a probe that cannot see.
//
// Not every spelling reaches this page: markdown-it escapes a tag CommonMark does not read as
// HTML, and the sanitizer drops what it forbids. The control's log names the spellings that do,
// so the run says what it proved rather than counting a payload that never arrived as a pass.

test.describe.configure({ timeout: 300_000 });

const require = createRequire(import.meta.url);
const { webRefBeacons, asHtml } = require('../../test/fixtures/web-ref-beacons.js') as {
	webRefBeacons: (base: string) => Array<{ name: string; kind: string; text: string }>;
	asHtml: (p: { name: string; kind: string; text: string }) => string;
};

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('the Reading view fetches none of a deck’s web references until the reader allows them', async ({ page }) => {
	const hits: string[] = [];
	const server = http.createServer((req, res) => {
		hits.push((req.url || '').slice(1).split('?')[0]);
		res.writeHead(200, { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' });
		res.end(PNG);
	});
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
	const { port } = server.address() as { port: number };
	const origin = `http://127.0.0.1:${port}`;
	const payloads = webRefBeacons(origin);
	// One slide per spelling, plus a plain web image that every surface fetches once allowed.
	const deck = [
		`# A photo from the web\n\n![team photo](${origin}/control-image.png)`,
		...payloads.map((p) => `## ${p.name}\n\n${asHtml(p)}\n`),
	].join('\n\n---\n\n');

	const openArticle = async () => {
		await page.getByRole('button', { name: CHROME.postureStops[0] }).click();
		await page.getByRole('button', { name: CHROME.readArticle }).click();
		await expect(page.locator('article.st-read-article')).toBeVisible({ timeout: 60_000 });
	};

	try {
		await gotoStudio(page);
		await setEditorContent(page, deck);
		await expect(livePreview(page).locator('section').first()).toBeVisible({ timeout: 60_000 });
		const notice = page.locator('[data-slot="web-images"]');
		await expect(notice).toHaveAttribute('data-state', 'blocked', { timeout: 30_000 });
		hits.length = 0;

		// 1. BLOCKED. An absence: no signal marks a request that must not happen, so the article
		// gets a fixed window to make one (SANCTIONED_E2E_SLEEPS, tools/check-ownership.js).
		await openArticle();
		await page.waitForTimeout(3_000);
		const blocked = [...new Set(hits)].sort();
		expect(blocked, `the Reading view fetched with nothing allowed: ${blocked.join(', ')}`).toEqual([]);

		// 2. CONTROL. A fresh Studio: the article stays open across a posture change, and the
		// notice that offers "Load" lives in the editor's view.
		await gotoStudio(page);
		await setEditorContent(page, deck);
		await expect(notice).toHaveAttribute('data-state', 'blocked', { timeout: 30_000 });
		await notice.getByRole('button', { name: /^Load \d+ images? from/ }).click();
		await expect(notice).toHaveAttribute('data-state', 'loaded');
		await openArticle();
		await expect.poll(() => hits.includes('control-image.png'), { message: 'the control fetched nothing, so the blocked arm proves nothing', timeout: 30_000 }).toBe(true);
		// The rest of the article's fetches, for the report below: once the page goes quiet.
		await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
		const loaded = [...new Set(hits)].sort();
		const reached = payloads.map((p) => p.name).filter((n) => loaded.includes(n));
		const absent = payloads.map((p) => p.name).filter((n) => !loaded.includes(n));
		test.info().annotations.push({ type: 'reached the Reading view', description: `${reached.length}: ${reached.join(', ')}` });
		test.info().annotations.push({ type: 'never reached it (escaped or sanitized upstream)', description: `${absent.length}: ${absent.join(', ')}` });
		console.log(`reached (${reached.length}): ${reached.join(', ')}\nnever reached (${absent.length}): ${absent.join(', ')}`);
	} finally {
		await new Promise<void>((r) => server.close(() => r()));
	}
});
