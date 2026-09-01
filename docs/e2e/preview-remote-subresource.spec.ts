import { expect, test } from './studio-fixture';

// ── #1753: a deck cannot make the preview frame fetch a remote URL ─────────────────────
//
// A deck could make the docs-site preview frame fetch an arbitrary external URL on OPEN,
// with no interaction — a tracking beacon leaking the viewer's IP and User-Agent and
// confirming they opened the deck. Not a sanitizer hole: `sanitizeSlideHtml` keeps inline
// `style` deliberately (the engine emits `url()` for backgrounds and logo masks), and HARD
// RULE #22's threat model is script execution, not resource loads. The containment is a
// narrow CSP meta on every preview-frame builder — see
// engineering/decisions/2026-09-01-preview-remote-subresource-posture.md.
//
// WHY THIS SPEC EXISTS ON TOP OF `test/unit/playground/deck-preview.test.js`. That suite
// asserts the meta is EMITTED, that it precedes every subresource, that each directive is
// present, and that all three builders call `previewCspMeta`. None of that is a measurement
// of whether the browser then refuses the fetch — it is a claim about a string. The record
// this closes shipped with its Playground round trip marked UNVERIFIED for exactly that
// reason (HARD RULE #23: a synthetic harness is not the surface).
//
// THREE VECTORS, because the fix is per-DIRECTIVE and a single `![]()` arm would say nothing
// about the other two: a markdown image, a raw `<img>` tag (which survives sanitization —
// only script/iframe/object/embed are forbidden), and `url()` inside an inline style
// attribute (which is the one no markup filter can see, and the reason `img-src` rather than
// a scrub). All three were measured firing before the CSP existed.
//
// THE PAYLOAD MUST STILL BE IN THE DOM. That is what separates "the fetch was refused" from
// "the markup was rewritten" — and it is the arm that would catch a future sanitizer change
// quietly removing the attribute and making this spec pass for the wrong reason.
//
// ROUTED, NEVER RESOLVED. `.invalid` fails at DNS by definition, so a live vector would be
// indistinguishable from a blocked one without interception. The route fulfills, so a beacon
// that fires is recorded as a hit rather than as a network error.
//
// NO `waitForTimeout` HERE, despite this being an absence assertion. A blocked image still
// reaches `complete` (the CSP refusal fires `error`), so the settle has a real signal to poll
// — which is strictly better than a sleep, because it waits until the browser is DONE with
// the request rather than for a duration someone guessed.

const ATTACKER = 'attacker.invalid';
const SOURCE_KEY = 'lattice-docs-pg-source';

const DECK = `---
theme: indaco
---

# Beacon

![pic](https://${ATTACKER}/plain.png)

<img src="https://${ATTACKER}/raw.png">

<span style="background-image:url(https://${ATTACKER}/bg.png)">shaded</span>
`;

test('a deck cannot beacon out of the Playground preview frame', async ({ page }) => {
	const hits: string[] = [];
	await page.context().route(`**://${ATTACKER}/**`, (route) => {
		hits.push(route.request().url());
		return route.fulfill({ status: 200, contentType: 'image/gif', body: '' });
	});
	await page.addInitScript(
		([key, src]) => {
			try {
				localStorage.setItem(key as string, src as string);
			} catch {
				/* a blocked store just means the draft does not seed */
			}
		},
		[SOURCE_KEY, DECK],
	);
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });

	const preview = page.frameLocator('#preview');
	await expect(preview.locator('.lattice').first()).toBeVisible({ timeout: 45_000 });

	// The CSP the frame actually received — read off the live document, not off the builder.
	const csp = preview.locator('meta[http-equiv="Content-Security-Policy"]').first();
	await expect(csp).toHaveAttribute('content', /img-src 'self' data: blob:/);
	await expect(csp).toHaveAttribute('content', /media-src|connect-src 'self'/);

	// Settle: both <img> vectors have been decided one way or the other. A refused load
	// still completes, so this is the point after which a beacon cannot still be in flight.
	await expect
		.poll(async () => preview.locator(`img[src*="${ATTACKER}"]`).evaluateAll((els) => els.length > 0 && els.every((e) => (e as HTMLImageElement).complete)), {
			timeout: 30_000,
		})
		.toBe(true);

	// THE PAYLOAD SURVIVED — the fetch was refused, the markup was not rewritten.
	expect(await preview.locator(`img[src*="${ATTACKER}"]`).count()).toBe(2);
	expect(await preview.locator(`[style*="${ATTACKER}"]`).count()).toBe(1);

	// THE CLAIM.
	expect(hits, `the preview frame fetched ${hits.length} remote subresource(s): ${hits.join(', ')}`).toEqual([]);
});
