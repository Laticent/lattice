// Lente — the shared type surface. Framework-free, zero-dependency, no DOM: the whole library is a
// pure function from (slides, registry, lensId) to an ordered slide subset. See the design ADR:
// engineering/decisions/2026-07-13-lente-reader-lenses.md

/** How a lens decides membership. `none` = additive (a slide opts IN via a tag); `all` = subtractive
 *  (every slide is a member unless it opts OUT with `-id`). `full` is neither — it is the identity. */
export type LensBase = 'none' | 'all';

/** What KIND of view this is — the depth model (2026-08-25-lens-view-defaults-and-depth.md §4).
 *
 *  `rung` — an altitude in the deck's ONE ladder. Every rung's projection CONTAINS the projection of
 *  the rung below it, which is what makes "go deeper" honest: an escalation is guaranteed additive, so
 *  a reader never loses a slide they just read. Only rungs are offered a deeper step (`deeperLens`).
 *
 *  `cut` — an arbitrary subset: the ask, a narrative slice, a redaction. No order, no containment, no
 *  escalation. You land on a cut or you are handed one; there is no altitude above "the ask".
 *
 *  **Absent means `cut`, deliberately.** A view that never declared itself a rung promises nothing, so
 *  no deck written before this field existed starts failing the containment validator, and a
 *  hand-written custom view is never silently enrolled in a ladder it was not designed for. `full` is
 *  ALWAYS the top rung — it contains every view by construction — whatever its record says. Read the
 *  effective value through `lensKind`, never off the field. */
export type LensKind = 'rung' | 'cut';

export interface LensDef {
	/** Stable machine id — referenced by every `_lens` tag. NEVER renamed in place (orphans tags). */
	id: string;
	/** Reader-facing name. Relabel freely; the id stays fixed. */
	label: string;
	base: LensBase;
	/** Render only the first member in author order (the `ask`). */
	single?: boolean;
	/** Defined + suggestible but kept out of the reader's picker (author staging). */
	hidden?: boolean;
	/** Picker position; default = registry order. NOT the ladder order — altitude is derived from
	 *  containment (`ladderRungs`), so re-numbering the picker never re-orders the depth chain. */
	order?: number;
	/** Rung (an altitude in the containment-checked ladder) or cut (a standalone subset). Absent = cut;
	 *  `full` is always a rung. See `LensKind` and `ladderRungs`. */
	kind?: LensKind;
	/** Reader-eligibility marker: a CONTENT HASH ("sha256:…") written on human Approve. Absent (or
	 *  mismatched at read) => a non-`full` lens is never projected to a reader. See ./hash. */
	approved?: string;
}

export interface LensRegistry {
	/** All lenses, including the implicit `full` at index 0. */
	lenses: LensDef[];
	/** The lens id a reader / a pinned share-link opens in. */
	default: string;
}

/** A shown slide PAIRED with its original author position — the contract that keeps the number-keyed
 *  front-matter `captions:` map resolving under any filtering lens (mirrors lint.ts presentationPairs). */
export interface LensSlide {
	slide: string;
	/** ORIGINAL author 0-based deck index (survives the lens filter). */
	index: number;
}

/** The lens tokens parsed off one slide's `<!-- _lens: … -->` comment. */
export interface SlideTags {
	include: Set<string>;
	exclude: Set<string>;
}

/** One component's classification, injected from the host catalog so the core stays repo-agnostic. */
export interface ComponentInfo {
	bucket: string;
	function: string;
	form: string;
}
export type ComponentCatalog = ReadonlyMap<string, ComponentInfo>;

/** A single membership PROPOSAL from the suggester. Writes nothing — the author approves. */
export interface Suggestion {
	/** Author 0-based slide index. */
	index: number;
	lensId: string;
	/** true = suggest this slide IS a member; false = suggest it is NOT (a `-id` on a base:all lens). */
	member: boolean;
	/** One-line, human-readable rationale for the review grid ("kpi → headline metric → Brief"). */
	reason: string;
}

export type DiagnosticLevel = 'error' | 'warning';
export interface Diagnostic {
	level: DiagnosticLevel;
	/** Stable machine code (e.g. 'orphan-tag', 'default-empty', 'tag-contradiction',
	 *  'ladder-containment'). */
	code: string;
	message: string;
	/** Author slide index, when the finding is slide-scoped. */
	slide?: number;
	lensId?: string;
}

/** The outcome of projecting a lens for a READER. Fail CLOSED: an ineligible lens the reader chose
 *  yields `unavailable`, never a silent full-deck substitution (a scoping lens can be a redaction). */
export type LensProjection =
	| { status: 'ok'; pairs: LensSlide[] }
	| { status: 'unavailable'; reason: 'unknown' | 'unapproved' | 'drifted' | 'empty' | 'hidden' };

/** Workspace-supplied lens DEFINITIONS (no membership, no approval — those are always per-deck). */
export interface WorkspaceLensConfig {
	lenses: LensDef[];
	default?: string;
}

/** The implicit, un-removable, always-eligible identity lens. */
export const FULL_LENS_ID = 'full';
