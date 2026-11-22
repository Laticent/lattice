// Is this page running as LITE? One read of `html[data-device-tier]`, for the code that sizes itself to the device
// (engineering/decisions/2026-11-12-device-capability-tiers.md §4, slice 4).
//
// The attribute, not lib/device-tier.ts's state: the Studio's inline boot script sets it before paint from the tier the
// previous visit saved (or a `?tier=` pin), long before the lazy tier module loads, and the module sets it again once it
// decides. Reading it at the moment of use means a pool started after the decision gets the decided size. A pool already
// running keeps its size until it next starts (the shared pools end 10 s after their last job).
//
// Plain JS, not TS: the export pools are imported by Node-run unit tests, which load `.js` siblings directly.
// LITE only: UNSUPPORTED shows the decline screen, and "continue anyway" runs the session as LITE (§7.2).

/**
 * @param {{ documentElement?: { getAttribute(name: string): string | null } | null } | undefined} [doc]
 * @returns {boolean}
 */
export function isLiteDevice(doc = globalThis.document) {
	try {
		return doc?.documentElement?.getAttribute('data-device-tier') === 'lite';
	} catch {
		return false;
	}
}

/** §4's LITE values, in one place so the doc, the code and the tests name the same numbers. */
export const LITE = Object.freeze({
	/** Export picture encoders and narration packers: one worker each. */
	workers: 1,
	/** PDF and PowerPoint photo lanes: one slide bitmap waiting on the worker at a time. */
	exportInFlight: 1,
	/** Preview iframe pool: the floor and the ceiling of live slide frames. */
	baseSlots: 6,
	maxSlots: 12,
});

/** How many slide bitmaps an export's photo lane may queue on its worker: 2 overlaps draw and encode; LITE holds one. */
export function exportInFlight(lite = isLiteDevice()) {
	return lite ? LITE.exportInFlight : 2;
}
