// Lente — the fluent READ-PATH front door. A thin recording builder: `.registry()` / `.pick()`
// each set a field and return `this`; a terminal (`.project()`, `.slides()`, …) runs the matching
// pure function from ./project. It collects the `(slides, registry, lensId)` triple once so callers
// stop threading it through every call — nothing more.
//
// READ-PATH ONLY, by construction. This module imports ./project + ./registry + ./types and NEVER
// ./suggest, so no machine proposal can reach a reader through the builder; and there is deliberately
// NO `.approve()` / `.suggest()` verb — the human-Approve gate (a person in the Studio stamping the
// content hash) is the only bridge from a proposal to a reader, and the builder does not cross it.
// It is sugar over the same fail-CLOSED primitives: an unapproved / drifted lens still yields
// `unavailable`, never a silent full-deck substitution. See the design ADR:
// engineering/decisions/2026-07-13-lente-reader-lenses.md

import { approvalHash, lensEligibility, lensIndices, lensPairs, lensSlides, readerLenses } from './project';
import { parseLensRegistry } from './registry';
import { FULL_LENS_ID, type LensDef, type LensProjection, type LensRegistry, type LensSlide } from './types';

export interface LensView {
	/** Set the registry — either a parsed `LensRegistry` or the raw front-matter `lenses:` text
	 *  (parsed with `parseLensRegistry`). Default: the implicit full-only registry. */
	registry(reg: LensRegistry | string): this;
	/** Set the lens id to project. Default: `full` (the whole deck, the safe default). */
	pick(lensId: string): this;

	// ── terminals — each is exactly the matching ./project call over the collected triple ──
	/** Reader projection, fail-CLOSED: `{status:'ok',pairs}` or `{status:'unavailable',reason}`.
	 *  === `lensEligibility(slides, registry, lensId)`. */
	project(): LensProjection;
	/** The shown slides in author order (author-preview; does NOT enforce approval).
	 *  === `lensSlides(slides, registry, lensId)`. */
	slides(): string[];
	/** Each shown slide paired with its ORIGINAL author index. === `lensPairs(…)`. */
	pairs(): LensSlide[];
	/** The original author indices of the shown slides. === `lensIndices(…)`. */
	indices(): number[];
	/** The lenses a reader may actually pick (full + every eligible lens). Ignores `.pick()`.
	 *  === `readerLenses(slides, registry)`. */
	pickable(): LensDef[];
	/** The content hash bound at Approve for the current triple. === `approvalHash(…)`. */
	hash(): string;
}

/** Open a fluent read-path view over `slides`. Chain `.registry(…).pick(id)` then a terminal —
 *  e.g. `lens(slides).registry(frontMatter).pick('brief').project()`. Every terminal is the plain
 *  `./project` function applied to the collected triple, so the builder is provably a pass-through
 *  (guarded by builder.test.ts's parity assertions) and adds no new behavior or boundary crossing. */
export function lens(slides: string[]): LensView {
	let reg: LensRegistry = parseLensRegistry(''); // canonical full-only registry
	let lensId: string = FULL_LENS_ID;

	const b: LensView = {
		registry(r) {
			reg = typeof r === 'string' ? parseLensRegistry(r) : r;
			return b;
		},
		pick(id) {
			lensId = id;
			return b;
		},
		project() {
			return lensEligibility(slides, reg, lensId);
		},
		slides() {
			return lensSlides(slides, reg, lensId);
		},
		pairs() {
			return lensPairs(slides, reg, lensId);
		},
		indices() {
			return lensIndices(slides, reg, lensId);
		},
		pickable() {
			return readerLenses(slides, reg);
		},
		hash() {
			return approvalHash(slides, reg, lensId);
		},
	};
	return b;
}
