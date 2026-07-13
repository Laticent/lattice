// Lente — the shared type surface. Framework-free, zero-dependency, no DOM: the whole library is a
// pure function from (slides, registry, lensId) to an ordered slide subset. See the design ADR:
// engineering/decisions/2026-07-13-lente-reader-lenses.md

/** How a lens decides membership. `none` = additive (a slide opts IN via a tag); `all` = subtractive
 *  (every slide is a member unless it opts OUT with `-id`). `full` is neither — it is the identity. */
export type LensBase = 'none' | 'all';

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
	/** Picker position; default = registry order. */
	order?: number;
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
	/** Stable machine code (e.g. 'orphan-tag', 'default-empty', 'tag-contradiction'). */
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
