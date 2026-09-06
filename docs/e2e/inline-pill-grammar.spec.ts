import { expect, test } from './studio-fixture';

// ── The inline `{…}` / `[x]` grammar, on the REAL Playground ────────────────────────
//
// The grammar has two implementations by design (HARD RULE #1's shared kernel with two
// adapters): `lib/integrations/markdown-it/plugins.js` builds a string, and
// `lib/runtime/index.js` builds elements INSIDE the preview frame. Every other test of
// it runs in jsdom, which is not a browser: it has no cascade, and its MutationObserver
// is not the one the runtime actually schedules passes on. Per HARD RULE #23 that left
// the claim "the grammar works in the Playground" resting on a stand-in.
//
// So this spec drives the surface itself. Four things it can see that jsdom cannot:
//
//  1. THE ESCAPE IS STABLE ACROSS REPEATED PASSES. `\{Alpha}` strips its backslash on
//     pass 1; without the `data-lat-escaped` stamp, pass 2 sees a bare `{Alpha}` and
//     promotes it — the deck says one thing on load and another a second later. The
//     runtime re-runs on its own MutationObserver, so the way to exercise this is to
//     make the frame mutate, which is what the loop below does.
//  2. A HOSTILE LABEL CANNOT BECOME MARKUP. `{<img src=x onerror=…>}` is a VALID label
//     — the grammar rejects commas and untrimmed edges, not angle brackets — so the
//     only thing between it and script in the docs origin is `pillElement` building the
//     span with `textContent`. That is the #1246 post-sanitize class (HARD RULE #22),
//     one step downstream of any sanitizer, and this is the surface where it would pay
//     off: the visitor's OpenRouter key (HARD RULE #24).
//  3. THE LITERALS SURVIVE. This grammar reads EVERY single-backtick span in every
//     deck, so the failure that matters is not a pill that fails to render — it is
//     `getUserId()` quietly becoming one.
//  4. THE BOXES PAINT. A pill that resolves to a zero-height inline box is invisible to
//     every assertion about attributes.

const SOURCE_KEY = 'lattice-docs-pg-source';

// Deliberately NO `_class`: the grammar's claim is that it is universal, so the deck
// that tests it should not be sitting inside the one component it was built for.
const DECK = `---
marp: true
---

# Grammar

- Live pills: \`{Alpha}\` \`{Beta}:c2:tag\` \`{Gamma}:circle:lg\`
- Live marks: \`[x]\` \`[-]\` \`[ ]\` \`[/]\`
- Escaped: \`\\{Alpha}\` and \`\\[x]\`
- Literal: \`getUserId()\` and \`[data-mark]\` and \`{ ok, scene }\`
- Hostile: \`{<img src=x onerror=top.__pwned=1>}\`
`;

