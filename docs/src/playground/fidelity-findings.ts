// Preview-fidelity findings — the live store the PreviewFidelityOverlay paints, fed by
// the render pipeline (single-slide-render.ts) after each slide render. Mirrors
// viz-findings.ts: a listener Set, record/latest/on, and a hasListeners() gate so the
// render path reports ONLY while the overlay is subscribed (off = free).
//
// TWO TIERS, deliberately. What the render path publishes is FREE — it is the decision the
// pipeline already made (which path, why, what position it supplied). The expensive half —
// actually rendering the slide both ways and diffing them — hangs off `compare()`, a closure
// the overlay calls when the author presses the button. Running that live would reintroduce
// the exact whole-deck-per-keystroke cost this machinery exists to remove.

/** Which route the pipeline took for the slide currently on screen. */
export type FidelityPath = 'slice' | 'whole-deck';

export type FidelityComparison =
	| { equal: true }
	| { equal: false; cause: string; at: number; got: string; want: string }
	/** The comparison could not be run (no deck context, engine error) — never a silent pass. */
	| { equal: null; why: string };

export type FidelityReport = {
	path: FidelityPath;
	/** Names of the DECK_DERIVED_FACTS that forced the whole-deck render. Empty on the slice path. */
	facts: string[];
	/** The deck position handed to the engine, when one was trusted enough to supply. */
	page?: { offset: number; total?: number; deckSection?: { index: number; total: number } };
	/** Present but untrusted position — the render fell back to an honest "1 of 1". */
	positionWithheld?: boolean;
	at: number;
	/**
	 * Render the shown slide BOTH ways and diff. On-demand only — see the two-tier note above.
	 * Absent when this host has no deck to compare against (a standalone specimen island).
	 */
	compare?: () => Promise<FidelityComparison>;
};

type Listener = (r: FidelityReport) => void;
const listeners = new Set<Listener>();
let last: FidelityReport | null = null;

/** Record one slide's fidelity report and fan out to the overlay. Cheap no-op when off. */
export function recordFidelity(report: FidelityReport): FidelityReport {
	last = report;
	for (const fn of listeners) {
		try {
			fn(report);
		} catch {}
	}
	return report;
}

/** Latest report, or null before the first render. */
export function latestFidelity(): FidelityReport | null {
	return last;
}

/** Subscribe to reports. Returns an unsubscribe fn. */
export function onFidelity(fn: Listener): () => void {
	listeners.add(fn);
	return () => {
		listeners.delete(fn);
	};
}

/** True when the overlay is subscribed — the render path reports ONLY then (off = free). */
export function hasFidelityListeners(): boolean {
	return listeners.size > 0;
}
