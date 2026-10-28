/** The shape class of a box, from its aspect ratio (width over height). */
export type Family = 'wide' | 'square' | 'tall' | 'strip';

/**
 * What the host knows about one slide, read from its rendered markup. Fluido never reads the
 * markup itself: a connector (Lattice's is lib/core/auto-split.js) reads these facts and asks.
 */
export interface SlideFacts {
	/** The author opted the slide out: a specimen that exists to show overflow, or `fit: report`. */
	optOut?: 'specimen' | 'report' | null;
	/** The slide is built on a component that declares a seam (a capacity axis or a recipe). */
	enrolled: boolean;
	/**
	 * The component's own page recipe, when it has one. `shapeReader` says what the recipe's
	 * refusal means: true, "this is not my shape", so the derived seam may be asked instead;
	 * false, a veto, so the slide stays whole.
	 */
	recipe?: { strategy: string; shapeReader: boolean; axis?: string | null } | null;
	/** The recipe was tried and declined this slide. */
	recipeDeclined?: boolean;
	/** The slide is a page an earlier cut emitted; it may divide further but never grows a cover. */
	reSplit?: boolean;
	/**
	 * The seam to divide on, already known to be one Fluido may cut (`null` when there is none).
	 * Leave it out and pass a `readSeam` to `planSlide` instead, so the host only reads it when
	 * the decision needs it.
	 */
	seam?: string | null;
	/** How many members lie along that seam. */
	members?: number;
}

/** A host's reading of a slide's seam, taken only when the decision gets that far. */
export interface SeamReading {
	seam: string | null;
	members: number;
}

/** Why a slide stays one page. */
export type WholeReason = 'opt-out' | 'not-enrolled' | 'recipe-veto' | 'no-seam' | 'one-member';

/**
 * What to do with one slide. The host builds the pages; Fluido only decides.
 * - `whole`: leave it as one page.
 * - `recipe`: run the component's recipe; if it declines and `recipe.shapeReader`, ask again
 *   with `recipeDeclined: true`.
 * - `paginate`: cut along `seam`, `perPage` members to a page. `envelope` is true for a first cut,
 *   which may open on a cover (when the slide has a heading) and may close on a closing page (when
 *   it has a note or an insight), and false for a re-split, which is a bare partition.
 * Whatever the move, the host checks the run it builds with `fitsCap`.
 */
export type Move =
	| { kind: 'whole'; reason: WholeReason }
	| { kind: 'recipe'; strategy: string }
	| { kind: 'paginate'; seam: string; perPage: number; envelope: boolean };

/** A half-open range of an over-budget member's units (lines, rows, items) that rides one page. */
export interface Run {
	from: number;
	to: number;
}
