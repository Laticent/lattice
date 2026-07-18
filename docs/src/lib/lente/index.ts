// Lente — the public surface. Framework-free, zero-dependency, no DOM: give it deck slides + a lens
// registry, get back the ordered slide subset a reader chose — but ONLY a subset a human approved.
// The read path (project) is a different module from the suggester (suggest) and cannot import it, so
// no machine proposal can reach a reader unvetted. See the design ADR:
// engineering/decisions/2026-07-13-lente-reader-lenses.md
//
// (lente, Italian: lens — matching vetrina "shop window", cadenza, suono.)


export type { LensView } from './builder';
// Fluent READ-PATH front door — sugar over ./project (collect (slides, registry, lensId) once, pick
// a terminal). Read-only by construction: no `.approve()`/`.suggest()`, never imports the suggester.
export { lens } from './builder';
// Content-hash primitive (exposed for host-side approval flows + tests).
export { sha256Hex } from './hash';
// Read path — pure, deterministic, never reaches the suggester.
export { approvalHash, lensEligibility, lensIndices, lensPairs, lensSlides, readerLenses } from './project';
// Registry — parse / emit / upsert the front-matter `lenses:` block (Lente is its sole writer).
export { emitRegistry, emitRegistryDelta, isPristineInherited, parseLensRegistry, upsertLensRegistry } from './registry';
// Suggest path — a SEPARATE module; pure, no AI, proposes membership, writes nothing.
export { catalogFromComponents, suggestMembership } from './suggest';
// Tags — the per-slide membership carrier.
export { applyTag, parseSlideTags, taggedLensIds } from './tags';
export type {
	ComponentCatalog,
	ComponentInfo,
	Diagnostic,
	DiagnosticLevel,
	LensBase,
	LensDef,
	LensProjection,
	LensRegistry,
	LensSlide,
	SlideTags,
	Suggestion,
	WorkspaceLensConfig,
} from './types';
export { FULL_LENS_ID } from './types';
// Validators + the base-flip rewriter.
export { rebaseLensTags, unknownLensTokens, validateRegistry } from './validate';
