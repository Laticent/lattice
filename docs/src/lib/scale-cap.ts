// ONE TYPE SIZE PER DECK, IN A HOST THAT SHOWS ONE SLIDE PER DOCUMENT.
//
// The engine keeps a projection-scaled deck at one size: STEP finds each slide's own
// highest fitting rung and LEVEL puts every slide that asked for the same scale on the
// lowest of them (lib/core/scale-fit.js rule 7). LEVEL can only level the sections it can
// see, and the Studio's editor preview and Present render ONE slide per document
// (single-slide-render.ts narrows the deck to the shown section). Measured on the real
// Studio before this module: a `venue: conference` deck showed slide 1 at 1.3x, slide 2 at
// 1x and slide 3 at 1.3x, header included — the pulse the rule exists to stop.
//
// So the host measures the whole deck ONCE, in one hidden frame, and tells every
// single-slide frame the shared rung: `data-lattice-scale-cap="1.3>1.15"` on the frame's
// document element, which LEVEL never lands above. Then it asks the frame's runtime to
// re-sweep (`latticeSweep.sweep()`), so the slide on screen settles at once.
//
// COST, and who pays it. Only a deck that asks for a scale (`venue:` other than laptop, or
// a `scale-*` / `venue-*` class anywhere) is measured; every other deck never creates the
// frame. The measure is one whole-deck render plus one full sweep — 225–376 ms of STEP for
// the 70-slide agentic-practices talk on a dev container — debounced behind edits, and a
// frame keeps the size it shows until the new measurement lands, so typing never flickers.
// One hidden frame for the page's life, re-pointed per deck rather than recreated (WebKit
// does not give a torn-down preview document back — preview-pool.tsx has the numbers).
//
// Design record: engineering/decisions/2026-09-25-font-scale-fit.md, 2026-09-26 amendment.

export const SCALE_CAP_ATTR = 'data-lattice-scale-cap';

/** Does this deck ask for a projection scale anywhere? Cheap, and deliberately generous:
 *  a false positive costs one measurement, a false negative leaves the pulse. */
const ASKS = /\bscale-(?:l|xl|2xl)\b|\bvenue-(?:huddle|conference|hall)\b|^[ \t]*venue:[ \t]*["']?(?:huddle|conference|hall)\b/im;
export function deckAsksForScale(markdown: string): boolean {
	return ASKS.test(markdown);
}

/** Read the shared rung per ask off a whole-deck document LEVEL has just run on. */
export function readScaleCap(doc: Document): string {
	const byAsk = new Map<number, number>();
	for (const s of doc.querySelectorAll('section[data-lattice-slide]')) {
		const step = s.getAttribute('data-lattice-scale-step');
		if (!step) continue;
		const [ask, rung] = step.split('>').map(parseFloat);
		if (!(ask > 1) || !(rung >= 1)) continue;
		byAsk.set(ask, Math.min(byAsk.get(ask) ?? ask, rung));
	}
	return [...byAsk].map(([ask, rung]) => `${ask}>${rung}`).join(' ');
}

type CapHost = HTMLElement & { __latticeScaleCapKey?: string };
/** Resolves to the cap string ('' = no cap), or null when the measurement could not run. */
export type MeasureScaleCap = () => Promise<string | null>;

// Bounded: a handful of decks per session is the realistic ceiling, and an entry is a key
// plus a few bytes. The key embeds the deck source, so the bound is what keeps memory flat.
const CAP_LIMIT = 8;
const capByKey = new Map<string, string>();
const hosts = new Set<CapHost>();
// One debounce PER DECK, so a host showing one deck can never cancel another's measurement.
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 700;

function remember(key: string, cap: string): void {
	capByKey.delete(key);
	capByKey.set(key, cap);
	while (capByKey.size > CAP_LIMIT) capByKey.delete(capByKey.keys().next().value as string);
}

/** Write the host frame's cap and re-sweep, when it changed. A cap not yet measured leaves
 *  the frame as it is, so an edit never flashes the slide to another size. */
export function applyScaleCap(host: HTMLElement): void {
	const key = (host as CapHost).__latticeScaleCapKey;
	const fr = host.querySelector<HTMLIFrameElement>('iframe.live');
	let doc: Document | null | undefined;
	try {
		doc = fr?.contentDocument;
	} catch {
		return;
	}
	const root = doc?.documentElement;
	if (!root) return;
	const want = key ? capByKey.get(key) : '';
	if (want === undefined) return;
	if ((root.getAttribute(SCALE_CAP_ATTR) || '') === want) return;
	if (want) root.setAttribute(SCALE_CAP_ATTR, want);
	else root.removeAttribute(SCALE_CAP_ATTR);
	try {
		(fr?.contentWindow as (Window & { latticeSweep?: { sweep: () => unknown } }) | null)?.latticeSweep?.sweep();
	} catch {
		// A frame torn down mid-apply; its successor applies on load.
	}
}

/**
 * Register what deck a single-slide host shows. `key` is undefined for a deck that asks for
 * no scale (its frame then drops any cap it carried). Otherwise the cap is applied now if
 * known, or measured — debounced, latest deck wins — and applied to every host showing it.
 */
export function trackScaleCap(host: HTMLElement, key: string | undefined, measure: MeasureScaleCap): void {
	(host as CapHost).__latticeScaleCapKey = key;
	if (!key) {
		hosts.delete(host as CapHost);
		applyScaleCap(host);
		return;
	}
	hosts.add(host as CapHost);
	if (capByKey.has(key)) {
		applyScaleCap(host);
		return;
	}
	const pending = timers.get(key);
	if (pending) clearTimeout(pending);
	timers.set(
		key,
		setTimeout(async () => {
			timers.delete(key);
			let cap: string | null = null;
			try {
				cap = await measure();
			} catch {
				cap = null;
			}
			if (cap == null) return;
			remember(key, cap);
			for (const h of [...hosts]) {
				if (!h.isConnected) {
					hosts.delete(h);
					continue;
				}
				if (h.__latticeScaleCapKey === key) applyScaleCap(h);
			}
		}, DEBOUNCE_MS),
	);
}

/** The cap already measured for `key`, for a caller that writes it into a new document. */
export function knownScaleCap(key: string | undefined): string | undefined {
	return key ? capByKey.get(key) : undefined;
}

/** A disposed renderer releases its hosts, so this module never roots a detached preview. */
export function untrackScaleCap(host: HTMLElement): void {
	hosts.delete(host as CapHost);
}

/** Test seam: forget every measurement and registration. */
export function __resetScaleCapForTest(): void {
	capByKey.clear();
	hosts.clear();
	for (const t of timers.values()) clearTimeout(t);
	timers.clear();
}
