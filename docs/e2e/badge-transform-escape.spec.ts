import { expect, test } from './studio-fixture';

// ── The badge transforms decoded what the sanitizer had made inert (#1246) ──────────────
//
// `transformObligationMatrixBadges` and `transformVerdictGridBadges` run in `lib/runtime`,
// INSIDE the preview frame, after `sanitizeSlideHtml` has already run on the document. Both
// read their label out of `element.textContent` — which DECODES entities — and used to write
// it back with `innerHTML`, which re-parses it as markup.
//
// So markup the sanitizer deliberately left inert as escaped TEXT (`&lt;img src=x
// onerror=…&gt;`) came back live, one step downstream of the guard that had neutralized it.
// Demonstrated on this surface before the fix: `top.__pwned === 1` — script running in the
// origin HARD RULE #24 puts the visitor's OpenRouter key in.
//
// This is the post-sanitize injection class #1246 is about, and no sanitizer upstream can
// help: the decode happens after it. The fix is structural (`badgeSpan` builds the element
// with `createElement` + `textContent`, so there is no parse step at all), and this spec is
// what keeps it that way — a future author reaching for `innerHTML` here turns it red.

const SOURCE_KEY = 'lattice-docs-pg-source';

// The leading `<span></span>` matters: it stops the SERVER-side markdown-it plugin from
// claiming the cell, so the cell arrives at the frame untransformed and the RUNTIME path —
// the one under test — is the one that handles it. Without it the plugin transforms the row
// server-side and DOMPurify strips the handler, which is the control case below.
const DECK = `---
marp: true
---

<!-- _class: obligation-matrix -->

# Matrix

| Duty | Status |
|---|---|
| Runtime path | <span></span>[x] &lt;img src=x onerror=top.__pwned=1&gt; |
| Server path | [x] &lt;img src=y onerror=top.__pwned=1&gt; |
`;

test('a table-cell badge label cannot be re-parsed as markup (#1246)', async ({ page }) => {
	await page.addInitScript(
		([k, s]) => {
			try {
				localStorage.setItem(k as string, s as string);
			} catch {
				/* a blocked store just means the draft does not seed */
			}
		},
		[SOURCE_KEY, DECK],
	);
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });

	const preview = page.frameLocator('#preview');
	await expect(preview.locator('.lattice')).toBeVisible({ timeout: 40_000 });
	// ANTI-VACUITY: the transform must actually have RUN, or "no script executed" is trivially
	// true because nothing happened. `.state` is the span the transform creates.
	await expect(preview.locator('td .state').first()).toBeAttached({ timeout: 30_000 });

	// The payload survives as TEXT — neutralized, not censored, and not re-parsed.
	const cell = preview.locator('td').filter({ hasText: 'img src=x' }).first();
	await expect(cell).toBeAttached();
	expect(await cell.evaluate((el) => el.innerHTML)).not.toMatch(/<img/i);
	expect(await cell.evaluate((el) => el.textContent)).toContain('<img src=x');

	// And nothing ran, in either frame or the top docs origin.
	expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned), 'a badge label executed script in the top docs origin').toBeUndefined();
});
