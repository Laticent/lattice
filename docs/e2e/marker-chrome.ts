/**
 * "Is an authoring alarm PAINTED here?" — asked once, for every spec that asks it.
 *
 * WHY THIS EXISTS, and it is not DRY for its own sake. Three specs independently
 * asked the same question by counting ELEMENTS:
 *
 *   document.querySelectorAll('section.overflow, .overflow-tab, .illegible-tab').length === 0
 *
 * That was a correct reading of the old DOM, where a watcher CREATED a tab when a
 * slide rang and removed it when it stopped. It stopped being correct the moment
 * the marker's chrome became part of the rendered slide
 * (`lib/core/fit-berth.js`): every section now carries all three tabs, always,
 * EMPTY, and a class on the section is what reveals one. Counting elements now
 * answers "does this document have berths" — which is `true` for every slide ever
 * rendered — instead of "does a reader see an alarm".
 *
 * One spec caught the change; the other two would have gone on asserting a
 * property they no longer measured, in the direction that passes. So the
 * question moved here, phrased as the thing a reader can actually check.
 *
 * WHAT COUNTS AS PAINTED, and why it is not just "has text": these run in a real
 * browser, so they can ask the browser. A tab is only a signal if it BOTH says
 * something and is rendered — `display: none` under
 * `section:not(.clip-marked) > .overflow-tab`, or suppressed outright at
 * `[data-lattice-overflow-marker="off"]`, is not something a reader sees no
 * matter what its text says. Both halves are required, because each alone has a
 * hole: text-only would flag a tab the level suppressed, and painted-only would
 * flag an empty berth if a stylesheet ever revealed one.
 *
 * The section CLASSES are counted too, and separately, because they are the
 * other half of the alarm — `.overflow` draws the ring and `.fit-culprit` draws
 * the culprit outline, neither of which is a tab. A caller that only counted
 * tabs would miss a ringed slide whose tab was empty.
 *
 * SELF-CONTAINED, with no closures and no module references, because Playwright
 * serializes it into the page: `frame.locator('body').evaluate(paintedMarkers)`.
 * That is also why the two-frame settle is INSIDE it rather than being a separate
 * `evaluate` the caller chains — a wrapper that awaited a settle and then called
 * this one would be a closure over a module-scope identifier, which does not
 * survive serialization. Every caller therefore reads post-paint by construction,
 * which is what the one caller that already settled by hand was doing anyway.
 */

export type PaintedMarkers = {
	/** Sections carrying a marker class — the ring, the type-floor alarm, the treatment flag. */
	rings: number;
	/** Marker tabs that both say something AND are rendered. */
	tabs: number;
	/** Cells outlined as the Fix-Me culprit. */
	culprits: number;
	/** Everything above — 0 means a reader sees no authoring alarm at all. */
	total: number;
	/** The resolved marker level of the first slide, so a caller can prove the watcher booted. */
	level: string | null;
	/** Slides present, so "zero alarms" over an empty document is distinguishable from a pass. */
	slides: number;
	/** The first slide's `data-class`, so a caller sweeping many frames can name the one that rang. */
	name: string;
};

/** Runs IN THE PAGE. Pass it to `.evaluate()` — do not call it in the test process. */
export async function paintedMarkers(): Promise<PaintedMarkers> {
	// Two frames, so a sweep scheduled by the render that just landed has had its
	// chance to speak before this reads the DOM.
	await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
	const slides = document.querySelectorAll('section[data-lattice-slide]');
	const rings = document.querySelectorAll(
		'section.overflow, section.illegible, section.clip-marked, section.fit-marked',
	).length;
	const culprits = document.querySelectorAll('.fit-culprit').length;
	const tabs = [...document.querySelectorAll('.overflow-tab, .illegible-tab, .fixme-tab')].filter(
		(el) =>
			(el.textContent || '').trim() !== '' &&
			getComputedStyle(el).display !== 'none' &&
			el.getClientRects().length > 0,
	).length;
	return {
		rings,
		tabs,
		culprits,
		total: rings + tabs + culprits,
		level: slides[0]?.getAttribute('data-lattice-overflow-marker') ?? null,
		slides: slides.length,
		name: slides[0]?.getAttribute('data-class') ?? '?',
	};
}

/**
 * Wait until every live preview frame's authoring alarms have stopped moving.
 *
 * THE REPLACEMENT for the fixed `waitForTimeout(4500)` three specs used to carry,
 * each with the same comment: "the watcher re-measures once webfonts land, so a
 * too-early read can miss a ring" (#1526).
 *
 * That comment names a real hazard and the wrong fix. The hazard is a SEQUENCE —
 * webfonts land, the watcher re-measures on a debounce, and only then is the
 * marker set final — so the honest condition has to cover both steps, and this
 * waits for each in turn rather than guessing an interval that covers both:
 *
 *   1. every frame's own `document.fonts.ready`, which is the actual font signal
 *      (the slide faces are vendored same-origin, so it resolves in-frame);
 *   2. then the aggregate marker signature read twice with a frame between, until
 *      two consecutive reads agree — the watcher's debounce having fired and
 *      changed nothing is what "settled" means here.
 *
 * `fonts.ready` ALONE would be the wrong condition and worse than the sleep it
 * replaces: it resolves BEFORE the re-measure it is supposed to be waiting for,
 * so it would read the marker set one debounce too early — reliably green, and
 * blind to exactly the late ring these specs exist to catch.
 *
 * BOUNDED, AND THE BOUND IS THE POINT. 40 tries x 120ms caps the waiting at 4.8s —
 * just over the 4500ms sleep this replaces — so the worst case is no worse than
 * what it replaces while the common case (two agreeing reads) settles in a few
 * hundred milliseconds. That matters here because the gallery grid can hold dozens
 * of live frames and each read costs a cross-frame round trip; a generous bound
 * would have made the pathological case SLOWER than the sleep, which is the trap
 * #1526 warns about.
 *
 * It returns rather than throwing on exhaustion, deliberately: the caller's own
 * assertion is what should fail, with its own message, rather than this helper
 * turning a real finding into an opaque timeout.
 */
export async function markersSettled(
	page: import('@playwright/test').Page,
	frameSelector = 'iframe.live',
	{ tries = 40, stepMs = 120 } = {},
): Promise<void> {
	const n = await page.locator(frameSelector).count();
	for (let i = 0; i < n; i += 1) {
		await page
			.frameLocator(`${frameSelector} >> nth=${i}`)
			.locator('body')
			.evaluate((b) => b.ownerDocument.fonts.ready)
			.catch(() => {}); // a frame that went away mid-sweep is not this helper's failure
	}
	const read = async () => {
		const out: string[] = [];
		const count = await page.locator(frameSelector).count();
		for (let i = 0; i < count; i += 1) {
			const m = await page
				.frameLocator(`${frameSelector} >> nth=${i}`)
				.locator('body')
				.evaluate(paintedMarkers)
				.catch(() => null);
			out.push(m ? `${m.rings}/${m.tabs}/${m.culprits}/${m.level}` : '-');
		}
		return out.join('|');
	};
	let prev = await read();
	for (let i = 0; i < tries; i += 1) {
		await page.waitForTimeout(stepMs);
		const next = await read();
		if (next === prev) return;
		prev = next;
	}
}