test('the inline pill + mark grammar renders, escapes, and stays inert in the Playground', async ({ page }) => {
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

	// ANTI-VACUITY: the grammar must have RUN. Four `{…}` spans (three declared plus the
	// hostile one) and four `[…]` marks; without this, every "stayed literal" assertion
	// below is trivially true because nothing was transformed at all.
	await expect(preview.locator('.lat-pill')).toHaveCount(4, { timeout: 30_000 });
	await expect(preview.locator('.lat-state')).toHaveCount(4);

	// The axes resolve, not just the shape.
	await expect(preview.locator('.lat-pill[data-shape="tag"][data-c="c2"]')).toHaveText('Beta');
	await expect(preview.locator('.lat-pill[data-shape="circle"][data-size="lg"]')).toHaveText('Gamma');
	// A mark carries its name on `aria-label`, never as text.
	await expect(preview.locator('.lat-state[aria-label="done"]')).toHaveCount(1);

	// The literals stayed `<code>`. `[data-mark]` and `{ ok, scene }` are the two shapes
	// closest to the grammar's own — a bracket form it must refuse, and a brace form with
	// the comma and the untrimmed edges `isLabel` rejects on.
	const codeText = async () => preview.locator('code').allTextContents();
	expect(await codeText()).toEqual(
		expect.arrayContaining(['getUserId()', '[data-mark]', '{ ok, scene }', '{Alpha}', '[x]']),
	);

	// The hostile label is TEXT, and nothing ran — in the frame or the top docs origin.
	const hostile = preview.locator('.lat-pill').filter({ hasText: 'img src=x' });
	await expect(hostile).toHaveCount(1);
	expect(await hostile.evaluate((el) => el.innerHTML)).not.toMatch(/<img/i);
	expect(await hostile.evaluate((el) => el.textContent)).toContain('<img src=x');
	expect(
		await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned),
		'a pill label executed script in the top docs origin',
	).toBeUndefined();

	// EVERY box paints. A shape whose geometry collapses is invisible to the attribute
	// assertions above and would ship as a pill nobody can see.
	const boxes = await preview.locator('.lat-pill, .lat-state').evaluateAll((els) =>
		els.map((el) => {
			const r = el.getBoundingClientRect();
			return { w: r.width, h: r.height };
		}),
	);
	expect(boxes).toHaveLength(8);
	expect(boxes.filter((b) => b.w < 1 || b.h < 1), 'a pill or mark painted at zero size').toEqual([]);

	// ── The idempotency arm ────────────────────────────────────────────────────────
	// PRECONDITION, asserted rather than assumed: `lib/runtime` is actually LIVE in
	// this frame. The Playground renders through the engine bundle and then injects
	// `lattice-runtime.js` into the srcdoc (deck-preview.js:403) — so the runtime here
	// runs as a MIRROR over already-transformed output, which is the composition this
	// arm is about. It is served from a content-hashed path, and a stale or missing
	// staged copy 404s silently; without this check the loop below would then be
	// re-running nothing and passing forever. `latticeSweep` is the runtime's own
	// global (lib/runtime/index.js).
	expect(
		await preview.locator('.lattice').first().evaluate(
			(el) => typeof (el.ownerDocument.defaultView as unknown as { latticeSweep?: unknown }).latticeSweep,
		),
		'lib/runtime is not live in the preview frame — the idempotency arm would test nothing',
	).toBe('object');

	// Force the runtime to run additional passes over a document it has already
	// transformed, WITH A WITNESS. The frame's own MutationObserver is the scheduler, so
	// an append is the real trigger — and appending a LIVE directive rather than an inert
	// node means the pass announces itself: the probe becomes a pill or the poll times
	// out. That is what lets this arm assert "nothing changed" without a fixed sleep,
	// which is an absence with no signal behind it (#1526/#1575). Each round costs two
	// passes — one for the append, one for the removal.
	for (let i = 0; i < 3; i += 1) {
		await preview.locator('.lattice section').first().evaluate((section) => {
			const probe = section.ownerDocument.createElement('code');
			probe.textContent = '{Probe}';
			probe.id = 'pass-witness';
			section.appendChild(probe);
		});
		// The witness: the runtime ran, and it ran the grammar.
		await expect(preview.locator('#pass-witness')).toHaveCount(0);
		await expect(preview.locator('.lat-pill').filter({ hasText: 'Probe' })).toHaveCount(1);
		await preview.locator('.lat-pill').filter({ hasText: 'Probe' }).evaluate((el) => el.remove());
		await expect(preview.locator('.lat-pill').filter({ hasText: 'Probe' })).toHaveCount(0);
	}

	// Same counts, and the escaped spans are still the literal text they were told to
	// be. Without the `data-lat-escaped` stamp the `{Alpha}` here is a pill by now and
	// this reads 5.
	await expect(preview.locator('.lat-pill')).toHaveCount(4);
	await expect(preview.locator('.lat-state')).toHaveCount(4);
	expect(await codeText()).toEqual(
		expect.arrayContaining(['getUserId()', '[data-mark]', '{ ok, scene }', '{Alpha}', '[x]']),
	);
});
