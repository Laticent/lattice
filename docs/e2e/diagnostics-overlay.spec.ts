import type { Locator } from '@playwright/test';
import { expect, readStorage, test } from './studio-fixture';

// Regression guard for the SHARED diagnostic-overlay chassis
// (docs/src/components/diagnostics/diagnostic-overlay.tsx `DiagnosticPanel`). The
// drag → persist → restore → clamp path now backs ALL FOUR overlays (Perf / Viz /
// Viewport / Read-aloud), so one broken edit would break every one at once — exactly the
// coupling the #1134 consolidation introduced, and the durable guard its trio asked for.
// We exercise it on the Viewport-debug overlay because it's the cheapest to summon: the
// `?vvdebug` param mounts it with no other setup, and it shares the identical chassis.
//
// SCOPE (HARD RULE #23): this validates the DESKTOP pointer-drag path in headless
// Chromium — a real running surface, the shipped bundle. Real TOUCH-drag on a phone
// (pointer capture / touch-action / momentum) is NOT exercised here and stays UNVERIFIED
// from this sandbox; it needs a real device. (Re-running on the `mobile` project would buy
// nothing — that project has no `hasTouch`, so `page.mouse` there is still a pointer drag.)

const PANEL = '[data-testid="viewport-debug-overlay"]';
const GRIP = `${PANEL} .dp-grip`; // the drag-handle contract hook (not the cursor-grab utility)
const CLOSE = `${PANEL} .dp-close`;
const POS_KEY = 'lattice-viewport-debug-pos';
const PREF_KEY = 'lattice-viewport-debug';

/** Bounding box or a hard failure — narrows the type for the `.x`/`.width` reads below. */
async function boxOf(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
	const box = await locator.boundingBox();
	if (!box) throw new Error('element has no bounding box');
	return box;
}

test('diagnostics overlay: dragging the grip repositions the panel and persists across reload', async ({ page }) => {
	await page.goto('/studio/?vvdebug', { waitUntil: 'domcontentloaded' });
	const panel = page.locator(PANEL);
	await expect(panel).toBeVisible();

	const before = await boxOf(panel);

	// Drag the grip header down-and-right. The panel rests top-left, so this stays on-screen
	// (away from the clamp margins) — a genuine move, not a clamp artifact.
	const hb = await boxOf(page.locator(GRIP));
	await page.mouse.move(hb.x + 20, hb.y + hb.height / 2);
	await page.mouse.down();
	await page.mouse.move(hb.x + 260, hb.y + 160, { steps: 10 });
	await page.mouse.up();

	// The panel actually moved…
	const after = await boxOf(panel);
	expect(Math.abs(after.x - before.x)).toBeGreaterThan(80);
	expect(Math.abs(after.y - before.y)).toBeGreaterThan(80);

	// …and the drag persisted a finite position under THIS overlay's own posKey.
	const saved = await readStorage(page, POS_KEY);
	expect(saved).not.toBeNull();
	const pos = JSON.parse(saved as string) as { x: number; y: number };
	expect(Number.isFinite(pos.x) && Number.isFinite(pos.y)).toBe(true);

	// …and it restores to the dragged spot after a reload (the whole point of persisting).
	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect(panel).toBeVisible();
	const restored = await boxOf(panel);
	expect(Math.abs(restored.x - after.x)).toBeLessThan(8);
	expect(Math.abs(restored.y - after.y)).toBeLessThan(8);
});

test('diagnostics overlay: a drag past the edge clamps back on-screen (the mobile safety net)', async ({ page }) => {
	await page.goto('/studio/?vvdebug', { waitUntil: 'domcontentloaded' });
	const panel = page.locator(PANEL);
	await expect(panel).toBeVisible();

	// Drag hard toward the bottom-right corner, well past the viewport edge. The chassis
	// clamps left/top to [4, innerW - w - 4] / [4, innerH - h - 4] so a panel can never be
	// dragged (or restored) off-screen and become ungrabbable — the invariant that keeps it
	// usable on a small phone. Assert the panel stays fully within the viewport.
	const hb = await boxOf(page.locator(GRIP));
	await page.mouse.move(hb.x + 20, hb.y + hb.height / 2);
	await page.mouse.down();
	await page.mouse.move(hb.x + 5000, hb.y + 5000, { steps: 12 });
	await page.mouse.up();

	const box = await boxOf(panel);
	const vp = page.viewportSize();
	if (!vp) throw new Error('no viewport size');
	expect(box.x).toBeGreaterThanOrEqual(4 - 1);
	expect(box.y).toBeGreaterThanOrEqual(4 - 1);
	expect(box.x + box.width).toBeLessThanOrEqual(vp.width - 4 + 1);
	expect(box.y + box.height).toBeLessThanOrEqual(vp.height - 4 + 1);
});

test('diagnostics overlay: the × closes the panel and clears the shared pref', async ({ page }) => {
	await page.goto('/studio/?vvdebug', { waitUntil: 'domcontentloaded' });
	const panel = page.locator(PANEL);
	await expect(panel).toBeVisible();
	await expect(panel).toHaveCount(1); // the singleton claim — exactly one instance

	// The single shared close control (`.dp-close`) — a pointerdown here must NOT start a
	// drag (the handler early-returns on it); the click flips the pref off and unmounts.
	await page.locator(CLOSE).click();
	await expect(panel).toHaveCount(0);
	expect(await readStorage(page, PREF_KEY)).toBeNull();
	// The close was a click, not a drag: no position was persisted.
	expect(await readStorage(page, POS_KEY)).toBeNull();
});
