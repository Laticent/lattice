import { type Diagnostic, type LensBase, type LensRegistry } from './types';
/** Every `_lens` token (include or `-`exclude) in the deck that names NO registered lens — a typo like
 *  `_lens: brif`, surfaced as an error instead of silently granting membership to a phantom lens
 *  (mirrors the codebase's `unknownComponents` guard for `_class`). Skips fenced code blocks so a
 *  DOCUMENTED example token isn't reported as a typo. */
export declare function unknownLensTokens(src: string, reg: LensRegistry): string[];
/** Deck-wide lens health for the review panel: an unavailable default, per-slide `+x`/`-x`
 *  contradictions, and orphan tags. Pure; never throws. */
export declare function validateRegistry(slides: string[], reg: LensRegistry): Diagnostic[];
/** Re-express a lens's membership when its `base` flips (none<->all): recompute the current member set
 *  under the OLD base, then write the equivalent tokens under the NEW base, so no membership silently
 *  inverts. Pure — returns a new slides array. The caller routes the result through the approve/diff
 *  flow. */
export declare function rebaseLensTags(slides: string[], reg: LensRegistry, lensId: string, from: LensBase, to: LensBase): string[];
