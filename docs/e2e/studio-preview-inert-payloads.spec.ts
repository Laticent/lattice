import { expect, gotoStudio, livePreview, setEditorContent, test } from './studio-fixture';

// ── Attribute text and sanitized markup stay inert in the REAL Studio preview ────────────
//
// Two defects, one surface (HARD RULE #22, #23):
//   - followups.d 2853-p1: the inline-run transformer's string path ended a tag at the first `>`,
//     so a `>` inside a quoted attribute let it write its `<span class="lat-run">` into the value
//     and turned the rest of the value into markup.
//   - #1993: `patchSlideBody` parsed DOMPurify's output, serialized it and parsed it again into the
//     same-origin frame, which is the round trip mutation XSS lives in.
//
// The deck puts both payloads on a `checklist` slide (a component inline-run serves), then edits
// the shown slide's heading so the Studio takes its PATCH write path, the one #1993 changed. Asserted
// before and after the patch: the attribute still holds its text, no `<img>` exists, and nothing
// ran in either frame. Runs on Chromium, WebKit and Gecko.
//
// A GUARD, NOT A REPRODUCTION. This spec also passes on the code before both fixes: no end-to-end
// exploit of either defect was found on this surface (the payload reaches the frame already escaped,
// and the current DOMPurify neutralizes this mXSS shape). The tests that FAIL on the old code are the
// unit arms (test/unit/core/inline-run.test.js, single-slide-render.single-parse.test.ts). This one
// pins the real Studio's behavior on three engines so a later change cannot regress it unseen.

const DECK = `---
marp: true
---

<!-- _class: checklist -->

# Payloads stay text

- <span title="a><img src=x onerror=top.__pwned=1>">quoted</span> attribute **kept** as text
- second <b>item</b> here
- <form><math><mtext></form><form><mglyph><style></math><img src onerror=top.__pwned=2> tail <b>x</b>
`;

const TITLE = 'a><img src=x onerror=top.__pwned=1>';

test('@crosswidth @webkit-tablet @gecko a quoted attribute and an mXSS shape stay inert through the patch path', async ({ page }, testInfo) => {
	test.skip(!['desktop', 'webkit-tablet', 'gecko'].includes(testInfo.project.name), 'one desktop-width run per engine');
	test.setTimeout(180_000);
	await gotoStudio(page);
	await page.waitForFunction(() => !!(window as unknown as { __latticeRenderMetrics?: unknown }).__latticeRenderMetrics);
	await page.evaluate(() => {
		const w = window as unknown as { __paths: string[]; __latticeRenderMetrics: { on: (cb: (s: Record<string, unknown>) => void) => void } };
		w.__paths = [];
		w.__latticeRenderMetrics.on((s) => w.__paths.push(String(s.writePath)));
	});
	await setEditorContent(page, DECK);

	const frame = livePreview(page);
	const span = frame.locator('.lattice section li span[title]');
	await expect(span).toHaveCount(1, { timeout: 40_000 });

	const check = async (when: string) => {
		// ANTI-VACUITY: inline-run really ran on this item (it wrapped the run), or "nothing broke" is trivial.
		await expect(frame.locator('.lattice section li .lat-run').first(), `${when}: inline-run wrapped the item`).toBeAttached();
		expect(await span.getAttribute('title'), `${when}: the attribute keeps its text`).toBe(TITLE);
		expect(await frame.locator('.lattice img').count(), `${when}: no <img> element in the slide`).toBe(0);
		const pwned = await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned);
		expect(pwned, `${when}: nothing ran in the top docs origin`).toBeUndefined();
	};
	await check('first write');

	// Edit the shown slide: the Studio patches the resident frame instead of writing a new one.
	await page.evaluate(() => { (window as unknown as { __paths: string[] }).__paths = []; });
	await setEditorContent(page, DECK.replace('# Payloads stay text', '# Payloads stay text, edited'));
	await expect.poll(() => page.evaluate(() => (window as unknown as { __paths: string[] }).__paths), { timeout: 30_000 }).toContain('patch');
	await expect(frame.locator('.lattice section h1')).toHaveText('Payloads stay text, edited');
	await check('after the patch');

	await page.screenshot({ path: testInfo.outputPath(`studio-inert-${testInfo.project.name}.png`) });
});
