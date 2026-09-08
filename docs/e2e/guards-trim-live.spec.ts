import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// THE LIVE-PREVIEW PATH, ON THE REAL SURFACE.
//
// `guards: strict` ships on TWO render paths — the export (`lattice-emulator.js`) and
// the runtime that drives this preview (`lib/runtime/index.js`). Three independent
// reviews and a 196-deck render sweep all exercised the export. The runtime path was
// only ever driven by injecting `dist/lattice-runtime.js` into an already-exported
// page in headless Chromium, which is a proxy for this surface and not this surface
// (HARD RULE #23). This spec closes that: the real Studio, the real editor, the real
// preview frame.
//
// What it pins is the pair that matters, not the pixel:
//   1. a strict deck whose body overflows gets CLAMPED in the live preview, and
//   2. the same deck at `guards: loose` does not — so a green run cannot come from
//      the register being ignored on both sides, which is the failure mode a
//      single-arm test would certify.
//
// The overflow ring is deliberately NOT asserted. Whether a trimmed slide still rings
// is the export's business (it re-measures and reports separately), and pinning it
// here would couple this spec to a policy that lives elsewhere.

const BODY = Array.from(
	{ length: 14 },
	(_, i) => `Sentence ${i + 1} runs on long enough to wrap the column and push this box past its limit.`,
).join(' ');

const deck = (guards: 'strict' | 'loose') =>
	`---\nmarp: true\ntheme: indaco\nguards: ${guards}\n---\n\n<!-- _class: content -->\n\n## Live preview trims\n\n${BODY}\n`;

/** The clamp `applyTrim` writes, read from the live frame rather than from the DOM we built. */
async function clampedCount(page: Parameters<typeof gotoStudio>[0]): Promise<number> {
	return await page
		.frameLocator('[aria-label="Live deck preview"] iframe.live')
		.locator('[data-lattice-trimmed]')
		.count();
}

test('@smoke guards: strict clamps in the LIVE preview, and loose does not', async ({ page }) => {
	await gotoStudio(page);

	// STRICT — the runtime measures, plans and applies inside the preview frame.
	await setEditorContent(page, deck('strict'));
	// The sweep is debounced and observer-driven, so poll on the consequence.
	await expect
		.poll(() => clampedCount(page), {
			message: 'guards: strict must clamp the overflowing body in the live preview',
			timeout: 15_000,
		})
		.toBeGreaterThan(0);

	// And the clamp is the real one: a literal line count, the only form every engine
	// supports (the design note's §1 table).
	const clamp = await page
		.frameLocator('[aria-label="Live deck preview"] iframe.live')
		.locator('[data-lattice-trimmed]')
		.first()
		.evaluate((el) => getComputedStyle(el).webkitLineClamp);
	expect(clamp, 'the clamp must be a literal integer, not `none`').toMatch(/^\d+$/);

	// LOOSE — the SAME deck, one word changed. Without this arm, a register that is
	// ignored everywhere would still satisfy the assertion above on some other slide.
	await setEditorContent(page, deck('loose'));
	await expect
		.poll(() => clampedCount(page), {
			message: 'guards: loose must leave the deck untrimmed — it is the baseline',
			timeout: 15_000,
		})
		.toBe(0);
});
